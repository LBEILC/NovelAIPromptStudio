import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');
const screenshotDir = path.join(projectRoot, 'doc', 'screenshots');
const renderScale = 1;
const canvasWidth = 1920;
const canvasHeight = 1080;

const artwork = [
  {
    key: 'hero',
    source: 'workbench-v090.webp',
    output: 'readme-hero-v090.webp',
    cropTop: 0,
    eyebrow: 'NOVELAI PROMPT STUDIO',
    headline: ['让 Prompt', '回到创作流程'],
    summary: '读取、整理与复用 NovelAI Prompt',
    figure: 'FIG 01 · WORKBENCH',
    index: 'READ / ORGANIZE / REUSE',
    plane: { x: 560, y: 80, width: 1500, rotateX: 1.4, rotateY: -6.5, rotateZ: -1.15 },
    echo: { x: 460, y: 470, width: 900, rotateX: 0.5, rotateY: -8, rotateZ: -1.4 },
  },
  {
    key: 'workbench',
    source: 'workbench-v090.webp',
    output: 'readme-workbench-v090.webp',
    cropTop: 0,
    eyebrow: 'NOVELAI PROMPT STUDIO',
    headline: ['把 Prompt', '看清楚'],
    summary: '结构、译文与权重，各归其位。',
    figure: 'FIG 02 · PROMPT STRUCTURE',
    index: 'STRUCTURE / TRANSLATION / WEIGHT',
    plane: { x: 620, y: 104, width: 1460, rotateX: 0.8, rotateY: -4.2, rotateZ: -0.4 },
    echo: { x: 470, y: 500, width: 880, rotateX: 0.4, rotateY: -7, rotateZ: -0.9 },
  },
  {
    key: 'gallery',
    source: 'gallery-v090.webp',
    output: 'readme-gallery-v090.webp',
    cropTop: 31,
    eyebrow: 'NOVELAI PROMPT STUDIO',
    headline: ['让用过的 Prompt', '重新可发现'],
    summary: '分组、筛选与收藏，都留在本地。',
    figure: 'FIG 03 · LOCAL ARCHIVE',
    index: 'GROUP / FILTER / COLLECTION',
    plane: { x: 650, y: 96, width: 1460, rotateX: 1.2, rotateY: -5.2, rotateZ: -0.8 },
    echo: { x: 485, y: 470, width: 900, rotateX: 0.5, rotateY: -7.5, rotateZ: -1.1 },
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function screenMarkup(layer, source, cropTop, className) {
  const aspectWidth = 1706;
  const contentHeight = 1002;
  const cropOffset = layer.width * cropTop / aspectWidth;
  const imageOffset = cropTop ? `top: -${cropOffset}px;` : '';
  return `
    <div
      class="screen ${className}"
      style="
        --x: ${layer.x}px;
        --y: ${layer.y}px;
        --screen-width: ${layer.width}px;
        --screen-height: ${layer.width * contentHeight / aspectWidth}px;
        --rotate-x: ${layer.rotateX}deg;
        --rotate-y: ${layer.rotateY}deg;
        --rotate-z: ${layer.rotateZ}deg;
      "
    >
      <img src="${source}" alt="" style="${imageOffset}">
    </div>`;
}

function pageHtml(config, assets) {
  const sourcePath = path.join(screenshotDir, config.source);
  const source = pathToFileURL(sourcePath).href;
  const titleLines = config.headline.map((line) => `<span>${escapeHtml(line)}</span>`).join('');
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <style>
        @font-face {
          font-family: "HarmonyOS Sans SC";
          src: url("${assets.harmonyRegular}") format("woff2");
          font-style: normal;
          font-weight: 400;
        }
        @font-face {
          font-family: "HarmonyOS Sans SC";
          src: url("${assets.harmonyBold}") format("woff2");
          font-style: normal;
          font-weight: 700;
        }
        @font-face {
          font-family: "Geist Mono";
          src: url("${assets.geistMono}") format("opentype");
          font-style: normal;
          font-weight: 400;
        }
        * { box-sizing: border-box; }
        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          overflow: hidden;
          background: #101113;
        }
        body {
          font-family: "HarmonyOS Sans SC", sans-serif;
          text-rendering: geometricPrecision;
          -webkit-font-smoothing: antialiased;
        }
        .render-root {
          position: relative;
          width: ${canvasWidth}px;
          height: ${canvasHeight}px;
          overflow: hidden;
          color: #f4f6f8;
          isolation: isolate;
          transform: scale(${renderScale});
          transform-origin: left top;
          background:
            radial-gradient(ellipse 54% 64% at 72% 42%, #242321 0%, #171817 42%, transparent 76%),
            radial-gradient(ellipse 42% 54% at 19% 30%, #17191c 0%, transparent 72%),
            #101113;
        }
        .render-root::before {
          position: absolute;
          z-index: 20;
          inset: 0;
          pointer-events: none;
          content: "";
          opacity: 0.035;
          background-image: url("${assets.noise}");
          background-size: 240px 240px;
          mix-blend-mode: soft-light;
        }
        .render-root::after {
          position: absolute;
          z-index: 18;
          inset: 0;
          pointer-events: none;
          content: "";
          background: radial-gradient(ellipse at 72% 42%, transparent 48%, #0d0e10 112%);
        }
        .screen {
          position: absolute;
          z-index: 5;
          left: var(--x);
          top: var(--y);
          width: var(--screen-width);
          height: var(--screen-height);
          overflow: hidden;
          border: 1px solid #46484a;
          border-radius: 9px;
          background: #101113;
          transform:
            perspective(2400px)
            rotateX(var(--rotate-x))
            rotateY(var(--rotate-y))
            rotateZ(var(--rotate-z));
          transform-origin: center center;
          box-shadow:
            0 34px 80px #050607,
            0 0 0 1px #2c2e31;
          backface-visibility: hidden;
        }
        .screen img {
          position: absolute;
          left: 0;
          display: block;
          width: 100%;
          height: auto;
          user-select: none;
        }
        .screen::after {
          position: absolute;
          inset: 0;
          pointer-events: none;
          content: "";
          background: linear-gradient(135deg, #f2f5f80a 0%, transparent 24%, transparent 76%, #00000012 100%);
        }
        .screen.echo {
          z-index: 2;
          opacity: 0.32;
          filter: blur(13px) brightness(0.64) saturate(0.78);
          border-color: #333537;
          box-shadow: 0 30px 68px #060708;
        }
        .copy {
          position: absolute;
          z-index: 30;
          left: 124px;
          top: 176px;
          width: 520px;
        }
        .accent {
          width: 52px;
          height: 4px;
          margin-bottom: 32px;
          border-radius: 2px;
          background: #53a8ff;
        }
        .eyebrow,
        .figure,
        .index {
          font-family: "Geist Mono", monospace;
          font-variant-ligatures: none;
          text-transform: uppercase;
        }
        .eyebrow {
          color: #aeb7c2;
          font-size: 18px;
          letter-spacing: 0.16em;
        }
        h1 {
          display: grid;
          gap: 0;
          margin: 34px 0 24px -0.045em;
          color: #f3f5f7;
          font-size: ${config.key === 'gallery' ? 64 : 72}px;
          font-weight: 700;
          line-height: 1.22;
          letter-spacing: -0.045em;
        }
        h1 span { display: block; white-space: nowrap; }
        .summary {
          margin: 0;
          color: #aab3be;
          font-size: 23px;
          font-weight: 400;
          letter-spacing: -0.01em;
          line-height: 1.55;
        }
        .caption {
          position: absolute;
          z-index: 30;
          left: 124px;
          bottom: 156px;
          width: 346px;
          border-top: 1px solid #363a40;
          padding-top: 26px;
        }
        .figure {
          color: #7f8a97;
          font-size: 15px;
          letter-spacing: 0.13em;
        }
        .index {
          margin-top: 16px;
          color: #59636f;
          font-size: 14px;
          letter-spacing: 0.04em;
        }
      </style>
    </head>
    <body>
      <main class="render-root">
        ${screenMarkup(config.echo, source, config.cropTop, 'echo')}
        ${screenMarkup(config.plane, source, config.cropTop, 'primary')}
        <section class="copy">
          <div class="accent"></div>
          <div class="eyebrow">${escapeHtml(config.eyebrow)}</div>
          <h1>${titleLines}</h1>
          <p class="summary">${escapeHtml(config.summary)}</p>
        </section>
        <footer class="caption">
          <div class="figure">${escapeHtml(config.figure)}</div>
          <div class="index">${escapeHtml(config.index)}</div>
        </footer>
      </main>
    </body>
  </html>`;
}

function fontAssets() {
  const fontRoot = path.join(projectRoot, 'node_modules', '@lobehub');
  const noiseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".74" numOctaves="4" seed="23"/></filter>
    <rect width="100%" height="100%" filter="url(#n)" opacity=".72"/>
  </svg>`;
  return {
    harmonyRegular: pathToFileURL(path.join(fontRoot, 'webfont-harmony-sans-sc', 'fonts', 'HarmonyOS_Sans_SC_Regular.woff2')).href,
    harmonyBold: pathToFileURL(path.join(fontRoot, 'webfont-harmony-sans-sc', 'fonts', 'HarmonyOS_Sans_SC_Bold.woff2')).href,
    geistMono: pathToFileURL(path.join(fontRoot, 'webfont-geist-mono', 'fonts', 'GeistMono-Regular.otf')).href,
    noise: `data:image/svg+xml;base64,${Buffer.from(noiseSvg).toString('base64')}`,
  };
}

async function runElectronRenderer() {
  const { app, BrowserWindow } = await import('electron');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.disableHardwareAcceleration();
  await app.whenReady();

  const assets = fontAssets();
  const htmlPath = path.join(screenshotDir, '.readme-artwork-render.html');
  const window = new BrowserWindow({
    width: canvasWidth * renderScale,
    height: canvasHeight * renderScale,
    useContentSize: true,
    enableLargerThanScreen: true,
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#101113',
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
    },
  });
  try {
    for (const config of artwork) {
      const html = pageHtml(config, assets);
      fs.writeFileSync(htmlPath, html);
      await window.loadFile(htmlPath);
      await window.webContents.executeJavaScript(`
        document.fonts.ready.then(() => new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
      `);
      const capture = await window.webContents.capturePage({
        x: 0,
        y: 0,
        width: canvasWidth * renderScale,
        height: canvasHeight * renderScale,
      });
      const size = capture.getSize();
      if (size.width !== canvasWidth * renderScale || size.height !== canvasHeight * renderScale) {
        throw new Error(`Unexpected capture size for ${config.key}: ${size.width}x${size.height}`);
      }
      fs.writeFileSync(path.join(screenshotDir, `.${config.key}-readme-render.png`), capture.toPNG());
    }
  } finally {
    window.destroy();
    if (fs.existsSync(htmlPath)) fs.rmSync(htmlPath);
  }
  app.quit();
}

async function runParent() {
  const electronPath = (await import('electron')).default;
  const result = spawnSync(electronPath, [scriptPath], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(`Electron renderer failed:\n${result.stdout || ''}\n${result.stderr || ''}`);
  }

  const sharp = (await import('sharp')).default;
  const temporaryPaths = artwork.map((config) => path.join(screenshotDir, `.${config.key}-readme-render.png`));
  try {
    for (const [index, config] of artwork.entries()) {
      const temporaryPath = temporaryPaths[index];
      const outputPath = path.join(screenshotDir, config.output);
      await sharp(temporaryPath)
        .resize({ width: canvasWidth, height: canvasHeight, fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .sharpen({ sigma: 0.35, m1: 0.4, m2: 0.8 })
        .webp({ quality: 94, effort: 6 })
        .toFile(outputPath);
      console.log(path.relative(projectRoot, outputPath));
    }
  } finally {
    for (const temporaryPath of temporaryPaths) {
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    }
  }
}

if (process.versions.electron) {
  runElectronRenderer().catch((error) => {
    console.error(error);
    import('electron').then(({ app }) => app.exit(1));
  });
} else {
  await runParent();
}
