import fs from 'node:fs/promises';
import path from 'node:path';
import { session } from 'electron';
import { importLibraryFiles } from '../importer.js';
import { harness } from '../acceptance/harness.js';
import { spawn } from 'node:child_process';

// Curated translations belong only to the disposable screenshot profile.
const dictionaryEdits = `
snowy small train station|雪中的小火车站|Environment
winter|冬天|Environment
quiet shelter|安静的候车亭|Environment
warm lamp light|温暖的灯光|Environment
soft white snow and muted red accents|柔白的雪与柔和红色点缀|Environment
long silver hair|银色长发|Body
star hair ornament|星星发饰|Clothing
violet eyes|紫色眼睛|Body
navy winter coat|藏青色冬季外套|Clothing
white high-collar dress|白色高领连衣裙|Clothing
long chestnut hair|栗色长发|Body
amber eyes|琥珀色眼睛|Body
red knitted scarf|红色针织围巾|Clothing
beige duffle coat|米色牛角扣大衣|Clothing
white mittens|白色连指手套|Clothing
soft snowfall|轻柔的飘雪|Environment
blue hour|蓝调时刻|Environment
`
  .trim()
  .split('\n')
  .map((line) => {
    const [tag, translation, category] = line.split('|');
    return { tag, translation, category };
  });

export async function runReadmeScreenshots({
  commandHandlers,
  app,
  mode,
  database,
  assetsDirectory,
  preferences,
  createWindow,
  generationService,
}) {
  const selectedScreens = process.argv
    .find((arg) => arg.startsWith('--only='))
    ?.slice(7)
    .split(',');
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
  const networkSession = session.fromPartition('studio-network');
  const originalFetch = networkSession.fetch.bind(networkSession),
    originalGlobalFetch = globalThis.fetch;
  const local = (url) =>
    new URL(typeof url === 'string' || url instanceof URL ? String(url) : url.url).origin ===
    generationService.url;
  networkSession.fetch = async (url, options) => {
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
    if (selectedScreens && !selectedScreens.includes(name)) return;
    await h.evaluate('document.activeElement?.blur()');
    await h.wait('!document.querySelector(".toast") && !window.studioScreenshot.pending()');
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
    const source = path.resolve('demo/images/showcase');
    const files = (await fs.readdir(source))
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => path.join(source, f));
    if (files.length !== 24) throw Error('Expected 24 showcase images');
    const imported = await importLibraryFiles({ filePaths: files, database, assetsDirectory });
    if (imported.errors.length || imported.imported.length !== 24)
      throw Error('Demo import failed');
    const projects = database.loadLibrary('all'),
      current = projects.find((p) => p.name === '雪地小站-02');
    if (!current) throw Error('Missing portrait demo');
    generationService.state.images = await Promise.all(
      files
        .filter(
          (f) => path.basename(f).startsWith('雪地小站') && path.basename(f) !== '雪地小站-02.png',
        )
        .map((f) => fs.readFile(f)),
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
      id: 'v5',
      name: 'V5',
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
        path.join(source, '雪地小站-02.png'),
        path.join(source, '霓虹屋顶-04.png'),
        path.join(source, '晨间面包店-01.png'),
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
    if (process.argv.includes('--compare-library')) {
      const { compareLibrary } = await import('./compareLibrary.js');
      return await compareLibrary({ app, window, h, invoke, database, mode, commandHandlers });
    }

    if (process.env.NPS_COMPARE_SETTINGS_DIR) {
      const { compareSettings } = await import('./compareSettings.js');
      await compareSettings({
        app,
        window,
        h,
        invoke,
        preferences,
        database,
        generationService,
        mode,
        commandHandlers,
      });
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
    await h.section('NovelAI 账号');
    await h.wait(
      'document.body.innerText.includes("已保存 ••••••••")&&document.body.innerText.includes("10,000")',
    );
    await capture('guide-account');
    await h.click('工作台', 'document.querySelector(".tb")');
    await h.evaluate('document.querySelector(".tab").click()');
    const tabId = (await invoke('workbench.list')).activeTabId;
    const raw = current.prompt_structure.base_prompt_raw;
    const characters = (await invoke('workbench.get', { tabId })).document.scopes.filter(
      (s) => s.scope.kind === 'character' && s.scope.polarity === 'prompt',
    );
    const characterScope = characters[1].scope.key;
    const characterRaw = current.prompt_structure.characters[1].prompt_raw;
    for (let i = 0; i < 4; i++) {
      await invoke('prompt.set', {
        tabId,
        scope: 'base:prompt',
        text: raw.replace(
          'warm lamp light',
          ['warm lamp light', 'soft snowfall', 'blue hour', 'warm lamp light'][i],
        ),
      });
      await invoke('prompt.set', {
        tabId,
        scope: characterScope,
        text: characterRaw.replace(
          'red knitted scarf',
          i >= 2 ? '1.2::red knitted scarf::' : 'red knitted scarf',
        ),
      });
      const job = await invoke('generate.start', { tabId, count: 1 });
      await finished(job.id);
    }
    let tree = await invoke('version.list', { tabId });
    const mainTip = tree.versions.at(-1),
      fork = tree.versions[1],
      rewritten = tree.versions[2];
    await invoke('version.open', { tabId, versionId: fork.id });
    await invoke('prompt.set', {
      tabId,
      scope: 'base:prompt',
      text: raw.replace('warm lamp light', 'blue hour'),
    });
    const branch = await invoke('generate.start', { tabId, count: 1 });
    await finished(branch.id);
    await invoke('version.open', { tabId, versionId: mainTip.id });
    tree = await invoke('version.list', { tabId });
    if (process.argv.includes('--compare-prototype')) {
      const { comparePrototype } = await import('./comparePrototype.js');
      return await comparePrototype({
        app,
        window,
        h,
        invoke,
        cli,
        tabId,
        tree,
        raw,
        generationService,
        database,
        preferences,
      });
    }
    await h.check(
      '演示作品由假服务生成至少五版并有分叉',
      () => tree.versions.length >= 5 && new Set(tree.versions.map((v) => v.branchId)).size >= 2,
      undefined,
      'once',
    );
    if (!selectedScreens || selectedScreens.includes('readme-versions')) {
      await h.wait(`!!document.querySelector('[data-key="ver-${rewritten.id}"]')`);
      await h.evaluate(
        `document.querySelector('[data-key="ver-${rewritten.id}"]').scrollIntoView({block:'nearest'}); new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`,
      );
      const point = await h.evaluate(
        `(()=>{const n=document.querySelector('[data-key="ver-${rewritten.id}"]');n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+10}})()`,
      );
      await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        ...point,
        button: 'none',
      });
      await h.wait(
        '!!document.querySelector(".ver-peek .minus")&&!!document.querySelector(".ver-peek .plus")',
      );
      await h.wait(
        `document.querySelector('.ver-peek .vp-h b')?.textContent==='第 ${rewritten.number} 版'`,
      );
      await capture('readme-versions');
      await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: 600,
        y: 50,
        button: 'none',
      });
      await h.wait('!document.querySelector(".ver-peek .minus")');
    }
    await invoke('prompt.set', {
      tabId,
      scope: 'base:prompt',
      text: raw.replace('quiet shelter', 'quiet shelter, soft snowfall'),
    });
    generationService.state.holdAt = generationService.state.requests.length + 2;
    const generating = await invoke('generate.start', { tabId, count: 3 });
    await h.wait(
      'document.querySelector(".gen-bar")?.textContent.includes("生成中 2 / 3")&&!!document.querySelector(".slot.run")',
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
      '(()=>{const n=document.querySelector(".versions > .scroll");n.scrollTop=n.scrollHeight})()',
    );
    await h.wait('!!document.querySelector(".slot.run")');
    await h.wait(
      '(()=>{const r=document.querySelector(".slot.run").getBoundingClientRect();return r.bottom<=innerHeight&&r.top>0})()',
    );
    await h.click('翻译');
    await h.evaluate(`document.querySelector('.char-sec')?.scrollIntoView({block:'start'})`);
    await capture('readme-workbench');
    generationService.state.resume();
    await finished(generating.id);
    await invoke('version.open', {
      tabId,
      versionId: tree.versions[0].id,
      imageId: tree.versions[0].project.id,
    });
    const sourcePath = (await invoke('workbench.get', { tabId })).tab.project.image_path;
    await h.wait(
      `document.querySelector('[data-stage]:not(.leaving)')?.getAttribute('src')==='novelai-media://file?path='+encodeURIComponent(${JSON.stringify(sourcePath)})`,
    );
    await h.wait('!!document.querySelector("[data-trigger=op-inpaint]")');
    await h.evaluate('document.querySelector("[data-trigger=op-inpaint]").click()');
    await h.wait('!!document.querySelector(".ip-mask")');
    const paintRect = await h.evaluate(
      `(()=>{const r=document.querySelector('.ip-stage').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`,
    );
    for (const [type, dx, dy] of [
      ['mousePressed', 0.71, 0.64],
      ['mouseMoved', 0.74, 0.66],
      ['mouseReleased', 0.74, 0.66],
    ])
      await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
        type,
        x: paintRect.x + paintRect.width * dx,
        y: paintRect.y + paintRect.height * dy,
        button: 'left',
        buttons: type === 'mouseReleased' ? 0 : 1,
        clickCount: 1,
      });
    await h.until(
      async () => (await invoke('inpaint.get', { tabId })).maskRatio > 0,
      '截图遮罩已同步',
    );
    await h.click('框：拖出送去重绘的范围');
    await h.click('自由', 'document.querySelector(".inpaint-ov")');
    for (const [type, dx, dy] of [
      ['mousePressed', 0.56, 0.48],
      ['mouseMoved', 0.91, 0.82],
      ['mouseReleased', 0.91, 0.82],
    ]) {
      await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
        type,
        x: paintRect.x + paintRect.width * dx,
        y: paintRect.y + paintRect.height * dy,
        button: 'left',
        buttons: type === 'mouseReleased' ? 0 : 1,
        clickCount: 1,
      });
      await h.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    }
    await h.wait('!!document.querySelector(".ip-rect.manual")');
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 1100,
      y: 50,
      button: 'none',
    });
    await h.wait('document.querySelector(".ip-info")?.textContent.includes("免费")');
    await h.evaluate(
      `document.querySelector('.ip-canvas').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );
    await capture('readme-inpaint');
    await h.click('取消', 'document.querySelector(".inpaint-ov")');
    await h.wait('!document.querySelector(".inpaint-ov")');
    await invoke('version.open', { tabId, versionId: tree.versions[1].id });
    const compareVersion = tree.versions[0];
    await h.wait(`!!document.querySelector('[data-key="ths-${compareVersion.id}"] img')`);
    await h.evaluate(
      `document.querySelector('[data-key="ths-${compareVersion.id}"] img').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:250}))`,
    );
    await h.click('和当前这张对比');
    await h.wait('!!document.querySelector(".cmp-ov:not(.leaving)")');
    await h.click('滑块', 'document.querySelector(".cmp-ov")');
    await h.wait('!!document.querySelector(".cmp-cut") && !!document.querySelector(".cmp-diff")');
    await capture('guide-compare');
    await h.key('Escape');
    await h.wait('!document.querySelector(".cmp-ov")');
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
    await capture('readme-agent');
    await h.key('Escape');
    await invoke('generate.cancel', { ids: pending.map((j) => j.id) });
    await invoke('prompt.set', {
      tabId,
      scope: characterScope,
      text: characterRaw.replace('red knitted scarf', '1.2::red knitted scarf::'),
    });
    await h.key('e', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
    await h.wait('!!document.querySelector(".tx-wrap textarea")');
    await h.evaluate(`document.querySelectorAll('.tx-wrap')[3]?.scrollIntoView({block:'center'})`);
    await capture('guide-text');
    await h.click('图片库', 'document.querySelector(".tb")');
    await h.click('全部图片', 'document.querySelector(".libp .side")');
    const selected = projects.find((p) => p.name === '霓虹屋顶-04');
    await h.input('[aria-label="搜索图片库"]', '霓虹屋顶-04');
    await h.wait(`!!document.querySelector('[data-image-id="${selected.id}"]')`);
    await h.evaluate(`document.querySelector('[data-image-id="${selected.id}"]').click()`);
    await h.click('清除搜索');
    await h.wait(
      `document.querySelector('.detail')?.textContent.includes('霓虹屋顶') || !!document.querySelector('[data-image-id="${selected.id}"].on')`,
    );
    await capture('readme-library');
    await h.section('翻译词典');
    await h.wait('document.querySelectorAll(".drow .num").length>0');
    await h.evaluate(
      `[...document.querySelectorAll('.dtabs button')].find(b=>b.textContent.startsWith('已修改')).click()`,
    );
    await h.wait(
      'document.querySelector(".drow")?.textContent.includes("雪") || document.querySelector(".dict")?.textContent.includes("米色牛角扣大衣")',
    );
    await capture('guide-dictionary');
    await h.check(
      '全部请求仅使用本地假服务和离线词典替身',
      () => network.blockedRequests === 0 && network.localRequests > 0,
      undefined,
      'once',
    );
    if (checks.some((c) => c.status !== 'passed'))
      throw Error('README screenshot assertions failed');
  } catch (error) {
    if (window && h) {
      await fs.writeFile(
        path.join(output, 'failure.html'),
        await h.evaluate('document.documentElement.outerHTML'),
      );
      await fs.writeFile(
        path.join(output, 'failure.png'),
        (await window.webContents.capturePage()).toPNG(),
      );
    }
    throw error;
  } finally {
    generationService.state.resume?.();
    await fs.writeFile(
      path.join(output, 'manifest.json'),
      JSON.stringify({ screenshots, checks, network, addedTranslations: dictionaryEdits }, null, 2),
    );
    window?.destroy();
    networkSession.fetch = originalFetch;
    globalThis.fetch = originalGlobalFetch;
    session.defaultSession.webRequest.onBeforeRequest(null);
  }
}
