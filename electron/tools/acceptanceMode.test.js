import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it, expect, vi } from 'vitest';
import {
  configureAcceptanceMode,
  createAcceptanceCardCache,
  installAcceptanceDoubles,
  installAcceptanceLatency,
} from './acceptanceMode.js';

it('keeps card scheduling out of normal and packaged launches and releases terminal reports explicitly', () => {
  expect(createAcceptanceCardCache(null)).toBeUndefined();
  expect(createAcceptanceCardCache({ packaged: true })).toBeUndefined();
  const control = createAcceptanceCardCache({});
  const deliver = vi.fn();
  const clock = performance.now;
  control.begin('slow');
  expect(control.schedule.rowsPerBatch).toBe(1);
  control.report({ completed: 1, total: 2 }, deliver);
  control.report({ completed: 2, total: 2 }, deliver);
  expect(deliver.mock.calls).toEqual([[{ completed: 1, total: 2 }]]);
  expect(control.flush()).toBe(1);
  expect(deliver).toHaveBeenLastCalledWith({ completed: 2, total: 2 });
  expect(control.flush()).toBe(0);
  control.begin('fast');
  expect(control.schedule.rowsPerBatch).toBe(25);
  control.reset();
  expect(control.schedule.rowsPerBatch).toBeUndefined();
  control.report({ completed: 2, total: 2 }, deliver);
  expect(deliver).toHaveBeenCalledTimes(3);
  expect(performance.now).toBe(clock);
  expect(() => control.begin('unknown')).toThrow('Unknown card timing');
});

it('delays real disk-backed handlers only inside slow acceptance and preserves results', async () => {
  vi.useFakeTimers();
  try {
    const handlers = new Map();
    const ipc = { handle: (channel, callback) => handlers.set(channel, callback) };
    const original = ipc.handle;
    installAcceptanceLatency(null, ipc);
    expect(ipc.handle).toBe(original);
    installAcceptanceLatency({ slow: 4 }, ipc);
    const read = vi.fn(() => ({ actual: 42 }));
    ipc.handle('workbench:image:open', read);
    const pending = handlers.get('workbench:image:open')('event', 'file');
    await vi.advanceTimersByTimeAsync(159);
    expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ actual: 42 });
    expect(read).toHaveBeenCalledWith('event', 'file');
    ipc.handle('updates:status', read);
    await handlers.get('updates:status')();
    ipc.handle('library:import-cancel', read);
    await handlers.get('library:import-cancel')();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('slows each real temporary-profile file operation without delaying other paths', async () => {
  vi.useFakeTimers();
  try {
    const methods = Object.fromEntries(
      ['open', 'readFile', 'writeFile', 'copyFile', 'rename'].map((key) => [
        key,
        vi.fn(async () => 'real result'),
      ]),
    );
    const read = methods.readFile;
    const profile = path.resolve(os.tmpdir(), 'nai-acceptance-unit');
    installAcceptanceLatency({ slow: 6, root: profile }, { handle: vi.fn() }, methods);
    const pending = methods.readFile(path.join(profile, 'image.png'));
    await vi.advanceTimersByTimeAsync(49);
    expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe('real result');
    expect(await methods.readFile(path.resolve('dist/index.html'))).toBe('real result');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('normal startup changes no paths and installs no doubles', () => {
  const app = {
    setPath: vi.fn(),
    disableHardwareAcceleration: vi.fn(),
    commandLine: { appendSwitch: vi.fn() },
  };
  const dialog = { showOpenDialog: vi.fn() };
  const shell = { openExternal: vi.fn() };
  const original = dialog.showOpenDialog;
  const mode = configureAcceptanceMode(app, ['electron', '.']);
  expect(mode).toBeNull();
  expect(installAcceptanceDoubles(mode, { dialog, shell })).toBeNull();
  expect(dialog.showOpenDialog).toBe(original);
  expect(app.setPath).not.toHaveBeenCalled();
  expect(app.disableHardwareAcceleration).not.toHaveBeenCalled();
  expect(app.commandLine.appendSwitch).not.toHaveBeenCalled();
});

it('rejects ordinary profiles before accessing their contents', () => {
  expect(() => configureAcceptanceMode({}, ['--verify-app=' + process.cwd()])).toThrow(
    'Invalid acceptance',
  );
});

it.each([false, true])(
  'isolates all paths and requires explicit dialog responses (reduced motion: %s)',
  async (reducedMotion) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-acceptance-'));
    try {
      fs.writeFileSync(path.join(root, 'owner'), 'verify:app');
      fs.writeFileSync(path.join(root, 'run.json'), JSON.stringify({ reducedMotion }));
      const app = {
        setPath: vi.fn(),
        disableHardwareAcceleration: vi.fn(),
        commandLine: { appendSwitch: vi.fn() },
      };
      const mode = configureAcceptanceMode(app, ['--verify-app=' + root]);
      expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('no-sandbox');
      expect(
        app.commandLine.appendSwitch.mock.calls.some(
          ([name]) => name === 'force-prefers-reduced-motion',
        ),
      ).toBe(reducedMotion);
      expect(app.setPath.mock.calls).toHaveLength(4);
      expect(app.setPath.mock.calls.every(([, value]) => value.startsWith(root + path.sep))).toBe(
        true,
      );
      const original = vi.fn();
      const dialog = { showOpenDialog: original, showMessageBox: vi.fn() };
      const shell = { openExternal: original, openPath: original, showItemInFolder: original };
      const doubles = installAcceptanceDoubles(mode, { dialog, shell });
      await expect(dialog.showOpenDialog({})).rejects.toThrow('Unexpected native dialog');
      doubles.selections.push({ canceled: true, filePaths: [] });
      expect(await dialog.showOpenDialog({})).toEqual({ canceled: true, filePaths: [] });
      await shell.openExternal('https://example.test');
      expect(original).not.toHaveBeenCalled();
      expect(doubles.calls.at(-1)).toEqual({ kind: 'openExternal', value: 'https://example.test' });
      doubles.restore();
      expect(dialog.showOpenDialog).toBe(original);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

it('isolates text, images and file formats without calling the operating system', () => {
  const names = [
    'readText',
    'writeText',
    'readImage',
    'writeImage',
    'readBuffer',
    'writeBuffer',
    'read',
    'availableFormats',
    'clear',
    'write',
  ];
  const original = Object.fromEntries(
    names.map((name) => [
      name,
      vi.fn(() => {
        throw Error('native clipboard touched');
      }),
    ]),
  );
  const clipboard = { ...original };
  const empty = { isEmpty: () => true };
  const decoded = { isEmpty: () => false };
  const createFromBuffer = vi.fn(() => decoded);
  const doubles = installAcceptanceDoubles(
    {},
    {
      dialog: {},
      shell: {},
      clipboard,
      nativeImage: { createEmpty: () => empty, createFromBuffer },
    },
  );
  clipboard.writeText('fixture');
  expect(clipboard.readText()).toBe('fixture');
  const image = { isEmpty: () => false };
  clipboard.writeImage(image);
  expect(clipboard.readText()).toBe('');
  expect(clipboard.readImage()).toBe(image);
  const bytes = Buffer.from('file:///fixture.png');
  clipboard.writeBuffer('text/uri-list', bytes);
  bytes.fill(0);
  expect(clipboard.read('text/uri-list')).toBe('file:///fixture.png');
  expect(clipboard.availableFormats()).toEqual(['text/uri-list']);
  expect(clipboard.readImage()).toBe(empty);
  clipboard.writeBuffer('PNG', Buffer.from('encoded fixture'));
  expect(clipboard.readImage()).toBe(decoded);
  expect(createFromBuffer).toHaveBeenCalledWith(Buffer.from('encoded fixture'));
  expect(clipboard.readBuffer('PNG').toString()).toBe('encoded fixture');
  clipboard.clear();
  expect(clipboard.readImage()).toBe(empty);
  expect(Object.values(original).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  doubles.restore();
  expect(clipboard.readText).toBe(original.readText);
});
