import path from 'node:path';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { workbenchTransitions } from './workbenchTransitions.js';
const frame = 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))';

// Pause real browser animations, without replacing business state or IPC.
async function capture(h, selector, action) {
  await h.evaluate(`(() => {
    window.transitionSamples = [];
    window.transitionAnimate = Element.prototype.animate;
    window.transitionListener = event => {
      if (!event.target.matches(${JSON.stringify(selector)})) return;
      for (const animation of event.target.getAnimations()) {
        if (!(animation instanceof CSSTransition) || window.transitionSamples.includes(animation)) continue;
        animation.pause();
        window.transitionSamples.push(animation);
      }
    };
    document.addEventListener('transitionrun', window.transitionListener, true);
    Element.prototype.animate = function(...args) {
      const animation = window.transitionAnimate.apply(this, args);
      if (this.matches(${JSON.stringify(selector)})) {
        animation.pause();
        window.transitionSamples.push(animation);
      }
      return animation;
    };
  })()`);
  try {
    await action();
    await h.evaluate(frame);
  } finally {
    await h.evaluate('void (Element.prototype.animate = window.transitionAnimate)');
    await h.evaluate(
      "document.removeEventListener('transitionrun', window.transitionListener, true)",
    );
  }
}

async function finish(h) {
  await h.evaluate(
    'window.transitionSamples.forEach(animation => { if (animation.playState !== "idle") animation.finish(); })',
  );
  await h.evaluate(frame);
}

async function sequence(h, name) {
  for (const [phase, fraction] of [
    ['start', 0],
    ['middle', 0.5],
    ['end', 1],
  ]) {
    await h.evaluate(
      `window.transitionSamples.forEach(a=>{if(a.playState!=='idle') a.currentTime=Number(a.effect.getTiming().duration)*${fraction}})`,
    );
    await h.evaluate(frame);
    await h.screenshot(`${name}-${phase}`);
  }
}

async function libraryTransitions({ h }, enabled, theme) {
  const { evaluate: e, check, click, wait } = h;
  await click('图片库', 'document.querySelector(".studio-titlebar")');
  await click('全部图片', 'document.querySelector(".library-side")');
  await click('视图', 'document.querySelector(".library-tools")');
  await click('不合并', 'document.querySelector("[aria-label=合并方式]")');
  await h.key('Escape');
  await wait(
    '!document.querySelector("[data-library-updating=true]") && document.querySelectorAll(".library-card").length>1',
  );
  await wait('!document.querySelector(".nps-transition-snapshot")');
  await capture(h, '.library-dock,.nps-transition-snapshot', () =>
    e('document.querySelector(".library-card [role=checkbox]").click()'),
  );
  await check(
    `${theme} / ${enabled}：多选条下方进入且立即可操作`,
    `!!document.querySelector('.library-selection-bar button') && ${enabled ? "window.transitionSamples.some(a=>a.effect.target.matches('.library-dock') && new DOMMatrix(a.effect.getKeyframes()[0].transform).m42>0)" : 'window.transitionSamples.length===0'}`,
    undefined,
    'once',
  );
  await finish(h);
  await capture(h, '.library-dock,.nps-transition-snapshot', () =>
    click('取消', 'document.querySelector(".library-selection-bar")'),
  );
  await check(
    `${theme} / ${enabled}：多选条退出立即取消选择，只留下淡出画面`,
    `!document.querySelector('.library-selection-bar') && ${enabled ? "window.transitionSamples.some(a=>a.effect.target.matches('.nps-transition-snapshot') && a.effect.getKeyframes().every(f=>'opacity' in f && !('transform' in f)))" : 'window.transitionSamples.length===0'}`,
    undefined,
    'once',
  );
  await finish(h);
  await capture(h, '.library-result-content,.nps-transition-snapshot', async () => {
    await click('验收收藏集', 'document.querySelector(".library-side")');
    await wait(
      '!document.querySelector("[data-library-updating=true]") && document.querySelectorAll(".library-card").length===1',
    );
  });
  await check(
    `${theme} / ${enabled}：收藏集稳定后整块换内容，只有透明度过渡`,
    `(() => {
    const live=window.transitionSamples.filter(a=>a.effect.target.matches('.library-result-content') && a.playState!=='idle');
    return ${enabled ? 'live.length===1 && live[0].effect.getKeyframes().every(f=>!("transform" in f) && "opacity" in f)' : 'live.length===0'} && document.querySelector('[data-library-grid]').scrollTop===0;
  })()`,
    undefined,
    'once',
  );
  if (enabled) await sequence(h, `transition-collection-${theme}`);
  await finish(h);
  await click('全部图片', 'document.querySelector(".library-side")');
  await wait(
    '!document.querySelector("[data-library-updating=true]") && document.querySelectorAll(".library-card").length>1',
  );
  await e('document.querySelector(".library-card").click()');
  await wait('!!document.querySelector(".library-detail-picture img[data-image-ready]")');
  await wait('!document.querySelector(".nps-transition-snapshot")');
  await capture(h, '.library-viewer,.library-viewer-image,.nps-transition-snapshot', async () => {
    await e('document.querySelector(".library-detail-picture img").click()');
    await wait('!!document.querySelector(".library-viewer-image img[data-image-ready]")');
  });
  await check(
    `${theme} / ${enabled}：大图底色淡入，图片使用令牌缩放进入`,
    `(() => {
    const live=window.transitionSamples.filter(a=>a.playState!=='idle');
    const image=live.find(a=>a.effect.target.matches('.library-viewer-image'));
    const background=live.find(a=>a.effect.target.matches('.library-viewer'));
    return ${enabled ? `!!image && !!background && Math.abs(new DOMMatrix(image.effect.getKeyframes()[0].transform).a-parseFloat(getComputedStyle(image.effect.target).getPropertyValue('--enter-scale')))<0.0001 && background.effect.getKeyframes().every(f=>!('transform' in f))` : 'live.length===0'};
  })()`,
    'window.transitionSamples.map(a=>({target:a.effect.target.className, state:a.playState,frames:a.effect.getKeyframes()}))',
    'once',
  );
  if (enabled) await sequence(h, `transition-viewer-open-${theme}`);
  await finish(h);
  const old = await e('document.querySelector(".library-viewer").dataset.viewerProjectId');
  await capture(h, '.library-viewer-image,.nps-transition-snapshot', async () => {
    await click('下一张', 'document.querySelector(".library-viewer")');
    await wait(
      `document.querySelector('.library-viewer').dataset.viewerProjectId!==${JSON.stringify(old)}`,
    );
  });
  await check(
    `${theme} / ${enabled}：下一张朝右方两倍位移进入，旧图只淡出`,
    `(() => {
    const live=window.transitionSamples.filter(a=>a.playState!=='idle');
    const image=live.find(a=>a.effect.target.matches('.library-viewer-image'));
    return ${enabled ? `!!image && image.effect.getKeyframes()[0].transform==='translateX('+parseFloat(getComputedStyle(image.effect.target).getPropertyValue('--enter-shift'))*2+'px)' && live.filter(a=>a.effect.target.matches('.nps-transition-snapshot')).every(a=>a.effect.getKeyframes().every(f=>!('transform' in f)))` : 'live.length===0'};
  })()`,
    undefined,
    'once',
  );
  await finish(h);
  await capture(h, '.nps-transition-snapshot', () =>
    h.key('Escape', {}, 'document.querySelector(".library-viewer")'),
  );
  await check(
    `${theme} / ${enabled}：关闭大图立即移除可操作层，退出只有透明度`,
    `!document.querySelector('.library-viewer') && window.transitionSamples.filter(a=>a.playState!=='idle').length ${enabled ? '>0' : '===0'}`,
    undefined,
    'once',
  );
  await finish(h);
  await capture(h, '.library-filter-collapse,.nps-transition-snapshot', () =>
    h.input('[aria-label="搜索图片库"]', 'transition-no-match'),
  );
  await check(
    `${theme} / ${enabled}：筛选行展开只有高度和透明度过渡`,
    `(() => {
    const live=window.transitionSamples.filter(a=>a.effect.target.matches('.library-filter-collapse') && a.playState!=='idle');
    return ${enabled ? `live.length===1 && live[0].effect.getKeyframes().every(f=>'height' in f && 'opacity' in f && !('transform' in f))` : 'live.length===0'} && !!document.querySelector('.library-filter-collapse button');
  })()`,
    undefined,
    'once',
  );
  if (enabled) await sequence(h, `transition-collapse-${theme}`);
  await finish(h);
  await capture(h, '.library-filter-collapse,.nps-transition-snapshot', () =>
    click('清除', 'document.querySelector(".library-filter-collapse")'),
  );
  await check(
    `${theme} / ${enabled}：收起立即移除筛选控件，保留纯视觉高度退出`,
    `!document.querySelector('.library-filter-collapse button') && window.transitionSamples.filter(a=>a.effect.target.matches('.library-filter-collapse') && a.playState!=='idle').length===${enabled ? 1 : 0}`,
    undefined,
    'once',
  );
  await finish(h);
  await wait(
    '!document.querySelector("[data-library-updating=true]") && document.querySelectorAll(".library-card").length>1',
  );
}

export async function transitionChecks({ h, mode, doubles }) {
  h.category('过渡动效');
  const { evaluate: e, check, click, wait } = h;
  const saved = await e('window.studio.getAppearanceSettings()');
  const theme = mode.themeDriver.get();
  const size = h.window.getContentSize();
  h.window.setContentSize(1240, 760);
  const files = await createWorkbenchFixtures(path.join(mode.root, 'transition-fixtures'), {
    prefix: 'transition',
    seed: 53000,
  });
  await click('工作台', 'document.querySelector(".studio-titlebar")');
  for (const [index, file] of files.slice(0, 2).entries()) {
    doubles.selections.push({ canceled: false, filePaths: [file] });
    await click('打开图片', 'document.querySelector(".studio-titlebar")');
    await wait(`document.querySelectorAll(".wb-tab").length===${index + 1}`);
  }
  await h.section('外观');
  await click('跟随系统', 'document.querySelector("[role=radiogroup][aria-label=主题]")');
  h.dualThemes(false);
  try {
    for (const dark of ['light', 'dark']) {
      mode.themeDriver.set(dark);
      await wait(`document.documentElement.dataset.theme==='${dark}'`);
      for (const [choice, enabled] of [
        ['完整', true],
        ['关闭', false],
      ]) {
        await h.section('外观');
        await click(choice, 'document.querySelector("[role=radiogroup][aria-label=动效]")');
        await wait(`document.documentElement.dataset.motion==='${enabled ? 'full' : 'off'}'`);
        for (const destination of ['工作台', '图片库', '设置', '图片库', '工作台', '设置']) {
          await capture(h, '.app-content, .nps-transition-snapshot', () =>
            click(destination, 'document.querySelector(".studio-titlebar")'),
          );
          await check(
            `${dark} / ${choice}：进入${destination}只有透明度过渡，当前页立即可操作`,
            `(() => {
            const animations=window.transitionSamples.filter(a=>a.playState!=='idle');
            const valid=animations.every(a=>a.effect.getKeyframes().every(f=>Object.keys(f).every(key=>['offset','computedOffset','easing','composite','opacity'].includes(key))));
            const current=document.querySelector('.studio-titlebar [aria-current=page]');
            const page=document.querySelector('.app-content');
            return ${enabled ? 'animations.length>=2 && valid' : 'animations.length===0'} && (current.getAttribute('aria-label') || current.textContent.trim())===${JSON.stringify(destination)} && !page.inert && getComputedStyle(page).pointerEvents!=='none';
          })()`,
            undefined,
            'once',
          );
          await finish(h);
          // The snapshot is removed after the finished animation settles, which can be a frame later.
          const settled =
            'getComputedStyle(document.querySelector(".app-content")).opacity==="1" && !document.querySelector(".nps-transition-snapshot")';
          await wait(settled, `${destination} 过渡收尾`);
          await check(
            `${dark} / ${choice}：${destination}最终完全显示且旧画面已释放`,
            settled,
            undefined,
            'once',
          );
        }
        await capture(h, '.settings-body, .settings-nav-indicator, .nps-transition-snapshot', () =>
          click('关于与更新', 'document.querySelector(".settings-sidebar")'),
        );
        await check(
          `${dark} / ${choice}：设置当前分类的标记只移动`,
          enabled
            ? "window.transitionSamples.some(a=>a.effect.target.matches('.settings-nav-indicator') && a.effect.getKeyframes().every(f=>'transform' in f && !('opacity' in f)))"
            : 'window.transitionSamples.length===0',
          undefined,
          'once',
        );
        await check(
          `${dark} / ${choice}：设置分类共用透明度过渡`,
          `window.transitionSamples.filter(a=>a.playState!=='idle').length ${enabled ? '>=' : '==='} ${enabled ? 2 : 0}`,
          undefined,
          'once',
        );
        await finish(h);
        await h.section('翻译词典');
        await capture(h, '.settings-view-indicator', () =>
          e('document.querySelectorAll(".settings-dictionary-views button")[1].click()'),
        );
        await check(
          `${dark} / ${choice}：词典分页签标记只移动，筛选立即生效`,
          `document.querySelectorAll('.settings-dictionary-views button')[1].getAttribute('aria-selected')==='true' && ${enabled ? "window.transitionSamples.some(a=>a.effect.getKeyframes().every(f=>'transform' in f && !('opacity' in f)))" : 'window.transitionSamples.length===0'}`,
          undefined,
          'once',
        );
        await finish(h);
        await e('document.querySelectorAll(".settings-dictionary-views button")[0].click()');
        await libraryTransitions({ h }, enabled, dark);
        await workbenchTransitions(h, enabled, dark, { capture, finish, sequence });
        const images = await createWorkbenchFixtures(
          path.join(mode.root, `decode-${dark}-${enabled}`),
          {
            seed: 54000 + (dark === 'dark' ? 10 : 0) + (enabled ? 1 : 2),
          },
        );
        await capture(h, '.wb-canvas img,.wb-tab img', async () => {
          doubles.selections.push({ canceled: false, filePaths: [images[0]] });
          await click('打开图片', 'document.querySelector(".studio-titlebar")');
          await wait(
            'document.querySelectorAll(".wb-tab").length===3 && !!document.querySelector(".wb-canvas img[data-image-ready]") && !!document.querySelector(".wb-tab[aria-selected=true] img[data-image-ready]")',
          );
          if (enabled)
            await wait(
              "['.wb-canvas img','.wb-tab img'].every(s=>window.transitionSamples.some(a=>a.effect.target.matches(s) && a.transitionProperty==='opacity'))",
            );
        });
        await check(
          `${dark} / ${choice}：画布和标签缩略图解码后只淡入`,
          enabled
            ? "['.wb-canvas img','.wb-tab img'].every(s=>window.transitionSamples.some(a=>a.effect.target.matches(s) && a.transitionProperty==='opacity'))"
            : 'window.transitionSamples.length===0',
          "({images:[...document.querySelectorAll('.wb-canvas img,.wb-tab img')].map(n=>({src:n.src,ready:n.dataset.imageReady,immediate:n.dataset.imageImmediate,opacity:getComputedStyle(n).opacity,transition:getComputedStyle(n).transition})),samples:window.transitionSamples.map(a=>({src:a.effect.target.src,property:a.transitionProperty,frames:a.effect.getKeyframes()}))})",
          'once',
        );
        await finish(h);
        await e('document.querySelector(".wb-tab[aria-selected=true] .wb-tab-close").click()');
        await capture(h, '.wb-canvas img,.wb-tab img', async () => {
          doubles.selections.push({ canceled: false, filePaths: [images[0]] });
          await click('打开图片', 'document.querySelector(".studio-titlebar")');
          await wait('document.querySelectorAll(".wb-tab").length===3');
        });
        await check(
          `${dark} / ${choice}：显示过的画布和缩略图再次打开不重复淡入`,
          'window.transitionSamples.length===0 && !!document.querySelector(".wb-canvas img[data-image-immediate]") && !!document.querySelector(".wb-tab[aria-selected=true] img[data-image-immediate]")',
          undefined,
          'once',
        );
        await finish(h);
        await e('document.querySelector(".wb-tab[aria-selected=true] .wb-tab-close").click()');
      }
    }
    await h.section('外观');
    await click('完整', 'document.querySelector("[role=radiogroup][aria-label=动效]")');
    await wait('document.documentElement.dataset.motion==="full"');
    await capture(h, '.app-content, .nps-transition-snapshot', async () => {
      for (const name of ['工作台', '图片库', '设置', '工作台'])
        await click(name, 'document.querySelector(".studio-titlebar")');
    });
    await check(
      '连续切页由最后一次接管，最多保留一张旧画面',
      'document.querySelector(".studio-titlebar [aria-current=page]").textContent.trim()==="工作台" && document.querySelectorAll(".nps-transition-snapshot[data-transition-source*=app-content]").length===1',
      undefined,
      'once',
    );
    await finish(h);
    await capture(h, '.app-content,.settings-body,.nps-transition-snapshot', async () => {
      await h.section('外观');
      await click('关闭', 'document.querySelector("[role=radiogroup][aria-label=动效]")');
      await wait('document.documentElement.dataset.motion==="off"');
    });
    await check(
      '关闭动效立刻取消正在播放的过渡并释放旧画面',
      'window.transitionSamples.every(a=>a.playState==="idle") && !document.querySelector(".nps-transition-snapshot") && getComputedStyle(document.querySelector(".app-content")).opacity==="1"',
      undefined,
      'once',
    );
  } finally {
    await e(
      'if(window.transitionAnimate) Element.prototype.animate=window.transitionAnimate; window.transitionSamples?.forEach(a=>{if(a.playState!=="idle") a.finish()})',
    );
    await click('工作台', 'document.querySelector(".studio-titlebar")');
    while (await e('!!document.querySelector(".wb-tab")'))
      await e('document.querySelector(".wb-tab-close").click()');
    await h.section('外观');
    await click(
      saved.motion === 'off' ? '关闭' : saved.motion === 'reduced' ? '跟随系统' : '完整',
      'document.querySelector("[role=radiogroup][aria-label=动效]")',
    );
    await click(
      saved.themeMode === 'light' ? '浅色' : saved.themeMode === 'dark' ? '深色' : '跟随系统',
      'document.querySelector("[role=radiogroup][aria-label=主题]")',
    );
    mode.themeDriver.set(theme);
    h.window.setContentSize(...size);
    h.dualThemes(true);
  }
}
