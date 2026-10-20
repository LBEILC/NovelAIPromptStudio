import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const migration = 'materials_v1';
export function migrateMaterials(connection, filePath, { copy = fs.copyFileSync } = {}) {
  if (connection.prepare('SELECT 1 FROM app_meta WHERE key=?').get(migration)) return;
  if (connection.prepare("SELECT 1 FROM sqlite_master WHERE name='projects'").get()) {
    const first = path.join(path.dirname(filePath), 'studio.pre-materials.sqlite');
    const backup = fs.existsSync(first)
      ? path.join(path.dirname(filePath), `studio.pre-materials-${crypto.randomUUID()}.sqlite`)
      : first;
    const temporary = `${backup}.${crypto.randomUUID()}.tmp`;
    try {
      copy(filePath, temporary, fs.constants.COPYFILE_EXCL);
      const fd = fs.openSync(temporary, 'r+');
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.linkSync(temporary, backup);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  connection.exec('SAVEPOINT materials_migration');
  try {
    connection.exec(`CREATE TABLE materials (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
      uses INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL, created_at TEXT NOT NULL)`);
    connection.prepare('INSERT INTO app_meta(key,value) VALUES (?,?)').run(migration, '1');
    connection.exec('RELEASE materials_migration');
  } catch (error) {
    connection.exec('ROLLBACK TO materials_migration; RELEASE materials_migration');
    throw error;
  }
}
export function createMaterialStore(connection) {
  const decode = (row) =>
    row && {
      ...JSON.parse(row.payload),
      id: row.id,
      kind: row.kind,
      name: row.name,
      uses: row.uses,
    };
  return {
    list: () =>
      connection.prepare('SELECT * FROM materials ORDER BY created_at DESC,id').all().map(decode),
    get: (id) => decode(connection.prepare('SELECT * FROM materials WHERE id=?').get(id)),
    save(value) {
      const id = crypto.randomUUID();
      connection
        .prepare('INSERT INTO materials(id,kind,name,payload,created_at) VALUES (?,?,?,?,?)')
        .run(id, value.kind, value.name, JSON.stringify(value), new Date().toISOString());
      return this.get(id);
    },
    rename(id, name) {
      connection.prepare('UPDATE materials SET name=? WHERE id=?').run(name, id);
      return this.get(id);
    },
    used(id) {
      connection.prepare('UPDATE materials SET uses=uses+1 WHERE id=?').run(id);
    },
    remove(id) {
      connection.prepare('DELETE FROM materials WHERE id=?').run(id);
    },
  };
}
