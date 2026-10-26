import { createWorkSharing } from './workSharing.js';
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
    project.references?.base,
    project.references?.vibes.map((r) => [
      r.thumbnail || r.encoding || r.libraryId,
      r.strength,
      r.information,
    ]),
    project.references?.precise.map((r) => [r.thumbnail, r.type, r.strength, r.fidelity]),
  ]);
}

export function createVersionStore(connection, hydrate = hydrateParameters) {
  let activeVersions = new Set();
  // Additive tables keep every existing snapshot readable without rewriting it.
  connection.exec(`
    CREATE TABLE IF NOT EXISTS version_image_random (image_id TEXT PRIMARY KEY, record_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS deferred_version_prunes (version_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS deleted_versions (version_id TEXT PRIMARY KEY, token TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS branch_undo (token TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS removed_originals (work_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS original_undo (token TEXT PRIMARY KEY, work_id TEXT NOT NULL, project_id TEXT NOT NULL, kind TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS work_sequences (work_id TEXT PRIMARY KEY, version INTEGER NOT NULL, branch INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS work_activity (work_id TEXT PRIMARY KEY, used_at INTEGER NOT NULL, version_id TEXT);
    CREATE TABLE IF NOT EXISTS work_file_signatures (work_id TEXT PRIMARY KEY, signature_json TEXT NOT NULL);
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
      operation: JSON.parse(row.snapshot_json).operation,
      project: hydrate(JSON.parse(row.snapshot_json)),
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
          random: JSON.parse(
            connection
              .prepare('SELECT record_json FROM version_image_random WHERE image_id=?')
              .get(image.id)?.record_json || 'null',
          ),
          deleted: !!image.deleted_at,
          createdAt: image.created_at,
        })),
    };
  const getAny = (id) =>
    decode(connection.prepare('SELECT * FROM work_versions WHERE id=?').get(id));
  const isDeleted = (id) =>
    !!connection.prepare('SELECT 1 FROM deleted_versions WHERE version_id=?').get(id);
  const visibleParent = (id) => {
    while (id && isDeleted(id)) id = getAny(id)?.parentId;
    return id || null;
  };
  const get = (id) => {
    if (isDeleted(id)) return undefined;
    const v = getAny(id);
    return v && { ...v, parentId: visibleParent(v.parentId) };
  };
  const list = (workId) => {
    const rows = connection
      .prepare(
        'SELECT * FROM work_versions WHERE work_id=? AND id NOT IN (SELECT version_id FROM deleted_versions) ORDER BY number',
      )
      .all(workId)
      .map(decode);
    const branches = new Map();
    for (const v of rows) if (!branches.has(v.branchId)) branches.set(v.branchId, v.id);
    return rows.map((v) => ({
      ...v,
      parentId: visibleParent(v.parentId),
      branchId: branches.get(v.branchId),
    }));
  };
  const touch = (workId, versionId) => {
    const previous = connection.prepare('SELECT MAX(used_at) AS time FROM work_activity').get();
    connection
      .prepare(
        'INSERT INTO work_activity VALUES (?,?,?) ON CONFLICT(work_id) DO UPDATE SET used_at=excluded.used_at, version_id=COALESCE(excluded.version_id,version_id)',
      )
      .run(workId, Math.max(Date.now(), (previous.time || 0) + 1), versionId || null);
  };
  const forImage = (imageId, workId) => {
    const rows = connection
      .prepare(
        `SELECT v.id FROM version_images vi JOIN work_versions v ON v.id=vi.version_id
      JOIN projects p ON p.id=vi.project_id JOIN works w ON w.id=v.work_id
      WHERE vi.project_id=? AND p.deleted_at = '' ORDER BY vi.rowid DESC`,
      )
      .all(imageId);
    return rows.map((r) => get(r.id)).find((v) => v && (!workId || v.workId === workId));
  };
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
    const start = id;
    while (id) {
      const v = getAny(id);
      if (!v) break;
      const deletion = connection
        .prepare(
          'SELECT b.payload FROM deleted_versions d LEFT JOIN branch_undo b ON b.token=d.token WHERE d.version_id=?',
        )
        .get(id);
      // Explicit single-version deletions remain independent when descendants return.
      const { only, automatic } = JSON.parse(deletion?.payload || '{}');
      if (id === start || !only)
        connection.prepare('DELETE FROM deleted_versions WHERE version_id=?').run(id);
      if (id === start && only && !automatic) return;
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
  let api;
  const sharing = createWorkSharing(
    connection,
    {
      list,
      getAny,
      work: (id) => api.work(id),
      pruneImages: (...args) => api.pruneImages(...args),
    },
    atomic,
  );
  return (api = {
    ...sharing,
    randomForImage(projectId) {
      const row = connection
        .prepare(
          'SELECT r.record_json FROM version_image_random r JOIN version_images i ON i.id=r.image_id WHERE i.project_id=? ORDER BY i.rowid DESC LIMIT 1',
        )
        .get(projectId);
      return row ? JSON.parse(row.record_json) : null;
    },
    setActiveVersions(ids) {
      activeVersions = new Set(ids);
    },
    retryPrune(rows) {
      atomic(() => {
        for (const v of rows) {
          connection.prepare('DELETE FROM deleted_versions WHERE version_id=?').run(v.id);
          connection.prepare('INSERT OR IGNORE INTO deferred_version_prunes VALUES (?)').run(v.id);
        }
      });
    },
    pruneDeferred() {
      connection.exec(`DELETE FROM deferred_version_prunes WHERE NOT EXISTS (SELECT 1 FROM work_versions v WHERE v.id=version_id)
        OR EXISTS (SELECT 1 FROM version_images vi JOIN projects p ON p.id=vi.project_id WHERE vi.version_id=deferred_version_prunes.version_id AND p.deleted_at='')`);
      const ids = connection
        .prepare('SELECT version_id FROM deferred_version_prunes')
        .all()
        .map((r) => r.version_id);
      return this.pruneImages([], ids);
    },
    maskIds() {
      return new Set(
        connection
          .prepare('SELECT snapshot_json FROM work_versions')
          .all()
          .map((row) => JSON.parse(row.snapshot_json).operation?.maskId)
          .filter((id) => /^[a-f0-9]{64}$/.test(id)),
      );
    },
    referencedPaths() {
      return connection
        .prepare('SELECT snapshot_json FROM work_versions UNION ALL SELECT origin_json FROM works')
        .all()
        .flatMap((row) => {
          const p = JSON.parse(row.snapshot_json);
          return [p.image_path, p.thumbnail_path].filter(Boolean);
        });
    },
    bindOriginal(workId, image) {
      return atomic(() => {
        const root = list(workId)[0];
        if (!root || root.parentId || root.project.blank) return;
        const fields = {
          autoSaveOriginal: false,
          id: image.id,
          image_path: image.image_path,
          thumbnail_path: image.thumbnail_path,
        };
        const origin = JSON.parse(
          connection.prepare('SELECT origin_json FROM works WHERE id=?').get(workId).origin_json,
        );
        connection
          .prepare('UPDATE works SET origin_json=? WHERE id=?')
          .run(JSON.stringify({ ...origin, ...fields }), workId);
        connection
          .prepare('UPDATE work_versions SET snapshot_json=? WHERE id=?')
          .run(JSON.stringify({ ...root.project, ...fields }), root.id);
        connection.prepare('DELETE FROM work_file_signatures WHERE work_id=?').run(workId);
      });
    },
    get,
    getAny,
    list,
    originsOf,
    touch,
    forImage,
    lastVersion(workId) {
      const activity = connection
        .prepare('SELECT version_id FROM work_activity WHERE work_id=?')
        .get(workId);
      const remembered = activity && get(activity.version_id);
      return remembered?.workId === workId ? remembered : list(workId).at(-1);
    },
    findOrigin(source, image) {
      const candidates = connection
        .prepare(
          `SELECT w.*, s.signature_json FROM works w
        LEFT JOIN work_activity a ON a.work_id=w.id LEFT JOIN work_file_signatures s ON s.work_id=w.id
        ORDER BY COALESCE(a.used_at,0) DESC, w.created_at DESC, w.rowid DESC`,
        )
        .all();
      const normalize = (p) =>
        process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
      for (const row of candidates) {
        const original = JSON.parse(row.origin_json);
        if (original.blank || !['library', 'file'].includes(originState(row.id, original)))
          continue;
        if (source.type === 'library') {
          if (originalImage(original)?.id === source.projectId) return row.id;
          continue;
        }
        if (!original.image_path || normalize(original.image_path) !== normalize(image.image_path))
          continue;
        const signature = row.signature_json
          ? JSON.parse(row.signature_json)
          : original.fileSignature;
        if (signature) {
          if (
            image.fileSignature &&
            ['size', 'mtimeMs', 'sha256'].every(
              (key) => signature[key] === image.fileSignature[key],
            )
          )
            return row.id;
          continue;
        }
        const a = original.metadata,
          b = image.metadata;
        // Empty/default metadata is not evidence that an old source is unchanged.
        if (!b?.model || b.seed === '' || !b.width || !b.height || !image.fileSignature) continue;
        if (
          !['prompt_raw', 'negative_prompt', 'seed', 'width', 'height', 'model'].every(
            (key) => a?.[key] !== undefined && String(a[key]) === String(b[key]),
          )
        )
          continue;
        const characters = (p) =>
          (p.prompt_structure?.characters || []).map((c) => [c.prompt_raw, c.undesired_raw]);
        if (JSON.stringify(characters(original)) !== JSON.stringify(characters(image))) continue;
        connection
          .prepare('INSERT OR REPLACE INTO work_file_signatures VALUES (?,?)')
          .run(row.id, JSON.stringify(image.fileSignature));
        return row.id;
      }
      return undefined;
    },
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
      return row ? hydrate(JSON.parse(row.snapshot_json)) : null;
    },
    discardEmpty(workId) {
      const work = connection.prepare('SELECT origin_json FROM works WHERE id=?').get(workId);
      if (
        !work ||
        sharing.isSaved(workId) ||
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
        connection.prepare('DELETE FROM work_activity WHERE work_id=?').run(workId);
        connection.prepare('DELETE FROM work_file_signatures WHERE work_id=?').run(workId);
      });
    },
    subtree(branchId, versionId, only = false) {
      branchId = (branchId && getAny(branchId)?.branchId) || branchId;
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
      const rows = only
        ? [decode(first)]
        : connection
            .prepare(
              `WITH RECURSIVE tree(id) AS (
        SELECT id FROM work_versions WHERE id=? UNION ALL SELECT v.id FROM work_versions v JOIN tree t ON v.parent_id=t.id
      ) SELECT v.* FROM work_versions v JOIN tree t ON v.id=t.id WHERE v.id NOT IN (SELECT version_id FROM deleted_versions)`,
            )
            .all(first.id)
            .map(decode);
      return { rows, parent: get(visibleParent(first.parent_id)), images: trashImages(rows) };
    },
    pruneImages(projectIds, deferredIds = []) {
      return atomic(() => {
        const removed = [];
        const pending = projectIds.flatMap((id) =>
          connection
            .prepare('SELECT version_id FROM version_images WHERE project_id=?')
            .all(id)
            .map((row) => row.version_id),
        );
        pending.push(...deferredIds);
        const directlyAffected = new Set(pending);
        while (pending.length) {
          const v = get(pending.pop());
          if (
            !v?.parentId ||
            v.images.some((i) => !i.deleted) ||
            (!directlyAffected.has(v.id) && list(v.workId).some((child) => child.parentId === v.id))
          )
            continue;
          if (activeVersions.has(v.id)) {
            connection
              .prepare('INSERT OR IGNORE INTO deferred_version_prunes VALUES (?)')
              .run(v.id);
            continue;
          }
          connection.prepare('DELETE FROM deferred_version_prunes WHERE version_id=?').run(v.id);
          const token = crypto.randomUUID();
          if (directlyAffected.has(v.id))
            connection
              .prepare('INSERT INTO branch_undo VALUES (?,?)')
              .run(token, JSON.stringify({ only: true, automatic: true }));
          connection.prepare('INSERT INTO deleted_versions VALUES (?,?)').run(v.id, token);
          removed.push(v);
          pending.push(v.parentId);
        }
        return removed;
      });
    },
    trash(rows, only = false) {
      return atomic(() => {
        const token = crypto.randomUUID();
        // Fixed-seed results may deduplicate to an image still used by another live branch.
        const images = trashImages(rows);
        connection
          .prepare('INSERT INTO branch_undo VALUES (?,?)')
          .run(token, JSON.stringify({ versions: rows.map((v) => v.id), images, only }));
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
        for (const id of payload.versions) {
          if (payload.only)
            connection.prepare('DELETE FROM deleted_versions WHERE version_id=?').run(id);
          else restoreAncestors(id);
        }
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
      connection
        .prepare(
          'DELETE FROM version_image_random WHERE image_id IN (SELECT id FROM version_images WHERE project_id=?)',
        )
        .run(projectId);
      connection.prepare('DELETE FROM version_images WHERE project_id=?').run(projectId);
      // Retain detached image targets so deleting another image cannot invalidate
      // their undo records. Keeping each target also retains its ancestors.
      // Remove empty deleted leaves, then their empty ancestors. Active versions are retained.
      let rows;
      do {
        rows = connection
          .prepare(
            `SELECT v.id FROM work_versions v JOIN deleted_versions d ON d.version_id=v.id
          WHERE NOT EXISTS (SELECT 1 FROM version_images i WHERE i.version_id=v.id)
          AND NOT EXISTS (SELECT 1 FROM detached_images_undo u, json_each(u.payload, '$.rows') r
            WHERE json_extract(r.value, '$.version_id')=v.id)
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
          origin: hydrate(JSON.parse(w.origin_json)),
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
    append({ workId, parentId, project, source, image, seed, versionId, operation, random }) {
      if (operation?.kind === 'outpaint')
        project = {
          ...project,
          metadata: {
            ...project.metadata,
            width: image.metadata.width,
            height: image.metadata.height,
          },
        };
      return atomic(() => {
        const parent = get(parentId);
        if (!parent || parent.workId !== workId) throw new Error('版本不存在');
        let target = versionId
          ? get(versionId)
          : !operation &&
              !parent.isStart &&
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
              JSON.stringify({ ...project, blank: undefined, operation }),
              source,
              new Date().toISOString(),
            );
          target = get(id);
        }
        const imageId = crypto.randomUUID();
        connection
          .prepare('INSERT INTO version_images VALUES (?,?,?,?,?)')
          .run(imageId, target.id, image.id, String(seed), new Date().toISOString());
        if (random?.blocks.length)
          connection
            .prepare('INSERT INTO version_image_random VALUES (?,?)')
            .run(imageId, JSON.stringify(random));
        sharing.save(workId);
        return get(target.id);
      });
    },
    rename(branchId, name) {
      branchId = (branchId && getAny(branchId)?.branchId) || branchId;
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
  });
}
