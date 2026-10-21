import { describe, it, expect, vi } from 'vitest';
import { registerTrayContents, allowsWindowCommand, sendWindowEvent } from './windowAccess.js';
import { commandRegistry } from './commands/registry.js';

describe('tray window boundaries', () => {
  it('permits exactly the four registered commands', () => {
    const sender = {};
    registerTrayContents(sender);
    const allowed = ['tray.menu-size', 'tray.action', 'account.get', 'settings.appearance.get'];
    for (const name of Object.keys(commandRegistry))
      expect(allowsWindowCommand(sender, name), name).toBe(allowed.includes(name));
    expect(allowsWindowCommand(sender, 'unknown')).toBe(false);
    expect(allowsWindowCommand({}, 'workbench.session')).toBe(true);
  });
  it('sends only generation and open events to the tray', () => {
    const webContents = { isDestroyed: () => false, send: vi.fn() };
    const window = { isDestroyed: () => false, webContents };
    registerTrayContents(webContents);
    for (const type of [
      'generation',
      'tray-menu-open',
      'updates',
      'workbench',
      'close-request',
      'progress',
      'chatgpt',
    ])
      sendWindowEvent(window, { type });
    expect(webContents.send.mock.calls.map((c) => c[1].type)).toEqual([
      'generation',
      'tray-menu-open',
    ]);
  });
});
