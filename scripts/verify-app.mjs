import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const runner = fileURLToPath(new URL('./verify-app-profile.mjs', import.meta.url));
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner, ...args], {
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
if (process.argv.includes('--packaged')) {
  process.exitCode = (await run(['--packaged'])) === 0 ? 0 : 1;
} else {
  const output = path.resolve('.codex-runs/acceptance');
  await fs.mkdir(output, { recursive: true });
  await fs.rm(path.join(output, 'manifest.json'), { force: true });
  const started = Date.now();
  const manifests = [];
  const exits = [];
  // Sequential because both runs use the real clipboard and native theme.
  for (const theme of ['light', 'dark']) {
    exits.push(await run([`--theme=${theme}`]));
    const manifest = await fs
      .readFile(path.join(output, theme, 'manifest.json'), 'utf8')
      .then(JSON.parse);
    manifests.push(manifest);
  }
  const checks = manifests.flatMap((manifest) =>
    manifest.checks.map((check) => ({
      ...check,
      theme: manifest.theme,
      label: `${check.label}（两套主题·${manifest.theme === 'light' ? '浅色' : '深色'}）`,
    })),
  );
  const screenshots = manifests.flatMap((manifest) =>
    manifest.screenshots.map((shot) => ({ ...shot, file: `${manifest.theme}/${shot.file}` })),
  );
  const summary = {
    platform: process.platform,
    packaged: false,
    wallMs: Date.now() - started,
    durationMs: manifests.reduce((total, manifest) => total + manifest.durationMs, 0),
    checks,
    screenshots,
  };
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(summary, null, 2));
  const failed = checks.filter((check) => check.status === 'failed');
  console.log(
    `两套主题验收：${checks.filter((check) => check.status === 'passed').length} 条通过，${failed.length} 条失败，${checks.filter((check) => check.status === 'uncovered').length} 条本平台未覆盖；${(summary.wallMs / 1000).toFixed(1)} 秒`,
  );
  process.exitCode =
    exits.every((code) => code === 0) && failed.length === 0 && checks.length > 0 ? 0 : 1;
}
