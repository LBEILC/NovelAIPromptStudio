import './fixtures/databaseTestBudget.js';
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './database.js';
import { openPreferences } from './preferences.js';
import { createBlankProject } from './workbench.js';
import { createTrashMaintenance, trashSize } from './trashMaintenance.js';
import { deleteLibraryImages } from './deleteLibraryImages.js';

async function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-trash-maintenance-'));
  const database = await openDatabase(directory);
  const preferences = openPreferences(
    directory,
    { isEncryptionAvailable: () => false },
    { defaultAssetsDirectory: directory },
  );
  const sql = new DatabaseSync(database.filePath);
  const image = (id, age, file = id) => {
    const project = {
      ...createBlankProject(),
      id,
      image_path: path.join(directory, `${file}.png`),
      thumbnail_path: path.join(directory, `${file}.webp`),
    };
    fs.writeFileSync(project.image_path, 'image');
    fs.writeFileSync(project.thumbnail_path, 'thumb');
    database.insertProject(project);
    database.trashProjects([id]);
    sql
      .prepare('UPDATE projects SET deleted_at=? WHERE id=?')
      .run(new Date(new Date(2026, 9, 26, 12).getTime() - age * 86400000).toISOString(), id);
    return database.loadProject(id);
  };
  try {
    await run({ database, preferences, directory, image });
  } finally {
    sql.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
it('defaults off, sweeps expired items at startup and once each local day, preserving shared files', () =>
  fixture(async ({ database, preferences, directory, image }) => {
    const old = image('old', 31),
      recent = image('recent', 29),
      boundary = image('boundary', 30),
      retained = image('retained', 35);
    database.versions.ensure('synthetic-retaining-work', retained);
    let date = new Date(2026, 9, 26, 12),
      busy = false;
    const maintenance = createTrashMaintenance({
      services: { database, preferences, busy: () => busy },
      now: () => date,
    });
    try {
      expect(preferences.librarySettings().trashAutoCleanup).toBe(false);
      await maintenance.start();
      expect(database.loadProject(old.id)).toBeDefined();
      expect(trashSize(database, directory)).toEqual({ bytes: 30, count: 4, sizeKnown: true });
      preferences.saveLibrarySettings({ trashAutoCleanup: true });
      busy = true;
      await maintenance.run();
      expect(database.loadProject(old.id)).toBeDefined();
      busy = false;
      await maintenance.run();
      expect(database.loadProject(old.id)).toBeNull();
      expect(fs.existsSync(old.image_path)).toBe(false);
      expect(database.loadProject(retained.id)).toBeNull();
      expect(fs.existsSync(retained.image_path)).toBe(true);
      expect(database.loadProject(recent.id)).toBeDefined();
      expect(database.loadProject(boundary.id)).toBeDefined();
      date = new Date(2026, 9, 26, 13);
      await maintenance.run();
      expect(database.loadProject(boundary.id)).toBeDefined();
      date = new Date(2026, 9, 27, 12);
      await maintenance.run();
      expect(database.loadProject(boundary.id)).toBeNull();
      expect(database.loadProject(recent.id)).toBeDefined();
      preferences.saveLibrarySettings({ trashAutoCleanup: false });
      date = new Date(2026, 10, 1, 12);
      await maintenance.run();
      expect(database.loadProject(recent.id)).toBeDefined();
    } finally {
      await maintenance.close();
    }
  }));
it('counts a shared trash file once and matches the actual bytes freed by permanent deletion', () =>
  fixture(async ({ database, directory, image }) => {
    image('a', 40, 'shared');
    image('b', 40, 'shared');
    const size = trashSize(database, directory);
    expect(size).toEqual({ bytes: 10, count: 2, sizeKnown: true });
    const result = deleteLibraryImages(
      database,
      directory,
      database.loadTrashSummary().map((p) => p.id),
    );
    expect(result.results.success).toHaveLength(2);
    expect(fs.existsSync(path.join(directory, 'shared.png'))).toBe(false);
    expect(trashSize(database, directory)).toEqual({ bytes: 0, count: 0, sizeKnown: true });
  }));
it('changing cleanup preserves custom storage and moving storage preserves cleanup', () =>
  fixture(async ({ preferences, directory }) => {
    const custom = path.join(directory, 'custom');
    preferences.saveLibrarySettings({ assetsDirectory: custom });
    preferences.saveLibrarySettings({ trashAutoCleanup: true });
    expect(preferences.librarySettings()).toMatchObject({
      assetsDirectory: custom,
      trashAutoCleanup: true,
    });
    preferences.saveLibrarySettings({ assetsDirectory: directory });
    expect(preferences.librarySettings()).toMatchObject({
      assetsDirectory: directory,
      trashAutoCleanup: true,
    });
  }));
