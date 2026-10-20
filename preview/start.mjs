import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { bundledMiSans } from '../scripts/font-vite.mjs';
import { startServices } from './services.mjs';
import { createSession } from './session.mjs';

const root = path.resolve(import.meta.dirname, '..');
const imageDir = path.join(root, 'demo/images/final');
const images = fs
  .readdirSync(imageDir)
  .filter((f) => f.endsWith('.png'))
  .sort()
  .map((f) => path.join(imageDir, f));
const clients = new Set(),
  pending = new Set();
const track = (promise) => {
  pending.add(promise);
  promise.finally(() => pending.delete(promise)).catch(() => {});
  return promise;
};
const emit = (event) => {
  if (resetting && !event.type.startsWith('preview-reset')) return;
  for (const response of clients) response.write(`data: ${JSON.stringify(event)}\n\n`);
};
let session,
  vite,
  backend,
  services,
  shuttingDown = false,
  resetting = false;
const json = (res, data, status = 200) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
};
const body = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128 * 1024 * 1024) throw Error('文件超过128MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
function validatePaths(value, key = '') {
  if (
    typeof value === 'string' &&
    (['path', 'filePath', 'image_path', 'thumbnail_path', 'previewPath'].includes(key) ||
      key === 'paths')
  ) {
    if (value) session.allowedPath(value);
  } else if (Array.isArray(value)) value.forEach((v) => validatePaths(v, key));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) validatePaths(v, k);
}
async function scenario({ action, value }) {
  if (action === 'reset' || action === 'empty') {
    emit({ type: 'preview-reset-start' });
    resetting = true;
    try {
      await Promise.allSettled([...pending]);
      await session.close();
      Object.assign(services.novel.state, {
        tier: 3,
        balance: 10000,
        usage: 12,
        failNext: 0,
        delay: 1500,
      });
      Object.assign(services.state, { aiFail: false, disconnect: false, slowImport: false });
      session = await createSession(services, images, emit, action === 'empty');
    } finally {
      resetting = false;
    }
    emit({ type: 'preview-reset-complete', directory: session.directory });
    return { reload: true };
  }
  if (action === 'token') session.preferences.saveNovelAIToken(value ? 'acceptance-token' : '');
  else if (action === 'ai') session.setAI(Boolean(value));
  else if (action === 'generation-error') {
    if (value === 'offline') services.state.disconnect = true;
    else services.novel.state.failNext = Number(value);
  } else if (action === 'slow-generation') services.novel.state.delay = value ? 6000 : 1500;
  else if (action === 'account') {
    Object.assign(services.novel.state, {
      tier: value === 'unsubscribed' ? 0 : 3,
      usage: value === 'usage' ? 100 : 12,
      balance: value === 'balance' ? 0 : 10000,
    });
    await session.call('account.refresh');
  } else if (action === 'ai-error') services.state.aiFail = true;
  else if (action === 'slow-import') services.state.slowImport = Boolean(value);
  else if (action === 'appearance')
    await session.call('settings.appearance.save', { settings: value });
  else if (action === 'many') {
    const cards = await session.database.loadLibraryCards();
    if (!cards.length) throw Error('请先重置数据');
    const templates = cards.filter((card) => !card.generated_work_id).slice(0, 14);
    if (!templates.length) templates.push(...cards.slice(0, 14));
    const copyDirectory = path.join(session.directory, 'assets', 'many');
    fs.mkdirSync(copyDirectory, { recursive: true });
    const copies = [];
    for (let i = cards.length; i < 2000; i++) {
      const p = structuredClone(session.database.loadProject(templates[i % templates.length].id));
      p.id = crypto.randomUUID();
      p.tags.forEach((t) => (t.id = crypto.randomUUID()));
      p.content_hash = crypto.randomUUID();
      p.name = `演示图片 ${i + 1}`;
      for (const key of ['image_path', 'thumbnail_path']) {
        const target = path.join(copyDirectory, `${p.id}-${key}${path.extname(p[key])}`);
        fs.linkSync(p[key], target);
        p[key] = target;
      }
      copies.push(p);
    }
    session.database.insertProjects(copies);
    emit({
      type: 'workbench',
      session: session.commands.store.get(),
      source: 'ui',
      libraryChanged: true,
    });
  } else if (action === 'agent-edit' || action === 'agent-generate') {
    const current = session.commands.store.get();
    const tabId = current.activeTabId;
    if (!tabId) throw Error('请先打开工作台标签页');
    if (action === 'agent-edit')
      await session.call(
        'tag.set',
        { tabId, scope: 'base:prompt', block: 0, index: 0, text: 'preview traveler' },
        'agent',
      );
    else {
      await session.call('settings.generation.save', { agentMode: 'confirm' });
      for (let i = 0; i < 2; i++)
        await session.call('generate.start', { tabId, count: 1 }, 'agent');
    }
  } else if (!['token', 'ai'].includes(action)) throw Error('未知场景');
  return { reload: ['token', 'ai', 'many'].includes(action) };
}
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of clients) c.end();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  await Promise.allSettled([...pending]);
  await vite?.close();
  backend?.closeAllConnections();
  if (backend) await new Promise((resolve) => backend.close(resolve));
  const directory = session?.directory;
  await session?.close();
  await services?.close();
  console.log('预览已停止，临时目录已删除：', directory);
}
try {
  services = await startServices(images);
  session = await createSession(services, images, emit);
  backend = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const origin = req.headers.origin;
      if (origin && origin !== 'http://127.0.0.1:5180')
        return json(res, { error: 'Origin rejected' }, 403);
      if (resetting) return json(res, { error: '正在重置' }, 409);
      if (url.pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(': ready\n\n');
        res.write(
          `data: ${JSON.stringify({ type: 'preview-session', directory: session.directory })}\n\n`,
        );
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (url.pathname === '/media') {
        const file = session.allowedPath(url.searchParams.get('path'));
        res.setHeader(
          'Content-Type',
          { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[
            path.extname(file)
          ] || 'application/octet-stream',
        );
        fs.createReadStream(file).pipe(res);
        return;
      }
      if (url.pathname === '/status')
        return json(res, { directory: session.directory, blocked: services.blocked });
      if (req.method !== 'POST' || req.headers['x-ui-preview'] !== '1')
        return json(res, { error: 'Request rejected' }, 403);
      if (url.pathname === '/upload') {
        const bytes = await body(req);
        const ext = path.extname(url.searchParams.get('name') || 'image.png').toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.webp', '.zip'].includes(ext))
          throw Error('不支持的文件格式');
        const file = path.join(session.directory, crypto.randomUUID() + ext);
        fs.writeFileSync(file, bytes);
        return json(res, { path: file });
      }
      const input = JSON.parse((await body(req)).toString() || '{}');
      if (url.pathname === '/invoke') {
        validatePaths(input.input);
        return json(res, await track(session.dispatch(input.name, input.input || {})));
      }
      if (url.pathname === '/scenario') return json(res, await scenario(input));
      json(res, { error: 'Not found' }, 404);
    } catch (error) {
      json(res, { error: error.message }, 400);
    }
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const port = backend.address().port;
  services.allowPort(port);
  services.allowPort(5180);
  vite = await createServer({
    configFile: false,
    root,
    optimizeDeps: { entries: ['preview/index.html'] },
    plugins: [
      react(),
      bundledMiSans(),
      {
        name: 'preview-media-url',
        enforce: 'pre',
        transform(code, id) {
          if (id.replaceAll('\\', '/').endsWith('/src/lib/imageStage.js'))
            return code.replace('novelai-media://file?path=', '/__preview/media?path=');
        },
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/') {
              res.writeHead(302, { Location: '/preview/' });
              res.end();
            } else next();
          });
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 5180,
      strictPort: true,
      proxy: {
        '/__preview': {
          target: `http://127.0.0.1:${port}`,
          rewrite: (p) => p.replace('/__preview', ''),
        },
      },
      headers: {
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:5180; object-src 'none'",
      },
    },
  });
  await vite.listen();
  console.log('界面整体预览：http://127.0.0.1:5180/preview/');
  console.log('临时目录：', session.directory);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (chunk) => {
      if (chunk.includes(3)) shutdown().then(() => process.exit(0));
    });
  }
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      shutdown().then(
        () => process.exit(0),
        (error) => {
          console.error(error);
          process.exit(1);
        },
      );
    });
} catch (error) {
  console.error(error);
  await shutdown();
  process.exitCode = 1;
}
