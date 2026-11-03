import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { findRunLeftovers } from './clean-runs.mjs';

let root;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'clean-runs-test-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function file(relative, bytes = 10) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.alloc(bytes));
}

async function age(relative, hours) {
  const time = new Date(Date.now() - hours * 3600_000);
  await fs.utimes(path.join(root, relative), time, time);
}

test('finds rebuildable leftovers and keeps evidence', async () => {
  await file('070-downloaded-app/NovelAI Prompt Studio.exe');
  await file('070-downloaded-app/locales/en-US.pak');
  await file('080-release/NovelAI-Prompt-Studio-Setup-1.8.0-x64.exe');
  await file('080-release/release.json');
  await file('080-release/SHA256SUMS.txt');
  await file('082-dependencies/node_modules/a/index.js');
  await file('082-dependencies/package.json');
  await file('027-temp/nai-acceptance-abc/userData/data/studio.sqlite');
  await file('research/asr-env/pyvenv.cfg');
  await file('research/transcript.txt');
  await file('research/video/source.mp4');
  await file('bench/renderer-0.heapsnapshot');
  await file('bench/summary.json');
  await file('acceptance/manifest.json');
  await file('acceptance/home-light.png');
  await file('ci.log');
  await file('050/installer/$PLUGINSDIR/app-64.7z');
  await file('053/parallel/0');
  await file('053/parallel/1');
  await file('053/notes.md');
  await file('150/part-19');
  await file('150/download.py');
  await file('research/models/model.part056');
  await file('research/wheels/numpy.part');
  await file('worktree/.git');
  await file('worktree/package.json');
  for (const entry of await fs.readdir(root)) await age(entry, 48);

  const { found, worktrees } = await findRunLeftovers(root);
  const relative = found.map((item) => path.relative(root, item.path).replaceAll('\\', '/')).sort();
  expect(relative).toEqual([
    '027-temp/nai-acceptance-abc',
    '050/installer',
    '053/parallel',
    '070-downloaded-app',
    '080-release/NovelAI-Prompt-Studio-Setup-1.8.0-x64.exe',
    '082-dependencies/node_modules',
    '150/part-19',
    'bench/renderer-0.heapsnapshot',
    'research/asr-env',
    'research/models/model.part056',
    'research/wheels/numpy.part',
  ]);
  expect(worktrees.map((item) => path.basename(item))).toEqual(['worktree']);
});

test('skips recent and explicitly kept task folders', async () => {
  await file('122-release/NovelAI-Prompt-Studio-Setup-2.0.3-x64.exe');
  await file('121-release/NovelAI-Prompt-Studio-Setup-2.0.2-x64.exe');
  await file('old/app.zip');
  await age('121-release', 48);
  await age('old', 48);

  const result = await findRunLeftovers(root, { keep: ['121-release'] });
  expect(result.found.map((item) => path.basename(item.path))).toEqual(['app.zip']);
  expect(result.skipped.sort()).toEqual(['121-release', '122-release']);
});
