import { describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ notices: [], cursor: { x: 400, y: 600 } }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    constructor() {
      super();
      this.webContents = Object.assign(new EventEmitter(), {
        send: vi.fn(),
        isDestroyed: () => false,
      });
      this.hide = vi.fn();
      this.show = vi.fn();
      this.focus = vi.fn();
      this.setBounds = vi.fn();
      this.reload = vi.fn();
      this.destroy = vi.fn();
    }
    isDestroyed() {
      return false;
    }
    loadFile() {}
  }
  class Tray extends EventEmitter {
    setToolTip = vi.fn();
    destroy = vi.fn();
  }
  class Notification extends EventEmitter {
    static isSupported() {
      return true;
    }
    constructor() {
      super();
      mocks.notices.push(this);
    }
    show = vi.fn();
    close = vi.fn();
  }
  return {
    BrowserWindow: Window,
    Tray,
    Notification,
    screen: {
      getCursorScreenPoint: () => ({ ...mocks.cursor }),
      getDisplayNearestPoint: () => ({
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      }),
    },
  };
});
vi.mock('./clientWindow.js', () => ({ guardClientWindow: vi.fn() }));
import { createTray } from './tray.js';
function setup() {
  let shown = false;
  const showMain = vi.fn();
  const quit = vi.fn();
  const controller = createTray({
    app: { isPackaged: false },
    shell: {},
    icon: 'icon.ico',
    showMain,
    quit,
    preferences: {
      trayNoticeShown: () => shown,
      markTrayNoticeShown: () => {
        shown = true;
      },
    },
  });
  return { ...controller, showMain, quit };
}
describe('tray lifecycle', () => {
  it('notifies only once and notification activation opens the main window', () => {
    const c = setup();
    const start = mocks.notices.length;
    c.notice();
    c.notice();
    expect(mocks.notices.length - start).toBe(1);
    mocks.notices.at(-1).emit('click');
    expect(c.showMain).toHaveBeenCalledOnce();
  });
  it('keeps the original cursor anchor when content resizes after focus', () => {
    const c = setup();
    mocks.cursor = { x: 400, y: 600 };
    c.menu.webContents.emit('did-finish-load');
    c.tray.emit('right-click');
    mocks.cursor = { x: 1700, y: 1000 };
    c.resize({ width: 260, height: 180 });
    expect(c.menu.setBounds).toHaveBeenLastCalledWith({ x: 388, y: 588, width: 260, height: 180 });
    c.resize({ width: 260, height: 220 });
    expect(c.menu.setBounds).toHaveBeenLastCalledWith({ x: 388, y: 588, width: 260, height: 220 });
    expect(c.menu.focus).toHaveBeenCalledOnce();
  });
  it('menu quit hides the menu and invokes direct application quit', () => {
    const c = setup();
    expect(c.action({ action: 'quit' })).toEqual({});
    expect(c.menu.hide).toHaveBeenCalledOnce();
    expect(c.quit).toHaveBeenCalledOnce();
  });
  it('native menu close hides the reusable window instead of destroying it', () => {
    const c = setup();
    const event = { preventDefault: vi.fn() };
    c.menu.emit('close', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(c.menu.hide).toHaveBeenCalledOnce();
    expect(c.menu.destroy).not.toHaveBeenCalled();
  });
  it('updates generation tooltip and reloads appearance without showing the menu', () => {
    const c = setup();
    c.generation({ jobs: [{ state: 'generating', index: 3, count: 8 }] });
    expect(c.tray.setToolTip).toHaveBeenLastCalledWith('NovelAI Prompt Studio · 正在生成 3/8');
    c.generation({ jobs: [] });
    expect(c.tray.setToolTip).toHaveBeenLastCalledWith('NovelAI Prompt Studio');
    c.reload();
    expect(c.menu.reload).toHaveBeenCalledOnce();
    expect(c.menu.show).not.toHaveBeenCalled();
  });
});
