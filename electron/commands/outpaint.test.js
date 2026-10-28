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
import { createWorkbenchFixtures } from '../acceptance/workbenchFixtures.js';
import { estimateImageOperation } from '../imageOperations.js';
import { buildProjectRequest } from '../parameterRequest.js';
import { RELAY_PRESETS } from '../../src/shared/relayPresets.ts';
import { INPAINT_MODELS } from '../../src/shared/inpaint.ts';

async function setup(size = [512, 512]) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-outpaint-'));
  const database = await openDatabase(directory),
    service = await startFakeNovelAI();
  const [file] = await createWorkbenchFixtures(directory, {
    sizes: [size],
    prompts: ['synthetic original'],
  });
  const source = await readWorkbenchImage(file);
  database.insertProject(source);
  const preferences = openPreferences(directory, {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  });
  const finishes = new Map(),
    waiters = new Map(),
    events = [];
  const sent = [];
  let imported = 0;
  const commands = await createCommands({
    directory,
    assetsDirectory: () => directory,
    database,
    preferences,
    generationBaseUrl: service.url,
    fetcher: (url, options) => {
      if (options.body) sent.push(JSON.parse(options.body));
      const endpoint = new URL(url);
      return fetch(
        new URL(endpoint.pathname.replace(/^\/v1(?:\/novelai)?(?=\/ai\/)/, ''), service.url),
        options,
      );
    },
    version: 'test',
    busy: () => false,
    readImage: async () => source,
    readSource: async () => source,
    importImage: async (file) => {
      const copy = path.join(directory, `result-${++imported}.png`);
      await fs.copyFile(file, copy);
      const image = await readWorkbenchImage(copy);
      database.insertProject(image);
      return image;
    },
    emit: (event) => {
      events.push(event);
      if (event.type === 'generation')
        for (const job of event.data.jobs)
          if (['completed', 'failed', 'canceled'].includes(job.state)) {
            finishes.set(job.id, job);
            waiters.get(job.id)?.(job);
          }
    },
  });
  const call = async (name, input = {}, caller = 'ui') => {
    const response = await commands.dispatch(name, input, caller);
    if (!response.ok) throw Object.assign(new Error(response.error.message), response.error);
    return response.data;
  };
  const opened = await call('workbench.open', { libraryId: source.id });
  await call('account.save', { token: 'acceptance-token' });
  await call('params.set', {
    tabId: opened.tab.id,
    patch: { model: 'nai-diffusion-5-full', steps: 23 },
  });
  const input = {
    tabId: opened.tab.id,
    imageId: source.id,
    edges: { left: 64, right: 0, top: 64, bottom: 0 },
  };
  return {
    directory,
    database,
    preferences,
    service,
    commands,
    source,
    call,
    input,
    events,
    sent,
    wait: (id) =>
      finishes.has(id)
        ? Promise.resolve(finishes.get(id))
        : new Promise((resolve) => waiters.set(id, resolve)),
    close: async () => {
      service.state.resume?.();
      await commands.close();
      database.close();
      await service.close();
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

it.each([
  ['nai-diffusion-5-full', 'nai-diffusion-5-full'],
  ['nai-diffusion-5-curated', 'nai-diffusion-4-5-curated'],
  ['nai-diffusion-4-5-curated', 'nai-diffusion-4-5-curated'],
  ['nai-diffusion-4-curated-preview', 'nai-diffusion-4-curated-preview'],
  ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-full'],
])('adapts TaleAPI inpaint and outpaint for %s only at transport', async (model, baseModel) => {
  const f = await setup();
  try {
    await f.call('params.set', { tabId: f.input.tabId, patch: { model } });
    const rect = { x: 0, y: 0, width: 512, height: 512 };
    const mask = (
      await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffff' } })
        .png()
        .toBuffer()
    ).toString('base64');
    const input = { tabId: f.input.tabId, imageId: f.source.id, rect, mask };
    for (const baseUrl of [
      RELAY_PRESETS[0].address,
      RELAY_PRESETS[1].address,
      'https://example.com',
    ]) {
      f.preferences.saveRelay({ baseUrl, key: 'acceptance-token', models: [baseModel] });
      f.preferences.saveConnection('relay');
      const allowed = baseUrl === RELAY_PRESETS[0].address;
      const estimate = await f.call('generate.estimate-inpaint', {
        tabId: input.tabId,
        imageId: input.imageId,
        rect,
      });
      const expanded = await f.call('generate.estimate-outpaint', f.input);
      if (!allowed) {
        expect(estimate.unavailable).toBe('中转站没有局部重绘用的模型');
        expect(expanded.whole.unavailable).toBe('中转站没有局部重绘用的模型');
        f.preferences.saveRelay({ baseUrl, models: [INPAINT_MODELS[model]] });
      } else {
        expect(estimate.unavailable).toBeFalsy();
        expect(expanded.whole.unavailable).toBeFalsy();
        expect(expanded.edges.unavailable).toBeFalsy();
        f.preferences.saveRelay({ baseUrl, models: [] });
        expect(
          (
            await f.call('generate.estimate-inpaint', {
              tabId: input.tabId,
              imageId: input.imageId,
              rect,
            })
          ).unavailable,
        ).toBe('中转站没有局部重绘用的模型');
        f.preferences.saveRelay({ baseUrl, models: [baseModel] });
      }
      for (const [name, args] of [
        ['generate.inpaint', input],
        ['generate.outpaint', { ...f.input, mode: 'whole' }],
        ['generate.outpaint', { ...f.input, mode: 'edges' }],
      ]) {
        const start = f.sent.length;
        const job = await f.wait((await f.call(name, args)).id);
        expect(job.error || job.state).toBe('completed');
        const requests = f.sent.slice(start).filter((r) => r.action === 'infill');
        expect(requests.length).toBeGreaterThan(0);
        expect(
          requests.every((r) => r.model === (allowed ? baseModel : INPAINT_MODELS[model])),
        ).toBe(true);
        expect(f.database.versions.get(job.versionId).operation.generated.model).toBe(
          INPAINT_MODELS[model],
        );
        const usage = f.database.usage.list().filter((record) => record.jobId === job.id);
        expect(usage).toHaveLength(requests.length);
        expect(usage.every((record) => record.model === INPAINT_MODELS[model])).toBe(true);
      }
    }
  } finally {
    await f.close();
  }
});

it('prices both modes with actual models, validates inputs and matches inpaint permissions', async () => {
  const f = await setup([1536, 1536]);
  try {
    const estimate = await f.call('generate.estimate-outpaint', f.input);
    expect(estimate).toMatchObject({
      canvas: { width: 1600, height: 1600 },
      whole: { free: true, model: 'nai-diffusion-5-full-inpainting' },
      edges: { free: true, count: 2 },
      recommended: 'edges',
    });
    expect(estimate.edges.blocks.map((b) => b.edge)).toEqual(['left', 'top']);
    expect(f.service.state.requests).toHaveLength(0);
    f.service.state.tier = 0;
    await f.call('account.refresh');
    const paid = await f.call('generate.estimate-outpaint', f.input);
    expect(paid.recommended).toBe('whole');
    for (const block of paid.edges.blocks)
      expect(block.anlas).toBe(
        estimateImageOperation(
          {
            action: 'infill',
            model: paid.edges.model,
            parameters: { width: block.width, height: block.height, steps: 23 },
          },
          null,
        ).anlas,
      );
    expect(paid.edges.anlas).toBe(paid.edges.blocks.reduce((n, b) => n + b.anlas, 0));
    const oversized = {
      ...f.input,
      edges: { left: 1024, right: 0, top: 0, bottom: 0 },
      fullSize: true,
    };
    expect((await f.call('generate.estimate-outpaint', oversized)).whole.unavailable).toContain(
      '2048',
    );
    await expect(
      f.call('generate.outpaint', { ...oversized, mode: 'whole' }),
    ).rejects.toMatchObject({ code: 'unavailable' });
    for (const name of [
      'generate.estimate-outpaint',
      'generate.outpaint',
      'generate.estimate-inpaint',
      'generate.inpaint',
    ])
      expect(await f.commands.dispatch(name, {}, 'agent')).toMatchObject({
        ok: false,
        error: { code: 'invalid_input' },
      });
    for (const edges of [
      { ...f.input.edges, left: -64 },
      { ...f.input.edges, top: 65 },
      { ...f.input.edges, left: 1600 },
    ])
      await expect(
        f.call('generate.estimate-outpaint', { ...f.input, edges }),
      ).rejects.toMatchObject({ code: 'invalid_input' });
    const missing = await f.call('generate.estimate-outpaint', { ...f.input, imageId: 'missing' });
    expect(missing.whole.unavailable).toBeTruthy();
    expect(missing.edges.unavailable).toBeTruthy();
    await f.call('account.relay.save', { baseUrl: f.service.url, key: 'acceptance-token' });
    await f.call('account.connection.save', { connection: 'relay' });
    await f.call('params.set', {
      tabId: f.input.tabId,
      patch: { model: 'nai-diffusion-5-curated' },
    });
    expect((await f.call('generate.estimate-outpaint', f.input)).edges.unavailable).toContain(
      '中转站',
    );
    await fs.rename(f.source.image_path, f.source.image_path + '.missing');
    expect((await f.call('generate.estimate-outpaint', f.input)).whole.unavailable).toBeTruthy();
  } finally {
    await f.close();
  }
});

it('counts relay limits per generated block without charging the saved version twice', async () => {
  const f = await setup();
  try {
    await f.call('account.relay.save', { baseUrl: f.service.url, key: 'acceptance-token' });
    await f.call('account.connection.save', { connection: 'relay' });
    await f.call('settings.generation.save', { limitEnabled: true, dailyImageLimit: 1 });
    await expect(f.call('generate.outpaint', { ...f.input, mode: 'edges' })).rejects.toThrow(
      '每日张数',
    );
    expect(f.service.state.requests).toHaveLength(0);
    await f.call('settings.generation.save', { dailyImageLimit: 2 });
    const result = await f.wait(
      (await f.call('generate.outpaint', { ...f.input, mode: 'edges' })).id,
    );
    expect(result.state).toBe('completed');
    expect((await f.call('account.get')).settings.spentImagesToday).toBe(2);
  } finally {
    await f.close();
  }
});

it.each(['whole', 'edges', 'partial', 'failed', 'cancel', 'cancel-before'])(
  'persists correct source snapshots and partial results for %s',
  async (scenario) => {
    const f = await setup();
    try {
      const parent = (await f.call('version.list', { tabId: f.input.tabId })).versions[0];
      const draft = f.commands.store.get();
      draft.tabs.find((t) => t.id === f.input.tabId).project.metadata.prompt_raw =
        'synthetic draft';
      draft.tabs.find((t) => t.id === f.input.tabId).project.prompt_structure.base_prompt_raw =
        'synthetic draft';
      await f.commands.store.save(draft);
      if (scenario === 'partial') {
        f.service.state.failAt = 2;
        Object.assign(f.input.edges, { right: 64, bottom: 64 });
      }
      if (scenario === 'failed') f.service.state.failAt = 1;
      if (scenario === 'cancel') f.service.state.holdAt = 1;
      const job = await f.call('generate.outpaint', {
        ...f.input,
        mode: scenario === 'whole' ? 'whole' : 'edges',
      });
      if (scenario === 'cancel') {
        await f.service.waitForHold();
        await f.call('generate.cancel', { ids: [job.id] });
        f.service.state.resume();
      }
      if (scenario === 'cancel-before') await f.call('generate.cancel', { ids: [job.id] });
      const final = await f.wait(job.id);
      const usage = f.database.usage.list();
      expect(usage).toHaveLength(f.service.state.requests.length);
      expect(
        usage.every(
          (row) => row.operation === 'outpaint' && row.model === 'nai-diffusion-5-full-inpainting',
        ),
      ).toBe(true);
      expect(usage.filter((row) => row.status === 'completed')).toHaveLength(
        scenario === 'failed' || scenario === 'cancel-before' ? 0 : scenario === 'edges' ? 2 : 1,
      );
      if (final.versionId)
        expect(usage.every((row) => row.versionId === final.versionId)).toBe(true);
      expect(final.state).toBe(
        scenario === 'failed' ? 'failed' : scenario.startsWith('cancel') ? 'canceled' : 'completed',
      );
      const versions = (await f.call('version.list', { tabId: f.input.tabId })).versions;
      if (scenario === 'failed' || scenario === 'cancel-before') {
        expect(final.images).toEqual([]);
        expect(versions).toHaveLength(1);
        return;
      }
      expect(versions).toHaveLength(2);
      const version = f.database.versions.get(final.versionId);
      expect(version.parentId).toBe(parent.id);
      expect(version.project.metadata).toEqual({
        ...parent.project.metadata,
        prompt_raw: 'synthetic draft',
        width: 576,
        height: ['partial', 'cancel'].includes(scenario) ? 512 : 576,
      });
      expect(version.operation).toMatchObject({
        kind: 'outpaint',
        edges: f.input.edges,
        generated: { model: 'nai-diffusion-5-full-inpainting' },
        prompt: { metadata: { prompt_raw: 'synthetic draft' } },
      });
      expect(f.service.state.requests[0].input).toContain('synthetic draft');
      const output = f.database.loadProject(final.images[0]);
      expect(output.metadata.prompt_raw).toBe('synthetic original');
      const dimensions = {
        width: 576,
        height: ['partial', 'cancel'].includes(scenario) ? 512 : 576,
      };
      expect(output.metadata).toMatchObject(dimensions);
      const current = (await f.call('workbench.get', { tabId: f.input.tabId })).tab;
      expect(current.versionImageId).toBe(output.id);
      expect(current.project.image_path).toBe(output.image_path);
      expect(current.project.metadata).toMatchObject({
        ...dimensions,
        prompt_raw: 'synthetic draft',
      });
      expect(current.originalProject.metadata).toMatchObject(dimensions);
      const reopened = await f.call('version.open', {
        tabId: f.input.tabId,
        versionId: final.versionId,
      });
      expect(reopened.tab.project.metadata).toMatchObject(dimensions);
      const request = await buildProjectRequest(version.project, f.database.vibeLibrary);
      expect(request.request.parameters).toMatchObject(dimensions);
      // The embedded source settings remain intact despite the larger bitmap.
      expect(JSON.parse(output.metadata.extra_json).parsed).toMatchObject({
        width: 512,
        height: 512,
      });
      expect(await sharp(output.image_path).metadata()).toMatchObject({
        width: 576,
        height: ['partial', 'cancel'].includes(scenario) ? 512 : 576,
      });
      if (['partial', 'cancel'].includes(scenario)) {
        const failed = scenario === 'partial' ? ['right', 'top', 'bottom'] : ['top'];
        expect(final.failedEdges).toEqual(failed);
        expect(final.failure).toBeTruthy();
        expect(version.operation.failedEdges).toEqual(failed);
        expect(version.operation.failure).toBe(final.failure);
      }
      if (scenario === 'edges') {
        expect(final.blockCount).toBe(2);
        expect(final.blockIndex).toBe(2);
        const stages = f.events
          .filter((e) => e.type === 'generation')
          .flatMap((e) => e.data.jobs)
          .filter((j) => j.id === job.id)
          .map((j) => j.blockIndex);
        expect(stages).toContain(1);
        expect(stages).toContain(2);
        const request = f.service.state.requests[1];
        const previous = await sharp(Buffer.from(request.parameters.image, 'base64'))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const offset = (Math.floor(previous.info.height * 0.8) * previous.info.width + 10) * 4;
        expect([...previous.data.subarray(offset, offset + 3)]).toEqual([238, 85, 51]);
      }
      expect(f.service.state.requests).toHaveLength(
        scenario === 'whole' || scenario === 'cancel' ? 1 : 2,
      );
    } finally {
      await f.close();
    }
  },
);

const operationInput = (f, kind) => ({
  tabId: f.input.tabId,
  imageId: f.input.imageId,
  ...(kind === 'enhance' ? { magnitude: 2, scale: 1 } : {}),
  ...(kind === 'outpaint' ? { edges: f.input.edges } : {}),
  ...(kind === 'inpaint'
    ? { shapes: [{ type: 'rect', x: 160, y: 160, width: 128, height: 128 }] }
    : {}),
});

for (const kind of ['upscale', 'enhance', 'outpaint', 'inpaint']) {
  it(`Agent ${kind} confirms, keeps the stage and selects the correct prompt source`, async () => {
    const f = await setup();
    try {
      await f.call('prompt.set', {
        tabId: f.input.tabId,
        scope: 'base:prompt',
        text: 'synthetic distinct draft',
      });
      const before = (await f.call('workbench.get', { tabId: f.input.tabId })).tab;
      const versions = (await f.call('version.list', { tabId: f.input.tabId })).versions;
      const input = operationInput(f, kind);
      const job = await f.call(`generate.${kind}`, input, 'agent');
      expect(job).toMatchObject({
        state: 'pending',
        source: 'agent',
        operation: kind,
        parentNumber: expect.any(Number),
        name: expect.any(String),
        estimate: expect.any(Number),
      });
      expect(job.operationDetails.prompt.metadata.prompt_raw).toBe(
        ['inpaint', 'outpaint'].includes(kind)
          ? 'synthetic distinct draft'
          : versions[0].project.metadata.prompt_raw,
      );
      expect(f.service.state.requests).toHaveLength(0);
      if (['inpaint', 'outpaint'].includes(kind)) {
        const meta = await sharp(job.previewPath).metadata();
        expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(512);
      }
      expect(
        await f.commands.dispatch('generate.confirm', { ids: [job.id] }, 'agent'),
      ).toMatchObject({ ok: false, error: { code: 'forbidden' } });
      await f.call('generate.confirm', { ids: [job.id] });
      const done = await f.wait(job.id);
      expect(done.state, done.error).toBe('completed');
      const after = (await f.call('workbench.get', { tabId: f.input.tabId })).tab;
      expect(after.versionImageId).toBe(before.versionImageId);
      expect(after.versionId).toBe(before.versionId);
      expect((await f.call('version.list', { tabId: f.input.tabId })).versions).toHaveLength(
        versions.length + 1,
      );
      expect(f.database.versions.get(done.versionId).source).toBe('agent');
      if (job.previewPath)
        await expect
          .poll(async () =>
            fs.access(job.previewPath).then(
              () => false,
              () => true,
            ),
          )
          .toBe(true);
    } finally {
      await f.close();
    }
  });

  it(`Agent ${kind} honors direct mode, spend limits, revisions and relay image limits`, async () => {
    const f = await setup();
    try {
      f.service.state.tier = 0;
      await f.call('account.refresh');
      await f.call('generate.pause');
      const input = operationInput(f, kind);
      await expect(
        f.call(`generate.${kind}`, { ...input, expectedRevision: 99999 }, 'agent'),
      ).rejects.toMatchObject({ code: 'conflict' });
      await f.call('settings.generation.save', { agentMode: 'direct', limitEnabled: false });
      const direct = await f.call(`generate.${kind}`, input, 'agent');
      expect(direct).toMatchObject({ state: 'queued', source: 'agent' });
      await f.call('generate.cancel', { ids: [direct.id] });
      if (direct.previewPath)
        await expect
          .poll(async () =>
            fs.access(direct.previewPath).then(
              () => false,
              () => true,
            ),
          )
          .toBe(true);
      await f.call('settings.generation.save', { limitEnabled: true, dailyLimit: 0 });
      const limited = await f.call(`generate.${kind}`, input, 'agent');
      expect(limited.state).toBe('pending');
      await f.call('generate.cancel', { ids: [limited.id] });
      const uiInput =
        kind === 'inpaint'
          ? {
              tabId: input.tabId,
              imageId: input.imageId,
              rect: { x: 0, y: 0, width: 512, height: 512 },
              mask: (
                await sharp({
                  create: { width: 512, height: 512, channels: 4, background: '#fff' },
                })
                  .png()
                  .toBuffer()
              ).toString('base64'),
            }
          : { ...input, ...(kind === 'outpaint' ? { mode: 'whole' } : {}) };
      const ui = await f.call(`generate.${kind}`, uiInput);
      expect(ui).toMatchObject({ state: 'queued', source: 'user' });
      await f.call('generate.cancel', { ids: [ui.id] });
      await f.call('account.relay.save', { baseUrl: f.service.url, key: 'acceptance-token' });
      await f.call('account.connection.save', { connection: 'relay' });
      f.preferences.saveRelay({ baseUrl: f.service.url, models: null });
      await f.call('settings.generation.save', { dailyImageLimit: 0 });
      await expect(f.call(`generate.${kind}`, input, 'agent')).rejects.toThrow('每日张数');
      await f.call('settings.generation.save', { dailyImageLimit: 10 });
      const relay = await f.call(`generate.${kind}`, input, 'agent');
      expect(relay).toMatchObject({ state: 'queued', source: 'agent' });
      await f.call('generate.cancel', { ids: [relay.id] });
      expect(f.service.state.requests).toHaveLength(0);
    } finally {
      await f.close();
    }
  });
}

it('syncs current inpaint state in memory, previews it and enforces Agent mask choices', async () => {
  const f = await setup();
  try {
    const tabId = f.input.tabId,
      imageId = f.input.imageId;
    expect(await f.call('inpaint.get', {}, 'agent')).toEqual({ active: false });
    await expect(
      f.call('generate.estimate-inpaint', { tabId, useCurrent: true }, 'agent'),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      await f.commands.dispatch('inpaint.sync', { tabId, closed: true }, 'agent'),
    ).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    const rect = { x: 0, y: 0, width: 512, height: 512 };
    const mask = (
      await sharp(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect x="100" y="120" width="128" height="128" fill="white"/></svg>',
        ),
      )
        .png()
        .toBuffer()
    ).toString('base64');
    await f.call('inpaint.sync', { tabId, imageId, rect, strength: 0.4, fullSize: true });
    expect(await f.call('inpaint.get', {}, 'agent')).toMatchObject({
      active: true,
      maskBounds: null,
      maskRatio: 0,
    });
    await f.call('inpaint.sync', { tabId, imageId, rect, mask, strength: 0.4, fullSize: true });
    const state = await f.call('inpaint.get', {}, 'agent');
    expect(state).toMatchObject({
      active: true,
      tabId,
      imageId,
      rect,
      strength: 0.4,
      fullSize: true,
      maskBounds: { x: 100, y: 120, width: 128, height: 128 },
      maskRatio: 1 / 16,
      versionId: expect.any(String),
      versionNumber: expect.any(Number),
      updatedAt: expect.any(String),
    });
    for (const file of [state.previewPath, state.cropPath]) await fs.access(file);
    const estimate = await f.call(
      'generate.estimate-inpaint',
      { tabId, useCurrent: true },
      'agent',
    );
    expect(estimate).toMatchObject({
      rect,
      maskBounds: state.maskBounds,
      maskRatio: state.maskRatio,
    });
    const job = await f.call('generate.inpaint', { tabId, useCurrent: true }, 'agent');
    expect(job.operationDetails).toMatchObject({ rect, strength: 0.4, fullSize: true });
    expect(
      await fs.readFile(
        path.join(f.directory, 'inpaint-masks', job.operationDetails.maskId + '.png'),
      ),
    ).toEqual(Buffer.from(mask, 'base64'));
    await expect(
      f.call('generate.inpaint', { tabId, useCurrent: true, imageId: 'another' }, 'agent'),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    for (const extra of [
      { shapes: [{ type: 'rect', x: 0, y: 0, width: 64, height: 64 }] },
      { maskPath: f.source.image_path },
    ])
      await expect(
        f.call('generate.estimate-inpaint', { tabId, useCurrent: true, ...extra }, 'agent'),
      ).rejects.toMatchObject({ code: 'invalid_input' });
    await f.call('inpaint.sync', { tabId, closed: true });
    expect(await f.call('inpaint.get', {}, 'agent')).toEqual({ active: false });
    await f.call('generate.cancel', { ids: [job.id] });
    await expect
      .poll(async () =>
        fs.access(job.previewPath).then(
          () => false,
          () => true,
        ),
      )
      .toBe(true);
  } finally {
    await f.close();
  }
});

for (const kind of ['upscale', 'enhance', 'inpaint', 'outpaint'])
  it(`rechecks ${kind} operation cost when another request consumes the daily budget`, async () => {
    const f = await setup();
    try {
      f.service.state.tier = 0;
      await f.call('account.refresh');
      await f.call('generate.pause');
      await f.call('settings.generation.save', {
        agentMode: 'direct',
        limitEnabled: true,
        dailyLimit: 100,
      });
      const job = await f.call(`generate.${kind}`, operationInput(f, kind), 'agent');
      expect(job.state).toBe('queued');
      f.database.usage.add({
        jobId: 'synthetic-other-request',
        connection: 'official',
        source: 'user',
        operation: 'generate',
        model: 'synthetic',
        images: 1,
        anlas: 100,
        estimated: false,
      });
      await f.call('generate.resume');
      await expect
        .poll(async () => (await f.call('generate.status', { id: job.id })).jobs[0].state)
        .toBe('pending');
      expect(f.service.state.requests).toHaveLength(0);
      await f.call('generate.confirm', { ids: [job.id] });
      expect((await f.wait(job.id)).state).toBe('completed');
    } finally {
      await f.close();
    }
  });
