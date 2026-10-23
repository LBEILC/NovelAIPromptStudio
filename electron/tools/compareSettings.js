import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, session } from 'electron';
import sharp from 'sharp';

// Reuses the screenshot harness's disposable profile and offline service doubles.
export async function compareSettings({
  app,
  window,
  h,
  invoke,
  generationService,
  mode,
  commandHandlers,
}) {
  const source = path.resolve(process.env.NPS_COMPARE_SETTINGS_DIR);
  const root = app.getAppPath();
  const output = path.join(root, '.codex-runs', 'compare-settings');
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
  const html = `<!doctype html><html lang="zh-CN" data-theme="light" data-motion="off"><head>
    <base href="${url(path.join(source, 'design'))}/">
    ${styles.map((name) => `<link rel="stylesheet" href="${url(path.join(source, 'design', `${name}.css`))}">`).join('')}
    <link rel="stylesheet" href="${url(path.join(root, 'node_modules/remixicon/fonts/remixicon.css'))}">
    <style>
    @font-face{font-family:'NPS MiSans';src:url('${url(path.join(root, '.local/fonts/MiSansVF.ttf'))}')}
    @font-face{font-family:'Newsreader';src:url('${url(path.join(root, 'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2'))}');font-weight:400 500}
    @font-face{font-family:'IBM Plex Mono';src:url('${url(path.join(root, 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'))}')}
    .win{margin:0;border:0;border-radius:0;box-shadow:none;width:100vw;height:100vh}.pv-notes{display:none}
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
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false,
      offscreen: true,
    },
  });
  const shots = [];
  const networkSession = session.fromPartition('studio-network');
  const originalFetch = networkSession.fetch.bind(networkSession);
  networkSession.fetch = async (input, options) => {
    const address = new URL(
      typeof input === 'string' || input instanceof URL ? String(input) : input.url,
    );
    if (address.origin === 'https://api.example.com') {
      return new Response(
        JSON.stringify(
          address.pathname.endsWith('/models')
            ? {
                data: ['claude-haiku-5-5', 'gpt-5-mini', 'deepseek-chat', 'qwen-plus'].map(
                  (id) => ({ id }),
                ),
              }
            : { choices: [{ message: { content: 'OK' } }] },
        ),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    return originalFetch(input, options);
  };
  try {
    await reference.loadFile(file);
    const sources = await Promise.all(
      [
        '.codex-runs/morphdom-2.7.4.js',
        'design/preview-logo.js',
        'design/prototype.js',
        'design/prototype-lib.js',
        'design/prototype-set.js',
        'design/prototype-fill.js',
      ].map((name) => fs.readFile(path.join(source, name), 'utf8')),
    );
    await reference.webContents.executeJavaScript(
      sources.join('\n') + '\nroot.dataset.motion="off";S.page="set";S.set.motion="off";paint();',
    );
    const setup = await invoke('agent.setup');
    if (!path.resolve(setup.path).startsWith(path.resolve(mode.root) + path.sep))
      throw Error('Screenshot installation must stay inside the disposable profile');
    await invoke('agent.install');
    const ai = await invoke('settings.ai.get');
    await invoke('settings.ai.save', {
      settings: {
        ...ai,
        baseUrl: 'https://api.example.com/v1',
        model: 'claude-haiku-5-5',
        apiKey: 'screenshot-key',
      },
    });
    const dictionary = await invoke('dictionary.list', { all: true });
    const categories = {
      ArtistEra: 'artist-era',
      Subject: 'subject',
      Identity: 'identity',
      Body: 'body',
      Clothing: 'clothing',
      Action: 'action',
      Environment: 'environment',
      Composition: 'composition',
      StyleQuality: 'style',
      Unsorted: 'unsorted',
    };
    const rows = dictionary.items.map((item, i) => ({
      id: i + 1,
      en: (item.display_tag || item.tag).replaceAll('_', ' '),
      zh: item.translation,
      cat: categories[item.category] || 'unsorted',
      n: item.image_count || 0,
      src: [item.translation_source, item.category_source].includes('manual')
        ? 'user'
        : [item.translation_source, item.category_source].includes('ai')
          ? 'ai'
          : 'builtin',
      t: i,
      ts: i,
    }));
    const storage = await invoke('storage.get');
    const databaseLocation = await invoke('storage.database');
    const backupFile = path.join(databaseLocation.directory, 'studio.pre-comparison.sqlite');
    if (!path.resolve(backupFile).startsWith(path.resolve(mode.root) + path.sep))
      throw Error('Screenshot backup must stay inside the disposable profile');
    await fs.writeFile(backupFile, 'Synthetic screenshot backup metadata');
    await fs.truncate(backupFile, 38 * 1024 * 1024);
    await reference.webContents.executeJavaScript(
      `S.set.dx.rows=${JSON.stringify(rows)};S.set.libPath=${JSON.stringify(storage.assetsDirectory)};paint();`,
    );
    await h.section('NovelAI 账号');
    await h.input('[aria-label="持久令牌"]', 'acceptance-token');
    await h.click('保存', 'document.querySelector("[data-settings-section=novelai]")');
    await h.wait('document.body.innerText.includes("10,000")');
    await reference.webContents.executeJavaScript(
      'S.anlas=10000;S.usage=12;S.set.autoUpd=false;paint();',
    );
    const ready = `(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()`;
    const capture = async (id, section, sec, dark = false, prepare) => {
      if (
        await h.evaluate(
          `document.documentElement.dataset.theme!==${JSON.stringify(dark ? 'dark' : 'light')}`,
        )
      ) {
        await h.section('外观');
        await h.click(dark ? '深色' : '浅色', 'document.querySelector("[aria-label=主题]")');
      }
      await h.section(section);
      await reference.webContents.executeJavaScript(
        `S.set.sec=${JSON.stringify(sec)};S.set.alt=${JSON.stringify(sec === 'storage')};S.pop=null;S.dialog=null;root.dataset.theme=${JSON.stringify(dark ? 'dark' : 'light')};paint();`,
      );
      await h.wait(
        `document.documentElement.dataset.theme===${JSON.stringify(dark ? 'dark' : 'light')}`,
      );
      if (prepare) await prepare();
      await h.wait('!document.querySelector(".nps-toast")');
      if (sec === 'storage') {
        const content = await h.evaluate(`({
          columns:[...document.querySelectorAll('[data-settings-section=storage] .settings-column')].map(n=>({path:n.querySelector('code')?.textContent,help:n.querySelector('small')?.textContent})),
          backup:[...document.querySelectorAll('[data-settings-section=storage] .settings-line')].find(n=>n.textContent.includes('升级前的备份'))?.querySelector('small')?.textContent
        })`);
        await reference.webContents.executeJavaScript(`(()=>{
          const data=${JSON.stringify(content)},cols=[...document.querySelectorAll('.setcol')];
          cols[0].querySelector('.path').textContent=data.columns[0].path;
          cols[0].querySelector('small').textContent=data.columns[0].help;
          cols[1].querySelector('.path').textContent=data.columns[1].path;
          [...document.querySelectorAll('.setrow')].find(n=>n.textContent.includes('升级前的备份')).querySelector('small').textContent=data.backup;
        })()`);
      }
      if (sec === 'agent') {
        await reference.webContents.executeJavaScript(
          `S.set.alt=${JSON.stringify(!setup.onPath)};paint();document.querySelector('.set .setrow .path').textContent=${JSON.stringify(path.dirname(setup.path))}`,
        );
      }
      await Promise.all([h.evaluate(ready), reference.webContents.executeJavaScript(ready)]);
      // Force a fresh frame in the hidden reference window after theme/overlay changes.
      await reference.webContents.executeJavaScript(
        'document.getAnimations().forEach(a=>a.finish())',
      );
      reference.webContents.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const [a, b] = await Promise.all([
        reference.webContents.capturePage(),
        window.webContents.capturePage(),
      ]);
      const left = await sharp(a.toPNG()).resize(1240, 760).png().toBuffer();
      const right = await sharp(b.toPNG()).resize(1240, 760).png().toBuffer();
      await fs.writeFile(path.join(output, `${id}-reference.png`), left);
      await fs.writeFile(path.join(output, `${id}-app.png`), right);
      await sharp({ create: { width: 2480, height: 760, channels: 4, background: '#fff' } })
        .composite([
          { input: left, left: 0, top: 0 },
          { input: right, left: 1240, top: 0 },
        ])
        .png()
        .toFile(path.join(output, `${id}.png`));
      shots.push(id);
      console.log(`Settings comparison: ${id}`);
    };
    for (const [id, section, sec] of [
      ['appearance', '外观', 'look'],
      ['storage', '图片库', 'storage'],
      ['account', 'NovelAI 账号', 'acct'],
      ['ai', 'AI 服务', 'ai'],
      ['dictionary', '翻译词典', 'dict'],
      ['agent', 'Agent', 'agent'],
      ['about', '关于与更新', 'about'],
    ])
      await capture(id, section, sec);
    await capture('account-dark', 'NovelAI 账号', 'acct', true);
    await capture('account-confirm', 'NovelAI 账号', 'acct', false, async () => {
      await h.click('无人值守连续生成');
      await h.wait('!!document.querySelector("dialog[open]")');
      await reference.webContents.executeJavaScript('ACT.unattended();paint();');
    });
    await h.click('取消', 'document.querySelector("dialog[open]")');
    generationService.state.usage = 100;
    await invoke('account.refresh');
    await reference.webContents.executeJavaScript('S.usage=100;paint();');
    await capture('account-exhausted', 'NovelAI 账号', 'acct');
    generationService.state.tier = 0;
    await invoke('account.refresh');
    await capture('account-unsubscribed', 'NovelAI 账号', 'acct', false, async () => {
      // The prototype has no tier fixture; substitute only the approved account content.
      await reference.webContents.executeJavaScript(`(()=>{
        const row=[...document.querySelectorAll('.setrow')].find(n=>n.firstElementChild?.firstChild?.textContent==='余额');
        row.querySelector('small').textContent='未订阅 · 每次生成都要花 Anlas';
        [...document.querySelectorAll('.setcol')].find(n=>n.firstElementChild?.textContent==='V5 免费用量')?.remove();
      })()`);
    });
    generationService.state.tier = 3;
    generationService.state.usage = 12;
    await invoke('account.refresh');
    await reference.webContents.executeJavaScript('S.usage=12;paint();');
    await capture('ai-models', 'AI 服务', 'ai', false, async () => {
      await h.click('重新读取模型列表');
      await h.wait(
        'document.querySelector("[aria-label=模型列表]")?.textContent.includes("claude-haiku-5-5") && !document.querySelector("[aria-busy=true]")',
      );
      await h.click('模型列表');
      await reference.webContents.executeJavaScript('S.pop="smodel";paint();');
    });
    await h.key('Escape');
    await capture('ai-key', 'AI 服务', 'ai', false, async () => {
      await h.click('更换');
      await reference.webContents.executeJavaScript('S.set.ai.keyEdit=true;paint();');
    });
    await h.click('取消', 'document.querySelector("[data-settings-section=ai]")');
    await reference.webContents.executeJavaScript('S.set.ai.keyEdit=false;paint();');
    await capture('ai-tested', 'AI 服务', 'ai', false, async () => {
      await h.click('测试连接');
      await h.wait(
        'document.querySelector(".settings-page-foot")?.textContent.includes("连接正常")',
      );
      await reference.webContents.executeJavaScript('S.set.tested=true;paint();');
    });
    await capture('about-update', '关于与更新', 'about', false, async () => {
      const notes = await reference.webContents.executeJavaScript('RELEASE_NOTES');
      const status = await invoke('updates.status');
      window.webContents.send('studio:command-event', {
        type: 'updates',
        data: {
          ...status,
          packaged: true,
          phase: 'available',
          hasUpdate: true,
          latestVersion: notes.version,
          structuredNotes: notes,
          canDownloadUpdate: true,
        },
      });
      await h.wait('!!document.querySelector(".rn")');
      await reference.webContents.executeJavaScript('S.set.upd="found";paint();');
    });
    for (const [id, title] of [
      ['about-shortcuts', '快捷键'],
      ['about-privacy', '数据与隐私'],
    ]) {
      await capture(id, '关于与更新', 'about', false, async () => {
        const scrollToHeading = (selector, headingSelector) => `(()=>{
          const sc=document.querySelector(${JSON.stringify(selector)});
          const heading=[...sc.querySelectorAll('h2')].find(n=>n.textContent===${JSON.stringify(title)});
          sc.scrollTop+=heading.getBoundingClientRect().top-sc.getBoundingClientRect().top-sc.querySelector(${JSON.stringify(headingSelector)}).getBoundingClientRect().height;
        })()`;
        await h.evaluate(
          scrollToHeading(
            '.settings-page.settings-scroll:has(.settings-about-head)',
            '.settings-page-head',
          ),
        );
        await reference.webContents.executeJavaScript(scrollToHeading('.set-scroll', '.set-head'));
      });
    }
    await capture('dictionary-edit', '翻译词典', 'dict', false, async () => {
      await h.evaluate('document.querySelector("tr[data-tag] td:nth-child(3) button").click()');
      await h.wait('!!document.querySelector(\'[aria-label="译文"]\')');
      await reference.webContents.executeJavaScript('ACT.dxEdit(dxRows()[0].id);');
    });
    await h.key('Escape');
    await capture('dictionary-selection', '翻译词典', 'dict', false, async () => {
      await h.evaluate(
        '[...document.querySelectorAll("tr[data-tag]")].slice(0,2).forEach(r=>r.querySelector("[role=checkbox]").click())',
      );
      await reference.webContents.executeJavaScript(
        'S.set.dx.edit=null;S.set.dx.picked=dxRows().slice(0,2).map(r=>r.id);paint();',
      );
    });
    await capture('dictionary-confirm', '翻译词典', 'dict', false, async () => {
      await h.click('用 AI 重新翻译');
      await reference.webContents.executeJavaScript('ACT.dxRetrans();paint();');
    });
    await h.click('取消', 'document.querySelector("dialog[open]")');
    const replaced = new Map();
    const replace = (name, handler) => {
      if (!replaced.has(name)) replaced.set(name, commandHandlers[name]);
      commandHandlers[name] = handler;
    };
    try {
      replace('settings.ai.get', () => ({
        ...ai,
        baseUrl: 'https://api.example.com/v1',
        model: 'claude-haiku-5-5',
        encryptionAvailable: false,
      }));
      const saveAI = commandHandlers['settings.ai.save'];
      replace('settings.ai.save', async (input, context) => ({
        ...(await saveAI(input, context)),
        encryptionAvailable: false,
      }));
      replace('ai.models', () => ({ ok: false, error: '这个服务不提供模型列表' }));
      replace('ai.test', () => ({ ok: false, error: '401 · API Key 无效' }));
      await h.reload();
      await capture('ai-exceptions', 'AI 服务', 'ai', false, async () => {
        await h.click('重新读取模型列表');
        await h.wait('!!document.querySelector(\'input[aria-label="模型"]\')');
        await h.click('测试连接');
        await h.wait('document.querySelector(".settings-page-foot")?.textContent.includes("失败")');
        await reference.webContents.executeJavaScript(
          'S.set.alt=true;S.set.tested=false;S.set.aiFailed=true;paint();',
        );
      });
      replace('agent.setup', () => ({ ...setup, installed: true, onPath: false }));
      replace('agent.install', () => ({
        ok: false,
        error:
          '没有权限写入命令所在的文件夹。可以用有权限的账号重试，或把 nai-studio 放进 PATH 里的任意文件夹。',
      }));
      await h.reload();
      await capture('agent-exceptions', 'Agent', 'agent', false, async () => {
        await h.click('重新安装');
        await h.wait('document.body.innerText.includes("安装失败")');
        await reference.webContents.executeJavaScript(
          'S.set.alt=true;S.set.agentFail=true;paint();',
        );
      });
      const status = await invoke('updates.status');
      replace('updates.status', () => ({
        ...status,
        phase: 'current',
        hasUpdate: false,
        error: '',
      }));
      replace('updates.check', () => ({ ok: false, error: '无法连接到 GitHub' }));
      await h.reload();
      await capture('about-failed', '关于与更新', 'about', false, async () => {
        await h.click('检查更新');
        await h.wait('document.body.innerText.includes("检查更新失败")');
        await reference.webContents.executeJavaScript('S.set.alt=true;S.set.upd="";paint();');
      });
      const release = await reference.webContents.executeJavaScript('RELEASE_NOTES');
      replace('updates.status', () => ({
        ...status,
        platform: 'darwin',
        packaged: true,
        phase: 'available',
        hasUpdate: true,
        latestVersion: release.version,
        structuredNotes: release,
        canDownloadUpdate: false,
        updateMode: 'manual',
        error: '',
      }));
      await h.reload();
      await capture('about-macos', '关于与更新', 'about', false, async () => {
        await h.wait('document.body.innerText.includes("前往下载页")');
        await reference.webContents.executeJavaScript('S.set.alt=true;S.set.upd="found";paint();');
      });
    } finally {
      for (const [name, handler] of replaced) commandHandlers[name] = handler;
    }
    await fs.writeFile(
      path.join(output, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>032 C 设置对照</title><style>body{margin:24px;background:#eee;font-family:system-ui}img{width:100%}h2{font-size:18px}</style><p>左：原型；右：软件。全部数据来自临时截图环境。</p>${shots.map((id) => `<h2>${id}</h2><a href="${id}.png"><img src="${id}.png"></a>`).join('')}`,
    );
    await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ shots }, null, 2));
  } finally {
    networkSession.fetch = originalFetch;
    reference.destroy();
  }
}
