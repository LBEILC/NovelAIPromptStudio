import crypto from 'node:crypto';

// Additive migration: old snapshots and identifiers stay intact.
export function createWorkSharing(connection, versions, atomic) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS saved_works (work_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS detached_images_undo (token TEXT PRIMARY KEY, payload TEXT NOT NULL);
  `);
  atomic(() => {
    if (connection.prepare('SELECT 1 FROM app_meta WHERE key=?').get('saved_works_v1')) return;
    // Older nonblank roots were durable works; keep them even if all generated
    // images were purged. Explicit pending-original flags still identify drafts.
    connection.exec(`INSERT OR IGNORE INTO saved_works
      SELECT DISTINCT v.work_id FROM work_versions v JOIN version_images i ON i.version_id=v.id;
      INSERT OR IGNORE INTO saved_works SELECT s.work_id FROM work_sequences s JOIN work_versions v ON v.work_id=s.work_id AND v.parent_id IS NULL WHERE s.version > v.number;
      INSERT OR IGNORE INTO saved_works SELECT id FROM works WHERE json_extract(origin_json, '$.blank') IS NOT 1 AND json_extract(origin_json, '$.autoSaveOriginal') IS NOT 1;`);
    connection.prepare('INSERT INTO app_meta VALUES (?,?)').run('saved_works_v1', '1');
  });
  const isSaved = (workId) =>
    !!connection.prepare('SELECT 1 FROM saved_works WHERE work_id=?').get(workId || '');
  const save = (workId) => {
    if (!connection.prepare('SELECT 1 FROM works WHERE id=?').get(workId))
      throw Error('作品不存在');
    connection.prepare('INSERT OR IGNORE INTO saved_works VALUES (?)').run(workId);
  };
  let resolveNames = () => new Map();
  const imageIds = (payload) => [
    ...new Set([payload.origin, ...payload.rows.map((r) => r.project_id)].filter(Boolean)),
  ];
  // Keep the original batch token for notification undo. A trash entry scopes
  // that same durable payload to one image, including records written by 060.
  const imageToken = (token, id) => `image:${JSON.stringify([token, id])}`;
  function readUndo(undo) {
    let token = undo,
      id;
    if (undo.startsWith('image:')) {
      try {
        [token, id] = JSON.parse(undo.slice(6));
      } catch {
        throw Error('撤销记录不存在');
      }
      if (typeof token !== 'string' || typeof id !== 'string' || !id) throw Error('撤销记录不存在');
    }
    const record = connection
      .prepare('SELECT payload FROM detached_images_undo WHERE token=?')
      .get(token);
    if (!record) return null;
    const original = JSON.parse(record.payload);
    if (id && !imageIds(original).includes(id)) return null;
    const payload = id
      ? {
          ...original,
          origin: original.origin === id ? id : null,
          rows: original.rows.filter((r) => r.project_id === id),
        }
      : original;
    return { token, id, original, payload };
  }
  function consumeUndo(record) {
    const { token, id, original } = record;
    const remaining = id
      ? {
          ...original,
          origin: original.origin === id ? null : original.origin,
          rows: original.rows.filter((r) => r.project_id !== id),
        }
      : null;
    if (remaining && imageIds(remaining).length)
      connection
        .prepare('UPDATE detached_images_undo SET payload=? WHERE token=?')
        .run(JSON.stringify(remaining), token);
    else connection.prepare('DELETE FROM detached_images_undo WHERE token=?').run(token);
  }
  let cachedRefs;
  const changes = connection.prepare('SELECT total_changes() AS count');
  const dataVersion = connection.prepare('PRAGMA data_version');
  function workRefs(imageId) {
    const displayNames = resolveNames();
    // Both same-connection writes and external writers invalidate ownership.
    // Never cache an uncommitted view: a rollback does not reset total_changes.
    const stamp = `${changes.get().count}:${dataVersion.get().data_version}:${JSON.stringify([...displayNames])}`;
    if (!connection.isTransaction && cachedRefs?.stamp === stamp)
      return imageId === undefined
        ? cachedRefs.result
        : new Map([[imageId, cachedRefs.result.get(imageId) || []]]);
    const result = new Map();
    const add = (id, ref) => {
      if (!result.has(id)) result.set(id, []);
      result.get(id).push(ref);
    };
    if (imageId !== undefined) {
      for (const row of connection
        .prepare(
          `SELECT w.id,json_extract(w.origin_json,'$.name') AS name
        FROM works w JOIN saved_works s ON s.work_id=w.id JOIN projects p ON p.id=?
        WHERE p.deleted_at='' AND w.id NOT IN (SELECT work_id FROM removed_originals)
        AND json_extract(w.origin_json,'$.blank') IS NOT 1
        AND p.id=COALESCE(
          (SELECT original.id FROM projects original WHERE original.id=json_extract(w.origin_json,'$.id')),
          (SELECT original.id FROM projects original WHERE json_extract(w.origin_json,'$.image_path') != ''
            AND original.image_path=json_extract(w.origin_json,'$.image_path') LIMIT 1))`,
        )
        .all(imageId))
        add(imageId, {
          workId: row.id,
          role: 'origin',
          workName: displayNames.get(row.id) || row.name || '',
        });
      for (const row of connection
        .prepare(
          `SELECT DISTINCT v.work_id,v.id,v.number,json_extract(w.origin_json,'$.name') AS name
        FROM version_images i JOIN work_versions v ON v.id=i.version_id JOIN works w ON w.id=v.work_id
        JOIN saved_works s ON s.work_id=w.id JOIN projects p ON p.id=i.project_id
        WHERE i.project_id=? AND p.deleted_at='' AND v.id NOT IN (SELECT version_id FROM deleted_versions)
        ORDER BY v.number,i.rowid`,
        )
        .all(imageId))
        add(imageId, {
          workId: row.work_id,
          role: 'version',
          versionId: row.id,
          number: row.number,
          workName: displayNames.get(row.work_id) || row.name || '',
        });
      return result;
    }
    const works = connection
      .prepare(
        `SELECT w.*, r.work_id AS removed FROM works w
      JOIN saved_works s ON s.work_id=w.id LEFT JOIN removed_originals r ON r.work_id=w.id`,
      )
      .all();
    if (!works.length) {
      if (!connection.isTransaction) cachedRefs = { stamp, result };
      return result;
    }
    const images = connection.prepare('SELECT id,image_path,deleted_at FROM projects').all();
    const byId = new Map(images.map((p) => [p.id, p]));
    const byPath = new Map();
    for (const p of images) if (!byPath.has(p.image_path)) byPath.set(p.image_path, p);
    const names = new Map();
    for (const w of works) {
      const origin = JSON.parse(w.origin_json);
      names.set(w.id, displayNames.get(w.id) || origin.name || '');
      const image =
        byId.get(origin.id) || (origin.image_path ? byPath.get(origin.image_path) : undefined);
      if (!origin.blank && !w.removed && image && !image.deleted_at)
        add(image.id, { workId: w.id, role: 'origin', workName: names.get(w.id) });
    }
    for (const row of connection
      .prepare(
        `SELECT DISTINCT i.project_id,v.work_id,v.id,v.number
      FROM version_images i JOIN work_versions v ON v.id=i.version_id
      JOIN saved_works s ON s.work_id=v.work_id JOIN projects p ON p.id=i.project_id
      WHERE p.deleted_at='' AND v.id NOT IN (SELECT version_id FROM deleted_versions)
      ORDER BY v.number,i.rowid`,
      )
      .all()) {
      if (names.has(row.work_id))
        add(row.project_id, {
          workId: row.work_id,
          role: 'version',
          versionId: row.id,
          number: row.number,
          workName: names.get(row.work_id),
        });
    }
    if (!connection.isTransaction) cachedRefs = { stamp, result };
    return result;
  }
  return {
    setWorkNameResolver: (resolve) => {
      resolveNames = resolve;
    },
    isSaved,
    save,
    workRefs,
    detachedImages() {
      const names = resolveNames();
      return connection
        .prepare('SELECT token,payload FROM detached_images_undo ORDER BY rowid DESC')
        .all()
        .flatMap((record) => {
          const payload = JSON.parse(record.payload);
          return imageIds(payload).flatMap((id) => {
            const image = connection
              .prepare("SELECT 1 FROM projects WHERE id=? AND deleted_at=''")
              .get(id);
            if (!image) return [];
            const row = payload.rows.find((r) => r.project_id === id);
            return [
              {
                undo: imageToken(record.token, id),
                workId: payload.workId,
                workName:
                  names.get(payload.workId) ||
                  versions.work(payload.workId)?.origin.name ||
                  payload.workName ||
                  '',
                role: payload.origin === id ? 'origin' : 'version',
                ...(payload.origin !== id
                  ? { number: versions.getAny(row.version_id)?.number }
                  : {}),
                detachedAt: payload.detachedAt || '',
                imageId: id,
              },
            ];
          });
        });
    },
    discardDetached(undos) {
      return atomic(() => {
        let discarded = 0;
        for (const undo of new Set(undos)) {
          const record = readUndo(undo);
          if (!record) continue;
          discarded += imageIds(record.payload).length;
          consumeUndo(record);
        }
        return discarded;
      });
    },
    discardDetachedImage(id) {
      return atomic(() => {
        for (const { token, payload } of connection
          .prepare('SELECT token,payload FROM detached_images_undo')
          .all()) {
          if (imageIds(JSON.parse(payload)).includes(id))
            consumeUndo(readUndo(imageToken(token, id)));
        }
      });
    },
    detachImages(workId, imageIds) {
      return atomic(() => {
        const root = versions.list(workId)[0];
        if (!root) throw Error('作品不存在');
        const ids = new Set(imageIds);
        const originImage =
          connection.prepare('SELECT id FROM projects WHERE id=?').get(root.project.id) ||
          connection
            .prepare('SELECT id FROM projects WHERE image_path=? LIMIT 1')
            .get(root.project.image_path || '');
        const origin =
          ['library', 'file'].includes(root.originState) &&
          ids.has(originImage?.id || root.project.id)
            ? originImage?.id || root.project.id
            : null;
        const rows = connection
          .prepare(
            `SELECT i.rowid AS position,i.* FROM version_images i JOIN work_versions v ON v.id=i.version_id
          WHERE v.work_id=? AND v.id NOT IN (SELECT version_id FROM deleted_versions) ORDER BY i.rowid`,
          )
          .all(workId)
          .filter((i) => ids.has(i.project_id));
        const undo = crypto.randomUUID();
        const visible = versions.list(workId).map((v) => v.id);
        if (origin)
          connection.prepare('INSERT OR IGNORE INTO removed_originals VALUES (?)').run(workId);
        for (const row of rows)
          connection.prepare('DELETE FROM version_images WHERE id=?').run(row.id);
        const removed = versions.pruneImages([], [...new Set(rows.map((i) => i.version_id))]);
        connection.prepare('INSERT INTO detached_images_undo VALUES (?,?)').run(
          undo,
          JSON.stringify({
            workId,
            workName: resolveNames().get(workId) || root.project.name || '',
            detachedAt: new Date().toISOString(),
            origin,
            originLibrary: root.originState === 'library',
            rows,
            visible,
            removed: removed.map((v) => v.id),
          }),
        );
        return { undo, versions: removed };
      });
    },
    restoreDetached(undo) {
      return atomic(() => {
        const record = readUndo(undo);
        if (!record) throw Error('撤销记录不存在');
        const { payload } = record;
        if (!versions.work(payload.workId) || !versions.list(payload.workId).length)
          throw Error(`「${payload.workName || payload.workId}」已经不在了`);
        if (
          imageIds(payload).some(
            (id) =>
              connection.prepare('SELECT deleted_at FROM projects WHERE id=?').get(id)?.deleted_at,
          )
        )
          throw Error('请先从回收站恢复图片');
        if (
          (payload.origin &&
            payload.originLibrary &&
            !connection.prepare('SELECT 1 FROM projects WHERE id=?').get(payload.origin)) ||
          payload.rows.some(
            (r) =>
              !versions.getAny(r.version_id) ||
              !connection.prepare('SELECT 1 FROM projects WHERE id=?').get(r.project_id),
          )
        )
          throw Error('图片或作品已永久删除，无法撤销');
        if (payload.origin)
          connection.prepare('DELETE FROM removed_originals WHERE work_id=?').run(payload.workId);
        for (const r of payload.rows) {
          const collision = connection
            .prepare('SELECT id FROM version_images WHERE rowid=?')
            .get(r.position);
          if (collision && collision.id !== r.id) {
            // Move the whole later range together so other works retain image order.
            const maximum = connection
              .prepare('SELECT MAX(rowid) AS n FROM version_images')
              .get().n;
            const offset = maximum + 1;
            connection
              .prepare('UPDATE version_images SET rowid=rowid+? WHERE rowid>=?')
              .run(offset, r.position);
            connection
              .prepare('UPDATE version_images SET rowid=rowid-?+1 WHERE rowid>?')
              .run(offset, maximum);
          }
          connection
            .prepare(
              'INSERT OR IGNORE INTO version_images(rowid,id,version_id,project_id,seed,created_at) VALUES (?,?,?,?,?,?)',
            )
            .run(r.position, r.id, r.version_id, r.project_id, r.seed, r.created_at);
          connection
            .prepare('DELETE FROM deferred_version_prunes WHERE version_id=?')
            .run(r.version_id);
        }
        // A protected empty version may have been pruned after the detach call.
        // Undo only automatic pruning, leaving subsequent explicit deletions alone.
        for (const r of payload.rows) {
          let id = r.version_id;
          while (id) {
            const deletion = connection
              .prepare(
                `SELECT b.payload FROM deleted_versions d
              LEFT JOIN branch_undo b ON b.token=d.token WHERE d.version_id=?`,
              )
              .get(id);
            if (
              payload.visible.includes(id) &&
              deletion &&
              (!deletion.payload || JSON.parse(deletion.payload).automatic)
            )
              connection.prepare('DELETE FROM deleted_versions WHERE version_id=?').run(id);
            id = versions.getAny(id)?.parentId;
          }
        }
        consumeUndo(record);
        return true;
      });
    },
    retainedPaths(excludingProjectId) {
      const paths = new Set();
      const add = (p) => {
        for (const file of [p.image_path, p.thumbnail_path]) if (file) paths.add(file);
      };
      for (const p of connection
        .prepare('SELECT image_path,thumbnail_path FROM projects WHERE id != ?')
        .all(excludingProjectId))
        add(p);
      for (const r of connection
        .prepare(
          `SELECT v.snapshot_json FROM work_versions v JOIN works w ON w.id=v.work_id
        WHERE v.parent_id IS NULL AND v.id NOT IN (SELECT version_id FROM deleted_versions)`,
        )
        .all())
        add(JSON.parse(r.snapshot_json));
      for (const r of connection
        .prepare(
          `SELECT p.image_path,p.thumbnail_path FROM version_images i JOIN projects p ON p.id=i.project_id
        JOIN work_versions v ON v.id=i.version_id JOIN works w ON w.id=v.work_id
        WHERE v.id NOT IN (SELECT version_id FROM deleted_versions)`,
        )
        .all())
        add(r);
      return paths;
    },
  };
}
