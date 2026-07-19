import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, safeStorage, screen, shell } from 'electron';
import { openDatabase } from './database.js';
import { importVibeImage, projectEmbeddedVibes } from './assets.js';
import { backfillProjectContentHashes, importLibraryFiles } from './importer.js';
import { fingerprintVibe, importEmbeddedVibe, importVibeFile, toProjectVibe } from './vibes.js';
import { openPreferences } from './preferences.js';
import { listModels, testModel, translateTags } from './translation.js';
import { generationSnapshot, hasGenerationChanges, mergeResultAnnotations } from '../src/lib/branches.js';
import { compareBranchResult } from '../src/lib/branchMatching.js';
import { buildContextMenuTemplate } from './contextMenus.js';

app.setName('NovelAI Prompt Studio');

protocol.registerSchemesAsPrivileged([
  { scheme: 'novelai-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } },
]);

let database;
let assetsDirectory;
let preferences;
let contentHashBackfill = Promise.resolve();
const activeImports = new Map();

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
  contentHashBackfill = backfillProjectContentHashes(database).catch((error) => {
    console.error('Unable to backfill legacy image fingerprints', error);
  });

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
  ipcMain.handle('context-menu:show', (event, request = {}) => new Promise((resolve) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    if (!ownerWindow || ownerWindow.isDestroyed()) { resolve(null); return; }
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      resolve(action);
    };
    const template = buildContextMenuTemplate(request, finish);
    if (!template.length) { finish(null); return; }
    const x = Number.isFinite(Number(request.x)) ? Math.max(0, Math.round(Number(request.x))) : undefined;
    const y = Number.isFinite(Number(request.y)) ? Math.max(0, Math.round(Number(request.y))) : undefined;
    Menu.buildFromTemplate(template).popup({ window: ownerWindow, x, y, callback: () => finish(null) });
  }));
  ipcMain.handle('library:organization:load', () => database.loadLibraryOrganization());
  ipcMain.handle('library:collection:create', (_event, name) => libraryOrganizationResult(() => database.createCollection(name)));
  ipcMain.handle('library:collection:rename', (_event, id, name) => libraryOrganizationResult(() => database.renameCollection(id, name)));
  ipcMain.handle('library:collection:delete', (_event, id) => libraryOrganizationResult(() => database.deleteCollection(id)));
  ipcMain.handle('library:collection:add-projects', (_event, collectionId, projectIds) => libraryOrganizationResult(() => database.addProjectsToCollection(collectionId, projectIds)));
  ipcMain.handle('library:collection:remove-projects', (_event, collectionId, projectIds) => libraryOrganizationResult(() => database.removeProjectsFromCollection(collectionId, projectIds)));
  ipcMain.handle('library:series:create', (_event, name) => libraryOrganizationResult(() => database.createSeries(name)));
  ipcMain.handle('library:series:rename', (_event, id, name) => libraryOrganizationResult(() => database.renameSeries(id, name)));
  ipcMain.handle('library:series:delete', (_event, id) => libraryOrganizationResult(() => database.deleteSeries(id)));
  ipcMain.handle('library:series:add-projects', (_event, seriesId, projectIds) => libraryOrganizationResult(() => database.addProjectsToSeries(seriesId, projectIds)));
  ipcMain.handle('library:series:remove-projects', (_event, seriesId, projectIds) => libraryOrganizationResult(() => database.removeProjectsFromSeries(seriesId, projectIds)));
  ipcMain.handle('library:experiment:create', (_event, name, baselineProjectId, projectIds) => libraryOrganizationResult(() => database.createExperiment(name, baselineProjectId, projectIds)));
  ipcMain.handle('library:experiment:rename', (_event, id, name) => libraryOrganizationResult(() => database.renameExperiment(id, name)));
  ipcMain.handle('library:experiment:delete', (_event, id) => libraryOrganizationResult(() => database.deleteExperiment(id)));
  ipcMain.handle('library:experiment:add-projects', (_event, experimentId, projectIds) => libraryOrganizationResult(() => database.addProjectsToExperiment(experimentId, projectIds)));
  ipcMain.handle('library:experiment:remove-projects', (_event, experimentId, projectIds) => libraryOrganizationResult(() => database.removeProjectsFromExperiment(experimentId, projectIds)));
  ipcMain.handle('library:projects:favorite', (_event, projectIds, favorite) => libraryOrganizationResult(() => database.setProjectsFavorite(projectIds, favorite)));
  ipcMain.handle('library:projects:trash', (_event, projectIds, deleted) => libraryOrganizationResult(() => database.setProjectsDeleted(projectIds, deleted)));
  ipcMain.handle('library:import-images', async (event, request = {}) => {
    await contentHashBackfill;
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
    const notify = (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send('library:import-progress', { batchId, ...progress });
    };
    try {
      return {
        batchId,
        ...(await importLibraryFiles({
          filePaths,
          assetsDirectory,
          database,
          collectionId: String(request.collectionId || ''),
          signal: controller.signal,
          onProgress: notify,
          prepareProject: async (project) => database.enrichProjectTags(linkAvailableEmbeddedVibes(project).project),
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify({ phase: 'complete', total: 0, processed: 0, imported: 0, duplicates: 0, failed: 1, skipped: 0, remaining: 0, cancelled: false });
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
  ipcMain.handle('project:update', (_event, project) => {
    try {
      const stored = database.loadProject(project.id);
      if (!stored) return { ok: false, error: '结果图不存在或已被删除' };
      if (hasGenerationChanges(stored, project)) return { ok: false, immutable: true, error: '结果图的生成事实不可修改，请创建分支方案' };
      const merged = mergeResultAnnotations(stored, project);
      database.updateProject(merged);
      return { ok: true, updated_at: merged.updated_at };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('branch:create', (_event, branch) => libraryOrganizationResult(() => ({ branch: database.createBranch(branch) })));
  ipcMain.handle('branch:update', (_event, branch) => libraryOrganizationResult(() => ({ branch: database.updateBranch(branch) })));
  ipcMain.handle('branch:delete', (_event, branchId) => libraryOrganizationResult(() => { database.deleteBranch(branchId); return {}; }));
  ipcMain.handle('branch:result:import', async (_event, branchId) => {
    try {
      await contentHashBackfill;
      const branch = database.loadBranch(branchId);
      if (!branch) return { ok: false, error: '分支不存在或已被删除' };
      if (!['waiting', 'result', 'mismatch'].includes(branch.status)) return { ok: false, error: '请先把分支标记为待生成' };
      const selection = await dialog.showOpenDialog({
        title: '上传分支生成结果',
        properties: ['openFile'],
        filters: [{ name: 'NovelAI PNG', extensions: ['png'] }],
      });
      if (selection.canceled) return { ok: true, canceled: true };
      const imported = await importLibraryFiles({
        filePaths: selection.filePaths,
        assetsDirectory,
        database,
        prepareProject: async (project) => database.enrichProjectTags(linkAvailableEmbeddedVibes(project).project),
      });
      const project = imported.imported[0]
        || (imported.duplicates[0]?.projectId ? database.loadProject(imported.duplicates[0].projectId) : null);
      if (!project) return { ...imported, ok: false, error: imported.errors[0]?.error || '没有读取到可用的结果图' };
      let snapshot;
      try { snapshot = JSON.parse(branch.snapshot_json); } catch { return { ok: false, error: '分支方案损坏，无法核对结果' }; }
      const match = compareBranchResult(snapshot, project);
      const attached = match.status === 'matched'
        ? { branch: database.attachBranchResult(branch.id, project.id, match), actualBranch: null }
        : database.attachMismatchedBranchResult(branch.id, project.id, JSON.stringify(generationSnapshot(project)), match);
      return { ok: true, canceled: false, ...attached, project, match, imported: imported.imported.length > 0 };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
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
