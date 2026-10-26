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
  let imported = 0;
  const commands = await createCommands({
    directory,
    assetsDirectory: () => directory,
    database,
    preferences,
    generationBaseUrl: service.url,
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
    service,
    commands,
    source,
    call,
    input,
    events,
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
        error: { code: 'forbidden' },
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
      expect(version.project.metadata).toEqual(parent.project.metadata);
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
