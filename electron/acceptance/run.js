import { hoverChecks } from './hover.js';
import { clientChecks } from './client.js';
import { workbenchChecks } from './workbench.js';
import { interactionCorrectionChecks } from './interactionCorrections.js';
import { libraryPolishChecks, workbenchPolishChecks } from './polish.js';
import { libraryInteractionChecks, workbenchInteractionChecks } from './interactions.js';
import { libraryNamingChecks } from './libraryNaming.js';
import { libraryCopyChecks } from './libraryCopy.js';
import { libraryChecks } from './library.js';
import { motionChecks, applyMotionBaseline } from './motion.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { clipboard, nativeTheme, safeStorage } from 'electron';
import { pathToFileURL } from 'node:url';
import { importLibraryFiles } from '../importer.js';
import { harness } from './harness.js';
import { settingsChecks } from './settings.js';
import { componentChecks } from './components.js';
import { uiPolishChecks } from './uiPolish.js';
import { shortcutChecks } from './shortcuts.js';
import { preserveClipboard } from './clipboard.js';
import { cardCacheChecks } from './cardCache.js';

export async function runAcceptance(context) {
  if (context.mode.libraryBenchmark) {
    const { runLibraryBenchmark } = await import('./libraryBenchmark.js');
    return runLibraryBenchmark(context);
  }
  const { app, mode, database, assetsDirectory, preferences, createWindow } = context;
  const checks = [];
  mode.screenshots = [];
  const started = Date.now();
  // These focused scenarios never invoke copy/paste; leave every clipboard format untouched.
  const restoreClipboard = ['图片库·细节', '工作台·细节', '基础组件·细节', '基础组件'].includes(
    mode.category,
  )
    ? null
    : preserveClipboard(clipboard);
  const previousTheme = nativeTheme.themeSource;
  const files = (await fs.readdir(path.join(mode.root, 'fixtures')))
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => path.join(mode.root, 'fixtures', f));
  let window;
  let h;
  const snapshot = () =>
    JSON.stringify({
      library: database.loadLibrary('all'),
      trash: database.loadLibrary('trash'),
      collections: database.listCollections(),
      dictionary: database.listTagDictionary({ limit: 10000 }),
    });
  try {
    if (mode.phase === 0) {
      if (mode.needsLibrary !== false) {
        const imported = await importLibraryFiles({ filePaths: files, database, assetsDirectory });
        if (imported.errors.length || imported.imported.length !== files.length)
          throw Error('演示图片导入失败');
        const projects = database.loadLibrary('all');
        database.createCollection({ id: 'acceptance', name: '验收收藏集', kind: 'manual' });
        database.updateCollectionProjects('acceptance', [projects[0].id]);
        if (projects.length > 1) database.updateProjects([projects.at(-1).id], { deleted: true });
      }
      if (mode.needsDictionary !== false)
        database.upsertTagDictionary(
          Array.from({ length: 205 }, (_, i) => ({
            tag: `acceptance_${String(i).padStart(3, '0')}`,
            translation: `验收译文${i}`,
            category: i % 2 ? 'Clothing' : 'Body',
            translation_source: i % 2 ? 'ai' : 'manual',
            category_source: i % 2 ? 'ai' : 'manual',
          })),
        );
    }
    window = createWindow();
    const overlays = [];
    if (process.platform === 'win32') {
      const original = window.setTitleBarOverlay.bind(window);
      window.setTitleBarOverlay = (value) => {
        overlays.push(value);
        return original(value);
      };
    }
    mode.themeDriver = {
      get: () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'),
      set: (theme) => {
        nativeTheme.themeSource = theme;
      },
    };
    nativeTheme.themeSource = 'light';
    h = harness(window, mode, checks);
    const { evaluate: e, wait, check, click, section, font } = h;
    const blockedRequests = [];
    window.webContents.session.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (request, callback) => {
        const allowed = new URL(request.url).origin === new URL(mode.baseUrl).origin;
        if (!allowed) blockedRequests.push(request.url);
        callback({ cancel: !allowed });
      },
    );
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setCPUThrottlingRate', {
      rate: mode.slow || 1,
    });
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
      enabled: true,
    });
    await new Promise((resolve, reject) => {
      window.webContents.once('did-finish-load', resolve);
      window.webContents.once('did-fail-load', (_event, code, message) =>
        reject(Error(`${code} ${message}`)),
      );
    });
    await wait('!!document.querySelector(".studio-titlebar") && !!window.studio');
    h.dualThemes(true);
    if (mode.phase === 0) await applyMotionBaseline(h, mode);
    if (mode.reducedMotion)
      await check(
        '进程级系统减少动态效果已启用（未使用 CDP）',
        "matchMedia('(prefers-reduced-motion: reduce)').matches",
        undefined,
        'once',
      );
    await check(
      '验收启动仍使用正常渲染器，无额外控制接口',
      'window.studioScreenshot === undefined && window.studioAcceptance === undefined && typeof require === "undefined"',
      undefined,
      'once',
    );
    await check(
      '所有用户路径位于临时目录',
      () =>
        ['userData', 'sessionData', 'logs', 'crashDumps'].every((name) =>
          app.getPath(name).startsWith(mode.root + path.sep),
        ),
      undefined,
      'once',
    );
    await check(
      'SQLite 已打开且演示图库可读',
      () =>
        database.loadLibrary('all').length >=
        (mode.needsLibrary === false ? 0 : Math.min(files.length, 13)),
      undefined,
      'once',
    );
    if (!mode.packaged && (!mode.category || mode.category === '全部')) {
      await check(
        '卡片 IPC 保留所有视图、图片宽高并移除完整元数据',
        `(async () => {
      for (const view of ['all', 'favorites', 'trash']) {
        const full = await window.studio.loadLibrary(view);
        const cards = await window.studio.loadLibraryCards(view);
        if (JSON.stringify(cards.map(p => p.id)) !== JSON.stringify(full.map(p => p.id))) return false;
        if (!cards.every((p, i) => p.metadata.width === full[i].metadata.width && p.metadata.height === full[i].metadata.height && !('prompt_structure' in p) && !('extra_json' in p.metadata))) return false;
      }
      return true;
    })()`,
        undefined,
        'once',
      );
      await check(
        '详情 IPC 与旧列表逐项一致，缺失图片返回 null',
        `(async () => {
      const full = [...await window.studio.loadLibrary(), ...await window.studio.loadLibrary('trash')];
      for (const p of full) if (JSON.stringify(await window.studio.loadLibraryDetail(p.id)) !== JSON.stringify(p)) return false;
      return await window.studio.loadLibraryDetail('missing-acceptance-image') === null;
    })()`,
        undefined,
        'once',
      );
      await check(
        '持久缓存和热缓存经过真实 IPC 返回逐项一致的卡片',
        `(async () => {
        for (const view of ['all', 'favorites', 'trash']) {
          const first = await window.studio.loadLibraryCards(view);
          const second = await window.studio.loadLibraryCards(view);
          if (JSON.stringify(first) !== JSON.stringify(second)) return false;
        }
        return true;
      })()`,
        undefined,
        'once',
      );
      if (mode.phase === 0) {
        const cacheProbe = (await database.loadLibraryCards())[0];
        database.updateProjectName(cacheProbe.id, `${cacheProbe.name} cache probe`);
        await check(
          '卡片缓存命中时，重命名通过 IPC 立即可见',
          `(async () => (await window.studio.loadLibraryCards()).find(p => p.id === ${JSON.stringify(cacheProbe.id)}).name === ${JSON.stringify(`${cacheProbe.name} cache probe`)})()`,
          undefined,
          'once',
        );
        database.updateProjectName(cacheProbe.id, cacheProbe.name);
        await cardCacheChecks({ database, h, mode, cardCacheControl: context.cardCacheControl });
      }
    }
    if (mode.packaged) {
      await check('正在运行真正的打包程序', () => app.isPackaged === true, undefined, 'once');
      await check(
        '渲染页面来自目录包内部',
        () =>
          window.webContents.getURL() ===
          pathToFileURL(path.join(app.getAppPath(), 'dist', 'index.html')).href,
        undefined,
        'once',
      );
    }
    const overlayCheck = async (label) => {
      if (process.platform !== 'win32') return;
      const tokens = await e(
        `(() => {const s=getComputedStyle(document.documentElement);return {color:s.getPropertyValue('--pane').trim(),symbolColor:s.getPropertyValue('--text').trim()}})()`,
      );
      await h.until(
        () =>
          overlays.at(-1)?.color === tokens.color &&
          overlays.at(-1)?.symbolColor === tokens.symbolColor,
        label,
      );
      await check(
        label,
        () =>
          overlays.at(-1)?.color === tokens.color &&
          overlays.at(-1)?.symbolColor === tokens.symbolColor,
        undefined,
        'both',
      );
    };
    const environment = {
      ...context,
      h,
      files,
      overlays,
      snapshot,
      encrypted: safeStorage.isEncryptionAvailable(),
    };
    const fontChecks = async () => {
      await font('.studio-titlebar nav button .nps-button-label', 'MiSans');
      await font('.settings-about-name', 'Newsreader');
      await e(
        `(() => { const p=document.createElement('p'); p.id='acceptance-font-mono';p.style.fontFamily='var(--font-mono)';p.textContent='blue_hair 1.25';document.querySelector('.settings-about-head').append(p) })()`,
      );
      await font('#acceptance-font-mono', 'IBM Plex Mono');
      await e('document.querySelector("#acceptance-font-mono").remove()');
    };
    const shellChecks = async () => {
      h.dualThemes(false);
      for (const theme of ['light', 'dark']) {
        nativeTheme.themeSource = theme;
        h.category(`外壳·${theme}`);
        await section('外观');
        await click(theme === 'light' ? '浅色' : '深色');
        await wait(`document.documentElement.dataset.theme === '${theme}'`);
        await check(
          '主题应用到新旧页面',
          `document.documentElement.dataset.theme === '${theme}' && document.documentElement.dataset.themeMode === '${theme}'`,
          undefined,
          'both',
        );
        await overlayCheck('标题栏覆盖层参数与当前令牌一致');
        for (const name of ['工作台', '图片库', '设置']) {
          await click(name, 'document.querySelector(".studio-titlebar")');
          await wait(
            `document.querySelector('.studio-titlebar [aria-current=page]')?.textContent.trim() === ${JSON.stringify(name)} || document.querySelector('.studio-titlebar [aria-current=page]')?.getAttribute('aria-label') === ${JSON.stringify(name)}`,
          );
          await check(
            `导航 ${name} 当前项样式与旧竖栏移除`,
            `(() => {const e=document.querySelector('.studio-titlebar [aria-current=page]');return getComputedStyle(e).fontWeight === getComputedStyle(e).getPropertyValue('--fw-strong').trim() && !document.querySelector('.app-sidebar')})()`,
            undefined,
            'both',
          );
        }
        await section('关于与更新');
        await fontChecks();
        await h.screenshot(`about-${theme}`);
      }
      if (!mode.packaged) {
        h.category('外壳');
        await section('外观');
        await e(
          `(() => { const group=document.querySelector('[role=radiogroup][aria-label="主题"]'); for(const name of ['浅色','深色','浅色','深色']) [...group.querySelectorAll('button')].find(b=>b.textContent.trim()===name).click() })()`,
        );
        await wait('document.documentElement.dataset.theme === "dark"');
        await check(
          '快速主题切换保留最后选择',
          () => preferences.appearanceSettings().themeMode === 'dark',
          undefined,
          'once',
        );
        await overlayCheck('快速切换后标题栏采用最后主题令牌');
        for (const finalTheme of ['light', 'dark']) {
          await e(
            `(() => { const group=document.querySelector('[role=radiogroup][aria-label="主题"]'); const names=${JSON.stringify(finalTheme === 'dark' ? ['浅色', '深色'] : ['深色', '浅色'])}; for(let i=0;i<20;i++) [...group.querySelectorAll('button')].find(b=>b.textContent.trim()===names[i%2]).click() })()`,
          );
          await wait(`document.documentElement.dataset.theme === '${finalTheme}'`);
          await check(
            `连续切换 20 次保留最后选择 ${finalTheme}`,
            () => preferences.appearanceSettings().themeMode === finalTheme,
            undefined,
            'once',
          );
          await overlayCheck(`连续切换 20 次后标题栏采用最后主题 ${finalTheme} 的令牌`);
        }
        await click('跟随系统', 'document.querySelector("[role=radiogroup][aria-label=主题]")');
        for (const theme of ['light', 'dark']) {
          nativeTheme.themeSource = theme;
          await wait(`document.documentElement.dataset.theme === '${theme}'`);
          await check(
            `跟随系统响应 ${theme}`,
            `document.documentElement.dataset.themeMode === '${theme}'`,
            undefined,
            'both',
          );
          await overlayCheck(`跟随系统 ${theme} 时标题栏令牌同步`);
        }
        h.dualThemes(true);
        await motionChecks(h);
        await applyMotionBaseline(h, mode);
        await section('外观');
        window.showInactive();
        window.maximize();
        await new Promise((resolve) => setTimeout(resolve, 300));
        await check(
          'BrowserWindow 确实进入最大化状态',
          () => window.isMaximized(),
          undefined,
          'once',
        );
        await check(
          '最大化后内容与标题栏不重叠，设置不被覆盖',
          `(() => {const bar=document.querySelector('.studio-titlebar').getBoundingClientRect(),body=document.querySelector('.studio-settings').getBoundingClientRect(),settings=document.querySelector('.studio-titlebar [aria-label="设置"]').getBoundingClientRect(),controls=document.querySelector('.studio-window-controls').getBoundingClientRect();return body.top>=bar.bottom-1 && settings.right<=controls.left+1 && settings.bottom<=bar.bottom})()`,
          undefined,
          'both',
        );
        window.unmaximize();
        window.hide();
        await section('外观');
        await click('跟随系统');
        nativeTheme.themeSource = 'light';
        await wait(`document.documentElement.dataset.theme === 'light'`);
        h.dualThemes(true);
      }
    };
    if (mode.packaged) {
      await clientChecks(environment);
      h.category('安装包');
      const { default: sharp } = await import('sharp');
      await check(
        '包内 sharp 与 libvips 能加载并处理图片',
        async () => {
          const { info } = await sharp(files[0])
            .resize(1, 1)
            .png()
            .toBuffer({ resolveWithObject: true });
          return !!sharp.versions.vips && info.width === 1 && info.height === 1;
        },
        undefined,
        'once',
      );
      await section('关于与更新');
      await fontChecks();
      await h.screenshot('packaged-fonts');
    } else if (mode.category && mode.category !== '全部') {
      h.dualThemes(true);
      if (mode.category === '减少动态效果') {
        await shellChecks();
        await libraryChecks(environment);
        await settingsChecks(environment, false);
        await workbenchInteractionChecks(environment);
        await interactionCorrectionChecks(environment);
        await componentChecks(environment);
      } else if (mode.category === '诊断·计时') {
        h.category('诊断·计时');
        await h.checkSoon(
          '人为延迟的反馈仍然完成',
          'performance.now() >= window.feedbackReadyAt',
          1,
          'window.feedbackReadyAt = performance.now() + 50;',
          undefined,
          'once',
        );
      } else if (mode.category === '客户端边界') await clientChecks(environment);
      else if (mode.category === '悬停态覆盖') await hoverChecks(environment);
      else if (mode.category === '外壳') await shellChecks();
      else if (mode.category === '工作台') await workbenchChecks(environment);
      else if (mode.category === '工作台·细节') await workbenchPolishChecks(environment);
      else if (mode.category === '工作台·交互') await workbenchInteractionChecks(environment);
      else if (mode.category === '交互修正') await interactionCorrectionChecks(environment);
      else if (mode.category === '图片库·交互') await libraryInteractionChecks(environment);
      else if (mode.category === '图片库·细节') await libraryPolishChecks(environment);
      else if (mode.category === '图片库·起名') await libraryNamingChecks(environment);
      else if (mode.category === '图片库·复制') await libraryCopyChecks(environment);
      else if (['图片库', '图片库·导入', '图片库·收尾', '图片库·滚动条'].includes(mode.category))
        await libraryChecks(environment);
      else if (mode.category.startsWith('设置')) await settingsChecks(environment, false);
      else if (mode.category === '基础组件') await componentChecks(environment);
      else if (mode.category === '基础组件·细节') await uiPolishChecks(environment);
      else if (mode.category === '卡片缓存') await cardCacheChecks(environment);
      else if (mode.category === '外壳·快捷键') await shortcutChecks(environment);
      else if (mode.category === '动效') {
        h.category('外壳·动效');
        await section('外观');
        await motionChecks(h);
      } else if (mode.category === '诊断') {
        h.category('诊断');
        await h.wait('false', '人为制造等待超时', 50);
      } else if (mode.category === '诊断·渲染器') {
        h.category('诊断·渲染器');
        await e('new Promise(() => {})', '人为制造未完成的渲染求值');
      }
    } else if (mode.phase > 0) {
      h.dualThemes(true);
      h.category('数据');
      await check(
        '跨进程重启保留图库、收藏集、回收站和词典全部内容',
        async () =>
          snapshot() === (await fs.readFile(path.join(mode.root, 'snapshot.json'), 'utf8')),
        undefined,
        'once',
      );
      await settingsChecks(environment, true);
    } else {
      await clientChecks(environment);
      await hoverChecks(environment);
      await shellChecks();
      if (!mode.packaged) {
        await workbenchChecks(environment);
        await shortcutChecks(environment);
        await libraryNamingChecks(environment);
        await libraryChecks(environment);
        await settingsChecks(environment, false);
        await libraryPolishChecks(environment);
        await workbenchPolishChecks(environment);
        await libraryInteractionChecks(environment);
        await workbenchInteractionChecks(environment);
        await interactionCorrectionChecks(environment);
        await uiPolishChecks(environment);
        await componentChecks(environment);
        await fs.writeFile(path.join(mode.root, 'snapshot.json'), snapshot());
      }
    }
    h.category('隔离');
    await check('验收运行没有请求外部网络', () => blockedRequests.length === 0, undefined, 'once');
    if (checks.some((item) => item.status === 'failed'))
      throw Object.assign(Error('验收存在失败断言，详见检查清单'), { summary: true });
  } catch (error) {
    console.error(error);
    if (!error.summary)
      checks.push({
        category: '运行',
        label: '操作与等待完成',
        status: 'failed',
        themeScope: 'once',
        error: String(error),
        context: await h?.evaluate('document.body.innerText.slice(-8000)').catch(() => ''),
      });
    await h?.screenshot(`failure-${mode.phase}`).catch(() => {});
    throw error;
  } finally {
    if (restoreClipboard) {
      let restored = restoreClipboard();
      const immediate = restored;
      // Windows clipboard ownership may settle on the next message-loop turn.
      // Write once; only reread, so a delayed check never overwrites another app.
      for (let attempt = 0; !restored && attempt < 10; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        restored = restoreClipboard.verify();
      }
      checks.push({
        category: '隔离',
        label: '恢复运行前剪贴板内容',
        status: restored ? 'passed' : 'failed',
        themeScope: 'once',
        details: { immediate, ...restoreClipboard.details() },
      });
    }
    nativeTheme.themeSource = previousTheme;
    await fs.writeFile(
      path.join(mode.output, `checks-${mode.phase}.json`),
      JSON.stringify(
        {
          platform: process.platform,
          phase: mode.phase,
          durationMs: Date.now() - started,
          checks,
          screenshots: mode.screenshots,
        },
        null,
        2,
      ),
    );
    window?.destroy();
  }
}
