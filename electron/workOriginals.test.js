import './fixtures/databaseTestBudget.js';
import { it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './database.js';
import { createBlankProject } from './workbench.js';
import { migrateWorkOriginals, preserveWorkOriginal } from './workOriginals.js';
vi.mock('electron', () => ({ clipboard: {} }));
import { cleanupWorkbenchTemporaryImages } from './clipboardImages.js';

async function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-originals-'));
  const db = await openDatabase(directory);
  const raw = new DatabaseSync(db.filePath);
  try {
    await run({ directory, db, raw });
  } finally {
    raw.close();
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
function project(directory, id, seed = '123') {
  const p = createBlankProject({ width: 64, height: 64 });
  delete p.blank;
  p.id = id;
  p.image_path = path.join(directory, `${id}.png`);
  p.thumbnail_path = p.image_path;
  p.metadata = {
    ...p.metadata,
    prompt_raw: 'synthetic origin',
    negative_prompt: 'synthetic negative',
    model: 'synthetic model',
    seed,
  };
  return p;
}

it('preserves original bytes and protects legacy work references during temporary cleanup', () =>
  fixture(({ directory, db }) => {
    const temporary = path.join(directory, 'workbench-temp');
    fs.mkdirSync(temporary);
    const p = project(temporary, 'clipboard');
    fs.writeFileSync(p.image_path, 'synthetic image bytes');
    const durable = preserveWorkOriginal(p, directory);
    db.versions.ensure('durable', durable);
    db.versions.ensure('legacy', p);
    expect(cleanupWorkbenchTemporaryImages(temporary, db.versions.referencedPaths())).toEqual([]);
    expect(fs.readFileSync(durable.image_path, 'utf8')).toBe('synthetic image bytes');
    cleanupWorkbenchTemporaryImages(temporary, []);
    expect(fs.existsSync(durable.image_path)).toBe(true);
  }));

it('repairs exactly one matching library original, backs up first, and leaves zero or ambiguous matches untouched', () =>
  fixture(({ directory, db, raw }) => {
    for (const [id, seed] of [
      ['unique', '1'],
      ['absent', '2'],
      ['ambiguous', '3'],
    ])
      db.versions.ensure(id, project(path.join(directory, 'workbench-temp'), id, seed));
    for (const [id, seed] of [
      ['match', '1'],
      ['duplicate-a', '3'],
      ['duplicate-b', '3'],
    ]) {
      const p = project(directory, id, seed);
      fs.writeFileSync(p.image_path, 'synthetic image');
      db.insertProject(p);
    }
    raw.prepare('DELETE FROM app_meta WHERE key=?').run('work_originals_v1');
    const before = fs.readdirSync(directory);
    expect(migrateWorkOriginals(raw, db.filePath, db.versions, db.loadProject)).toEqual({
      repaired: 1,
      skipped: 2,
    });
    expect(db.versions.work('unique').origin.id).toBe('match');
    expect(db.versions.list('unique')[0].project.id).toBe('match');
    expect(db.versions.work('absent').origin.id).toBe('absent');
    expect(db.versions.work('ambiguous').origin.id).toBe('ambiguous');
    const backupFile = fs
      .readdirSync(directory)
      .find((file) => !before.includes(file) && file.endsWith('.sqlite'));
    const backup = new DatabaseSync(path.join(directory, backupFile), { readOnly: true });
    try {
      expect(
        JSON.parse(
          backup.prepare('SELECT origin_json FROM works WHERE id=?').get('unique').origin_json,
        ).id,
      ).toBe('unique');
    } finally {
      backup.close();
    }
    expect(
      migrateWorkOriginals(raw, db.filePath, db.versions, db.loadProject, {
        copy: () => {
          throw Error('must not back up twice');
        },
      }).alreadyApplied,
    ).toBe(true);
  }));

it('does not mark or modify migration data if backup fails', () =>
  fixture(({ directory, db, raw }) => {
    db.versions.ensure('missing', project(path.join(directory, 'workbench-temp'), 'missing'));
    raw.prepare('DELETE FROM app_meta WHERE key=?').run('work_originals_v1');
    expect(() =>
      migrateWorkOriginals(raw, db.filePath, db.versions, db.loadProject, {
        copy: () => {
          throw Error('disk full');
        },
      }),
    ).toThrow('disk full');
    expect(
      raw.prepare('SELECT 1 FROM app_meta WHERE key=?').get('work_originals_v1'),
    ).toBeUndefined();
    expect(db.versions.work('missing').origin.id).toBe('missing');
  }));
