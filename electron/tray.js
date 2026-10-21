import path from 'node:path';
import { BrowserWindow, Tray, Notification, screen } from 'electron';
import { guardClientWindow } from './clientWindow.js';
import { registerTrayContents, sendWindowEvent } from './windowAccess.js';
import { trayMenuPosition } from './trayPosition.js';

export function createTray({ app, shell, preferences, showMain, quit, icon, developmentUrl }) {
  const tray = new Tray(icon);
  const menu = new BrowserWindow({
    width: 260,
    height: 180,
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  registerTrayContents(menu.webContents);
  guardClientWindow(menu, { packaged: app.isPackaged, shell });
  let anchor;
  let opening = false;
  let loaded = false;
  let notice;
  const hide = () => {
    opening = false;
    menu.hide();
  };
  const openEvent = () => sendWindowEvent(menu, { type: 'tray-menu-open' });
  menu.on('blur', hide);
  menu.webContents.on('did-start-loading', () => {
    loaded = false;
  });
  menu.webContents.on('did-finish-load', () => {
    loaded = true;
    if (opening) openEvent();
  });
  if (developmentUrl) {
    const url = new URL(developmentUrl);
    url.hash = 'tray-menu';
    void menu.loadURL(url.href);
  } else
    void menu.loadFile(path.join(import.meta.dirname, '..', 'dist', 'index.html'), {
      hash: 'tray-menu',
    });
  tray.setToolTip('NovelAI Prompt Studio');
  tray.on('click', () => {
    hide();
    showMain();
  });
  tray.on('right-click', () => {
    // Capture once, before focus collapses the Windows tray overflow area.
    anchor = screen.getCursorScreenPoint();
    opening = true;
    if (loaded) openEvent();
  });
  return {
    tray,
    menu,
    resize({ width, height }) {
      const point = anchor || screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(point);
      const size = {
        width: Math.max(1, Math.min(width, display.workArea.width)),
        height: Math.max(1, Math.min(height, display.workArea.height)),
      };
      menu.setBounds({
        ...trayMenuPosition(point, size, display.bounds, display.workArea),
        ...size,
      });
      if (opening) {
        opening = false;
        menu.show();
        menu.focus();
      }
      return {};
    },
    action({ action }) {
      hide();
      if (action === 'show') showMain();
      if (action === 'quit') quit();
      return {};
    },
    generation(status) {
      const job = status.jobs.find((job) => job.state === 'generating');
      tray.setToolTip(
        'NovelAI Prompt Studio' + (job ? ` · 正在生成 ${job.index}/${job.count}` : ''),
      );
    },
    reload() {
      if (menu.isDestroyed()) return;
      hide();
      menu.reload();
    },
    notice() {
      if (preferences.trayNoticeShown() || !Notification.isSupported()) return;
      notice = new Notification({
        title: 'NovelAI Prompt Studio',
        body: '仍在后台运行，可以从托盘图标打开',
        icon,
      });
      notice.on('click', showMain);
      notice.show();
      preferences.markTrayNoticeShown();
    },
    destroy() {
      notice?.close();
      tray.destroy();
      if (!menu.isDestroyed()) menu.destroy();
    },
  };
}
