import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';

const label = process.argv[2] || 'before';
if (!['before', 'after'].includes(label)) throw Error('Use before or after');
const scenarios = process.argv[3] ? [process.argv[3]] : ['A', 'B'];
if (scenarios.some((s) => !['A', 'B'].includes(s))) throw Error('Use scenario A or B');
for (const scenario of scenarios) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-acceptance-'));
  const output = path.resolve('.codex-runs/generation-performance', label, scenario);
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(root, 'owner'), 'verify:app');
  await fs.writeFile(
    path.join(root, 'run.json'),
    JSON.stringify({ generationBenchmark: true, scenario, output, phase: 0 }),
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(electron, ['.', `--verify-app=${root}`], {
        env,
        stdio: 'inherit',
        windowsHide: true,
        shell: false,
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(Error('Benchmark exceeded 15 minutes'));
      }, 900000);
      child.on('error', reject);
      child.on('exit', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(Error(`Electron exit ${code}`));
      });
    });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (
      path.dirname(root) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith('nai-acceptance-')
    )
      throw Error('Invalid cleanup target');
    await fs.rm(root, { recursive: true, force: true });
  }
}
