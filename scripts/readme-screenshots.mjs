import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
import sharp from 'sharp';
import { requireFont } from './fonts.mjs';

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
  const stop = () => child.kill();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const timeout = setTimeout(stop, 180000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    if (code !== 0) throw Error(`README screenshots failed (${code})`);
  } finally {
    clearTimeout(timeout);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
  const evidence = path.resolve('.codex-runs/readme');
  const manifest = JSON.parse(await fs.readFile(path.join(evidence, 'manifest.json'), 'utf8'));
  if (manifest.screenshots.length !== 4 || manifest.checks.some((c) => c.status !== 'passed'))
    throw Error('Incomplete README screenshots');
  await fs.mkdir('doc/screenshots', { recursive: true });
  for (const name of ['hero', 'workbench', 'library', 'dictionary']) {
    const source = path.join(evidence, `${name}.png`);
    const metadata = await sharp(source).metadata();
    if (metadata.width !== 1920 || metadata.height !== 1080) throw Error('Invalid screenshot size');
    const output = path.join('doc/screenshots', `readme-${name}-v100.webp`);
    let buffer;
    for (const quality of [90, 85, 80, 75]) {
      buffer = await sharp(source).webp({ quality, effort: 6 }).toBuffer();
      if (buffer.length < 200000) break;
    }
    if (buffer.length >= 200000) throw Error(`Screenshot exceeds 200 KB: ${name}`);
    await fs.writeFile(output, buffer);
    console.log(`${output}: ${buffer.length} bytes, 1920×1080`);
  }
} finally {
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('nai-app-screens-')
  )
    throw Error('Unsafe cleanup path');
  await fs.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
