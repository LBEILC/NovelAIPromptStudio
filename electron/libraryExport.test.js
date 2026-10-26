import { it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import sharp from 'sharp';
import yauzl from 'yauzl';
import { createLibraryExport, resolveExport, exportSafeName } from './libraryExport.js';
import { readNovelAIMetadata } from './metadata.js';
import { validateCommand } from './commands/registry.js';

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-export-test-'));
  roots.push(root);
  const raw = Buffer.alloc(128 * 128 * 4, 255);
  const payload = zlib.gzipSync(
    Buffer.from(
      JSON.stringify({
        Description: 'synthetic meadow',
        Comment: JSON.stringify({ prompt: 'synthetic meadow', seed: 42 }),
      }),
    ),
  );
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length * 8);
  const hidden = Buffer.concat([Buffer.from('stealth_pngcomp'), length, payload]);
  for (let i = 0; i < hidden.length * 8; i++) {
    const at = ((i % 128) * 128 + Math.floor(i / 128)) * 4 + 3;
    raw[at] = (raw[at] & 254) | ((hidden[Math.floor(i / 8)] >> (7 - (i % 8))) & 1);
  }
  const source = path.join(root, 'source.png');
  await sharp(raw, { raw: { width: 128, height: 128, channels: 4 } })
    .png()
    .toFile(source);
  const output = path.join(root, 'output');
  await fs.mkdir(output);
  const images = [
    {
      id: 'image-01',
      name: 'meadow-01',
      has_custom_name: true,
      image_path: source,
      tags: [{ tag: 'grass' }],
    },
    {
      id: 'image-02',
      name: 'deadbeefdeadbeef',
      original_filename: 'meadow-01.png',
      image_path: source,
      tags: [],
    },
    { id: 'trash-01', deleted_at: '2026-01-01', image_path: source },
    { id: 'missing-01', image_path: path.join(root, 'missing.png') },
  ];
  const collections = [
    { id: 'manual', name: 'test/name', kind: 'manual', member_ids: images.map((p) => p.id) },
    { id: 'smart', name: 'smart', kind: 'smart', filters: { includeTags: ['grass'] } },
  ];
  const database = {
    loadProject: (id) => images.find((p) => p.id === id),
    listCollections: () => collections,
    loadLibraryCards: async () => images.filter((p) => !p.deleted_at),
  };
  const dialog = {
    showSaveDialog: vi.fn(async () => ({ filePath: path.join(output, 'export.zip') })),
    showOpenDialog: vi.fn(async () => ({ filePaths: [output] })),
  };
  const progress = vi.fn();
  const manager = createLibraryExport({ database, dialog, progress, ...options });
  return { root, source, output, images, database, dialog, progress, manager };
}
async function unzip(file) {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = [];
      zip.on('error', reject);
      zip.on('end', () => resolve(entries));
      zip.on('entry', (entry) =>
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on('error', reject);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            entries.push({
              name: entry.fileName,
              method: entry.compressionMethod,
              bytes: Buffer.concat(chunks),
            });
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    }),
  );
}

it.each(['zip', 'folder'])(
  'exports unchanged stealth metadata using %s and skips unavailable images',
  async (format) => {
    const f = await fixture();
    const estimate = await f.manager['library.export.estimate']({ collectionId: 'manual' });
    expect(estimate).toMatchObject({ ok: true, count: 2, name: 'testname' });
    const result = await f.manager['library.export']({ collectionId: 'manual', format });
    expect(result).toMatchObject({ ok: true, count: 2, skipped: 2, bytes: estimate.bytes });
    const entries =
      format === 'zip'
        ? await unzip(result.path)
        : await Promise.all(
            (await fs.readdir(result.path)).map(async (name) => ({
              name,
              bytes: await fs.readFile(path.join(result.path, name)),
            })),
          );
    expect(entries.map((v) => v.name).sort()).toEqual(['meadow-01-2.png', 'meadow-01.png']);
    const original = await fs.readFile(f.source);
    const metadata = await readNovelAIMetadata(f.source);
    expect(metadata.prompt_raw).toBe('synthetic meadow');
    for (const entry of entries) {
      expect(entry.bytes).toEqual(original);
      expect(await readNovelAIMetadata('export.png', entry.bytes)).toEqual(metadata);
      if (format === 'zip') expect(entry.method).toBe(0);
    }
    expect(f.progress.mock.calls.map(([data]) => data)).toEqual([
      { done: 1, total: 2 },
      { done: 2, total: 2 },
    ]);
  },
);

it('resolves smart rules and numbers shared custom names, preserving existing folder contents', async () => {
  const f = await fixture();
  expect(
    (await resolveExport(f.database, { collectionId: 'smart' })).items.map((p) => p.image.id),
  ).toEqual(['image-01']);
  f.images[1].name = f.images[0].name = '共同名';
  f.images[1].has_custom_name = true;
  expect(
    (await resolveExport(f.database, { ids: ['image-01', 'image-02', 'image-01'] })).items.map(
      (p) => p.fileName,
    ),
  ).toEqual(['共同名-01.png', '共同名-02.png']);
  await fs.mkdir(path.join(f.output, 'testname'));
  await fs.writeFile(path.join(f.output, 'testname', 'keep'), 'keep');
  const result = await f.manager['library.export']({ collectionId: 'manual', format: 'folder' });
  expect(path.basename(result.path)).toBe('testname 2');
  expect(await fs.readFile(path.join(f.output, 'testname', 'keep'), 'utf8')).toBe('keep');
});

it.each(['zip', 'folder'])(
  'cancels %s and cleans partial output without removing an existing destination',
  async (format) => {
    const f = await fixture();
    await fs.writeFile(path.join(f.output, 'export.zip'), 'previous');
    const manager = createLibraryExport({
      database: f.database,
      dialog: f.dialog,
      progress: () => manager['library.export.cancel'](),
    });
    expect(await manager['library.export']({ collectionId: 'manual', format })).toEqual({
      canceled: true,
    });
    expect(await fs.readdir(f.output)).toEqual(['export.zip']);
    expect(await fs.readFile(path.join(f.output, 'export.zip'), 'utf8')).toBe('previous');
  },
);

it.each(['zip', 'folder'])('writes nothing when disk is full for %s', async (format) => {
  const f = await fixture({ freeBytes: async () => 0 });
  expect(await f.manager['library.export']({ ids: ['image-01'], format })).toMatchObject({
    ok: false,
    error: expect.stringContaining('磁盘空间不够：需要'),
  });
  expect(await fs.readdir(f.output)).toEqual([]);
});

it('locks before opening the dialog, allows cancel, and permits a subsequent export', async () => {
  const f = await fixture();
  let release;
  f.dialog.showSaveDialog.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const running = f.manager['library.export']({ ids: ['image-01'], format: 'zip' });
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  await expect(
    f.manager['library.export']({ ids: ['image-01'], format: 'zip' }),
  ).rejects.toMatchObject({ code: 'busy' });
  f.manager['library.export.cancel']();
  release({ filePath: path.join(f.output, 'export.zip') });
  expect(await running).toEqual({ canceled: true });
  expect(await fs.readdir(f.output)).toEqual([]);
  expect(await f.manager['library.export']({ ids: ['image-01'], format: 'zip' })).toMatchObject({
    ok: true,
  });
});

it('validates input and blocks all export commands for agents', () => {
  for (const name of ['library.export', 'library.export.estimate', 'library.export.cancel']) {
    expect(() => validateCommand(name, {}, 'agent')).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
  }
  for (const input of [
    {},
    { ids: ['x'], collectionId: 'c' },
    { ids: [] },
    { ids: ['x'], format: 'other' },
  ]) {
    expect(() => validateCommand('library.export', { format: 'zip', ...input }, 'ui')).toThrow();
  }
  expect(exportSafeName('../CON:*')).toBe('..CON');
  expect(exportSafeName('CON')).toBe('NovelAI 图片');
  expect(exportSafeName('../')).toBe('NovelAI 图片');
});

it('uses original filenames for unnamed imports and the ID fallback when unavailable', async () => {
  const f = await fixture();
  Object.assign(f.images[0], {
    has_custom_name: false,
    name: 'automatic display name',
    original_filename: 'original.webp',
  });
  Object.assign(f.images[1], { has_custom_name: false, original_filename: '' });
  const plan = await resolveExport(f.database, { ids: ['image-01', 'image-02'] });
  expect(plan.items.map((item) => item.fileName)).toEqual(['original.png', 'image-02.png']);
});

it.each(['zip', 'folder'])(
  'cleans up a failed %s write and allows dialog cancellation',
  async (format) => {
    const f = await fixture();
    const select = format === 'zip' ? f.dialog.showSaveDialog : f.dialog.showOpenDialog;
    select.mockResolvedValueOnce({ canceled: true });
    expect(await f.manager['library.export']({ ids: ['image-01'], format })).toEqual({
      canceled: true,
    });
    select.mockImplementationOnce(async () => {
      await fs.unlink(f.source);
      return { filePath: path.join(f.output, 'export.zip'), filePaths: [f.output] };
    });
    expect(await f.manager['library.export']({ ids: ['image-01'], format })).toMatchObject({
      ok: false,
    });
    expect(await fs.readdir(f.output)).toEqual([]);
  },
);
