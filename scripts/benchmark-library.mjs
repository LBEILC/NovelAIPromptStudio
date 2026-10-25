import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { seedLibrary } from './library-benchmark/fixture.mjs';

const smoke = process.argv.includes('--smoke');
const count = smoke
  ? 200
  : Number(process.argv.find((a) => a.startsWith('--size='))?.split('=')[1] || 10000);
if (!smoke && ![10000, 50000].includes(count)) throw Error('Use --size=10000 or --size=50000');
const output = path.resolve('.codex-runs/library-benchmark', `${count}-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-acceptance-'));
const require = createRequire(import.meta.url);
const samples = [];
try {
  fs.writeFileSync(path.join(root, 'owner'), 'verify:app');
  fs.cpSync(path.resolve('dist'), path.join(root, 'build'), { recursive: true });
  const fixture = await seedLibrary(root, count, smoke ? 10 : 1000);
  const data = path.join(root, 'userData', 'data');
  const snapshot = path.join(root, 'baseline.sqlite');
  fs.copyFileSync(path.join(data, 'studio.sqlite'), snapshot);
  const assetNames = Object.fromEntries(
    ['images', 'thumbnails'].map((name) => [
      name,
      new Set(fs.readdirSync(path.join(root, 'userData/assets', name))),
    ]),
  );
  for (let run = 0; run < 3; run++) {
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
      const child = spawn(require('electron'), ['.', `--verify-app=${root}`], {
        env,
        shell: false,
        windowsHide: true,
        stdio: 'inherit',
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(Error('Benchmark exceeded 30 minutes'));
      }, 1800000);
      child.on('error', reject);
      child.on('exit', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(Error(`Electron exit ${code}`));
      });
    });
    samples.push(JSON.parse(fs.readFileSync(resultPath, 'utf8')));
  }
  const median = (values) => [...values].sort((a, b) => a - b)[1];
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
  fs.rmSync(root, { recursive: true, force: true });
}
