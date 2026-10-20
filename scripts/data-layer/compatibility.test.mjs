import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { expect, it } from 'vitest';
import { RETIRED_TABLES } from '../../electron/versions.js';
import { openDatabase } from '../../electron/database.js';
import { project, seed } from './fixture.mjs';

it('keeps the synthetic metadata distribution and tag count at the baseline sizes', () => {
  const samples = Array.from({ length: 100 }, (_, index) => project(index));
  const extra = samples.map((item) => Buffer.byteLength(item.metadata.extra_json));
  const structure = samples.map((item) => Buffer.byteLength(JSON.stringify(item.prompt_structure)));
  expect(samples.every((item) => item.tags.length === 59)).toBe(true);
  expect(
    samples.filter((item) => item.tags.some((tag) => tag.tag === 'benchmark_unique')),
  ).toHaveLength(1);
  expect(samples.filter((item) => item.tags.some((tag) => tag.tag === '1girl'))).toHaveLength(80);
  expect(Math.max(...extra)).toBe(271 * 1024);
  expect(Math.max(...structure)).toBe(41 * 1024);
  expect(Math.abs(extra.reduce((a, b) => a + b) / 100 - 62 * 1024)).toBeLessThan(1);
  expect(Math.abs(structure.reduce((a, b) => a + b) / 100 - 21 * 1024)).toBeLessThan(1);
});

// Still exercises durable production startup, inserts and reopen after shrinking
// only synthetic padding/cache volume; allow shared CI disk latency (was 9.9s).
it(
  'seeds through production, migrates the 21-table legacy schema and preserves active rows and orphans, and reopens a single file',
  { timeout: 20000 },
  async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-fixture-test-'));
    let api;
    try {
      const snapshot = await seed(directory, 3, undefined, { compact: true });
      expect(Object.keys(snapshot)).toHaveLength(21);
      const before = new DatabaseSync(path.join(directory, 'studio.sqlite'));
      try {
        for (const [table, rows] of Object.entries(snapshot)) {
          expect(rows.length, table).toBeGreaterThan(0);
          expect(before.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(), table).toEqual(
            rows,
          );
        }
      } finally {
        before.close();
      }
      api = await openDatabase(directory);
      expect(
        api
          .loadLibrary()
          .map((item) => item.id)
          .sort(),
      ).toEqual(['image-0', 'image-1', 'image-2']);
      api.close();
      const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'));
      try {
        expect(raw.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok');
        expect(
          raw
            .prepare('PRAGMA foreign_key_check')
            .all()
            .map((row) => row.table),
        ).toEqual(['generation_metadata', 'generation_metadata', 'generation_metadata']);
        // Opening repairs cover fingerprints and retires only the named legacy tables.
        for (const [table, rows] of Object.entries(snapshot)) {
          if (RETIRED_TABLES.includes(table)) {
            expect(
              raw.prepare('SELECT name FROM sqlite_master WHERE name=?').get(table),
            ).toBeUndefined();
            continue;
          }
          if (table === 'prompt_group_covers') {
            expect(raw.prepare('SELECT * FROM prompt_group_covers').all()).toEqual([]);
            continue;
          }
          if (table === 'app_meta') {
            expect(
              raw
                .prepare('SELECT * FROM app_meta ORDER BY rowid')
                .all()
                .filter((row) => row.key !== 'generation_versions_v1'),
            ).toEqual(
              rows.filter(
                (row) =>
                  !row.key.startsWith('prompt_fingerprints_dirty:') &&
                  !row.key.startsWith('library_cards_dirty:'),
              ),
            );
            continue;
          }
          expect(raw.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(), table).toEqual(rows);
        }
      } finally {
        raw.close();
      }
      expect(fs.existsSync(path.join(directory, 'studio.sqlite-wal'))).toBe(false);
    } finally {
      api?.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);

it('supports native rollback, prepared statements, FTS5 and online backup', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-features-test-'));
  const db = new DatabaseSync(path.join(directory, 'features.sqlite'));
  try {
    db.exec('CREATE TABLE sample(id INTEGER PRIMARY KEY,value TEXT); BEGIN');
    db.prepare('INSERT INTO sample VALUES (?,?)').run(1, 'before');
    db.exec('ROLLBACK');
    expect(db.prepare('SELECT count(*) n FROM sample').get().n).toBe(0);
    db.exec(
      "INSERT INTO sample VALUES(2,'after'); CREATE VIRTUAL TABLE search USING fts5(content); INSERT INTO search VALUES('sqlite research')",
    );
    expect(
      db.prepare("SELECT content FROM search WHERE search MATCH 'research'").get().content,
    ).toBe('sqlite research');
    const destination = path.join(directory, 'backup.sqlite');
    await backup(db, destination);
    const restored = new DatabaseSync(destination);
    try {
      expect(restored.prepare('SELECT * FROM sample').all()).toEqual([{ id: 2, value: 'after' }]);
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
