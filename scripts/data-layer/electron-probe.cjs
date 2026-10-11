const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-electron-sqlite-'));
app.setPath('userData', path.join(directory, 'profile'));
const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
const report = { versions: process.versions, packaged: app.isPackaged, candidates: {} };
app
  .whenReady()
  .then(async () => {
    for (const kind of ['node:sqlite', 'better-sqlite3']) {
      let db;
      try {
        const module = require(kind);
        db =
          kind === 'node:sqlite'
            ? new module.DatabaseSync(path.join(directory, `${kind.replace(':', '-')}.sqlite`))
            : new module(path.join(directory, `${kind}.sqlite`));
        db.exec(
          'PRAGMA journal_mode=WAL; CREATE TABLE sample(id INTEGER PRIMARY KEY, value TEXT); BEGIN',
        );
        db.prepare('INSERT INTO sample VALUES (?, ?)').run(1, 'probe');
        db.exec('ROLLBACK; CREATE VIRTUAL TABLE search USING fts5(content)');
        db.prepare('INSERT INTO sample VALUES (?, ?)').run(2, 'committed');
        const backup = path.join(directory, `${kind.replace(':', '-')}-backup.sqlite`);
        if (kind === 'node:sqlite') await module.backup(db, backup);
        else await db.backup(backup);
        report.candidates[kind] = {
          ok: true,
          sqlite: db.prepare('SELECT sqlite_version() version').get().version,
          journal: db.prepare('PRAGMA journal_mode').get(),
          rows: db.prepare('SELECT * FROM sample').all(),
          backupBytes: fs.statSync(backup).size,
        };
      } catch (error) {
        report.candidates[kind] = { ok: false, error: error.stack };
      } finally {
        db?.close();
      }
    }
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    fs.rmSync(directory, { recursive: true, force: true });
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
