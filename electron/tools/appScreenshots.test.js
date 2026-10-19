import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: new EventEmitter(),
  nativeImage: { createFromBuffer: vi.fn() },
  screen: { getDisplayMatching: () => ({ size: { width: 1024, height: 768 } }) },
}));
vi.mock('../importer.js', () => ({
  importLibraryFiles: vi.fn(async () => ({ imported: Array(14).fill({}), errors: [] })),
}));
const { runAppScreenshots } = await import('./appScreenshots.js');
const { nativeImage } = await import('electron');

it.each([
  'capture rejection',
  'empty image',
  'renderer exception',
  'wrong image size',
  'metrics rejection',
])('fails on %s and destroys the window', async (failure) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-screenshot-test-'));
  const destroy = vi.fn();
  const webContents = new EventEmitter();
  webContents.insertCSS = async () => {};
  webContents.executeJavaScript = async () => {
    if (failure === 'renderer exception')
      webContents.emit('console-message', { level: 'error', message: 'Uncaught test exception' });
  };
  webContents.debugger = {
    attach: () => {},
    sendCommand: async (command) => {
      if (command === 'Emulation.setDeviceMetricsOverride' && failure === 'metrics rejection')
        throw new Error('Metrics failed');
      if (command === 'Page.captureScreenshot' && failure === 'capture rejection')
        throw new Error('Capture failed');
      return { data: '' };
    },
  };
  nativeImage.createFromBuffer.mockReturnValue({
    isEmpty: () => failure === 'empty image',
    getSize: () => ({ width: 1024, height: 768 }),
  });
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
          updateTagDictionary: () => {},
          rememberWorkbenchStructure: () => {},
          upsertTagDictionary: () => {},
        },
        assetsDirectory: root,
        preferences: { saveAppearanceSettings: () => {} },
        createWindow: () => {
          queueMicrotask(() => webContents.emit('did-finish-load'));
          return {
            webContents,
            destroy,
            getBounds: () => ({ width: 1024, height: 768 }),
            getContentBounds: () => ({ width: 1024, height: 768 }),
          };
        },
      }),
    ).rejects.toThrow(
      failure === 'capture rejection'
        ? 'Capture failed'
        : failure === 'empty image'
          ? 'Empty capture'
          : failure === 'wrong image size'
            ? 'Unexpected capture size: 1024x768'
            : failure === 'metrics rejection'
              ? 'Metrics failed'
              : 'Uncaught test exception',
    );
    expect(destroy).toHaveBeenCalledOnce();
    await expect(fs.stat(path.join(root, 'manifest.json'))).rejects.toThrow();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
