import { createServer, build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { bundledMiSans } from './font-vite.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import referenceSupport from './reference-availability.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serve = process.argv.includes('--serve');
const output = path.join(root, '.codex-runs', '004a');
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
    plugins: [react(), bundledMiSans()],
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
  // Serve the unchanged design sources locally; CI must not need Google Fonts.
  const referenceServer = createHttpServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/offline-fonts.css') {
      response.writeHead(200, { 'Content-Type': 'text/css' });
      response.end('/* Offline comparison uses the declared system font fallbacks. */');
      return;
    }
    if (!/^\/design\/[a-z-]+\.(?:html|css|js)$/.test(pathname)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const content = await readFile(path.join(root, pathname.slice(1)));
      const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
      response.writeHead(200, { 'Content-Type': `${type[path.extname(pathname)]}; charset=utf-8` });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => referenceServer.listen(0, '127.0.0.1', resolve));
  const referenceOrigin = `http://127.0.0.1:${referenceServer.address().port}`;
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
  await copyFile(
    path.join(root, 'scripts', 'reference-availability.cjs'),
    path.join(appDirectory, 'reference-availability.cjs'),
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        electron,
        [
          appDirectory,
          `--origin=${url}`,
          `--reference-origin=${referenceOrigin}`,
          `--output=${output}`,
        ],
        {
          cwd: root,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
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
    for (const theme of referenceSupport.referenceAvailability(root).available
      ? ['light', 'dark']
      : []) {
      const paths = ['reference', 'showcase'].map((name) =>
        path.join(output, `${name}-${theme}.png`),
      );
      const sizes = await Promise.all(paths.map((file) => sharp(file).metadata()));
      const height = Math.max(...sizes.map((size) => size.height));
      const pixel = await sharp(paths[1])
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
      await sharp({
        create: {
          width: sizes[0].width + sizes[1].width,
          height,
          channels: 4,
          background: { r: pixel[0], g: pixel[1], b: pixel[2], alpha: 1 },
        },
      })
        .composite([
          { input: paths[0], left: 0, top: 0 },
          { input: paths[1], left: sizes[0].width, top: 0 },
        ])
        .png()
        .toFile(path.join(output, `comparison-${theme}.png`));
    }
  } finally {
    await new Promise((resolve) => server.httpServer.close(resolve));
    await new Promise((resolve) => referenceServer.close(resolve));
  }
}
