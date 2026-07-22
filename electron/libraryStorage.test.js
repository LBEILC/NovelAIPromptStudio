import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeAssetDirectory, migrateAssetDirectory } from './libraryStorage.js';

const temporaryDirectories = [];
const temporaryRoot = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-storage-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('library asset storage', () => {
  it('copies, verifies, switches, and only then removes the old directory', async () => {
    const root = temporaryRoot();
    const source = path.join(root, 'old-assets');
    const target = path.join(root, 'new-assets');
    fs.mkdirSync(path.join(source, 'images'), { recursive: true });
    fs.mkdirSync(path.join(source, 'thumbnails'), { recursive: true });
    fs.writeFileSync(path.join(source, 'images', 'one.png'), 'image-data');
    fs.writeFileSync(path.join(source, 'thumbnails', 'one.webp'), 'thumb');
    const commit = vi.fn(async () => {
      expect(fs.existsSync(path.join(source, 'images', 'one.png'))).toBe(true);
      expect(fs.existsSync(path.join(target, 'images', 'one.png'))).toBe(true);
    });
    const progress = [];

    const result = await migrateAssetDirectory({ sourceDirectory: source, targetDirectory: target, commit, onProgress: (value) => progress.push(value) });

    expect(commit).toHaveBeenCalledWith({ sourceDirectory: source, targetDirectory: target });
    expect(result).toMatchObject({ assetsDirectory: target, fileCount: 2, totalBytes: 15, cleanupWarning: '' });
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.readFileSync(path.join(target, 'images', 'one.png'), 'utf8')).toBe('image-data');
    expect(progress.at(-1)).toMatchObject({ phase: 'complete', completed: 2, total: 2 });
    expect(await describeAssetDirectory(target)).toMatchObject({ fileCount: 2, totalBytes: 15 });
  });

  it('keeps the old directory and removes copied files when switching fails', async () => {
    const root = temporaryRoot();
    const source = path.join(root, 'old-assets');
    const target = path.join(root, 'new-assets');
    fs.mkdirSync(path.join(source, 'images'), { recursive: true });
    fs.writeFileSync(path.join(source, 'images', 'one.png'), 'image-data');

    await expect(migrateAssetDirectory({
      sourceDirectory: source,
      targetDirectory: target,
      commit: async () => { throw new Error('database failed'); },
    })).rejects.toThrow('database failed');

    expect(fs.readFileSync(path.join(source, 'images', 'one.png'), 'utf8')).toBe('image-data');
    expect(fs.readdirSync(target)).toEqual([]);
  });

  it('rejects non-empty and nested target directories', async () => {
    const root = temporaryRoot();
    const source = path.join(root, 'old-assets');
    const occupied = path.join(root, 'occupied');
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(occupied, { recursive: true });
    fs.writeFileSync(path.join(occupied, 'keep.txt'), 'keep');

    await expect(migrateAssetDirectory({ sourceDirectory: source, targetDirectory: occupied })).rejects.toThrow('空文件夹');
    await expect(migrateAssetDirectory({ sourceDirectory: source, targetDirectory: path.join(source, 'nested') })).rejects.toThrow('不能互相嵌套');
    expect(fs.readFileSync(path.join(occupied, 'keep.txt'), 'utf8')).toBe('keep');
  });
});
