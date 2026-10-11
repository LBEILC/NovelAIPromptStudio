import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function configureScreenshotMode(app, argv = process.argv) {
  const option = argv.find((value) => value.startsWith('--app-screenshots='));
  if (!option) return null;
  const root = path.resolve(option.slice('--app-screenshots='.length));
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('nai-app-screens-') ||
    fs.readFileSync(path.join(root, 'owner'), 'utf8') !== 'screenshots:app'
  )
    throw new Error('Invalid screenshot temporary directory');
  for (const name of ['userData', 'sessionData', 'logs', 'crashDumps']) {
    const directory = path.join(root, name);
    fs.mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  return { root, output: path.resolve('.codex-runs/screens') };
}
