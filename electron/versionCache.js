// Connection-local revisions also observe writes made by trash, restore and sharing.
// TEMP tables/triggers never change the on-disk schema or older-version compatibility.
export function createVersionCache(connection, externalRevision = () => 0) {
  connection.exec(
    'CREATE TEMP TABLE IF NOT EXISTS version_cache_revisions (work_id TEXT PRIMARY KEY, revision TEXT)',
  );
  const sources = {
    works: (r) => `SELECT ${r}.id`,
    work_versions: (r) => `SELECT ${r}.work_id`,
    version_images: (r) => `SELECT work_id FROM work_versions WHERE id=${r}.version_id`,
    deleted_versions: (r) => `SELECT work_id FROM work_versions WHERE id=${r}.version_id`,
    removed_originals: (r) => `SELECT ${r}.work_id`,
    work_branch_names: (r) => `SELECT work_id FROM work_versions WHERE branch_id=${r}.branch_id`,
    version_image_random: (r) =>
      `SELECT v.work_id FROM version_images i JOIN work_versions v ON v.id=i.version_id WHERE i.id=${r}.image_id`,
    version_image_variants: (r) =>
      `SELECT v.work_id FROM version_images i JOIN work_versions v ON v.id=i.version_id WHERE i.id=${r}.image_id`,
    projects: (
      r,
    ) => `SELECT v.work_id FROM version_images i JOIN work_versions v ON v.id=i.version_id WHERE i.project_id=${r}.id
      UNION SELECT id FROM works WHERE json_extract(origin_json,'$.id')=${r}.id OR json_extract(origin_json,'$.image_path')=${r}.image_path`,
  };
  for (const [table, workIds] of Object.entries(sources)) {
    for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
      const rows = event === 'UPDATE' ? ['OLD', 'NEW'] : [event === 'DELETE' ? 'OLD' : 'NEW'];
      // Random tokens prevent a rolled-back revision from matching a later write.
      const body = rows.map(
        (row) => `INSERT INTO version_cache_revisions
        SELECT *, hex(randomblob(16)) FROM (${workIds(row)}) AS affected WHERE true
        ON CONFLICT(work_id) DO UPDATE SET revision=excluded.revision;`,
      );
      connection.exec(`CREATE TEMP TRIGGER IF NOT EXISTS version_cache_${table}_${event}
        ${event === 'DELETE' ? 'BEFORE' : 'AFTER'} ${event} ON main.${table} BEGIN
        ${body.join('\n')}
        END`);
    }
  }
  const revision = connection.prepare(
    'SELECT revision FROM version_cache_revisions WHERE work_id=?',
  );
  const dataVersion = connection.prepare('PRAGMA data_version');
  const entries = new Map();
  return {
    read(workId, load) {
      const key = `${revision.get(workId)?.revision || ''}:${dataVersion.get().data_version}:${externalRevision()}`;
      let entry = entries.get(workId);
      if (!entry || entry.key !== key) entry = { key, value: load() };
      entries.delete(workId);
      entries.set(workId, entry);
      if (entries.size > 64) entries.delete(entries.keys().next().value);
      return entry.value;
    },
  };
}
