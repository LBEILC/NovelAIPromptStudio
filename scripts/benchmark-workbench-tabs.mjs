import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { createRunTempDir, removeRunTempDir } from './lib/runTempDirs.mjs';

const label = process.argv[2];
if (!['before', 'after'].includes(label)) throw Error('Specify before or after');
const sizes = process.argv[3] ? [Number(process.argv[3])] : [10, 200];
for (const count of sizes) {
  if (![10, 200].includes(count)) throw Error('Specify 10 or 200');
  const results = [];
  for (let round = 1; round <= (count === 10 ? 3 : 1); round++) {
    const root = await createRunTempDir('nai-acceptance-', 'benchmark:workbench-tabs');
    const output = path.resolve('.codex-runs/workbench-tabs', label, String(count), String(round));
    try {
      await fs.mkdir(output, { recursive: true });
      await fs.writeFile(path.join(root, 'owner'), 'verify:app');
      for (const phase of [0, 1]) {
        const config = { tabsBenchmark: true, label, count, phase, output, started: Date.now() };
        await fs.writeFile(path.join(root, 'run.json'), JSON.stringify(config));
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(electron, ['.', '--verify-app=' + root], {
          env,
          stdio: 'inherit',
          windowsHide: true,
        });
        const code = await new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('exit', resolve);
        });
        if (code !== 0) throw Error('Benchmark process exited with ' + code);
      }
      results.push(JSON.parse(await fs.readFile(path.join(output, 'metrics.json'), 'utf8')));
    } finally {
      await removeRunTempDir(root);
    }
  }
  console.table(
    Object.fromEntries(
      Object.keys(results[0]).map((key) => [
        key,
        results.map((row) => row[key]).sort((a, b) => a - b)[Math.floor(results.length / 2)],
      ]),
    ),
  );
}
