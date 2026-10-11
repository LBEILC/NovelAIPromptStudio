import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../electron/database.js';
import { openNative, researchDatabase } from './adapters.mjs';
import { project, seed } from './fixture.mjs';

const directories = [];
const temporary = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-sqlite-compat-'));
  directories.push(directory);
  return directory;
};
afterEach(() =>
  directories
    .splice(0)
    .forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })),
);

it('keeps the synthetic metadata distribution and tag count at the requested sizes', () => {
  const samples = Array.from({ length: 100 }, (_, index) => project(index));
  const extra = samples.map((item) => Buffer.byteLength(item.metadata.extra_json));
  const structure = samples.map((item) => Buffer.byteLength(JSON.stringify(item.prompt_structure)));
  expect(samples.every((item) => item.tags.length === 59)).toBe(true);
  expect(Math.max(...extra)).toBe(271 * 1024);
  expect(Math.max(...structure)).toBe(41 * 1024);
  expect(Math.abs(extra.reduce((a, b) => a + b) / 100 - 62 * 1024)).toBeLessThan(1);
  expect(Math.abs(structure.reduce((a, b) => a + b) / 100 - 21 * 1024)).toBeLessThan(1);
});

describe.each(['node:sqlite', 'better-sqlite3'])('%s compatibility', (kind) => {
  it('closes and checkpoints a native fallback fixture before the baseline reads it', async () => {
    const directory = temporary();
    await seed(directory, 3, () => {}, kind);
    expect(fs.existsSync(path.join(directory, 'studio.sqlite-wal'))).toBe(false);
    const original = await openDatabase(directory);
    expect(
      original
        .loadLibrary()
        .map((item) => item.id)
        .sort(),
    ).toEqual(['image-0', 'image-1', 'image-2']);
  });
  it('reads every current and retired table directly, preserving orphan metadata after WAL writes', async () => {
    const directory = temporary();
    const expected = await seed(directory, 3);
    expect(Object.keys(expected)).toHaveLength(21);
    const file = path.join(directory, 'studio.sqlite');
    const db = await openNative(kind, file);
    try {
      expect(Object.values(db.prepare('PRAGMA integrity_check').get())).toEqual(['ok']);
      expect(
        db
          .prepare('PRAGMA foreign_key_check')
          .all()
          .map((row) => row.table),
      ).toEqual(['generation_metadata', 'generation_metadata', 'generation_metadata']);
      for (const [table, rows] of Object.entries(expected)) {
        expect(rows.length, table).toBeGreaterThan(0);
        expect(db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(), table).toEqual(rows);
      }
      expect(
        db
          .prepare("SELECT COUNT(*) n FROM generation_metadata WHERE project_id LIKE 'orphan-%'")
          .get().n,
      ).toBe(3);
      db.exec("UPDATE app_meta SET value=value WHERE key='runtime_schema'");
      expect(fs.existsSync(`${file}-wal`)).toBe(true);
      expect(fs.existsSync(`${file}-shm`)).toBe(true);
    } finally {
      db.close();
    }
    const reopened = await openNative(kind, file);
    try {
      for (const [table, rows] of Object.entries(expected))
        expect(reopened.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()).toEqual(rows);
    } finally {
      reopened.close();
    }
  });

  it('matches production loadLibrary and import/translation behavior for measured operations', async () => {
    const directory = temporary();
    const current = await openDatabase(directory);
    current.insertProject(project(0));
    const baseline = current.loadLibrary();
    const candidateDirectory = temporary();
    fs.copyFileSync(current.filePath, path.join(candidateDirectory, 'studio.sqlite'));
    const db = await openNative(kind, path.join(candidateDirectory, 'studio.sqlite'));
    try {
      const candidate = await researchDatabase(candidateDirectory, { native: db });
      expect(candidate.loadLibrary()).toEqual(baseline);
      for (const api of [current, candidate]) {
        api.updateTagDictionary('synthetic_0', { translation: '测试' });
        api.insertProject(project(1));
      }
      expect(candidate.loadLibrary()).toEqual(current.loadLibrary());
    } finally {
      db.close();
    }
  });

  it('supports transactions, prepared statements, FTS5 and online backup', async () => {
    const directory = temporary();
    const db = await openNative(kind, path.join(directory, 'features.sqlite'));
    try {
      db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT); BEGIN');
      db.prepare('INSERT INTO sample VALUES (?, ?)').run(1, 'before');
      db.exec('ROLLBACK');
      expect(db.prepare('SELECT COUNT(*) n FROM sample').get().n).toBe(0);
      db.exec(
        "BEGIN; INSERT INTO sample VALUES (2, 'after'); COMMIT; CREATE VIRTUAL TABLE search USING fts5(content); INSERT INTO search VALUES ('sqlite research')",
      );
      expect(
        db.prepare("SELECT content FROM search WHERE search MATCH 'research'").get().content,
      ).toBe('sqlite research');
      const backup = path.join(directory, 'backup.sqlite');
      if (kind === 'node:sqlite') await (await import('node:sqlite')).backup(db, backup);
      else await db.backup(backup);
      const restored = await openNative(kind, backup);
      try {
        expect(restored.prepare('SELECT * FROM sample').all()).toEqual([{ id: 2, value: 'after' }]);
      } finally {
        restored.close();
      }
    } finally {
      db.close();
    }
  });
});
