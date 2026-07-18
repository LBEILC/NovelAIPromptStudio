import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell } from 'electron';
import { openDatabase } from './database.js';
import { importImage, importVibeImage } from './assets.js';
import { openPreferences } from './preferences.js';
import { listModels, testModel, translateTags } from './translation.js';

app.setName('NovelAI Prompt Studio');

protocol.registerSchemesAsPrivileged([
  { scheme: 'novelai-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } },
]);

let database;
let assetsDirectory;
let preferences;

function createWindow() {
  const window = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1120,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#10151b',
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const developmentUrl = process.env.NOVELAI_DEV_URL || (process.argv.includes('--dev') ? 'http://127.0.0.1:5173' : '');
  if (developmentUrl) window.loadURL(developmentUrl);
  else window.loadFile(path.join(import.meta.dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(async () => {
  const dataDirectory = path.join(app.getPath('userData'), 'data');
  assetsDirectory = path.join(app.getPath('userData'), 'assets');
  database = await openDatabase(dataDirectory);
  preferences = openPreferences(dataDirectory, safeStorage);

  protocol.handle('novelai-media', (request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path');
    if (!filePath) return new Response('Missing media path', { status: 400 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  ipcMain.handle('library:load', () => database.loadLibrary());
  ipcMain.handle('library:import-images', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入 NovelAI 图片',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled) return [];
    const projects = [];
    for (const filePath of result.filePaths) {
      const project = await importImage(filePath, assetsDirectory);
      database.insertProject(project);
      projects.push(project);
    }
    return projects;
  });
  ipcMain.handle('project:update', (_event, project) => {
    database.updateProject(project);
    return { ok: true, updated_at: project.updated_at };
  });
  ipcMain.handle('project:delete', (_event, id) => {
    database.deleteProject(id);
    return { ok: true };
  });
  ipcMain.handle('vibe:choose-image', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Vibe 参考图',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled) return null;
    return importVibeImage(result.filePaths[0], assetsDirectory);
  });
  ipcMain.handle('file:reveal', (_event, filePath) => shell.showItemInFolder(filePath));
  ipcMain.handle('ai:settings:get', () => preferences.publicSettings());
  ipcMain.handle('ai:settings:save', (_event, settings) => preferences.saveAISettings(settings));
  ipcMain.handle('ai:models:list', async () => {
    try {
      return { ok: true, models: await listModels(preferences.credentials(), net.fetch) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
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
      return { ok: true, ...(await translateTags(tags, preferences.credentials(), net.fetch)) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
