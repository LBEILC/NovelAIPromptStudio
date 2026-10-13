const frame = 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))';

// Pause real browser animations, without replacing business state or IPC.
async function capture(h, selector, action) {
  await h.evaluate(`(() => {
    window.transitionSamples = [];
    window.transitionAnimate = Element.prototype.animate;
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
  }
}

async function finish(h) {
  await h.evaluate(
    'window.transitionSamples.forEach(animation => { if (animation.playState !== "idle") animation.finish(); })',
  );
  await h.evaluate(frame);
}

export async function transitionChecks({ h, mode }) {
  h.category('过渡动效');
  const { evaluate: e, check, click, wait } = h;
  const saved = await e('window.studio.getAppearanceSettings()');
  const theme = mode.themeDriver.get();
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
          await check(
            `${dark} / ${choice}：${destination}最终完全显示且旧画面已释放`,
            'getComputedStyle(document.querySelector(".app-content")).opacity==="1" && !document.querySelector(".nps-transition-snapshot")',
            undefined,
            'once',
          );
        }
        await capture(h, '.settings-body, .nps-transition-snapshot', () =>
          click('关于与更新', 'document.querySelector(".settings-sidebar")'),
        );
        await check(
          `${dark} / ${choice}：设置分类共用透明度过渡`,
          `window.transitionSamples.filter(a=>a.playState!=='idle').length ${enabled ? '>=' : '==='} ${enabled ? 2 : 0}`,
          undefined,
          'once',
        );
        await finish(h);
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
      'document.querySelector(".studio-titlebar [aria-current=page]").textContent.trim()==="工作台" && document.querySelectorAll(".nps-transition-snapshot").length===1',
      undefined,
      'once',
    );
    await finish(h);
  } finally {
    await e(
      'if(window.transitionAnimate) Element.prototype.animate=window.transitionAnimate; window.transitionSamples?.forEach(a=>{if(a.playState!=="idle") a.finish()})',
    );
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
    h.dualThemes(true);
  }
}
