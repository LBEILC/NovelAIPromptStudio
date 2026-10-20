import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { requireFont } from './fonts.mjs';

if (!process.env.NPS_COMPARE_SETTINGS_DIR)
  throw Error('Set NPS_COMPARE_SETTINGS_DIR to the approved prototype project directory');
await requireFont();
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-app-screens-'));
try {
  await fs.writeFile(path.join(root, 'owner'), 'screenshots:app');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NOVELAI_DEV_URL;
  const child = spawn(electron, ['.', `--app-screenshots=${root}`, '--app-screenshot-readme'], {
    env,
    stdio: 'inherit',
    windowsHide: true,
    shell: false,
  });
  const timeout = setTimeout(() => child.kill(), 180000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    if (code !== 0) throw Error(`Settings comparison failed (${code})`);
  } finally {
    clearTimeout(timeout);
  }
} finally {
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('nai-app-screens-')
  )
    throw Error('Unsafe cleanup path');
  await fs.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
