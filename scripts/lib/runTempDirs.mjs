import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Disposable profiles made by the project's own scripts. A run that is killed
// (timeout, closed terminal, TerminateProcess on Windows) never reaches its
// `finally`, so every run first removes the leftovers of dead runs.
export const RUN_TEMP_PREFIXES = [
  'nai-acceptance-',
  'nai-app-screens-',
  'nai-ui-preview-',
  'nai-data-benchmark-',
];
// Separate from `owner`: Electron requires that file to hold the exact mode name.
export const OWNER_FILE = '.run-owner.json';
const LEGACY_STALE_MS = 24 * 60 * 60 * 1000;

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export async function readRunOwner(directory) {
  return fs
    .readFile(path.join(directory, OWNER_FILE), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
}

// Why a directory may be removed, or null while it may still be in use or was
// deliberately kept (`--keep-fixture`).
export async function staleReason(directory, now = Date.now()) {
  const owner = await readRunOwner(directory);
  if (owner) {
    if (owner.keep) return null;
    return isProcessAlive(owner.pid) ? null : `进程 ${owner.pid} 已结束`;
  }
  const stat = await fs.stat(directory).catch(() => null);
  if (!stat) return null;
  return now - stat.mtimeMs > LEGACY_STALE_MS ? '无归属记录且超过 24 小时' : null;
}

export async function findStaleRunTempDirs(parent = os.tmpdir(), prefixes = RUN_TEMP_PREFIXES) {
  const entries = await fs.readdir(parent, { withFileTypes: true }).catch(() => []);
  const stale = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !prefixes.some((prefix) => entry.name.startsWith(prefix))) continue;
    const directory = path.join(parent, entry.name);
    const reason = await staleReason(directory);
    if (reason) stale.push({ path: directory, reason });
  }
  return stale;
}

export async function removeRunTempDir(directory, parent = os.tmpdir()) {
  if (
    path.dirname(path.resolve(directory)) !== path.resolve(parent) ||
    !RUN_TEMP_PREFIXES.some((prefix) => path.basename(directory).startsWith(prefix))
  )
    throw new Error(`Unsafe cleanup path: ${directory}`);
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

export async function sweepStaleRunTempDirs(parent = os.tmpdir()) {
  const removed = [];
  for (const item of await findStaleRunTempDirs(parent)) {
    // A file still locked by a hung process is left for the next sweep.
    await removeRunTempDir(item.path, parent).then(
      () => removed.push(item.path),
      () => {},
    );
  }
  return removed;
}

export async function createRunTempDir(prefix, label, { keep = false } = {}) {
  if (!RUN_TEMP_PREFIXES.includes(prefix)) throw new Error(`Unknown temp prefix: ${prefix}`);
  await sweepStaleRunTempDirs();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await writeRunOwner(directory, label, { keep });
  return directory;
}

export async function writeRunOwner(directory, label, { keep = false } = {}) {
  await fs.writeFile(
    path.join(directory, OWNER_FILE),
    JSON.stringify({ pid: process.pid, label, keep, startedAt: new Date().toISOString() }),
  );
}
