import { createServer, build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serve = process.argv.includes('--serve');
const output = path.join(root, '.codex-runs', '004');
await mkdir(output, { recursive: true });
let server;
if (serve) {
  server = await createServer({
    root,
    server: { host: '127.0.0.1', port: 5174, strictPort: true, open: false },
  });
  await server.listen();
} else {
  const outDir = path.join(output, 'site');
  await build({
    configFile: false,
    root,
    base: './',
    plugins: [react()],
    build: {
      outDir,
      emptyOutDir: true,
      rolldownOptions: { input: path.join(root, 'ui-showcase.html') },
    },
  });
  server = await preview({
    configFile: false,
    root,
    build: { outDir },
    preview: { host: '127.0.0.1', port: 0, open: false },
  });
}
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}`;
if (serve) {
  console.log(`${url}/ui-showcase.html?theme=light`);
  console.log(`${url}/ui-showcase.html?theme=dark`);
} else {
  const appDirectory = path.join(output, 'app');
  await mkdir(appDirectory, { recursive: true });
  await mkdir(path.join(output, 'profile'), { recursive: true });
  await writeFile(
    path.join(appDirectory, 'package.json'),
    JSON.stringify({ name: 'nps-ui-showcase', version: '1.0.0', main: 'main.cjs' }),
  );
  await copyFile(
    path.join(root, 'scripts', 'ui-screenshot.cjs'),
    path.join(appDirectory, 'main.cjs'),
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(electron, [appDirectory, `--origin=${url}`, `--output=${output}`], {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      child.stdout.on('data', (data) => process.stdout.write(data));
      child.stderr.on('data', (data) => process.stderr.write(data));
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Screenshot timeout'));
      }, 60000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`Electron exited ${code}`));
      });
    });
  } finally {
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}
