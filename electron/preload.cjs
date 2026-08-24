const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  loadLibrary: (view = 'all') => ipcRenderer.invoke('library:load', { view }),
  loadCollections: () => ipcRenderer.invoke('library:collections:list'),
  createCollection: (collection) => ipcRenderer.invoke('library:collections:create', collection),
  updateCollection: (id, patch) => ipcRenderer.invoke('library:collections:update', { id, patch }),
  deleteCollection: (id) => ipcRenderer.invoke('library:collections:delete', id),
  updateCollectionProjects: (id, projectIds, action = 'add') => ipcRenderer.invoke('library:collections:projects', { id, projectIds, action }),
  getLibraryStorage: () => ipcRenderer.invoke('library:storage:get'),
  changeLibraryStorage: () => ipcRenderer.invoke('library:storage:change'),
  revealLibraryStorage: () => ipcRenderer.invoke('library:storage:reveal'),
  onLibraryStorageProgress: (callback) => {
    ipcRenderer.removeAllListeners('library:storage-progress');
    ipcRenderer.on('library:storage-progress', (_event, progress) => callback(progress));
  },
  offLibraryStorageProgress: () => ipcRenderer.removeAllListeners('library:storage-progress'),
  openWorkbenchImage: (filePath = '', source = null) => ipcRenderer.invoke('workbench:image:open', { filePath, source }),
  openClipboardWorkbenchImage: () => ipcRenderer.invoke('workbench:image:clipboard'),
  syncWorkbenchTemporaryImages: (referencedPaths) => ipcRenderer.invoke('workbench:temp:sync', referencedPaths),
  openDroppedWorkbenchImages: (files) => ipcRenderer.invoke('workbench:images:open-dropped', {
    filePaths: Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean),
  }),
  importImages: () => ipcRenderer.invoke('library:import-images'),
  importClipboardImage: () => ipcRenderer.invoke('library:import-images', { fromClipboard: true }),
  importDroppedFiles: (files) => ipcRenderer.invoke('library:import-images', {
    filePaths: Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean),
  }),
  prepareImport: () => ipcRenderer.invoke('library:import-prepare'),
  prepareDroppedImport: (files) => ipcRenderer.invoke('library:import-prepare', {
    filePaths: Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean),
  }),
  startPreparedImportPreviews: (sessionId) => ipcRenderer.invoke('library:import-previews:start', sessionId),
  cancelPreparedImport: (sessionId) => ipcRenderer.invoke('library:import-prepared:cancel', sessionId),
  commitPreparedImport: (sessionId, entryIds) => ipcRenderer.invoke('library:import-prepared:commit', { sessionId, entryIds }),
  onPreparedImportPreview: (callback) => {
    ipcRenderer.removeAllListeners('library:import-preview');
    ipcRenderer.on('library:import-preview', (_event, update) => callback(update));
  },
  offPreparedImportPreview: () => ipcRenderer.removeAllListeners('library:import-preview'),
  cancelImport: (batchId) => ipcRenderer.invoke('library:import-cancel', batchId),
  onImportProgress: (callback) => {
    ipcRenderer.removeAllListeners('library:import-progress');
    ipcRenderer.on('library:import-progress', (_event, progress) => callback(progress));
  },
  offImportProgress: () => ipcRenderer.removeAllListeners('library:import-progress'),
  updateProjectName: (id, name) => ipcRenderer.invoke('project:update-name', id, name),
  moveProjectsToTrash: (ids) => ipcRenderer.invoke('project:move-to-trash', ids),
  restoreProjects: (ids) => ipcRenderer.invoke('project:restore', ids),
  permanentlyDeleteProjects: (ids) => ipcRenderer.invoke('project:permanent-delete', ids),
  getTrashSummary: () => ipcRenderer.invoke('project:trash-summary'),
  setGroupCover: (fingerprint, projectId) => ipcRenderer.invoke('project:group-cover:set', fingerprint, projectId),
  copyProjectImage: (id) => ipcRenderer.invoke('image:copy', id),
  downloadProjectImage: (id) => ipcRenderer.invoke('image:download', id),
  copyWorkbenchImage: (filePath) => ipcRenderer.invoke('workbench:image:copy-current', filePath),
  downloadWorkbenchImage: (filePath, name) => ipcRenderer.invoke('workbench:image:download-current', { filePath, name }),
  saveTagAnnotations: (entries) => ipcRenderer.invoke('tag:annotations:save', entries),
  listTagCache: (request) => ipcRenderer.invoke('tag-cache:list', request),
  updateTagCache: (tag, patch) => ipcRenderer.invoke('tag-cache:update', { tag, patch }),
  updateTagCacheMany: (tags, category) => ipcRenderer.invoke('tag-cache:update-many', { tags, category }),
  deleteTagCache: (tag) => ipcRenderer.invoke('tag-cache:delete', tag),
  deleteTagCacheMany: (tags) => ipcRenderer.invoke('tag-cache:delete-many', tags),
  revealEmbeddedVibe: (vibe) => ipcRenderer.invoke('vibe:embedded:reveal', vibe),
  revealFile: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  getAISettings: () => ipcRenderer.invoke('ai:settings:get'),
  saveAISettings: (settings) => ipcRenderer.invoke('ai:settings:save', settings),
  getAppearanceSettings: () => ipcRenderer.invoke('appearance:settings:get'),
  saveAppearanceSettings: (settings) => ipcRenderer.invoke('appearance:settings:save', settings),
  getProductivitySettings: () => ipcRenderer.invoke('productivity:settings:get'),
  saveProductivitySettings: (settings) => ipcRenderer.invoke('productivity:settings:save', settings),
  getUpdateStatus: () => ipcRenderer.invoke('updates:status'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openReleasePage: (url) => ipcRenderer.invoke('updates:open-release', url),
  onUpdateState: (callback) => {
    ipcRenderer.removeAllListeners('updates:state');
    ipcRenderer.on('updates:state', (_event, state) => callback(state));
  },
  offUpdateState: () => ipcRenderer.removeAllListeners('updates:state'),
  listSystemFonts: () => ipcRenderer.invoke('fonts:list'),
  listAIModels: () => ipcRenderer.invoke('ai:models:list'),
  testAIModel: () => ipcRenderer.invoke('ai:model:test'),
  translateTags: (tags) => ipcRenderer.invoke('translation:tags', tags),
});
