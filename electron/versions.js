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
  // Additive tables keep every existing snapshot readable without rewriting it.
  connection.exec(`
    CREATE TABLE IF NOT EXISTS deleted_versions (version_id TEXT PRIMARY KEY, token TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS branch_undo (token TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS removed_originals (work_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS original_undo (token TEXT PRIMARY KEY, work_id TEXT NOT NULL, project_id TEXT NOT NULL, kind TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS work_sequences (work_id TEXT PRIMARY KEY, version INTEGER NOT NULL, branch INTEGER NOT NULL);
    INSERT INTO work_sequences SELECT work_id, MAX(number), MAX(branch_number) FROM work_versions GROUP BY work_id
      ON CONFLICT(work_id) DO UPDATE SET version=MAX(version,excluded.version), branch=MAX(branch,excluded.branch);
  `);
  const originalImage = (project) =>
    connection.prepare('SELECT id,deleted_at FROM projects WHERE id=?').get(project.id || '') ||
    (project.image_path
      ? connection
          .prepare('SELECT id,deleted_at FROM projects WHERE image_path=? LIMIT 1')
          .get(project.image_path)
      : undefined);
  const originState = (workId, project) => {
    if (project.blank) return undefined;
    if (connection.prepare('SELECT 1 FROM removed_originals WHERE work_id=?').get(workId))
      return 'removed';
    const image = originalImage(project);
    return image ? (image.deleted_at ? 'trashed' : 'library') : 'file';
  };
  const originsOf = (ids) =>
    connection
      .prepare('SELECT id,origin_json FROM works')
      .all()
      .filter((w) => {
        const original = JSON.parse(w.origin_json);
        return (
          !original.blank &&
          ids.includes(originalImage(original)?.id || original.id) &&
          originState(w.id, original) !== 'removed'
        );
      })
      .map((w) => ({ workId: w.id, name: JSON.parse(w.origin_json).name }));
  const decode = (row) =>
    row && {
      ...(!row.parent_id
        ? { originState: originState(row.work_id, JSON.parse(row.snapshot_json)) }
        : {}),
      isStart: row.number === 0,
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
  const getAny = (id) =>
    decode(connection.prepare('SELECT * FROM work_versions WHERE id=?').get(id));
  const get = (id) =>
    connection.prepare('SELECT 1 FROM deleted_versions WHERE version_id=?').get(id)
      ? undefined
      : getAny(id);
  const list = (workId) =>
    connection
      .prepare(
        'SELECT * FROM work_versions WHERE work_id=? AND id NOT IN (SELECT version_id FROM deleted_versions) ORDER BY number',
      )
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
  function restoreAncestors(id) {
    while (id) {
      const v = getAny(id);
      if (!v) break;
      connection.prepare('DELETE FROM deleted_versions WHERE version_id=?').run(id);
      id = v.parentId;
    }
  }
  function trashImages(rows) {
    const ids = new Set(rows.map((v) => v.id));
    return [
      ...new Set(rows.flatMap((v) => v.images.filter((i) => !i.deleted).map((i) => i.projectId))),
    ].filter(
      (id) =>
        !connection
          .prepare(
            `SELECT vi.version_id FROM version_images vi
        WHERE vi.project_id=? AND vi.version_id NOT IN (SELECT version_id FROM deleted_versions)`,
          )
          .all(id)
          .some((image) => !ids.has(image.version_id)),
    );
  }
  return {
    get,
    getAny,
    list,
    originsOf,
    removeOriginal(workId, update) {
      return atomic(() => {
        const root = list(workId)[0];
        if (!root || !['library', 'file'].includes(root.originState))
          throw new Error('原图已移除或不存在');
        const undo = crypto.randomUUID();
        const projectId = originalImage(root.project)?.id || root.project.id;
        connection
          .prepare('INSERT INTO original_undo VALUES (?,?,?,?)')
          .run(undo, workId, projectId, root.originState);
        if (root.originState === 'library') update(projectId, true);
        else connection.prepare('INSERT INTO removed_originals VALUES (?)').run(workId);
        return { trashed: root.originState === 'library', undo };
      });
    },
    restoreOriginal(token, update) {
      return atomic(() => {
        const undo = connection.prepare('SELECT * FROM original_undo WHERE token=?').get(token);
        if (!undo) throw new Error('撤销记录不存在');
        if (!connection.prepare('SELECT 1 FROM works WHERE id=?').get(undo.work_id))
          throw new Error('作品不存在');
        if (undo.kind === 'library') {
          if (!connection.prepare('SELECT 1 FROM projects WHERE id=?').get(undo.project_id))
            throw new Error('图片已永久删除，无法撤销');
          update(undo.project_id, false);
        } else
          connection.prepare('DELETE FROM removed_originals WHERE work_id=?').run(undo.work_id);
        connection.prepare('DELETE FROM original_undo WHERE token=?').run(token);
        return true;
      });
    },
    latest: () => {
      const row = connection
        .prepare(
          'SELECT v.snapshot_json FROM version_images vi JOIN work_versions v ON v.id=vi.version_id ORDER BY vi.rowid DESC LIMIT 1',
        )
        .get();
      return row ? hydrateParameters(JSON.parse(row.snapshot_json)) : null;
    },
    discardEmpty(workId) {
      const work = connection.prepare('SELECT origin_json FROM works WHERE id=?').get(workId);
      if (
        !work ||
        !JSON.parse(work.origin_json).blank ||
        connection
          .prepare(
            'SELECT 1 FROM version_images vi JOIN work_versions v ON v.id=vi.version_id WHERE v.work_id=?',
          )
          .get(workId)
      )
        return;
      atomic(() => {
        connection.prepare('DELETE FROM work_versions WHERE work_id=?').run(workId);
        connection.prepare('DELETE FROM works WHERE id=?').run(workId);
        connection.prepare('DELETE FROM work_sequences WHERE work_id=?').run(workId);
      });
    },
    subtree(branchId, versionId) {
      const first = versionId
        ? connection
            .prepare(
              'SELECT * FROM work_versions WHERE id=? AND id NOT IN (SELECT version_id FROM deleted_versions)',
            )
            .get(versionId)
        : connection
            .prepare(
              'SELECT * FROM work_versions WHERE branch_id=? AND id NOT IN (SELECT version_id FROM deleted_versions) ORDER BY number LIMIT 1',
            )
            .get(branchId);
      if (!first) throw new Error('分支不存在');
      if (!first.parent_id) throw new Error('原图和起点不能删除');
      if (!versionId && !first.branch_number) throw new Error('主线不能删除');
      const rows = connection
        .prepare(
          `WITH RECURSIVE tree(id) AS (
        SELECT id FROM work_versions WHERE id=? UNION ALL SELECT v.id FROM work_versions v JOIN tree t ON v.parent_id=t.id
      ) SELECT v.* FROM work_versions v JOIN tree t ON v.id=t.id WHERE v.id NOT IN (SELECT version_id FROM deleted_versions)`,
        )
        .all(first.id)
        .map(decode);
      return { rows, parent: get(first.parent_id), images: trashImages(rows) };
    },
    pruneImages(projectIds) {
      return atomic(() => {
        const removed = [];
        const pending = projectIds.flatMap((id) =>
          connection
            .prepare('SELECT version_id FROM version_images WHERE project_id=?')
            .all(id)
            .map((row) => row.version_id),
        );
        while (pending.length) {
          const v = get(pending.pop());
          if (
            !v?.parentId ||
            v.images.some((i) => !i.deleted) ||
            list(v.workId).some((child) => child.parentId === v.id)
          )
            continue;
          connection
            .prepare('INSERT INTO deleted_versions VALUES (?,?)')
            .run(v.id, crypto.randomUUID());
          removed.push(v);
          pending.push(v.parentId);
        }
        return removed;
      });
    },
    trash(rows) {
      return atomic(() => {
        const token = crypto.randomUUID();
        // Fixed-seed results may deduplicate to an image still used by another live branch.
        const images = trashImages(rows);
        connection
          .prepare('INSERT INTO branch_undo VALUES (?,?)')
          .run(token, JSON.stringify({ versions: rows.map((v) => v.id), images }));
        for (const v of rows)
          connection.prepare('INSERT INTO deleted_versions VALUES (?,?)').run(v.id, token);
        for (const id of images)
          connection
            .prepare('UPDATE projects SET deleted_at=? WHERE id=?')
            .run(new Date().toISOString(), id);
        return token;
      });
    },
    restore(token) {
      return atomic(() => {
        const row = connection.prepare('SELECT payload FROM branch_undo WHERE token=?').get(token);
        if (!row) throw new Error('撤销记录不存在');
        const payload = JSON.parse(row.payload);
        if (
          payload.versions.some((id) => !getAny(id)) ||
          payload.images.some(
            (id) => !connection.prepare('SELECT 1 FROM projects WHERE id=?').get(id),
          )
        )
          throw new Error('图片已永久删除，无法撤销');
        for (const id of payload.versions) restoreAncestors(id);
        for (const id of payload.images)
          connection.prepare("UPDATE projects SET deleted_at='' WHERE id=?").run(id);
        connection.prepare('DELETE FROM branch_undo WHERE token=?').run(token);
        return true;
      });
    },
    restoreImage(projectId) {
      for (const row of connection
        .prepare('SELECT version_id FROM version_images WHERE project_id=?')
        .all(projectId))
        restoreAncestors(row.version_id);
    },
    purgeImage(projectId) {
      for (const work of originsOf([projectId]))
        connection.prepare('INSERT OR IGNORE INTO removed_originals VALUES (?)').run(work.workId);
      connection.prepare('DELETE FROM version_images WHERE project_id=?').run(projectId);
      // Remove empty deleted leaves, then their empty ancestors. Active versions are retained.
      let rows;
      do {
        rows = connection
          .prepare(
            `SELECT v.id FROM work_versions v JOIN deleted_versions d ON d.version_id=v.id
          WHERE NOT EXISTS (SELECT 1 FROM version_images i WHERE i.version_id=v.id)
          AND NOT EXISTS (SELECT 1 FROM work_versions child WHERE child.parent_id=v.id)`,
          )
          .all();
        for (const row of rows) {
          connection.prepare('DELETE FROM work_versions WHERE id=?').run(row.id);
          connection.prepare('DELETE FROM deleted_versions WHERE version_id=?').run(row.id);
        }
      } while (rows.length);
    },
    derived: (id) =>
      connection
        .prepare('SELECT id,source_json FROM works WHERE source_json IS NOT NULL')
        .all()
        .map((w) => ({ workId: w.id, source: JSON.parse(w.source_json) }))
        .filter((w) => w.source?.workId === id),
    work: (id) => {
      const w = connection.prepare('SELECT * FROM works WHERE id=?').get(id);
      const source = JSON.parse(w?.source_json || 'null');
      if (
        source &&
        (!connection.prepare('SELECT 1 FROM works WHERE id=?').get(source.workId) ||
          (!list(source.workId).some(
            (v) => v.parentId || v.images.some((image) => !image.deleted),
          ) &&
            connection
              .prepare('SELECT version FROM work_sequences WHERE work_id=?')
              .get(source.workId)?.version > (list(source.workId)[0]?.number ?? 0)))
      )
        source.deleted = true;
      return (
        w && {
          id: w.id,
          origin: hydrateParameters(JSON.parse(w.origin_json)),
          source,
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
          .run(
            id,
            workId,
            null,
            original.blank ? 0 : 1,
            id,
            0,
            JSON.stringify(original),
            'user',
            time,
          );
        connection
          .prepare('INSERT INTO work_sequences VALUES (?,?,?)')
          .run(workId, original.blank ? 0 : 1, 0);
        return get(id);
      });
    },
    append({ workId, parentId, project, source, image, seed, versionId }) {
      return atomic(() => {
        const parent = get(parentId);
        if (!parent || parent.workId !== workId) throw new Error('版本不存在');
        let target = versionId
          ? get(versionId)
          : !parent.isStart &&
              !['trashed', 'removed'].includes(parent.originState) &&
              source !== 'agent' &&
              versionSignature(project) === versionSignature(parent.project)
            ? parent
            : null;
        if (!target) {
          const versions = list(workId),
            children = versions.filter((v) => v.parentId === parent.id);
          const id = crypto.randomUUID(),
            number =
              connection.prepare('SELECT version FROM work_sequences WHERE work_id=?').get(workId)
                .version + 1;
          const branchNumber = children.length
            ? connection.prepare('SELECT branch FROM work_sequences WHERE work_id=?').get(workId)
                .branch + 1
            : parent.branchNumber;
          const branchId = children.length ? id : parent.branchId;
          connection
            .prepare('UPDATE work_sequences SET version=?, branch=MAX(branch,?) WHERE work_id=?')
            .run(number, branchNumber, workId);
          connection
            .prepare('INSERT INTO work_versions VALUES (?,?,?,?,?,?,?,?,?)')
            .run(
              id,
              workId,
              parentId,
              number,
              branchId,
              branchNumber,
              JSON.stringify({ ...project, blank: undefined }),
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
