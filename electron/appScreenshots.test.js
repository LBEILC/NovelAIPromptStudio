import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: new EventEmitter() }));
vi.mock('./importer.js', () => ({
  importLibraryFiles: vi.fn(async () => ({ imported: Array(14).fill({}), errors: [] })),
}));
const { runAppScreenshots } = await import('./appScreenshots.js');

it.each(['capture rejection', 'empty image', 'renderer exception'])(
  'fails on %s and destroys the window',
  async (failure) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-screenshot-test-'));
    const destroy = vi.fn();
    const webContents = new EventEmitter();
    webContents.insertCSS = async () => {};
    webContents.executeJavaScript = async () => {
      if (failure === 'renderer exception')
        webContents.emit('console-message', { level: 'error', message: 'Uncaught test exception' });
    };
    webContents.capturePage = async () => {
      if (failure === 'capture rejection') throw new Error('Capture failed');
      return { isEmpty: () => true };
    };
    try {
      await expect(
        runAppScreenshots({
          app: { getVersion: () => 'test', getPath: () => root },
          mode: { output: root },
          database: {
            loadLibrary: () => Array.from({ length: 14 }, (_, id) => ({ id })),
            createCollection: (value) => value,
            updateCollectionProjects: () => {},
            updateProjects: () => {},
          },
          assetsDirectory: root,
          preferences: { saveAppearanceSettings: () => {} },
          createWindow: () => {
            queueMicrotask(() => webContents.emit('did-finish-load'));
            return { webContents, destroy };
          },
        }),
      ).rejects.toThrow(
        failure === 'capture rejection'
          ? 'Capture failed'
          : failure === 'empty image'
            ? 'Empty capture'
            : 'Uncaught test exception',
      );
      expect(destroy).toHaveBeenCalledOnce();
      await expect(fs.stat(path.join(root, 'manifest.json'))).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);
