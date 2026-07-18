import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, safeStorage, screen, shell } from 'electron';
import { openDatabase } from './database.js';
import { importImage, importVibeImage, recoverEmbeddedVibes } from './assets.js';
import { importVibeFile, toProjectVibe } from './vibes.js';
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
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
  const defaultWidth = Math.min(1720, Math.max(960, workAreaWidth - 16));
  const defaultHeight = Math.min(1040, Math.max(680, workAreaHeight - 16));
  const window = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    minWidth: Math.min(1280, defaultWidth),
    minHeight: Math.min(720, defaultHeight),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: process.platform === 'win32',
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
  if (process.platform === 'win32') Menu.setApplicationMenu(null);

  const dataDirectory = path.join(app.getPath('userData'), 'data');
  assetsDirectory = path.join(app.getPath('userData'), 'assets');
  database = await openDatabase(dataDirectory);
  preferences = openPreferences(dataDirectory, safeStorage);

  for (const storedProject of database.loadLibrary()) {
    const recovered = await recoverEmbeddedVibes(storedProject, assetsDirectory);
    if (!recovered.libraryEntries.length) continue;
    database.upsertVibeLibrary(recovered.libraryEntries);
    const vibeLibrary = new Map(database.loadVibeLibrary().map((entry) => [entry.id, entry]));
    const seenVibes = new Set();
    recovered.project.vibes = recovered.project.vibes.flatMap((vibe) => {
      const resolvedId = database.resolveVibeLibraryId(vibe.library_id);
      if (seenVibes.has(resolvedId)) return [];
      seenVibes.add(resolvedId);
      const libraryEntry = vibeLibrary.get(resolvedId);
      return [libraryEntry ? { ...toProjectVibe(libraryEntry, vibe.id), strength: vibe.strength, enabled: Boolean(vibe.enabled) } : vibe];
    });
    database.updateProject(recovered.project);
  }

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
      database.upsertVibeLibrary(project.vibe_library_entries || []);
      const vibeLibrary = new Map(database.loadVibeLibrary().map((entry) => [entry.id, entry]));
      project.vibes = (project.vibes || []).map((vibe) => {
        const libraryEntry = vibeLibrary.get(database.resolveVibeLibraryId(vibe.library_id));
        return libraryEntry ? { ...toProjectVibe(libraryEntry, vibe.id), strength: vibe.strength } : vibe;
      });
      delete project.vibe_library_entries;
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
  ipcMain.handle('vibe:library:load', () => database.loadVibeLibrary());
  ipcMain.handle('vibe:library:import', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入 Vibe 或参考图',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'NovelAI Vibe 与图片', extensions: ['naiv4vibe', 'png', 'jpg', 'jpeg', 'webp'] },
        { name: 'NovelAI V4 Vibe', extensions: ['naiv4vibe'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      ],
    });
    if (result.canceled) return { ok: true, library: database.loadVibeLibrary(), imported: [], errors: [] };
    const imported = [];
    const errors = [];
    for (const filePath of result.filePaths) {
      try {
        imported.push(path.extname(filePath).toLowerCase() === '.naiv4vibe'
          ? await importVibeFile(filePath, assetsDirectory)
          : await importVibeImage(filePath, assetsDirectory));
      } catch (error) {
        errors.push({ file: path.basename(filePath), error: error instanceof Error ? error.message : String(error) });
      }
    }
    database.upsertVibeLibrary(imported);
    return { ok: errors.length === 0, library: database.loadVibeLibrary(), imported: imported.map((entry) => entry.id), errors };
  });
  ipcMain.handle('vibe:library:use', (_event, entry) => toProjectVibe(entry));
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
