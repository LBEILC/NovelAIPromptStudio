import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { configureScreenshotMode } from './screenshotMode.js';

const preload = fs.readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8');
function runPreload(argv) {
  const exposed = {};
  const listeners = {};
  const ipcRenderer = { invoke: vi.fn(async () => []), send: vi.fn() };
  vm.runInNewContext(preload, {
    require: () => ({
      contextBridge: {
        exposeInMainWorld: (key, value) => {
          exposed[key] = value;
        },
      },
      ipcRenderer,
    }),
    process: { argv },
    window: {
      addEventListener: (key, value) => {
        listeners[key] = value;
      },
    },
  });
  return { exposed, listeners, ipcRenderer };
}

describe('screenshot isolation', () => {
  it('normal preload exposes only the product API, with no screenshot listeners', async () => {
    const { exposed, listeners, ipcRenderer } = runPreload(['electron', '.']);
    expect(Object.keys(exposed)).toEqual(['studio']);
    expect(listeners).toEqual({});
    await exposed.studio.loadLibrary();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('library:load', { view: 'all' });
  });
  it('screenshot preload exposes explicit state, pending IPC and error reporting', async () => {
    const { exposed, ipcRenderer } = runPreload(['--app-screenshot-state={"page":"gallery"}']);
    expect(exposed.studioScreenshot.page).toBe('gallery');
    const loading = exposed.studio.loadLibrary();
    expect(exposed.studioScreenshot.pending()).toBe(1);
    await loading;
    expect(exposed.studioScreenshot.pending()).toBe(0);
    exposed.studioScreenshot.reportError('test failure');
    expect(ipcRenderer.send).toHaveBeenCalledWith('screenshot:error', 'test failure');
  });
  it('normal startup does not configure screenshot paths', () => {
    expect(configureScreenshotMode({}, ['electron', '.'])).toBeNull();
  });
  it('sets all writable Electron paths before ready without querying default paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-app-screens-'));
    try {
      fs.writeFileSync(path.join(root, 'owner'), 'screenshots:app');
      const app = {
        setPath: vi.fn(),
        getPath: () => {
          throw new Error('Default paths must not be queried');
        },
        disableHardwareAcceleration: vi.fn(),
        commandLine: { appendSwitch: vi.fn() },
      };
      expect(configureScreenshotMode(app, [`--app-screenshots=${root}`]).root).toBe(root);
      expect(app.setPath.mock.calls).toEqual(
        ['userData', 'sessionData', 'logs', 'crashDumps'].map((name) => [
          name,
          path.join(root, name),
        ]),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects existing default/demo directories and unowned temporary paths', () => {
    expect(() => configureScreenshotMode({}, ['--app-screenshots=.'])).toThrow();
    expect(() =>
      configureScreenshotMode({}, [
        `--app-screenshots=${path.join(os.tmpdir(), 'nai-app-screens-missing')}`,
      ]),
    ).toThrow();
  });
});
