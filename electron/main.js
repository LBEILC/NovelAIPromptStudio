import { createFolderImporter } from './folderImport.js';
import { deleteLibraryImages } from './deleteLibraryImages.js';
import { createTray } from './tray.js';
import { installWindowClose } from './windowClose.js';
import { isTrayContents, sendWindowEvent } from './windowAccess.js';
import { CommandError } from './commands/registry.js';
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
  session,
  protocol,
  safeStorage,
  screen,
  shell,
} from 'electron';
import electronUpdater from 'electron-updater';
import { createNetworkManager, networkCommands } from './network.js';
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
import { createChatGPT, chatGPTCommands } from './chatgpt.js';
import { listModels, testModel, translateTags, transformParagraph } from './translation.js';
import { lookupDanbooruTags } from './danbooru.js';
import { lookupDsoTags } from './dsoDictionary.js';
import { annotateTags } from './tagAnnotations.js';
import { exportEmbeddedVibeFile } from './vibes.js';
import { applyWorkbenchLibraryDetails, applyWorkbenchStructure } from './workbench.js';
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
import { installCommandRuntime } from './commands/runtime.js';
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
  resolveImageFile,
  resolveManagedAsset,
} from './assetFiles.js';

const { autoUpdater } = electronUpdater;

app.setName('NovelAI Prompt Studio');
const acceptanceMode = configureAcceptanceMode(app);
if (acceptanceMode?.fullLibraryBenchmark) {
  const { startBenchmarkProfile } = await import('./tools/benchmarkProfile.js');
  await startBenchmarkProfile(acceptanceMode);
}
const acceptanceCardCache = createAcceptanceCardCache(acceptanceMode);
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
if (!databaseProbeDirectory && !screenshotMode && !acceptanceMode) {
  if (!app.requestSingleInstanceLock()) app.exit(0);
}
// Windows 按这个 ID 找开始菜单快捷方式来画任务栏图标。从仓库直接跑的 electron.exe 发系统通知时，
// Electron 会建一个指向 electron.exe 的 Electron.lnk 并登记这个 ID，正式版的任务栏就会变成 Electron 的图标
// （用户 10-21），所以开发和验收用另一个 ID。
if (process.platform === 'win32')
  app.setAppUserModelId(app.isPackaged ? 'studio.novelai.prompt' : 'studio.novelai.prompt.dev');
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
let commandRuntime;
let quitPrepared = false;
let quitPreparing;
let quitRequested = false;
let trayController;
const windowClosers = new WeakMap();
function mainWindows() {
  return BrowserWindow.getAllWindows().filter((w) => !isTrayContents(w.webContents));
}
function showMainWindow() {
  if (!preferences || !commandRuntime) return;
  const window = mainWindows()[0] || createWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
app.on('second-instance', showMainWindow);
function requestQuit() {
  quitRequested = true;
  app.quit();
}
async function prepareQuit() {
  quitRequested = true;
  if (!quitPreparing)
    quitPreparing = commandRuntime.flush().then(() => {
      quitPrepared = true;
    });
  try {
    await quitPreparing;
  } catch (error) {
    quitPreparing = undefined;
    quitRequested = false;
    throw error;
  }
}
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
const windowIcons = new WeakMap();
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
  if (!sender.isDestroyed())
    sender.send('studio:command-event', {
      type: 'progress',
      topic: 'library:import-preview',
      data: update,
    });
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
  const windowOptions = {
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
  };
  const window = new BrowserWindow(windowOptions);
  windowIcons.set(window, windowOptions.icon);
  guardClientWindow(window, { packaged: app.isPackaged, shell });
  if (!captureState)
    windowClosers.set(
      window,
      installWindowClose(window, {
        platform: process.platform,
        preferences,
        isQuitting: () => quitRequested || quitPrepared,
        prepare: (window) => commandRuntime.prepareWindow(window),
        quit: requestQuit,
        request: (window) => sendWindowEvent(window, { type: 'close-request' }),
        error: (error) => console.error('Unable to save workbench before closing:', error),
      }),
    );
  window.once('ready-to-show', async () => {
    await syncTitleBarOverlay(window);
    if (!acceptanceMode && !captureState && !window.isDestroyed()) window.show();
  });
  window.webContents.on('did-finish-load', () => void syncTitleBarOverlay(window));
  const developmentUrl =
    process.env.NOVELAI_DEV_URL || (process.argv.includes('--dev') ? 'http://127.0.0.1:5173' : '');
  if (developmentUrl && !captureState) window.loadURL(developmentUrl);
  else
    window.loadFile(
      acceptanceMode?.fullLibraryBenchmark
        ? path.join(acceptanceMode.root, 'build', 'index.html')
        : path.join(import.meta.dirname, '..', 'dist', 'index.html'),
    );
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
    sendWindowEvent(window, { type: 'updates', data: updateState });
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
      checkedAt: new Date().toISOString(),
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
      checkedAt: new Date().toISOString(),
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

async function readCommandImage(filePath) {
  const result = await commandRuntime.dispatch('image.read', { path: filePath }, 'ui');
  if (!result.ok) throw new Error(result.error.message);
  return result.data.project;
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
            BrowserWindow.getFocusedWindow()?.webContents.send('studio:command-event', {
              type: 'navigate',
              destination: destination,
            }),
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
  preferences.onboardingSettings(() => database.hasOnboardingHistory());
  const network = createNetworkManager({
    session: session.fromPartition('studio-network', { cache: false }),
    updaterSession: autoUpdater.netSession,
    createTestSession: () => session.fromPartition('studio-network-test', { cache: false }),
    preferences,
    emit: (event) => {
      for (const window of BrowserWindow.getAllWindows()) sendWindowEvent(window, event);
    },
  });
  await network.initialize();
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

  const commandHandlers = {};
  const registerCommand = (name, handler) => {
    commandHandlers[name] = handler;
  };
  registerCommand('clipboard.read-text', (input, _caller) => {
    return clipboard.readText();
  });
  registerCommand('clipboard.write-text', (input, _event) => {
    const text = input.text;
    return clipboard.writeText(String(text));
  });

  const cardProgressRequests = new Map();
  registerCommand('library.cards', async (input, event) => {
    const request = input;
    await contentBackfill;
    let subscription = cardProgressRequests.get(event.sender.id);
    if (!subscription) {
      const send = (progress) => {
        if (!event.sender.isDestroyed())
          event.sender.send('studio:command-event', {
            type: 'progress',
            topic: 'library:cards-progress',
            data: progress,
          });
      };
      subscription = {
        count: 0,
        report: (progress) => {
          if (acceptanceCardCache) acceptanceCardCache.report(progress, send);
          else send(progress);
        },
      };
      cardProgressRequests.set(event.sender.id, subscription);
    }
    subscription.count++;
    try {
      return await database.loadLibraryCards(request.view, subscription.report);
    } finally {
      if (--subscription.count === 0) cardProgressRequests.delete(event.sender.id);
    }
  });

  registerCommand('collection.create', (input, _event) => {
    const request = input.collection;
    try {
      return {
        ok: true,
        collection: database.createCollection({ ...request, id: crypto.randomUUID() }),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  registerCommand('collection.update', (input, _event) => {
    const request = input;
    try {
      return { ok: true, collection: database.updateCollection(request.id, request.patch) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  registerCommand('collection.delete', (input, _event) => {
    const id = input.id;
    try {
      return { ok: true, deleted: database.deleteCollection(id) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const databaseStorage = createDatabaseStorage(dataDirectory);
  registerCommand('storage.database', (input, _caller) => {
    return { ok: true, ...databaseStorage.location() };
  });
  registerCommand('storage.backups', async (input, _caller) => {
    try {
      return { ok: true, ...(await databaseStorage.listBackups()) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  registerCommand('storage.reveal-backup', async (input, _event) => {
    const fileName = input.fileName;
    try {
      await databaseStorage.reveal(fileName, (file) => shell.showItemInFolder(file));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  registerCommand('storage.get', async (input, _caller) => {
    try {
      const details = await describeAssetDirectory(assetsDirectory);
      return { ok: true, ...details, ...preferences.librarySettings() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  registerCommand('storage.reveal', async (input, _caller) => {
    try {
      fs.mkdirSync(assetsDirectory, { recursive: true });
      const error = await shell.openPath(assetsDirectory);
      return error ? { ok: false, error } : { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  registerCommand('storage.change', async (input, event) => {
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
          if (!event.sender.isDestroyed())
            event.sender.send('studio:command-event', {
              type: 'progress',
              topic: 'library:storage-progress',
              data: progress,
            });
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

  registerCommand('workbench.open-many', async (input, event) => {
    const request = { filePaths: input.paths };
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
            await readCommandImage(filePath),
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
  registerCommand('workbench.open-clipboard', async (input, _caller) => {
    try {
      const source = readClipboardImageSource(workbenchTemporaryDirectory);
      const project = await readCommandImage(source.filePath);
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
  registerCommand('workbench.temp-sync', (input, _event) => {
    const referencedPaths = [...input.paths, ...database.versions.referencedPaths()];
    try {
      return {
        ok: true,
        removed: cleanupWorkbenchTemporaryImages(workbenchTemporaryDirectory, referencedPaths),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  registerCommand('import.prepare', async (input, event) => {
    const request = { filePaths: input.paths || [] };
    if (storageMigrationActive) return { ok: false, error: '资源库正在迁移，请稍候' };
    await contentBackfill;
    let filePaths = Array.isArray(request.filePaths) ? request.filePaths : [];
    if (!filePaths.length) {
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
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
  registerCommand('import.previews', (input, event) => {
    const sessionId = input.sessionId;
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

  registerCommand('import.commit', async (input, event) => {
    const request = input;
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
        event.sender.send('studio:command-event', {
          type: 'progress',
          topic: 'library:import-progress',
          data: { batchId, ...progress },
        });
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
  registerCommand('import.files', async (input, event) => {
    const request = { filePaths: input.paths || [], fromClipboard: input.fromClipboard };
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
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
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
        event.sender.send('studio:command-event', {
          type: 'progress',
          topic: 'library:import-progress',
          data: { batchId, ...progress },
        });
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

  registerCommand('library.restore', (input, _event) => {
    const ids = input.ids;
    try {
      const results = database.updateProjects(ids, { deleted: false });
      return { ok: true, results, summary: batchSummary(results) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  registerCommand('trash.delete-permanently', async (input, _event) => {
    const ids = input.ids || [];
    if (storageMigrationActive) return { ok: false, error: '资源库正在迁移，请稍候' };
    if (activeImports.size) return { ok: false, error: '请等待当前图片导入完成后再永久删除' };
    if (permanentDeletionActive) return { ok: false, error: '永久删除正在进行，请稍候' };
    permanentDeletionActive = true;
    try {
      const { results, keptFiles } = deleteLibraryImages(database, assetsDirectory, ids);
      return { ok: true, results, summary: batchSummary(results), keptFiles };
    } finally {
      permanentDeletionActive = false;
    }
  });
  registerCommand('trash.summary', (input, _caller) => {
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
  const clipboardAdapters = (event) => {
    const handle = BrowserWindow.fromWebContents(event.sender)?.getNativeWindowHandle();
    return {
      nativeImage,
      clipboard,
      owner:
        process.platform === 'win32' && handle
          ? handle.length === 8
            ? handle.readBigUInt64LE()
            : BigInt(handle.readUInt32LE())
          : undefined,
      ...(acceptanceDoubles ? { systemClipboard: () => acceptanceDoubles.systemClipboard } : {}),
    };
  };
  const copyLibraryImage = async (event, projectId) => {
    try {
      const project = database.loadProject(projectId);
      if (!project) throw new Error('图片不存在');
      await copyManagedImageToClipboard(
        assetsDirectory,
        project.image_path,
        clipboardAdapters(event),
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
  const saveLibraryImage = async (event, projectId) => {
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
  };
  const copyWorkbenchImage = async (event, filePath) => {
    try {
      await copyImageToClipboard(filePath, clipboardAdapters(event));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
  const saveWorkbenchImage = async (event, request = {}) => {
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
  };

  const dictionaryTranslations = new Map();
  registerCommand('dictionary.retranslate', async (input, event) => {
    const request = input;
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
        fetcher: network.fetch,
        signal: controller.signal,
        progress: (progress) => {
          if (!event.sender.isDestroyed())
            event.sender.send('studio:command-event', {
              type: 'progress',
              topic: 'tag-cache:retranslate:progress',
              data: { id, ...progress },
            });
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
  registerCommand('dictionary.retranslate-cancel', (input, event) => {
    const id = input.id;
    dictionaryTranslations.get(`${event.sender.id}:${String(id)}`)?.abort();
    return { ok: true };
  });

  registerCommand('workbench.save-structure', (input, _event) => {
    const request = input;
    try {
      database.rememberWorkbenchStructure(request.filePath, request.structure, request.projectId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  registerCommand('dictionary.remove', (input, _event) => {
    const tags = input.tags;
    try {
      return { ok: true, deleted: database.deleteTagDictionaries(tags) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const revealVibe = (_event, vibe = {}) => {
    try {
      const filePath = exportEmbeddedVibeFile(vibe, assetsDirectory);
      shell.showItemInFolder(filePath);
      return { ok: true, filePath };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  registerCommand('settings.ai.get', (input, _caller) => {
    return preferences.publicSettings();
  });
  registerCommand('settings.ai.save', (input, _event) => {
    const settings = input.settings;
    return preferences.saveAISettings(settings);
  });
  registerCommand('settings.appearance.get', (input, _caller) => {
    return preferences.appearanceSettings();
  });
  registerCommand('settings.appearance.save', (input, _event) => {
    const settings = input.settings;
    const saved = preferences.saveAppearanceSettings(settings);
    for (const window of mainWindows()) void syncTitleBarOverlay(window);
    trayController?.reload();
    return saved;
  });
  nativeTheme.on('updated', () => {
    for (const window of mainWindows()) void syncTitleBarOverlay(window);
    trayController?.reload();
  });
  registerCommand('window.close-choice', async (input, caller) => {
    const window = BrowserWindow.fromWebContents(caller.sender);
    const closer = window && windowClosers.get(window);
    if (!closer || process.platform !== 'win32')
      throw new CommandError('forbidden', '此窗口不支持关闭选择');
    await closer.choose(input.action, input.remember);
    return {};
  });
  for (const [name, method] of [
    ['tray.menu-size', 'resize'],
    ['tray.action', 'action'],
  ]) {
    registerCommand(name, (input, caller) => {
      if (!trayController || !isTrayContents(caller.sender))
        throw new CommandError('forbidden', '仅托盘窗口可调用');
      return trayController[method](input);
    });
  }
  registerCommand('settings.productivity.get', (input, _caller) => {
    return preferences.productivitySettings();
  });
  registerCommand('settings.productivity.save', (input, _event) => {
    const settings = input.settings;
    return preferences.saveProductivitySettings(settings);
  });
  registerCommand('updates.status', (input, _caller) => {
    return {
      ok: true,
      ...updateState,
      currentVersion: app.getVersion(),
      packaged: app.isPackaged,
      ...getUpdateCapabilities(process.platform, app.isPackaged),
    };
  });
  registerCommand('updates.check', async (input, _caller) => {
    if (acceptanceMode) {
      await acceptanceDoubles.beforeUpdateCheck?.();
      notifyUpdateState({
        phase: 'available',
        hasUpdate: true,
        latestVersion: '99.0.0',
        checkedAt: new Date().toISOString(),
        structuredNotes: acceptanceDoubles.structuredNotes || null,
        notes: '# 验收发布说明\n\n本地替身。[验收链接](https://example.com/acceptance)',
        releaseUrl: 'https://github.com/LBEILC/NovelAIPromptStudio/releases/tag/v99.0.0',
      });
      return { ok: true, ...updateState };
    }
    const capabilities = getUpdateCapabilities(process.platform, app.isPackaged);
    try {
      if (!capabilities.canDownloadUpdate) {
        notifyUpdateState({ phase: 'checking', error: '', progress: 0 });
        const release = await checkReleaseUpdates(app.getVersion(), network.fetch);
        notifyUpdateState({
          ...release,
          phase: release.hasUpdate ? 'available' : 'current',
          progress: 0,
          error: '',
        });
        return { ok: true, ...updateState };
      }
      const result = await network.run(() => autoUpdater.checkForUpdates());
      const info = result?.updateInfo;
      try {
        const release = await checkReleaseUpdates(app.getVersion(), network.fetch);
        if (release.latestVersion === updateState.latestVersion)
          notifyUpdateState({
            structuredNotes: release.structuredNotes,
            checkedAt: release.checkedAt,
          });
      } catch {
        /* Keep the updater's Markdown when GitHub attachments are unavailable. */
      }
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
  registerCommand('updates.download', async (input, _caller) => {
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
      await network.run(() => autoUpdater.downloadUpdate());
      return { ok: true };
    } catch (error) {
      notifyUpdateState({
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  registerCommand('updates.install', (input, _caller) => {
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
    setImmediate(async () => {
      try {
        await prepareQuit();
        installUpdateAfterClosingDatabase(autoUpdater, database, async (error) => {
          if (quitting) return;
          quitPrepared = false;
          quitRequested = false;
          quitPreparing = undefined;
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
        quitPrepared = false;
        quitRequested = false;
        quitPreparing = undefined;
        notifyUpdateState({
          phase: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return { ok: true };
  });
  registerCommand('updates.open-release', async (input, _event) => {
    const releaseUrl = input.url;
    const fallback = 'https://github.com/LBEILC/NovelAIPromptStudio/releases/latest';
    const candidate = String(releaseUrl || fallback);
    const url = candidate.startsWith('https://github.com/LBEILC/NovelAIPromptStudio/')
      ? candidate
      : fallback;
    await shell.openExternal(url);
    return { ok: true };
  });
  registerCommand('fonts.list', async (input, _caller) => {
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
  registerCommand('ai.models', async (input, _caller) => {
    try {
      return { ok: true, models: await listModels(preferences.credentials(), network.fetch) };
    } catch (error) {
      if (error instanceof CommandError) throw error;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const paragraphRequests = new Map();
  registerCommand('paragraph.transform', async (input, event) => {
    const request = input.request;
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
        network.fetch,
        controller.signal,
      );
      return { ok: true, text };
    } catch (error) {
      if (error instanceof CommandError) throw error;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (paragraphRequests.get(key) === controller) paragraphRequests.delete(key);
      event.sender.removeListener('destroyed', cancel);
    }
  });
  registerCommand('paragraph.cancel', (input, event) => {
    const id = input.id;
    paragraphRequests.get(`${event.sender.id}:${String(id)}`)?.abort();
    return { ok: true };
  });
  registerCommand('ai.test', async (input, _caller) => {
    try {
      return { ok: true, ...(await testModel(preferences.credentials(), network.fetch)) };
    } catch (error) {
      if (error instanceof CommandError) throw error;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  registerCommand('dictionary.translate', async (input, _event) => {
    const tags = input.tags;
    try {
      const cleaned = (tags || []).map((tag) => String(tag || '').trim());
      const aiSettings = preferences.publicSettings();
      const resolved = await annotateTags(cleaned, {
        dictionary: database.lookupTagDictionary(cleaned),
        dsoDictionary: lookupDsoTags(cleaned),
        danbooruCache: database.lookupDanbooruTagCache(cleaned),
        lookupDanbooru: (values) => lookupDanbooruTags(values, network.fetch),
        translateMissing: (
          aiSettings.provider === 'chatgpt' ? aiSettings.chatgpt.signedIn : aiSettings.model
        )
          ? (values) => translateTags(values, preferences.credentials(), network.fetch)
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
      if (error instanceof CommandError) throw error;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  registerCommand('image.copy', (input, caller) =>
    input.id ? copyLibraryImage(caller, input.id) : copyWorkbenchImage(caller, input.path),
  );
  registerCommand('image.save-as', (input, caller) =>
    input.id
      ? saveLibraryImage(caller, input.id)
      : saveWorkbenchImage(caller, { filePath: input.path, name: input.name }),
  );
  registerCommand('file.reveal', (input, caller) => {
    if (input.vibe) return revealVibe(caller, input.vibe);
    shell.showItemInFolder(input.path);
    return { ok: true, filePath: input.path };
  });
  const folderImporter = createFolderImporter({
    database,
    assetsDirectory: () => assetsDirectory,
    activeImports,
  });
  const folderProgress = (caller) => (data) => {
    if (caller.sender && !caller.sender.isDestroyed())
      caller.sender.send('studio:command-event', {
        type: 'progress',
        topic: 'library:import-progress',
        data,
      });
  };
  registerCommand('import.folder.scan', async (input, caller) => {
    try {
      if (storageMigrationActive || permanentDeletionActive)
        throw new Error('请等待图片库操作完成');
      await contentBackfill;
      let selected = input.path;
      if (!selected) {
        const owner = caller.sender && BrowserWindow.fromWebContents(caller.sender);
        const result = await dialog.showOpenDialog(owner, { properties: ['openDirectory'] });
        if (result.canceled || !result.filePaths[0]) return { canceled: true };
        selected = result.filePaths[0];
      }
      return { ok: true, ...(await folderImporter.scan(selected, folderProgress(caller))) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  registerCommand('import.folder.commit', async (input, caller) => {
    try {
      if (storageMigrationActive || permanentDeletionActive)
        throw new Error('请等待图片库操作完成');
      return { ok: true, ...(await folderImporter.commit(input, folderProgress(caller))) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  registerCommand('import.cancel', async (input) => {
    if (folderImporter.cancel(input.id)) return { ok: true };
    const controller = activeImports.get(input.id);
    if (controller) {
      controller.abort();
      return { ok: true };
    }
    return { ok: Boolean(await releasePreparedImport(input.id)) };
  });
  let acceptanceGeneration;
  let chatGPTFixture;
  if (acceptanceMode && !acceptanceMode.packaged) {
    const { startFakeChatGPT } = await import('./fixtures/chatGPTService.js');
    chatGPTFixture = await startFakeChatGPT();
  }
  const chatGPT = createChatGPT({
    preferences,
    clientVersion: app.getVersion(),
    fetcher: chatGPTFixture?.fetcher || network.fetch,
    runNetwork: network.run,
    openExternal: chatGPTFixture
      ? (url) => chatGPTFixture.openExternal(url)
      : (url) => shell.openExternal(url),
    endpoints: chatGPTFixture?.endpoints,
    emit: (event) => {
      for (const window of BrowserWindow.getAllWindows()) sendWindowEvent(window, event);
    },
  });
  Object.assign(
    commandHandlers,
    networkCommands(network),
    chatGPTCommands(chatGPT, preferences, (url) => shell.openExternal(url)),
  );
  app.once('before-quit', () => chatGPT.close());
  if (
    (acceptanceMode && !acceptanceMode.packaged) ||
    (screenshotMode && process.argv.includes('--app-screenshot-readme'))
  ) {
    const { startFakeNovelAI } = await import('./fixtures/novelAIService.js');
    acceptanceGeneration = await startFakeNovelAI();
  }
  try {
    const beforeCommand = installAcceptanceLatency(acceptanceMode);
    commandRuntime = await installCommandRuntime({
      preferences,
      generationBaseUrl: acceptanceGeneration?.url,
      network,
      fetcher: network.fetch,
      beforeCommand,
      onEvent: (event) => {
        if (event.type === 'generation') trayController?.generation(event.data);
      },
      handlers: commandHandlers,
      readyLibrary: () => contentBackfill,
      selectSource: async (caller) => {
        const owner = caller.sender && BrowserWindow.fromWebContents(caller.sender);
        const result = await dialog.showOpenDialog(owner, {
          title: '在工作台中打开 NovelAI 图片',
          defaultPath: imageDialogDefaultPath(),
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        });
        if (result.canceled || !result.filePaths[0]) return null;
        rememberImageDirectory(result.filePaths);
        return { type: 'file', path: result.filePaths[0] };
      },
      database,
      assetsDirectory: () => assetsDirectory,
      busy: () => storageMigrationActive || permanentDeletionActive,
      createWindow,
      testRoot:
        acceptanceMode || screenshotMode
          ? path.join((acceptanceMode || screenshotMode).root, 'agent-install')
          : undefined,
    });
  } catch (error) {
    console.error('Unable to initialize workbench commands:', error);
    if (!acceptanceMode && !screenshotMode) {
      dialog.showErrorBox(
        '启动失败',
        `NovelAI Prompt Studio 无法启动。\n\n错误信息：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    database.close();
    app.exit(1);
    return;
  }

  if (process.platform === 'win32' && !screenshotMode) {
    trayController = createTray({
      app,
      shell,
      showMain: showMainWindow,
      isQuitting: () => quitRequested,
      quit: requestQuit,
      icon: appIconPath,
      developmentUrl:
        process.env.NOVELAI_DEV_URL ||
        (process.argv.includes('--dev') ? 'http://127.0.0.1:5173' : ''),
    });
  }
  if (acceptanceMode) {
    try {
      const { runAcceptance } = await import('./acceptance/run.js');
      await runAcceptance({
        appIconPath,
        windowIcons,
        chatGPTFixture,
        trayController,
        generationService: acceptanceGeneration,
        app,
        mode: acceptanceMode,
        doubles: acceptanceDoubles,
        cardCacheControl: acceptanceCardCache,
        commandHandlers,
        database,
        assetsDirectory,
        preferences,
        createWindow,
      });
      await acceptanceGeneration?.close();
      chatGPT.close();
      await chatGPTFixture?.close();
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
        commandHandlers,
        generationService: acceptanceGeneration,
        app,
        mode: screenshotMode,
        database,
        assetsDirectory,
        preferences,
        createWindow,
      });
      await acceptanceGeneration?.close();
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
app.on('before-quit', (event) => {
  quitRequested = true;
  if (!quitPrepared && commandRuntime && !acceptanceMode && !screenshotMode) {
    event.preventDefault();
    void prepareQuit()
      .then(() => {
        quitPrepared = true;
        app.quit();
      })
      .catch((error) => console.error('Unable to save workbench before quitting:', error));
    return;
  }
  quitting = true;
  void commandRuntime?.close();
  database?.close();
  for (const sessionId of preparedImports.keys()) releasePreparedImport(sessionId).catch(() => {});
});

app.on('will-quit', () => trayController?.destroy());
