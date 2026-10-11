import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { openDatabase } from '../../electron/database.js';
import { DatabaseSync } from 'node:sqlite';

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
      await api.loadLibraryCards();
      api.close();
      api = await openDatabase(directory);
    }
    const mainMs = [];
    const mainBlockingMs = [];
    const mainBlockingStages = [];
    ipcMain.handle('library:cards', async (_event, request = {}) => {
      const start = performance.now();
      let previous = start;
      let longest = 0;
      let active = true;
      let stage = 'read';
      let peakStage = stage;
      const tick = () => {
        const now = performance.now();
        if (now - previous > longest) peakStage = stage;
        longest = Math.max(longest, now - previous);
        previous = now;
        if (active) setImmediate(tick);
      };
      setImmediate(tick);
      const cards = await api.loadLibraryCards(request.view, (progress) => {
        stage = `build:${progress.completed}/${progress.total}`;
        window.webContents.send('library:cards-progress', progress);
      });
      stage = 'reply';
      mainMs.push(performance.now() - start);
      // Keep measuring through the final reply's structured clone, too.
      setImmediate(() => {
        active = false;
        tick();
        mainBlockingMs.push(longest);
        mainBlockingStages.push(peakStage);
      });
      return cards;
    });
    ipcMain.handle('database:storage:get', () => ({ ok: true }));
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
    const raw = new DatabaseSync(api.filePath);
    raw.exec('DROP TABLE library_card_cache');
    raw.close();
    const firstBuild = await window.webContents.executeJavaScript(`(async () => {
      const progress = [];
      let pending = true;
      let responsiveRequests = 0;
      let clickCount = 0;
      const button = document.createElement('button');
      button.textContent = 'Probe';
      button.onclick = () => clickCount++;
      document.body.append(button);
      const probes = [];
      window.studio.onLibraryCardCacheProgress(value => {
        progress.push(value);
        if (value.completed < value.total) {
          button.click();
          probes.push(window.studio.getDatabaseStorage().then(() => { if (pending) responsiveRequests++; }));
        }
      });
      const start = performance.now();
      const cards = await window.studio.loadLibraryCards();
      const ms = performance.now() - start;
      pending = false;
      await Promise.all(probes);
      window.studio.offLibraryCardCacheProgress();
      button.remove();
      if (cards.length !== ${count} || !responsiveRequests || !clickCount) throw Error('First build did not keep renderer/main requests responsive');
      return { ms, responsiveRequests, clickCount, progress };
    })()`);
    await new Promise((resolve) => setImmediate(resolve));
    fs.writeFileSync(
      output,
      JSON.stringify({
        count,
        samples,
        mainMs,
        mainBlockingMs,
        mainBlockingStages,
        firstBuild,
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
