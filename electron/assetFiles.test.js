import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyManagedImageToClipboard, copyOriginalAsset, removeManagedAsset, resolveManagedAsset } from './assetFiles.js';

const temporaryDirectories = [];

function makeTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'novelai-assets-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('managed asset file operations', () => {
  it('rejects external paths and the asset root itself', () => {
    const root = makeTemporaryDirectory();
    expect(() => resolveManagedAsset(root, root)).toThrow(/资源路径/);
    expect(() => resolveManagedAsset(root, path.join(root, '..', 'external.png'))).toThrow(/资源路径/);
  });

  it('copies original bytes without re-encoding', () => {
    const root = makeTemporaryDirectory();
    const source = path.join(root, 'images', 'metadata.png');
    const destination = path.join(root, '..', `${path.basename(root)}-download.png`);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    const original = Buffer.from('89504e470d0a1a0a744558744e6f76656c41493a70726f6d7074', 'hex');
    fs.writeFileSync(source, original);
    try {
      const result = copyOriginalAsset(root, source, destination);
      expect(result.bytes).toBe(original.length);
      expect(fs.readFileSync(destination)).toEqual(original);
    } finally {
      fs.rmSync(destination, { force: true });
    }
  });

  it('only removes files inside the managed asset directory', () => {
    const root = makeTemporaryDirectory();
    const asset = path.join(root, 'thumbs', 'image.webp');
    fs.mkdirSync(path.dirname(asset), { recursive: true });
    fs.writeFileSync(asset, 'thumbnail');
    removeManagedAsset(root, asset);
    expect(fs.existsSync(asset)).toBe(false);
  });

  it('writes a validated visible image to the system clipboard adapter', () => {
    const root = makeTemporaryDirectory();
    const asset = path.join(root, 'images', 'image.png');
    fs.mkdirSync(path.dirname(asset), { recursive: true });
    fs.writeFileSync(asset, 'png');
    const image = { isEmpty: () => false };
    let writtenImage = null;
    copyManagedImageToClipboard(root, asset, {
      nativeImage: { createFromPath: (filePath) => filePath === asset ? image : null },
      clipboard: { writeImage: (value) => { writtenImage = value; } },
    });
    expect(writtenImage).toBe(image);
  });
});
