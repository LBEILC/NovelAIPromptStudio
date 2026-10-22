import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function inTemporaryDirectory(file, directory) {
  if (!file) return false;
  const relative = path.relative(path.resolve(directory), path.resolve(file));
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function preserveWorkOriginal(project, directory) {
  const temporary = path.join(directory, 'workbench-temp');
  const saved = new Map();
  const copy = (file) => {
    if (!inTemporaryDirectory(file, temporary)) return file;
    if (saved.has(file)) return saved.get(file);
    const targetDirectory = path.join(directory, 'work-originals');
    fs.mkdirSync(targetDirectory, { recursive: true });
    const target = path.join(targetDirectory, `${crypto.randomUUID()}${path.extname(file)}`);
    fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
    saved.set(file, target);
    return target;
  };
  return {
    ...project,
    image_path: copy(project.image_path),
    thumbnail_path: copy(project.thumbnail_path),
  };
}

export function sameOriginalMetadata(a, b) {
  const metadata = b.metadata;
  if (
    !metadata?.model ||
    metadata.seed === '' ||
    metadata.seed == null ||
    !metadata.width ||
    !metadata.height
  )
    return false;
  if (
    !['prompt_raw', 'negative_prompt', 'seed', 'width', 'height', 'model'].every(
      (key) => a.metadata?.[key] !== undefined && String(a.metadata[key]) === String(metadata[key]),
    )
  )
    return false;
  const characters = (p) =>
    (p.prompt_structure?.characters || []).map((c) => [c.prompt_raw, c.undesired_raw]);
  return JSON.stringify(characters(a)) === JSON.stringify(characters(b));
}

// Only missing temporary originals with exactly one surviving library match are repaired.
export function migrateWorkOriginals(
  connection,
  filePath,
  versions,
  loadProject,
  { copy = fs.copyFileSync } = {},
) {
  const key = 'work_originals_v1';
  if (connection.prepare('SELECT 1 FROM app_meta WHERE key=?').get(key))
    return { repaired: 0, skipped: 0, alreadyApplied: true };
  const roots = connection
    .prepare('SELECT work_id,snapshot_json FROM work_versions WHERE parent_id IS NULL')
    .all()
    .filter((row) => {
      const p = JSON.parse(row.snapshot_json);
      return (
        p.image_path &&
        path.basename(path.dirname(p.image_path)) === 'workbench-temp' &&
        !fs.existsSync(p.image_path)
      );
    });
  const library = roots.length
    ? connection
        .prepare("SELECT id FROM projects WHERE deleted_at='' ")
        .all()
        .map((row) => loadProject(row.id))
        .filter((p) => fs.existsSync(p.image_path))
    : [];
  const repairs = roots.flatMap((row) => {
    const matches = library.filter((p) => sameOriginalMetadata(JSON.parse(row.snapshot_json), p));
    return matches.length === 1 ? [{ workId: row.work_id, image: matches[0] }] : [];
  });
  // Publish a durable, exclusive backup before writing either repairs or the migration marker.
  const backup = path.join(
    path.dirname(filePath),
    `studio.pre-work-originals-${crypto.randomUUID()}.sqlite`,
  );
  const temporary = `${backup}.tmp`;
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
  connection.exec('SAVEPOINT work_originals_migration');
  try {
    for (const repair of repairs) versions.bindOriginal(repair.workId, repair.image);
    const result = { repaired: repairs.length, skipped: roots.length - repairs.length };
    connection.prepare('INSERT INTO app_meta VALUES (?,?)').run(key, JSON.stringify(result));
    connection.exec('RELEASE work_originals_migration');
    return result;
  } catch (error) {
    connection.exec('ROLLBACK TO work_originals_migration; RELEASE work_originals_migration');
    throw error;
  }
}
