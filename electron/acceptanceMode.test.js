import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it, expect, vi } from 'vitest';
import { configureAcceptanceMode, installAcceptanceDoubles } from './acceptanceMode.js';

it('normal startup changes no paths and installs no doubles', () => {
  const app = { setPath: vi.fn(), disableHardwareAcceleration: vi.fn() };
  const dialog = { showOpenDialog: vi.fn() };
  const shell = { openExternal: vi.fn() };
  const original = dialog.showOpenDialog;
  const mode = configureAcceptanceMode(app, ['electron', '.']);
  expect(mode).toBeNull();
  expect(installAcceptanceDoubles(mode, { dialog, shell })).toBeNull();
  expect(dialog.showOpenDialog).toBe(original);
  expect(app.setPath).not.toHaveBeenCalled();
  expect(app.disableHardwareAcceleration).not.toHaveBeenCalled();
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
