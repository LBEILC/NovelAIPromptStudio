import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { requireFont } from './fonts.mjs';

await requireFont();
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-app-screens-'));
const started = Date.now();
try {
  await fs.writeFile(path.join(root, 'owner'), 'screenshots:app');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NOVELAI_DEV_URL;
  const child = spawn(
    electron,
    [
      '.',
      `--app-screenshots=${root}`,
      '--app-screenshot-readme',
      '--compare-prototype',
      ...(process.argv.includes('--workbench-only') ? ['--compare-workbench-only'] : []),
    ],
    {
      env,
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    },
  );
  const stop = () => child.kill();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const timeout = setTimeout(stop, 600000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    if (code !== 0) throw Error(`Comparison failed (${code})`);
    console.log(
      `Comparison completed in ${((Date.now() - started) / 1000).toFixed(1)}s: .codex-runs/compare/index.html`,
    );
  } finally {
    clearTimeout(timeout);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
} finally {
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('nai-app-screens-')
  )
    throw Error('Unsafe cleanup path');
  await fs.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
