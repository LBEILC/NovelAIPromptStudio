import {
  pointer,
  center,
  prepare,
  library,
  restoredTabs,
  closeAddedTabs,
  cleanup,
} from './interactions.js';
import { settleLayout } from './layout.js';

const frame = 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))';
const active = '.menu:not(.leaving), .popover:not(.leaving)';
const tag = 'document.querySelector(".tags .tag[data-tag-key]")';
const tags = '[...document.querySelectorAll(".col.prompt .scroll [data-tag-key]")]';
const editor = 'document.querySelector(".tag-pop:not(.leaving)")';
const scroll = 'document.querySelector(".col.prompt .scroll")';

export async function notificationClearance(h, label, selector) {
  await settleLayout(h, `.toasts, ${selector}`);

  await h.screenshot(`notification-clearance-${label}`);
}

async function settle(h) {
  await settleLayout(h, active);
}

async function press(h, expression) {
  const point = await center(h, expression);
  const cdp = h.window.webContents.debugger;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await cdp.sendCommand('Input.dispatchMouseEvent', {
      type,
      ...point,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mousePressed' ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
    });
    // CDP acknowledgement can precede renderer event handling on CI.
    await h.evaluate(frame);
  }
}

async function toggle(h, label, trigger, layer, focusTarget = trigger) {
  for (let count = 1; count <= 5; count++) {
    await press(h, trigger);

    await h.check(
      `${label}：连续第 ${count} 次点击${count % 2 ? '打开' : '关闭'}`,
      `!!(${layer})===${count % 2 === 1}`,
      undefined,
      'once',
    );
    // Preserve the failed assertion, then restore the expected precondition for the next action.
    if (count % 2 === 0 && (await h.evaluate(`!!(${layer})`))) await h.nativeKey('Escape');
  }
  await h.nativeKey('Escape');
  await h.wait(`!(${layer})`);
  await h.wait(`document.activeElement===${focusTarget}`, `${label}关闭后恢复焦点`);
  await h.check(
    `${label}：Esc 恢复焦点`,
    `document.activeElement===${focusTarget}`,
    undefined,
    'once',
  );
  for (const key of ['Enter', ' ']) {
    await h.evaluate(`${trigger}.focus()`);
    await h.nativeKey(key);
    await h.check(`${label}：键盘打开`, `!!(${layer})`);
    await h.evaluate(`${trigger}.focus()`);
    await h.nativeKey(key);

    await h.check(`${label}：${key === ' ' ? '空格' : key} 开关`, `!(${layer})`, undefined, 'once');
    if (await h.evaluate(`!!(${layer})`)) await h.nativeKey('Escape');
  }
}

async function exitCheck(h, label, trigger, layer, close) {
  await press(h, trigger);
  await h.wait(`!!(${layer})`);
  await settle(h);
  await close();
  await h.wait(`!(${layer})`, `${label} 已关闭`);
  await h.check(`${label}关闭完成`, `!(${layer})`, undefined, 'once');
}

export async function interactionCorrectionChecks(env) {
  const { h } = env;
  const { evaluate: e, check, click, wait } = h;
  h.category('交互修正');
  const size = h.window.getContentSize();
  h.window.setContentSize(1240, 900);
  const records = await prepare(env, 'correction-fixture');
  const dictionaryTag = 'correction_dictionary_fixture';
  env.database.upsertTagDictionary([
    {
      tag: dictionaryTag,
      translation: '合成验收词条',
      category: 'Unsorted',
      translation_source: 'manual',
      category_source: 'manual',
    },
  ]);
  const originalMotion = env.preferences.appearanceSettings().motion;
  const move = pointer(h);
  let releaseUpdate;
  const updateReady = new Promise((resolve) => {
    releaseUpdate = resolve;
  });
  env.doubles.beforeUpdateCheck = () => updateReady;
  // The update notice only appears with auto-check on; earlier settings scenarios may leave it off.
  const originalAutoCheck = env.preferences.productivitySettings().autoCheckUpdates;
  env.preferences.saveProductivitySettings({ autoCheckUpdates: true });
  await h.reload();
  const previousTabs = await restoredTabs(h);
  try {
    await h.section('外观');
    await click(
      env.mode.reducedMotion ? '跟随系统' : '完整',
      'document.querySelector("[aria-label=动效]")',
    );
    const listbox = 'document.querySelector(".menu:not(.leaving)")';
    const fontsBefore = env.preferences.appearanceSettings();
    for (const [label, key] of [
      ['界面字体', 'sansFont'],
      ['等宽字体', 'monoFont'],
      ['段落字体', 'proseFont'],
    ]) {
      await toggle(h, label, `document.querySelector('[aria-label="${label}"]')`, listbox);
      await check(
        `${label}连续开关后偏好保持原值`,
        () => env.preferences.appearanceSettings()[key] === fontsBefore[key],
        () => ({ expected: fontsBefore[key], actual: env.preferences.appearanceSettings()[key] }),
        'once',
      );
    }
    await h.section('翻译词典');
    await h.input('.dict-search input', dictionaryTag);
    await wait(`!!document.querySelector('[data-dxrow="${dictionaryTag}"]')`);
    for (const label of ['按分类筛选', '排序'])
      await toggle(h, `词典${label}`, `document.querySelector('[aria-label="${label}"]')`, listbox);
    const dictionaryMenu = 'document.querySelector(".menu:not(.leaving)")';
    const dictionaryMore = `document.querySelector('[data-dxrow="${dictionaryTag}"] [aria-label=更多]')`;
    await toggle(h, '词典行更多', dictionaryMore, dictionaryMenu);
    await exitCheck(h, '词典行更多退出保留菜单内容', dictionaryMore, dictionaryMenu, () =>
      press(h, dictionaryMore),
    );
    await toggle(
      h,
      '词典行分类',
      `document.querySelector('[data-dxrow="${dictionaryTag}"] [data-cat]')`,
      dictionaryMenu,
    );
    await e(`document.querySelector('[data-dxrow="${dictionaryTag}"] [role=checkbox]').click()`);
    releaseUpdate();
    await wait(
      'document.querySelector(".toast:not(.leaving)")?.textContent.includes("发现新版本")',
      '批量操作期间显示后台通知',
    );
    await e(
      `document.querySelector('.toast').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
    );
    await notificationClearance(h, '词典', '.dict-sel');
    await toggle(
      h,
      '词典批量设置分类',
      '[...document.querySelectorAll(".dict-sel button")].find(n=>n.textContent.trim()==="设置分类")',
      dictionaryMenu,
    );
    await e(`document.querySelector('[data-dxrow="${dictionaryTag}"] [role=checkbox]').click()`);
    await h.reload();
    await library(h, 'correction-fixture');
    await e(
      `document.querySelector('.card').dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await wait('!!document.querySelector(".ldock .selbar")');
    await wait(
      'document.querySelector(".toast:not(.leaving)")?.textContent.includes("发现新版本")',
      '图片库批量操作期间显示后台通知',
    );
    await e(
      `document.querySelector('.toast').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
    );
    await notificationClearance(h, '图片库', '.ldock .selbar');
    await h.nativeKey('Escape');
    await e(
      `document.querySelector('.toast').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}))`,
    );
    const byLabel = (label) =>
      `[...document.querySelectorAll('.libp button')].find(n=>n.getAttribute('aria-label')===${JSON.stringify(label)}||n.textContent.trim()===${JSON.stringify(label)})`;
    const pop = (label) =>
      `document.querySelector('.popover[aria-label=${JSON.stringify(label)}]:not(.leaving)')`;
    await toggle(h, '筛选', byLabel('筛选'), pop('筛选'));
    await toggle(h, '视图', byLabel('视图'), pop('视图'));
    await press(h, byLabel('视图'));
    await toggle(h, '图片排序下拉框', 'document.querySelector("[data-trigger=lsort]")', listbox);
    await h.nativeKey('Escape');
    await toggle(
      h,
      '导入拆分箭头',
      byLabel('更多导入方式'),
      'document.querySelector(".menu:not(.leaving)")',
    );
    await press(h, byLabel('筛选'));
    await toggle(
      h,
      '日期范围月历',
      'document.querySelector("[data-trigger=lcal]")',
      pop('选择时间范围'),
    );
    await h.nativeKey('Escape');
    // All close routes pass through the same Layer presence handling.
    const trigger = byLabel('视图');
    for (const [label, close] of [
      ['再次点击触发器', () => press(h, trigger)],
      ['Esc', () => h.nativeKey('Escape')],
      ['点击外面', () => press(h, 'document.querySelector("[aria-label=搜索图片库]")')],
    ])
      await exitCheck(h, label, trigger, pop('视图'), close);
    for (const label of ['筛选', '视图']) {
      await exitCheck(h, `${label}关闭同时重算结果`, byLabel(label), pop(label), async () => {
        await h.input('[aria-label="搜索图片库"]', 'correction-fixture-');
        await h.nativeKey('Escape');
      });
      await h.input('[aria-label="搜索图片库"]', 'correction-fixture');
    }
    await press(h, byLabel('筛选'));
    await exitCheck(
      h,
      '选中下拉选项',
      'document.querySelector("[data-trigger=lcal]")',
      pop('选择时间范围'),
      () => click('不限时间', 'document.querySelector(".lcal")'),
    );
    await h.nativeKey('Escape');
    await e('document.querySelector(".card").click()');
    await wait('!!document.querySelector(".detail .pic img")');

    await press(h, 'document.querySelector(".detail .pic img")');
    await check(
      '详情图片单击打开大图',
      '!!document.querySelector(".viewer-ov")',
      undefined,
      'once',
    );
    await h.nativeKey('Escape');
    await toggle(
      h,
      '加入收藏集',
      'document.querySelector("[data-trigger=lcollect-detail]")',
      pop('加入收藏集'),
    );
    for (const record of records.slice(0, 2)) {
      await wait(
        `!!document.querySelector('[data-group-id="project:${record.id}"]')`,
        '换页后目标图片已渲染',
      );
      await e(
        `document.querySelector('[data-group-id="project:${record.id}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
      );
      await wait('!!document.querySelector(".viewer-ov")');
      await click('在工作台打开', 'document.querySelector(".viewer-ov")');
      await wait(
        `document.querySelector('.wb-body[data-project-id="${record.id}"]')?.checkVisibility() && document.querySelector('.tb [aria-current=page]')?.textContent.trim()==='工作台'`,
        '双击的图片已完成加载并成为当前工作台页面',
      );
      if (record === records[0]) await click('图片库', 'document.querySelector(".tb")');
    }
    await click('工作台', 'document.querySelector(".tb")');
    const wb = (label) =>
      `document.querySelector('.col.prompt [aria-label=${JSON.stringify(label)}]')`;
    const menu = 'document.querySelector(".menu:not(.leaving)")';
    await toggle(h, '显示', wb('显示'), pop('显示'));
    await press(h, wb('显示'));
    await h.nativeKey('Escape');
    await toggle(h, '节菜单', wb('更多'), menu);
    await toggle(h, '块菜单', wb('这一块的操作'), menu);
    await toggle(
      h,
      '复制拆分箭头',
      wb('其他复制方式'),
      menu,
      'document.querySelector(\'[data-trigger="copy"] button\')',
    );
    await click('添加角色');
    await toggle(h, '角色操作', wb('这个角色的操作'), menu);
    await e(
      `${tag}.dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await toggle(h, '移动到', 'document.querySelector("[data-trigger=move]")', menu);
    await e(
      `${tag}.dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await toggle(h, 'Tag 编辑', tag, 'document.querySelector(".tag-pop:not(.leaving)")');
    await press(h, tag);
    await toggle(
      h,
      'Tag 分类下拉框',
      `document.querySelector('[data-trigger="tag-cat"]')`,
      listbox,
    );
    await h.nativeKey('Escape');
    const tagLayer = 'document.querySelector(".tag-pop:not(.leaving)")';
    await exitCheck(h, 'Tag 编辑按 Esc 关闭', tag, tagLayer, () => h.nativeKey('Escape'));
    await press(h, tag);
    await settle(h);
    const second = 'document.querySelectorAll(".tags .tag[data-tag-key]")[1]';
    const secondText = await e(`${second}.querySelector('.en').textContent`);
    await press(h, second);
    await wait(
      `document.querySelector('.tag-pop [aria-label=Tag]')?.value===${JSON.stringify(secondText)}`,
    );
    await check(
      '点击另一个 Tag 后仅新编辑浮层处于打开状态',
      `document.querySelectorAll('.tag-pop:not(.leaving)').length===1&&${editor}.querySelector('[aria-label=Tag]').value===${JSON.stringify(secondText)}`,
      undefined,
      'once',
    );
    await h.nativeKey('Escape');
    await click('按文本编辑（Ctrl E 切换）');

    await e(`document.querySelector('.tx-wrap textarea').focus({preventScroll:true})`);
    await settleLayout(h, '.tx-wrap textarea');

    await h.screenshot('024-raw-focused');
    await h.input('.tx-wrap textarea', 'synthetic_short');
    await h.input(
      '.tx-wrap textarea',
      Array.from({ length: 200 }, (_, i) => `synthetic_growth_${i}`).join(', '),
    );

    const raw =
      'tiny, synthetic_long_tag_alpha, medium_tag, synthetic_long_tag_beta, short, another_synthetic_tag, x, wide_synthetic_tag_gamma, last_tag\n\nsecond_block, another_long_synthetic_tag, final_marker';
    await h.input('.tx-wrap textarea', raw);
    await click('按块编辑（Ctrl E 切换）');
    await wait('document.querySelector(".tags")?.textContent.includes("synthetic_long_tag_alpha")');
    await press(h, tag);
    await h.input('[aria-label="译文"]', '合成验收译文');
    await h.key('Enter', {}, 'document.querySelector(".tag-pop [aria-label=译文]")');
    await e(`${scroll}.scrollTop=0;${frame}`);
    await settleLayout(h, '.col.prompt .scroll');
    const startDrag = async (expression) => {
      const start = await center(h, expression);
      await move('mouseMoved', start);
      await move('mousePressed', start, true);
      await move('mouseMoved', { x: start.x + 10, y: start.y + 2 }, true);
      await wait('!!document.querySelector(".drag-float,.tabs [data-tab][data-dragging]")');
      return start;
    };
    const source = 'document.querySelector(".tags [data-tag-key]")';
    await click('按文本编辑（Ctrl E 切换）');
    await h.input(
      '.tx-wrap textarea',
      Array.from({ length: 100 }, (_, index) => `scroll_fixture_tag_${index}`).join(', '),
    );
    await click('按块编辑（Ctrl E 切换）');
    await e(`${scroll}.scrollTop=0`);
    await startDrag(source);
    const lower = await e(
      `(()=>{const r=${scroll}.getBoundingClientRect();return {x:r.left+r.width/2,y:r.bottom-2}})()`,
    );
    await move('mouseMoved', lower, true);
    await wait(`${scroll}.scrollTop>0`, 'Tag 停在下边缘时自动向下滚动');
    const scrolled = await e(`${scroll}.scrollTop`);
    const upper = await e(
      `(()=>{const r=${scroll}.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+2}})()`,
    );
    await move('mouseMoved', upper, true);
    await wait(`${scroll}.scrollTop<${scrolled}`, 'Tag 停在上边缘时自动向上滚动');
    await check(
      'Tag 拖动同时支持上下边缘自动滚动',
      `${scroll}.scrollTop<${scrolled}`,
      undefined,
      'once',
    );
    await h.nativeKey('Escape');
    await move('mouseReleased', upper);
  } finally {
    releaseUpdate();
    delete env.doubles.beforeUpdateCheck;
    env.preferences.saveProductivitySettings({ autoCheckUpdates: originalAutoCheck });
    await h.nativeKey('Escape');
    await move('mouseReleased', { x: 20, y: 300 });
    await h.window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
    await h.section('外观');
    await click(
      { full: '完整', reduced: '跟随系统', off: '关闭' }[originalMotion],
      'document.querySelector("[aria-label=动效]")',
    );
    await closeAddedTabs(h, previousTabs);
    await cleanup(env, records);
    env.database.deleteTagDictionary(dictionaryTag);
    h.window.setContentSize(...size);
  }
}
