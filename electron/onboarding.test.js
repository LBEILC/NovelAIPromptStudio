import './fixtures/databaseTestBudget.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openPreferences } from './preferences.js';
import { openDatabase } from './database.js';
import { createCommands } from './commands/index.js';
import { importLibraryFiles } from './importer.js';

const roots = [];
const databases = [];
const runtimes = [];
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(text),
  decryptString: (buffer) => buffer.toString(),
};
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
async function setup(stored) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-onboarding-'));
  roots.push(directory);
  if (stored !== undefined)
    fs.writeFileSync(path.join(directory, 'preferences.json'), JSON.stringify(stored));
  const database = await openDatabase(directory);
  databases.push(database);
  const preferences = openPreferences(directory, safeStorage);
  const commands = await createCommands({
    directory,
    database,
    preferences,
    version: '1.8.2',
    busy: () => false,
  });
  runtimes.push(commands);
  const call = async (name, origin = 'ui') => {
    const result = await commands.dispatch(name, {}, origin);
    expect(result.ok).toBe(true);
    return result.data;
  };
  return { directory, preferences, database, commands, call };
}
it('shows a fresh install, persists the initial decision and completes idempotently across restarts', async () => {
  const { directory, preferences, call } = await setup();
  // A startup write must not masquerade as an older installation.
  preferences.saveAppearanceSettings({ themeMode: 'light' });
  expect(await call('onboarding.get')).toEqual({ show: true, seen: null, current: '1.8.2' });
  expect(openPreferences(directory, safeStorage).onboardingSettings()).toEqual({
    show: true,
    seen: null,
  });
  expect(await call('onboarding.done')).toEqual({});
  const before = fs.readFileSync(preferences.filePath, 'utf8');
  expect(await call('onboarding.done')).toEqual({});
  expect(fs.readFileSync(preferences.filePath, 'utf8')).toBe(before);
  expect(await call('onboarding.get')).toEqual({ show: false, seen: '1.8.2', current: '1.8.2' });
  expect(openPreferences(directory, safeStorage).onboardingSettings()).toEqual({
    show: false,
    seen: '1.8.2',
  });
  expect(preferences.appearanceSettings().themeMode).toBe('light');
});
it.each([{}, { appearance: { themeMode: 'dark' } }])(
  'skips an existing preference file without changing old settings: %j',
  async (stored) => {
    const { preferences, call } = await setup(stored);
    expect(await call('onboarding.get')).toEqual({ show: false, seen: null, current: '1.8.2' });
    expect(JSON.parse(fs.readFileSync(preferences.filePath, 'utf8'))).toMatchObject(stored);
  },
);
it.each(['image', 'trash', 'work'])(
  'skips existing %s data even without preferences and retains the decision after removal',
  async (kind) => {
    const { directory, database, preferences, call } = await setup();
    const project = {
      id: 'synthetic-onboarding',
      name: 'Synthetic',
      image_path: '/synthetic.png',
      thumbnail_path: '',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      metadata: { prompt_raw: 'synthetic clouds', width: 64, height: 64 },
      tags: [],
    };
    if (kind === 'work') database.versions.ensure('synthetic-work', project);
    else {
      database.insertProject(project);
      if (kind === 'trash') database.updateProjects([project.id], { deleted: true });
    }
    expect(fs.existsSync(preferences.filePath)).toBe(false);
    expect(database.hasOnboardingHistory()).toBe(true);
    expect(await call('onboarding.get')).toEqual({ show: false, seen: null, current: '1.8.2' });
    if (kind !== 'work') {
      database.deleteProject(project.id);
      expect(database.hasOnboardingHistory()).toBe(false);
      expect(await call('onboarding.get')).toEqual({ show: false, seen: null, current: '1.8.2' });
    }
    expect(openPreferences(directory, safeStorage).onboardingSettings(() => false)).toEqual({
      show: false,
      seen: null,
    });
  },
);
it('treats a saved token as prior use', async () => {
  const { preferences, call } = await setup();
  preferences.saveNovelAIToken('synthetic-token');
  expect(await call('onboarding.get')).toEqual({ show: false, seen: null, current: '1.8.2' });
});
it('skips an existing demo library in an isolated copy without reading the daily profile', async () => {
  const { directory, database, preferences, call } = await setup();
  const source = path.resolve('demo/images/final');
  const filePaths = fs
    .readdirSync(source)
    .filter((file) => file.endsWith('.png'))
    .map((file) => path.join(source, file));
  const result = await importLibraryFiles({
    filePaths,
    database,
    assetsDirectory: path.join(directory, 'assets'),
  });
  expect(result.errors).toEqual([]);
  expect(result.imported).toHaveLength(14);
  expect(fs.existsSync(preferences.filePath)).toBe(false);
  expect(await call('onboarding.get')).toEqual({ show: false, seen: null, current: '1.8.2' });
});
it('rejects both onboarding commands from Agent and CLI origin', async () => {
  const { commands } = await setup();
  for (const name of ['onboarding.get', 'onboarding.done'])
    expect(await commands.dispatch(name, {}, 'agent')).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    });
});

it('updates the seen version for existing users and includes it in portable backups', async () => {
  const { preferences, call } = await setup({ onboardingDone: true, featuresSeen: '1.7.0' });
  expect(await call('onboarding.get')).toEqual({ show: false, seen: '1.7.0', current: '1.8.2' });
  await call('onboarding.done');
  const backup = preferences.backup();
  expect(backup).toMatchObject({ onboardingDone: true, featuresSeen: '1.8.2' });
  const restored = await setup();
  restored.preferences.restoreBackup(backup);
  expect(await restored.call('onboarding.get')).toEqual({
    show: false,
    seen: '1.8.2',
    current: '1.8.2',
  });
  restored.preferences.restoreBackup({ onboardingDone: true });
  expect(await restored.call('onboarding.get')).toEqual({
    show: false,
    seen: null,
    current: '1.8.2',
  });
});
it('does not export or return an invalid stored seen version', async () => {
  const { preferences, call } = await setup({ onboardingDone: true, featuresSeen: 182 });
  expect(await call('onboarding.get')).toEqual({ show: false, seen: null, current: '1.8.2' });
  expect(preferences.backup()).not.toHaveProperty('featuresSeen');
});
