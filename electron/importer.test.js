import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import yazl from 'yazl';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database.js';
import {
  decodeZipEntryFileName,
  generateZipEntryPreviews,
  importLibraryFiles,
  inspectZipArchive,
  isPngSignature,
  validateZipImageEntry,
} from './importer.js';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
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

function clearZipUtf8Flags(buffer) {
  const patched = Buffer.from(buffer);
  for (let offset = 0; offset <= patched.length - 10; offset += 1) {
    const signature = patched.readUInt32LE(offset);
    const flagOffset = signature === 0x04034b50 ? offset + 6 : signature === 0x02014b50 ? offset + 8 : -1;
    if (flagOffset >= 0) patched.writeUInt16LE(patched.readUInt16LE(flagOffset) & ~0x800, flagOffset);
  }
  return patched;
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

  it('imports only the selected ZIP entry even when archive names are duplicated', async () => {
    const directory = temporaryWorkspace();
    const zipPath = path.join(directory, 'duplicates.zip');
    const first = await pngBuffer({ r: 220, g: 80, b: 80, alpha: 1 });
    const second = await pngBuffer({ r: 80, g: 120, b: 220, alpha: 1 });
    await writeZip(zipPath, [
      { name: 'same-name.png', buffer: first },
      { name: 'same-name.png', buffer: second },
    ]);
    const database = await openDatabase(path.join(directory, 'data'));

    const result = await importLibraryFiles({
      filePaths: [zipPath],
      assetsDirectory: path.join(directory, 'assets'),
      database,
      selectedArchiveEntries: new Map([[zipPath, new Set([1])]]),
    });

    expect(result.summary).toMatchObject({ total: 1, processed: 1, imported: 1, failed: 0 });
    expect(result.imported[0].content_hash).toBe(crypto.createHash('sha256').update(second).digest('hex'));
  });

  it('generates bounded WebP previews for selectable archive entries', async () => {
    const directory = temporaryWorkspace();
    const zipPath = path.join(directory, 'preview.zip');
    const previewDirectory = path.join(directory, 'previews');
    fs.mkdirSync(previewDirectory);
    const largePng = await sharp({
      create: { width: 1800, height: 900, channels: 4, background: { r: 80, g: 120, b: 220, alpha: 1 } },
    }).png().toBuffer();
    await writeZip(zipPath, [{ name: 'folder/preview.png', buffer: largePng }]);
    const inspection = await inspectZipArchive(zipPath);
    const updates = [];

    await generateZipEntryPreviews({
      zipPath,
      entries: inspection.entries.map((entry) => ({ ...entry, id: 'entry-one' })),
      previewDirectory,
      onPreview: (update) => updates.push(update),
    });

    expect(updates).toEqual([{
      id: 'entry-one',
      previewHeight: 640,
      previewPath: path.join(previewDirectory, 'entry-one.webp'),
      previewWidth: 1280,
    }]);
    const metadata = await sharp(fs.readFileSync(updates[0].previewPath)).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 1280, height: 640 });
  });

  it('recovers UTF-8 names from macOS ZIPs that omit the language flag', async () => {
    const directory = temporaryWorkspace();
    const zipPath = path.join(directory, 'NovelAI 图片合集.zip');
    const png = await pngBuffer();
    await writeZip(zipPath, [{ name: '作品/第三张 (同组).png', buffer: png }]);
    fs.writeFileSync(zipPath, clearZipUtf8Flags(fs.readFileSync(zipPath)));

    const inspection = await inspectZipArchive(zipPath);
    expect(inspection.entries).toEqual([
      expect.objectContaining({ fileName: '作品/第三张 (同组).png' }),
    ]);

    const database = await openDatabase(path.join(directory, 'data'));
    const result = await importLibraryFiles({
      filePaths: [zipPath],
      assetsDirectory: path.join(directory, 'assets'),
      database,
    });
    expect(result.imported[0].name).toBe('第三张 同组');
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

  it('keeps standard CP437 decoding for non-UTF-8 entry bytes', () => {
    const fileNameRaw = Buffer.from([0x82, 0x2e, 0x70, 0x6e, 0x67]);
    expect(decodeZipEntryFileName({
      fileName: fileNameRaw,
      fileNameRaw,
      extraFields: [],
      generalPurposeBitFlag: 0,
    })).toBe('é.png');
  });
});
