const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const url = process.argv.find((value) => value.startsWith('--origin=')).slice('--origin='.length);
const referenceOrigin = process.argv
  .find((value) => value.startsWith('--reference-origin='))
  .slice('--reference-origin='.length);
const output = process.argv
  .find((value) => value.startsWith('--output='))
  .slice('--output='.length);
app.setPath('userData', path.join(output, 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');

async function settle(window, theme = 'light', reference = false) {
  await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Showcase readiness timeout')), 5000);
    const check = () => {
      if (document.querySelector(${JSON.stringify(reference ? '.sheet' : '[data-showcase="004"]')}) && document.documentElement.dataset.theme === ${JSON.stringify(theme)}) {
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
    if (details.url.startsWith('https://fonts.googleapis.com/')) {
      callback({ redirectURL: `${referenceOrigin}/offline-fonts.css` });
      return;
    }
    callback({
      cancel:
        !details.url.startsWith(url) &&
        !details.url.startsWith(referenceOrigin) &&
        !details.url.startsWith('devtools:') &&
        !details.url.startsWith('data:'),
    });
  });
  const errors = [];
  const createWindow = (height = 760) => {
    const window = new BrowserWindow({
      width: 1280,
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
  const comparison = [];
  const captureWindow = createWindow();
  const resize = async (height) => {
    captureWindow.setContentSize(1280, height);
    await captureWindow.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Viewport resize timeout')), 5000);
      const check = () => {
        if (innerWidth === 1280 && innerHeight === ${height}) { clearTimeout(timer); resolve(); }
        else requestAnimationFrame(check);
      }; check();
    })`);
  };
  for (const theme of ['light', 'dark']) {
    for (const reference of [true, false]) {
      captureWindow.setContentSize(1280, 760);
      const page = reference
        ? `${referenceOrigin}/design/preview.html?page=comps&theme=${theme}`
        : `${url}/ui-showcase.html?theme=${theme}&motion=off`;
      await captureWindow.loadURL(page);
      await resize(760);
      await settle(captureWindow, theme, reference);
      if (reference) await captureWindow.webContents.insertCSS('.spin { animation: none; }');
      const height = await captureWindow.webContents.executeJavaScript(
        'Math.ceil(document.documentElement.scrollHeight)',
      );
      await resize(height);
      await settle(captureWindow, theme, reference);
      const bounds = await captureWindow.webContents.executeJavaScript(`(() => {
        const sheet = document.querySelector(${JSON.stringify(reference ? '.sheet' : '.nps-demo-sheet')});
        const rect = sheet.getBoundingClientRect();
        const sections = Array.from(sheet.children).slice(0, 9);
        const bottom = ${reference} ? rect.bottom : Math.max(...sections.map(section => section.getBoundingClientRect().bottom)) + parseFloat(getComputedStyle(sheet).paddingBottom);
        return { x: Math.floor(rect.x), y: Math.floor(rect.y), width: Math.ceil(rect.width), height: Math.ceil(bottom - rect.y) };
      })()`);
      await paint(captureWindow);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const image = await paint(captureWindow);
      if (image.getSize().width !== 1280 || image.getSize().height !== height)
        throw new Error(`Unexpected offscreen frame size: ${JSON.stringify(image.getSize())}`);
      const name = reference ? 'reference' : 'showcase';
      await fs.writeFile(path.join(output, `${name}-${theme}.png`), image.crop(bounds).toPNG());
      if (!reference) await fs.writeFile(path.join(output, `${theme}.png`), image.toPNG());
      comparison.push({ theme, source: name, page, bounds, windowId: captureWindow.id });
      if (!reference) {
        const metrics = await captureWindow.webContents.executeJavaScript(`(() => {
          const slider = document.querySelector('input[type="range"]');
          const spinner = getComputedStyle(document.querySelector('.nps-loader'));
          const dot = getComputedStyle(document.querySelector('.nps-dot'));
          const token = name => getComputedStyle(slider).getPropertyValue(name).trim();
          return {
            slider: { type: slider.type, name: slider.getAttribute('aria-label'), min: slider.min, max: slider.max,
              step: slider.step, value: slider.value, valueText: slider.getAttribute('aria-valuetext'),
              appearance: getComputedStyle(slider).appearance, width: getComputedStyle(slider).width,
              expectedWidth: token('--slider-w') },
            spinner: { width: spinner.width, expectedWidth: token('--spin'), animation: spinner.animationName },
            tagDot: { width: dot.width, height: dot.height, expectedSize: token('--cat-dot') },
            stepper: { value: document.querySelector('[role="spinbutton"]').value },
          };
        })()`);
        if (
          metrics.slider.type !== 'range' ||
          metrics.slider.appearance !== 'none' ||
          metrics.slider.width !== metrics.slider.expectedWidth ||
          metrics.spinner.width !== metrics.spinner.expectedWidth ||
          metrics.tagDot.width !== metrics.tagDot.expectedSize ||
          metrics.tagDot.height !== metrics.tagDot.expectedSize ||
          metrics.spinner.animation !== 'none'
        )
          throw new Error('Rendered control metrics failed: ' + JSON.stringify(metrics));
        await fs.writeFile(
          path.join(output, `controls-${theme}.json`),
          JSON.stringify(metrics, null, 2),
        );
      }
      console.log(`${name}-${theme}.png: ${bounds.width} x ${bounds.height}`);
    }
  }
  await fs.writeFile(
    path.join(output, 'comparison.json'),
    JSON.stringify(
      {
        fontPolicy:
          'Offline: declared system fallbacks on both pages; Google Fonts stylesheet redirected to empty local CSS. No design source modified.',
        captures: comparison,
      },
      null,
      2,
    ),
  );
  captureWindow.destroy();
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
