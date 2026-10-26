import './fixtures/databaseTestBudget.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { openDatabase } from './database.js';
import { openPreferences } from './preferences.js';
import { createCommands } from './commands/index.js';
import { validateCommand } from './commands/registry.js';
import { createPromptStructure } from '../src/lib/promptStructure.js';
import { parsePrompt } from '../src/lib/prompt.js';
import { DEFAULT_NSFW_TAGS } from '../src/shared/nsfw.ts';
import { filterGalleryProjects, normalizeGalleryFilters } from '../src/lib/galleryFilters.js';

const roots = [],
  databases = [],
  commands = [];
const safeStorage = { isEncryptionAvailable: () => false };
afterEach(async () => {
  for (const command of commands.splice(0)) await command.close();
  for (const db of databases.splice(0)) db.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const fixture = (id, raw = 'nsfw') => {
  const metadata = {
    prompt_raw: raw,
    negative_prompt: 'nsfw',
    model: 'synthetic',
    extra_json: '{}',
  };
  return {
    id,
    name: id,
    image_path: `${id}.png`,
    thumbnail_path: '',
    created_at: '2026-01-01',
    tags: parsePrompt(raw),
    metadata,
    prompt_structure: createPromptStructure(metadata),
  };
};
async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-nsfw-'));
  roots.push(root);
  const database = await openDatabase(root);
  databases.push(database);
  database.insertProject(fixture('synthetic-a'));
  database.insertProject(fixture('synthetic-b', 'landscape'));
  const preferences = openPreferences(root, safeStorage),
    events = [];
  const command = await createCommands({
    directory: root,
    version: 'test',
    database,
    preferences,
    busy: () => false,
    emit: (e) => events.push(e),
    readImage: async () => database.loadProject('synthetic-a'),
    readSource: async () => database.loadProject('synthetic-a'),
    importImage: async () => database.loadProject('synthetic-a'),
  });
  commands.push(command);
  const call = async (name, input = {}, source = 'ui') => {
    const result = await command.dispatch(name, input, source);
    if (!result.ok) throw Object.assign(Error(result.error.message), { code: result.error.code });
    return result.data;
  };
  return { root, database, preferences, events, command, call };
}

it('supports Agent marking, validates batches atomically and emits only changed states', async () => {
  const { database, events, call } = await setup();
  expect(database.loadProject('synthetic-a').nsfw).toEqual({
    value: true,
    source: 'auto',
    tag: 'nsfw',
  });
  const first = await call('library.nsfw.mark', { ids: ['synthetic-a'], value: 'safe' }, 'agent');
  expect(first.states['synthetic-a']).toEqual({ value: false, source: 'manual' });
  expect(events.at(-1)).toEqual({ type: 'nsfw-changed', states: first.states });
  await call('library.nsfw.mark', { ids: ['synthetic-a'], value: 'safe' });
  expect(events.at(-1).states).toEqual({});
  await expect(
    call('library.nsfw.mark', { ids: ['synthetic-a', 'missing'], value: 'nsfw' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(database.loadProject('synthetic-a').nsfw).toEqual({ value: false, source: 'manual' });
  await call('library.nsfw.mark', { ids: ['synthetic-b'], value: 'nsfw' });
  expect(database.loadProject('synthetic-b').nsfw).toEqual({ value: true, source: 'manual' });
  await call('library.nsfw.mark', { ids: ['synthetic-a'], value: 'auto' });
  expect(database.loadProject('synthetic-a').nsfw.source).toBe('auto');
});

it('recomputes cards and observed workbench objects after word changes, preserving manual overrides', async () => {
  const { database, call, events } = await setup();
  database.nsfw.state(fixture('external', 'custom'));
  await database.loadLibraryCards();
  await call('library.nsfw.mark', { ids: ['synthetic-a'], value: 'safe' });
  await call('settings.blur.save', {
    settings: { words: ['landscape', 'CUSTOM'], quickAll: true, mode: 'nsfw' },
  });
  expect(events.at(-2).type).toBe('blur');
  expect(events.at(-1)).toEqual({
    type: 'nsfw-changed',
    states: {
      'synthetic-b': { value: true, source: 'auto', tag: 'landscape' },
      external: { value: true, source: 'auto', tag: 'custom' },
    },
  });
  const cards = await database.loadLibraryCards();
  expect(cards.find((c) => c.id === 'synthetic-a').nsfw).toEqual({
    value: false,
    source: 'manual',
  });
  expect(cards.find((c) => c.id === 'synthetic-b').nsfw.value).toBe(true);
  expect(filterGalleryProjects(cards, { nsfw: 'nsfw' }).map((c) => c.id)).toEqual(['synthetic-b']);
  expect(filterGalleryProjects(cards, { nsfw: 'safe' }).map((c) => c.id)).toEqual(['synthetic-a']);
  expect(filterGalleryProjects(cards, {}).length).toBe(2);
  expect(normalizeGalleryFilters({}).nsfw).toBe('any');
  const collection = database.createCollection({
    id: 'synthetic-rule',
    name: 'Synthetic rule',
    kind: 'smart',
    filters: { nsfw: 'nsfw' },
  });
  expect(database.listCollections().find((c) => c.id === collection.id).filters.nsfw).toBe('nsfw');
  await call('settings.blur.save', { settings: { words: [] } });
  expect((await database.loadLibraryCards()).every((c) => !c.nsfw.value)).toBe(true);
});

it('keeps settings UI-only, rejects malformed input, and persists preferences without freezing defaults', async () => {
  const { root, preferences, call } = await setup();
  expect(preferences.blurSettings()).toEqual({
    mode: 'off',
    quickAll: false,
    words: DEFAULT_NSFW_TAGS,
    defaultWords: DEFAULT_NSFW_TAGS,
  });
  await call('settings.blur.save', { settings: { quickAll: true, mode: 'all' } });
  expect(
    JSON.parse(fs.readFileSync(path.join(root, 'preferences.json'))).privacy,
  ).not.toHaveProperty('nsfwWords');
  await call('settings.blur.save', {
    settings: { words: [' [NUDE] ', 'nude', '', 'rating: explicit', 'completely_nude'] },
  });
  const expected = {
    mode: 'all',
    quickAll: true,
    words: ['nude', 'rating:explicit', 'completely nude'],
    defaultWords: DEFAULT_NSFW_TAGS,
  };
  expect(openPreferences(root, safeStorage).blurSettings()).toEqual(expected);
  const backup = preferences.backup();
  preferences.saveBlurSettings({ mode: 'off', quickAll: false, words: [] });
  preferences.restoreBackup(backup);
  expect(preferences.blurSettings()).toEqual(expected);
  preferences.restoreBackup({});
  expect(preferences.blurSettings().words).toEqual(DEFAULT_NSFW_TAGS);
  for (const name of ['settings.blur.get', 'settings.blur.save'])
    await expect(
      call(name, name.endsWith('save') ? { settings: {} } : {}, 'agent'),
    ).rejects.toMatchObject({ code: 'forbidden' });
  for (const input of [
    {},
    { ids: ['synthetic-a'] },
    { ids: [], value: 'auto' },
    { ids: ['synthetic-a'], value: 'other' },
  ])
    expect(() => validateCommand('library.nsfw.mark', input, 'agent')).toThrow();
  for (const settings of [
    { words: [1] },
    { mode: 'invalid' },
    { quickAll: 1 },
    { defaultWords: [] },
  ])
    await expect(call('settings.blur.save', { settings })).rejects.toMatchObject({
      code: 'invalid_input',
    });
});

it('adds marks without rewriting old records, persists them, and includes version images and backups', async () => {
  const { root, database } = await setup();
  const original = database.loadProject('synthetic-a');
  const version = database.versions.ensure('synthetic-work', original);
  database.nsfw.mark(['synthetic-a'], 'safe');
  expect(database.versions.get(version.id).project.nsfw).toEqual({
    value: false,
    source: 'manual',
  });
  const backup = path.join(root, 'saved.sqlite');
  database.backup.snapshot(backup);
  database.nsfw.mark(['synthetic-a'], 'nsfw');
  database.backup.replace(backup);
  expect(database.loadProject('synthetic-a').nsfw).toEqual({ value: false, source: 'manual' });
  database.close();
  databases.splice(databases.indexOf(database), 1);
  let db = await openDatabase(root);
  expect(db.loadProject('synthetic-a').nsfw).toEqual({ value: false, source: 'manual' });
  db.close();
  const raw = new DatabaseSync(path.join(root, 'studio.sqlite'));
  raw.exec('DROP TRIGGER image_nsfw_marks_delete; DROP TABLE image_nsfw_marks');
  raw.close();
  db = await openDatabase(root);
  databases.push(db);
  expect(db.loadProject('synthetic-a').nsfw).toEqual({ value: true, source: 'auto', tag: 'nsfw' });
  db.insertProject(fixture('without-metadata', ''));
  expect(db.loadProject('without-metadata').nsfw).toEqual({ value: false, source: 'auto' });
});
