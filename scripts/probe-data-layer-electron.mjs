import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build, Platform } from 'electron-builder';

const require = createRequire(import.meta.url);
const root = path.resolve('.codex-runs/data-layer/electron');
fs.mkdirSync(root, { recursive: true });
const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
delete env.ELECTRON_RUN_AS_NODE;
const run = (file, args, label) =>
  new Promise((resolve, reject) => {
    const output = path.join(root, `${label}.json`);
    fs.rmSync(output, { force: true });
    const child = spawn(file, [...args, `--database-probe-output=${output}`], {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (chunk) => {
      log += chunk;
    });
    child.stderr.on('data', (chunk) => {
      log += chunk;
    });
    const timeout = setTimeout(() => child.kill(), 60000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      fs.writeFileSync(path.join(root, `${label}.log`), log);
      if (code || !fs.existsSync(output)) return reject(Error(`${label}: exit ${code}: ${log}`));
      const report = JSON.parse(fs.readFileSync(output, 'utf8'));
      if (!report.ok || !report.productionOpen || (label === 'packaged' && !report.packaged))
        return reject(Error(`${label}: probe did not pass`));
      console.log(
        `${label}: node:sqlite ${report.sqlite}, production open/reopen passed, packaged=${report.packaged}`,
      );
      resolve();
    });
  });

await run(require('electron'), ['.'], 'development');
if (!process.argv.includes('--dev-only')) {
  const output = path.join(root, 'production-package');
  await build({
    targets: Platform.current().createTarget('dir'),
    projectDir: path.resolve('.'),
    config: {
      directories: { output },
      win: { signAndEditExecutable: false },
      mac: { identity: null },
    },
  });
  const executable =
    process.platform === 'win32'
      ? path.join(output, 'win-unpacked', 'NovelAI Prompt Studio.exe')
      : process.platform === 'darwin'
        ? path.join(
            output,
            process.arch === 'arm64' ? 'mac-arm64' : 'mac',
            'NovelAI Prompt Studio.app',
            'Contents',
            'MacOS',
            'NovelAI Prompt Studio',
          )
        : path.join(output, 'linux-unpacked', 'novelai-prompt-studio');
  await run(executable, [], 'packaged');
}
