import { it, expect } from 'vitest';
import '../fixtures/databaseTestBudget.js';
import { deleteLibraryImages } from '../deleteLibraryImages.js';
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
    assetsDirectory: () => directory,
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
    expect(upVersion.operation).toMatchObject({ kind: 'upscale', sourceProjectId: sourceId });
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
    // 草稿和源版本不一样时（增强用源版本的提示词）：完成后舞台照样换成新图，草稿的改动保留
    await call('prompt.set', { tabId, scope: 'base:prompt', text: 'synthetic shape, edited' });
    const enhanced = await waitJob(
      (
        await call(
          'generate.enhance',
          { tabId, imageId: sourceId, magnitude: 2, scale: 'max' },
          'ui',
        )
      ).id,
    );
    expect(enhanced.error || enhanced.state).toBe('completed');
    const enhancedVersion = database.versions.get(enhanced.versionId);
    expect(enhancedVersion.parentId).toBe(version.id);
    expect(enhancedVersion.operation).toMatchObject({
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
    const afterEnhance = (await call('workbench.get', { tabId })).tab;
    expect(afterEnhance.versionId).toBe(enhanced.versionId);
    expect(afterEnhance.versionImageId).toBe(enhanced.images[0]);
    expect(afterEnhance.project.image_path).toBe(
      database.loadProject(enhanced.images[0]).image_path,
    );
    // 增强出来的图更大，但草稿的生成尺寸不跟着变（只有扩图改草稿尺寸）
    expect(afterEnhance.project.metadata).toMatchObject({ width: 832, height: 1216 });
    expect(afterEnhance.project.metadata.prompt_raw).toContain('edited');
    const deletion = await call('version.delete', { versionId: enhanced.versionId, only: true });
    await call('branch.restore', { undo: deletion.undo });
    expect(database.versions.get(enhanced.versionId).operation).toEqual(enhancedVersion.operation);
    const rect = { x: 128, y: 128, width: 512, height: 512 };
    const mask = (
      await sharp(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect x="192" y="192" width="128" height="128" fill="white"/></svg>',
        ),
      )
        .png()
        .toBuffer()
    ).toString('base64');
    const inpaintInput = { tabId, imageId: sourceId, rect, strength: 0.4 };
    await call('params.set', { tabId, patch: { steps: 31 } });
    await call('reference.set-base', { tabId, path: file });
    const estimateInpaint = await call('generate.estimate-inpaint', inpaintInput, 'ui');
    expect(estimateInpaint).toMatchObject({
      width: 1024,
      height: 1024,
      scale: 2,
      model: 'nai-diffusion-5-full-inpainting',
      ignored: ['base'],
      free: false,
    });
    expect(
      await call(
        'generate.estimate-inpaint',
        {
          ...inpaintInput,
          imageId: up.images[0],
          rect: { x: 0, y: 0, width: 1536, height: 2304 },
          fullSize: true,
        },
        'ui',
      ),
    ).toMatchObject({ unavailable: '重绘尺寸超过上限' });
    const outside = await commands.dispatch(
      'generate.estimate-inpaint',
      { ...inpaintInput, rect: { ...rect, x: 1000 } },
      'ui',
    );
    expect(outside.error.code).toBe('invalid_input');
    const empty = (
      await sharp({
        create: {
          width: 512,
          height: 512,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer()
    ).toString('base64');
    await expect(call('generate.inpaint', { ...inpaintInput, mask: empty }, 'ui')).rejects.toThrow(
      '先涂上',
    );
    const draftBefore = (await call('workbench.get', { tabId })).tab.project;
    const inpainted = await waitJob(
      (await call('generate.inpaint', { ...inpaintInput, mask }, 'ui')).id,
    );
    expect(inpainted.state).toBe('completed');
    const afterInpaint = (await call('workbench.get', { tabId })).tab;
    expect(afterInpaint.versionImageId).toBe(inpainted.images[0]);
    expect(afterInpaint.project.image_path).toBe(
      database.loadProject(inpainted.images[0]).image_path,
    );
    expect(afterInpaint.project.metadata.prompt_raw).toBe(draftBefore.metadata.prompt_raw);
    const usage = database.usage.list();
    expect(usage.map((record) => record.operation)).toEqual([
      'img2img',
      'upscale',
      'enhance',
      'inpaint',
    ]);
    expect(
      usage.every((record) => record.images === 1 && !record.estimated && record.versionId),
    ).toBe(true);
    expect(usage.at(-1)).toMatchObject({
      width: 1024,
      height: 1024,
      model: 'nai-diffusion-5-full-inpainting',
    });
    const summary = await call('usage.summary', { range: 'today' });
    expect(summary.images).toBe(4);
    expect((await call('generate.status')).settings.spentToday).toBe(summary.anlas);
    const paintedVersion = database.versions.get(inpainted.versionId);
    expect(paintedVersion.parentId).toBe(version.id);
    expect(paintedVersion.project.params).toEqual(version.project.params);
    expect(paintedVersion.project.metadata).toEqual(version.project.metadata);
    expect(paintedVersion.operation).toMatchObject({
      kind: 'inpaint',
      sourceProjectId: sourceId,
      rect,
      strength: 0.4,
      fullSize: false,
      generated: { width: 1024, height: 1024, model: 'nai-diffusion-5-full-inpainting' },
      prompt: {
        metadata: draftBefore.metadata,
        params: draftBefore.params,
        prompt_structure: draftBefore.prompt_structure,
      },
    });
    expect(service.state.requests.at(-1)).toMatchObject({
      action: 'infill',
      parameters: { steps: 31, img2img: { strength: 0.4, color_correct: true } },
    });
    const maskFile = path.join(
      directory,
      'inpaint-masks',
      `${paintedVersion.operation.maskId}.png`,
    );
    expect(await fs.readFile(maskFile)).toEqual(Buffer.from(mask, 'base64'));
    const sourcePixels = await sharp(database.loadProject(sourceId).image_path)
      .ensureAlpha()
      .raw()
      .toBuffer();
    const painted = database.loadProject(inpainted.images[0]);
    expect(painted.metadata).toMatchObject({ width: 832, height: 1216 });
    expect(painted.metadata.extra_json).toBe(database.loadProject(sourceId).metadata.extra_json);
    const resultPixels = await sharp(painted.image_path).ensureAlpha().raw().toBuffer();
    expect(resultPixels.subarray(0, 832 * 128 * 4)).toEqual(
      sourcePixels.subarray(0, 832 * 128 * 4),
    );
    expect(resultPixels.equals(sourcePixels)).toBe(false);
    const paintDeletion = await call('version.delete', {
      versionId: inpainted.versionId,
      only: true,
    });
    await call('branch.restore', { undo: paintDeletion.undo });
    expect(database.versions.get(inpainted.versionId).operation).toEqual(paintedVersion.operation);
    await call('version.delete', { versionId: inpainted.versionId, only: true });
    const purged = deleteLibraryImages(database, directory, inpainted.images);
    expect(purged.results.success).toEqual(inpainted.images);
    await expect(fs.stat(maskFile)).rejects.toMatchObject({ code: 'ENOENT' });
    await call('account.relay.save', { baseUrl: service.url, key: 'acceptance-token' }, 'ui');
    await call('account.connection.save', { connection: 'relay' }, 'ui');
    const blocked = await call(
      'generate.estimate-op',
      { tabId, imageId: sourceId, op: 'upscale' },
      'ui',
    );
    expect(blocked).toMatchObject({ relay: true, unavailable: '中转站没有放大用的模型' });
    expect(await call('generate.estimate-inpaint', inpaintInput, 'ui')).toMatchObject({
      relay: true,
      model: 'nai-diffusion-5-full-inpainting',
    });
    await call('params.set', { tabId, patch: { model: 'nai-diffusion-5-curated' } });
    expect(await call('generate.estimate-inpaint', inpaintInput, 'ui')).toMatchObject({
      relay: true,
      unavailable: '中转站没有局部重绘用的模型',
    });
  } finally {
    await commands.close();
    database.close();
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
