import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabaseStorage } from './libraryStorage.js';

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-database-storage-'));
  roots.push(root);
  const directory = path.join(root, 'data');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'studio.sqlite'), 'database');
  fs.writeFileSync(path.join(directory, 'studio.pre-test.sqlite'), 'backup');
  return { root, directory, storage: createDatabaseStorage(directory) };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it('lists only backup file metadata without reading or changing content', async () => {
  const { directory, storage } = fixture();
  fs.writeFileSync(path.join(directory, 'preferences.json'), '{}');
  fs.mkdirSync(path.join(directory, 'studio.pre-directory.sqlite'));
  const read = vi.spyOn(fs.promises, 'readFile');
  expect(storage.location()).toEqual({ directory, fileName: 'studio.sqlite' });
  expect(await storage.listBackups()).toEqual({
    backups: [
      {
        fileName: 'studio.pre-test.sqlite',
        size: 6,
        modifiedAt: fs.statSync(path.join(directory, 'studio.pre-test.sqlite')).mtime.toISOString(),
      },
    ],
  });
  expect(read).not.toHaveBeenCalled();
  expect(fs.readFileSync(path.join(directory, 'studio.sqlite'), 'utf8')).toBe('database');
});

it('reveals the database and only previously listed backups', async () => {
  const { directory, storage } = fixture();
  const show = vi.fn();
  await expect(storage.reveal('studio.pre-test.sqlite', show)).rejects.toThrow();
  await storage.listBackups();
  await storage.reveal('studio.sqlite', show);
  await storage.reveal('studio.pre-test.sqlite', show);
  expect(show.mock.calls).toEqual([
    [path.join(directory, 'studio.sqlite')],
    [path.join(directory, 'studio.pre-test.sqlite')],
  ]);
  fs.unlinkSync(path.join(directory, 'studio.pre-test.sqlite'));
  await expect(storage.reveal('studio.pre-test.sqlite', show)).rejects.toThrow();
  expect(show).toHaveBeenCalledTimes(2);
});

it('rejects absolute paths, traversal, alternate separators, streams and arbitrary files', async () => {
  const { root, directory, storage } = fixture();
  await storage.listBackups();
  const show = vi.fn();
  for (const name of [
    path.join(root, 'studio.sqlite'),
    path.join(directory, 'studio.sqlite'),
    '../studio.sqlite',
    '..\\studio.sqlite',
    'C:\\outside\\studio.sqlite',
    '/tmp/studio.sqlite',
    'studio.sqlite:stream',
    'preferences.json',
    'studio.pre-unlisted.sqlite',
    '',
    null,
  ]) {
    await expect(storage.reveal(name, show)).rejects.toThrow();
  }
  expect(show).not.toHaveBeenCalled();
});

it('rejects a listed backup replaced by a link outside the data directory', async () => {
  const { root, directory, storage } = fixture();
  await storage.listBackups();
  const target = path.join(root, 'outside');
  fs.mkdirSync(target);
  const backup = path.join(directory, 'studio.pre-test.sqlite');
  fs.unlinkSync(backup);
  // Windows junctions need no developer-mode or administrator permission.
  fs.symlinkSync(target, backup, process.platform === 'win32' ? 'junction' : 'dir');
  const show = vi.fn();
  await expect(storage.reveal('studio.pre-test.sqlite', show)).rejects.toThrow();
  expect(show).not.toHaveBeenCalled();
  expect(await storage.listBackups()).toEqual({ backups: [] });
});

it('rejects file symlinks on systems that support creating them', async () => {
  if (process.platform === 'win32') return; // Junction coverage above runs on Windows.
  const { root, directory, storage } = fixture();
  await storage.listBackups();
  const target = path.join(root, 'outside.sqlite');
  fs.writeFileSync(target, 'outside');
  const backup = path.join(directory, 'studio.pre-test.sqlite');
  fs.unlinkSync(backup);
  fs.symlinkSync(target, backup);
  const show = vi.fn();
  await expect(storage.reveal('studio.pre-test.sqlite', show)).rejects.toThrow();
  expect(show).not.toHaveBeenCalled();
  expect(await storage.listBackups()).toEqual({ backups: [] });
});
