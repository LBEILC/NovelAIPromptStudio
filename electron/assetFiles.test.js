import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createClipboardBitmap } from './clipboardBitmap.js';
import {
  copyImageToClipboard,
  copyManagedImageToClipboard,
  copyOriginalAsset,
  copyOriginalImage,
  rawClipboardFormatForImage,
  removeManagedAsset,
  resolveImageFile,
  resolveManagedAsset,
} from './assetFiles.js';

const temporaryDirectories = [];

function makeTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'novelai-assets-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('managed asset file operations', () => {
  it('accepts existing workbench images and rejects unsupported files', () => {
    const root = makeTemporaryDirectory();
    const image = path.join(root, 'workbench.webp');
    const text = path.join(root, 'notes.txt');
    fs.writeFileSync(image, 'webp');
    fs.writeFileSync(text, 'text');
    expect(resolveImageFile(image)).toBe(image);
    expect(() => resolveImageFile(text)).toThrow(/PNG、JPG 或 WEBP/);
  });

  it('rejects external paths and the asset root itself', () => {
    const root = makeTemporaryDirectory();
    expect(() => resolveManagedAsset(root, root)).toThrow(/资源路径/);
    expect(() => resolveManagedAsset(root, path.join(root, '..', 'external.png'))).toThrow(
      /资源路径/,
    );
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

  it('writes original PNG bytes and DIBV5 through the injected system clipboard', async () => {
    const root = makeTemporaryDirectory();
    const asset = path.join(root, 'image.png');
    const original = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 120, g: 80, b: 40, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    fs.writeFileSync(asset, original);
    const write = vi.fn();
    const writeBuffer = vi.fn();
    await copyManagedImageToClipboard(root, asset, {
      clipboard: { writeBuffer },
      platform: 'win32',
      systemClipboard: () => ({ write }),
      owner: 123n,
    });
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][0][0]).toEqual({ format: 'PNG', bytes: original });
    expect(write.mock.calls[0][0][1].format).toBe(17);
    expect(write.mock.calls[0][1]).toBe(123n);
    expect(writeBuffer).not.toHaveBeenCalled();
  });

  it('encodes a bottom-up straight-alpha BGRA DIBV5 with all required header fields', async () => {
    const rgba = Buffer.from([200, 100, 50, 0, 180, 90, 45, 1, 160, 80, 40, 128, 140, 70, 35, 255]);
    const png = await sharp(rgba, { raw: { width: 2, height: 2, channels: 4 } })
      .png()
      .toBuffer();
    const [{ bytes: original }, { bytes: dib }] = await createClipboardBitmap(png, 'PNG');
    expect(original).toEqual(png);
    for (const [offset, value] of [
      [0, 124],
      [4, 2],
      [8, 2],
      [16, 3],
      [20, 16],
      [40, 0x00ff0000],
      [44, 0x0000ff00],
      [48, 0x000000ff],
      [52, 0xff000000],
      [56, 0x73524742],
      [108, 4],
    ])
      expect(dib.readUInt32LE(offset)).toBe(value);
    expect(dib.readUInt16LE(12)).toBe(1);
    expect(dib.readUInt16LE(14)).toBe(32);
    expect(dib.subarray(124)).toEqual(
      Buffer.from([40, 80, 160, 128, 35, 70, 140, 255, 50, 100, 200, 0, 45, 90, 180, 1]),
    );
    expect(dib.length).toBe(140);
  });

  it.each([
    ['jpg', 'jpeg', 'JFIF'],
    ['webp', 'webp', 'WebP'],
  ])('copies original %s plus PNG and DIBV5', async (extension, encoder, format) => {
    const root = makeTemporaryDirectory();
    const asset = path.join(root, `image.${extension}`);
    const bytes = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 120, g: 80, b: 40, alpha: 0.5 },
      },
    })
      .toFormat(encoder)
      .toBuffer();
    fs.writeFileSync(asset, bytes);
    const write = vi.fn();
    await copyImageToClipboard(asset, {
      clipboard: { writeBuffer: vi.fn() },
      platform: 'win32',
      systemClipboard: () => ({ write }),
    });
    const formats = write.mock.calls[0][0];
    expect(formats.map((entry) => entry.format)).toEqual([format, 'PNG', 17]);
    expect(formats[0].bytes).toEqual(bytes);
    const { data } = await sharp(formats[1].bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(extension === 'webp' ? 128 : 255);
  });

  it.each(['load', 'write'])(
    'falls back to original bytes when the system clipboard fails at %s',
    async (stage) => {
      const root = makeTemporaryDirectory();
      const asset = path.join(root, 'image.png');
      const bytes = await sharp({ create: { width: 1, height: 1, channels: 4, background: 'red' } })
        .png()
        .toBuffer();
      fs.writeFileSync(asset, bytes);
      const fail = () => {
        throw Error('unavailable');
      };
      const writeBuffer = vi.fn(),
        warn = vi.fn();
      await copyImageToClipboard(asset, {
        clipboard: { writeBuffer },
        platform: 'win32',
        logger: { warn },
        systemClipboard: stage === 'load' ? fail : () => ({ write: fail }),
      });
      expect(writeBuffer).toHaveBeenCalledExactlyOnceWith('PNG', bytes);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['darwin', 'public.png'],
    ['linux', 'image/png'],
  ])('keeps %s raw clipboard behavior', async (platform, format) => {
    const root = makeTemporaryDirectory();
    const asset = path.join(root, 'image.png');
    fs.writeFileSync(asset, 'original bytes');
    const writeBuffer = vi.fn(),
      systemClipboard = vi.fn();
    const image = { isEmpty: () => false };
    expect(
      await copyImageToClipboard(asset, {
        nativeImage: { createFromPath: () => image },
        clipboard: { writeBuffer },
        platform,
        systemClipboard,
      }),
    ).toBe(image);
    expect(writeBuffer).toHaveBeenCalledExactlyOnceWith(format, Buffer.from('original bytes'));
    expect(systemClipboard).not.toHaveBeenCalled();
  });

  it('copies an external workbench image without re-encoding', () => {
    const root = makeTemporaryDirectory();
    const source = path.join(root, 'workbench.png');
    const destination = path.join(root, 'saved.png');
    fs.writeFileSync(source, Buffer.from('original image'));
    copyOriginalImage(source, destination);
    expect(fs.readFileSync(destination)).toEqual(fs.readFileSync(source));
  });

  it('falls back to the decoded bitmap when raw clipboard formats are unavailable', async () => {
    const root = makeTemporaryDirectory();
    const source = path.join(root, 'workbench.jpg');
    fs.writeFileSync(source, 'jpg');
    const image = { isEmpty: () => false };
    let writtenImage = null;
    await copyImageToClipboard(source, {
      nativeImage: { createFromPath: (filePath) => (filePath === source ? image : null) },
      clipboard: {
        writeImage: (value) => {
          writtenImage = value;
        },
      },
    });
    expect(writtenImage).toBe(image);
  });

  it('selects platform-native raw image clipboard formats', () => {
    expect(rawClipboardFormatForImage('metadata.png', 'win32')).toBe('PNG');
    expect(rawClipboardFormatForImage('metadata.jpg', 'darwin')).toBe('public.jpeg');
    expect(rawClipboardFormatForImage('metadata.webp', 'linux')).toBe('image/webp');
  });
});
