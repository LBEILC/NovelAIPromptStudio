import fs from 'node:fs/promises';
import path from 'node:path';
import { ipcMain } from 'electron';
import { importLibraryFiles } from './importer.js';
import { screenshotScenes } from '../scripts/app-screenshot-scenes.mjs';

export async function runAppScreenshots({
  app,
  mode,
  database,
  assetsDirectory,
  preferences,
  createWindow,
}) {
  await fs.mkdir(mode.output, { recursive: true });
  for (const file of await fs.readdir(mode.output)) {
    if (file.endsWith('.png') || file === 'manifest.json')
      await fs.unlink(path.join(mode.output, file));
  }
  const source = path.resolve('demo/promo-v090/final');
  const filePaths = (await fs.readdir(source))
    .filter((name) => name.endsWith('.png'))
    .sort()
    .map((name) => path.join(source, name));
  if (filePaths.length !== 14) throw new Error(`Expected 14 fixtures, got ${filePaths.length}`);
  const started = performance.now();
  const imported = await importLibraryFiles({ filePaths, database, assetsDirectory });
  const importMilliseconds = Math.round(performance.now() - started);
  if (imported.errors.length || imported.imported.length !== 14)
    throw new Error(JSON.stringify(imported));
  const projects = database.loadLibrary('all');
  const manual = database.createCollection({
    id: 'screens-manual',
    name: '截图收藏集',
    kind: 'manual',
  });
  database.updateCollectionProjects(
    manual.id,
    projects.slice(0, 3).map((item) => item.id),
  );
  database.createCollection({
    id: 'screens-smart',
    name: '智能收藏集',
    kind: 'smart',
    filters: { query: '1girl' },
  });
  database.updateProjects([projects.at(-1).id], { deleted: true });
  const errors = [];
  const onError = (_event, error) => errors.push(error);
  ipcMain.on('screenshot:error', onError);
  const manifest = {
    version: app.getVersion(),
    platform: process.platform,
    importMilliseconds,
    imported: 14,
    userData: app.getPath('userData'),
    sessionData: app.getPath('sessionData'),
    screenshots: [],
  };
  try {
    for (const theme of ['light', 'dark']) {
      for (const scene of screenshotScenes) {
        preferences.saveAppearanceSettings({ themeMode: theme, motion: 'off' });
        const state = {
          ...scene,
          theme,
          collections: Boolean(scene.collections),
          animationsDisabled: true,
          selectedProjectId: scene.select ? projects[0].id : '',
          workbenchPaths: scene.workbench ? filePaths.slice(0, 3) : [],
        };
        const window = createWindow(state);
        try {
          window.webContents.on('console-message', (details) => {
            if (details.level === 'error') errors.push(details.message);
          });
          window.webContents.on('render-process-gone', (_event, details) =>
            errors.push(JSON.stringify(details)),
          );
          await new Promise((resolve, reject) => {
            window.webContents.once('did-finish-load', resolve);
            window.webContents.once('did-fail-load', (_event, code, description) =>
              reject(new Error(`${code}: ${description}`)),
            );
          });
          await window.webContents.insertCSS(
            '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
            { cssOrigin: 'user' },
          );
          await window.webContents.executeJavaScript(`(async () => {
            const deadline = Date.now() + 15000;
            while (document.documentElement.dataset.screenshotReady !== ${JSON.stringify(scene.name)} || document.documentElement.dataset.themeMode !== ${JSON.stringify(theme)}) {
              if (Date.now() > deadline) throw new Error('Application readiness timeout');
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            let lastMutation = Date.now();
            const observer = new MutationObserver(() => { lastMutation = Date.now(); });
            observer.observe(document.body, { attributes: true, childList: true, subtree: true, characterData: true });
            try {
              while (window.studioScreenshot.pending() || Date.now() - lastMutation < 500) {
                if (Date.now() > deadline) throw new Error('Page effects did not settle');
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            } finally { observer.disconnect(); }
            await document.fonts.ready;
            for (const image of document.images) {
              if (image.getClientRects().length) await image.decode();
            }
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            if (innerWidth !== 1240 || innerHeight !== 760) throw new Error('Unexpected viewport size');
          })()`);
          if (errors.length) throw new Error(errors.join('\n'));
          const image = await window.webContents.capturePage();
          if (image.isEmpty()) throw new Error(`Empty capture: ${scene.name}`);
          const file = `${scene.name}-${theme}.png`;
          await fs.writeFile(path.join(mode.output, file), image.toPNG());
          manifest.screenshots.push({
            file,
            ...scene,
            theme,
            version: app.getVersion(),
            size: image.getSize(),
          });
          console.log(`Captured ${file}`);
        } finally {
          window.destroy();
        }
      }
    }
    if (errors.length) throw new Error(errors.join('\n'));
    await fs.writeFile(path.join(mode.output, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(
      `Imported 14 images in ${importMilliseconds}ms; captured ${manifest.screenshots.length} screens`,
    );
  } finally {
    ipcMain.removeListener('screenshot:error', onError);
  }
}
