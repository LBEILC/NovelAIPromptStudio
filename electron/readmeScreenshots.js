import fs from 'node:fs/promises';
import path from 'node:path';
import { net, session } from 'electron';
import { importLibraryFiles } from './importer.js';
import { harness } from './acceptance/harness.js';

const paragraph =
  'A vertical full illustration of a girl waiting at a bus shelter just after the rain. She stands slightly right of centre, the transparent umbrella tilted toward the viewer, while the wet pavement mirrors the pale sky.';
const translation =
  '竖幅全身插画：雨刚停，女孩在候车亭下等车。她站在画面中间偏右，透明的伞朝观者倾斜，湿漉漉的路面映着淡色的天空。';

export async function runReadmeScreenshots({
  mode,
  database,
  assetsDirectory,
  preferences,
  createWindow,
}) {
  const output = path.resolve('.codex-runs/readme');
  await fs.mkdir(output, { recursive: true });
  await fs.rm(path.join(output, 'manifest.json'), { force: true });
  const network = { danbooruEmptyResponses: 0, blockedRequests: 0 };
  const originalFetch = net.fetch;
  const originalGlobalFetch = globalThis.fetch;
  // Intercept before calling a transport: Danbooru is an empty offline double.
  // All other HTTP(S) traffic fails, including accidental paragraph AI calls.
  net.fetch = async (url, options) => {
    const address = new URL(typeof url === 'string' || url instanceof URL ? String(url) : url.url);
    if (address.protocol === 'file:') return originalFetch(url, options);
    if (address.protocol === 'https:' && address.pathname === '/tags.json') {
      network.danbooruEmptyResponses++;
      return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    }
    network.blockedRequests++;
    throw Error('Network disabled for README screenshots');
  };
  globalThis.fetch = async () => {
    network.blockedRequests++;
    throw Error('Network disabled for README screenshots');
  };
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_request, callback) => {
      network.blockedRequests++;
      callback({ cancel: true });
    },
  );
  const checks = [];
  const screenshots = [];
  let window;
  let h;
  const open = async (state, theme) => {
    if (window) window.destroy();
    preferences.saveAppearanceSettings({ themeMode: theme, motion: 'off' });
    window = createWindow({ ...state, name: state.page, theme, animationsDisabled: true });
    window.webContents.debugger.attach('1.3');
    const loaded = new Promise((resolve, reject) => {
      window.webContents.once('did-finish-load', resolve);
      window.webContents.once('did-fail-load', (_event, code) =>
        reject(Error(`Load failed: ${code}`)),
      );
    });
    await Promise.all([
      loaded,
      window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        mobile: false,
      }),
    ]);
    h = harness(window, { ...mode, output, screenshots: [], phase: 'readme' }, checks);
    await h.wait(
      `document.documentElement.dataset.screenshotReady===${JSON.stringify(state.page)}`,
    );
    await h.wait(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`);
    await h.evaluate('document.fonts.ready.then(()=>true)');
  };
  const capture = async (name) => {
    await h.evaluate('document.activeElement?.blur()');
    await h.wait(
      '!document.querySelector(".nps-layer,dialog[open],.nps-toast") && !window.studioScreenshot.pending()',
    );
    await h.evaluate(
      `(async()=>{for(const image of document.images) if(image.getClientRects().length) await image.decode();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`,
    );
    await h.check(
      `${name} 没有浮层、通知或本机路径`,
      `!document.querySelector('.nps-layer,dialog[open],.nps-toast') && !/[A-Z]:\\\\|Users[\\\\/]|nai-app-screens-|https?:\\/\\//i.test(document.body.innerText)`,
      undefined,
      'once',
    );
    const { data } = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
    });
    await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(data, 'base64'));
    screenshots.push(name);
  };
  try {
    const source = path.resolve('demo/promo-v090/final');
    const files = (await fs.readdir(source))
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => path.join(source, f));
    if (files.length !== 14) throw Error('Expected 14 demo images');
    const imported = await importLibraryFiles({ filePaths: files, database, assetsDirectory });
    if (imported.errors.length || imported.imported.length !== 14)
      throw Error('Demo import failed');
    const projects = database.loadLibrary('all');
    const current = projects.find((p) => p.name === '雨后候车亭-01');
    if (!current || current.metadata.width >= current.metadata.height)
      throw Error('Missing portrait demo');
    for (const [id, name] of [
      ['weekly', '本周精选'],
      ['composition', '构图研究'],
    ]) {
      database.createCollection({ id, name, kind: 'manual' });
      database.updateCollectionProjects(
        id,
        projects.slice(0, 3).map((p) => p.id),
      );
    }
    database.createCollection({
      id: 'v5',
      name: 'V5',
      kind: 'smart',
      filters: { models: ['NovelAI Diffusion V5'] },
    });
    const state = {
      page: 'workbench',
      workbenchPaths: [
        path.join(source, '雨后候车亭-01.png'),
        path.join(source, '海边写生-01.png'),
        path.join(source, '玻璃花房-01.png'),
      ],
    };
    await open(state, 'light');
    const tags = [
      ...new Set(
        projects
          .flatMap((p) => [
            ...p.tags,
            ...p.prompt_structure.base_undesired_tags,
            ...p.prompt_structure.characters.flatMap((c) => [
              ...c.prompt_tags,
              ...c.undesired_tags,
            ]),
          ])
          .map((t) => t.tag),
      ),
    ];
    const annotated = await h.evaluate(`window.studio.translateTags(${JSON.stringify(tags)})`);
    if (!annotated.ok) throw Error(annotated.error);
    await open(state, 'light');
    await h.click('显示');
    await h.select('语言', '对照');
    await h.key('Escape');
    await h.click('存入图片库');
    await h.wait(
      'document.querySelector(".wb-image-actions")?.textContent.includes("已存入图片库")',
    );
    const parts = current.prompt_structure.base_prompt_raw.split(', ');
    const raw = [
      parts.slice(0, 2).join(', '),
      parts.slice(2, 4).join(', '),
      paragraph,
      parts.slice(4).join(', '),
    ].join('\n\n');
    await h.click('更多', 'document.querySelector(".wb-section")');
    await h.click('编辑原始文本');
    await h.input('[aria-label="原始文本"]', raw);
    await h.click('保存', 'document.querySelector(".wb-raw-editor")');
    await h.wait('!!document.querySelector("[aria-label=编辑段落]")');
    await h.evaluate('document.querySelector("[aria-label=编辑段落]").click()');
    await h.input('[aria-label="中文段落"]', translation);
    await h.click('完成', 'document.querySelector(".wb-paragraph-editor")');
    await h.check(
      '工作台有三个标签、两个含译文及分类圆点的 Tag 块和双语段落',
      `document.querySelectorAll('.wb-tab').length===3 && [...document.querySelectorAll('.wb-section:first-child .wb-block')].filter(b=>b.querySelector('.nps-tag-zh')&&b.querySelector('.nps-dot')).length>=2 && document.body.innerText.includes(${JSON.stringify(translation)})`,
      undefined,
      'once',
    );
    await capture('hero');
    preferences.saveAISettings({
      baseUrl: 'https://readme.invalid/v1',
      model: 'offline-demo',
      clearApiKey: true,
    });
    await h.evaluate('document.querySelector("[aria-label=编辑段落]").click()');
    await h.wait(
      `[...document.querySelectorAll('.wb-paragraph-editor button')].filter(b=>b.textContent.includes('译成中文')||b.textContent.includes('按中文改写英文')).every(b=>!b.disabled && b.getAttribute('aria-disabled')!=='true')`,
    );
    await h.check(
      '段落编辑保留指定中英文且两个 AI 按钮可用',
      `document.querySelector('[aria-label="英文段落"]').value===${JSON.stringify(paragraph)} && document.querySelector('[aria-label="中文段落"]').value===${JSON.stringify(translation)} && [...document.querySelectorAll('.wb-paragraph-editor button')].filter(b=>b.textContent.includes('译成中文')||b.textContent.includes('按中文改写英文')).length===2`,
      undefined,
      'once',
    );
    await capture('workbench');
    await open({ page: 'gallery', selectedProjectId: current.id }, 'dark');
    await h.click('视图', 'document.querySelector(".library-page")');
    await h.click('不合并');
    await h.key('Escape');
    await h.wait(
      'document.querySelectorAll(".library-card").length===14 && !!document.querySelector(".library-detail .library-tags")',
    );
    await h.check(
      '深色全部图片显示 14 张演示图及三个收藏集',
      `document.querySelectorAll('.library-card').length===14 && ['本周精选','构图研究','V5'].every(t=>document.querySelector('.library-side').textContent.includes(t))`,
      undefined,
      'once',
    );
    await capture('library');
    await open({ page: 'settings', section: 'tags' }, 'light');
    await h.wait('document.querySelectorAll(".settings-usage button").length>0');
    await h.check(
      '词典默认全部按图片数降序且没有选中或编辑行',
      `(()=>{const counts=[...document.querySelectorAll('.settings-usage button')].map(n=>Number(n.textContent));return counts.length>2 && counts[0]>0 && counts.every((n,i)=>!i||n<=counts[i-1]) && document.querySelector('[role=tab][aria-selected=true]').textContent.startsWith('全部') && !document.querySelector('tr input:not([type=checkbox]),tr [aria-checked=true]')})()`,
      undefined,
      'once',
    );
    await capture('dictionary');
    await h.check(
      '截图期间没有外网请求且使用离线 Danbooru 替身',
      () => network.blockedRequests === 0 && network.danbooruEmptyResponses > 0,
      undefined,
      'once',
    );
    if (checks.some((c) => c.status !== 'passed'))
      throw Error('README screenshot assertions failed');
  } finally {
    await fs.writeFile(
      path.join(output, 'manifest.json'),
      JSON.stringify({ screenshots, checks, network, addedTranslations: [] }, null, 2),
    );
    window?.destroy();
    net.fetch = originalFetch;
    globalThis.fetch = originalGlobalFetch;
    session.defaultSession.webRequest.onBeforeRequest(null);
  }
}
