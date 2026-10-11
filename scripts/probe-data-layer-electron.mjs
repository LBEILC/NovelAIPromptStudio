import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build, Platform } from 'electron-builder';

const require = createRequire(import.meta.url);
const root = path.resolve('.codex-runs/data-layer/electron');
const app = path.join(root, 'app');
fs.mkdirSync(app, { recursive: true });
fs.copyFileSync(
  new URL('./data-layer/electron-probe.cjs', import.meta.url),
  path.join(app, 'main.cjs'),
);
const version = require('electron/package.json').version;
const candidateVersion = require('better-sqlite3/package.json').version;
fs.writeFileSync(
  path.join(app, 'package.json'),
  JSON.stringify(
    {
      name: 'sqlite-research-probe',
      version: '1.0.0',
      main: 'main.cjs',
      description: 'Isolated database research probe',
      author: 'NovelAI Prompt Studio',
      dependencies: { 'better-sqlite3': candidateVersion },
    },
    null,
    2,
  ),
);
for (const name of ['better-sqlite3', 'node-addon-api'])
  fs.cpSync(
    path.dirname(require.resolve(`${name}/package.json`)),
    path.join(app, 'node_modules', name),
    { recursive: true },
  );
const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
delete env.ELECTRON_RUN_AS_NODE;
const run = (file, args, label) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (data) => {
      log += data;
    });
    child.stderr.on('data', (data) => {
      log += data;
    });
    const timeout = setTimeout(() => child.kill(), 60000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      fs.writeFileSync(path.join(root, `${label}.log`), log);
      if (code) reject(Error(`${label}: exit ${code}: ${log}`));
      else resolve();
    });
  });
await run(
  require('electron'),
  [app, `--output=${path.join(root, 'development.json')}`],
  'development',
);
if (!process.argv.includes('--dev-only')) {
  const output = path.join(root, 'package');
  const buildOptions = {
    targets: Platform.current().createTarget(
      process.platform === 'win32' ? ['dir', 'nsis'] : 'dir',
    ),
    projectDir: app,
    config: {
      appId: 'studio.novelai.sqlite-research',
      electronVersion: version,
      npmRebuild: false,
      asar: true,
      asarUnpack: ['node_modules/better-sqlite3/prebuilds/**/*'],
      directories: { output },
      win: { signAndEditExecutable: false },
      mac: { identity: null },
      nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
    },
  };
  await build(buildOptions);
  const bundleDirectory = (directory) =>
    process.platform === 'win32'
      ? path.join(directory, 'win-unpacked')
      : process.platform === 'darwin'
        ? path.join(
            directory,
            process.arch === 'arm64' ? 'mac-arm64' : 'mac',
            'sqlite-research-probe.app',
          )
        : path.join(directory, 'linux-unpacked');
  const executable = path.join(
    bundleDirectory(output),
    ...(process.platform === 'darwin' ? ['Contents', 'MacOS'] : []),
    process.platform === 'win32' ? 'sqlite-research-probe.exe' : 'sqlite-research-probe',
  );
  await run(executable, [`--output=${path.join(root, 'packaged.json')}`], 'packaged');
  const size = (directory) =>
    fs
      .readdirSync(directory, { withFileTypes: true })
      .reduce(
        (sum, entry) =>
          sum +
          (entry.isDirectory()
            ? size(path.join(directory, entry.name))
            : fs.statSync(path.join(directory, entry.name)).size),
        0,
      );
  const installerSize = (directory) => {
    const installer = fs.readdirSync(directory).find((name) => name.endsWith('.exe'));
    return installer ? fs.statSync(path.join(directory, installer)).size : null;
  };
  const candidateSize = size(bundleDirectory(output));
  const baselineOutput = path.join(root, 'baseline-package');
  const manifestPath = path.join(app, 'package.json');
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  try {
    const baselineManifest = JSON.parse(manifest);
    delete baselineManifest.dependencies;
    fs.writeFileSync(manifestPath, JSON.stringify(baselineManifest));
    await build({
      ...buildOptions,
      config: { ...buildOptions.config, directories: { output: baselineOutput } },
    });
  } finally {
    fs.writeFileSync(manifestPath, manifest);
  }
  fs.writeFileSync(
    path.join(root, 'sizes.json'),
    JSON.stringify(
      {
        directoryBytes: candidateSize,
        baselineDirectoryBytes: size(bundleDirectory(baselineOutput)),
        installerBytes: installerSize(output),
        baselineInstallerBytes: installerSize(baselineOutput),
        betterSqliteBytes: size(path.join(app, 'node_modules', 'better-sqlite3')),
      },
      null,
      2,
    ),
  );
}
console.log(fs.readFileSync(path.join(root, 'development.json'), 'utf8'));
if (!process.argv.includes('--dev-only'))
  console.log(fs.readFileSync(path.join(root, 'packaged.json'), 'utf8'));
for (const name of process.argv.includes('--dev-only')
  ? ['development']
  : ['development', 'packaged']) {
  const report = JSON.parse(fs.readFileSync(path.join(root, `${name}.json`), 'utf8'));
  if (Object.values(report.candidates).some((candidate) => !candidate.ok))
    throw Error(`${name}: SQLite candidate failed`);
}
