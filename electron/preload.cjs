const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  openWorkbenchImage: (filePath = '') => ipcRenderer.invoke('workbench:image:open', { filePath }),
  openDroppedWorkbenchImage: (files) => ipcRenderer.invoke('workbench:image:open', {
    filePath: Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean)[0] || '',
    fromDrop: true,
  }),
  importImages: () => ipcRenderer.invoke('library:import-images'),
  importDroppedFiles: (files) => ipcRenderer.invoke('library:import-images', {
    filePaths: Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean),
  }),
  cancelImport: (batchId) => ipcRenderer.invoke('library:import-cancel', batchId),
  onImportProgress: (callback) => {
    ipcRenderer.removeAllListeners('library:import-progress');
    ipcRenderer.on('library:import-progress', (_event, progress) => callback(progress));
  },
  offImportProgress: () => ipcRenderer.removeAllListeners('library:import-progress'),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  saveTagAnnotations: (entries) => ipcRenderer.invoke('tag:annotations:save', entries),
  revealEmbeddedVibe: (vibe) => ipcRenderer.invoke('vibe:embedded:reveal', vibe),
  revealFile: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  getAISettings: () => ipcRenderer.invoke('ai:settings:get'),
  saveAISettings: (settings) => ipcRenderer.invoke('ai:settings:save', settings),
  getAppearanceSettings: () => ipcRenderer.invoke('appearance:settings:get'),
  saveAppearanceSettings: (settings) => ipcRenderer.invoke('appearance:settings:save', settings),
  listAIModels: () => ipcRenderer.invoke('ai:models:list'),
  testAIModel: () => ipcRenderer.invoke('ai:model:test'),
  translateTags: (tags) => ipcRenderer.invoke('translation:tags', tags),
});
