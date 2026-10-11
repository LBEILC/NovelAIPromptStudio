import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
  return { ...config, root };
}

export function installAcceptanceDoubles(mode, { dialog, shell }) {
  if (!mode) return null;
  const calls = [];
  const selections = [];
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
  return {
    calls,
    selections,
    messages,
    restore: () => originals.reverse().forEach((restore) => restore()),
  };
}
