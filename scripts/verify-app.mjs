import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { acceptanceOptions } from './acceptance-options.mjs';
const options = acceptanceOptions();
const runner = fileURLToPath(new URL('./verify-app-profile.mjs', import.meta.url));
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [runner, ...args, ...process.argv.slice(2).filter((arg) => arg !== '--packaged')],
      {
        stdio: 'inherit',
        windowsHide: true,
        shell: false,
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
if (process.argv.includes('--packaged')) {
  process.exitCode = (await run(['--packaged'])) === 0 ? 0 : 1;
} else {
  const output = path.resolve('.codex-runs', options.outputName);
  await fs.mkdir(output, { recursive: true });
  await fs.rm(path.join(output, 'manifest.json'), { force: true });
  const started = Date.now();
  // One set of interactions; the harness revisits appearance under both themes.
  const exit = await run(['--theme=light']);
  const manifest = await fs
    .readFile(path.join(output, 'light', 'manifest.json'), 'utf8')
    .then(JSON.parse)
    .catch((error) => ({
      durationMs: 0,
      screenshots: [],
      checks: [
        { category: '启动', label: '子进程生成验收清单', status: 'failed', error: String(error) },
      ],
    }));
  const checks = manifest.checks;
  const screenshots = manifest.screenshots.map((shot) => ({ ...shot, file: `light/${shot.file}` }));
  const summary = {
    slow: options.slow,
    category: options.category,
    platform: process.platform,
    packaged: false,
    wallMs: Date.now() - started,
    durationMs: manifest.durationMs,
    checks,
    screenshots,
  };
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(summary, null, 2));
  const failed = checks.filter((check) => check.status === 'failed');
  console.log(
    `验收：${checks.filter((check) => check.status === 'passed').length} 条通过，${failed.length} 条失败，${checks.filter((check) => check.status === 'uncovered').length} 条本平台未覆盖；${(summary.wallMs / 1000).toFixed(1)} 秒`,
  );
  process.exitCode = exit === 0 && failed.length === 0 && checks.length > 0 ? 0 : 1;
}
