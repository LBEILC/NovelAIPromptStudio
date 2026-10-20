import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RETIRED_TABLES, migrateGenerationVersions, createVersionStore } from './versions.js';

function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-versions-'));
  const file = path.join(directory, 'studio.sqlite');
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: false });
  try {
    return run(db, file);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
describe('version migration', () => {
  it('backs up all retired rows, removes only named tables, and runs once', () =>
    fixture((db, file) => {
      // Commit the synthetic legacy fixture before testing the on-disk backup.
      db.exec('BEGIN');
      for (const table of RETIRED_TABLES)
        db.exec(`CREATE TABLE ${table}(value TEXT); INSERT INTO ${table} VALUES ('synthetic')`);
      db.exec(
        "CREATE TABLE unrelated (id INTEGER, value TEXT); INSERT INTO unrelated VALUES (1,'keep'),(2,'unchanged')",
      );
      db.exec('COMMIT');
      const before = db.prepare('SELECT * FROM unrelated').all();
      expect(migrateGenerationVersions(db, file)).toBe(true);
      const names = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name);
      for (const table of RETIRED_TABLES) expect(names).not.toContain(table);
      expect(db.prepare('SELECT * FROM unrelated').all()).toEqual(before);
      const backup = new DatabaseSync(
        path.join(path.dirname(file), 'studio.pre-generation-versions.sqlite'),
        { readOnly: true },
      );
      try {
        for (const table of RETIRED_TABLES)
          expect(backup.prepare(`SELECT value FROM ${table}`).get().value).toBe('synthetic');
      } finally {
        backup.close();
      }
      expect(
        migrateGenerationVersions(db, file, {
          copy: () => {
            throw new Error('must not copy twice');
          },
        }),
      ).toBe(false);
    }));
  it('does not drop anything when backup fails', () =>
    fixture((db, file) => {
      for (const table of RETIRED_TABLES) db.exec(`CREATE TABLE ${table}(value TEXT)`);
      expect(() =>
        migrateGenerationVersions(db, file, {
          copy: () => {
            throw new Error('disk full');
          },
        }),
      ).toThrow('disk full');
      for (const table of RETIRED_TABLES)
        expect(db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(table)).toBeTruthy();
    }));
});
describe('version persistence', () => {
  it('reuses seed-only versions, records ordering, branches, names and trashed images', () =>
    fixture((db, file) => {
      migrateGenerationVersions(db, file);
      db.exec(
        "CREATE TABLE projects(id TEXT PRIMARY KEY, deleted_at TEXT); INSERT INTO projects VALUES ('image','')",
      );
      const store = createVersionStore(db);
      const p = {
        metadata: {
          prompt_raw: 'rain, cloud',
          negative_prompt: '',
          width: 832,
          height: 1216,
          seed: '1',
        },
        prompt_structure: { characters: [] },
      };
      const root = store.ensure('work', p);
      const one = store.append({
        workId: 'work',
        parentId: root.id,
        project: { ...p, metadata: { ...p.metadata, seed: '2' } },
        source: 'user',
        image: { id: 'image' },
        seed: 2,
      });
      expect(one.id).toBe(root.id);
      const changed = { ...p, metadata: { ...p.metadata, prompt_raw: 'cloud, rain' } };
      const next = store.append({
        workId: 'work',
        parentId: root.id,
        project: changed,
        source: 'user',
        image: { id: 'image' },
        seed: 3,
      });
      expect(next.number).toBe(2);
      expect(next.branchName).toBe('主线');
      const branch = store.append({
        workId: 'work',
        parentId: root.id,
        project: changed,
        source: 'agent',
        image: { id: 'image' },
        seed: 4,
      });
      expect(branch.number).toBe(3);
      expect(branch.branchName).toBe('分支 1');
      store.rename(branch.branchId, 'Another');
      expect(store.get(branch.id).branchName).toBe('Another');
      store.rename(branch.branchId, '');
      expect(store.get(branch.id).branchName).toBe('分支 1');
      db.exec("UPDATE projects SET deleted_at='now'");
      expect(store.get(next.id).images[0].deleted).toBe(true);
      expect(store.list('work')).toHaveLength(3);
      store.ensure('new-work', changed, { workId: 'work', versionId: next.id, projectId: 'image' });
      expect(store.work('new-work').source.versionId).toBe(next.id);
    }));
});

it('matches branch numbering for the approved 21-version prototype tree', () =>
  fixture((db, file) => {
    migrateGenerationVersions(db, file);
    // This case checks tree numbering, not per-version disk durability.
    // Batch writes while retaining the store's nested savepoints and every assertion.
    db.exec('BEGIN');
    db.exec(
      "CREATE TABLE projects(id TEXT PRIMARY KEY, deleted_at TEXT); INSERT INTO projects VALUES ('synthetic-image','')",
    );
    const store = createVersionStore(db),
      versions = [];
    const parents = [null, 1, 2, 3, 2, 5, 6, 4, 8, 1, 10, 9, 12, 11, 13, 8, 8, 17, 8, 8, 20];
    const expected = [0, 0, 0, 0, 1, 1, 1, 0, 0, 2, 2, 0, 0, 2, 0, 3, 4, 4, 5, 6, 6];
    for (let i = 0; i < parents.length; i++) {
      const project = {
        metadata: { prompt_raw: `synthetic_${i}`, negative_prompt: '', width: 832, height: 1216 },
        prompt_structure: { characters: [] },
      };
      const v =
        i === 0
          ? store.ensure('prototype-tree', project)
          : store.append({
              workId: 'prototype-tree',
              parentId: versions[parents[i] - 1].id,
              project,
              source: 'user',
              image: { id: 'synthetic-image' },
              seed: i,
            });
      versions.push(v);
      expect(v.number).toBe(i + 1);
      expect(v.branchName).toBe(expected[i] ? `分支 ${expected[i]}` : '主线');
    }
    db.exec('COMMIT');
  }));
