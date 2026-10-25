import './fixtures/databaseTestBudget.js';
import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openDatabase } from './database.js';
import { createFolderImporter, nameFolderCollections, hiddenDirectory } from './folderImport.js';
import { importImage } from './assets.js';

it.runIf(process.platform === 'win32')(
  'does not descend into Windows hidden-attribute directories',
  () =>
    fixture(async ({ source, image, importer }) => {
      await image('attribute-hidden/a.png');
      await promisify(execFile)('attrib', ['+H', path.join(source, 'attribute-hidden')], {
        windowsHide: true,
      });
      expect(hiddenDirectory(path.join(source, 'attribute-hidden'))).toBe(true);
      expect((await importer.scan(source)).folders).toEqual([]);
    }),
);

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-folder-test-'));
  const source = path.join(root, 'source'),
    assets = path.join(root, 'assets');
  await fs.mkdir(source);
  await fs.mkdir(assets);
  const database = await openDatabase(path.join(root, 'data'));
  const image = async (relative, color = '#112233') => {
    const file = path.join(source, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await sharp({ create: { width: 8, height: 8, channels: 3, background: color } })
      .png()
      .toFile(file);
    return file;
  };
  try {
    await run({
      root,
      source,
      assets,
      database,
      image,
      importer: createFolderImporter({ database, assetsDirectory: assets }),
    });
  } finally {
    database.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

it('names root, repeated folders and manual/smart collisions deterministically', () => {
  const root = path.resolve('synthetic-root');
  const folders = ['', 'a/leaf', 'b/leaf', 'c/a/leaf'].map((relativePath, i) => ({
    id: String(i),
    relativePath,
    name: path.basename(path.join(root, relativePath)),
    imageCount: 1,
  }));
  nameFolderCollections(
    folders,
    [
      { id: 'manual', name: 'synthetic-root', kind: 'manual' },
      { id: 'smart', name: 'leaf（b）', kind: 'smart' },
    ],
    root,
  );
  expect(folders[0].collection.existingId).toBe('manual');
  expect(new Set(folders.map((f) => f.collection.name)).size).toBe(4);
  expect(folders[1].collection.name).toContain('synthetic-root');
  expect(folders[2].collection.name).not.toBe('leaf（b）');
});

it('classifies duplicates, restores trash and preserves natural member order and sources', () =>
  fixture(async ({ source, assets, database, image, importer }) => {
    const first = await image('group/2.png');
    const second = await image('group/10.png', '#334455');
    await image('other/2.png');
    const trashed = await importImage(first, assets);
    database.insertProject(trashed);
    database.updateProjects([trashed.id], { deleted: true });
    const existing = await importImage(second, assets);
    database.insertProject(existing);
    await image('root.png', '#556677');
    const progress = [];
    const scan = await importer.scan(source, (e) => progress.push(e));
    expect(progress[0]).toMatchObject({
      sessionId: scan.sessionId,
      phase: 'scanning',
      processed: 0,
    });
    expect(scan.folders.map((f) => f.relativePath)).toEqual(['', 'group', 'other']);
    expect(scan.folders[1]).toMatchObject({
      existingCount: 1,
      trashedCount: 1,
      noMetadataCount: 2,
    });
    expect(scan.folders[2].repeatCount).toBe(1);
    const result = await importer.commit({
      sessionId: scan.sessionId,
      folderIds: scan.folders.map((f) => f.id),
      skipNoMetadata: false,
    });
    expect(result).toMatchObject({
      imported: 1,
      existing: 2,
      restored: 1,
      collectionsCreated: 3,
      errors: [],
    });
    expect(database.listCollections().find((c) => c.name === 'group').member_ids).toEqual([
      trashed.id,
      existing.id,
    ]);
    expect(database.loadProject(trashed.id).deleted_at).toBe('');
    expect(await fs.readFile(first)).toEqual(await fs.readFile(trashed.image_path));
  }));

it('skips missing metadata, hidden folders and links, counts ZIP without opening it', () =>
  fixture(async ({ source, image, importer }) => {
    await image('visible/a.png');
    await image('.hidden/a.png');
    await fs.writeFile(path.join(source, 'skip.zip'), 'not an archive');
    await fs.symlink(path.join(source, 'visible'), path.join(source, 'linked'), 'junction');
    const scan = await importer.scan(source);
    expect(scan.zipCount).toBe(1);
    expect(scan.folders.map((f) => f.relativePath)).toEqual(['', 'visible']);
    const result = await importer.commit({
      sessionId: scan.sessionId,
      folderIds: scan.folders.map((f) => f.id),
      skipNoMetadata: true,
    });
    expect(result).toMatchObject({ imported: 0, skipped: 1, collectionsCreated: 0 });
    expect(hiddenDirectory(path.join(source, '.hidden'))).toBe(true);
  }));

it('cancellation keeps imported image and collection membership, and rescans merge', () =>
  fixture(async ({ source, image, importer, database }) => {
    await image('2.png');
    await image('10.png', '#abcdef');
    let scan = await importer.scan(source);
    const result = await importer.commit(
      {
        sessionId: scan.sessionId,
        folderIds: scan.folders.map((f) => f.id),
        skipNoMetadata: false,
      },
      (e) => {
        if (e.phase === 'importing' && e.processed === 1) importer.cancel(scan.sessionId);
      },
    );
    expect(result).toMatchObject({ imported: 1, canceled: true, collectionsCreated: 1 });
    expect(database.listCollections().find((c) => c.name === 'source').member_ids).toHaveLength(1);
    scan = await importer.scan(source);
    expect(scan.folders[0].collection.existingId).toBe(
      database.listCollections().find((c) => c.name === 'source').id,
    );
    database.updateCollection(database.listCollections().find((c) => c.name === 'source').id, {
      name: 'renamed',
    });
    const next = await importer.commit({
      sessionId: scan.sessionId,
      folderIds: [scan.folders[0].id],
      skipNoMetadata: false,
    });
    expect(next).toMatchObject({ imported: 1, existing: 1, collectionsCreated: 1 });
  }));

it('checks space and file changes before import and supports canceling scan immediately', () =>
  fixture(async ({ source, assets, database, image, importer }) => {
    const file = await image('1.png');
    const scan = await importer.scan(source);
    await fs.appendFile(file, 'changed');
    expect(
      (
        await importer.commit({
          sessionId: scan.sessionId,
          folderIds: [scan.folders[0].id],
          skipNoMetadata: false,
        })
      ).errors,
    ).toHaveLength(1);
    await expect(importer.scan(source, (e) => importer.cancel(e.sessionId))).rejects.toThrow(
      '扫描已取消',
    );
    const full = createFolderImporter({
      database,
      assetsDirectory: assets,
      freeBytes: async () => 0,
    });
    const preview = await full.scan(source);
    await expect(
      full.commit({
        sessionId: preview.sessionId,
        folderIds: [preview.folders[0].id],
        skipNoMetadata: false,
      }),
    ).rejects.toThrow('磁盘空间不够');
  }));
