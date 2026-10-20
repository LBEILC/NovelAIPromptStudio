// Preview-only adapters copied from main.js. Keep database/import contracts identical.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hasImageName, imageFileName } from '../src/lib/imageNaming.js';
import { applyWorkbenchStructure } from '../electron/workbench.js';
import { retranslateDictionary } from '../electron/dictionaryTranslation.js';
import {
  importLibraryFiles as realImport,
  inspectLibraryImportFiles,
  generateZipEntryPreviews,
} from '../electron/importer.js';
import {
  listModels,
  testModel,
  translateTags,
  transformParagraph,
} from '../electron/translation.js';
import { lookupDsoTags } from '../electron/dsoDictionary.js';
import { annotateTags } from '../electron/tagAnnotations.js';
import { exportEmbeddedVibeFile } from '../electron/vibes.js';
import {
  createDatabaseStorage,
  describeAssetDirectory,
  migrateAssetDirectory,
} from '../electron/libraryStorage.js';
import {
  copyImageToClipboard,
  copyManagedImageToClipboard,
  copyOriginalAsset,
  copyOriginalImage,
  removeManagedAsset,
  resolveImageFile,
} from '../electron/assetFiles.js';

export function createPreviewHandlers({
  database,
  preferences,
  dataDirectory,
  assetsDirectory,
  readImage,
  emit,
  state,
}) {
  let storageMigrationActive = false,
    permanentDeletionActive = false;
  const activeImports = new Map(),
    preparedImports = new Map();
  const workbenchTemporaryDirectory = path.join(dataDirectory, 'clipboard');
  fs.mkdirSync(workbenchTemporaryDirectory, { recursive: true });
  const contentBackfill = Promise.resolve(),
    acceptanceCardCache = null;
  const net = { fetch: (...args) => globalThis.fetch(...args) };
  const BrowserWindow = { fromWebContents: () => null, getAllWindows: () => [] };
  const nativeTheme = { on() {} };
  const syncTitleBarOverlay = () => {};
  const shell = { showItemInFolder() {}, openPath: async () => '', openExternal: async () => {} };
  let clipboardText = '';
  const clipboard = {
    readText: () => clipboardText,
    writeText: (text) => {
      clipboardText = text;
    },
    writeImage() {},
    writeBuffer() {},
    clear() {},
  };
  const nativeImage = { createFromPath: () => ({ isEmpty: () => false }) };
  const dialog = {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true }),
    showMessageBox: async () => ({ response: 0 }),
  };
  const readClipboardImageSource = () => {
    throw Error('浏览器预览请使用拖入或选择图片');
  };
  const cleanupWorkbenchTemporaryImages = () => 0;
  const listSystemFonts = async () =>
    ['MiSans', 'IBM Plex Mono', 'Newsreader'].map((family) => ({ family, displayName: family }));
  const commandRuntime = {
    dispatch: async (_, { path }) => ({ ok: true, data: { project: await readImage(path) } }),
  };
  const importLibraryFiles = async (options) => {
    if (state.slowImport) {
      options.onProgress?.({
        phase: 'preparing',
        processed: 0,
        total: options.filePaths.length,
        current: '准备导入',
      });
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    return realImport({
      ...options,
      prepareProject: async (project) => {
        if (state.slowImport) await new Promise((resolve) => setTimeout(resolve, 1200));
        return options.prepareProject ? options.prepareProject(project) : project;
      },
    });
  };
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
    const referencedPaths = input.paths;
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
        ? await fs.promises.mkdtemp(path.join(dataDirectory, 'archive-preview-'))
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
  const copyLibraryImage = (_event, projectId) => {
    try {
      const project = database.loadProject(projectId);
      if (!project) throw new Error('图片不存在');
      copyManagedImageToClipboard(assetsDirectory, project.image_path, { nativeImage, clipboard });
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
  const copyWorkbenchImage = (_event, filePath) => {
    try {
      copyImageToClipboard(filePath, { nativeImage, clipboard });
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
        fetcher: net.fetch,
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
    emit({ type: 'preview-appearance', data: saved });
    for (const window of BrowserWindow.getAllWindows()) void syncTitleBarOverlay(window);
    return saved;
  });
  nativeTheme.on('updated', () => {
    for (const window of BrowserWindow.getAllWindows()) void syncTitleBarOverlay(window);
  });
  registerCommand('settings.productivity.get', (input, _caller) => {
    return preferences.productivitySettings();
  });
  registerCommand('settings.productivity.save', (input, _event) => {
    const settings = input.settings;
    return preferences.saveProductivitySettings(settings);
  });
  for (const name of [
    'updates.status',
    'updates.check',
    'updates.download',
    'updates.install',
    'updates.open-release',
  ])
    registerCommand(name, () => ({
      ok: true,
      phase: 'current',
      currentVersion: 'preview',
      packaged: false,
      canDownloadUpdate: false,
      canInstallUpdate: false,
    }));
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
      return { ok: true, models: await listModels(preferences.credentials(), net.fetch) };
    } catch (error) {
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
  registerCommand('paragraph.cancel', (input, event) => {
    const id = input.id;
    paragraphRequests.get(`${event.sender.id}:${String(id)}`)?.abort();
    return { ok: true };
  });
  registerCommand('ai.test', async (input, _caller) => {
    try {
      return { ok: true, ...(await testModel(preferences.credentials(), net.fetch)) };
    } catch (error) {
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
        lookupDanbooru: (values) => Promise.resolve([]),
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
  registerCommand('import.cancel', async (input) => {
    const controller = activeImports.get(input.id);
    if (controller) {
      controller.abort();
      return { ok: true };
    }
    return { ok: Boolean(await releasePreparedImport(input.id)) };
  });

  let agentInstalled = false;
  const agentStatus = () => ({
    ok: true,
    installed: agentInstalled,
    path: path.join(dataDirectory, 'bin', 'nai-studio'),
    onPath: agentInstalled,
    skillPath: path.join(dataDirectory, 'agent', 'SKILL.md'),
    platform: process.platform,
  });
  registerCommand('agent.setup', agentStatus);
  registerCommand('agent.install', () => {
    agentInstalled = true;
    return agentStatus();
  });
  registerCommand('agent.skill', () => ({
    ok: true,
    text: '# 预览 Agent\n使用场景面板模拟 Agent 修改提示词和排队生成。',
  }));
  registerCommand('agent.reveal', () => ({ ok: true }));
  return {
    handlers: commandHandlers,
    async close() {
      for (const controller of activeImports.values()) controller.abort();
      for (const id of [...preparedImports.keys()]) await releasePreparedImport(id);
      for (const controller of dictionaryTranslations.values()) controller.abort();
      for (const controller of paragraphRequests.values()) controller.abort();
    },
  };
}
