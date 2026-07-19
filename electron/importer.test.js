import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import yazl from 'yazl';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database.js';
import { importLibraryFiles, inspectZipArchive, isPngSignature, validateZipImageEntry } from './importer.js';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

async function pngBuffer(color = { r: 220, g: 150, b: 80, alpha: 1 }) {
  return sharp({ create: { width: 3, height: 3, channels: 4, background: color } }).png().toBuffer();
}

async function writeZip(filePath, entries) {
  const zip = new yazl.ZipFile();
  for (const entry of entries) zip.addBuffer(entry.buffer, entry.name);
  zip.end();
  await pipeline(zip.outputStream, fs.createWriteStream(filePath));
}

function temporaryWorkspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-importer-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('safe ZIP import', () => {
  it('keeps only visible PNG entries during preflight', async () => {
    const directory = temporaryWorkspace();
    const zipPath = path.join(directory, 'novelai.zip');
    const png = await pngBuffer();
    await writeZip(zipPath, [
      { name: '作品/生成图.png', buffer: png },
      { name: '__MACOSX/._生成图.png', buffer: png },
      { name: 'notes.txt', buffer: Buffer.from('not an image') },
    ]);

    const inspection = await inspectZipArchive(zipPath);
    expect(inspection.entries).toEqual([expect.objectContaining({ fileName: '作品/生成图.png', uncompressedSize: png.length })]);
    expect(inspection).toMatchObject({ entryCount: 3, imageCount: 1, skipped: 2 });
  });

  it('imports ZIP entries through the image pipeline and skips content duplicates', async () => {
    const directory = temporaryWorkspace();
    const dataDirectory = path.join(directory, 'data');
    const assetsDirectory = path.join(directory, 'assets');
    const imagePath = path.join(directory, 'same-image.png');
    const zipPath = path.join(directory, 'export.zip');
    const png = await pngBuffer();
    fs.writeFileSync(imagePath, png);
    await writeZip(zipPath, [{ name: 'renamed-inside-zip.png', buffer: png }]);
    const database = await openDatabase(dataDirectory);

    const result = await importLibraryFiles({ filePaths: [imagePath, zipPath], assetsDirectory, database });

    expect(result.summary).toMatchObject({ total: 2, processed: 2, imported: 1, duplicates: 1, failed: 0, cancelled: false });
    expect(result.duplicates[0]).toMatchObject({ file: 'export.zip / renamed-inside-zip.png', projectId: result.imported[0].id });
    expect(database.loadLibrary()).toHaveLength(1);
    expect(database.loadLibrary()[0].content_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reports a fake PNG without blocking the rest of a batch', async () => {
    const directory = temporaryWorkspace();
    const zipPath = path.join(directory, 'mixed.zip');
    const directPath = path.join(directory, 'valid.png');
    const png = await pngBuffer();
    fs.writeFileSync(directPath, png);
    await writeZip(zipPath, [{ name: 'fake.png', buffer: Buffer.from('this is not png data') }]);
    const database = await openDatabase(path.join(directory, 'data'));

    const result = await importLibraryFiles({ filePaths: [zipPath, directPath], assetsDirectory: path.join(directory, 'assets'), database });

    expect(result.summary).toMatchObject({ total: 2, processed: 2, imported: 1, failed: 1 });
    expect(result.errors[0]).toMatchObject({ file: 'mixed.zip / fake.png', error: expect.stringContaining('文件签名') });
  });

  it('can stop before starting another import item', async () => {
    const directory = temporaryWorkspace();
    const imagePath = path.join(directory, 'cancelled.png');
    fs.writeFileSync(imagePath, await pngBuffer());
    const database = await openDatabase(path.join(directory, 'data'));
    const controller = new AbortController();
    controller.abort();

    const result = await importLibraryFiles({
      filePaths: [imagePath],
      assetsDirectory: path.join(directory, 'assets'),
      database,
      signal: controller.signal,
    });

    expect(result.summary).toMatchObject({ total: 0, imported: 0, remaining: 0, cancelled: true });
    expect(database.loadLibrary()).toEqual([]);
  });
});

describe('import validation helpers', () => {
  it('recognizes PNG signatures and rejects traversal paths', () => {
    expect(isPngSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(isPngSignature(Buffer.from('not-png'))).toBe(false);
    expect(validateZipImageEntry({
      fileName: '../escape.png',
      externalFileAttributes: 0,
      generalPurposeBitFlag: 0,
      compressionMethod: 8,
      compressedSize: 10,
      uncompressedSize: 20,
    }).action).toBe('reject');
  });
});
