import path from 'node:path';
import { createWorkbenchFixtures } from './workbenchFixtures.js';

const expression = (fn, ...args) =>
  '(' + fn.toString() + ')(' + args.map((a) => JSON.stringify(a)).join(',') + ')';
export async function clientControlChecks({ h, mode, doubles }) {
  const e = (fn, ...args) => h.evaluate(expression(fn, ...args));
  const check = (label, fn, ...args) => h.check(label, expression(fn, ...args));
  h.category('客户端控件');
  h.dualThemes(true);
  const original = h.window.webContents.getURL(),
    bounds = h.window.getBounds();
  h.window.setSize(1080, Math.max(720, bounds.height));
  await h.section('外观');
  h.category('客户端控件');

  await h.screenshot('022-segments-appearance');
  await h.click('图片库', 'document.querySelector(".studio-titlebar")');
  await h.click('筛选');
  for (const tag of ['1girl', 'solo']) {
    await h.input('input[aria-label="包含 Tag"]', tag);
    await h.key('Enter');
  }

  await h.nativeKey('Escape');
  await h.click('清除', 'document.querySelector(".library-chips")');
  await h.click('视图');

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
  await check('标签页无关闭按钮', () => {
    const tabs = [...document.querySelectorAll('.wb-tab')];
    return tabs.every((n) => !n.querySelector('button'));
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
      tabs.every((n) => !n.querySelector('button')) && !document.querySelector('.wb-tab-close')
    );
  };
  await cdp.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
  await check('非当前标签悬停无关闭按钮', closeVisible);
  await cdp.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  await e(() => document.querySelector('.wb-tab[aria-selected=false]').focus());
  await check('键盘聚焦非当前标签无关闭按钮', closeVisible);
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

  await e(() => document.querySelector('.nps-toast').scrollIntoView({ block: 'center' }));
  await h.screenshot('022-notices-tooltips');
  await e(() => document.querySelector('[role=progressbar]').scrollIntoView({ block: 'center' }));
  await h.screenshot('022-progress');
  await h.window.loadURL(original);
  await h.wait('!!document.querySelector(".studio-titlebar")');
  h.window.setBounds(bounds);
}
