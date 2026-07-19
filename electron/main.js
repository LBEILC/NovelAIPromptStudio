import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, safeStorage, screen, shell } from 'electron';
import { openDatabase } from './database.js';
import { importImage, importVibeImage, projectEmbeddedVibes } from './assets.js';
import { fingerprintVibe, importEmbeddedVibe, importVibeFile, toProjectVibe } from './vibes.js';
import { openPreferences } from './preferences.js';
import { listModels, testModel, translateTags } from './translation.js';

app.setName('NovelAI Prompt Studio');

protocol.registerSchemesAsPrivileged([
  { scheme: 'novelai-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } },
]);

let database;
let assetsDirectory;
let preferences;

function libraryOrganizationResult(action) {
  try {
    return { ok: true, ...action() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function embeddedVibeState(project) {
  const items = projectEmbeddedVibes(project);
  const library = new Map(database.loadVibeLibrary().map((entry) => [entry.id, entry]));
  const linked = new Set((project.vibes || []).map((vibe) => database.resolveVibeLibraryId(vibe.library_id)).filter(Boolean));
  const candidates = items.map((item, index) => {
    const fingerprint = fingerprintVibe(item.encoding);
    const libraryId = database.resolveVibeLibraryId(fingerprint);
    return { item, index, fingerprint, libraryId, entry: library.get(libraryId), linked: linked.has(libraryId) };
  });
  return {
    items,
    candidates,
    summary: {
      total: candidates.length,
      linked: candidates.filter((candidate) => candidate.linked).length,
      available: candidates.filter((candidate) => candidate.entry && !candidate.linked).length,
      missing: candidates.filter((candidate) => !candidate.entry).map((candidate) => ({
        index: candidate.index,
        fingerprint: candidate.fingerprint,
        strength: candidate.item.strength,
        information_extracted: candidate.item.information_extracted,
        information_extracted_known: candidate.item.information_extracted === null ? 0 : 1,
      })),
    },
  };
}

function linkAvailableEmbeddedVibes(project) {
  const state = embeddedVibeState(project);
  const seen = new Set((project.vibes || []).map((vibe) => database.resolveVibeLibraryId(vibe.library_id)).filter(Boolean));
  const additions = [];
  for (const candidate of state.candidates) {
    if (!candidate.entry || seen.has(candidate.libraryId)) continue;
    seen.add(candidate.libraryId);
    additions.push({
      ...toProjectVibe(candidate.entry),
      strength: candidate.item.strength,
      information_extracted: candidate.item.information_extracted ?? candidate.entry.information_extracted,
      information_extracted_known: candidate.item.information_extracted === null ? candidate.entry.information_extracted_known : 1,
    });
  }
  const linkedProject = additions.length ? { ...project, vibes: [...(project.vibes || []), ...additions] } : project;
  return { project: linkedProject, additions, status: embeddedVibeState(linkedProject).summary };
}

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
    const linked = linkAvailableEmbeddedVibes(storedProject);
    if (linked.additions.length) database.updateProject(linked.project);
  }

  protocol.handle('novelai-media', (request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path');
    if (!filePath) return new Response('Missing media path', { status: 400 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  ipcMain.handle('library:load', () => database.loadLibrary());
  ipcMain.handle('library:organization:load', () => database.loadLibraryOrganization());
  ipcMain.handle('library:collection:create', (_event, name) => libraryOrganizationResult(() => database.createCollection(name)));
  ipcMain.handle('library:collection:rename', (_event, id, name) => libraryOrganizationResult(() => database.renameCollection(id, name)));
  ipcMain.handle('library:collection:delete', (_event, id) => libraryOrganizationResult(() => database.deleteCollection(id)));
  ipcMain.handle('library:collection:add-projects', (_event, collectionId, projectIds) => libraryOrganizationResult(() => database.addProjectsToCollection(collectionId, projectIds)));
  ipcMain.handle('library:collection:remove-projects', (_event, collectionId, projectIds) => libraryOrganizationResult(() => database.removeProjectsFromCollection(collectionId, projectIds)));
  ipcMain.handle('library:projects:favorite', (_event, projectIds, favorite) => libraryOrganizationResult(() => database.setProjectsFavorite(projectIds, favorite)));
  ipcMain.handle('library:projects:trash', (_event, projectIds, deleted) => libraryOrganizationResult(() => database.setProjectsDeleted(projectIds, deleted)));
  ipcMain.handle('library:import-images', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入 NovelAI 图片',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled) return [];
    const projects = [];
    for (const filePath of result.filePaths) {
      let project = await importImage(filePath, assetsDirectory);
      project = linkAvailableEmbeddedVibes(project).project;
      project = database.enrichProjectTags(project);
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
    if (result.canceled) return { ok: true, canceled: true, library: database.loadVibeLibrary(), imported: [], errors: [] };
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
    return { ok: errors.length === 0, canceled: false, library: database.loadVibeLibrary(), imported: imported.map((entry) => entry.id), errors };
  });
  ipcMain.handle('vibe:library:use', (_event, entry) => toProjectVibe(entry));
  ipcMain.handle('vibe:project:embedded-status', (_event, project) => embeddedVibeState(project).summary);
  ipcMain.handle('vibe:project:resolve-embedded', async (_event, project, mode = 'retry') => {
    try {
      let extracted = 0;
      if (mode === 'extract') {
        const state = embeddedVibeState(project);
        const entries = [];
        for (const candidate of state.candidates.filter((item) => !item.entry)) {
          entries.push(await importEmbeddedVibe(candidate.item, assetsDirectory, project.name || project.image_path, candidate.index));
        }
        if (entries.length) {
          database.upsertVibeLibrary(entries);
          extracted = entries.length;
        }
      }
      const linked = linkAvailableEmbeddedVibes(project);
      if (linked.additions.length) database.updateProject(linked.project);
      return {
        ok: true,
        project: linked.project,
        status: linked.status,
        library: database.loadVibeLibrary(),
        linked: linked.additions.length,
        extracted,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
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
      const cleaned = (tags || []).map((tag) => String(tag || '').trim());
      const keyOf = (tag) => tag.toLocaleLowerCase('en-US');
      const cached = database.lookupTagDictionary(cleaned);
      const missing = cleaned.map((tag, index) => {
        const entry = cached.get(keyOf(tag));
        return !entry?.has_translation || !entry?.has_classification ? { tag, index, entry } : null;
      }).filter(Boolean);
      const generated = missing.length
        ? await translateTags(missing.map((item) => item.tag), preferences.credentials(), net.fetch)
        : null;
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
      return {
        ok: true,
        model: generated?.model || '本地词典',
        items,
        translations: items.map((item) => item.translation),
        categories: items.map((item) => item.category),
        cache_hits: cleaned.length - missing.length,
        ai_count: missing.length,
      };
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
