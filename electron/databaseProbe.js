import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { openDatabase } from './database.js';

// Explicit command-line check only; the main process selects a temporary profile
// before reaching this module and never opens the user's data or a BrowserWindow.
export async function runDatabaseProbe(directory, output, packaged) {
  const data = path.join(directory, 'data');
  const database = await openDatabase(data);
  try {
    database.insertProject({ id: 'probe', name: 'Probe', tags: [] });
    database.updateTagDictionary('probe', { translation: '测试' });
  } finally {
    database.close();
  }
  const reopened = await openDatabase(data);
  try {
    assert.equal(reopened.loadProject('probe').name, 'Probe');
    assert.equal(reopened.lookupTagDictionary(['probe']).get('probe').translation, '测试');
  } finally {
    reopened.close();
  }
  assert.deepEqual(fs.readdirSync(data).sort(), [
    'studio.pre-node-sqlite.sqlite',
    'studio.pre-phase2.sqlite',
    'studio.sqlite',
  ]);
  const raw = new DatabaseSync(path.join(data, 'studio.sqlite'));
  let sqlite;
  try {
    sqlite = raw.prepare('SELECT sqlite_version() version').get().version;
    assert.equal(raw.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
    raw.exec("BEGIN; INSERT INTO app_meta VALUES ('rolled-back','yes'); ROLLBACK");
    assert.equal(raw.prepare("SELECT * FROM app_meta WHERE key='rolled-back'").get(), undefined);
    raw.exec(
      "CREATE VIRTUAL TABLE probe_search USING fts5(content); INSERT INTO probe_search VALUES('sqlite probe')",
    );
    assert.equal(
      raw.prepare("SELECT content FROM probe_search WHERE probe_search MATCH 'probe'").get()
        .content,
      'sqlite probe',
    );
    await backup(raw, path.join(directory, 'online-backup.sqlite'));
  } finally {
    raw.close();
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        ok: true,
        packaged,
        versions: process.versions,
        sqlite,
        engine: 'node:sqlite',
        journal: 'delete',
        productionOpen: true,
        reopen: true,
        rollback: true,
        fts5: true,
        onlineBackup: true,
      },
      null,
      2,
    ),
  );
}
