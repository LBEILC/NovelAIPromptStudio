import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Created only after the temporary-profile guard; never exposed to the renderer.
export function createAcceptanceCardCache(mode) {
  if (!mode || mode.packaged) return undefined;
  const schedule = {};
  let active = false;
  let terminal = [];
  return {
    schedule,
    begin(timing) {
      if (!['normal', 'slow', 'fast'].includes(timing))
        throw Error(`Unknown card timing: ${timing}`);
      schedule.rowsPerBatch = timing === 'normal' ? undefined : timing === 'slow' ? 1 : 25;
      active = true;
    },
    report(progress, deliver) {
      if (active && progress.completed === progress.total) terminal.push(() => deliver(progress));
      else deliver(progress);
    },
    flush() {
      const queued = terminal;
      terminal = [];
      for (const deliver of queued) deliver();
      return queued.length;
    },
    reset() {
      active = false;
      terminal = [];
      delete schedule.rowsPerBatch;
    },
  };
}

// No paths, hooks or renderer bridges are changed without this guarded opt-in.
export function configureAcceptanceMode(app, argv = process.argv) {
  const option = argv.find((value) => value.startsWith('--verify-app='));
  if (!option) return null;
  const root = path.resolve(option.slice('--verify-app='.length));
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('nai-acceptance-') ||
    fs.lstatSync(root).isSymbolicLink() ||
    fs.readFileSync(path.join(root, 'owner'), 'utf8') !== 'verify:app'
  )
    throw new Error('Invalid acceptance temporary directory');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'run.json'), 'utf8'));
  for (const name of ['userData', 'sessionData', 'logs', 'crashDumps']) {
    const directory = path.join(root, name);
    fs.mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  // Process-local platform preference: survives reload and CDP override cleanup.
  if (config.reducedMotion) app.commandLine.appendSwitch('force-prefers-reduced-motion');
  return { ...config, root };
}

export function installAcceptanceDoubles(mode, { dialog, shell, clipboard, nativeImage }) {
  if (!mode) return null;
  const calls = [];
  const selections = [];
  const saves = [];
  const messages = [];
  const originals = [];
  const replace = (object, key, fn) => {
    originals.push(() => {
      object[key] = original;
    });
    const original = object[key];
    object[key] = fn;
  };
  replace(dialog, 'showOpenDialog', async (...args) => {
    calls.push({ kind: 'dialog', options: args.at(-1) });
    if (!selections.length) throw new Error('Unexpected native dialog in acceptance mode');
    return selections.shift();
  });
  replace(dialog, 'showSaveDialog', async (...args) => {
    calls.push({ kind: 'save', options: args.at(-1) });
    if (!saves.length) throw new Error('Unexpected save dialog in acceptance mode');
    return saves.shift();
  });
  replace(dialog, 'showMessageBox', async (...args) => {
    calls.push({ kind: 'message', options: args.at(-1) });
    if (!messages.length) throw new Error('Unexpected native message in acceptance mode');
    return messages.shift();
  });
  for (const key of ['showItemInFolder', 'openPath', 'openExternal']) {
    replace(shell, key, (value) => {
      calls.push({ kind: key, value });
      return key === 'showItemInFolder' ? undefined : Promise.resolve('');
    });
  }
  const realClipboard = clipboard
    ? Object.fromEntries(
        Object.keys(clipboard)
          .filter((key) => typeof clipboard[key] === 'function')
          .map((key) => [key, clipboard[key].bind(clipboard)]),
      )
    : null;
  if (clipboard) {
    let data = {};
    let buffers = new Map();
    const clear = () => {
      data = {};
      buffers = new Map();
    };
    const methods = {
      clear,
      availableFormats: () => [
        ...Object.keys(data)
          .map(
            (key) =>
              ({ text: 'text/plain', html: 'text/html', rtf: 'text/rtf', image: 'image/png' })[key],
          )
          .filter(Boolean),
        ...buffers.keys(),
      ],
      write: (value) => {
        clear();
        data = { ...value };
      },
      readText: () => data.text || '',
      readHTML: () => data.html || '',
      readRTF: () => data.rtf || '',
      readBookmark: () => ({ title: data.bookmark || '', url: data.bookmark ? data.text : '' }),
      readImage: () => data.image || nativeImage.createEmpty(),
      readBuffer: (format) => Buffer.from(buffers.get(format) || []),
      read: (format) => buffers.get(format)?.toString('utf8') || '',
      writeBuffer: (format, value) => {
        clear();
        buffers.set(format, Buffer.from(value));
      },
    };
    for (const [suffix, field] of [
      ['Text', 'text'],
      ['HTML', 'html'],
      ['RTF', 'rtf'],
      ['Image', 'image'],
    ])
      methods['write' + suffix] = (value) => {
        clear();
        data[field] = value;
      };
    // Replace every native entry point: new APIs must be explicitly modelled.
    for (const key of Object.keys(realClipboard))
      replace(
        clipboard,
        key,
        methods[key] ||
          (() => {
            throw Error(`Unsupported acceptance clipboard API: ${key}`);
          }),
      );
  }
  return {
    realClipboard,
    calls,
    selections,
    saves,
    messages,
    restore: () => originals.reverse().forEach((restore) => restore()),
  };
}

// Delay real disk-backed IPC after the temporary-profile guard; preserve results.
export function installAcceptanceLatency(mode, ipcMain, fileSystem = fs.promises) {
  if (!mode || !(mode.slow > 1)) return;
  // Slow the actual asynchronous file operations within our temporary profile.
  // Synchronous SQLite/preferences work is delayed at the IPC boundary below,
  // so artificial disk latency never blocks the main event loop.
  if (mode.root) {
    const withinProfile = (value) =>
      typeof value === 'string' && path.resolve(value).startsWith(mode.root + path.sep);
    for (const key of ['open', 'readFile', 'writeFile', 'copyFile', 'rename']) {
      const original = fileSystem[key];
      fileSystem[key] = async (...args) => {
        if (
          withinProfile(args[0]) ||
          (['copyFile', 'rename'].includes(key) && withinProfile(args[1]))
        )
          await new Promise((resolve) => setTimeout(resolve, 10 * (mode.slow - 1)));
        return original.apply(fileSystem, args);
      };
    }
  }
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) =>
    handle(channel, async (...args) => {
      if (
        !['library:import-cancel', 'library:import-prepared:cancel'].includes(channel) &&
        /^(library:|workbench:|project:|database:|tag-cache:|tag:|ai:settings:|appearance:settings:|productivity:settings:)/.test(
          channel,
        )
      )
        await new Promise((resolve) => setTimeout(resolve, 40 * mode.slow));
      return listener(...args);
    });
}
