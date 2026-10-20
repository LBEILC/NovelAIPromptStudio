import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, nativeTheme } from 'electron';
import sharp from 'sharp';
import { groupGalleryProjects, sortGalleryGroups } from '../../src/lib/gallery.js';
import { hasImageName } from '../../src/lib/imageNaming.js';

export async function compareLibrary({ app, window, h, invoke, database, commandHandlers }) {
  const root = app.getAppPath();
  const arg = process.argv.find((x) => x.startsWith('--prototype-dir='));
  const design = path.resolve(arg ? arg.slice('--prototype-dir='.length) : 'design');
  const output = path.join(root, '.codex-runs', 'compare-library');
  await fs.mkdir(output, { recursive: true });
  const url = (file) => pathToFileURL(file).href;
  const styles = [
    'tokens',
    'preview',
    'preview-components',
    'preview-settings',
    'preview-library',
    'preview-workbench',
    'preview-generation',
    'prototype',
    'prototype-libset',
  ];
  const html = `<!doctype html><html lang="zh-CN" data-theme="light" data-motion="off"><head><base href="${url(design + '/')}">${styles.map((name) => `<link rel="stylesheet" href="${url(path.join(design, name + '.css'))}">`).join('')}<link rel="stylesheet" href="${url(path.join(root, 'node_modules/remixicon/fonts/remixicon.css'))}"><style>
  @font-face{font-family:'NPS MiSans';src:url('${url(path.join(root, '.local/fonts/MiSansVF.ttf'))}')} @font-face{font-family:'Newsreader';src:url('${url(path.join(root, 'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2'))}');font-weight:400 500} @font-face{font-family:'IBM Plex Mono';src:url('${url(path.join(root, 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'))}')} .win{margin:0;border:0;border-radius:0;box-shadow:none;width:100vw;height:100vh} .pv-notes{display:none}
  </style></head><body><header class="proto-bar" hidden></header><div id="win" class="win"></div><div id="pv-notes" class="pv-notes"></div></body></html>`;
  const file = path.join(output, 'reference.html');
  await fs.writeFile(file, html);
  const reference = new BrowserWindow({
    show: false,
    width: 1240,
    height: 760,
    useContentSize: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  const shots = [];
  try {
    await reference.loadFile(file);
    const files = [
      path.join(root, '.codex-runs/morphdom-2.7.4.js'),
      ...[
        'preview-logo.js',
        'prototype.js',
        'prototype-lib.js',
        'prototype-set.js',
        'prototype-fill.js',
      ].map((name) => path.join(design, name)),
    ];
    const sources = await Promise.all(files.map((file) => fs.readFile(file, 'utf8')));
    sources[2] = sources[2].replace(
      '`../demo/images/final/${n}.png`',
      'n.startsWith("file:") ? n : `../demo/images/final/${n}.png`',
    );
    await reference.webContents.executeJavaScript(
      sources.join('\n') + '\nroot.dataset.motion="off";paint();',
    );
    const cards = await invoke('library.cards', { view: 'all' });
    const groups = sortGalleryGroups(
      groupGalleryProjects(cards, { promptScope: 'full', mergeVibes: false }),
    );
    const entries = [],
      sizes = {},
      names = {},
      definitions = {};
    groups.forEach((g, index) => {
      const key = 'compare' + index;
      names[key] = hasImageName(g.cover) ? g.cover.name : '';
      definitions[key] = { level: 1, cover: g.cover.id };
      g.members.forEach((p) => {
        const full = database.loadProject(p.id);
        const img = url(full.image_path);
        sizes[img] = [full.metadata.width, full.metadata.height];
        entries.push({
          id: p.id,
          img,
          name: hasImageName(full) ? full.name : '',
          file: full.original_filename || path.basename(full.image_path),
          group: key,
          model: 'V4.5',
          date: full.created_at.slice(0, 10),
          vibe: '',
          tags: full.tags.filter((t) => t.segment_type !== 'text_block').map((t) => t.tag),
          note: '',
          trash: '',
        });
      });
    });
    const collections = database.listCollections();
    const cols = collections
      .filter((c) => c.kind === 'manual')
      .map((c) => ({ id: c.id, name: c.name, ids: c.member_ids }));
    const smarts = collections
      .filter((c) => c.kind === 'smart')
      .map((c) => ({
        id: c.id,
        name: c.name,
        f: { inc: [], incAny: false, exc: [], models: ['V4.5'], vibes: [], range: { kind: 'any' } },
      }));
    await reference.webContents.executeJavaScript(
      `Object.assign(SIZE,${JSON.stringify(sizes)});Object.assign(LIB_GROUPS,${JSON.stringify(definitions)});Object.assign(S.lib,{entries:${JSON.stringify(entries)},gnames:${JSON.stringify(names)},cols:${JSON.stringify(cols)},smarts:${JSON.stringify(smarts)},merge:'same',view:'all',sel:null});S.series={};S.tabs=[];S.tab=null;S.page='lib';paint();`,
    );
    await h.section('NovelAI 账号');
    await h.input('[aria-label="持久令牌"]', 'acceptance-token');
    await h.click('保存', 'document.querySelector("[data-settings-section=novelai]")');
    await h.wait('document.body.innerText.includes("10,000")');
    await reference.webContents.executeJavaScript('S.anlas=10000;S.usage=12;paint();');
    await h.section('外观');
    await h.click('跟随系统', 'document.querySelector("[aria-label=主题]")');
    await h.click('图片库', 'document.querySelector(".studio-titlebar")');
    await h.wait('!!document.querySelector(".library-card")');
    const capture = async (name, state, dark = false) => {
      for (const theme of dark ? ['light', 'dark'] : ['light']) {
        nativeTheme.themeSource = theme;
        await h.wait(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`);
        await reference.webContents.executeJavaScript(
          `${state};root.dataset.theme=${JSON.stringify(theme)};paint();`,
        );
        const detailId = await h.evaluate(
          'document.querySelector(".library-detail")?.dataset.detailId || ""',
        );
        if (detailId)
          await reference.webContents.executeJavaScript(`(()=>{
            const c=libView().cards.find(c=>c.entries.some(e=>e.id===${JSON.stringify(detailId)}));
            if(c){S.lib.sel=c.id;S.lib.si=c.entries.findIndex(e=>e.id===${JSON.stringify(detailId)});paint();}
          })()`);
        const ready = `(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.getClientRects().length).map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()`;
        await Promise.all([h.evaluate(ready), reference.webContents.executeJavaScript(ready)]);
        await Promise.all([reference.webContents.capturePage(), window.webContents.capturePage()]);
        await new Promise((resolve) => setTimeout(resolve, 200));
        const [left, right] = await Promise.all([
          reference.webContents.capturePage(),
          window.webContents.capturePage(),
        ]);
        const ref = await sharp(left.toPNG()).resize(1240, 760).png().toBuffer();
        const product = await sharp(right.toPNG()).resize(1240, 760).png().toBuffer();
        const id = `${name}-${theme}`;
        await fs.writeFile(path.join(output, `${id}-reference.png`), ref);
        await fs.writeFile(path.join(output, `${id}-app.png`), product);
        await sharp({ create: { width: 2480, height: 760, channels: 4, background: '#ffffff' } })
          .composite([
            { input: ref, left: 0, top: 0 },
            { input: product, left: 1240, top: 0 },
          ])
          .png()
          .toFile(path.join(output, `${id}.png`));
        shots.push(id);
      }
    };
    await h.wait('document.querySelector(".library-detail")?.getAttribute("aria-busy")==="false"');
    await h.evaluate('document.querySelector(".library-strip button")?.click()');
    await h.wait('document.querySelector(".library-detail")?.getAttribute("aria-busy")==="false"');
    const selectRef = `S.lib.sel=libView().cards[0].id;S.lib.si=0`;
    await capture('library', selectRef, true);
    await h.click('筛选');
    await capture('filter', 'S.pop="lfilter"');
    await h.click('导入时间');
    await capture(
      'calendar',
      'ACT.lfCal();S.lib.cal.month="' + new Date().toISOString().slice(0, 7) + '"',
    );
    await h.key('Escape');
    await h.key('Escape');
    await h.click('视图');
    await capture('view', 'S.lib.sub=null;S.pop="lview"');
    await h.click('图片排序');
    await capture('sort', 'S.lib.sub="sort"');
    await h.key('Escape');
    await h.key('Escape');
    await h.click('其他导入方式');
    await capture('import', 'S.lib.sub=null;S.pop="limport"');
    await h.key('Escape');
    await h.evaluate('document.querySelector(".library-detail-picture img").click()');
    await h.wait('!!document.querySelector(".library-viewer")');
    await capture('viewer', 'S.pop=null;ACT.viewer(S.lib.sel)', true);
    await h.key('Escape', {}, 'document.querySelector(".library-viewer")');
    await h.evaluate(
      '[...document.querySelectorAll(".library-pick")].slice(0,2).forEach(n=>n.click())',
    );
    await capture('multi', 'S.viewer=null;S.libPicked=libView().cards.slice(0,2).map(c=>c.id)');
    await h.click('起名', 'document.querySelector(".library-selection-bar")');
    await h.input('input[aria-label="图片名称"]', '暮色');
    await capture('batch-name', 'S.pop="lbname";S.lib.lbText="暮色"');
    await h.key('Escape');
    await h.click('取消', 'document.querySelector(".library-selection-bar")');
    await h.click('加入收藏集', 'document.querySelector(".library-detail")');
    await capture(
      'collections',
      'S.viewer=null;S.libPicked=[];S.pop="lcollect";S.lib.collectFrom="detail"',
    );
    await h.key('Escape');
    await h.evaluate(
      'document.querySelector(".library-card").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:300,clientY:180}))',
    );
    await capture('context', 'S.pop=null;S.menu={kind:"card",arg:S.lib.sel,at:[300,180]}');
    await h.key('Escape');
    await h.click('V4.5', 'document.querySelector(".library-side")');
    await capture('smart', 'S.menu=null;S.lib.view="v45"');
    await h.click('编辑规则', 'document.querySelector(".library-chips")');
    await capture('smart-rules', 'ACT.lfOpen()');
    await h.key('Escape');
    await h.click('回收站', 'document.querySelector(".library-side")');
    await capture(
      'trash',
      'S.pop=null;S.lib.ruleEdit=null;S.libPicked=[];S.lib.f=libNoFilter();S.lib.view="trash"',
    );
    await h.click('全部图片', 'document.querySelector(".library-side")');
    const replaced = new Map();
    const replace = (name, handler) => {
      if (!replaced.has(name)) replaced.set(name, commandHandlers[name]);
      commandHandlers[name] = handler;
    };
    try {
      const zipEntries = entries.slice(0, 12).map((entry, i) => {
        const project = database.loadProject(entry.id);
        return {
          id: `zip-${i}`,
          archiveId: 'comparison-zip',
          fileName: `image_${String(i + 1).padStart(2, '0')}.png`,
          previewPath: project.image_path,
          previewWidth: project.metadata.width,
          previewHeight: project.metadata.height,
          duplicate: i >= 9,
        };
      });
      replace('import.prepare', () => ({
        ok: true,
        sessionId: 'comparison-zip',
        requiresSelection: true,
        entries: zipEntries,
        archives: [
          { id: 'comparison-zip', name: 'novelai-images-2026-10-20.zip', count: zipEntries.length },
        ],
      }));
      replace('import.previews', () => ({ ok: true }));
      replace('import.cancel', () => ({ ok: true }));
      await h.click('导入', 'document.querySelector(".library-tools")');
      await h.wait('!!document.querySelector(".library-zip-grid")');
      const referenceEntries = zipEntries.map((entry, i) => ({
        id: i,
        img: entries[i].img,
        file: entry.fileName,
        model: 'V4.5',
        tags: [],
        dup: entry.duplicate,
      }));
      await capture(
        'zip',
        `S.lib.view="all";S.lib.zip={name:"novelai-images-2026-10-20.zip",items:${JSON.stringify(referenceEntries)},picked:[0,1,2,3,4,5,6,7,8]}`,
      );
      await h.click('取消', 'document.querySelector("dialog[open]")');
      const large = Array.from({ length: 60 }, (_, i) => ({
        ...zipEntries[i % zipEntries.length],
        id: `large-${i}`,
        duplicate: i >= 57,
      }));
      replace('import.prepare', () => ({
        ok: true,
        sessionId: 'comparison-large',
        requiresSelection: true,
        entries: large,
        archives: [{ id: 'comparison-zip', name: 'novelai-images-2026-10-20.zip', count: 60 }],
      }));
      await h.click('导入', 'document.querySelector(".library-tools")');
      await h.wait('document.querySelectorAll(".library-zip-grid [data-entry-id]").length===60');
      await capture(
        'zip-large',
        `S.lib.zip={name:"novelai-images-2026-10-20.zip",items:${JSON.stringify(large.map((entry, i) => ({ ...referenceEntries[i % 12], id: i, dup: entry.duplicate })))},picked:Array.from({length:57},(_,i)=>i)}`,
      );
      await h.click('取消', 'document.querySelector("dialog[open]")');
      let release;
      const originalCards = commandHandlers['library.cards'];
      replace('library.cards', async (...args) => {
        if (args[0]?.view !== 'trash')
          await new Promise((resolve) => {
            release = resolve;
          });
        return originalCards(...args);
      });
      try {
        window.webContents.send('studio:command-event', {
          type: 'workbench',
          source: 'ui',
          session: await invoke('workbench.session'),
          libraryChanged: true,
        });
        await h.until(() => !!release, '截图等待卡片加载');
        window.webContents.send('studio:command-event', {
          type: 'progress',
          topic: 'library:cards-progress',
          data: { completed: 608, total: 1520, phase: 'building' },
        });
        await h.wait('document.body.innerText.includes("正在整理图片库")');
        await capture('cache-progress', 'S.lib.zip=null;S.lib.reindex={done:608,total:1520}');
      } finally {
        release?.();
      }
    } finally {
      for (const [name, handler] of replaced) commandHandlers[name] = handler;
    }
    await fs.writeFile(
      path.join(output, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>图片库对照</title><style>body{margin:20px;font:14px sans-serif}img{width:100%;display:block}section{margin:30px 0}</style><h1>左：原型 · 右：软件</h1>${shots.map((id) => `<section><h2>${id}</h2><a href="${id}.png"><img src="${id}.png"></a></section>`).join('')}`,
    );
  } finally {
    reference.destroy();
  }
}
