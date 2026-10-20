import path from 'node:path';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { settleLayout } from './layout.js';

const expression = (fn, ...args) =>
  '(' + fn.toString() + ')(' + args.map((a) => JSON.stringify(a)).join(',') + ')';
function aligned(selector = '.nps-options') {
  const groups = [...document.querySelectorAll(selector)].filter((n) =>
    n.checkVisibility({ checkVisibilityCSS: true }),
  );
  return (
    groups.length > 0 &&
    groups.every((g) => {
      const buttons = [...g.querySelectorAll('[role=radio]')],
        selected = g.querySelector('[aria-checked=true]'),
        thumb = g.querySelector('.nps-option-thumb');
      if (
        !selected ||
        !thumb ||
        buttons.length > 4 ||
        g.querySelectorAll('.nps-option-thumb').length !== 1
      )
        return false;
      const s = selected.getBoundingClientRect(),
        t = thumb.getBoundingClientRect(),
        r = g.getBoundingClientRect();
      return (
        Math.abs(s.left - t.left) <= 1 &&
        Math.abs(s.width - t.width) <= 1 &&
        new Set(buttons.map((b) => b.offsetTop)).size === 1 &&
        r.left >= 0 &&
        r.right <= innerWidth &&
        buttons.every((b) => b.getBoundingClientRect().right <= r.right + 1)
      );
    })
  );
}
export async function clientControlChecks({ h, mode, doubles }) {
  const e = (fn, ...args) => h.evaluate(expression(fn, ...args));
  const check = (label, fn, ...args) => h.check(label, expression(fn, ...args));
  const geometry = async (label, selector = '.nps-options') => {
    await h.check(
      label,
      async () => {
        await settleLayout(h, selector);
        return e(aligned, selector);
      },
      () =>
        e(
          (s) =>
            [...document.querySelectorAll(s)].map((g) => ({
              label: g.getAttribute('aria-label'),
              visible: g.checkVisibility(),
              group: g.getBoundingClientRect().toJSON(),
              selected: g.querySelector('[aria-checked=true]')?.getBoundingClientRect().toJSON(),
              thumb: g.querySelector('.nps-option-thumb')?.getBoundingClientRect().toJSON(),
            })),
          selector,
        ),
    );
  };
  h.category('客户端控件');
  h.dualThemes(true);
  const original = h.window.webContents.getURL(),
    bounds = h.window.getBounds();
  h.window.setSize(1080, Math.max(720, bounds.height));
  await h.section('外观');
  h.category('客户端控件');
  await geometry('最窄窗口：主题与动效分段保持单行，唯一滑块准确对齐');
  await h.screenshot('022-segments-appearance');
  await h.click('图片库', 'document.querySelector(".studio-titlebar")');
  await h.click('筛选');
  for (const tag of ['1girl', 'solo']) {
    await h.input('input[aria-label="包含 Tag"]', tag);
    await h.key('Enter');
  }
  await geometry('最窄窗口：包含方式分段保持单行并对齐');
  await h.nativeKey('Escape');
  await h.click('清除', 'document.querySelector(".library-chips")');
  await h.click('视图');
  await geometry('最窄窗口：四项合并分段保持单行');
  await check(
    '合并分段采用四个短文案',
    () =>
      [...document.querySelectorAll('[aria-label="合并方式"] button')]
        .map((n) => n.textContent.trim())
        .join('/') === '不合并/完全相同/基础相同/相似',
  );
  await h.screenshot('022-segments-grouping');
  await h.nativeKey('Escape');
  await h.click('工作台', 'document.querySelector(".studio-titlebar")');
  const files = await createWorkbenchFixtures(path.join(mode.root, 'client-control-fixtures'));
  for (const file of files.slice(0, 2)) {
    doubles.selections.push({ canceled: false, filePaths: [file] });
    await h.click('打开图片', 'document.querySelector(".studio-titlebar")');
    await h.wait('!!document.querySelector(".wb-prose")');
  }
  await h.wait('document.querySelectorAll(".wb-tab").length===2');
  await h.click('显示', 'document.querySelector(".wb-prompt-head")');
  await geometry('工作台显示的三处分段保持单行并准确对齐');
  await check(
    '语言、排列、只看使用分段，分类保持下拉',
    () =>
      ['语言', '排列', '只看'].every((label) =>
        document.querySelector('[role=radiogroup][aria-label="' + label + '"]'),
      ) && !!document.querySelector('.nps-select[aria-label="分类"]'),
  );
  await h.screenshot('022-segments-workbench');
  await h.nativeKey('Escape');
  await h.wait(
    '[...document.querySelectorAll(".nps-layer[aria-hidden=true]")].every(n=>!n.checkVisibility({checkVisibilityCSS:true}))',
  );
  await e(() => {
    document.activeElement?.blur();
    window.dispatchEvent(new Event('blur'));
  });
  await check('标签页无关闭按钮且不为它留位', () => {
    const tabs = [...document.querySelectorAll('.wb-tab')];
    window.__closeWidths = tabs.map((n) => n.getBoundingClientRect().width);
    return tabs.every(
      (n) =>
        !n.querySelector('button') &&
        getComputedStyle(n).paddingLeft === getComputedStyle(n).paddingRight,
    );
  });
  const cdp = h.window.webContents.debugger;
  await cdp.sendCommand('DOM.enable');
  await cdp.sendCommand('CSS.enable');
  const { root } = await cdp.sendCommand('DOM.getDocument');
  const { nodeId } = await cdp.sendCommand('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '.wb-tab[aria-selected=false]',
  });
  const closeVisible = () => {
    const tabs = [...document.querySelectorAll('.wb-tab')];
    return (
      tabs.every((n, i) => n.getBoundingClientRect().width === window.__closeWidths[i]) &&
      !document.querySelector('.wb-tab-close')
    );
  };
  await cdp.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
  await check('非当前标签悬停无关闭按钮，标签宽度不变', closeVisible);
  await cdp.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  await e(() => document.querySelector('.wb-tab[aria-selected=false]').focus());
  await check('键盘聚焦非当前标签无关闭按钮，宽度不变', closeVisible);
  await h.wait('!!document.querySelector(".wb-tab-preview:popover-open")');
  await check('标签预览时间为日期或今天时分，没有原始时间戳', () =>
    [...document.querySelectorAll('.wb-tab-preview .nps-help')].some((n) =>
      /^(?:今天 \d{2}:\d{2}|\d{4}-\d{2}-\d{2}) 导入$/.test(n.textContent),
    ),
  );
  await h.screenshot('022-tab-preview');
  await e(() => {
    document.activeElement?.blur();
    window.dispatchEvent(new Event('blur'));
  });
  await check('画布为图片下方阴影保留不少于深色阴影外延的空间', () => {
    const c = document.querySelector('.wb-canvas'),
      i = c.querySelector('img'),
      s = getComputedStyle(c);
    return (
      parseFloat(s.paddingBottom) >= 38 &&
      c.getBoundingClientRect().bottom - i.getBoundingClientRect().bottom >= 38
    );
  });
  await h.screenshot('022-canvas-shadow');
  for (let i = 0; i < 2; i++)
    await h.key('w', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
  await h.wait('!document.querySelector(".wb-tab")');
  await h.window.loadFile(path.join(mode.root, 'showcase', 'ui-showcase.html'), {
    query: { theme: 'system', motion: mode.motion || 'system' },
  });
  await h.wait('!!document.querySelector("[data-showcase]")');
  const group = '[aria-label="默认显示"]',
    scope = 'document.querySelector(' + JSON.stringify(group) + ')';
  await h.click('原文', scope);
  await geometry('分段切换后滑块位置和宽度等于新选项', group);
  await e((s) => document.querySelector(s + ' button').focus(), group);
  await h.key('End');
  await check(
    '分段 End 选择最后一项且仅有一个 Tab 停靠点',
    (s) =>
      document.querySelector(s + ' [aria-checked=true]').textContent === '对照' &&
      document.querySelectorAll(s + ' [tabindex="0"]').length === 1,
    group,
  );
  await h.key('Home');
  await h.key('ArrowRight');
  await check(
    '分段 Home 和方向键选择相邻项',
    (s) => document.querySelector(s + ' [aria-checked=true]').textContent === '译文',
    group,
  );
  await e(() => document.querySelector('[aria-label="小号分段"] button').focus());
  await h.key('Home');
  await h.key('ArrowRight');
  await check('方向键跳过不可用项；整体不可用阻止鼠标选择', () => {
    const small = document.querySelector('[aria-label="小号分段"]'),
      off = document.querySelector('[aria-label="不可用分段"]'),
      before = off.querySelector('[aria-checked=true]').textContent;
    off.querySelector('button').click();
    return (
      small.querySelector('[aria-checked=true]').textContent === '对照' &&
      [...off.querySelectorAll('button')].every((n) => n.disabled) &&
      off.querySelector('[aria-checked=true]').textContent === before
    );
  });
  await check(
    '大小两种分段高度对应控件令牌',
    (s) => {
      const a = document.querySelector(s),
        b = document.querySelector('[aria-label="小号分段"]');
      return (
        a.offsetHeight === parseFloat(getComputedStyle(a).getPropertyValue('--ctl')) &&
        b.offsetHeight === parseFloat(getComputedStyle(b).getPropertyValue('--ctl-sm'))
      );
    },
    group,
  );
  await e((s) => {
    const n = document.querySelector(s + ' [aria-checked=true]');
    n.textContent = '对照文本';
    n.style.fontFamily = 'var(--font-mono)';
  }, group);
  await h.evaluate('document.fonts.ready.then(()=>true)');
  await h.wait(expression(aligned, group), '选项文字和字体变化后重新测量');
  await geometry('选项文字和字体变化后滑块重新对齐', group);
  h.window.setSize(1180, Math.max(720, bounds.height));
  await geometry('窗口缩放后滑块仍准确对齐', group);
  await h.window.loadFile(path.join(mode.root, 'showcase', 'ui-showcase.html'), {
    query: { theme: 'system', motion: 'off' },
  });
  await h.wait('!!document.querySelector("[data-showcase]")');
  await h.click('原文', scope);
  await check(
    '关闭动效时滑块没有过渡',
    (s) =>
      getComputedStyle(document.querySelector(s + ' .nps-option-thumb')).transitionDuration ===
      '0s',
    group,
  );
  await check('关闭动效时滑块直接对齐', aligned, group);
  await check('提示和通知使用主题令牌、对比度至少 7:1 且存在边界', () => {
    const nodes = [...document.querySelectorAll('.nps-toast,.nps-tip')];
    const resolve = (n, token) => {
      const x = document.createElement('span');
      x.style.color = 'var(' + token + ')';
      n.append(x);
      const c = getComputedStyle(x).color;
      x.remove();
      return c;
    };
    const lum = (c) => {
      const v = c
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((x) => {
          x /= 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
      return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
    };
    return (
      nodes.length >= 4 &&
      nodes.every((n) => {
        const s = getComputedStyle(n),
          a = lum(s.color),
          b = lum(s.backgroundColor);
        return (
          s.backgroundColor === resolve(n, '--tip-bg') &&
          s.color === resolve(n, '--tip-text') &&
          s.borderTopColor === resolve(n, '--tip-border') &&
          (s.boxShadow !== 'none' || parseFloat(s.borderTopWidth) > 0) &&
          (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 7
        );
      })
    );
  });
  await check('成功为绿色勾、失败为危险色叹号，普通通知无标记', () => {
    const ok = document.querySelector('.nps-notice-success'),
      err = document.querySelector('.nps-notice-error'),
      plain = [...document.querySelectorAll('.nps-toast')].find(
        (n) => n.textContent === '没有更多内容',
      );
    const color = (n, token) => {
      const x = document.createElement('i');
      x.style.color = 'var(' + token + ')';
      n.append(x);
      const c = getComputedStyle(x).color;
      x.remove();
      return c;
    };
    return (
      ok.classList.contains('ri-check-line') &&
      getComputedStyle(ok, '::before').content !== 'none' &&
      ok.getBoundingClientRect().width > 0 &&
      getComputedStyle(ok).color === color(ok, '--ok') &&
      err.classList.contains('ri-error-warning-line') &&
      getComputedStyle(err, '::before').content !== 'none' &&
      err.getBoundingClientRect().width > 0 &&
      getComputedStyle(err).color === color(err, '--danger') &&
      !plain.querySelector('i')
    );
  });
  await check('通知操作使用安静按钮且没有下划线，通知高度保持令牌值', () => {
    const b = document.querySelector('.nps-toast button'),
      n = b.closest('.nps-toast');
    return (
      b.classList.contains('nps-button-quiet') &&
      getComputedStyle(b).textDecorationLine === 'none' &&
      n.offsetHeight === parseFloat(getComputedStyle(n).getPropertyValue('--toast-h'))
    );
  });
  const current = await cdp.sendCommand('DOM.getDocument');
  const action = await cdp.sendCommand('DOM.querySelector', {
    nodeId: current.root.nodeId,
    selector: '.nps-toast button',
  });
  const before = await e(
    () => getComputedStyle(document.querySelector('.nps-toast button')).backgroundColor,
  );
  await cdp.sendCommand('CSS.forcePseudoState', {
    nodeId: action.nodeId,
    forcedPseudoClasses: ['hover'],
  });
  await e(() => {
    for (const a of document.querySelector('.nps-toast button').getAnimations()) a.finish();
  });
  await check(
    '通知操作按钮具有可见悬停背景',
    (b) => getComputedStyle(document.querySelector('.nps-toast button')).backgroundColor !== b,
    before,
  );
  await cdp.sendCommand('CSS.forcePseudoState', { nodeId: action.nodeId, forcedPseudoClasses: [] });
  await e(() => document.querySelector('.nps-toast').scrollIntoView({ block: 'center' }));
  await h.screenshot('022-notices-tooltips');
  await e(() => document.querySelector('[role=progressbar]').scrollIntoView({ block: 'center' }));
  await h.screenshot('022-progress');
  await h.window.loadURL(original);
  await h.wait('!!document.querySelector(".studio-titlebar")');
  h.window.setBounds(bounds);
}
