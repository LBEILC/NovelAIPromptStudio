import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { openDatabase } from '../../electron/database.js';

// This standalone benchmark uses the production database and preload bridge,
// with an empty renderer so gallery rendering doesn't pollute IPC timings.
const [directory, output, size] = process.argv.slice(2);
const count = Number(size);
for (const name of ['userData', 'sessionData', 'logs', 'crashDumps']) {
  const target = path.join(directory, name);
  fs.mkdirSync(target, { recursive: true });
  app.setPath(name, target);
}
app.disableHardwareAcceleration();
async function run() {
  let api;
  let window;
  try {
    await app.whenReady();
    api = await openDatabase(directory);
    // Standalone callers can prepare here; the benchmark passes --prepared after
    // a separate process prepares the table, so even the first request's JIT and
    // process-local caches are cold in its newly launched Electron process.
    if (!process.argv.includes('--prepared')) {
      api.loadLibraryCards();
      api.close();
      api = await openDatabase(directory);
    }
    const mainMs = [];
    const mainBlockingMs = [];
    ipcMain.handle('library:cards', (_event, request = {}) => {
      const start = performance.now();
      // The next main-process turn includes the reply's structured-clone work,
      // which is not visible in the database-call duration alone.
      setImmediate(() => mainBlockingMs.push(performance.now() - start));
      const cards = api.loadLibraryCards(request.view);
      mainMs.push(performance.now() - start);
      return cards;
    });
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: fileURLToPath(new URL('../../electron/preload.cjs', import.meta.url)),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    await window.loadURL(
      'data:text/html,<meta charset="utf-8"><title>Library IPC benchmark</title>',
    );
    const samples = await window.webContents.executeJavaScript(`(async () => {
    const results = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const cards = await window.studio.loadLibraryCards();
      const ms = performance.now() - start;
      if (cards.length !== ${count} || !cards.every(card => card.base_prompt_similarity && !card.metadata.extra_json)) throw Error('IPC card payload mismatch');
      results.push(ms);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return results;
    })()`);
    await new Promise((resolve) => setImmediate(resolve));
    fs.writeFileSync(
      output,
      JSON.stringify({
        count,
        samples,
        mainMs,
        mainBlockingMs,
        electron: process.versions.electron,
        ok: true,
      }),
    );
  } catch (error) {
    fs.writeFileSync(output, JSON.stringify({ count, ok: false, error: error.stack }));
    process.exitCode = 1;
  } finally {
    window?.destroy();
    api?.close();
    app.exit(process.exitCode || 0);
  }
}
void run();
