// @ts-check
import path from 'node:path';
import crypto from 'node:crypto';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { createCommands } from './index.js';
import { startCommandServer } from './transport.js';
import { agentSetup } from './setup.js';
import { CommandError } from './registry.js';
import {
  readWorkbenchImage,
  applyWorkbenchStructure,
  applyWorkbenchLibraryDetails,
} from '../workbench.js';
import { importLibraryFiles } from '../importer.js';
/** @typedef {import('../../src/shared/types').ImageProject} Project */
/** @param {{database:Awaited<ReturnType<import('../database.js').openDatabase>>,assetsDirectory:()=>string,busy:()=>boolean,createWindow:()=>Electron.BrowserWindow,testRoot?:string,handlers?:import('./index.js').Services['handlers'],selectSource?:import('./index.js').Services['selectSource'],readyLibrary?:()=>Promise<void>,beforeCommand?:import('./index.js').Services['beforeCommand']}} options */
export async function installCommandRuntime(options) {
  const handlers = options.handlers || {};
  const { database } = options;
  const directory = app.getPath('userData');
  /** @type {Set<number>} */
  const ready = new Set();
  /** @type {Map<string,{sender:number,resolve:()=>void,reject:(error:Error)=>void}>} */
  const waiting = new Map();
  /** @param {Electron.BrowserWindow} window */
  async function prepareWindow(window) {
    const sender = window.webContents;
    const deadline = Date.now() + 10000;
    while (!ready.has(sender.id)) {
      if (window.isDestroyed() || Date.now() > deadline)
        throw new CommandError('app_busy', '工作台还没有准备好，请稍后再试');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new CommandError('app_busy', '工作台没有及时完成同步，请稍后再试'));
      }, 10000);
      waiting.set(id, {
        sender: sender.id,
        resolve: () => {
          clearTimeout(timer);
          resolve(undefined);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      sender.send('studio:command-prepare', id);
    });
  }
  const commands = await createCommands({
    directory,
    version: app.getVersion(),
    database,
    handlers,
    selectSource: options.selectSource,
    readyLibrary: options.readyLibrary,
    beforeCommand: options.beforeCommand,
    busy: options.busy,
    readImage: async (file) =>
      /** @type {Project} */ (
        await readWorkbenchImage(file, { enrichProjectTags: database.enrichProjectTags })
      ),
    readSource: async (source) => {
      const library =
        source.type === 'library' && source.projectId
          ? database.loadProject(source.projectId)
          : null;
      const file = library?.image_path || source.path;
      const image = await readWorkbenchImage(file, {
        enrichProjectTags: database.enrichProjectTags,
      });
      const result = applyWorkbenchLibraryDetails(
        applyWorkbenchStructure(image, database.loadWorkbenchStructure(file)),
        library,
      );
      return /** @type {Project} */ (result);
    },
    importImage: async (file, draft) => {
      const result = await importLibraryFiles({
        filePaths: [file],
        assetsDirectory: options.assetsDirectory(),
        database,
        selectedArchiveEntries: undefined,
        signal: undefined,
        onProgress: undefined,
        prepareProject: async (p) => database.enrichProjectTags(p),
      });
      const id = result.imported[0]?.id || result.duplicates[0]?.projectId;
      if (!id)
        throw new CommandError('invalid_input', result.errors[0]?.error || '图片没有存入图片库');
      if (draft) database.saveProjectPrompt(id, draft);
      return /** @type {Project} */ (database.loadProject(id));
    },
    remember: (tab) => {
      if (tab.project && tab.source.path)
        database.rememberWorkbenchStructure(tab.source.path, tab.project.prompt_structure);
    },
    prepareUI: async () => {
      const windows = BrowserWindow.getAllWindows();
      if (!windows.length) windows.push(options.createWindow());
      for (const window of windows) await prepareWindow(window);
    },
    emit: (event) => {
      for (const window of BrowserWindow.getAllWindows())
        if (!window.webContents.isDestroyed())
          window.webContents.send('studio:command-event', event);
    },
  });
  ipcMain.on('studio:command-prepared', (event, id, error) => {
    const request = waiting.get(id);
    if (!request || request.sender !== event.sender.id) return;
    waiting.delete(id);
    if (error) request.reject(new CommandError('conflict', String(error)));
    else request.resolve();
  });
  ipcMain.handle('studio:command', async (event, name, input) => {
    const result = await commands.dispatch(String(name), input, 'ui', event.sender);
    if (name === 'workbench.session' && result.ok) ready.add(event.sender.id);
    return result;
  });
  const setup = agentSetup({
    appRoot: app.getAppPath(),
    userData: directory,
    defaultUserData: path.join(app.getPath('appData'), app.getName()),
    executable: process.execPath,
    packaged: app.isPackaged,
    testRoot: options.testRoot,
  });
  /** @template {object} T @param {()=>Promise<T>} run */
  const setupResult = async (run) => {
    try {
      return { ok: /** @type {const} */ (true), ...(await run()) };
    } catch (error) {
      return {
        ok: /** @type {const} */ (false),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
  handlers['agent.setup'] = () => setupResult(setup.status);
  handlers['agent.install'] = () => setupResult(setup.install);
  handlers['agent.skill'] = () => setupResult(async () => ({ text: await setup.skill() }));
  handlers['agent.reveal'] = () =>
    setupResult(async () => {
      const error = await shell.openPath(path.dirname(setup.skillPath));
      if (error) throw Error(error);
      return {};
    });
  const server = await startCommandServer({
    directory,
    dispatch: (name, input) => commands.dispatch(name, input, 'agent'),
  });
  return {
    ...commands,
    async flush() {
      for (const window of BrowserWindow.getAllWindows())
        if (ready.has(window.webContents.id)) await prepareWindow(window);
      await commands.store.exclusive(async () => {});
    },
    prepareWindow,
    close: server.close,
    endpoint: server.endpoint,
  };
}
