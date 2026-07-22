import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, safeStorage, screen, shell } from 'electron';
import { openDatabase } from './database.js';
import { backfillProjectContentHashes, backfillProjectDimensions, importLibraryFiles } from './importer.js';
import { openPreferences } from './preferences.js';
import { listModels, testModel, translateTags } from './translation.js';
import { exportEmbeddedVibeFile } from './vibes.js';
import { readWorkbenchImage } from './workbench.js';
import { listSystemFonts } from './fonts.js';
import { describeAssetDirectory, migrateAssetDirectory } from './libraryStorage.js';

app.setName('NovelAI Prompt Studio');
if (process.platform === 'win32') app.setAppUserModelId('studio.novelai.prompt');
protocol.registerSchemesAsPrivileged([{ scheme: 'novelai-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }]);

let database;
let assetsDirectory;
let preferences;
let contentBackfill = Promise.resolve();
let storageMigrationActive = false;
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

function safeRemoveAsset(filePath) {
  const target = path.resolve(String(filePath || ''));
  const root = path.resolve(assetsDirectory);
  const relative = path.relative(root, target);
  if (!target || !relative || relative.startsWith('..') || path.isAbsolute(relative)) return;
  fs.rmSync(target, { force: true });
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

  ipcMain.handle('library:load', async () => { await contentBackfill; return database.loadLibrary(); });
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
    if (request.fromDrop && !filePath) return { ok: false, project: null, error: '无法读取拖入文件的本地路径' };
    if (!filePath) {
      const result = await dialog.showOpenDialog({
        title: '在工作台中打开 NovelAI 图片',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (result.canceled) return { ok: true, canceled: true, project: null };
      [filePath] = result.filePaths;
    }
    try {
      return { ok: true, project: await readWorkbenchImage(filePath, { enrichProjectTags: database.enrichProjectTags }) };
    } catch (error) {
      return { ok: false, project: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('library:import-images', async (event, request = {}) => {
    if (storageMigrationActive) return { ok: false, imported: [], duplicates: [], errors: [], error: '资源库正在迁移，请稍候' };
    await contentBackfill;
    let filePaths = Array.isArray(request.filePaths) ? request.filePaths : [];
    if (!filePaths.length) {
      const result = await dialog.showOpenDialog({
        title: '导入 NovelAI 图片或 ZIP',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'NovelAI 图片与 ZIP', extensions: ['png', 'jpg', 'jpeg', 'webp', 'zip'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
          { name: 'ZIP archives', extensions: ['zip'] },
        ],
      });
      if (result.canceled) return { ok: true, canceled: true, imported: [], duplicates: [], errors: [], summary: null };
      filePaths = result.filePaths;
    }
    const batchId = crypto.randomUUID();
    const controller = new AbortController();
    activeImports.set(batchId, controller);
    const notify = (progress) => { if (!event.sender.isDestroyed()) event.sender.send('library:import-progress', { batchId, ...progress }); };
    try {
      return { batchId, ...(await importLibraryFiles({
        filePaths,
        assetsDirectory,
        database,
        signal: controller.signal,
        onProgress: notify,
        prepareProject: async (project) => database.enrichProjectTags(project),
      })) };
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
  ipcMain.handle('project:delete', (_event, id) => {
    try {
      const project = database.loadProject(id);
      if (!project) return { ok: false, error: '图片不存在或已被移除' };
      database.deleteProject(id);
      const cleanupErrors = [];
      for (const filePath of [project.image_path, project.thumbnail_path]) {
        try { safeRemoveAsset(filePath); }
        catch (error) { cleanupErrors.push(error instanceof Error ? error.message : String(error)); }
      }
      return { ok: true, cleanupWarning: cleanupErrors.join('\n') };
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
      const keyOf = (tag) => tag.toLocaleLowerCase('en-US');
      const cached = database.lookupTagDictionary(cleaned);
      const missing = cleaned.map((tag, index) => {
        const entry = cached.get(keyOf(tag));
        return !entry?.has_translation || !entry?.has_classification ? { tag, index } : null;
      }).filter(Boolean);
      const generated = missing.length ? await translateTags(missing.map((item) => item.tag), preferences.credentials(), net.fetch) : null;
      const generatedByIndex = new Map(missing.map((item, index) => [item.index, generated.items[index]]));
      const items = cleaned.map((tag, index) => {
        const entry = cached.get(keyOf(tag));
        const ai = generatedByIndex.get(index);
        return {
          translation: entry?.has_translation ? entry.translation : ai.translation,
          category: entry?.has_classification ? entry.category : ai.category,
          translation_source: entry?.has_translation ? 'cache' : 'ai',
          category_source: entry?.has_classification ? 'cache' : 'ai',
        };
      });
      database.upsertTagDictionary(cleaned.map((tag, index) => ({ tag, ...items[index], has_translation: true, has_classification: true })));
      database.persist();
      return { ok: true, model: generated?.model || '本地词典', items, translations: items.map((item) => item.translation), categories: items.map((item) => item.category), cache_hits: cleaned.length - missing.length, ai_count: missing.length };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
