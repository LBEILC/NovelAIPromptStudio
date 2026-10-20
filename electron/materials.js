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
  // Ordering lives in the existing JSON payload so older databases need no migration.
  const rows = () =>
    connection
      .prepare(
        "SELECT * FROM materials ORDER BY COALESCE(json_extract(payload,'$._order'),0),created_at DESC,id",
      )
      .all();
  const decode = (row) =>
    row && {
      ...publicPayload(row.payload),
      id: row.id,
      kind: row.kind,
      name: row.name,
      uses: row.uses,
    };
  const publicPayload = (payload) => {
    const { _order, ...value } = JSON.parse(payload);
    return value;
  };
  return {
    list: () => rows().map(decode),
    get: (id) => decode(connection.prepare('SELECT * FROM materials WHERE id=?').get(id)),
    save(value) {
      const id = crypto.randomUUID();
      connection
        .prepare('INSERT INTO materials(id,kind,name,payload,created_at) VALUES (?,?,?,?,?)')
        .run(
          id,
          value.kind,
          value.name,
          JSON.stringify({
            ...value,
            _order: (JSON.parse(rows()[0]?.payload || '{}')._order || 0) - 1,
          }),
          new Date().toISOString(),
        );
      return this.get(id);
    },
    update(id, value, asNew = false) {
      const existing = rows();
      const index = existing.findIndex((row) => row.id === id);
      if (index < 0) throw new Error('素材不存在');
      const payload = JSON.parse(existing[index].payload);
      if (!asNew) {
        connection
          .prepare('UPDATE materials SET payload=? WHERE id=?')
          .run(JSON.stringify({ ...value, _order: payload._order }), id);
        return this.get(id);
      }
      const names = new Set(existing.map((row) => row.name));
      const base = `${existing[index].name} 副本`;
      let name = base,
        number = 2;
      while (names.has(name)) name = `${base} ${number++}`;
      connection.exec('SAVEPOINT material_copy');
      try {
        const copy = this.save({ ...value, name });
        existing.splice(
          index + 1,
          0,
          connection.prepare('SELECT * FROM materials WHERE id=?').get(copy.id),
        );
        const write = connection.prepare('UPDATE materials SET payload=? WHERE id=?');
        existing.forEach((row, order) =>
          write.run(
            JSON.stringify({
              ...JSON.parse(row.payload),
              _order: order,
            }),
            row.id,
          ),
        );
        connection.exec('RELEASE material_copy');
        return this.get(copy.id);
      } catch (error) {
        connection.exec('ROLLBACK TO material_copy; RELEASE material_copy');
        throw error;
      }
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
