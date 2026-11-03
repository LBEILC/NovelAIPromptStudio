import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { OWNER_FILE, findStaleRunTempDirs, removeRunTempDir } from './runTempDirs.mjs';

let parent;
beforeEach(async () => {
  parent = await fs.mkdtemp(path.join(os.tmpdir(), 'run-temp-dirs-test-'));
});
afterEach(async () => {
  await fs.rm(parent, { recursive: true, force: true });
});

async function profile(name, owner, ageMs = 0) {
  const directory = path.join(parent, name);
  await fs.mkdir(directory);
  if (owner) await fs.writeFile(path.join(directory, OWNER_FILE), JSON.stringify(owner));
  if (ageMs) {
    const time = new Date(Date.now() - ageMs);
    await fs.utimes(directory, time, time);
  }
  return directory;
}

test('removes profiles of dead runs and keeps live, kept and recent ones', async () => {
  const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
  await profile('nai-acceptance-dead', { pid: deadPid });
  await profile('nai-acceptance-live', { pid: process.pid });
  await profile('nai-acceptance-kept', { pid: deadPid, keep: true });
  await profile('nai-ui-preview-legacy-old', null, 48 * 60 * 60 * 1000);
  await profile('nai-ui-preview-legacy-new', null);
  await profile('someone-else-dead', { pid: deadPid });

  const stale = (await findStaleRunTempDirs(parent)).map((item) => path.basename(item.path));
  expect(stale.sort()).toEqual(['nai-acceptance-dead', 'nai-ui-preview-legacy-old']);
});

test('sweep deletes only stale project profiles', async () => {
  const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
  await profile('nai-app-screens-dead', { pid: deadPid });
  await profile('nai-app-screens-live', { pid: process.pid });
  for (const item of await findStaleRunTempDirs(parent)) await removeRunTempDir(item.path, parent);
  expect((await fs.readdir(parent)).sort()).toEqual(['nai-app-screens-live']);
});

test('refuses to remove paths outside the parent or without a project prefix', async () => {
  const other = await profile('not-a-profile', null);
  await expect(removeRunTempDir(other, parent)).rejects.toThrow('Unsafe cleanup path');
  await expect(
    removeRunTempDir(path.join(parent, 'nested', 'nai-acceptance-x'), parent),
  ).rejects.toThrow('Unsafe cleanup path');
});
