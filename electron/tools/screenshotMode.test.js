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
  const ipcRenderer = {
    invoke: vi.fn(async () => []),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
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
  it('delivers each command event unchanged and unsubscribes only its own listener', () => {
    const { exposed, ipcRenderer } = runPreload(['electron', '.']);
    const callback = vi.fn();
    const unsubscribe = exposed.studio.onCommandEvent(callback);
    const [channel, listener] = ipcRenderer.on.mock.calls[0];
    expect(channel).toBe('studio:command-event');
    for (const event of [
      { type: 'workbench', session: { version: 2, tabs: [], activeTabId: '' }, source: 'agent' },
      { type: 'progress', topic: 'library:cards-progress', data: { completed: 1, total: 2 } },
      { type: 'updates', data: { phase: 'current' } },
      { type: 'navigate', destination: 'settings' },
    ]) {
      listener({}, event);
      expect(callback).toHaveBeenLastCalledWith(event);
    }
    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, listener);
  });
  it('normal preload exposes only the product API, with no screenshot listeners', async () => {
    const { exposed, listeners, ipcRenderer } = runPreload(['electron', '.']);
    expect(Object.keys(exposed)).toEqual(['studio']);
    expect(listeners).toEqual({});
    expect(Object.keys(exposed.studio).sort()).toEqual([
      'invoke',
      'onCommandEvent',
      'onCommandPrepare',
      'pathsForFiles',
    ]);
    await exposed.studio.invoke('library.cards', { view: 'all' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('studio:command', 'library.cards', {
      view: 'all',
    });
  });
  it('screenshot preload exposes explicit state, pending IPC and error reporting', async () => {
    const { exposed, ipcRenderer } = runPreload(['--app-screenshot-state={"page":"gallery"}']);
    expect(exposed.studioScreenshot.page).toBe('gallery');
    const loading = exposed.studio.invoke('library.cards', {});
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
