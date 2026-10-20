import fs from 'node:fs/promises';
import path from 'node:path';
import { net, session } from 'electron';
import { importLibraryFiles } from '../importer.js';
import { harness } from '../acceptance/harness.js';
import { spawn } from 'node:child_process';

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
  app,
  mode,
  database,
  assetsDirectory,
  preferences,
  createWindow,
  generationService,
}) {
  const output = path.resolve('.codex-runs/readme');
  await fs.mkdir(output, { recursive: true });
  await fs.rm(path.join(output, 'manifest.json'), { force: true });
  preferences.saveProductivitySettings({ autoCheckUpdates: false });
  const network = {
    danbooruEmptyResponses: 0,
    localRequests: 0,
    blockedRequests: 0,
    blockedUrls: [],
  };
  const originalFetch = net.fetch,
    originalGlobalFetch = globalThis.fetch;
  const local = (url) =>
    new URL(typeof url === 'string' || url instanceof URL ? String(url) : url.url).origin ===
    generationService.url;
  net.fetch = async (url, options) => {
    const address = new URL(typeof url === 'string' || url instanceof URL ? String(url) : url.url);
    if (address.protocol === 'file:') return originalFetch(url, options);
    if (local(url)) {
      network.localRequests++;
      return originalFetch(url, options);
    }
    if (address.protocol === 'https:' && address.pathname === '/tags.json') {
      network.danbooruEmptyResponses++;
      return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    }
    network.blockedRequests++;
    network.blockedUrls.push(String(url));
    throw Error('Network disabled for README screenshots');
  };
  globalThis.fetch = async (url, options) => {
    if (local(url)) {
      network.localRequests++;
      return originalGlobalFetch(url, options);
    }
    network.blockedRequests++;
    network.blockedUrls.push(String(url));
    throw Error('Network disabled for README screenshots');
  };
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (request, callback) => {
      if (local(request.url)) callback({ cancel: false });
      else {
        network.blockedRequests++;
        network.blockedUrls.push(request.url);
        callback({ cancel: true });
      }
    },
  );
  const checks = [],
    screenshots = [];
  let window, h;
  const invoke = (name, input = {}) =>
    h.evaluate(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
    );
  const cli = (name, input) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.join(app.getAppPath(), 'agent', 'nai-studio.mjs'),
          name,
          '--json',
          JSON.stringify(input),
        ],
        {
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            NAI_STUDIO_USER_DATA: app.getPath('userData'),
            NAI_STUDIO_NO_LAUNCH: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          shell: false,
        },
      );
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (x) => {
        stdout += x;
      });
      child.stderr.on('data', (x) => {
        stderr += x;
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(Error('README CLI timeout'));
      }, 20000);
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          const result = JSON.parse(stdout.trim());
          if (code || !result.ok) throw Error(stderr + stdout);
          resolve(result.data);
        } catch (error) {
          reject(error);
        }
      });
    });
  const capture = async (name) => {
    await h.evaluate('document.activeElement?.blur()');
    await h.wait('!document.querySelector(".nps-toast") && !window.studioScreenshot.pending()');
    await h.evaluate(
      `(async()=>{for(const image of document.images) if(image.getClientRects().length) await image.decode();await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`,
    );
    await h.check(
      `${name} 使用指定窗口与浅色主题`,
      `innerWidth===1240&&innerHeight===760&&document.documentElement.dataset.theme==='light'`,
      undefined,
      'once',
    );
    await h.check(
      `${name} 没有本机路径或服务地址`,
      `!/[A-Z]:\\\\|Users[\\\\/]|nai-app-screens-|https?:\\/\\//i.test(document.body.innerText)`,
      undefined,
      'once',
    );
    const { data } = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 1240, height: 760, scale: 2 },
    });
    await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(data, 'base64'));
    screenshots.push(name);
  };
  const finished = (id) =>
    h.wait(
      `window.studio.invoke('generate.status',{id:${JSON.stringify(id)}}).then(r=>r.data.jobs[0]?.state==='completed')`,
      '演示生成完成',
    );
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
    const projects = database.loadLibrary('all'),
      current = projects.find((p) => p.name === '雨后候车亭-01');
    if (!current) throw Error('Missing portrait demo');
    generationService.state.images = await Promise.all(
      files.filter((f) => path.basename(f).startsWith('雨后候车亭')).map((f) => fs.readFile(f)),
    );
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
    preferences.saveAppearanceSettings({ themeMode: 'light', motion: 'off' });
    window = createWindow({
      page: 'workbench',
      name: 'workbench',
      theme: 'light',
      animationsDisabled: true,
      workbenchPaths: [
        path.join(source, '雨后候车亭-01.png'),
        path.join(source, '海边写生-01.png'),
      ],
    });
    window.setContentSize(1240, 760);
    window.webContents.debugger.attach('1.3');
    await new Promise((resolve, reject) => {
      window.webContents.once('did-finish-load', resolve);
      window.webContents.once('did-fail-load', (_e, code) => reject(Error(`Load failed: ${code}`)));
    });
    h = harness(window, { ...mode, output, screenshots: [], phase: 'readme' }, checks);
    await h.wait(`document.documentElement.dataset.screenshotReady==='workbench'`);
    await h.evaluate('document.fonts.ready.then(()=>true)');
    if (process.env.NPS_COMPARE_SETTINGS_DIR) {
      const { compareSettings } = await import('./compareSettings.js');
      await compareSettings({ app, window, h, invoke, preferences, database, generationService });
      return;
    }
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
    await invoke('dictionary.translate', { tags });
    for (const { tag, translation, category } of dictionaryEdits)
      database.updateTagDictionary(tag, { translation, category });
    await h.section('NovelAI 账号');
    await h.input('[aria-label="持久令牌"]', 'acceptance-token');
    await h.click('保存', 'document.querySelector("[data-settings-section=novelai]")');
    await h.wait(
      'document.body.innerText.includes("已保存 ••••••••")&&document.body.innerText.includes("10,000")',
    );
    await capture('account');
    await h.click('工作台', 'document.querySelector(".studio-titlebar")');
    await h.evaluate('document.querySelector(".wb-tab").click()');
    const tabId = (await invoke('workbench.list')).activeTabId;
    const parts = current.prompt_structure.base_prompt_raw.split(', ');
    const tagText = parts.slice(0, 6).join(', ');
    const raw = `${tagText}\n\n${paragraph}`;
    await invoke('prompt.set', { tabId, scope: 'base:prompt', text: raw });
    await invoke('prompt.set-size', { tabId, width: 832, height: 1216 });
    for (let i = 0; i < 4; i++) {
      const text =
        i === 0
          ? raw
          : `${tagText}, ${['', 'soft light', 'rain reflections', 'gentle breeze'][i]}\n\n${i >= 2 ? paragraph.replace('pale sky', 'warm evening sky') : paragraph}`;
      await invoke('prompt.set', { tabId, scope: 'base:prompt', text });
      const job = await invoke('generate.start', { tabId, count: 1 });
      await finished(job.id);
    }
    let tree = await invoke('version.list', { tabId });
    const mainTip = tree.versions.at(-1),
      fork = tree.versions[1],
      rewritten = tree.versions[3];
    await invoke('version.open', { tabId, versionId: fork.id });
    await invoke('prompt.set', {
      tabId,
      scope: 'base:prompt',
      text: `${tagText}, blue hour\n\n${paragraph.replace('pale sky', 'blue evening sky')}`,
    });
    const branch = await invoke('generate.start', { tabId, count: 1 });
    await finished(branch.id);
    await invoke('version.open', { tabId, versionId: mainTip.id });
    tree = await invoke('version.list', { tabId });
    await h.check(
      '演示作品由假服务生成至少五版并有分叉',
      () => tree.versions.length >= 5 && new Set(tree.versions.map((v) => v.branchId)).size >= 2,
      undefined,
      'once',
    );
    await h.wait(`!!document.querySelector('[data-version-id="${rewritten.id}"] .wb-version-row')`);
    const point = await h.evaluate(
      `(()=>{const n=document.querySelector('[data-version-id="${rewritten.id}"] .wb-version-row');n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+10}})()`,
    );
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...point,
      button: 'none',
    });
    await h.wait(
      '!!document.querySelector("[role=tooltip] del")&&!!document.querySelector("[role=tooltip] ins")',
    );
    await capture('versions');
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 600,
      y: 50,
      button: 'none',
    });
    await h.wait('!document.querySelector("[role=tooltip] del")');
    await invoke('prompt.set', {
      tabId,
      scope: 'base:prompt',
      text: `${tagText}, falling rain\n\n${paragraph}`,
    });
    generationService.state.holdAt = generationService.state.requests.length + 2;
    const generating = await invoke('generate.start', { tabId, count: 3 });
    await h.wait(
      'document.querySelector(".wb-generation-bar")?.textContent.includes("生成中 2 / 3")&&document.querySelector(".wb-generation-title")?.textContent.includes("生成中 · 2 / 3")',
    );
    await h.check(
      '三张队列第一张完成、第二张进行中、第三张排队',
      async () => {
        const s = await invoke('generate.status', { id: generating.id });
        return s.jobs[0].completed === 1 && s.jobs[0].state === 'generating';
      },
      undefined,
      'once',
    );
    await h.evaluate(
      '(()=>{const n=document.querySelector(".wb-versions-scroll");n.scrollTop=n.scrollHeight})()',
    );
    await h.wait('!!document.querySelector(".wb-generation-slots .is-generating")');
    await h.wait(
      '(()=>{const r=document.querySelector(".wb-generation-slots .is-generating").getBoundingClientRect();return r.bottom<=innerHeight&&r.top>0})()',
    );
    await capture('generate');
    generationService.state.resume();
    await finished(generating.id);
    const tabs = (await invoke('workbench.list')).tabs;
    const pending = [];
    for (const tab of tabs.slice(0, 2))
      pending.push(await cli('generate.start', { tabId: tab.id, count: 1 }));
    await h.wait('document.body.innerText.includes("Agent 待确认 · 2")');
    await h.click('Agent 待确认 · 2');
    await h.check(
      '两个作品通过真实 CLI 进入待确认',
      () =>
        pending.length === 2 &&
        pending.every((j) => j.state === 'pending') &&
        pending[0].workId !== pending[1].workId,
      undefined,
      'once',
    );
    await capture('agent');
    await h.key('Escape');
    await invoke('generate.cancel', { ids: pending.map((j) => j.id) });
    await invoke('prompt.set', {
      tabId,
      scope: 'base:prompt',
      text: `1.3::rain::, {transparent umbrella}, girl, teal eyes, quiet city bus stop, pale blue sky, -1.2::wind::\n\n${paragraph}`,
    });
    await h.key('e', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
    await h.wait('!!document.querySelector(".wb-text-section textarea")');
    await capture('text');
    await h.click('图片库', 'document.querySelector(".studio-titlebar")');
    await h.click('全部图片', 'document.querySelector(".library-side")');
    await h.click('筛选');
    await h.click('导入时间');
    const now = new Date(),
      day = String(now.getDate()).padStart(2, '0'),
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await h.evaluate(`document.querySelector('[data-date="${month}-01"]').click()`);
    await h.evaluate(`document.querySelector('[data-date="${month}-${day}"]').click()`);
    await h.wait(
      '!!document.querySelector(".nps-date-range")&&document.querySelector(".library-chip")?.textContent.includes("至")',
    );
    await capture('library');
    await h.key('Escape');
    await h.key('Escape');
    await h.section('翻译词典');
    await h.wait('document.querySelectorAll(".settings-usage button").length>0');
    await capture('dictionary');
    await h.check(
      '全部请求仅使用本地假服务和离线词典替身',
      () => network.blockedRequests === 0 && network.localRequests > 0,
      undefined,
      'once',
    );
    if (checks.some((c) => c.status !== 'passed'))
      throw Error('README screenshot assertions failed');
  } finally {
    generationService.state.resume?.();
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
