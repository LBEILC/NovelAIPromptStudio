import './fixtures/databaseTestBudget.js';
import { it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { openDatabase } from './database.js';
import { openPreferences } from './preferences.js';
import { openCommandSession } from './commands/session.js';
import { createWorkbenchTab } from '../src/lib/workbenchSession.js';
import { importImage } from './assets.js';
import { createBackupManager } from './backup.js';
import { storeBaseImage } from './baseImage.js';
import { storeInpaintMask } from './inpaint.js';

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-backup-test-'));
  const data = path.join(root, 'data'),
    assets = path.join(root, 'assets');
  await fs.mkdir(assets);
  const database = await openDatabase(data);
  const preferences = openPreferences(
    data,
    {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s),
      decryptString: (b) => b.toString(),
    },
    { defaultAssetsDirectory: assets },
  );
  const session = await openCommandSession(root, async () => null);
  let reloads = 0;
  const options = {
    dataDirectory: data,
    assetsDirectory: assets,
    database,
    preferences,
    session,
    version: '1.7.0',
    reload: () => reloads++,
  };
  const manager = createBackupManager(options);
  const file = path.join(root, 'test.npsbackup');
  const source = path.join(root, 'synthetic.png');
  await sharp({ create: { width: 12, height: 12, channels: 3, background: '#abcdef' } })
    .png()
    .toFile(source);
  const project = await importImage(source, assets);
  database.insertProject(project);
  const tab = createWorkbenchTab(project, {
    source: { type: 'library', projectId: project.id, path: project.image_path },
  });
  await session.save({ version: 2, tabs: [tab], activeTabId: tab.id });
  try {
    await run({
      root,
      data,
      assets,
      database,
      preferences,
      session,
      options,
      manager,
      file,
      project,
      reloads: () => reloads,
    });
  } finally {
    database.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}
async function entries(file) {
  const zip = await new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true }, (e, z) => (e ? reject(e) : resolve(z))),
  );
  const result = {};
  await new Promise((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', resolve);
    zip.on('entry', (entry) =>
      zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks = [];
        stream.on('error', reject);
        stream.on('data', (c) => chunks.push(c));
        stream.on('end', () => {
          result[entry.fileName] = Buffer.concat(chunks);
          zip.readEntry();
        });
      }),
    );
    zip.readEntry();
  });
  return result;
}

it('backs up managed base copies and operation snapshots with version restoration', () =>
  fixture(async ({ database, assets, manager, file, project }) => {
    const base = { ...(await storeBaseImage(project.image_path, assets)), strength: 0.7, noise: 0 };
    const snapshot = { ...project, references: { vibes: [], precise: [], base } };
    const root = database.versions.ensure('operation-backup', snapshot);
    const maskBytes = await fs.readFile(project.image_path);
    const maskId = await storeInpaintMask(maskBytes.toString('base64'), assets);
    const maskPath = path.join(assets, 'inpaint-masks', `${maskId}.png`);
    const operation = {
      kind: 'inpaint',
      strength: 0.7,
      sourceProjectId: project.id,
      maskId,
      rect: { x: 0, y: 0, width: 12, height: 12 },
      generated: { width: 1024, height: 1024, model: 'nai-diffusion-5-full-inpainting' },
      prompt: project,
    };
    const version = database.versions.append({
      workId: root.workId,
      parentId: root.id,
      project: snapshot,
      source: 'user',
      image: project,
      seed: 123,
      operation,
    });
    await manager.export(file, true);
    const original = await fs.readFile(base.path);
    await fs.unlink(base.path);
    await fs.unlink(maskPath);
    await manager.restore(file);
    const restored = database.versions.get(version.id);
    expect(restored.operation).toEqual(operation);
    expect(await fs.readFile(maskPath)).toEqual(maskBytes);
    expect(await fs.readFile(restored.project.references.base.path)).toEqual(original);
  }));

it('rolls back a failed replacement and cancels extraction before changing current data', () =>
  fixture(async ({ manager, options, preferences, database, file, project }) => {
    await manager.export(file, false);
    database.updateProjectName(project.id, 'Keep current');
    const restore = vi.spyOn(preferences, 'restoreBackup').mockImplementationOnce(() => {
      throw Error('synthetic write failure');
    });
    await expect(manager.restore(file)).rejects.toThrow('synthetic write failure');
    restore.mockRestore();
    expect(database.loadProject(project.id).name).toBe('Keep current');
    expect(manager.status().lastRestore).toBeNull();
    let canceled;
    canceled = createBackupManager({ ...options, progress: () => canceled.cancel() });
    await expect(canceled.restore(file)).rejects.toThrow();
    expect(database.loadProject(project.id).name).toBe('Keep current');
    expect(canceled.status().lastRestore).toBeNull();
  }));

it('rejects a structurally valid ZIP containing a corrupted database', () =>
  fixture(async ({ root, manager, file, database, project }) => {
    await manager.export(file, false);
    const content = await entries(file),
      corrupt = path.join(root, 'broken-database.npsbackup');
    const zip = new yazl.ZipFile();
    for (const [name, bytes] of Object.entries(content))
      zip.addBuffer(name === 'studio.sqlite' ? Buffer.from('broken sqlite') : bytes, name);
    zip.end();
    await pipeline(zip.outputStream, createWriteStream(corrupt));
    expect(await manager.inspect(corrupt)).toMatchObject({
      compatible: false,
      reason: '备份文件已损坏',
    });
    await expect(manager.restore(corrupt)).rejects.toThrow();
    expect(database.loadProject(project.id).name).toBe(project.name);
  }));

it('round trips database, workbench drafts and portable settings, then undoes the replacement', () =>
  fixture(async ({ database, preferences, session, manager, file, project, reloads }) => {
    preferences.saveAppearanceSettings({ themeMode: 'dark' });
    database.createCollection({ id: 'synthetic-collection', name: 'Synthetic', kind: 'manual' });
    database.updateCollectionProjects('synthetic-collection', [project.id]);
    await manager.export(file, false);
    database.updateProjectName(project.id, 'Changed');
    preferences.saveAppearanceSettings({ themeMode: 'light' });
    const changed = session.get();
    changed.tabs[0].displayName = 'Changed draft';
    await session.save(changed);
    const info = await manager.inspect(file);
    expect(info).toMatchObject({
      compatible: true,
      format: 1,
      includesLibrary: false,
      counts: { images: 1 },
    });
    expect(await manager.restore(file)).toEqual({ missingImages: 0 });
    expect(database.loadProject(project.id).name).toBe(project.name);
    expect(preferences.appearanceSettings().themeMode).toBe('dark');
    expect(session.get().tabs[0].displayName).not.toBe('Changed draft');
    expect(manager.status().lastRestore.fileName).toBe('test.npsbackup');
    await manager.undo();
    expect(database.loadProject(project.id).name).toBe('Changed');
    expect(preferences.appearanceSettings().themeMode).toBe('light');
    expect(session.get().tabs[0].displayName).toBe('Changed draft');
    expect(manager.status().lastRestore).toBeNull();
    expect(reloads()).toBe(2);
  }));

it('excludes credentials, local library/network settings and layout; retains this computer credentials on restore', () =>
  fixture(async ({ data, preferences, manager, file, assets }) => {
    const secrets = {
      novelAITokenEncrypted: 'SYNTHETIC_OFFICIAL_SECRET',
      relayKeyEncrypted: 'SYNTHETIC_RELAY_SECRET',
      aiApiKeyEncrypted: 'SYNTHETIC_AI_SECRET',
      chatGPTEncrypted: { official: 'SYNTHETIC_LOGIN_SECRET' },
      layout: 'SYNTHETIC_LAYOUT_SECRET',
      library: { assetsDirectory: assets },
      network: { mode: 'direct' },
    };
    await fs.writeFile(path.join(data, 'preferences.json'), JSON.stringify(secrets));
    await manager.export(file, false);
    const content = await entries(file),
      portable = JSON.parse(content['preferences.json']);
    expect(Object.keys(content).sort()).toEqual([
      'manifest.json',
      'preferences.json',
      'studio.sqlite',
      'workbench-session.json',
    ]);
    expect(portable).toEqual({});
    const bytes = Buffer.concat(Object.values(content)).toString();
    for (const secret of [
      'SYNTHETIC_OFFICIAL_SECRET',
      'SYNTHETIC_RELAY_SECRET',
      'SYNTHETIC_AI_SECRET',
      'SYNTHETIC_LOGIN_SECRET',
      'SYNTHETIC_LAYOUT_SECRET',
    ])
      expect(bytes).not.toContain(secret);
    await manager.restore(file);
    const restored = JSON.parse(await fs.readFile(path.join(data, 'preferences.json'), 'utf8'));
    expect(restored).toMatchObject(secrets);
    expect(preferences.networkSettings().mode).toBe('direct');
  }));

it('includes assets, only copies missing files and never overwrites an existing image', () =>
  fixture(async ({ assets, database, manager, file, project }) => {
    const original = await fs.readFile(project.image_path);
    await fs.mkdir(path.join(assets, 'materials'));
    await fs.writeFile(path.join(assets, 'materials', 'synthetic.txt'), 'material');
    await manager.export(file, true);
    await fs.rm(project.image_path);
    await fs.rm(path.join(assets, 'materials', 'synthetic.txt'));
    const extra = path.join(assets, 'extra.txt');
    await fs.writeFile(extra, 'keep');
    expect(await manager.restore(file)).toEqual({ missingImages: 0 });
    expect(await fs.readFile(project.image_path)).toEqual(original);
    expect(await fs.readFile(path.join(assets, 'materials', 'synthetic.txt'), 'utf8')).toBe(
      'material',
    );
    await fs.writeFile(project.image_path, 'already exists');
    expect(await manager.restore(file)).toEqual({ missingImages: 1 });
    expect(await fs.readFile(project.image_path, 'utf8')).toBe('already exists');
    expect(await fs.readFile(extra, 'utf8')).toBe('keep');
    expect(database.loadProject(project.id).missing).toBe(true);
    expect((await database.loadLibraryCards()).find((p) => p.id === project.id).missing).toBe(true);
  }));

it('relinks by hash after a move and marks absent originals as missing without a library payload', () =>
  fixture(async ({ assets, database, session, manager, file, project }) => {
    await manager.export(file, false);
    const moved = path.join(assets, 'moved.png');
    await fs.rename(project.image_path, moved);
    expect(await manager.restore(file)).toEqual({ missingImages: 0 });
    expect(database.loadProject(project.id).image_path).toBe(moved);
    expect(session.get().tabs[0].project.image_path).toBe(moved);
    await fs.rm(moved);
    expect(await manager.restore(file)).toEqual({ missingImages: 1 });
    expect(database.loadProject(project.id).missing).toBe(true);
  }));

it('rejects newer formats, corrupt payloads and busy restores without changing current data', () =>
  fixture(async ({ root, database, options, manager, file, project }) => {
    await manager.export(file, false);
    const content = await entries(file),
      manifest = JSON.parse(content['manifest.json']);
    const future = path.join(root, 'future.npsbackup');
    const zip = new yazl.ZipFile();
    for (const [name, buffer] of Object.entries(content))
      zip.addBuffer(
        name === 'manifest.json'
          ? Buffer.from(JSON.stringify({ ...manifest, format: 2, appVersion: '9.0.0' }))
          : buffer,
        name,
      );
    zip.end();
    await pipeline(zip.outputStream, createWriteStream(future));
    expect(await manager.inspect(future)).toMatchObject({
      compatible: false,
      reason: expect.stringContaining('更新的版本'),
    });
    await expect(manager.restore(future)).rejects.toThrow('更新的版本');
    const corrupt = path.join(root, 'corrupt.npsbackup');
    await fs.writeFile(corrupt, 'broken');
    expect((await manager.inspect(corrupt)).compatible).toBe(false);
    await expect(manager.restore(corrupt)).rejects.toThrow();
    const busy = createBackupManager({ ...options, busy: () => true });
    await expect(busy.restore(file)).rejects.toThrow('等生成和导入完成');
    expect(database.loadProject(project.id).name).toBe(project.name);
  }));

it('cancels exports with no leftover output or staging files and checks available space', () =>
  fixture(async ({ root, data, options, file }) => {
    let manager;
    manager = createBackupManager({ ...options, progress: () => manager.cancel() });
    await expect(manager.export(file, true)).rejects.toThrow();
    expect((await fs.readdir(root)).some((name) => name.startsWith('test.npsbackup'))).toBe(false);
    expect((await fs.readdir(data)).some((name) => name.startsWith('backup-stage-'))).toBe(false);
    const full = createBackupManager({ ...options, freeBytes: async () => 0 });
    await expect(full.export(file, false)).rejects.toThrow('磁盘空间不够');
  }));
