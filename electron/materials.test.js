import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrateMaterials, createMaterialStore } from './materials.js';

it('backs up before migrating, preserves existing rows, persists materials and never overwrites a backup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-material-migration-'));
  const file = path.join(root, 'studio.sqlite');
  let db = new DatabaseSync(file);
  try {
    db.exec(
      "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE projects(id TEXT);INSERT INTO projects VALUES('synthetic')",
    );
    const before = fs.readFileSync(file);
    expect(() =>
      migrateMaterials(db, file, {
        copy: () => {
          throw Error('synthetic copy failure');
        },
      }),
    ).toThrow('synthetic copy failure');
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name='materials'").get(),
    ).toBeUndefined();
    expect(fs.readFileSync(file)).toEqual(before);
    migrateMaterials(db, file);
    const backup = path.join(root, 'studio.pre-materials.sqlite');
    expect(fs.readFileSync(backup)).toEqual(before);
    expect(db.prepare('SELECT id FROM projects').get().id).toBe('synthetic');
    const material = createMaterialStore(db).save({
      kind: 'block',
      name: 'Synthetic',
      blocks: [],
      examples: [],
    });
    db.close();
    db = new DatabaseSync(file);
    migrateMaterials(db, file);
    expect(createMaterialStore(db).get(material.id).name).toBe('Synthetic');
    expect(fs.readFileSync(backup)).toEqual(before);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
