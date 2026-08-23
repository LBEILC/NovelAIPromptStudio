import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, net, protocol, safeStorage, screen, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { openDatabase } from './database.js';
import { backfillProjectContentHashes, backfillProjectDimensions, importLibraryFiles } from './importer.js';
import { openPreferences } from './preferences.js';
import { listModels, testModel, translateTags } from './translation.js';
import { lookupDanbooruTags } from './danbooru.js';
import { lookupDsoTags } from './dsoDictionary.js';
import { annotateTags } from './tagAnnotations.js';
import { exportEmbeddedVibeFile } from './vibes.js';
import { applyWorkbenchLibraryDetails, readWorkbenchImage } from './workbench.js';
import { listSystemFonts } from './fonts.js';
import { describeAssetDirectory, migrateAssetDirectory } from './libraryStorage.js';
import { cleanupWorkbenchTemporaryImages, readClipboardImageSource } from './clipboardImages.js';
import { checkForUpdates as checkReleaseUpdates, getUpdateCapabilities } from './updates.js';
import { configureAppProfile } from './appProfile.js';
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
configureAppProfile(app);
if (process.platform === 'win32') app.setAppUserModelId('studio.novelai.prompt');
protocol.registerSchemesAsPrivileged([{ scheme: 'novelai-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }]);

let database;
let assetsDirectory;
let preferences;
let contentBackfill = Promise.resolve();
let storageMigrationActive = false;
let permanentDeletionActive = false;
let workbenchTemporaryDirectory;
let updateState = { phase: 'idle', progress: 0, currentVersion: '', latestVersion: '', error: '', releaseUrl: '' };
const activeImports = new Map();
const appIconPath = path.join(import.meta.dirname, '..', 'build', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

function createWindow() {
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
  const defaultWidth = Math.min(1720, Math.max(960, workAreaWidth - 16));
  const defaultHeight = Math.min(1040, Math.max(680, workAreaHeight - 16));
  const window = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    minWidth: Math.min(1080, defaultWidth),
    minHeight: Math.min(700, defaultHeight),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: process.platform === 'win32',
    icon: appIconPath,
    backgroundColor: '#10151b',
    webPreferences: { preload: path.join(import.meta.dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const developmentUrl = process.env.NOVELAI_DEV_URL || (process.argv.includes('--dev') ? 'http://127.0.0.1:5173' : '');
  if (developmentUrl) window.loadURL(developmentUrl);
  else window.loadFile(path.join(import.meta.dirname, '..', 'dist', 'index.html'));
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

function releaseNotesText(notes) {
  if (Array.isArray(notes)) return notes.map((item) => `${item.version || ''}\n${item.note || ''}`.trim()).filter(Boolean).join('\n\n');
  return String(notes || '').trim();
}

function configureAutoUpdater() {
  if (!getUpdateCapabilities(process.platform, app.isPackaged).canDownloadUpdate) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('checking-for-update', () => notifyUpdateState({ phase: 'checking', error: '', progress: 0 }));
  autoUpdater.on('update-available', (info) => notifyUpdateState({
    phase: 'available',
    hasUpdate: true,
    latestVersion: info.version,
    publishedAt: info.releaseDate || '',
    notes: releaseNotesText(info.releaseNotes).slice(0, 4_000),
    progress: 0,
    error: '',
  }));
  autoUpdater.on('update-not-available', (info) => notifyUpdateState({
    phase: 'current',
    hasUpdate: false,
    latestVersion: info.version || app.getVersion(),
    publishedAt: info.releaseDate || '',
    notes: '',
    progress: 0,
    error: '',
  }));
  autoUpdater.on('download-progress', (progress) => notifyUpdateState({
    phase: 'downloading',
    progress: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
    transferred: Number(progress.transferred) || 0,
    total: Number(progress.total) || 0,
    bytesPerSecond: Number(progress.bytesPerSecond) || 0,
    error: '',
  }));
  autoUpdater.on('update-downloaded', (info) => notifyUpdateState({
    phase: 'downloaded',
    hasUpdate: true,
    latestVersion: info.version,
    progress: 100,
    error: '',
  }));
  autoUpdater.on('error', (error) => notifyUpdateState({
    phase: 'error',
    error: error instanceof Error ? error.message : String(error),
  }));
}

function imageDialogDefaultPath() {
  const recent = preferences.productivitySettings().recentImageDirectory;
  return recent || undefined;
}

function rememberImageDirectory(filePaths = []) {
  if (filePaths[0]) preferences.saveProductivitySettings({ recentImageDirectory: path.dirname(filePaths[0]) });
}

function batchSummary(results = {}) {
  return {
    success: results.success?.length || 0,
    skipped: results.skipped?.length || 0,
    failed: results.failed?.length || 0,
  };
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') Menu.setApplicationMenu(null);
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(appIconPath);
  const dataDirectory = path.join(app.getPath('userData'), 'data');
  const defaultAssetsDirectory = path.join(app.getPath('userData'), 'assets');
  try {
    database = await openDatabase(dataDirectory);
  } catch (error) {
    dialog.showErrorBox(
      '无法升级图片库',
      `应用已停止写入数据。请保留 ${path.join(dataDirectory, 'studio.pre-phase2.sqlite')}，并检查数据库后重试。\n\n${error instanceof Error ? error.message : String(error)}`,
    );
    app.quit();
    return;
  }
  preferences = openPreferences(dataDirectory, safeStorage, { defaultAssetsDirectory });
  configureAutoUpdater();
  workbenchTemporaryDirectory = path.join(app.getPath('userData'), 'workbench-temp');
  assetsDirectory = preferences.librarySettings().assetsDirectory;
  try {
    fs.mkdirSync(assetsDirectory, { recursive: true });
  } catch (error) {
    dialog.showErrorBox('资源库位置不可用', `无法访问：${assetsDirectory}\n\n请检查磁盘或文件夹权限，然后在设置中更改位置。\n\n${error instanceof Error ? error.message : String(error)}`);
  }
  contentBackfill = Promise.all([
    backfillProjectContentHashes(database).catch((error) => console.error('Unable to backfill image fingerprints', error)),
    backfillProjectDimensions(database).catch((error) => console.error('Unable to backfill image dimensions', error)),
  ]);

  protocol.handle('novelai-media', (request) => {
    const filePath = new URL(request.url).searchParams.get('path');
    if (!filePath) return new Response('Missing media path', { status: 400 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  ipcMain.handle('library:load', async (_event, request = {}) => { await contentBackfill; return database.loadLibrary(request.view); });
  ipcMain.handle('library:collections:list', async () => {
    try {
      await contentBackfill;
      return { ok: true, collections: database.listCollections() };
    } catch (error) {
      return { ok: false, collections: [], error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:collections:create', (_event, request = {}) => {
    try {
      return { ok: true, collection: database.createCollection({ ...request, id: crypto.randomUUID() }) };
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
      const results = database.updateCollectionProjects(request.id, request.projectIds, request.action);
      return { ok: true, results, summary: batchSummary(results) };
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
    if (targetDirectory === path.resolve(assetsDirectory)) return { ok: true, canceled: true, noChange: true };
    try {
      const current = await describeAssetDirectory(assetsDirectory);
      const size = current.totalBytes < 1024 * 1024
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
        onProgress: (progress) => { if (!event.sender.isDestroyed()) event.sender.send('library:storage-progress', progress); },
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
    const libraryProject = request.source?.type === 'library' && request.source.projectId
      ? database.loadProject(request.source.projectId)
      : null;
    if (libraryProject?.image_path) filePath = libraryProject.image_path;
    if (request.fromDrop && !filePath) return { ok: false, project: null, error: '无法读取拖入文件的本地路径' };
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
      const project = await readWorkbenchImage(filePath, { enrichProjectTags: database.enrichProjectTags });
      return {
        ok: true,
        project: applyWorkbenchLibraryDetails(project, libraryProject),
        source: request.source
          ? { ...request.source, path: filePath }
          : { type: 'file', path: filePath },
      };
    } catch (error) {
      return { ok: false, project: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('workbench:images:open-dropped', async (_event, request = {}) => {
    const filePaths = Array.isArray(request.filePaths) ? request.filePaths.map(String).filter(Boolean) : [];
    if (!filePaths.length) return { ok: false, items: [], error: '无法读取拖入文件的本地路径' };
    const items = [];
    for (const filePath of filePaths) {
      try {
        items.push({
          ok: true,
          project: await readWorkbenchImage(filePath, { enrichProjectTags: database.enrichProjectTags }),
          source: { type: 'file', path: filePath },
        });
      } catch (error) {
        items.push({ ok: false, filePath, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { ok: items.some((item) => item.ok), items, error: items.every((item) => !item.ok) ? items[0]?.error : '' };
  });
  ipcMain.handle('workbench:image:clipboard', async () => {
    try {
      const source = readClipboardImageSource(workbenchTemporaryDirectory);
      const project = await readWorkbenchImage(source.filePath, { enrichProjectTags: database.enrichProjectTags });
      return {
        ok: true,
        project,
        metadataMissing: source.fromBitmap && !project.metadata?.prompt_raw && !project.metadata?.negative_prompt,
        source: {
          type: 'clipboard',
          path: source.filePath,
          temporaryId: source.temporaryId,
          fingerprint: source.fingerprint,
        },
      };
    } catch (error) {
      return { ok: false, project: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('workbench:temp:sync', (_event, referencedPaths = []) => {
    try {
      return { ok: true, removed: cleanupWorkbenchTemporaryImages(workbenchTemporaryDirectory, referencedPaths) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:import-images', async (event, request = {}) => {
    if (storageMigrationActive) return { ok: false, imported: [], duplicates: [], errors: [], error: '资源库正在迁移，请稍候' };
    await contentBackfill;
    let clipboardSource = null;
    let filePaths = Array.isArray(request.filePaths) ? request.filePaths : [];
    if (request.fromClipboard) {
      try {
        clipboardSource = readClipboardImageSource(workbenchTemporaryDirectory);
        filePaths = [clipboardSource.filePath];
      } catch (error) {
        return { ok: false, imported: [], duplicates: [], errors: [{ file: '剪贴板', error: error instanceof Error ? error.message : String(error) }], error: error instanceof Error ? error.message : String(error) };
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
      if (result.canceled) return { ok: true, canceled: true, imported: [], duplicates: [], errors: [], summary: null };
      filePaths = result.filePaths;
      rememberImageDirectory(result.filePaths);
    }
    const batchId = crypto.randomUUID();
    const controller = new AbortController();
    activeImports.set(batchId, controller);
    const notify = (progress) => { if (!event.sender.isDestroyed()) event.sender.send('library:import-progress', { batchId, ...progress }); };
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
        metadataMissing: Boolean(request.fromClipboard && clipboardSource?.fromBitmap && imported.imported?.some((project) => !project.metadata?.prompt_raw && !project.metadata?.negative_prompt)),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, batchId, imported: [], duplicates: [], errors: [{ file: '导入批次', error: message }], summary: { total: 0, processed: 0, imported: 0, duplicates: 0, failed: 1, skipped: 0, remaining: 0, cancelled: false } };
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
          for (const filePath of [project.thumbnail_path, project.image_path]) removeManagedAsset(assetsDirectory, filePath);
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
          results.failed.push({ id, error: error instanceof Error ? error.message : String(error), remainingFiles });
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
          try { totalBytes += fs.statSync(filePath).size; } catch { sizeKnown = false; }
        }
      }
      return { ok: true, projects, count: projects.length, totalBytes: sizeKnown ? totalBytes : null };
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
      const safeBaseName = String(project.name || 'NovelAI image').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').trim() || 'NovelAI image';
      const owner = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(owner, {
        title: '下载图片',
        defaultPath: `${safeBaseName}${extension}`,
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
      const safeBaseName = String(request.name || path.basename(sourcePath, extension) || 'NovelAI image')
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
        if (entry?.translation_source === 'manual') patch.translation = String(entry.translation || '');
        if (entry?.category_source === 'manual') patch.category = String(entry.category || 'Unsorted');
        if (Object.keys(patch).length) database.updateTagDictionary(String(entry?.tag || ''), patch);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('tag-cache:list', (_event, request = {}) => {
    try {
      return { ok: true, ...database.listTagDictionary(request) };
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
        items: database.updateTagDictionaryCategory(request.tags || [], String(request.category || '')),
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
  ipcMain.handle('appearance:settings:save', (_event, settings) => preferences.saveAppearanceSettings(settings));
  ipcMain.handle('productivity:settings:get', () => preferences.productivitySettings());
  ipcMain.handle('productivity:settings:save', (_event, settings) => preferences.saveProductivitySettings(settings));
  ipcMain.handle('updates:status', () => ({
    ok: true,
    ...updateState,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    ...getUpdateCapabilities(process.platform, app.isPackaged),
  }));
  ipcMain.handle('updates:check', async () => {
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
      const error = capabilities.manualUpdateReason === 'unsigned-macos'
        ? '当前 macOS 版本未签名，请从官方 Release 手动更新'
        : '当前环境不支持应用内下载更新';
      return { ok: false, error };
    }
    if (storageMigrationActive || activeImports.size || permanentDeletionActive) return { ok: false, error: '请等待导入、迁移或删除操作完成后再下载更新' };
    if (updateState.phase !== 'available' && updateState.phase !== 'error') return { ok: false, error: '请先检查并确认有可用更新' };
    try {
      notifyUpdateState({ phase: 'downloading', progress: 0, error: '' });
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      notifyUpdateState({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('updates:install', () => {
    const capabilities = getUpdateCapabilities(process.platform, app.isPackaged);
    if (!capabilities.canInstallUpdate) {
      const error = capabilities.manualUpdateReason === 'unsigned-macos'
        ? '当前 macOS 版本未签名，请从官方 Release 手动更新'
        : '当前环境不支持应用内安装更新';
      return { ok: false, error };
    }
    if (storageMigrationActive || activeImports.size || permanentDeletionActive) return { ok: false, error: '请等待导入、迁移或删除操作完成后再安装更新' };
    if (updateState.phase !== 'downloaded') return { ok: false, error: '更新尚未下载完成' };
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true };
  });
  ipcMain.handle('updates:open-release', async (_event, releaseUrl) => {
    const fallback = 'https://github.com/LBEILC/NovelAIPromptStudio/releases/latest';
    const candidate = String(releaseUrl || fallback);
    const url = candidate.startsWith('https://github.com/LBEILC/NovelAIPromptStudio/') ? candidate : fallback;
    await shell.openExternal(url);
    return { ok: true };
  });
  ipcMain.handle('fonts:list', async () => {
    try {
      return { ok: true, fonts: await listSystemFonts() };
    } catch (error) {
      return { ok: false, fonts: [], error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('ai:models:list', async () => {
    try { return { ok: true, models: await listModels(preferences.credentials(), net.fetch) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle('ai:model:test', async () => {
    try { return { ok: true, ...(await testModel(preferences.credentials(), net.fetch)) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
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
      database.upsertTagDictionary(cleaned.map((tag, index) => ({
        tag,
        ...items[index],
        has_translation: Boolean(items[index].translation),
        has_classification: Boolean(items[index].category_source),
      })));
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
        danbooru_artist_count: items.filter((item) => item.category_source === 'danbooru' && item.category === 'ArtistEra').length,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
