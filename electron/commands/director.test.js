import '../fixtures/databaseTestBudget.js';
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

it('runs director commands with source snapshots, variants, billing, permissions and partial results', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-director-'));
  const database = await openDatabase(directory),
    service = await startFakeNovelAI();
  service.state.tier = 0;
  const file = path.join(directory, 'synthetic.png');
  await sharp({ create: { width: 500, height: 700, channels: 4, background: '#33557780' } })
    .png()
    .toFile(file);
  const metadata = {
    model: 'nai-diffusion-5-full',
    width: 832,
    height: 1216,
    seed: '123',
    prompt_raw: 'synthetic source',
    negative_prompt: '',
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
  database.insertProject(project);
  const preferences = openPreferences(directory, {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  });
  const finishes = new Map(),
    waiters = new Map();
  let imported = 0;
  const commands = await createCommands({
    directory,
    database,
    preferences,
    assetsDirectory: () => directory,
    generationBaseUrl: service.url,
    version: 'test',
    busy: () => false,
    readImage: async () => project,
    readSource: async () => project,
    importImage: async (source) => {
      const copy = path.join(directory, `result-${++imported}.png`);
      await fs.copyFile(source, copy);
      const image = await readWorkbenchImage(copy);
      image.id = `result-${imported}`;
      database.insertProject(image);
      return image;
    },
    emit: (event) => {
      if (event.type !== 'generation') return;
      for (const job of event.data.jobs)
        if (['completed', 'failed'].includes(job.state)) {
          finishes.set(job.id, job);
          waiters.get(job.id)?.(job);
          waiters.delete(job.id);
        }
    },
  });
  const call = async (name, input = {}, source = 'agent') => {
    const result = await commands.dispatch(name, input, source);
    if (!result.ok) throw Error(JSON.stringify(result.error));
    return result.data;
  };
  const finish = (id) =>
    finishes.has(id)
      ? Promise.resolve(finishes.get(id))
      : new Promise((resolve) => waiters.set(id, resolve));
  try {
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    const { tab } = await call('workbench.open', { libraryId: project.id });
    const tabId = tab.id,
      input = { tabId, imageId: project.id, tool: 'bg-removal' };
    await call('version.list', { tabId });
    await call('prompt.set', { tabId, scope: 'base:prompt', text: 'synthetic draft' }, 'ui');
    await call('prompt.set-size', { tabId, width: 1024, height: 1024 }, 'ui');
    expect(await call('generate.estimate-director', input)).toMatchObject({
      anlas: 65,
      free: false,
      width: 865,
      height: 1211,
      count: 1,
      outputImages: 3,
    });
    const pending = await call('generate.director', input);
    expect(pending).toMatchObject({
      state: 'pending',
      count: 1,
      operation: 'director',
      operationDetails: {
        kind: 'director',
        tool: 'bg-removal',
        sent: { width: 865, height: 1211 },
      },
    });
    expect(service.state.requests).toHaveLength(0);
    expect(
      (await commands.dispatch('generate.confirm', { ids: [pending.id] }, 'agent')).error.code,
    ).toBe('forbidden');
    await call('generate.confirm', { ids: [pending.id] }, 'ui');
    const completed = await finish(pending.id);
    expect(completed.error || completed.state).toBe('completed');
    expect(completed.images).toHaveLength(3);
    expect(completed.completed).toBe(1);
    const versions = (await call('version.list', { tabId })).versions;
    expect(versions).toHaveLength(2);
    expect(versions[1].images.map((i) => i.variant)).toEqual(['masked', 'generated', 'blend']);
    expect(versions[1].project.metadata).toMatchObject({
      prompt_raw: 'synthetic source',
      width: 832,
      height: 1216,
      seed: '123',
    });
    expect(versions[1].operation.prompt).toBeUndefined();
    const after = (await call('workbench.get', { tabId })).tab;
    expect(after.versionId).toBe(versions[0].id);
    expect(after.project.metadata).toMatchObject({
      prompt_raw: 'synthetic draft',
      width: 1024,
      height: 1024,
    });
    expect(await call('usage.summary')).toMatchObject({
      requests: 1,
      images: 3,
      anlas: 65,
      byOperation: { director: { requests: 1, images: 3, anlas: 65 } },
    });
    for (const options of [
      { tool: 'pixel-snap' },
      { tool: 'lineart', prompt: '' },
      { tool: 'sketch', defry: 0 },
      { tool: 'colorize', defry: 6 },
      { tool: 'colorize', defry: 0.5 },
      { tool: 'emotion', emotion: 'invalid' },
      { tool: 'emotion' },
      { tool: 'declutter', emotion: 'happy' },
    ]) {
      for (const name of ['generate.director', 'generate.estimate-director'])
        expect((await commands.dispatch(name, { ...input, ...options }, 'agent')).error.code).toBe(
          'invalid_input',
        );
    }
    expect(
      (await commands.dispatch('generate.director', { ...input, expectedRevision: 0 }, 'agent'))
        .error.code,
    ).toBe('conflict');
    await call('settings.generation.save', { agentMode: 'direct', limitEnabled: false }, 'ui');
    const direct = await call('generate.director', {
      ...input,
      tool: 'emotion',
      emotion: 'happy',
      prompt: '',
      defry: 0,
    });
    expect(direct.state).not.toBe('pending');
    expect((await finish(direct.id)).state).toBe('completed');
    expect(service.state.requests.at(-1)).toMatchObject({
      req_type: 'emotion',
      prompt: 'happy;;',
      defry: 0,
    });
    expect(direct.operationDetails).toMatchObject({ toolPrompt: '', emotion: 'happy', defry: 0 });
    expect(direct.operationDetails.prompt).toBeUndefined();
    await call('settings.generation.save', { limitEnabled: true, dailyLimit: 0 }, 'ui');
    const capped = await call('generate.director', input);
    expect(capped.state).toBe('pending');
    await call('generate.cancel', { ids: [capped.id] }, 'ui');
    service.state.directorImages = 2;
    const user = await call('generate.director', input, 'ui');
    expect(user.state).not.toBe('pending');
    const userResult = await finish(user.id);
    expect(userResult.state).toBe('completed');
    expect(userResult.images).toHaveLength(2);
    const current = (await call('workbench.get', { tabId })).tab;
    expect(current.versionId).toBe(userResult.versionId);
    expect(current.versionImageId).toBe(userResult.images[0]);
    expect(current.project.metadata).toMatchObject({
      prompt_raw: 'synthetic draft',
      width: 1024,
      height: 1024,
    });
    const partial = (await call('version.list', { tabId })).versions.find(
      (v) => v.id === userResult.versionId,
    );
    expect(partial.images.map((i) => i.variant)).toEqual(['masked', 'generated']);
    expect(database.usage.list().at(-1)).toMatchObject({
      images: 2,
      requestedImages: 3,
      anlas: 65,
      tool: 'bg-removal',
    });
    const reopened = await call('version.open', { tabId, versionId: partial.id });
    expect(reopened.tab.project.metadata).toMatchObject({
      prompt_raw: 'synthetic source',
      seed: '123',
      width: 832,
      height: 1216,
    });
    service.state.failNext = 500;
    const failed = await call('generate.director', { ...input, tool: 'lineart' }, 'ui');
    expect((await finish(failed.id)).state).toBe('failed');
    expect(service.state.requests).toHaveLength(4);
    await call(
      'account.relay.save',
      { baseUrl: service.url + '/v1', key: 'acceptance-token' },
      'ui',
    );
    await call('account.connection.save', { connection: 'relay' }, 'ui');
    for (const name of ['generate.director', 'generate.estimate-director'])
      expect((await commands.dispatch(name, input, 'agent')).error).toMatchObject({
        code: 'unsupported',
        message: '中转站不支持导演工具',
        details: { unavailable: '中转站不支持导演工具' },
      });
    expect(service.state.requests).toHaveLength(4);
  } finally {
    await commands.close();
    await service.close();
    await database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
