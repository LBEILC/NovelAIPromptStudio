const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const url = process.argv.find((value) => value.startsWith('--origin=')).slice('--origin='.length);
const output = process.argv
  .find((value) => value.startsWith('--output='))
  .slice('--output='.length);
app.setPath('userData', path.join(output, 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');

async function settle(window, theme = 'light') {
  await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Showcase readiness timeout')), 5000);
    const check = () => {
      if (document.querySelector('[data-showcase="004"]') && document.documentElement.dataset.theme === ${JSON.stringify(theme)}) {
        clearTimeout(timer); resolve();
      } else requestAnimationFrame(check);
    };
    check();
  })`);
  await window.webContents.executeJavaScript(
    'document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))',
  );
}
async function paint(window) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Offscreen paint timeout')), 5000);
    window.webContents.once('paint', (_event, _dirty, image) => {
      clearTimeout(timer);
      resolve(image);
    });
    window.webContents.invalidate();
  });
}
async function run() {
  await app.whenReady();
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({
      cancel:
        !details.url.startsWith(url) &&
        !details.url.startsWith('devtools:') &&
        !details.url.startsWith('data:'),
    });
  });
  const errors = [];
  const createWindow = (height = 760) => {
    const window = new BrowserWindow({
      width: 1240,
      height,
      useContentSize: true,
      enableLargerThanScreen: true,
      show: false,
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    window.webContents.on('console-message', (details) => {
      if (details.level === 'error') errors.push(details.message);
    });
    return window;
  };
  app.on('window-all-closed', () => {});
  for (const theme of ['light', 'dark']) {
    const page = `${url}/ui-showcase.html?theme=${theme}&motion=off`;
    const measureWindow = createWindow();
    await measureWindow.loadURL(page);
    await settle(measureWindow, theme);
    const height = await measureWindow.webContents.executeJavaScript(
      'Math.ceil(document.documentElement.scrollHeight)',
    );
    measureWindow.destroy();
    const window = createWindow();
    window.setContentSize(1240, height);
    await window.loadURL(page);
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Viewport resize timeout: ' + innerWidth + 'x' + innerHeight)), 5000);
      const check = () => {
        if (innerWidth === 1240 && innerHeight === ${height}) {
          clearTimeout(timer); window.removeEventListener('resize', check); resolve();
        }
      };
      window.addEventListener('resize', check); check();
    })`);
    await settle(window, theme);
    // The offscreen paint event already carries the complete native bitmap.
    // Reading that frame avoids capturePage's intermittent UnknownVizError
    // when a hidden Chromium surface has just changed size on Windows.
    await paint(window);
    // Drain any first frame queued before React's theme effect committed.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const image = await paint(window);
    if (image.getSize().width !== 1240 || image.getSize().height !== height) {
      throw new Error(`Unexpected offscreen frame size: ${JSON.stringify(image.getSize())}`);
    }
    await fs.writeFile(path.join(output, `${theme}.png`), image.toPNG());
    console.log(`${theme}.png: ${image.getSize().width} × ${image.getSize().height}`);
    window.destroy();
  }
  // Native browser semantics cannot be established by a DOM shim. This fixture is
  // opened by React on mount; no simulated mouse or keyboard input is sent.
  const window = createWindow();
  await window.loadURL(`${url}/ui-showcase.html?probe=dialog`);
  await settle(window);
  const native = await window.webContents.executeJavaScript(`(() => {
    const dialog = document.querySelector('dialog');
    const cancel = dialog.querySelector('button');
    const defaultFocus = document.activeElement === cancel;
    const background = document.querySelector('button');
    background.focus();
    return { modal: dialog.matches(':modal'), defaultFocus, backgroundFocusBlocked: document.activeElement !== background,
      dialogFocusRetained: dialog.contains(document.activeElement), popoverSupported: typeof HTMLElement.prototype.showPopover === 'function' };
  })()`);
  await fs.writeFile(
    path.join(output, 'native.json'),
    JSON.stringify(
      { electron: process.versions.electron, platform: process.platform, ...native, errors },
      null,
      2,
    ),
  );
  if (Object.values(native).some((value) => value !== true) || errors.length)
    throw new Error(`Native verification failed: ${JSON.stringify({ native, errors })}`);
  window.destroy();
}
run().then(
  () => app.exit(0),
  (error) => {
    console.error(error);
    app.exit(1);
  },
);
