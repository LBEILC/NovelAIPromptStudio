import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createCommands } from './index.js';
import { openDatabase } from '../database.js';
import { openPreferences } from '../preferences.js';
import { readWorkbenchImage } from '../workbench.js';
import { startFakeNovelAI } from '../fixtures/novelAIService.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';

it('keeps base images and image operation versions durable through command flows', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-params-'));
  const database = await openDatabase(directory),
    service = await startFakeNovelAI();
  const file = path.join(directory, 'synthetic.png');
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#335577' } })
    .png()
    .toFile(file);
  const metadata = {
    model: 'nai-diffusion-5-full',
    width: 832,
    height: 1216,
    prompt_raw: 'synthetic shape',
    negative_prompt: 'synthetic defect',
    extra_json: '{}',
  };
  const project = {
    id: 'synthetic',
    image_path: file,
    thumbnail_path: file,
    name: 'Synthetic',
    tags: [],
    metadata,
    prompt_structure: createPromptStructure(metadata),
  };
  const preferences = openPreferences(directory, {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  });
  const events = [],
    finishes = new Map();
  let onFinished;
  let imported = 0;
  const commands = await createCommands({
    directory,
    database,
    preferences,
    generationBaseUrl: service.url,
    version: 'test',
    busy: () => false,
    readImage: async () => project,
    readSource: async () => project,
    importImage: async (source) => {
      const copy = path.join(directory, `saved-${imported}.png`);
      await fs.copyFile(source, copy);
      const image = await readWorkbenchImage(copy);
      image.id = `generated-${++imported}`;
      database.insertProject(image);
      return image;
    },
    emit: (event) => {
      events.push(event);
      if (event.type === 'generation')
        for (const job of event.data.jobs)
          if (['completed', 'failed'].includes(job.state)) {
            finishes.set(job.id, job);
            onFinished?.();
          }
    },
  });
  const call = async (name, input = {}, source = 'agent') => {
    const result = await commands.dispatch(name, input, source);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data;
  };
  const waitJob = async (id) => {
    if (!finishes.has(id))
      await new Promise((resolve) => {
        onFinished = () => {
          if (finishes.has(id)) resolve();
        };
      });
    return finishes.get(id);
  };
  try {
    const opened = await call('workbench.open', { path: file }),
      tabId = opened.tab.id;
    await call('reference.set-base', { tabId, path: file, strength: 0.4, noise: 0.1 });
    const base = (await call('reference.set-base', { tabId, path: file })).tab.project.references
      .base;
    expect(base).toMatchObject({ strength: 0.4, noise: 0.1 });
    expect(base.path).not.toBe(file);
    await expect(call('reference.set-base', { tabId, strength: 1 })).rejects.toThrow(
      '底图参数无效',
    );
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    const job = await call('generate.start', { tabId, count: 1, fixedSeed: true, seed: 0 }, 'ui');
    const completed = await waitJob(job.id);
    expect(completed.state).toBe('completed');
    expect(service.state.requests.at(-1)).toMatchObject({
      action: 'img2img',
      parameters: { seed: 1, extra_noise_seed: 0, strength: 0.4, noise: 0.1 },
    });
    const version = (await call('version.list', { tabId })).versions.find(
      (v) => v.id === completed.versionId,
    );
    expect(version.operation).toMatchObject({ kind: 'img2img', strength: 0.4, noise: 0.1 });
    expect(version.project.references.base.path).toBe(base.path);
    expect((await call('workbench.get', { tabId })).tab.project.references.base).toBeTruthy();
    await call('reference.remove', { tabId, id: 'base' });
    expect((await call('workbench.get', { tabId })).tab.project.references.base).toBeNull();
    await call('params.set', { tabId, patch: { steps: 31 } });
    const sourceId = completed.images[0];
    for (const name of ['generate.upscale', 'generate.enhance', 'generate.estimate-op']) {
      const r = await commands.dispatch(
        name,
        {
          tabId,
          imageId: sourceId,
          ...(name === 'generate.enhance'
            ? { magnitude: 2, scale: 'max' }
            : name === 'generate.estimate-op'
              ? { op: 'upscale' }
              : {}),
        },
        'agent',
      );
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe('forbidden');
    }
    const estimate = await call(
      'generate.estimate-op',
      { tabId, imageId: sourceId, op: 'upscale' },
      'ui',
    );
    expect(estimate).toMatchObject({ width: 1664, height: 2432, anlas: 1 });
    const up = await waitJob(
      (await call('generate.upscale', { tabId, imageId: sourceId }, 'ui')).id,
    );
    expect(up.state).toBe('completed');
    const upVersion = database.versions.get(up.versionId);
    expect(upVersion.parentId).toBe(version.id);
    expect(upVersion.operation).toEqual({ kind: 'upscale', sourceProjectId: sourceId });
    const upImage = database.loadProject(up.images[0]);
    expect(upImage.metadata).toMatchObject({ width: 1664, height: 2432 });
    expect(
      (await database.loadLibraryCards()).find((card) => card.id === upImage.id).metadata,
    ).toMatchObject({ width: 1664, height: 2432 });
    expect(upImage.metadata.extra_json).toBe(database.loadProject(sourceId).metadata.extra_json);
    const maxPrice = await call(
      'generate.estimate-op',
      { tabId, imageId: sourceId, op: 'enhance', magnitude: 2, scale: 'max' },
      'ui',
    );
    expect(maxPrice).toMatchObject({ width: 1467, height: 2144, scales: [1, 1.5, 'max'] });
    const enhanced = await waitJob(
      (
        await call(
          'generate.enhance',
          { tabId, imageId: sourceId, magnitude: 2, scale: 'max' },
          'ui',
        )
      ).id,
    );
    expect(enhanced.state).toBe('completed');
    const enhancedVersion = database.versions.get(enhanced.versionId);
    expect(enhancedVersion.parentId).toBe(version.id);
    expect(enhancedVersion.operation).toEqual({
      kind: 'enhance',
      sourceProjectId: sourceId,
      strength: 0.4,
      noise: 0,
      magnitude: 2,
      scale: 'max',
    });
    expect(enhancedVersion.project.params.steps).toBe(version.project.params.steps);
    expect(enhancedVersion.project.metadata.seed).toBe(
      String(service.state.requests.at(-1).parameters.seed),
    );
    expect(database.loadProject(enhanced.images[0]).metadata).toMatchObject({
      width: 1467,
      height: 2144,
    });
    const deletion = await call('version.delete', { versionId: enhanced.versionId, only: true });
    await call('branch.restore', { undo: deletion.undo });
    expect(database.versions.get(enhanced.versionId).operation).toEqual(enhancedVersion.operation);
    await call('account.relay.save', { baseUrl: service.url, key: 'acceptance-token' }, 'ui');
    await call('account.connection.save', { connection: 'relay' }, 'ui');
    const blocked = await call(
      'generate.estimate-op',
      { tabId, imageId: sourceId, op: 'upscale' },
      'ui',
    );
    expect(blocked).toMatchObject({ relay: true, unavailable: '中转站没有放大用的模型' });
  } finally {
    await commands.close();
    database.close();
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
