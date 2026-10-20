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
    invoke: (name, input) => invoke('studio:command', name, input),
    onCommandEvent: (callback) => {
      /** @param {Electron.IpcRendererEvent} _event @param {import('../src/shared/commands').CommandEvent} message */
      const listener = (_event, message) => callback(message);
      ipcRenderer.on('studio:command-event', listener);
      return () => ipcRenderer.removeListener('studio:command-event', listener);
    },
    onCommandPrepare: (callback) => {
      /** @param {Electron.IpcRendererEvent} _event @param {string} id */
      const listener = (_event, id) => {
        void callback().then(
          () => ipcRenderer.send('studio:command-prepared', id, ''),
          (error) => ipcRenderer.send('studio:command-prepared', id, String(error)),
        );
      };
      ipcRenderer.on('studio:command-prepare', listener);
      return () => ipcRenderer.removeListener('studio:command-prepare', listener);
    },
    pathsForFiles: (files) =>
      Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean),
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
