const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  importImages: () => ipcRenderer.invoke('library:import-images'),
  updateProject: (project) => ipcRenderer.invoke('project:update', project),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  chooseVibeImage: () => ipcRenderer.invoke('vibe:choose-image'),
  revealFile: (path) => ipcRenderer.invoke('file:reveal', path),
  getAISettings: () => ipcRenderer.invoke('ai:settings:get'),
  saveAISettings: (settings) => ipcRenderer.invoke('ai:settings:save', settings),
  listAIModels: () => ipcRenderer.invoke('ai:models:list'),
  testAIModel: () => ipcRenderer.invoke('ai:model:test'),
  translateTags: (tags) => ipcRenderer.invoke('translation:tags', tags),
});
