import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const clipboardMock = vi.hoisted(() => ({
  read: vi.fn(() => ''),
  readBuffer: vi.fn(() => Buffer.alloc(0)),
  readImage: vi.fn(),
}));
vi.mock('electron', () => ({ clipboard: clipboardMock }));

const { cleanupWorkbenchTemporaryImages, readClipboardImageSource } = await import('./clipboardImages.js');
const temporaryDirectories = [];

afterEach(() => {
  clipboardMock.read.mockReset().mockReturnValue('');
  clipboardMock.readBuffer.mockReset().mockReturnValue(Buffer.alloc(0));
  clipboardMock.readImage.mockReset();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('clipboard image reading', () => {
  it('prefers an accessible local image file so original metadata can be retained', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-clipboard-'));
    temporaryDirectories.push(directory);
    const imagePath = path.join(directory, 'metadata image.png');
    fs.writeFileSync(imagePath, 'png bytes');
    clipboardMock.read.mockImplementation((format) => format === 'public.file-url' ? pathToFileURL(imagePath).toString() : '');

    expect(readClipboardImageSource(path.join(directory, 'temporary'))).toEqual({
      filePath: imagePath,
      fromBitmap: false,
      temporaryId: '',
      fingerprint: '',
    });
    expect(clipboardMock.readImage).not.toHaveBeenCalled();
  });

  it('persists a clipboard bitmap by content fingerprint and cleans only unreferenced files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-clipboard-'));
    temporaryDirectories.push(directory);
    const png = Buffer.from('encoded png pixels');
    clipboardMock.readImage.mockReturnValue({
      isEmpty: () => false,
      getSize: () => ({ width: 640, height: 960 }),
      toPNG: () => png,
    });

    const source = readClipboardImageSource(directory);
    expect(source).toMatchObject({ fromBitmap: true, temporaryId: source.fingerprint });
    expect(fs.readFileSync(source.filePath)).toEqual(png);
    expect(cleanupWorkbenchTemporaryImages(directory, [source.filePath])).toEqual([]);
    expect(cleanupWorkbenchTemporaryImages(directory, [])).toEqual([source.filePath]);
    expect(fs.existsSync(source.filePath)).toBe(false);
  });

  it('reports an empty clipboard without creating a temporary image', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-clipboard-'));
    temporaryDirectories.push(directory);
    clipboardMock.readImage.mockReturnValue({ isEmpty: () => true });
    expect(() => readClipboardImageSource(directory)).toThrow('剪贴板中没有可导入的图片');
  });
});
