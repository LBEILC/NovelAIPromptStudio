import { DatabaseSync } from 'node:sqlite';

const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
export function validateBackupDatabase(file) {
  const source = new DatabaseSync(file, { readOnly: true });
  try {
    if (source.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw new Error('备份文件已损坏');
    const tables = new Set(
      source
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    if (
      !['projects', 'generation_metadata', 'prompt_tags', 'app_meta', 'works'].every((table) =>
        tables.has(table),
      )
    )
      throw new Error('备份文件已损坏');
  } finally {
    source.close();
  }
}

export function createDatabaseBackup(connection, { invalidate, ready }) {
  return {
    ready,
    counts: () =>
      Object.fromEntries(
        Object.entries({
          images: 'projects',
          works: 'works',
          collections: 'gallery_collections',
          dictionary: 'tag_dictionary',
          materials: 'materials',
        }).map(([key, table]) => [
          key,
          connection.prepare(`SELECT count(*) AS n FROM ${quote(table)}`).get().n,
        ]),
      ),
    snapshot(file) {
      connection.prepare('VACUUM INTO ?').run(file);
    },
    images: () =>
      connection.prepare('SELECT id, image_path, thumbnail_path, content_hash FROM projects').all(),
    replace(file) {
      validateBackupDatabase(file);
      const tables = connection
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map((r) => r.name);
      connection.prepare('ATTACH DATABASE ? AS backup_source').run(file);
      try {
        const available = new Set(
          connection
            .prepare("SELECT name FROM backup_source.sqlite_master WHERE type='table'")
            .all()
            .map((r) => r.name),
        );
        connection.exec('BEGIN IMMEDIATE');
        try {
          for (const table of tables) connection.exec(`DELETE FROM main.${quote(table)}`);
          for (const table of tables) {
            if (!available.has(table) || table === 'library_card_cache') continue;
            const sourceColumns = new Set(
              connection
                .prepare(`PRAGMA backup_source.table_info(${quote(table)})`)
                .all()
                .map((c) => c.name),
            );
            const columns = connection
              .prepare(`PRAGMA main.table_info(${quote(table)})`)
              .all()
              .map((c) => c.name)
              .filter((c) => sourceColumns.has(c))
              .map(quote)
              .join(',');
            connection.exec(
              `INSERT OR REPLACE INTO main.${quote(table)} (${columns}) SELECT ${columns} FROM backup_source.${quote(table)} ORDER BY rowid`,
            );
          }
          connection.exec('COMMIT');
        } catch (error) {
          connection.exec('ROLLBACK');
          throw error;
        }
      } finally {
        connection.exec('DETACH DATABASE backup_source');
      }
      invalidate();
    },
    relink(records, rewrite) {
      connection.exec('BEGIN IMMEDIATE');
      try {
        const update = connection.prepare(
          'UPDATE projects SET image_path=?, thumbnail_path=? WHERE id=?',
        );
        connection.exec("DELETE FROM app_meta WHERE key GLOB 'backup_missing:*'");
        const mark = connection.prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES (?,?)');
        for (const record of records) {
          update.run(record.image_path, record.thumbnail_path, record.id);
          if (record.missing) mark.run('backup_missing:' + record.id, '1');
        }
        for (const [table, column] of [
          ['works', 'origin_json'],
          ['works', 'source_json'],
          ['work_versions', 'snapshot_json'],
          ['reference_vibes', 'document_json'],
        ]) {
          const updateJson = connection.prepare(
            `UPDATE ${quote(table)} SET ${quote(column)}=? WHERE rowid=?`,
          );
          for (const row of connection
            .prepare(`SELECT rowid AS rid, ${quote(column)} AS value FROM ${quote(table)}`)
            .all()) {
            if (row.value) updateJson.run(JSON.stringify(rewrite(JSON.parse(row.value))), row.rid);
          }
        }
        connection.exec('COMMIT');
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
      invalidate();
    },
  };
}
