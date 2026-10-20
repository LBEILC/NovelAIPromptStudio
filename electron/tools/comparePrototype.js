import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, nativeTheme } from 'electron';
import sharp from 'sharp';
import { createPromptDocument } from '../../src/lib/promptDocument.ts';
import { hasImageName } from '../../src/lib/imageNaming.js';
import { modelDisplayName } from '../../src/library/presentation.ts';

// Both windows use disposable screenshot data; the reference is loaded locally.
export async function comparePrototype({ app, window, h, invoke, cli }) {
  const root = app.getAppPath();
  const output = path.join(root, '.codex-runs', 'compare');
  await fs.mkdir(output, { recursive: true });
  const url = (file) => pathToFileURL(path.resolve(root, file)).href;
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
  const html = `<!doctype html><html lang="zh-CN" data-theme="light" data-motion="off"><head><base href="${url('design/')}">${styles.map((name) => `<link rel="stylesheet" href="${url(`design/${name}.css`)}">`).join('')}<link rel="stylesheet" href="${url('node_modules/remixicon/fonts/remixicon.css')}"><style>
  @font-face{font-family:'NPS MiSans';src:url('${url('.local/fonts/MiSansVF.ttf')}')} @font-face{font-family:'Newsreader';src:url('${url('node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2')}');font-weight:400 500} @font-face{font-family:'IBM Plex Mono';src:url('${url('node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2')}')} .win{margin:0;border:0;border-radius:0;box-shadow:none;width:100vw;height:100vh} .pv-notes{display:none}
  </style></head><body><header class="proto-bar" hidden></header><div id="win" class="win"></div><div id="pv-notes" class="pv-notes"></div></body></html>`;
  const file = path.join(output, 'reference.html');
  await fs.writeFile(file, html);
  const session = await invoke('workbench.list');
  const series = {};
  const sizes = {};
  let key = 0;
  const doc = (project) => {
    const d = createPromptDocument(project);
    const tag = (t) => ({
      k: ++key,
      en: t.tag,
      zh: t.translation || '',
      w: t.weight === 1 ? '' : String(t.weight),
      cat:
        {
          ArtistEra: 'artist-era',
          Subject: 'subject',
          Identity: 'identity',
          Body: 'body',
          Clothing: 'clothing',
          Action: 'action',
          Environment: 'environment',
          Composition: 'composition',
          StyleQuality: 'style',
        }[t.category] || 'unsorted',
    });
    const blocks = (scope) =>
      scope?.blocks.map((b, i) =>
        b.type === 'tags'
          ? {
              id: `${scope.scope.key}-${i}`,
              type: 'tags',
              label: b.displayLabel || b.label,
              tags: b.tags.map((t) =>
                tag({ ...scope.scope.tags.find((x) => x.tag === t.tag), ...t }),
              ),
            }
          : {
              id: `${scope.scope.key}-${i}`,
              type: 'para',
              label: b.displayLabel || b.label,
              en: b.content,
              zh: b.translation || '',
            },
      ) || [];
    const base = d.scopes.find((s) => s.scope.key === 'base:prompt');
    const neg = d.scopes.find((s) => s.scope.key === 'base:undesired');
    return {
      blocks: blocks(base),
      neg: (neg?.scope.tags || []).map(tag),
      chars: d.scopes
        .filter((s) => s.scope.kind === 'character' && s.scope.polarity === 'prompt')
        .map((s) => ({
          id: s.scope.characterId,
          name: s.scope.label,
          blocks: blocks(s),
          neg: (
            d.scopes.find(
              (n) =>
                n.scope.kind === 'character' &&
                n.scope.characterId === s.scope.characterId &&
                n.scope.polarity === 'undesired',
            )?.scope.tags || []
          ).map(tag),
        })),
      size: [project.metadata.width, project.metadata.height],
    };
  };
  for (const entry of session.tabs) {
    const { tab } = await invoke('workbench.get', { tabId: entry.id });
    const tree = await invoke('version.list', { tabId: entry.id });
    const versions = [];
    for (const v of tree.versions) {
      const projects = [];
      if (!v.parentId) projects.push(v.project);
      for (const image of v.images.filter((i) => !i.deleted))
        projects.push((await invoke('library.get', { id: image.projectId })).project);
      const imgs = projects.map((p) => {
        const img = url(p.image_path);
        sizes[img] = [p.metadata.width, p.metadata.height];
        return img;
      });
      versions.push({
        id: v.id,
        parent: v.parentId,
        imgs,
        doc: doc(v.project),
        by: v.source === 'agent' ? 'agent' : undefined,
      });
    }
    const active = versions.find((v) => v.id === tab.versionId) || versions[0];
    series[entry.id] = {
      name: hasImageName(tab.project) ? tab.project.name : '',
      file: path.basename(tab.project.image_path),
      model: modelDisplayName(tab.project.metadata.model),
      versions,
      cur: { v: active.id, i: Math.max(0, active.imgs.indexOf(url(tab.project.image_path))) },
      draft: doc(tab.project),
      rev: 0,
      pool: active.imgs,
    };
  }
  const createReference = () =>
    new BrowserWindow({
      show: false,
      width: 1240,
      height: 760,
      useContentSize: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: true,
      webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false },
    });
  let reference = createReference();
  const shots = [];
  try {
    await reference.loadFile(file);
    reference.webContents.debugger.attach('1.3');
    const scripts = [
      '.codex-runs/morphdom-2.7.4.js',
      'design/preview-logo.js',
      'design/prototype.js',
      'design/prototype-lib.js',
      'design/prototype-set.js',
      'design/prototype-fill.js',
    ];
    const sources = await Promise.all(
      scripts.map((file) => fs.readFile(path.join(root, file), 'utf8')),
    );
    sources[2] = sources[2].replace(
      '`../demo/images/final/${n}.png`',
      'n.startsWith("file:") ? n : `../demo/images/final/${n}.png`',
    );
    await reference.webContents.executeJavaScript(
      sources.join('\n') + '\nroot.dataset.motion="off"; paint();',
    );
    await reference.webContents.executeJavaScript(
      `S.series=${JSON.stringify(series)};S.tabs=${JSON.stringify(session.tabs.map((t) => t.id))};S.tab=${JSON.stringify(session.activeTabId)};Object.assign(SIZE,${JSON.stringify(sizes)});S.anlas=10000;paint();`,
    );
    await h.section('外观');
    await h.click('跟随系统', 'document.querySelector("[aria-label=主题]")');
    await h.click('工作台', 'document.querySelector(".studio-titlebar")');
    await h.wait('!document.querySelector(".nps-toast")');
    await h.evaluate('document.activeElement?.blur()');
    const capture = async (name, state, dark = false) => {
      for (const theme of dark ? ['light', 'dark'] : ['light']) {
        nativeTheme.themeSource = theme;
        await h.wait(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`);
        await reference.webContents.executeJavaScript(
          `${state};S.lang="en";root.dataset.theme=${JSON.stringify(theme)};paint();`,
        );
        const caption = await h.evaluate(
          'document.querySelector(".wb-caption .wb-meta")?.textContent || document.querySelector(".wb-caption .meta")?.textContent || ""',
        );
        if (caption)
          await reference.webContents.executeJavaScript(
            `document.querySelector('.caption .meta').textContent=${JSON.stringify(caption)}`,
          );
        reference.showInactive();
        const ready = `(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.getClientRects().length).map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()`;
        await Promise.all([h.evaluate(ready), reference.webContents.executeJavaScript(ready)]);
        const [left, right] = await Promise.all([
          reference.webContents.debugger.sendCommand('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false,
          }),
          window.webContents.debugger.sendCommand('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false,
          }),
        ]);
        reference.hide();
        const ref = await sharp(Buffer.from(left.data, 'base64'))
          .resize(1240, 760)
          .png()
          .toBuffer();
        const product = await sharp(Buffer.from(right.data, 'base64'))
          .resize(1240, 760)
          .png()
          .toBuffer();
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
    await capture('workbench', 'S.page="wb"', true);
    const tabId = session.activeTabId;
    const tree = await invoke('version.list', { tabId });
    const compared = tree.versions.find((v) => v.parentId);
    const peekPoint = await h.evaluate(
      `(()=>{const n=document.querySelector('[data-version-id="${compared.id}"] .wb-version-row');n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+10}})()`,
    );
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...peekPoint,
      button: 'none',
    });
    await h.wait('!!document.querySelector(".wb-version-peek:popover-open")');
    await capture('workbench-difference', `S.verPeek=${JSON.stringify(compared.id)}`);
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 600,
      y: 50,
      button: 'none',
    });
    await h.evaluate('document.activeElement?.blur()');
    await h.key('Escape');
    await h.key('e', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
    await h.wait('!!document.querySelector(".wb-text-section textarea")');
    await capture('workbench-text', 'S.verPeek=null;S.editMode="text"', true);
    await h.key('e', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
    // The command runtime prepares every app window. Close the standalone reference
    // while the real CLI enqueues its task, then restore its reference-only state.
    const referenceState = await reference.webContents.executeJavaScript('JSON.stringify(S)');
    reference.destroy();
    const pending = await cli('generate.start', { tabId, count: 1 });
    reference = createReference();
    await reference.loadFile(file);
    reference.webContents.debugger.attach('1.3');
    await reference.webContents.executeJavaScript(
      sources.join('\n') +
        `\nObject.assign(S,${referenceState});Object.assign(SIZE,${JSON.stringify(sizes)});root.dataset.motion="off";paint();`,
    );
    await h.wait('document.body.innerText.includes("Agent 待确认 · 1")');
    await h.click('Agent 待确认 · 1');
    await h.wait('!!document.querySelector(".wb-agent-queue:popover-open")');
    await h.evaluate('document.activeElement?.blur()');
    await h.wait('!document.querySelector(".nps-toast")');
    await capture(
      'workbench-agent',
      `S.editMode="blocks";S.agentQueue=[{id:1,series:${JSON.stringify(tabId)},base:${JSON.stringify(series[tabId].cur.v)},add:[],rem:[],count:1}];S.pop="queue"`,
    );
    await invoke('generate.cancel', { ids: [pending.id] });
    await h.key('Escape');
    await reference.webContents.executeJavaScript('S.agentQueue=[];S.pop=null;paint()');
    if (!process.argv.includes('--compare-workbench-only')) {
      await h.click('图片库', 'document.querySelector(".studio-titlebar")');
      await h.wait('!!document.querySelector(".library-card")');
      await capture('library', 'S.page="lib"', true);
      for (const [key, label] of [
        ['look', '外观'],
        ['storage', '图片库'],
        ['acct', 'NovelAI 账号'],
        ['ai', 'AI 服务'],
        ['dict', '翻译词典'],
        ['agent', 'Agent'],
        ['about', '关于与更新'],
      ]) {
        await h.section(label);
        await capture(
          `settings-${key}`,
          `S.page="set";S.set.sec=${JSON.stringify(key)}`,
          key === 'acct',
        );
      }
    }
    await fs.writeFile(
      path.join(output, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>界面对照</title><style>body{margin:20px;font:14px sans-serif}img{width:100%;display:block}section{margin:30px 0}</style><h1>左：原型 · 右：软件</h1>${shots.map((id) => `<section><h2>${id}</h2><a href="${id}.png"><img src="${id}.png"></a></section>`).join('')}`,
    );
  } finally {
    if (!reference.isDestroyed()) reference.destroy();
  }
}
