import fs from 'node:fs/promises';
import path from 'node:path';
import { ipcMain, nativeImage, screen } from 'electron';
import { importLibraryFiles } from './importer.js';
import { screenshotScenes } from '../scripts/app-screenshot-scenes.mjs';
import { prepareLibraryScreenshot } from './libraryScreenshots.js';

async function renderedFonts(webContents, selectors) {
  const cdp = webContents.debugger;
  await cdp.sendCommand('DOM.enable');
  await cdp.sendCommand('CSS.enable');
  const { root } = await cdp.sendCommand('DOM.getDocument');
  const result = {};
  for (const [role, selector, expected] of selectors) {
    const { nodeId } = await cdp.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    if (!nodeId) throw new Error(`Missing font evidence node: ${selector}`);
    const { fonts } = await cdp.sendCommand('CSS.getPlatformFontsForNode', { nodeId });
    if (
      !fonts.some(
        (font) => font.isCustomFont && font.glyphCount > 0 && font.familyName.includes(expected),
      )
    )
      throw new Error(`Unexpected rendered font (${role}): ${JSON.stringify(fonts)}`);
    result[role] = { selector, fonts };
  }
  return result;
}

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
    fontProof: [],
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
        let cleanupLibraryScene = async () => {};
        const overlayUpdates = [];
        if (process.platform === 'win32' && window.setTitleBarOverlay) {
          const applyOverlay = window.setTitleBarOverlay.bind(window);
          window.setTitleBarOverlay = (overlay) => {
            overlayUpdates.push(overlay);
            return applyOverlay(overlay);
          };
        }
        try {
          // Regression mode: reproduce a small CI desktop without changing the
          // user's display settings or the normal application's window behavior.
          if (process.argv.includes('--app-screenshot-constrain-window')) {
            window.setMinimumSize(0, 0);
            window.setMaximumSize(1024, 768);
            window.setSize(1024, 768);
          }
          window.webContents.on('console-message', (details) => {
            if (details.level === 'error') errors.push(details.message);
          });
          window.webContents.on('render-process-gone', (_event, details) =>
            errors.push(JSON.stringify(details)),
          );
          // Set metrics before the renderer initializes responsive page state.
          window.webContents.debugger.attach('1.3');
          const loaded = new Promise((resolve, reject) => {
            window.webContents.once('did-finish-load', resolve);
            window.webContents.once('did-fail-load', (_event, code, description) =>
              reject(new Error(`${code}: ${description}`)),
            );
          });
          // Offscreen BrowserWindows still inherit native desktop size limits.
          // Override the renderer view, not the native window or page zoom.
          await Promise.all([
            loaded,
            window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
              width: 1240,
              height: 760,
              deviceScaleFactor: 1,
              mobile: false,
            }),
          ]);
          console.log(
            'Screenshot geometry:',
            JSON.stringify({
              file: `${scene.name}-${theme}.png`,
              bounds: window.getBounds(),
              contentBounds: window.getContentBounds(),
              display: screen.getDisplayMatching(window.getBounds()),
              viewport: await window.webContents.executeJavaScript(
                '({ width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio })',
              ),
            }),
          );
          await window.webContents.insertCSS(
            '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
            { cssOrigin: 'user' },
          );
          await window.webContents.executeJavaScript(`(async () => {
            const deadline = Date.now() + 15000;
            while (document.documentElement.dataset.screenshotReady !== ${JSON.stringify(scene.name)} || document.documentElement.dataset.themeMode !== ${JSON.stringify(theme)} || document.documentElement.dataset.theme !== ${JSON.stringify(theme)}) {
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
            if (innerWidth !== 1240 || innerHeight !== 760) throw new Error('Unexpected viewport size: ' + innerWidth + 'x' + innerHeight);
          })()`);
          if (errors.length) throw new Error(errors.join('\n'));
          cleanupLibraryScene = await prepareLibraryScreenshot({
            window,
            scene,
            mode,
            database,
            assetsDirectory,
            filePaths,
          });
          if (
            process.platform === 'win32' &&
            window.setTitleBarOverlay &&
            scene.name === 'workbench'
          ) {
            // Exercise real IPC and native overlay updates in the temporary profile.
            // No simulated mouse/keyboard input and no user profile is involved.
            for (const mode of [theme === 'light' ? 'dark' : 'light', theme]) {
              const before = overlayUpdates.length;
              await window.webContents.executeJavaScript(
                `window.studio.saveAppearanceSettings({ themeMode: ${JSON.stringify(mode)} })`,
              );
              const deadline = Date.now() + 3000;
              while (overlayUpdates.length === before) {
                if (Date.now() > deadline) throw new Error('Native title bar update timeout');
                await new Promise((resolve) => setTimeout(resolve, 20));
              }
            }
            const last = overlayUpdates.slice(-2);
            if (last[0].color === last[1].color || last[0].symbolColor === last[1].symbolColor)
              throw new Error('Native title bar colors did not change');
          }
          // capturePage() copies the native surface and can truncate a larger
          // emulated view. Capture the full renderer viewport instead.
          const { data } = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false,
            clip: { x: 0, y: 0, width: 1240, height: 760, scale: 1 },
          });
          const image = nativeImage.createFromBuffer(Buffer.from(data, 'base64'));
          if (image.isEmpty()) throw new Error(`Empty capture: ${scene.name}`);
          const size = image.getSize();
          if (size.width !== 1240 || size.height !== 760)
            throw new Error(`Unexpected capture size: ${size.width}x${size.height}`);
          const file = `${scene.name}-${theme}.png`;
          await fs.writeFile(path.join(mode.output, file), image.toPNG());
          const fontSelectors = [['ui', '.studio-titlebar nav button .nps-button-label', 'MiSans']];
          if (scene.name === 'workbench')
            fontSelectors.push(['tag', '.overview-tag-copy', 'IBM Plex Mono']);
          if (scene.name === 'settings-updates')
            fontSelectors.push(['proseBrand', '.settings-about-name', 'Newsreader']);
          manifest.screenshots.push({
            file,
            ...scene,
            theme,
            version: app.getVersion(),
            size,
            overlayUpdates,
            renderedFonts: await renderedFonts(window.webContents, fontSelectors),
            appearance: await window.webContents.executeJavaScript(`(() => {
              const selectors = ['html', '.lobe-root', '.studio-titlebar', '.workbench-source-shell', '.workbench-tabs-list', '.studio-settings'];
              return Object.fromEntries(selectors.map(selector => {
                const element = document.querySelector(selector);
                if (!element) return [selector, null];
                const style = getComputedStyle(element);
                return [selector, { background: style.backgroundColor, color: style.color, font: style.fontFamily,
                  variables: Object.fromEntries(['--pane', '--text', '--font-ui', '--font-mono', '--font-prose', '--ant-color-text-base', '--ant-color-bg-layout'].map(key => [key, style.getPropertyValue(key)])) }];
              }));
            })()`),
          });
          console.log(`Captured ${file}`);
          if (scene.name === 'settings-updates') {
            // Screenshot-only specimens: no UI input, saved settings or production layout changes.
            // The legacy workbench has no prose block yet, so verify the real prose token here.
            await window.webContents.executeJavaScript(`(async () => {
              const host = document.querySelector('.settings-about-name').closest('.settings-copy');
              host.innerHTML = '<h2 id="font-ui">界面字体 MiSans · 中文与 English 012345</h2>' +
                '<p id="font-tag" style="font-family:var(--font-mono)">blue_hair, school_uniform, 1.25</p>' +
                '<blockquote id="font-prose" class="nps-quote">A quiet studio filled with soft morning light. 一间洒满晨光的画室。</blockquote>' +
                '<p id="font-mono-500" style="font-family:var(--font-mono);font-weight:var(--fw-strong)">Weight 500: 012345</p>' +
                '<p id="font-prose-500" style="font-family:var(--font-prose);font-weight:var(--fw-strong)">Newsreader weight 500 with optical sizing.</p>';
              await document.fonts.ready;
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            })()`);
            const proof = await renderedFonts(window.webContents, [
              ['ui', '#font-ui', 'MiSans'],
              ['tag', '#font-tag', 'IBM Plex Mono'],
              ['prose', '#font-prose', 'Newsreader'],
              ['proseChinese', '#font-prose', 'MiSans'],
              ['mono500', '#font-mono-500', 'IBM Plex Mono'],
              ['prose500', '#font-prose-500', 'Newsreader'],
            ]);
            const { data: proofData } = await window.webContents.debugger.sendCommand(
              'Page.captureScreenshot',
              {
                format: 'png',
                captureBeyondViewport: false,
                clip: { x: 0, y: 0, width: 1240, height: 760, scale: 1 },
              },
            );
            const proofFile = `fonts-${theme}.png`;
            await fs.writeFile(path.join(mode.output, proofFile), Buffer.from(proofData, 'base64'));
            manifest.fontProof.push({ file: proofFile, theme, renderedFonts: proof });
          }
        } finally {
          await cleanupLibraryScene();
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
