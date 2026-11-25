import { afterEach, expect, it } from 'vitest';
import '../fixtures/databaseTestBudget.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { openDatabase } from '../database.js';
import { createCommands } from './index.js';
import { safeTidyChange } from './materials.js';
import { createPromptStructure, syncProjectPromptMetadata } from '../../src/lib/promptStructure.js';
import { parsePrompt } from '../../src/lib/prompt.js';
import type { ImageProject } from '../../src/shared/types';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
});
async function setup(prepare?: (project: ImageProject) => void) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-materials-'));
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  const database = await openDatabase(path.join(directory, 'data'));
  cleanups.push(() => database.close());
  const metadata = {
    prompt_raw: 'flim grain, umbrela\n\nblue hair',
    negative_prompt: 'lowres',
    model: 'synthetic',
    seed: '1',
    width: 64,
    height: 64,
    steps: 28,
    sampler: '',
    guidance: 6,
    generation_mode: 'text_to_image',
  };
  const project = syncProjectPromptMetadata({
    id: 'synthetic-material',
    name: '',
    image_path: '/synthetic.png',
    thumbnail_path: '',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    metadata,
    prompt_structure: createPromptStructure(metadata),
    tags: parsePrompt(metadata.prompt_raw),
  }) as ImageProject;
  prepare?.(project);
  database.insertProject(project);
  let reply: unknown = {};
  const requests: unknown[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push(JSON.parse(body));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeAllConnections();
      }),
  );
  const address = server.address() as { port: number };
  const commands = await createCommands({
    directory,
    version: 'test',
    database,
    busy: () => false,
    readImage: async () => project,
    readSource: async () => project,
    importImage: async () => project,
    preferences: {
      blurSettings: () => ({ mode: 'off', quickAll: false, words: [] }),
      generationSettings: () => ({ hasToken: false }),
      librarySettings: () => ({ trashAutoCleanup: false }),
      credentials: () => ({ baseUrl: `http://127.0.0.1:${address.port}`, model: 'synthetic' }),
    } as any,
  });
  cleanups.push(() => commands.close());
  const call = async (name: string, input: object = {}, origin: 'ui' | 'agent' = 'agent') => {
    const result = await commands.dispatch(name, input, origin);
    if (!result.ok) throw Error(result.error.message);
    return result.data as any;
  };
  const opened = await call('workbench.open', { path: project.image_path });
  return {
    call,
    commands,
    database,
    directory,
    tabId: opened.tab.id,
    requests,
    reply: (value: unknown) => (reply = value),
  };
}
it('rejects meaningful tags, near-spelling substitutions, additions and numerical weight changes', () => {
  expect(safeTidyChange('blue hair', 'red hair')).toBe(false);
  expect(safeTidyChange('blue hair', 'glue hair')).toBe(false);
  expect(safeTidyChange('blue hair, solo', 'blue hair')).toBe(false);
  expect(safeTidyChange('1.2::blue hair::', '1.3::blue hair::')).toBe(false);
  expect(safeTidyChange('flim grain, umbrela', 'film grain, umbrella')).toBe(true);
  expect(safeTidyChange('blue hair, solo', 'blue hair\n\nsolo')).toBe(true);
  expect(safeTidyChange('{blue hair', '{blue hair}')).toBe(true);
  expect(safeTidyChange('1.2::blue hair', '1.2::blue hair::')).toBe(true);
  expect(safeTidyChange('1.2::blue hair', '1.3::blue hair::')).toBe(false);
  const known = (text: string) => ['watercolor', 'blue hair', 'glue hair'].includes(text);
  expect(safeTidyChange('watercolro', 'watercolor', known)).toBe(true);
  expect(safeTidyChange('blue hair', 'glue hair', known)).toBe(false);
});
it('stores whole blocks, inserts an independent copy, counts successful uses and denies Agent deletion', async () => {
  const s = await setup();
  const { item } = await s.call('material.save', {
    tabId: s.tabId,
    scope: 'base:prompt',
    block: 0,
    name: '合成素材',
  });
  expect(item.blocks[0].content).toBe('flim grain, umbrela');
  await s.call('material.insert', { tabId: s.tabId, id: item.id, scope: 'base:prompt', before: 1 });
  expect((await s.call('material.list')).items[0].uses).toBe(1);
  await s.call('block.set-text', {
    tabId: s.tabId,
    scope: 'base:prompt',
    block: 1,
    text: 'standing',
  });
  expect((await s.call('material.list')).items[0].blocks[0].content).toBe('flim grain, umbrela');
  expect((await s.commands.dispatch('material.delete', { id: item.id }, 'agent')).ok).toBe(false);
  await expect(
    s.call('material.insert', { tabId: s.tabId, id: item.id, scope: 'missing' }),
  ).rejects.toThrow();
  expect((await s.call('material.list')).items[0].uses).toBe(1);
  await s.call('material.delete', { id: item.id }, 'ui');
  expect((await s.call('material.list')).items).toEqual([]);
});
it('restores characters with negative prompts and unique names', async () => {
  const s = await setup();
  const added = await s.call('character.add', { tabId: s.tabId, name: '合成角色' });
  const character = added.tab.project.prompt_structure.characters[0];
  await s.call('prompt.set', {
    tabId: s.tabId,
    scope: `character:${character.id}:prompt`,
    text: 'standing',
  });
  await s.call('prompt.set', {
    tabId: s.tabId,
    scope: `character:${character.id}:undesired`,
    text: 'lowres',
  });
  const { item } = await s.call('material.save', {
    tabId: s.tabId,
    scope: `character:${character.id}:prompt`,
    name: '合成角色',
  });
  const inserted = await s.call('material.insert', { tabId: s.tabId, id: item.id });
  const next = inserted.tab.project.prompt_structure.characters[1];
  expect(next.label).toBe('合成角色 2');
  expect(next.prompt_raw).toBe('standing');
  expect(next.undesired_raw).toBe('lowres');
});
it('round trips a complete draft between tabs and through a database backup', async () => {
  const { call, commands, database, directory, tabId } = await setup((p) => {
    const structure = p.prompt_structure;
    structure.use_coords = true;
    structure.use_order = false;
    structure.block_annotations = {
      'base:prompt': [
        {
          raw: 'blue hair',
          start: p.metadata.prompt_raw.indexOf('blue hair'),
          type: 'paragraph',
          displayLabel: '场景',
          translation: '合成译文',
        },
      ],
    };
    structure.characters = ['Alpha', 'Beta'].map((label, i) => ({
      id: label,
      label,
      center: { x: i ? 0.7 : 0.3, y: 0.5 },
      prompt_raw: label,
      undesired_raw: 'fog',
      prompt_tags: parsePrompt(label),
      undesired_tags: parsePrompt('fog'),
    }));
  });
  const source = await call('workbench.get', { tabId });
  const save = () =>
    call('material.save', {
      tabId,
      whole: true,
      name: 'Synthetic set',
      expectedRevision: source.revision,
    });
  const { item } = await save();
  for (const field of ['metadata', 'params', 'novelai_auto', 'references'])
    expect(item).not.toHaveProperty(field);
  expect(item).toMatchObject({
    kind: 'set',
    useCoords: true,
    useOrder: false,
    blocks: [
      { content: 'flim grain, umbrela' },
      { type: 'paragraph', displayLabel: '场景', translation: '合成译文' },
    ],
    negativeBlocks: [{ content: 'lowres' }],
    characters: [
      {
        character: { label: 'Alpha' },
        blocks: [{ content: 'Alpha' }],
        negativeBlocks: [{ content: 'fog' }],
      },
      {
        character: { label: 'Beta' },
        blocks: [{ content: 'Beta' }],
        negativeBlocks: [{ content: 'fog' }],
      },
    ],
  });
  expect((await save()).item.name).toBe('Synthetic set 2');
  expect((await save()).item.name).toBe('Synthetic set 3');
  const id = item.id;
  const target = (await call('workbench.new', { width: 384, height: 576, params: { steps: 19 } }))
    .tab.id;
  const before = (await call('character.add', { tabId: target, name: 'Previous' })).tab.project;
  expect(
    await commands.dispatch(
      'material.save',
      { tabId: target, whole: true, name: 'Empty' },
      'agent',
    ),
  ).toMatchObject({
    ok: false,
    error: { code: 'invalid_input', message: '提示词是空的' },
  });
  await call('workbench.editing', { targets: [{ tabId: target, scope: 'base:prompt' }] }, 'ui');
  expect(await commands.dispatch('material.insert', { tabId: target, id }, 'agent')).toMatchObject({
    ok: false,
    error: { code: 'conflict' },
  });
  expect(database.materials.get(id).uses).toBe(0);
  await call('workbench.editing', { targets: [] }, 'ui');
  const applied = (await call('material.insert', { tabId: target, id })).tab.project;
  expect(applied.tags).toEqual(source.tab.project.tags);
  expect(applied.prompt_structure).toEqual({
    ...source.tab.project.prompt_structure,
    novelai_auto: before.prompt_structure.novelai_auto,
  });
  expect(applied.params).toEqual(before.params);
  expect(applied.references).toEqual(before.references);
  expect(applied.metadata).toEqual({
    ...before.metadata,
    prompt_raw: source.tab.project.metadata.prompt_raw,
    negative_prompt: source.tab.project.metadata.negative_prompt,
  });
  expect(await commands.dispatch('material.update', { id, text: 'other' }, 'ui')).toMatchObject({
    ok: false,
    error: { code: 'invalid_input' },
  });
  await call('material.rename', { id, name: 'Renamed set' }, 'ui');
  const saved = (await call('material.list')).items.find((m: { id: string }) => m.id === id);
  expect(saved).toMatchObject({ uses: 1, name: 'Renamed set' });
  const backup = path.join(directory, 'snapshot.sqlite');
  database.backup.snapshot(backup);
  await call('material.delete', { id }, 'ui');
  expect(database.materials.get(id)).toBeFalsy();
  database.backup.replace(backup);
  expect(database.materials.get(id)).toEqual(saved);
});
it('filters unsafe AI changes at the command boundary and leaves drafts and names untouched', async () => {
  const s = await setup();
  s.reply({
    changes: [
      {
        scope: 'base:prompt',
        block: 0,
        after: 'film grain, umbrella',
        type: 'tags',
        title: '拼写',
        reason: '修正拼写',
      },
      {
        scope: 'base:prompt',
        block: 1,
        after: 'red hair',
        type: 'tags',
        title: '颜色',
        reason: '变色',
      },
    ],
  });
  const before = await s.call('workbench.get', { tabId: s.tabId });
  const result = await s.call('prompt.tidy', { tabId: s.tabId, requestId: 'test' }, 'ui');
  expect(result.changes).toHaveLength(1);
  expect((await s.call('workbench.get', { tabId: s.tabId })).revision).toBe(before.revision);
  s.reply({ names: ['合成场景'] });
  expect(
    (
      await s.call(
        'library.suggest-names',
        { groups: [['synthetic-material']], requestId: 'names' },
        'ui',
      )
    ).changes[0].name,
  ).toBe('合成场景');
  const namingRequest = s.requests.at(-1) as { messages: { role: string; content: string }[] };
  const instruction = namingRequest.messages[0].content;
  for (const constraint of [
    'JSON {names:',
    '2 to 8',
    'no punctuation',
    'distinct',
    'generic subject word',
    'actual differences',
  ])
    expect(instruction).toContain(constraint);
  expect(JSON.parse(namingRequest.messages[1].content)[0]).toMatchObject({
    index: 0,
    prompts: expect.any(Array),
  });
  expect(s.database.loadProject('synthetic-material').name).toBe('Untitled');
  expect(JSON.stringify(s.requests)).not.toContain('/synthetic.png');
});

it('saves complete negative sections and restricts insertion to matching scopes', async () => {
  const { call, commands, tabId } = await setup();
  const added = await call('character.add', { tabId, name: 'Synthetic' });
  const characterScope = `character:${added.tab.project.prompt_structure.characters[0].id}:undesired`;
  const base = 'base:undesired';
  const set = (scope: string, text: string) => call('prompt.set', { tabId, scope, text });
  const save = async (scope: string) =>
    (await call('material.save', { tabId, scope, block: 0, name: 'Synthetic' })).item;
  const positive = await save('base:prompt');
  expect(positive).not.toHaveProperty('negative');
  for (const scope of [base, characterScope]) {
    await set(scope, 'bad hands\n\ntext');
    const negative = await save(scope);
    expect(negative.negative).toBe(true);
    expect(negative.blocks).toMatchObject([{ type: 'tags', content: 'bad hands, text' }]);
    const insert = (id: string) => call('material.insert', { tabId, scope, id, before: 100 });
    for (const existing of ['lowres', '']) {
      await set(scope, existing);
      const result = await insert(negative.id);
      expect(result.document.scopes.find((s: any) => s.scope.key === scope).blocks).toMatchObject([
        { content: existing ? 'lowres, bad hands, text' : 'bad hands, text' },
      ]);
    }
    const before = await call('workbench.get', { tabId });
    for (const [id, target, message] of [
      [negative.id, 'base:prompt', '负面常用块只能插入负面提示词'],
      [positive.id, scope, '这个常用块只能插入正面提示词'],
    ]) {
      expect(
        await commands.dispatch('material.insert', { tabId, id, scope: target }, 'agent'),
      ).toMatchObject({ ok: false, error: { code: 'invalid_input', message } });
    }
    expect((await call('workbench.get', { tabId })).tab.project).toEqual(before.tab.project);
    for (const asNew of [false, true]) {
      const { item } = await call(
        'material.update',
        { id: negative.id, text: 'blur', asNew },
        'ui',
      );
      expect((await call('material.list')).items.find((m: any) => m.id === item.id)).toMatchObject({
        negative: true,
      });
    }
  }
});
