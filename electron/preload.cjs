// @ts-check
const { contextBridge, ipcRenderer, webUtils } = require('electron');

let screenshotPending = 0;
/** @param {string} channel @param {...any} args */
function invoke(channel, ...args) {
  if (!screenshotArgument) return ipcRenderer.invoke(channel, ...args);
  screenshotPending += 1;
  return ipcRenderer.invoke(channel, ...args).finally(() => {
    screenshotPending -= 1;
  });
}

contextBridge.exposeInMainWorld(
  'studio',
  /** @satisfies {import('../src/shared/ipc').StudioApi} */ ({
    loadLibrary: (view = 'all') => invoke('library:load', { view }),
    loadCollections: () => invoke('library:collections:list'),
    createCollection: (collection) => invoke('library:collections:create', collection),
    updateCollection: (id, patch) => invoke('library:collections:update', { id, patch }),
    deleteCollection: (id) => invoke('library:collections:delete', id),
    updateCollectionProjects: (id, projectIds, action = 'add') =>
      invoke('library:collections:projects', { id, projectIds, action }),
    getLibraryStorage: () => invoke('library:storage:get'),
    getDatabaseStorage: () => invoke('database:storage:get'),
    listDatabaseBackups: () => invoke('database:backups:list'),
    revealDatabaseFile: (fileName) => invoke('database:storage:reveal', fileName),
    changeLibraryStorage: () => invoke('library:storage:change'),
    revealLibraryStorage: () => invoke('library:storage:reveal'),
    onLibraryStorageProgress: (callback) => {
      ipcRenderer.removeAllListeners('library:storage-progress');
      ipcRenderer.on('library:storage-progress', (_event, progress) => callback(progress));
    },
    offLibraryStorageProgress: () => ipcRenderer.removeAllListeners('library:storage-progress'),
    openWorkbenchImage: (filePath = '', source = null) =>
      invoke('workbench:image:open', { filePath, source }),
    openClipboardWorkbenchImage: () => invoke('workbench:image:clipboard'),
    syncWorkbenchTemporaryImages: (referencedPaths) =>
      invoke('workbench:temp:sync', referencedPaths),
    openDroppedWorkbenchImages: (files) =>
      invoke('workbench:images:open-dropped', {
        filePaths: Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean),
      }),
    importImages: () => invoke('library:import-images'),
    importClipboardImage: () => invoke('library:import-images', { fromClipboard: true }),
    importDroppedFiles: (files) =>
      invoke('library:import-images', {
        filePaths: Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean),
      }),
    prepareImport: () => invoke('library:import-prepare'),
    prepareDroppedImport: (files) =>
      invoke('library:import-prepare', {
        filePaths: Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean),
      }),
    startPreparedImportPreviews: (sessionId) => invoke('library:import-previews:start', sessionId),
    cancelPreparedImport: (sessionId) => invoke('library:import-prepared:cancel', sessionId),
    commitPreparedImport: (sessionId, entryIds) =>
      invoke('library:import-prepared:commit', { sessionId, entryIds }),
    onPreparedImportPreview: (callback) => {
      ipcRenderer.removeAllListeners('library:import-preview');
      ipcRenderer.on('library:import-preview', (_event, update) => callback(update));
    },
    offPreparedImportPreview: () => ipcRenderer.removeAllListeners('library:import-preview'),
    cancelImport: (batchId) => invoke('library:import-cancel', batchId),
    onImportProgress: (callback) => {
      ipcRenderer.removeAllListeners('library:import-progress');
      ipcRenderer.on('library:import-progress', (_event, progress) => callback(progress));
    },
    offImportProgress: () => ipcRenderer.removeAllListeners('library:import-progress'),
    updateProjectName: (id, name) => invoke('project:update-name', id, name),
    moveProjectsToTrash: (ids) => invoke('project:move-to-trash', ids),
    restoreProjects: (ids) => invoke('project:restore', ids),
    permanentlyDeleteProjects: (ids) => invoke('project:permanent-delete', ids),
    getTrashSummary: () => invoke('project:trash-summary'),
    setGroupCover: (fingerprint, projectId) =>
      invoke('project:group-cover:set', fingerprint, projectId),
    copyProjectImage: (id) => invoke('image:copy', id),
    downloadProjectImage: (id) => invoke('image:download', id),
    copyWorkbenchImage: (filePath) => invoke('workbench:image:copy-current', filePath),
    downloadWorkbenchImage: (filePath, name) =>
      invoke('workbench:image:download-current', { filePath, name }),
    saveTagAnnotations: (entries) => invoke('tag:annotations:save', entries),
    listTagCache: (request) => invoke('tag-cache:list', request),
    updateTagCache: (tag, patch) => invoke('tag-cache:update', { tag, patch }),
    updateTagCacheMany: (tags, category) => invoke('tag-cache:update-many', { tags, category }),
    deleteTagCache: (tag) => invoke('tag-cache:delete', tag),
    deleteTagCacheMany: (tags) => invoke('tag-cache:delete-many', tags),
    revealEmbeddedVibe: (vibe) => invoke('vibe:embedded:reveal', vibe),
    revealFile: (filePath) => invoke('file:reveal', filePath),
    getAISettings: () => invoke('ai:settings:get'),
    saveAISettings: (settings) => invoke('ai:settings:save', settings),
    getAppearanceSettings: () => invoke('appearance:settings:get'),
    saveAppearanceSettings: (settings) => invoke('appearance:settings:save', settings),
    getProductivitySettings: () => invoke('productivity:settings:get'),
    saveProductivitySettings: (settings) => invoke('productivity:settings:save', settings),
    getUpdateStatus: () => invoke('updates:status'),
    checkForUpdates: () => invoke('updates:check'),
    downloadUpdate: () => invoke('updates:download'),
    installUpdate: () => invoke('updates:install'),
    openReleasePage: (url) => invoke('updates:open-release', url),
    onUpdateState: (callback) => {
      ipcRenderer.removeAllListeners('updates:state');
      ipcRenderer.on('updates:state', (_event, state) => callback(state));
    },
    offUpdateState: () => ipcRenderer.removeAllListeners('updates:state'),
    listSystemFonts: () => invoke('fonts:list'),
    listAIModels: () => invoke('ai:models:list'),
    testAIModel: () => invoke('ai:model:test'),
    translateTags: (tags) => invoke('translation:tags', tags),
  }),
);

// No bridge or listeners exist without the main-process screenshot argument.
const screenshotArgument = process.argv.find((value) =>
  value.startsWith('--app-screenshot-state='),
);
if (screenshotArgument) {
  contextBridge.exposeInMainWorld('studioScreenshot', {
    ...JSON.parse(screenshotArgument.slice('--app-screenshot-state='.length)),
    pending: () => screenshotPending,
    reportError: (/** @type {unknown} */ message) =>
      ipcRenderer.send('screenshot:error', String(message)),
  });
  window.addEventListener('error', (event) => ipcRenderer.send('screenshot:error', event.message));
  window.addEventListener('unhandledrejection', (event) =>
    ipcRenderer.send('screenshot:error', String(event.reason)),
  );
}
