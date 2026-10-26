import '../fixtures/databaseTestBudget.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createCommands } from './index.js';
import { openDatabase } from '../database.js';
import { openPreferences } from '../preferences.js';
import { readWorkbenchImage } from '../workbench.js';
import { startFakeNovelAI } from '../fixtures/novelAIService.js';

let directory, database, service, commands, call, wait, tabId;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-random-'));
  database = await openDatabase(directory);
  service = await startFakeNovelAI();
  const preferences = openPreferences(directory, {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  });
  const finished = new Map(),
    waiters = new Map();
  wait = (id) =>
    finished.has(id)
      ? Promise.resolve(finished.get(id))
      : new Promise((resolve) => waiters.set(id, resolve));
  commands = await createCommands({
    directory,
    database,
    preferences,
    generationBaseUrl: service.url,
    version: 'test',
    busy: () => false,
    readImage: readWorkbenchImage,
    readSource: (source) => readWorkbenchImage(source.path),
    importImage: async (file) => {
      const copy = path.join(directory, path.basename(file));
      await fs.copyFile(file, copy);
      const image = await readWorkbenchImage(copy);
      database.insertProject(image);
      return image;
    },
    emit: (event) => {
      if (event.type === 'generation')
        for (const job of event.data.jobs)
          if (['completed', 'failed', 'canceled'].includes(job.state)) {
            finished.set(job.id, job);
            waiters.get(job.id)?.(job);
          }
    },
  });
  call = async (name, input = {}, caller = 'ui') => {
    const response = await commands.dispatch(name, input, caller);
    if (!response.ok) throw Object.assign(new Error(response.error.message), response.error);
    return response.data;
  };
  await call('account.save', { token: 'acceptance-token' });
  tabId = (
    await call('workbench.new', { width: 64, height: 64, params: { quality: 'None', uc: 'None' } })
  ).tab.id;
});
afterEach(async () => {
  await commands?.close();
  await service?.close();
  database?.close();
  await fs.rm(directory, { recursive: true, force: true });
});
const makePool = async (name = 'Action', text = 'standing\nsitting\nwalking\nwaving') => {
  const { item } = await call('material.pool.create', { name }, 'agent');
  return (await call('material.pool.replace', { id: item.id, text }, 'agent')).item;
};
it('supports pool CRUD, probability edits, case-sensitive unique names and block options', async () => {
  const pool = await makePool();
  await expect(makePool()).rejects.toThrow('名称已存在');
  await makePool('action');
  await expect(makePool('bad_name')).rejects.toThrow();
  const added = (
    await call('material.pool.entry.add', { id: pool.id, text: 'jumping' }, 'agent')
  ).item.entries.at(-1);
  expect(added.chance).toBe(1);
  await call('material.pool.entry.update', { id: pool.id, entryId: added.id, chance: 4 }, 'agent');
  await expect(
    call('material.pool.entry.update', { id: pool.id, entryId: added.id, chance: 0 }),
  ).rejects.toThrow();
  await call('material.pool.entry.delete', { id: pool.id, entryId: added.id }, 'agent');
  const inserted = await call(
    'block.random.insert',
    {
      tabId,
      scope: 'base:prompt',
      pool: 'Action',
      count: 2,
      repeat: true,
      min: 0.8,
      max: 1.2,
      step: 0.1,
    },
    'agent',
  );
  expect(inserted.document.scopes[0].blocks[0].random).toMatchObject({
    pool: 'Action',
    count: 2,
    repeat: true,
  });
  const updated = await call(
    'block.random.update',
    { tabId, scope: 'base:prompt', block: 0, pool: 'Action', count: 1 },
    'agent',
  );
  expect(updated.tab.project.metadata.prompt_raw).toBe('__Action__');
  await expect(
    call('block.random.insert', { tabId, scope: 'base:undesired', pool: 'Action' }),
  ).rejects.toThrow('负面');
  expect(
    (await call('material.pool.replace', { id: pool.id, text: '\n standing\n\n sitting\n' })).item
      .entries,
  ).toHaveLength(2);
});
it('renames references in every open draft, preserves history and enforces agent edit locks', async () => {
  const pool = await makePool();
  await call('prompt.set', { tabId, scope: 'base:prompt', text: '__Action*2r__' });
  const job = await call('generate.start', { tabId, count: 1 });
  expect((await wait(job.id)).state).toBe('completed');
  const second = (await call('workbench.new')).tab.id;
  await call('prompt.set', { tabId: second, scope: 'base:prompt', text: '__Action__' });
  await call('workbench.editing', { targets: [{ tabId: second, scope: 'base:prompt' }] });
  await expect(
    call('material.pool.rename', { id: pool.id, name: '动作池' }, 'agent'),
  ).rejects.toThrow('用户正在编辑');
  expect(database.materials.get(pool.id).name).toBe('Action');
  await call('workbench.editing', { targets: [] });
  await call('material.rename', { id: pool.id, name: '动作池' });
  expect((await call('workbench.get', { tabId })).tab.project.metadata.prompt_raw).toBe(
    '__动作池*2r__',
  );
  expect((await call('workbench.get', { tabId: second })).tab.project.metadata.prompt_raw).toBe(
    '__动作池__',
  );
  const versions = (await call('version.list', { tabId })).versions;
  expect(versions.at(-1).project.metadata.prompt_raw).toBe('__Action*2r__');
  await call('material.pool.delete', { id: pool.id }, 'agent');
  await expect(call('generate.start', { tabId, count: 1 })).rejects.toThrow(
    '找不到随机池「动作池」',
  );
  expect(
    (await call('workbench.get', { tabId })).document.scopes[0].blocks[0].syntaxNote,
  ).toContain('找不到随机池');
  expect(service.state.requests).toHaveLength(1);
});
it('keeps four draws in one version, stores per-image results and applies exactly the selected draw', async () => {
  await makePool('Action', Array.from({ length: 50 }, (_, i) => `synthetic tag ${i}`).join('\n'));
  const template = '__Action*3~0.8-1.2/0.1__';
  await call('prompt.set', { tabId, scope: 'base:prompt', text: template });
  const pending = await call('generate.start', { tabId, count: 4 }, 'agent');
  expect(pending.state).toBe('pending');
  expect(service.state.requests).toHaveLength(0);
  await call('generate.confirm', { ids: [pending.id] });
  expect((await wait(pending.id)).state).toBe('completed');
  const versions = (await call('version.list', { tabId })).versions.filter((v) => !v.isStart);
  expect(versions).toHaveLength(1);
  expect(versions[0].project.metadata.prompt_raw).toBe(template);
  const images = versions[0].images;
  expect(images).toHaveLength(4);
  expect(new Set(images.map((i) => JSON.stringify(i.random))).size).toBe(4);
  for (const [index, image] of images.entries()) {
    expect(image.random.blocks[0].source).toBe(template);
    expect(image.random.blocks[0].text).toBe(service.state.requests[index].input);
    expect(database.loadProject(image.projectId).metadata.prompt_raw).toBe(
      service.state.requests[index].input,
    );
    expect((await call('library.get', { id: image.projectId })).project.random).toEqual(
      image.random,
    );
    expect(JSON.stringify(service.state.requests[index])).not.toContain('__');
  }
  const selected = images[2];
  const applied = await call(
    'version.apply-random',
    { tabId, versionId: versions[0].id, imageId: selected.projectId },
    'agent',
  );
  expect(applied.applied).toBe(1);
  expect(applied.skipped).toEqual([]);
  expect(applied.tab.project.metadata.prompt_raw).toBe(service.state.requests[2].input);
  const skipped = await call('version.apply-random', {
    tabId,
    versionId: versions[0].id,
    imageId: selected.id,
  });
  expect(skipped.applied).toBe(0);
  expect(skipped.skipped).toHaveLength(1);
  await call('version.open', { tabId, versionId: versions[0].id });
  await call('prompt.set', { tabId, scope: 'base:prompt', text: '__Action*2__' });
  const changed = await call('generate.start', { tabId, count: 1 });
  expect((await wait(changed.id)).state).toBe('completed');
  expect((await call('version.list', { tabId })).versions.filter((v) => !v.isStart)).toHaveLength(
    2,
  );
});
it('resolves character scopes and rejects negative markers even for models that ignore negative prompts', async () => {
  await makePool();
  const character = await call('character.add', { tabId });
  const scope = character.document.scopes.find(
    (s) => s.scope.characterId && s.scope.polarity === 'prompt',
  ).scope.key;
  await call('prompt.set', { tabId, scope, text: '__Action__' });
  const job = await call('generate.start', { tabId, count: 1 });
  expect((await wait(job.id)).state).toBe('completed');
  expect(
    service.state.requests[0].parameters.v4_prompt.caption.char_captions[0].char_caption,
  ).not.toContain('__');
  await call('prompt.set', { tabId, scope: 'base:undesired', text: '__Action__' });
  await call('params.set', { tabId, patch: { effort: 'Medium' } });
  await expect(call('generate.start', { tabId, count: 1 })).rejects.toThrow('负面');
  expect(service.state.requests).toHaveLength(1);
});
it.each(['img2img', 'enhance', 'upscale', 'inpaint', 'outpaint'])(
  'resolves the current draft and records %s draws',
  async (kind) => {
    await makePool();
    const first = await call('generate.start', { tabId, count: 1 });
    const generated = await wait(first.id);
    expect(generated.error || generated.state).toBe('completed');
    const imageId = generated.images[0];
    await call('prompt.set', { tabId, scope: 'base:prompt', text: '__Action*2__' });
    let input = { tabId, imageId };
    if (kind === 'img2img') {
      await call('reference.set-base', { tabId, imageId });
      input = { tabId, count: 1 };
    }
    if (kind === 'inpaint') {
      const mask = (
        await sharp({ create: { width: 64, height: 64, channels: 4, background: '#ffffff' } })
          .png()
          .toBuffer()
      ).toString('base64');
      input = { ...input, rect: { x: 0, y: 0, width: 64, height: 64 }, mask, strength: 0.7 };
    }
    if (kind === 'outpaint')
      input = { ...input, edges: { left: 64, right: 0, top: 0, bottom: 0 }, mode: 'whole' };
    if (kind === 'enhance') input = { ...input, magnitude: 2, scale: 1 };
    const job = await call(kind === 'img2img' ? 'generate.start' : `generate.${kind}`, input);
    const finished = await wait(job.id);
    expect(finished.error || finished.state).toBe('completed');
    const version = database.versions.get(finished.versionId);
    expect(version.project.metadata.prompt_raw).toBe('__Action*2__');
    const record = version.images[0].random;
    expect(record.blocks[0].entries).toHaveLength(2);
    if (kind !== 'upscale') {
      expect(service.state.requests.at(-1).input).toContain(record.blocks[0].text);
      expect(database.loadProject(finished.images[0]).metadata.prompt_raw).toContain(
        record.blocks[0].text,
      );
    }
  },
);
