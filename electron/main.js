import {
  guardClientWindow,
  themeBackground,
  clientMenu,
  openExternalLink,
} from './clientWindow.js';
import { hasImageName, imageFileName } from '../src/lib/imageNaming.js';
import { normalizePromptStructure } from '../src/lib/promptStructure.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  safeStorage,
  screen,
  shell,
} from 'electron';
import electronUpdater from 'electron-updater';
import { openDatabase } from './database.js';
import { retranslateDictionary } from './dictionaryTranslation.js';
import {
  backfillProjectContentHashes,
  backfillProjectDimensions,
  generateZipEntryPreviews,
  importLibraryFiles,
  inspectLibraryImportFiles,
} from './importer.js';
import { openPreferences } from './preferences.js';
import { listModels, testModel, translateTags, transformParagraph } from './translation.js';
import { lookupDanbooruTags } from './danbooru.js';
import { lookupDsoTags, searchDsoTags } from './dsoDictionary.js';
import { annotateTags } from './tagAnnotations.js';
import { exportEmbeddedVibeFile } from './vibes.js';
import {
  applyWorkbenchLibraryDetails,
  readWorkbenchImage,
  applyWorkbenchStructure,
} from './workbench.js';
import { listSystemFonts } from './fonts.js';
import {
  createDatabaseStorage,
  describeAssetDirectory,
  migrateAssetDirectory,
} from './libraryStorage.js';
import { cleanupWorkbenchTemporaryImages, readClipboardImageSource } from './clipboardImages.js';
import {
  checkForUpdates as checkReleaseUpdates,
  getUpdateCapabilities,
  installUpdateAfterClosingDatabase,
} from './updates.js';
import { configureAppProfile } from './appProfile.js';
import { configureScreenshotMode } from './tools/screenshotMode.js';
import {
  configureAcceptanceMode,
  createAcceptanceCardCache,
  installAcceptanceDoubles,
  installAcceptanceLatency,
} from './tools/acceptanceMode.js';
import {
  copyImageToClipboard,
  copyManagedImageToClipboard,
  copyOriginalAsset,
  copyOriginalImage,
  removeManagedAsset,
  resolveImageFile,
  resolveManagedAsset,
} from './assetFiles.js';

const { autoUpdater } = electronUpdater;

app.setName('NovelAI Prompt Studio');
const acceptanceMode = configureAcceptanceMode(app);
const acceptanceCardCache = createAcceptanceCardCache(acceptanceMode);
installAcceptanceLatency(acceptanceMode, ipcMain);
const acceptanceDoubles = installAcceptanceDoubles(acceptanceMode, {
  dialog,
  shell,
  clipboard,
  nativeImage,
});
const screenshotMode = configureScreenshotMode(app);
const databaseProbeOutput = process.argv
  .find((argument) => argument.startsWith('--database-probe-output='))
  ?.slice('--database-probe-output='.length);
const databaseProbeDirectory = databaseProbeOutput
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'nai-database-probe-'))
  : null;
if (databaseProbeDirectory) {
  app.setPath('userData', databaseProbeDirectory);
  app.setPath('sessionData', databaseProbeDirectory);
} else if (!screenshotMode && !acceptanceMode) configureAppProfile(app);
if (process.platform === 'win32') app.setAppUserModelId('studio.novelai.prompt');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'novelai-media',
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
  },
]);

let database;
let quitting = false;
let assetsDirectory;
let preferences;
let contentBackfill = Promise.resolve();
let storageMigrationActive = false;
let permanentDeletionActive = false;
let workbenchTemporaryDirectory;
let updateState = {
  phase: 'idle',
  progress: 0,
  currentVersion: '',
  latestVersion: '',
  error: '',
  releaseUrl: '',
};
const activeImports = new Map();
const preparedImports = new Map();
const appIconPath = path.join(
  import.meta.dirname,
  '..',
  'build',
  'icons',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png',
);

function cleanupPreviewDirectory(directory) {
  if (!directory) return;
  try {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  } catch (error) {
    const retry = setTimeout(() => {
      try {
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
      } catch (retryError) {
        console.warn('Unable to remove import preview directory', retryError);
      }
    }, 1000);
    retry.unref?.();
    console.warn('Import preview cleanup delayed', error);
  }
}

async function releasePreparedImport(sessionId) {
  const id = String(sessionId || '');
  const session = preparedImports.get(id);
  if (!session) return null;
  preparedImports.delete(id);
  clearTimeout(session.expiryTimer);
  session.controller.abort();
  await session.previewPromise?.catch(() => {});
  cleanupPreviewDirectory(session.previewDirectory);
  return session;
}

function sendPreparedImportUpdate(sender, update) {
  if (!sender.isDestroyed()) sender.send('library:import-preview', update);
}

const titleBarSyncs = new WeakMap();
async function syncTitleBarOverlay(window) {
  if (window.isDestroyed()) return;
  const mode = preferences.appearanceSettings().themeMode;
  const theme = mode === 'auto' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : mode;
  const request = Symbol();
  titleBarSyncs.set(window, request);
  try {
    // Read the application's actual CSS tokens; the main process owns no palette.
    const overlay = await window.webContents.executeJavaScript(`(() => {
      const probe = document.createElement('div');
      probe.dataset.theme = ${JSON.stringify(theme)};
      document.documentElement.append(probe);
      const style = getComputedStyle(probe);
      const value = { background: style.getPropertyValue('--bg').trim(), color: style.getPropertyValue('--pane').trim(), symbolColor: style.getPropertyValue('--text').trim(), height: parseInt(style.getPropertyValue('--titlebar-h'), 10) };
      probe.remove();
      return value;
    })()`);
    if (
      !window.isDestroyed() &&
      titleBarSyncs.get(window) === request &&
      overlay.color &&
      overlay.symbolColor &&
      overlay.height > 0
    ) {
      window.setBackgroundColor(overlay.background);
      if (process.platform === 'win32') {
        const { background, ...titlebar } = overlay;
        window.setTitleBarOverlay(titlebar);
      }
    }
  } catch (error) {
    if (!window.isDestroyed()) console.error('Unable to synchronize title bar:', error);
  }
}

function createWindow(captureState = null) {
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
  const defaultWidth = Math.min(1720, Math.max(960, workAreaWidth - 16));
  const defaultHeight = Math.min(1040, Math.max(680, workAreaHeight - 16));
  const window = new BrowserWindow({
    width: captureState ? 1240 : defaultWidth,
    height: captureState ? 760 : defaultHeight,
    minWidth: Math.min(1080, defaultWidth),
    minHeight: Math.min(700, defaultHeight),
    titleBarStyle:
      process.platform === 'darwin'
        ? 'hiddenInset'
        : process.platform === 'win32'
          ? 'hidden'
          : 'default',
    ...(process.platform === 'win32' ? { titleBarOverlay: true } : {}),
    autoHideMenuBar: process.platform === 'win32',
    icon: appIconPath,
    backgroundColor: themeBackground(
      path.join(import.meta.dirname, '..'),
      preferences.appearanceSettings().themeMode === 'auto'
        ? nativeTheme.shouldUseDarkColors
          ? 'dark'
          : 'light'
        : preferences.appearanceSettings().themeMode,
    ),
    show: false,
    ...(acceptanceMode ? { show: false } : {}),
    ...(captureState ? { show: false, useContentSize: true, enableLargerThanScreen: true } : {}),
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
      ...(acceptanceMode ? { backgroundThrottling: false, offscreen: true } : {}),
      ...(captureState
        ? {
            offscreen: true,
            backgroundThrottling: false,
            additionalArguments: ['--app-screenshot-state=' + JSON.stringify(captureState)],
          }
        : {}),
    },
  });
  guardClientWindow(window, { packaged: app.isPackaged, shell });
  window.once('ready-to-show', async () => {
    await syncTitleBarOverlay(window);
    if (!acceptanceMode && !captureState && !window.isDestroyed()) window.show();
  });
  window.webContents.on('did-finish-load', () => void syncTitleBarOverlay(window));
  const developmentUrl =
    process.env.NOVELAI_DEV_URL || (process.argv.includes('--dev') ? 'http://127.0.0.1:5173' : '');
  if (developmentUrl && !captureState) window.loadURL(developmentUrl);
  else window.loadFile(path.join(import.meta.dirname, '..', 'dist', 'index.html'));
  return window;
}

function notifyUpdateState(patch = {}) {
  updateState = {
    ...updateState,
    ...patch,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    ...getUpdateCapabilities(process.platform, app.isPackaged),
  };
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('updates:state', updateState);
  }
}

function reportDatabaseOpenError(dataDirectory, error) {
  dialog.showErrorBox(
    '无法升级图片库',
    `应用已停止写入数据。请保留 ${path.join(dataDirectory, 'studio.pre-phase2.sqlite')}，并检查数据库后重试。\n\n${error instanceof Error ? error.message : String(error)}`,
  );
  app.quit();
}

function releaseNotesText(notes) {
  if (Array.isArray(notes))
    return notes
      .map((item) => `${item.version || ''}\n${item.note || ''}`.trim())
      .filter(Boolean)
      .join('\n\n');
  return String(notes || '').trim();
}

function configureAutoUpdater() {
  if (acceptanceMode) return;
  if (!getUpdateCapabilities(process.platform, app.isPackaged).canDownloadUpdate) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('checking-for-update', () =>
    notifyUpdateState({ phase: 'checking', error: '', progress: 0 }),
  );
  autoUpdater.on('update-available', (info) =>
    notifyUpdateState({
      phase: 'available',
      hasUpdate: true,
      latestVersion: info.version,
      publishedAt: info.releaseDate || '',
      notes: releaseNotesText(info.releaseNotes).slice(0, 4_000),
      progress: 0,
      error: '',
    }),
  );
  autoUpdater.on('update-not-available', (info) =>
    notifyUpdateState({
      phase: 'current',
      hasUpdate: false,
      latestVersion: info.version || app.getVersion(),
      publishedAt: info.releaseDate || '',
      notes: '',
      progress: 0,
      error: '',
    }),
  );
  autoUpdater.on('download-progress', (progress) =>
    notifyUpdateState({
      phase: 'downloading',
      progress: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
      transferred: Number(progress.transferred) || 0,
      total: Number(progress.total) || 0,
      bytesPerSecond: Number(progress.bytesPerSecond) || 0,
      error: '',
    }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    notifyUpdateState({
      phase: 'downloaded',
      hasUpdate: true,
      latestVersion: info.version,
      progress: 100,
      error: '',
    }),
  );
  autoUpdater.on('error', (error) =>
    notifyUpdateState({
      phase: 'error',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

function imageDialogDefaultPath() {
  const recent = preferences.productivitySettings().recentImageDirectory;
  return recent || undefined;
}

function rememberImageDirectory(filePaths = []) {
  if (filePaths[0])
    preferences.saveProductivitySettings({ recentImageDirectory: path.dirname(filePaths[0]) });
}

function batchSummary(results = {}) {
  return {
    success: results.success?.length || 0,
    skipped: results.skipped?.length || 0,
    failed: results.failed?.length || 0,
  };
}

app.whenReady().then(async () => {
  if (databaseProbeDirectory) {
    try {
      const { runDatabaseProbe } = await import('./tools/databaseProbe.js');
      await runDatabaseProbe(databaseProbeDirectory, databaseProbeOutput, app.isPackaged);
      app.quit();
    } catch (error) {
      console.error(error);
      app.exit(1);
    } finally {
      fs.rmSync(databaseProbeDirectory, { recursive: true, force: true });
    }
    return;
  }
  if (process.platform === 'darwin')
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        clientMenu({
          app,
          development: !app.isPackaged,
          navigate: (destination) =>
            BrowserWindow.getFocusedWindow()?.webContents.send('app:navigate', destination),
          feedback: (label, title) =>
            openExternalLink(
              shell,
              'https://github.com/LBEILC/NovelAIPromptStudio/issues/new?labels=' +
                label +
                '&title=' +
                encodeURIComponent(title),
            ),
        }),
      ),
    );
  else Menu.setApplicationMenu(null);
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(appIconPath);
  const dataDirectory = path.join(app.getPath('userData'), 'data');
  const defaultAssetsDirectory = path.join(app.getPath('userData'), 'assets');
  try {
    database = await openDatabase(dataDirectory, {
      cardBuildSchedule: acceptanceCardCache?.schedule,
    });
  } catch (error) {
    reportDatabaseOpenError(dataDirectory, error);
    return;
  }
  const systemFonts = await listSystemFonts().catch((error) => {
    console.warn('Unable to enumerate system fonts; preserving font preferences:', error.message);
    return undefined;
  });
  preferences = openPreferences(dataDirectory, safeStorage, {
    defaultAssetsDirectory,
    systemFonts,
  });
  configureAutoUpdater();
  workbenchTemporaryDirectory = path.join(app.getPath('userData'), 'workbench-temp');
  assetsDirectory = preferences.librarySettings().assetsDirectory;
  try {
    fs.mkdirSync(assetsDirectory, { recursive: true });
  } catch (error) {
    dialog.showErrorBox(
      '资源库位置不可用',
      `无法访问：${assetsDirectory}\n\n请检查磁盘或文件夹权限，然后在设置中更改位置。\n\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  contentBackfill = Promise.all([
    backfillProjectContentHashes(database).catch((error) =>
      console.error('Unable to backfill image fingerprints', error),
    ),
    backfillProjectDimensions(database).catch((error) =>
      console.error('Unable to backfill image dimensions', error),
    ),
  ]);

  protocol.handle('novelai-media', (request) => {
    const filePath = new URL(request.url).searchParams.get('path');
    if (!filePath) return new Response('Missing media path', { status: 400 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  ipcMain.handle('clipboard:read-text', () => clipboard.readText());
  ipcMain.handle('clipboard:write-text', (_event, text) => clipboard.writeText(String(text)));

  ipcMain.handle('library:load', async (_event, request = {}) => {
    await contentBackfill;
    return database.loadLibrary(request.view);
  });
  const sendCardCacheProgress = (progress) => {
    for (const window of BrowserWindow.getAllWindows())
      if (!window.webContents.isDestroyed())
        window.webContents.send('library:cards-progress', progress);
  };
  const reportCardCacheProgress = (progress) => {
    if (acceptanceCardCache) acceptanceCardCache.report(progress, sendCardCacheProgress);
    else sendCardCacheProgress(progress);
  };
  ipcMain.handle('library:cards', async (_event, request = {}) => {
    await contentBackfill;
    return database.loadLibraryCards(request.view, reportCardCacheProgress);
  });
  ipcMain.handle('library:detail', async (_event, id) => {
    await contentBackfill;
    return database.loadProject(id);
  });
  ipcMain.handle('library:collections:list', async () => {
    try {
      await contentBackfill;
      return { ok: true, collections: database.listCollections() };
    } catch (error) {
      return {
        ok: false,
        collections: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  ipcMain.handle('library:collections:create', (_event, request = {}) => {
    try {
      return {
        ok: true,
        collection: database.createCollection({ ...request, id: crypto.randomUUID() }),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:collections:update', (_event, request = {}) => {
    try {
      return { ok: true, collection: database.updateCollection(request.id, request.patch) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:collections:delete', (_event, id) => {
    try {
      return { ok: true, deleted: database.deleteCollection(id) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:collections:projects', (_event, request = {}) => {
    try {
      const results = database.updateCollectionProjects(
        request.id,
        request.projectIds,
        request.action,
      );
      return { ok: true, results, summary: batchSummary(results) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const databaseStorage = createDatabaseStorage(dataDirectory);
  ipcMain.handle('database:storage:get', () => ({ ok: true, ...databaseStorage.location() }));
  ipcMain.handle('database:backups:list', async () => {
    try {
      return { ok: true, ...(await databaseStorage.listBackups()) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('database:storage:reveal', async (_event, fileName) => {
    try {
      await databaseStorage.reveal(fileName, (file) => shell.showItemInFolder(file));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:storage:get', async () => {
    try {
      const details = await describeAssetDirectory(assetsDirectory);
      return { ok: true, ...details, ...preferences.librarySettings() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:storage:reveal', async () => {
    try {
      fs.mkdirSync(assetsDirectory, { recursive: true });
      const error = await shell.openPath(assetsDirectory);
      return error ? { ok: false, error } : { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:storage:change', async (event) => {
    if (storageMigrationActive) return { ok: false, error: '资源库正在迁移，请稍候' };
    if (activeImports.size) return { ok: false, error: '请等待当前图片导入完成后再更改资源库位置' };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const selection = await dialog.showOpenDialog(owner, {
      title: '选择新的资源库位置',
      defaultPath: path.dirname(assetsDirectory),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (selection.canceled || !selection.filePaths[0]) return { ok: true, canceled: true };
    const targetDirectory = path.resolve(selection.filePaths[0]);
    if (targetDirectory === path.resolve(assetsDirectory))
      return { ok: true, canceled: true, noChange: true };
    try {
      const current = await describeAssetDirectory(assetsDirectory);
      const size =
        current.totalBytes < 1024 * 1024
          ? `${Math.max(0.1, current.totalBytes / 1024).toFixed(1)} KB`
          : `${(current.totalBytes / 1024 / 1024).toFixed(1)} MB`;
      const confirmation = await dialog.showMessageBox(owner, {
        type: 'question',
        title: '更改资源库位置',
        message: `移动 ${current.fileCount} 个资源文件（${size}）并切换到新位置？`,
        detail: `当前位置：${assetsDirectory}\n新位置：${targetDirectory}\n\n迁移完成前不会删除旧资源。`,
        buttons: ['移动并切换', '取消'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (confirmation.response !== 0) return { ok: true, canceled: true };

      storageMigrationActive = true;
      const previousDirectory = assetsDirectory;
      const result = await migrateAssetDirectory({
        sourceDirectory: previousDirectory,
        targetDirectory,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send('library:storage-progress', progress);
        },
        commit: async ({ sourceDirectory, targetDirectory: nextDirectory }) => {
          database.relocateAssetPaths(sourceDirectory, nextDirectory);
          try {
            preferences.saveLibrarySettings({ assetsDirectory: nextDirectory });
          } catch (error) {
            database.relocateAssetPaths(nextDirectory, sourceDirectory);
            throw error;
          }
          assetsDirectory = nextDirectory;
        },
      });
      return { ok: true, ...result, ...preferences.librarySettings() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      storageMigrationActive = false;
    }
  });
  ipcMain.handle('workbench:image:open', async (_event, request = {}) => {
    let filePath = String(request.filePath || '');
    const libraryProject =
      request.source?.type === 'library' && request.source.projectId
        ? database.loadProject(request.source.projectId)
        : null;
    if (libraryProject?.image_path) filePath = libraryProject.image_path;
    if (request.fromDrop && !filePath)
      return { ok: false, project: null, error: '无法读取拖入文件的本地路径' };
    if (!filePath) {
      const result = await dialog.showOpenDialog({
        title: '在工作台中打开 NovelAI 图片',
        defaultPath: imageDialogDefaultPath(),
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (result.canceled) return { ok: true, canceled: true, project: null };
      [filePath] = result.filePaths;
      rememberImageDirectory(result.filePaths);
    }
    try {
      const project = await readWorkbenchImage(filePath, {
        enrichProjectTags: database.enrichProjectTags,
      });
      return {
        ok: true,
        project: applyWorkbenchLibraryDetails(
          applyWorkbenchStructure(project, database.loadWorkbenchStructure(filePath)),
          libraryProject,
        ),
        source: request.source
          ? { ...request.source, path: filePath }
          : { type: 'file', path: filePath },
      };
    } catch (error) {
      return {
        ok: false,
        project: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  ipcMain.handle('workbench:images:open-dropped', async (_event, request = {}) => {
    const filePaths = Array.isArray(request.filePaths)
      ? request.filePaths.map(String).filter(Boolean)
      : [];
    if (!filePaths.length) return { ok: false, items: [], error: '无法读取拖入文件的本地路径' };
    const items = [];
    for (const filePath of filePaths) {
      try {
        items.push({
          ok: true,
          project: applyWorkbenchStructure(
            await readWorkbenchImage(filePath, {
              enrichProjectTags: database.enrichProjectTags,
            }),
            database.loadWorkbenchStructure(filePath),
          ),
          source: { type: 'file', path: filePath },
        });
      } catch (error) {
        items.push({
          ok: false,
          filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      ok: items.some((item) => item.ok),
      items,
      error: items.every((item) => !item.ok) ? items[0]?.error : '',
    };
  });
  ipcMain.handle('workbench:image:clipboard', async () => {
    try {
      const source = readClipboardImageSource(workbenchTemporaryDirectory);
      const project = await readWorkbenchImage(source.filePath, {
        enrichProjectTags: database.enrichProjectTags,
      });
      return {
        ok: true,
        project,
        metadataMissing:
          source.fromBitmap && !project.metadata?.prompt_raw && !project.metadata?.negative_prompt,
        source: {
          type: 'clipboard',
          path: source.filePath,
          temporaryId: source.temporaryId,
          fingerprint: source.fingerprint,
        },
      };
    } catch (error) {
      return {
        ok: false,
        project: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  ipcMain.handle('workbench:temp:sync', (_event, referencedPaths = []) => {
    try {
      return {
        ok: true,
        removed: cleanupWorkbenchTemporaryImages(workbenchTemporaryDirectory, referencedPaths),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:import-prepare', async (_event, request = {}) => {
    if (storageMigrationActive) return { ok: false, error: '资源库正在迁移，请稍候' };
    await contentBackfill;
    let filePaths = Array.isArray(request.filePaths) ? request.filePaths : [];
    if (!filePaths.length) {
      const result = await dialog.showOpenDialog({
        title: '导入 NovelAI 图片或 ZIP',
        defaultPath: imageDialogDefaultPath(),
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'NovelAI 图片与 ZIP', extensions: ['png', 'jpg', 'jpeg', 'webp', 'zip'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
          { name: 'ZIP archives', extensions: ['zip'] },
        ],
      });
      if (result.canceled) return { ok: true, canceled: true };
      filePaths = result.filePaths;
      rememberImageDirectory(result.filePaths);
    }

    try {
      const inspection = await inspectLibraryImportFiles(filePaths);
      const sessionId = crypto.randomUUID();
      const archives = inspection.plans
        .filter((item) => item.kind === 'zip')
        .map((plan) => {
          const archiveId = crypto.randomUUID();
          return {
            archiveId,
            filePath: plan.filePath,
            name: path.basename(plan.filePath),
            signature: (() => {
              const stat = fs.statSync(plan.filePath);
              return { mtimeMs: stat.mtimeMs, size: stat.size };
            })(),
            entries: plan.entries.map((entry) => ({
              ...entry,
              archiveId,
              id: crypto.randomUUID(),
            })),
          };
        });
      const previewDirectory = archives.length
        ? await fs.promises.mkdtemp(path.join(os.tmpdir(), 'novelai-prompt-studio-preview-'))
        : '';
      const session = {
        id: sessionId,
        archives,
        controller: new AbortController(),
        filePaths,
        previewDirectory,
        previewPromise: null,
      };
      session.expiryTimer = setTimeout(
        () => {
          releasePreparedImport(sessionId).catch((error) =>
            console.warn('Unable to expire import preview', error),
          );
        },
        30 * 60 * 1000,
      );
      session.expiryTimer.unref?.();
      preparedImports.set(sessionId, session);
      return {
        ok: true,
        sessionId,
        requiresSelection: archives.length > 0,
        directImageCount: inspection.plans.filter((item) => item.kind === 'image').length,
        skippedCount: inspection.skipped,
        problemCount: inspection.errors.length,
        archives: archives.map((archive) => ({
          id: archive.archiveId,
          name: archive.name,
          count: archive.entries.length,
        })),
        entries: archives.flatMap((archive) =>
          archive.entries.map((entry) => ({
            archiveId: archive.archiveId,
            compressedSize: entry.compressedSize,
            fileName: entry.fileName,
            id: entry.id,
            previewHeight: 0,
            previewPath: '',
            previewWidth: 0,
            uncompressedSize: entry.uncompressedSize,
          })),
        ),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:import-previews:start', (event, sessionId) => {
    const session = preparedImports.get(String(sessionId || ''));
    if (!session) return { ok: false, error: '导入预览已过期，请重新选择压缩包' };
    if (session.previewPromise) return { ok: true };
    const total = session.archives.reduce((sum, archive) => sum + archive.entries.length, 0);
    let completed = 0;
    session.previewPromise = (async () => {
      try {
        for (const archive of session.archives) {
          if (session.controller.signal.aborted) break;
          await generateZipEntryPreviews({
            zipPath: archive.filePath,
            entries: archive.entries,
            findDuplicate: (hash) => database.findProjectByContentHash(hash),
            previewDirectory: session.previewDirectory,
            signal: session.controller.signal,
            onPreview: (preview) => {
              completed += 1;
              sendPreparedImportUpdate(event.sender, {
                sessionId: session.id,
                phase: 'preview',
                entryId: preview.id,
                previewPath: preview.previewPath || '',
                duplicate: Boolean(preview.duplicate),
                previewHeight: preview.previewHeight || 0,
                previewWidth: preview.previewWidth || 0,
                error: preview.error || '',
                completed,
                total,
              });
            },
          });
        }
        if (!session.controller.signal.aborted)
          sendPreparedImportUpdate(event.sender, {
            sessionId: session.id,
            phase: 'complete',
            completed,
            total,
          });
      } catch (error) {
        if (!session.controller.signal.aborted)
          sendPreparedImportUpdate(event.sender, {
            sessionId: session.id,
            phase: 'complete',
            completed,
            total,
            error: error instanceof Error ? error.message : String(error),
          });
      }
    })();
    return { ok: true };
  });
  ipcMain.handle('library:import-prepared:cancel', async (_event, sessionId) => ({
    ok: Boolean(await releasePreparedImport(sessionId)),
  }));
  ipcMain.handle('library:import-prepared:commit', async (event, request = {}) => {
    if (storageMigrationActive) {
      await releasePreparedImport(request.sessionId).catch(() => {});
      return {
        ok: false,
        imported: [],
        duplicates: [],
        errors: [],
        error: '资源库正在迁移，请稍候',
      };
    }
    await contentBackfill;
    const session = preparedImports.get(String(request.sessionId || ''));
    if (!session)
      return {
        ok: false,
        imported: [],
        duplicates: [],
        errors: [],
        error: '导入预览已过期，请重新选择压缩包',
      };
    const batchId = crypto.randomUUID();
    const controller = new AbortController();
    activeImports.set(batchId, controller);
    const notify = (progress) => {
      if (!event.sender.isDestroyed())
        event.sender.send('library:import-progress', { batchId, ...progress });
    };
    notify({ phase: 'preparing', processed: 0, total: 0, current: '准备所选图片' });
    try {
      for (const archive of session.archives) {
        const stat = fs.statSync(archive.filePath);
        if (stat.size !== archive.signature.size || stat.mtimeMs !== archive.signature.mtimeMs) {
          throw new Error(`${archive.name} 在预览后发生了变化，请重新选择压缩包`);
        }
      }
      const selectedIds = new Set(
        Array.isArray(request.entryIds) ? request.entryIds.map(String) : [],
      );
      const selectedArchiveEntries = new Map(
        session.archives.map((archive) => [
          archive.filePath,
          new Set(
            archive.entries
              .filter((entry) => selectedIds.has(entry.id))
              .map((entry) => entry.entryIndex),
          ),
        ]),
      );
      const released = await releasePreparedImport(session.id);
      const imported = await importLibraryFiles({
        filePaths: released.filePaths,
        assetsDirectory,
        database,
        selectedArchiveEntries,
        signal: controller.signal,
        onProgress: notify,
        prepareProject: async (project) => database.enrichProjectTags(project),
      });
      return { batchId, ...imported };
    } catch (error) {
      await releasePreparedImport(session.id).catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        batchId,
        imported: [],
        duplicates: [],
        errors: [{ file: '导入批次', error: message }],
        summary: {
          total: 0,
          processed: 0,
          imported: 0,
          duplicates: 0,
          failed: 1,
          skipped: 0,
          remaining: 0,
          cancelled: false,
        },
      };
    } finally {
      activeImports.delete(batchId);
    }
  });
  ipcMain.handle('library:import-images', async (event, request = {}) => {
    if (storageMigrationActive)
      return {
        ok: false,
        imported: [],
        duplicates: [],
        errors: [],
        error: '资源库正在迁移，请稍候',
      };
    await contentBackfill;
    let clipboardSource = null;
    let filePaths = Array.isArray(request.filePaths) ? request.filePaths : [];
    if (request.fromClipboard) {
      try {
        clipboardSource = readClipboardImageSource(workbenchTemporaryDirectory);
        filePaths = [clipboardSource.filePath];
      } catch (error) {
        return {
          ok: false,
          imported: [],
          duplicates: [],
          errors: [
            { file: '剪贴板', error: error instanceof Error ? error.message : String(error) },
          ],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    if (!filePaths.length) {
      const result = await dialog.showOpenDialog({
        title: '导入 NovelAI 图片或 ZIP',
        defaultPath: imageDialogDefaultPath(),
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'NovelAI 图片与 ZIP', extensions: ['png', 'jpg', 'jpeg', 'webp', 'zip'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
          { name: 'ZIP archives', extensions: ['zip'] },
        ],
      });
      if (result.canceled)
        return {
          ok: true,
          canceled: true,
          imported: [],
          duplicates: [],
          errors: [],
          summary: null,
        };
      filePaths = result.filePaths;
      rememberImageDirectory(result.filePaths);
    }
    const batchId = crypto.randomUUID();
    const controller = new AbortController();
    activeImports.set(batchId, controller);
    const notify = (progress) => {
      if (!event.sender.isDestroyed())
        event.sender.send('library:import-progress', { batchId, ...progress });
    };
    try {
      const imported = await importLibraryFiles({
        filePaths,
        assetsDirectory,
        database,
        signal: controller.signal,
        onProgress: notify,
        prepareProject: async (project) => database.enrichProjectTags(project),
      });
      return {
        batchId,
        ...imported,
        metadataMissing: Boolean(
          request.fromClipboard &&
            clipboardSource?.fromBitmap &&
            imported.imported?.some(
              (project) => !project.metadata?.prompt_raw && !project.metadata?.negative_prompt,
            ),
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        batchId,
        imported: [],
        duplicates: [],
        errors: [{ file: '导入批次', error: message }],
        summary: {
          total: 0,
          processed: 0,
          imported: 0,
          duplicates: 0,
          failed: 1,
          skipped: 0,
          remaining: 0,
          cancelled: false,
        },
      };
    } finally {
      activeImports.delete(batchId);
    }
  });
  ipcMain.handle('library:import-cancel', (_event, batchId) => {
    const controller = activeImports.get(String(batchId || ''));
    if (!controller) return { ok: false };
    controller.abort();
    return { ok: true };
  });
  ipcMain.handle('project:update-names', (_event, changes) => {
    try {
      return { ok: true, previous: database.updateProjectNames(changes) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('project:update-name', (_event, id, name) => {
    try {
      return { ok: true, project: database.updateProjectName(id, name) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('project:move-to-trash', (_event, ids) => {
    try {
      const results = database.updateProjects(ids, { deleted: true });
      return { ok: true, results, summary: batchSummary(results) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('project:restore', (_event, ids) => {
    try {
      const results = database.updateProjects(ids, { deleted: false });
      return { ok: true, results, summary: batchSummary(results) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('project:group-cover:set', (_event, fingerprint, projectId) => {
    try {
      return { ok: true, ...database.setGroupCover(fingerprint, projectId) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('project:permanent-delete', async (_event, ids = []) => {
    if (storageMigrationActive) return { ok: false, error: '资源库正在迁移，请稍候' };
    if (activeImports.size) return { ok: false, error: '请等待当前图片导入完成后再永久删除' };
    if (permanentDeletionActive) return { ok: false, error: '永久删除正在进行，请稍候' };
    permanentDeletionActive = true;
    const results = { success: [], skipped: [], failed: [] };
    try {
      for (const id of [...new Set(ids.map(String).filter(Boolean))]) {
        const project = database.loadProject(id);
        if (!project) {
          results.skipped.push(id);
          continue;
        }
        if (!project.deleted_at) {
          results.failed.push({ id, error: '图片尚未进入回收站' });
          continue;
        }
        try {
          for (const filePath of [project.thumbnail_path, project.image_path])
            removeManagedAsset(assetsDirectory, filePath);
          database.deleteProject(id);
          results.success.push(id);
        } catch (error) {
          const remainingFiles = [project.thumbnail_path, project.image_path].filter((filePath) => {
            try {
              return fs.existsSync(filePath);
            } catch {
              return false;
            }
          });
          results.failed.push({
            id,
            error: error instanceof Error ? error.message : String(error),
            remainingFiles,
          });
        }
      }
      return { ok: true, results, summary: batchSummary(results) };
    } finally {
      permanentDeletionActive = false;
    }
  });
  ipcMain.handle('project:trash-summary', () => {
    try {
      const projects = database.loadTrashSummary();
      let totalBytes = 0;
      let sizeKnown = true;
      for (const project of projects) {
        for (const filePath of [project.image_path, project.thumbnail_path]) {
          try {
            totalBytes += fs.statSync(filePath).size;
          } catch {
            sizeKnown = false;
          }
        }
      }
      return {
        ok: true,
        projects,
        count: projects.length,
        totalBytes: sizeKnown ? totalBytes : null,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('image:copy', (_event, projectId) => {
    try {
      const project = database.loadProject(projectId);
      if (!project) throw new Error('图片不存在');
      copyManagedImageToClipboard(assetsDirectory, project.image_path, { nativeImage, clipboard });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('image:download', async (event, projectId) => {
    try {
      const project = database.loadProject(projectId);
      if (!project) throw new Error('图片不存在');
      const extension = path.extname(project.image_path).toLowerCase() || '.png';
      const safeBaseName =
        String(hasImageName(project) ? project.name : imageFileName(project))
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
          .trim() || 'NovelAI image';
      const owner = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(owner, {
        title: '下载图片',
        defaultPath:
          hasImageName(project) && !safeBaseName.toLowerCase().endsWith(extension)
            ? `${safeBaseName}${extension}`
            : safeBaseName,
        filters: [{ name: 'Image', extensions: [extension.slice(1)] }],
      });
      if (result.canceled || !result.filePath) return { ok: true, canceled: true };
      copyOriginalAsset(assetsDirectory, project.image_path, result.filePath);
      return { ok: true, filePath: result.filePath };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('workbench:image:copy-current', (_event, filePath) => {
    try {
      copyImageToClipboard(filePath, { nativeImage, clipboard });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('workbench:image:download-current', async (event, request = {}) => {
    try {
      const sourcePath = resolveImageFile(request.filePath);
      const extension = path.extname(sourcePath).toLowerCase() || '.png';
      const safeBaseName =
        String(request.name || path.basename(sourcePath, extension) || 'NovelAI image')
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
          .trim() || 'NovelAI image';
      const owner = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(owner, {
        title: '下载图片',
        defaultPath: `${safeBaseName}${extension}`,
        filters: [{ name: 'Image', extensions: [extension.slice(1)] }],
      });
      if (result.canceled || !result.filePath) return { ok: true, canceled: true };
      copyOriginalImage(sourcePath, result.filePath);
      return { ok: true, filePath: result.filePath };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('tag:annotations:save', (_event, entries = []) => {
    try {
      for (const entry of entries || []) {
        const patch = {};
        if (entry?.translation_source === 'manual')
          patch.translation = String(entry.translation || '');
        if (entry?.category_source === 'manual')
          patch.category = String(entry.category || 'Unsorted');
        if (Object.keys(patch).length)
          database.updateTagDictionary(String(entry?.tag || ''), patch);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const dictionaryTranslations = new Map();
  ipcMain.handle('tag-cache:retranslate', async (event, request = {}) => {
    const id = String(request.id || '');
    const key = `${event.sender.id}:${id}`;
    const controller = new AbortController();
    dictionaryTranslations.get(key)?.abort();
    dictionaryTranslations.set(key, controller);
    const cancel = () => controller.abort();
    event.sender.once('destroyed', cancel);
    try {
      const result = await retranslateDictionary({
        tags: Array.isArray(request.tags) ? request.tags : [],
        database,
        settings: preferences.credentials(),
        fetcher: net.fetch,
        signal: controller.signal,
        progress: (progress) => {
          if (!event.sender.isDestroyed())
            event.sender.send('tag-cache:retranslate:progress', { id, ...progress });
        },
      });
      return { ok: true, id, ...result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (dictionaryTranslations.get(key) === controller) dictionaryTranslations.delete(key);
      event.sender.removeListener('destroyed', cancel);
    }
  });
  ipcMain.handle('tag-cache:retranslate:cancel', (event, id) => {
    dictionaryTranslations.get(`${event.sender.id}:${String(id)}`)?.abort();
    return { ok: true };
  });
  ipcMain.handle('tag-cache:list', async (_event, request = {}) => {
    try {
      const result = database.listTagDictionary(request);
      if (request.all) {
        const counts = await database.tagImageCounts();
        result.items = result.items.map((item) => ({
          ...item,
          image_count: counts.get(item.tag.toLowerCase().replaceAll('_', ' ')) || 0,
        }));
      }
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('tag:suggest', async (_event, query) => {
    try {
      const search = String(query || '')
        .trim()
        .slice(0, 240);
      if (!search) return { ok: true, items: [] };
      const items = new Map(
        searchDsoTags(search).map((item) => [item.tag.toLowerCase().replaceAll(' ', '_'), item]),
      );
      for (const entry of database.listTagDictionary({ query: search, limit: 30 }).items) {
        items.set(entry.tag.toLowerCase().replaceAll(' ', '_'), {
          tag: entry.display_tag || entry.tag,
          translation: entry.translation,
          category: entry.category,
        });
      }
      const counts = await database.tagImageCounts();
      return {
        ok: true,
        items: [...items.values()]
          .reverse()
          .slice(0, 30)
          .map((item) => ({
            ...item,
            tag: item.tag.replaceAll('_', ' '),
            count: counts.get(item.tag.toLowerCase().replaceAll('_', ' ')) || 0,
          })),
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('workbench:structure:save', (_event, request) => {
    try {
      database.rememberWorkbenchStructure(request.filePath, request.structure, request.projectId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('workbench:save-library', async (_event, request = {}) => {
    try {
      if (storageMigrationActive) throw new Error('资源库正在迁移，请稍候');
      await contentBackfill;
      const result = await importLibraryFiles({
        filePaths: [String(request.filePath)],
        assetsDirectory,
        database,
        prepareProject: async (project) =>
          database.enrichProjectTags({
            ...project,
            prompt_structure: normalizePromptStructure(
              { ...project.prompt_structure, block_annotations: request.annotations },
              project.metadata,
            ),
          }),
      });
      const id = result.imported[0]?.id || result.duplicates[0]?.projectId;
      if (!id) throw new Error(result.errors[0]?.error || '图片没有存入图片库');
      const saved = database.loadProject(id);
      database.rememberWorkbenchStructure(
        saved.image_path,
        { ...saved.prompt_structure, block_annotations: request.annotations },
        id,
      );
      return { ok: true, project: database.loadProject(id) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('tag-cache:update', (_event, request = {}) => {
    try {
      const tag = String(request.tag || '').trim();
      if (!tag) throw new Error('Tag 不能为空');
      if (!database.lookupTagDictionary([tag]).size) throw new Error('Tag 缓存不存在或已被删除');
      const patch = request.patch || {};
      return {
        ok: true,
        item: database.updateTagDictionary(tag, {
          translation: patch.translation,
          category: patch.category,
        }),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('tag-cache:update-many', (_event, request = {}) => {
    try {
      return {
        ok: true,
        items: database.updateTagDictionaryCategory(
          request.tags || [],
          String(request.category || ''),
        ),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('tag-cache:delete', (_event, tag) => {
    try {
      return { ok: true, deleted: database.deleteTagDictionary(tag) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('tag-cache:delete-many', (_event, tags = []) => {
    try {
      return { ok: true, deleted: database.deleteTagDictionaries(tags) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('vibe:embedded:reveal', (_event, vibe = {}) => {
    try {
      const filePath = exportEmbeddedVibeFile(vibe, assetsDirectory);
      shell.showItemInFolder(filePath);
      return { ok: true, filePath };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('file:reveal', (_event, filePath) => shell.showItemInFolder(filePath));
  ipcMain.handle('ai:settings:get', () => preferences.publicSettings());
  ipcMain.handle('ai:settings:save', (_event, settings) => preferences.saveAISettings(settings));
  ipcMain.handle('appearance:settings:get', () => preferences.appearanceSettings());
  ipcMain.handle('appearance:settings:save', (_event, settings) => {
    const saved = preferences.saveAppearanceSettings(settings);
    for (const window of BrowserWindow.getAllWindows()) void syncTitleBarOverlay(window);
    return saved;
  });
  nativeTheme.on('updated', () => {
    for (const window of BrowserWindow.getAllWindows()) void syncTitleBarOverlay(window);
  });
  ipcMain.handle('productivity:settings:get', () => preferences.productivitySettings());
  ipcMain.handle('productivity:settings:save', (_event, settings) =>
    preferences.saveProductivitySettings(settings),
  );
  ipcMain.handle('updates:status', () => ({
    ok: true,
    ...updateState,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    ...getUpdateCapabilities(process.platform, app.isPackaged),
  }));
  ipcMain.handle('updates:check', async () => {
    if (acceptanceMode) {
      await acceptanceDoubles.beforeUpdateCheck?.();
      notifyUpdateState({
        phase: 'available',
        hasUpdate: true,
        latestVersion: '99.0.0',
        notes: '# 验收发布说明\n\n本地替身。[验收链接](https://example.com/acceptance)',
        releaseUrl: 'https://github.com/LBEILC/NovelAIPromptStudio/releases/tag/v99.0.0',
      });
      return { ok: true, ...updateState };
    }
    const capabilities = getUpdateCapabilities(process.platform, app.isPackaged);
    try {
      if (!capabilities.canDownloadUpdate) {
        notifyUpdateState({ phase: 'checking', error: '', progress: 0 });
        const release = await checkReleaseUpdates(app.getVersion(), net.fetch);
        notifyUpdateState({
          ...release,
          phase: release.hasUpdate ? 'available' : 'current',
          progress: 0,
          error: '',
        });
        return { ok: true, ...updateState };
      }
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      return {
        ok: true,
        ...updateState,
        currentVersion: app.getVersion(),
        latestVersion: info?.version || updateState.latestVersion,
        hasUpdate: updateState.phase === 'available',
        packaged: true,
        ...capabilities,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifyUpdateState({ phase: 'error', error: message });
      return { ok: false, currentVersion: app.getVersion(), ...capabilities, error: message };
    }
  });
  ipcMain.handle('updates:download', async () => {
    const capabilities = getUpdateCapabilities(process.platform, app.isPackaged);
    if (!capabilities.canDownloadUpdate) {
      const error =
        capabilities.manualUpdateReason === 'unsigned-macos'
          ? '当前 macOS 版本未签名，请从官方 Release 手动更新'
          : '当前环境不支持应用内下载更新';
      return { ok: false, error };
    }
    if (storageMigrationActive || activeImports.size || permanentDeletionActive)
      return { ok: false, error: '请等待导入、迁移或删除操作完成后再下载更新' };
    if (updateState.phase !== 'available' && updateState.phase !== 'error')
      return { ok: false, error: '请先检查并确认有可用更新' };
    try {
      notifyUpdateState({ phase: 'downloading', progress: 0, error: '' });
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      notifyUpdateState({
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('updates:install', () => {
    const capabilities = getUpdateCapabilities(process.platform, app.isPackaged);
    if (!capabilities.canInstallUpdate) {
      const error =
        capabilities.manualUpdateReason === 'unsigned-macos'
          ? '当前 macOS 版本未签名，请从官方 Release 手动更新'
          : '当前环境不支持应用内安装更新';
      return { ok: false, error };
    }
    if (storageMigrationActive || activeImports.size || permanentDeletionActive)
      return { ok: false, error: '请等待导入、迁移或删除操作完成后再安装更新' };
    if (updateState.phase !== 'downloaded') return { ok: false, error: '更新尚未下载完成' };
    setImmediate(() => {
      try {
        installUpdateAfterClosingDatabase(autoUpdater, database, async (error) => {
          if (quitting) return;
          try {
            const reopened = await openDatabase(dataDirectory);
            if (quitting) reopened.close();
            else database = reopened;
          } catch (databaseError) {
            reportDatabaseOpenError(dataDirectory, databaseError);
            return;
          }
          notifyUpdateState({
            phase: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        });
      } catch (error) {
        notifyUpdateState({
          phase: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return { ok: true };
  });
  ipcMain.handle('updates:open-release', async (_event, releaseUrl) => {
    const fallback = 'https://github.com/LBEILC/NovelAIPromptStudio/releases/latest';
    const candidate = String(releaseUrl || fallback);
    const url = candidate.startsWith('https://github.com/LBEILC/NovelAIPromptStudio/')
      ? candidate
      : fallback;
    await shell.openExternal(url);
    return { ok: true };
  });
  ipcMain.handle('fonts:list', async () => {
    try {
      return { ok: true, fonts: await listSystemFonts() };
    } catch (error) {
      return {
        ok: false,
        fonts: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  ipcMain.handle('ai:models:list', async () => {
    try {
      return { ok: true, models: await listModels(preferences.credentials(), net.fetch) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const paragraphRequests = new Map();
  ipcMain.handle('paragraph:transform', async (event, request = {}) => {
    const key = `${event.sender.id}:${String(request.id)}`;
    const controller = new AbortController();
    paragraphRequests.get(key)?.abort();
    paragraphRequests.set(key, controller);
    const cancel = () => controller.abort();
    event.sender.once('destroyed', cancel);
    try {
      const text = await transformParagraph(
        request.text,
        request.direction,
        preferences.credentials(),
        net.fetch,
        controller.signal,
      );
      return { ok: true, text };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (paragraphRequests.get(key) === controller) paragraphRequests.delete(key);
      event.sender.removeListener('destroyed', cancel);
    }
  });
  ipcMain.handle('paragraph:cancel', (event, id) => {
    paragraphRequests.get(`${event.sender.id}:${String(id)}`)?.abort();
    return { ok: true };
  });
  ipcMain.handle('ai:model:test', async () => {
    try {
      return { ok: true, ...(await testModel(preferences.credentials(), net.fetch)) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('translation:tags', async (_event, tags) => {
    try {
      const cleaned = (tags || []).map((tag) => String(tag || '').trim());
      const aiSettings = preferences.publicSettings();
      const resolved = await annotateTags(cleaned, {
        dictionary: database.lookupTagDictionary(cleaned),
        dsoDictionary: lookupDsoTags(cleaned),
        danbooruCache: database.lookupDanbooruTagCache(cleaned),
        lookupDanbooru: (values) => lookupDanbooruTags(values, net.fetch),
        translateMissing: aiSettings.model
          ? (values) => translateTags(values, preferences.credentials(), net.fetch)
          : null,
      });
      const { items, generated, danbooruChecks } = resolved;
      database.upsertDanbooruTagCache(danbooruChecks);
      database.upsertTagDictionary(
        cleaned.map((tag, index) => ({
          tag,
          ...items[index],
          has_translation: Boolean(items[index].translation),
          has_classification: Boolean(items[index].category_source),
        })),
      );
      database.persist();
      return {
        ok: true,
        model: generated?.model || 'DSO 内置词典 / Danbooru / 本地规则',
        items,
        translations: items.map((item) => item.translation),
        categories: items.map((item) => item.category),
        cache_hits: resolved.cacheHits,
        ai_count: resolved.aiCount,
        dso_translation_count: resolved.dsoTranslationCount,
        dso_category_count: resolved.dsoCategoryCount,
        unresolved_count: resolved.unresolvedCount,
        danbooru_category_count: items.filter((item) => item.category_source === 'danbooru').length,
        danbooru_artist_count: items.filter(
          (item) => item.category_source === 'danbooru' && item.category === 'ArtistEra',
        ).length,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  if (acceptanceMode) {
    try {
      const { runAcceptance } = await import('./acceptance/run.js');
      await runAcceptance({
        app,
        mode: acceptanceMode,
        doubles: acceptanceDoubles,
        cardCacheControl: acceptanceCardCache,
        database,
        assetsDirectory,
        preferences,
        createWindow,
      });
      app.quit();
    } catch (error) {
      console.error(error);
      database?.close();
      app.exit(1);
    }
    return;
  }
  if (screenshotMode) {
    try {
      const { runAppScreenshots } = await import('./tools/appScreenshots.js');
      await runAppScreenshots({
        app,
        mode: screenshotMode,
        database,
        assetsDirectory,
        preferences,
        createWindow,
      });
      app.quit();
    } catch (error) {
      console.error(error);
      database?.close();
      app.exit(1);
    }
    return;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!screenshotMode && !acceptanceMode && process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  quitting = true;
  database?.close();
  for (const sessionId of preparedImports.keys()) releasePreparedImport(sessionId).catch(() => {});
});
