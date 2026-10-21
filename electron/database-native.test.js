import fs from 'node:fs';
import './fixtures/databaseTestBudget.js';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RETIRED_TABLES } from './versions.js';
import { openDatabase } from './database.js';

const fixture = new URL('./fixtures/pre-native.sqlite', import.meta.url);
const expected = JSON.parse(
  fs.readFileSync(new URL('./fixtures/pre-native.expected.json', import.meta.url)),
);
const directories = [];
const connections = [];
function temporary(copy = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-native-'));
  directories.push(directory);
  if (copy) fs.copyFileSync(fixture, path.join(directory, 'studio.sqlite'));
  return directory;
}
async function open(directory) {
  const database = await openDatabase(directory);
  connections.push(database);
  return database;
}
function inspect(directory, operation) {
  const db = new DatabaseSync(path.join(directory, 'studio.sqlite'));
  try {
    return operation(db);
  } finally {
    db.close();
  }
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const database of connections.splice(0)) database.close();
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('native engine upgrade', () => {
  it('uses durable rollback-journal settings and closes a native connection only once', async () => {
    const directory = temporary();
    const execute = DatabaseSync.prototype.exec;
    let settings;
    vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (sql) {
      const result = execute.call(this, sql);
      if (sql.includes('PRAGMA synchronous=EXTRA')) {
        settings = {
          journal: this.prepare('PRAGMA journal_mode').get().journal_mode,
          synchronous: this.prepare('PRAGMA synchronous').get().synchronous,
          fullfsync: this.prepare('PRAGMA fullfsync').get().fullfsync,
        };
      }
      return result;
    });
    const close = vi.spyOn(DatabaseSync.prototype, 'close');
    const database = await open(directory);
    expect(settings).toEqual({ journal: 'delete', synchronous: 3, fullfsync: 1 });
    database.close();
    database.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes and rolls back when startup repair fails', { timeout: 20000 }, async () => {
    const directory = temporary(true);
    inspect(directory, (raw) =>
      raw.exec(
        "CREATE TRIGGER fail_startup BEFORE INSERT ON app_meta BEGIN SELECT RAISE(ABORT, 'startup failure'); END",
      ),
    );
    const close = vi.spyOn(DatabaseSync.prototype, 'close');
    await expect(open(directory)).rejects.toThrow('startup failure');
    expect(close).toHaveBeenCalledTimes(1);
    inspect(directory, (raw) =>
      expect(raw.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok'),
    );
  });

  // The fixed legacy bytes, two real backups and reopen are the assertion:
  // do not replace them with a smaller/new database (shared Windows CI: 6.2s).
  it(
    'opens the fixed old file retiring only specified tables and preserving active rows and library payloads',
    { timeout: 20000 },
    async () => {
      const directory = temporary(true);
      const before = fs.readFileSync(fixture);
      const database = await open(directory);
      expect(fs.readFileSync(database.engineBackupPath)).toEqual(before);
      expect(fs.readFileSync(database.backupPath)).toEqual(before);
      const withNaming = (records) =>
        records.map((record) => ({
          ...record,
          original_filename: record.name + (path.extname(record.image_path) || '.png'),
          has_custom_name: false,
        }));
      const originalFields = (records) =>
        records.map(({ params, references, keptParameters, ...record }) => record);
      expect(originalFields(database.loadLibrary())).toEqual(withNaming(expected.library));
      expect(originalFields(database.loadLibrary('trash'))).toEqual(withNaming(expected.trash));
      inspect(directory, (raw) => {
        expect(
          raw
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .all()
            .map((r) => r.name),
        ).toEqual(
          [
            ...Object.keys(expected.tables).filter((name) => !RETIRED_TABLES.includes(name)),
            'materials',
            'reference_vibes',
            'version_images',
            'work_branch_names',
            'work_versions',
            'works',
          ].sort(),
        );
        for (const [name, rows] of Object.entries(expected.tables)) {
          if (RETIRED_TABLES.includes(name)) continue;
          const actual = raw.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all();
          expect(
            name === 'app_meta'
              ? actual.filter(
                  (row) =>
                    ![
                      'prompt_fingerprints_version',
                      'generation_versions_v1',
                      'materials_v1',
                    ].includes(row.key),
                )
              : actual,
            name,
          ).toEqual(rows);
        }
        expect(
          raw.prepare("SELECT value FROM app_meta WHERE key = 'prompt_fingerprints_version'").get()
            .value,
        ).toBe('1');
        expect(raw.prepare('PRAGMA journal_mode').get().journal_mode).toBe('delete');
      });
      database.updateTagDictionary('girl', { translation: '修改后' });
      database.close();
      const reopened = await open(directory);
      expect(reopened.lookupTagDictionary(['girl']).get('girl').translation).toBe('修改后');
      expect(fs.readFileSync(reopened.engineBackupPath)).toEqual(before);
      expect(fs.readFileSync(reopened.backupPath)).toEqual(before);
      reopened.close();
      expect(fs.readdirSync(directory).sort()).toEqual([
        'studio.pre-generation-versions.sqlite',
        'studio.pre-materials.sqlite',
        'studio.pre-node-sqlite.sqlite',
        'studio.pre-phase2.sqlite',
        'studio.sqlite',
      ]);
    },
  );

  it('does not open or change the old file if the engine backup fails, and retries cleanly', async () => {
    const directory = temporary(true);
    const before = fs.readFileSync(fixture);
    fs.copyFileSync(fixture, path.join(directory, 'studio.pre-phase2.sqlite'));
    const copy = fs.copyFileSync;
    const openSpy = vi.spyOn(DatabaseSync.prototype, 'exec');
    const spy = vi.spyOn(fs, 'copyFileSync').mockImplementation((source, destination, ...args) => {
      if (String(destination).includes('pre-node-sqlite')) {
        fs.writeFileSync(destination, 'partial');
        throw Error('backup unavailable');
      }
      return copy(source, destination, ...args);
    });
    await expect(open(directory)).rejects.toThrow('backup unavailable');
    expect(openSpy).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(directory, 'studio.sqlite'))).toEqual(before);
    expect(fs.readdirSync(directory).sort()).toEqual(['studio.pre-phase2.sqlite', 'studio.sqlite']);
    spy.mockRestore();
    const database = await open(directory);
    expect(fs.readFileSync(database.engineBackupPath)).toEqual(before);
  });

  it('retains full fingerprint repair because nonempty legacy values can still be stale', async () => {
    const directory = temporary(true);
    inspect(directory, (raw) =>
      raw.exec(
        "UPDATE projects SET prompt_fingerprint='stale', base_prompt_fingerprint='stale', vibe_fingerprint='stale', exact_group_fingerprint='stale'",
      ),
    );
    const database = await open(directory);
    for (const [id, prompt, base, vibe, exact] of expected.tables.projects.map((row) => [
      row.id,
      row.prompt_fingerprint,
      row.base_prompt_fingerprint,
      row.vibe_fingerprint,
      row.exact_group_fingerprint,
    ])) {
      expect(database.loadProject(id)).toMatchObject({
        prompt_fingerprint: prompt,
        base_prompt_fingerprint: base,
        vibe_fingerprint: vibe,
        exact_group_fingerprint: exact,
      });
    }
  });

  it('keeps the Number-valued API when legacy metadata contains a large SQLite integer', async () => {
    const directory = temporary(true);
    inspect(directory, (raw) =>
      raw.exec("UPDATE generation_metadata SET steps=9007199254740993 WHERE project_id='image-0'"),
    );
    const database = await open(directory);
    expect(database.loadProject('image-0').metadata.steps).toBe(Number(9007199254740993n));
    expect(typeof database.loadProject('image-0').metadata.steps).toBe('number');
  });

  it('preserves metadata orphans after retirement even when a referenced project is permanently deleted', async () => {
    const directory = temporary(true);
    const database = await open(directory);
    database.deleteProject('image-0');
    database.close();
    const activeTables = new Set([
      'projects',
      'prompt_tags',
      'generation_metadata',
      'tag_dictionary',
      'danbooru_tag_cache',
      'app_meta',
      'prompt_group_covers',
      'gallery_collections',
      'gallery_collection_projects',
    ]);
    inspect(directory, (raw) => {
      for (const [table, rows] of Object.entries(expected.tables)) {
        if (RETIRED_TABLES.includes(table)) {
          expect(
            raw.prepare('SELECT name FROM sqlite_master WHERE name=?').get(table),
          ).toBeUndefined();
          continue;
        }
        if (!activeTables.has(table) || ['generation_metadata', 'prompt_tags'].includes(table))
          expect(raw.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(), table).toEqual(rows);
      }
      expect(raw.prepare("SELECT count(*) n FROM projects WHERE id='image-0'").get().n).toBe(0);
      expect(
        raw
          .prepare("SELECT count(*) n FROM gallery_collection_projects WHERE project_id='image-0'")
          .get().n,
      ).toBe(0);
    });
  });

  it('rolls back an image, its tags, metadata and dictionary when an insert fails midway', async () => {
    const directory = temporary();
    const database = await open(directory);
    expect(() =>
      database.insertProject({
        id: 'bad',
        tags: [
          { id: 'same', tag: 'first' },
          { id: 'same', tag: 'second' },
        ],
      }),
    ).toThrow();
    expect(database.loadLibrary()).toEqual([]);
    inspect(directory, (raw) => {
      for (const table of ['projects', 'prompt_tags', 'generation_metadata', 'tag_dictionary'])
        expect(raw.prepare(`SELECT count(*) n FROM ${table}`).get().n).toBe(0);
    });
  });

  it('makes previously nontransactional multi-statement mutations atomic', async () => {
    const directory = temporary();
    const database = await open(directory);
    database.insertProject({ id: 'kept', tags: [] });
    database.createCollection({ id: 'collection', name: 'Collection' });
    database.updateCollectionProjects('collection', ['kept']);
    inspect(directory, (raw) =>
      raw.exec(
        "CREATE TRIGGER fail_delete BEFORE DELETE ON gallery_collections BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
      ),
    );
    expect(() => database.deleteCollection('collection')).toThrow('injected failure');
    expect(database.listCollections().find((c) => c.id === 'collection').member_ids).toEqual([
      'kept',
    ]);
    const bad = {
      get tag() {
        throw Error('midway');
      },
    };
    expect(() =>
      database.upsertTagDictionary([{ tag: 'first', translation: 'value' }, bad]),
    ).toThrow('midway');
    expect(database.lookupTagDictionary(['first']).size).toBe(0);
    expect(() => database.upsertDanbooruTagCache([{ tag: 'first' }, bad])).toThrow('midway');
    expect(database.lookupDanbooruTagCache(['first']).size).toBe(0);
  });

  it('commits a chunk once, isolates a failed image and preserves earlier chunks', async () => {
    const directory = temporary();
    const database = await open(directory);
    database.insertProjects([{ id: 'previous', tags: [] }]);
    const execute = DatabaseSync.prototype.exec;
    let depth = 0;
    let commits = 0;
    const spy = vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (sql) {
      const result = execute.call(this, sql);
      if (sql.startsWith('SAVEPOINT ')) depth++;
      if (sql.startsWith('RELEASE ') || sql.startsWith('ROLLBACK TO ')) {
        depth--;
        if (depth === 0 && sql.startsWith('RELEASE ')) commits++;
      }
      return result;
    });
    const results = database.insertProjects([
      { id: 'a', tags: [] },
      { id: 'previous', tags: [] },
      { id: 'b', tags: [] },
    ]);
    expect(results.map((r) => Boolean(r.error))).toEqual([false, true, false]);
    expect(commits).toBe(1);
    spy.mockRestore();
    database.close();
    const reopened = await open(directory);
    expect(
      reopened
        .loadLibrary()
        .map((p) => p.id)
        .sort(),
    ).toEqual(['a', 'b', 'previous']);
  });

  it('rolls back a chunk whose commit fails without discarding a previous successful chunk', async () => {
    const directory = temporary();
    const database = await open(directory);
    database.insertProjects([{ id: 'previous', tags: [] }]);
    const execute = DatabaseSync.prototype.exec;
    let outer;
    const spy = vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (sql) {
      if (!outer && sql.startsWith('SAVEPOINT ')) outer = sql.slice('SAVEPOINT '.length);
      if (sql === `RELEASE ${outer}`) throw Error('commit unavailable');
      return execute.call(this, sql);
    });
    expect(() =>
      database.insertProjects([
        { id: 'a', tags: [] },
        { id: 'b', tags: [] },
      ]),
    ).toThrow('commit unavailable');
    spy.mockRestore();
    expect(database.loadLibrary().map((p) => p.id)).toEqual(['previous']);
    database.close();
    expect((await open(directory)).loadLibrary().map((p) => p.id)).toEqual(['previous']);
  });

  it.each(['committed', 'in-flight'])(
    'recovers after a forced process kill at %s',
    async (mode) => {
      const directory = temporary();
      await new Promise((resolve, reject) => {
        const child = fork(
          fileURLToPath(new URL('../scripts/data-layer/crash-worker.mjs', import.meta.url)),
          [directory, mode],
          { silent: true, execArgv: [] },
        );
        let ready = false;
        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.stdout.resume();
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(Error('crash worker timeout'));
        }, 15000);
        child.on('message', (message) => {
          if (message.ready) {
            ready = true;
            child.kill('SIGKILL');
          }
        });
        child.on('error', reject);
        child.on('exit', () => {
          clearTimeout(timer);
          ready ? resolve() : reject(Error(stderr));
        });
      });
      expect(fs.existsSync(path.join(directory, 'studio.sqlite-wal'))).toBe(false);
      if (mode === 'in-flight')
        expect(fs.statSync(path.join(directory, 'studio.sqlite-journal')).size).toBeGreaterThan(
          512,
        );
      const database = await open(directory);
      expect(database.loadProject('committed').name).toBe('Committed image');
      expect(database.lookupTagDictionary(['durable']).get('durable').translation).toBe('已提交');
      inspect(directory, (raw) => {
        expect(raw.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok');
        expect(
          raw.prepare("SELECT count(*) n FROM app_meta WHERE key LIKE 'dirty-%'").get().n,
        ).toBe(0);
      });
      database.close();
      expect(fs.readdirSync(directory).some((name) => /-(journal|wal|shm)$/.test(name))).toBe(
        false,
      );
    },
  );
});
