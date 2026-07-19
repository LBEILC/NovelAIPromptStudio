const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  loadLibraryOrganization: () => ipcRenderer.invoke('library:organization:load'),
  createCollection: (name) => ipcRenderer.invoke('library:collection:create', name),
  renameCollection: (id, name) => ipcRenderer.invoke('library:collection:rename', id, name),
  deleteCollection: (id) => ipcRenderer.invoke('library:collection:delete', id),
  addProjectsToCollection: (collectionId, projectIds) => ipcRenderer.invoke('library:collection:add-projects', collectionId, projectIds),
  removeProjectsFromCollection: (collectionId, projectIds) => ipcRenderer.invoke('library:collection:remove-projects', collectionId, projectIds),
  setProjectsFavorite: (projectIds, favorite) => ipcRenderer.invoke('library:projects:favorite', projectIds, favorite),
  setProjectsDeleted: (projectIds, deleted) => ipcRenderer.invoke('library:projects:trash', projectIds, deleted),
  importImages: (options = {}) => ipcRenderer.invoke('library:import-images', options),
  importDroppedFiles: (files, options = {}) => ipcRenderer.invoke('library:import-images', {
    ...options,
    filePaths: Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean),
  }),
  cancelImport: (batchId) => ipcRenderer.invoke('library:import-cancel', batchId),
  onImportProgress: (callback) => {
    ipcRenderer.removeAllListeners('library:import-progress');
    ipcRenderer.on('library:import-progress', (_event, progress) => callback(progress));
  },
  offImportProgress: () => ipcRenderer.removeAllListeners('library:import-progress'),
  updateProject: (project) => ipcRenderer.invoke('project:update', project),
  createBranch: (branch) => ipcRenderer.invoke('branch:create', branch),
  updateBranch: (branch) => ipcRenderer.invoke('branch:update', branch),
  deleteBranch: (branchId) => ipcRenderer.invoke('branch:delete', branchId),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  loadVibeLibrary: () => ipcRenderer.invoke('vibe:library:load'),
  importVibeLibrary: () => ipcRenderer.invoke('vibe:library:import'),
  useVibeFromLibrary: (entry) => ipcRenderer.invoke('vibe:library:use', entry),
  inspectEmbeddedVibes: (project) => ipcRenderer.invoke('vibe:project:embedded-status', project),
  resolveEmbeddedVibes: (project, mode) => ipcRenderer.invoke('vibe:project:resolve-embedded', project, mode),
  revealFile: (path) => ipcRenderer.invoke('file:reveal', path),
  getAISettings: () => ipcRenderer.invoke('ai:settings:get'),
  saveAISettings: (settings) => ipcRenderer.invoke('ai:settings:save', settings),
  listAIModels: () => ipcRenderer.invoke('ai:models:list'),
  testAIModel: () => ipcRenderer.invoke('ai:model:test'),
  translateTags: (tags) => ipcRenderer.invoke('translation:tags', tags),
});
