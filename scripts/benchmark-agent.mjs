import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';

const label = process.argv[2] || 'after';
if (!['before', 'after'].includes(label)) throw Error('Use before or after');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-acceptance-'));
const output = path.resolve('.codex-runs', 'agent-performance', label);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(root, 'owner'), 'verify:app');
await fs.writeFile(
  path.join(root, 'run.json'),
  JSON.stringify({
    commandBenchmark: true,
    output,
    phase: 0,
    category: '全部',
    timing: 'record',
  }),
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', `--verify-app=${root}`], {
  env,
  stdio: 'inherit',
  windowsHide: true,
});
const code = await new Promise((resolve) => child.on('exit', resolve));
if (code !== 0) process.exitCode = 1;
else if (label === 'after' && !process.env.CI) {
  const read = async (name) =>
    JSON.parse(
      await fs.readFile(
        path.resolve('.codex-runs/agent-performance', name, 'metrics.json'),
        'utf8',
      ),
    );
  const before = await read('before'),
    after = await read('after');
  const comparison = Object.fromEntries(
    Object.keys(before.metrics).map((key) => [
      key,
      {
        before: before.metrics[key],
        after: after.metrics[key],
        ratio: after.metrics[key] / before.metrics[key],
        passed: after.metrics[key] <= before.metrics[key] * 1.1,
      },
    ]),
  );
  await fs.writeFile(path.join(output, 'comparison.json'), JSON.stringify(comparison, null, 2));
  console.table(comparison);
  if (!process.env.CI && Object.values(comparison).some((item) => !item.passed))
    process.exitCode = 1;
}
