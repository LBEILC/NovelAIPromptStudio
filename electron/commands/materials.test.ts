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
async function setup() {
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
      generationSettings: () => ({ hasToken: false }),
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
  expect(s.database.loadProject('synthetic-material').name).toBe('Untitled');
  expect(JSON.stringify(s.requests)).not.toContain('/synthetic.png');
});
