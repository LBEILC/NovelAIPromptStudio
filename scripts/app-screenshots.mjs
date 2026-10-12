import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { screenshotScenes } from './app-screenshot-scenes.mjs';
import { requireFont } from './fonts.mjs';

await requireFont();

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-app-screens-'));
let child;
try {
  await fs.writeFile(path.join(root, 'owner'), 'screenshots:app');
  const output = path.resolve('.codex-runs/screens');
  await fs.mkdir(output, { recursive: true });
  await fs.rm(path.join(output, 'manifest.json'), { force: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NOVELAI_DEV_URL;
  const args = ['.', `--app-screenshots=${root}`];
  if (process.argv.includes('--workbench')) args.push('--app-screenshot-workbench');
  if (process.argv.includes('--constrain-window')) args.push('--app-screenshot-constrain-window');
  child = spawn(electron, args, {
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  const stop = () => child.kill();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const timeout = setTimeout(stop, 300_000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code));
    });
    if (code !== 0) throw new Error(`Application screenshots failed (${code})`);
    const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
    if (manifest.fontProof?.length !== 2) throw new Error('Missing actual rendered font evidence');
    const expected = screenshotScenes
      .filter((scene) => !process.argv.includes('--workbench') || scene.page === 'workbench')
      .flatMap((scene) => ['light', 'dark'].map((theme) => `${scene.name}-${theme}.png`))
      .sort();
    if (
      JSON.stringify(manifest.screenshots.map((item) => item.file).sort()) !==
      JSON.stringify(expected)
    )
      throw new Error('Incomplete screenshot manifest');
    for (const file of expected) {
      if (!(await fs.stat(path.join(output, file))).size)
        throw new Error(`Empty screenshot: ${file}`);
    }
  } finally {
    clearTimeout(timeout);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
} finally {
  // Only remove the exact mkdtemp result, never a supplied/default profile.
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('nai-app-screens-')
  )
    throw new Error('Unsafe cleanup path');
  await fs.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  console.log(`Screenshot temporary directory removed: ${root}`);
}
