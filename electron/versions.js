import fs from 'node:fs';
import { hydrateParameters } from './params.js';
import path from 'node:path';
import crypto from 'node:crypto';

export const RETIRED_TABLES = [
  'series',
  'series_members',
  'branch_recipes',
  'branch_results',
  'experiments',
  'experiment_members',
  'prompt_versions',
  'collections',
  'collection_members',
  'vibe_library',
  'vibe_encoding_index',
  'vibe_transfers',
];
const MIGRATION = 'generation_versions_v1';
const SCHEMA = `
CREATE TABLE IF NOT EXISTS works (id TEXT PRIMARY KEY, origin_json TEXT NOT NULL, source_json TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS work_versions (id TEXT PRIMARY KEY, work_id TEXT NOT NULL, parent_id TEXT,
  number INTEGER NOT NULL, branch_id TEXT NOT NULL, branch_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(work_id, number));
CREATE INDEX IF NOT EXISTS idx_work_versions_work ON work_versions(work_id, number);
CREATE TABLE IF NOT EXISTS version_images (id TEXT PRIMARY KEY, version_id TEXT NOT NULL, project_id TEXT NOT NULL,
  seed TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_version_images_version ON version_images(version_id, created_at);
CREATE INDEX IF NOT EXISTS idx_version_images_project ON version_images(project_id);
CREATE TABLE IF NOT EXISTS work_branch_names (branch_id TEXT PRIMARY KEY, name TEXT NOT NULL);
`;

// Run before the ordinary schema transaction so the backup contains the untouched old DB.
export function migrateGenerationVersions(connection, filePath, { copy = fs.copyFileSync } = {}) {
  const hasMeta = connection
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_meta'")
    .get();
  if (hasMeta && connection.prepare('SELECT 1 FROM app_meta WHERE key=?').get(MIGRATION))
    return false;
  const tables = new Set(
    connection
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name),
  );
  if (RETIRED_TABLES.some((name) => tables.has(name))) {
    const backup = path.join(
      path.dirname(filePath),
      `studio.pre-generation-versions${fs.existsSync(path.join(path.dirname(filePath), 'studio.pre-generation-versions.sqlite')) ? `-${Date.now()}` : ''}.sqlite`,
    );
    const temporary = `${backup}.${crypto.randomUUID()}.tmp`;
    try {
      copy(filePath, temporary, fs.constants.COPYFILE_EXCL);
      const fd = fs.openSync(temporary, 'r+');
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      // An existing backup is never silently overwritten.
      fs.linkSync(temporary, backup);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  connection.exec('SAVEPOINT generation_migration');
  try {
    connection.exec(
      'CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );
    connection.exec(SCHEMA);
    for (const name of RETIRED_TABLES) connection.exec(`DROP TABLE IF EXISTS "${name}"`);
    connection.prepare('INSERT INTO app_meta(key,value) VALUES (?,?)').run(MIGRATION, '1');
    connection.exec('RELEASE generation_migration');
  } catch (error) {
    connection.exec('ROLLBACK TO generation_migration; RELEASE generation_migration');
    throw error;
  }
  return true;
}

export function versionSignature(project) {
  project = hydrateParameters(project);
  const s = project.prompt_structure;
  return JSON.stringify([
    project.metadata.prompt_raw,
    project.metadata.negative_prompt,
    s?.characters?.map((c) => [c.prompt_raw, c.undesired_raw, c.center]),
    // Serialized prompt order matters; translations and display labels do not.
    project.metadata.width,
    project.metadata.height,
    project.params,
    project.references?.vibes.map((r) => [
      r.thumbnail || r.encoding || r.libraryId,
      r.strength,
      r.information,
    ]),
    project.references?.precise.map((r) => [r.thumbnail, r.type, r.strength, r.fidelity]),
  ]);
}

export function createVersionStore(connection) {
  const decode = (row) =>
    row && {
      id: row.id,
      workId: row.work_id,
      parentId: row.parent_id,
      number: row.number,
      branchId: row.branch_id,
      branchNumber: row.branch_number,
      branchName:
        connection
          .prepare('SELECT name FROM work_branch_names WHERE branch_id=?')
          .get(row.branch_id)?.name || (row.branch_number ? `分支 ${row.branch_number}` : '主线'),
      project: hydrateParameters(JSON.parse(row.snapshot_json)),
      source: row.source,
      createdAt: row.created_at,
      images: connection
        .prepare(
          `SELECT vi.*, p.deleted_at FROM version_images vi LEFT JOIN projects p ON p.id=vi.project_id
      WHERE version_id=? ORDER BY vi.rowid`,
        )
        .all(row.id)
        .map((image) => ({
          id: image.id,
          projectId: image.project_id,
          seed: image.seed,
          deleted: !!image.deleted_at,
          createdAt: image.created_at,
        })),
    };
  const get = (id) => decode(connection.prepare('SELECT * FROM work_versions WHERE id=?').get(id));
  const list = (workId) =>
    connection
      .prepare('SELECT * FROM work_versions WHERE work_id=? ORDER BY number')
      .all(workId)
      .map(decode);
  function atomic(fn) {
    connection.exec('SAVEPOINT version_write');
    try {
      const value = fn();
      connection.exec('RELEASE version_write');
      return value;
    } catch (error) {
      connection.exec('ROLLBACK TO version_write; RELEASE version_write');
      throw error;
    }
  }
  return {
    get,
    list,
    derived: (id) =>
      connection
        .prepare('SELECT id,source_json FROM works WHERE source_json IS NOT NULL')
        .all()
        .map((w) => ({ workId: w.id, source: JSON.parse(w.source_json) }))
        .filter((w) => w.source?.workId === id),
    work: (id) => {
      const w = connection.prepare('SELECT * FROM works WHERE id=?').get(id);
      return (
        w && {
          id: w.id,
          origin: hydrateParameters(JSON.parse(w.origin_json)),
          source: JSON.parse(w.source_json || 'null'),
        }
      );
    },
    ensure(workId, original, source = null) {
      if (connection.prepare('SELECT 1 FROM works WHERE id=?').get(workId)) return list(workId)[0];
      return atomic(() => {
        const id = crypto.randomUUID(),
          time = new Date().toISOString();
        connection
          .prepare('INSERT INTO works VALUES (?,?,?,?)')
          .run(workId, JSON.stringify(original), JSON.stringify(source), time);
        connection
          .prepare('INSERT INTO work_versions VALUES (?,?,?,?,?,?,?,?,?)')
          .run(id, workId, null, 1, id, 0, JSON.stringify(original), 'user', time);
        return get(id);
      });
    },
    append({ workId, parentId, project, source, image, seed, versionId }) {
      return atomic(() => {
        const parent = get(parentId);
        if (!parent || parent.workId !== workId) throw new Error('版本不存在');
        let target = versionId
          ? get(versionId)
          : source !== 'agent' && versionSignature(project) === versionSignature(parent.project)
            ? parent
            : null;
        if (!target) {
          const versions = list(workId),
            children = versions.filter((v) => v.parentId === parent.id);
          const id = crypto.randomUUID(),
            number = Math.max(...versions.map((v) => v.number)) + 1;
          const branchNumber = children.length
            ? Math.max(...versions.map((v) => v.branchNumber)) + 1
            : parent.branchNumber;
          const branchId = children.length ? id : parent.branchId;
          connection
            .prepare('INSERT INTO work_versions VALUES (?,?,?,?,?,?,?,?,?)')
            .run(
              id,
              workId,
              parentId,
              number,
              branchId,
              branchNumber,
              JSON.stringify(project),
              source,
              new Date().toISOString(),
            );
          target = get(id);
        }
        connection
          .prepare('INSERT INTO version_images VALUES (?,?,?,?,?)')
          .run(crypto.randomUUID(), target.id, image.id, String(seed), new Date().toISOString());
        return get(target.id);
      });
    },
    rename(branchId, name) {
      if (!connection.prepare('SELECT 1 FROM work_versions WHERE branch_id=?').get(branchId))
        throw new Error('分支不存在');
      const value = String(name).trim();
      if (value)
        connection
          .prepare('INSERT OR REPLACE INTO work_branch_names VALUES (?,?)')
          .run(branchId, value);
      else connection.prepare('DELETE FROM work_branch_names WHERE branch_id=?').run(branchId);
      return value;
    },
    generated: () =>
      connection
        .prepare(
          'SELECT vi.project_id, v.work_id, v.number FROM version_images vi JOIN work_versions v ON v.id=vi.version_id',
        )
        .all(),
  };
}
