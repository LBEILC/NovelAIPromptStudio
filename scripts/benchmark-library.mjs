import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { seedLibrary } from './library-benchmark/fixture.mjs';

const runs = Number(process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] || 3);
if (![1, 3].includes(runs)) throw Error('Use --runs=1 or --runs=3');
const heapSnapshot = process.argv.includes('--heap-snapshot');
const keepFixture = process.argv.includes('--keep-fixture');
const smoke = process.argv.includes('--smoke');
const buildDirectory = path.resolve(
  process.argv.find((a) => a.startsWith('--build-dir='))?.slice('--build-dir='.length) || 'dist',
);
const count = smoke
  ? 200
  : Number(process.argv.find((a) => a.startsWith('--size='))?.split('=')[1] || 10000);
if (!smoke && ![10000, 50000].includes(count)) throw Error('Use --size=10000 or --size=50000');
const output = path.resolve('.codex-runs/library-benchmark', `${count}-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const reuseRoot = process.argv
  .find((a) => a.startsWith('--fixture-root='))
  ?.slice('--fixture-root='.length);
const root = reuseRoot
  ? path.resolve(reuseRoot)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'nai-acceptance-'));
if (
  reuseRoot &&
  (path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('nai-acceptance-') ||
    fs.lstatSync(root).isSymbolicLink() ||
    fs.readFileSync(path.join(root, 'owner'), 'utf8') !== 'verify:app')
)
  throw Error('Only an owned disposable benchmark fixture can be reused');
const require = createRequire(import.meta.url);
const samples = [];
try {
  fs.writeFileSync(path.join(root, 'owner'), 'verify:app');
  fs.cpSync(buildDirectory, path.join(root, 'build'), { recursive: true });
  const fixture = reuseRoot
    ? JSON.parse(fs.readFileSync(path.join(root, 'fixture.json'), 'utf8'))
    : await seedLibrary(root, count, smoke ? 10 : 1000);
  if (fixture.count !== count) throw Error('Fixture size mismatch');
  fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify(fixture));
  const data = path.join(root, 'userData', 'data');
  const snapshot = path.join(root, 'baseline.sqlite');
  if (!reuseRoot) fs.copyFileSync(path.join(data, 'studio.sqlite'), snapshot);
  const assetManifest = path.join(root, 'fixture-assets.json');
  const originalAssets = reuseRoot
    ? JSON.parse(fs.readFileSync(assetManifest, 'utf8'))
    : Object.fromEntries(
        ['images', 'thumbnails'].map((name) => [
          name,
          fs.readdirSync(path.join(root, 'userData/assets', name)),
        ]),
      );
  if (!reuseRoot) fs.writeFileSync(assetManifest, JSON.stringify(originalAssets));
  const assetNames = Object.fromEntries(
    ['images', 'thumbnails'].map((name) => [name, new Set(originalAssets[name])]),
  );
  for (let run = 0; run < runs; run++) {
    fs.copyFileSync(snapshot, path.join(data, 'studio.sqlite'));
    for (const suffix of ['-wal', '-shm'])
      fs.rmSync(path.join(data, `studio.sqlite${suffix}`), { force: true });
    for (const [name, original] of Object.entries(assetNames)) {
      const directory = path.join(root, 'userData/assets', name);
      for (const file of fs.readdirSync(directory))
        if (!original.has(file)) fs.rmSync(path.join(directory, file));
    }
    // Each process starts with an empty workbench and renderer storage.
    fs.rmSync(path.join(root, 'userData/workbench-session.json'), { force: true });
    const storage = path.join(root, 'sessionData');
    if (path.dirname(storage) !== root) throw Error('Invalid storage cleanup');
    fs.rmSync(storage, { recursive: true, force: true });
    const resultPath = path.join(output, `run-${run}.json`);
    fs.writeFileSync(
      path.join(root, 'run.json'),
      JSON.stringify({
        fullLibraryBenchmark: true,
        heapSnapshot,
        count,
        output,
        resultPath,
        startedAt: Date.now(),
        run,
        importCount: smoke ? 10 : 1000,
      }),
    );
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve, reject) => {
      const child = spawn(
        require('electron'),
        ['.', `--verify-app=${root}`, ...(heapSnapshot ? ['--js-flags=--expose-gc'] : [])],
        {
          env,
          shell: false,
          windowsHide: true,
          stdio: 'inherit',
        },
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(Error('Benchmark exceeded 60 minutes'));
      }, 3600000);
      child.on('error', reject);
      child.on('exit', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(Error(`Electron exit ${code}`));
      });
    });
    samples.push(JSON.parse(fs.readFileSync(resultPath, 'utf8')));
  }
  if (
    samples.some(
      (sample) =>
        !Object.values(sample).every(Number.isFinite) ||
        sample.scrollInitialHeight !== sample.scrollFinalHeight ||
        sample.scrollInitialHeight !== samples[0].scrollInitialHeight ||
        sample.scrollViewportHeight !== samples[0].scrollViewportHeight,
    )
  )
    throw Error('Benchmark samples must be finite and use the same stable gallery geometry');
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const medians = Object.fromEntries(
    Object.keys(samples[0])
      .filter((k) => typeof samples[0][k] === 'number')
      .map((k) => [k, median(samples.map((s) => s[k]))]),
  );
  const result = {
    environment: {
      cpu: os.cpus()[0].model,
      logicalCpus: os.cpus().length,
      memoryBytes: os.totalmem(),
      platform: process.platform,
      release: os.release(),
      node: process.version,
    },
    fixture,
    samples,
    medians,
  };
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, medians }, null, 2));
} finally {
  // Only remove the exact disposable directory created above, never a caller-supplied path.
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('nai-acceptance-')
  )
    throw Error('Invalid cleanup target');
  if (keepFixture) console.log(JSON.stringify({ fixtureRoot: root }));
  else fs.rmSync(root, { recursive: true, force: true });
}
