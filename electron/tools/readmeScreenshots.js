import fs from 'node:fs/promises';
import path from 'node:path';
import { net, session } from 'electron';
import { importLibraryFiles } from '../importer.js';
import { harness } from '../acceptance/harness.js';
import { WORKBENCH_SOURCE_PANEL_WIDTH_KEY } from '../../src/lib/panelLayout.js';

const paragraph =
  'A vertical full illustration of a girl waiting at a bus shelter just after the rain. She stands slightly right of centre, the transparent umbrella tilted toward the viewer, while the wet pavement mirrors the pale sky.';
const translation =
  '竖幅全身插画：雨刚停，女孩在候车亭下等车。她站在画面中间偏右，透明的伞朝观者倾斜，湿漉漉的路面映着淡色的天空。';

// Curated edits belong only to the disposable screenshot profile.
const dictionaryEdits = `
actively painting the coastline on canvas|正在画布上描绘海岸线|Action
adult woman|成年女性|Subject
afternoon sunlight|午后阳光|Environment
artist collaboration|画师合作|ArtistEra
artists:ningen mame|画师:ningen mame|ArtistEra
back three-quarter view|背面四分之三视角|Composition
bad quality|低画质|StyleQuality
best quality|最佳画质|StyleQuality
black leather shoulder bag|黑色皮革单肩包|Clothing
books with unmarked spines|书脊无字的书本|Environment
botanical garden|植物园|Environment
calm atmosphere|平静氛围|Environment
carrying a stack of books|抱着一摞书|Action
charcoal gray plaid pleated skirt|炭灰色格纹百褶裙|Clothing
cinematic composition|电影感构图|Composition
clear morning light|明净的晨光|Environment
close-up at a seaside promenade|海滨步道上的特写|Composition
close-up portrait|肖像特写|Composition
cozy independent bookstore at night|夜晚温馨的独立书店|Environment
cropped face|面部被裁切|Composition
dark shelves behind|身后的暗色书架|Environment
detailed background|细致的背景|Environment
detailed glass greenhouse|细致的玻璃温室|Environment
detailed ocean horizon and seaside promenade|细致的海平线与海滨步道|Environment
detailed seaside promenade and ocean horizon background|细致的海滨步道与海平线背景|Environment
drawing in sketchbook|在速写本上绘画|Action
duplicate|重复内容|StyleQuality
duplicate person|重复人物|Subject
extra characters|多余角色|Subject
extra fingers|多余手指|Body
extra limbs|多余肢体|Body
floating dust|漂浮的尘埃|Environment
frame|画框|Composition
full body side view|全身侧视图|Composition
full-bleed composition|满版构图|Composition
gentle confident smile|温柔自信的微笑|Action
girl|女孩|Subject
hanging leaves|垂落的叶片|Environment
holding a paintbrush|手持画笔|Action
holding an open sketchbook|拿着展开的速写本|Action
holding two books|拿着两本书|Action
jpeg artifacts|JPEG 压缩伪影|StyleQuality
konya karasue|画师:konya karasue|ArtistEra
leaves in foreground|前景中的叶片|Environment
letterbox|上下黑边|Composition
light beige oversized knit cardigan|浅米色宽松针织开衫|Clothing
long copper hair|铜色长发|Body
lowres|低分辨率|StyleQuality
lush plants|茂盛的植物|Environment
malformed limbs|畸形肢体|Body
masterpiece|杰作|StyleQuality
medium shot|中景|Composition
missing fingers|缺失手指|Body
morning light|晨光|Environment
muted blue and warm cream palette|柔和蓝色与暖奶油色配色|StyleQuality
narrow navy necktie|藏青色窄领带|Clothing
natural shadows|自然阴影|Environment
natural smile|自然的微笑|Action
navy and amber palette|藏青色与琥珀色配色|StyleQuality
navy ribbon hair ornament|藏青色缎带发饰|Clothing
no text|无文字|StyleQuality
nsfw|成人内容|StyleQuality
ocean and railing softly blurred behind|身后柔和虚化的海洋与栏杆|Environment
only one girl seated on a folding stool at a wooden easel on the left|仅一名女孩坐在左侧木画架前的折叠凳上|Subject
only one girl standing directly behind a wooden easel|仅一名女孩站在木画架正后方|Subject
open sketchbook|展开的速写本|Environment
original character|原创角色|Identity
overcast sky|阴天的天空|Environment
pale blue sky|淡蓝色天空|Environment
pale color|淡色|StyleQuality
peaceful creative workspace|安静的创作空间|Environment
quiet atmosphere|安静氛围|Environment
quiet city bus stop|安静的城市公交站|Environment
quiet creative mood|宁静的创作氛围|Environment
rain on window|窗上的雨滴|Environment
rainy day|雨天|Environment
reading an open book|阅读摊开的书|Action
reflections on glass|玻璃上的倒影|Environment
relaxed pose|放松的姿势|Action
rella|画师:rella|ArtistEra
scan artifacts|扫描伪影|StyleQuality
screentone|网点纸效果|StyleQuality
sea breeze|海风|Environment
second person|第二个人|Subject
self portrait|自画像|Composition
shallow depth of field|浅景深|Composition
side view|侧视图|Composition
signature|签名|StyleQuality
sitting on a cushioned window seat beside the rainy window|坐在雨窗旁带软垫的窗边座位上|Action
sitting on a wooden bench|坐在木长椅上|Action
soft diffused light|柔和的漫射光|Environment
soft green and amber palette|柔和绿色与琥珀色配色|StyleQuality
soft morning light|柔和晨光|Environment
soft reflections|柔和的倒影|Environment
soft rim light|柔和轮廓光|Composition
standing beside the potting table|站在园艺工作台旁|Action
standing in a narrow aisle|站在狭窄过道中|Action
sunbeams through glass|穿过玻璃的阳光|Environment
tall bookshelves|高大的书架|Environment
teal eyes|蓝绿色眼睛|Body
text|文字|StyleQuality
three-quarter view|四分之三视角|Composition
transparent umbrella|透明雨伞|Environment
very aesthetic|极具美感|StyleQuality
very displeasing|非常不美观|StyleQuality
warm light on face|照在脸上的暖光|Environment
warm tungsten lamps|暖色钨丝灯|Environment
watering small flowers|给小花浇水|Action
wet pavement|湿漉漉的路面|Environment
white pointed-collar shirt|白色尖领衬衫|Clothing
wide coastal landscape|开阔的海岸风景|Composition
windblown hair|被风吹起的头发|Body
wooden potting table|木制园艺工作台|Environment
worst quality|最差画质|StyleQuality
year2025|2025 年|ArtistEra
`
  .trim()
  .split('\n')
  .map((line) => {
    const [tag, translation, category] = line.split('|');
    return { tag, translation, category };
  });

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
    window.setContentSize(1920, 1080);
    window.webContents.debugger.attach('1.3');
    const loaded = new Promise((resolve, reject) => {
      window.webContents.once('did-finish-load', resolve);
      window.webContents.once('did-fail-load', (_event, code) =>
        reject(Error(`Load failed: ${code}`)),
      );
    });
    await loaded;
    h = harness(window, { ...mode, output, screenshots: [], phase: 'readme' }, checks);
    await h.wait(
      `document.documentElement.dataset.screenshotReady===${JSON.stringify(state.page)}`,
    );
    await h.wait(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`);
    await h.evaluate('document.fonts.ready.then(()=>true)');
    const bounds = await h.evaluate(
      `(()=>{const r=document.querySelector('[aria-label=设置]').getBoundingClientRect();return {width:innerWidth,height:innerHeight,gearX:r.x,gearRight:r.right};})()`,
    );
    if (
      window.getContentSize()[0] !== 1920 ||
      window.getContentSize()[1] !== 1080 ||
      bounds.width !== 1920 ||
      bounds.height !== 1080 ||
      bounds.gearX < 1700
    )
      throw Error('Real window size or titlebar position is incorrect: ' + JSON.stringify(bounds));
    checks.push({
      label: state.page + ' real window and titlebar',
      status: 'passed',
      bounds,
      contentSize: window.getContentSize(),
    });
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
    await h.check(
      `${name} 可见 Tag 和词典行都有译文`,
      `(()=>{const visible=e=>{let r=e.getBoundingClientRect();let top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);for(let p=e.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden/.test(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}}return r.width>0&&bottom>top;};return [...document.querySelectorAll('.nps-tag-text')].filter(visible).every(e=>e.querySelector('.nps-tag-zh')?.textContent.trim()) && [...document.querySelectorAll('.settings-table tbody tr')].filter(visible).every(e=>!e.textContent.includes('点击填写'));})()`,
      undefined,
      'once',
    );
    if (name === 'hero' || name === 'workbench')
      await h.check(
        `${name} 提示词栏宽度为 700 像素`,
        `document.querySelector('[aria-label="提示词栏宽度"]').parentElement.getBoundingClientRect().width===700`,
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
    const source = path.resolve('demo/images/final');
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
      id: 'v45',
      name: 'V4.5',
      kind: 'smart',
      filters: { models: [current.metadata.model] },
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
    for (const { tag, translation, category } of dictionaryEdits)
      database.updateTagDictionary(tag, { translation, category });
    await h.evaluate(
      `localStorage.setItem(${JSON.stringify(WORKBENCH_SOURCE_PANEL_WIDTH_KEY)}, '700')`,
    );
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
    await h.input('[aria-label=图片行高]', '300');
    await h.click('不合并');
    await h.key('Escape');
    await h.wait(
      'document.querySelectorAll(".library-card").length===14 && !!document.querySelector(".library-detail .library-tags")',
    );
    await h.check(
      '深色全部图片显示 14 张演示图及三个收藏集',
      `document.querySelectorAll('.library-card').length===14 && ['本周精选','构图研究','V4.5'].every(t=>document.querySelector('.library-side').textContent.includes(t))`,
      undefined,
      'once',
    );
    await h.check(
      '图库展示三到四行且 V4.5 收藏集有 14 张图',
      `(()=>{const cards=[...document.querySelectorAll('.library-card')];const rows=new Set(cards.map(e=>Math.round(e.getBoundingClientRect().top)));return rows.size>=3 && rows.size<=4 && Math.max(...cards.map(e=>e.getBoundingClientRect().bottom))>950 && [...document.querySelectorAll('.library-side button')].some(e=>e.textContent.includes('V4.5')&&e.textContent.includes('14'));})()`,
      undefined,
      'once',
    );
    await capture('library');
    await open({ page: 'settings', section: 'tags' }, 'light');
    await h.wait('document.querySelectorAll(".settings-usage button").length>0');
    await h.check(
      '词典仅剩两条未翻译和未分类，已有用户修改',
      `(()=>{const tabs=[...document.querySelectorAll('.settings-dictionary-views [role=tab]')];return ['没有译文','未分类'].every(label=>tabs.find(e=>e.textContent.startsWith(label))?.querySelector('span').textContent==='2') && Number(tabs.find(e=>e.textContent.startsWith('你改过的'))?.querySelector('span').textContent)>0;})()`,
      undefined,
      'once',
    );
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
      JSON.stringify({ screenshots, checks, network, addedTranslations: dictionaryEdits }, null, 2),
    );
    window?.destroy();
    net.fetch = originalFetch;
    globalThis.fetch = originalGlobalFetch;
    session.defaultSession.webRequest.onBeforeRequest(null);
  }
}
