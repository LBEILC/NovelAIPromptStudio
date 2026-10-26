import { describe, it, expect, vi } from 'vitest';
import {
  clientMenu,
  guardClientWindow,
  openExternalLink,
  themeBackground,
} from './clientWindow.js';
describe('desktop window boundary', () => {
  it('routes the help menu without assigning shortcuts', () => {
    const navigate = vi.fn();
    const feedback = vi.fn();
    const menu = clientMenu({ app: { name: 'Studio' }, navigate, feedback, development: false });
    const help = menu[3];
    expect(help.role).toBe('help');
    expect(help.submenu.map((item) => item.label || item.type)).toEqual([
      '功能一览',
      '查看引导',
      '更新日志',
      'separator',
      '报告问题',
    ]);
    for (const item of help.submenu) expect(item).not.toHaveProperty('accelerator');
    for (const item of help.submenu) item.click?.();
    expect(navigate.mock.calls).toEqual([['help'], ['onboarding'], ['changelog']]);
    expect(feedback).toHaveBeenCalledExactlyOnceWith('bug', '[问题] ');
  });
  it('only hands HTTP URLs to the system browser', async () => {
    const shell = { openExternal: vi.fn() };
    for (const url of ['file:///tmp/a', 'javascript:alert(1)', 'mailto:a@b.test', 'invalid'])
      await openExternalLink(shell, url);
    expect(shell.openExternal).not.toHaveBeenCalled();
    await openExternalLink(shell, 'https://example.test/notes');
    expect(shell.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.test/notes');
  });
  it('denies navigation and new windows, and blocks packaged browser shortcuts', () => {
    const events = {};
    const contents = {
      session: {},
      on: (name, fn) => {
        events[name] = fn;
      },
      setWindowOpenHandler: vi.fn(),
      setVisualZoomLevelLimits: vi.fn(),
      setZoomFactor: vi.fn(),
    };
    const shell = { openExternal: vi.fn() };
    guardClientWindow({ webContents: contents }, { packaged: true, shell });
    const event = { preventDefault: vi.fn() };
    events['will-navigate'](event, 'file:///tmp/a');
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(
      contents.setWindowOpenHandler.mock.calls[0][0]({ url: 'https://example.test/' }),
    ).toEqual({ action: 'deny' });
    for (const key of ['r', '+', '-', '=', '0', 'F5', 'F12']) {
      event.preventDefault.mockClear();
      events['before-input-event'](event, { key, control: true });
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
  });
  it('uses tokens and the application menu without browser roles', () => {
    for (const theme of ['light', 'dark'])
      expect(themeBackground(process.cwd(), theme)).toMatch(/^#/);
    const menu = clientMenu({
      app: { name: 'NovelAI Prompt Studio' },
      navigate: vi.fn(),
      feedback: vi.fn(),
      development: false,
    });
    expect(menu.map((item) => item.label)).toEqual([
      'NovelAI Prompt Studio',
      '编辑',
      '窗口',
      '帮助',
    ]);
    expect(menu[0].submenu[1].accelerator).toBe('Command+,');
    expect(
      menu
        .flatMap((item) => item.submenu)
        .some((item) =>
          ['reload', 'forceReload', 'toggleDevTools', 'zoomIn', 'zoomOut', 'resetZoom'].includes(
            item.role,
          ),
        ),
    ).toBe(false);
  });
});
