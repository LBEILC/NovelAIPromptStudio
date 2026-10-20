import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { appendIntelRelease } from './append-intel-release.mjs';
import { mergeMacMetadata } from './merge-release-artifacts.mjs';

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
const metadata = (arch) => `version: 1.0.0
files:
  - url: Studio-1.0.0-${arch}.zip
    sha512: synthetic-${arch}
    size: 3
path: Studio-1.0.0-${arch}.zip
sha512: synthetic-${arch}
`;

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nps-release-test-'));
  roots.push(root);
  const intel = path.join(root, 'intel');
  await fs.mkdir(intel);
  const remote = new Map([
    ['Studio-1.0.0-arm64.zip', Buffer.from('arm')],
    ['Studio-1.0.0-arm64.dmg', Buffer.from('dmg')],
    ['Setup.exe', Buffer.from('win')],
    ['latest.yml', Buffer.from('version: 1.0.0\npath: Setup.exe\n')],
    ['latest-mac.yml', Buffer.from(metadata('arm64'))],
    ['release-notes.json', Buffer.from('{"version":"1.0.0"}')],
    ['SHA256SUMS.txt', Buffer.from('old sums')],
  ]);
  for (const suffix of ['zip', 'dmg', 'zip.blockmap', 'dmg.blockmap'])
    await fs.writeFile(path.join(intel, `Studio-1.0.0-x64.${suffix}`), `intel ${suffix}`);
  await fs.writeFile(path.join(intel, 'latest-mac.yml'), metadata('x64'));
  const run = vi.fn(async (args) => {
    expect(args[2]).toBe('v1.0.0');
    if (args[1] === 'view')
      return JSON.stringify({
        isDraft: false,
        assets: [...remote.keys()].map((name) => ({ name })),
      });
    if (args[1] === 'download') {
      for (const [name, data] of remote) await fs.writeFile(path.join(args[4], name), data);
    } else if (args[1] === 'upload') {
      for (const file of args.slice(3, -1))
        remote.set(path.basename(file), await fs.readFile(file));
    }
    return '';
  });
  return { intel, remote, run };
}

it('publishes arm64 metadata alone while requiring both architectures by default', () => {
  expect(mergeMacMetadata([metadata('arm64')], ['arm64'])).toBe(metadata('arm64'));
  expect(() => mergeMacMetadata([metadata('arm64')])).toThrow('x64');
});

it('waits for the release, preserves primary assets and notes, and is safe to rerun', async () => {
  const { intel, remote, run } = await fixture();
  const original = new Map(remote);
  const wait = vi.fn();
  run.mockRejectedValueOnce(new Error('not found'));
  await appendIntelRelease('v1.0.0', intel, { run, wait });
  expect(wait).toHaveBeenCalledWith(10_000);
  for (const name of ['Setup.exe', 'Studio-1.0.0-arm64.zip', 'release-notes.json'])
    expect(remote.get(name)).toEqual(original.get(name));
  const uploads = run.mock.calls.filter(([args]) => args[1] === 'upload');
  expect(uploads[0][0].slice(3, -1).every((file) => file.includes('-x64.'))).toBe(true);
  expect(uploads[1][0].map((file) => path.basename(file))).toContain('latest-mac.yml');
  const first = new Map(remote);
  await appendIntelRelease('v1.0.0', intel, { run, wait });
  expect(remote).toEqual(first);
  const mac = remote.get('latest-mac.yml').toString();
  expect(mac.match(/  - url:/g)).toHaveLength(2);
  expect(mac).toContain('-x64.zip');
  expect(mac).toContain('-arm64.zip');
  const sums = remote.get('SHA256SUMS.txt').toString();
  expect(sums).not.toContain('  SHA256SUMS.txt');
  for (const [name, data] of remote) {
    if (name === 'SHA256SUMS.txt') continue;
    expect(sums).toContain(`${createHash('sha256').update(data).digest('hex')}  ${name}\n`);
  }
});

it('times out without uploading when the primary release is unavailable', async () => {
  const { intel } = await fixture();
  const run = vi.fn().mockRejectedValue(new Error('not found'));
  const wait = vi.fn();
  await expect(appendIntelRelease('v1.0.0', intel, { run, wait, attempts: 2 })).rejects.toThrow(
    'polling window',
  );
  expect(run).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledTimes(1);
});

it('keeps primary metadata intact if the Intel installer upload fails', async () => {
  const { intel, remote, run } = await fixture();
  const original = new Map(remote);
  const failingRun = async (args) => {
    if (args[1] === 'upload') throw new Error('upload failed');
    return run(args);
  };
  await expect(appendIntelRelease('v1.0.0', intel, { run: failingRun })).rejects.toThrow(
    'upload failed',
  );
  expect(remote).toEqual(original);
});
