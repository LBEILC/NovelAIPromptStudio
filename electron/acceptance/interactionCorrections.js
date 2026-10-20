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
const active = '.nps-layer:popover-open:not([aria-hidden="true"]):not(.nps-tip)';
const tag = 'document.querySelector(".wb-tags .nps-tag")';
const tags = '[...document.querySelectorAll(".wb-document-scroll [data-wb-tag]")]';
const editor = 'document.querySelector(".nps-popover:popover-open .wb-tag-editor")';
const scroll = 'document.querySelector(".wb-document-scroll")';

async function notificationClearance(h, label, selector) {
  await settleLayout(h, `.nps-notifications, ${selector}`);
  await h.check(
    `${label}通知位于操作条上方且每个按钮中心可点击`,
    `(()=>{
    const bar=document.querySelector(${JSON.stringify(selector)}),toast=document.querySelector('.nps-toast');
    const a=bar.getBoundingClientRect(),b=toast.getBoundingClientRect(),gap=parseFloat(getComputedStyle(toast).getPropertyValue('--sp-2'));
    return Math.abs(a.top-b.bottom-gap)<1 && [...bar.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===button});
  })()`,
    undefined,
    'both',
  );
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

async function toggle(h, label, trigger, layer) {
  for (let count = 1; count <= 5; count++) {
    await press(h, trigger);
    await h.wait(`!!(${layer})===${count % 2 === 1}`, `${label} 第 ${count} 次点击完成`);
    await h.check(
      `${label}：连续第 ${count} 次点击${count % 2 ? '打开' : '关闭'}`,
      `!!(${layer})===${count % 2 === 1}`,
      undefined,
      'once',
    );
  }
  await h.nativeKey('Escape');
  await h.wait(`!(${layer})`);
  await h.check(
    `${label}：Esc 返回触发器`,
    `document.activeElement===${trigger}`,
    undefined,
    'once',
  );
  for (const key of ['Enter', ' ']) {
    await h.evaluate(`${trigger}.focus()`);
    await h.nativeKey(key);
    await h.wait(`!!(${layer})`, `${label} 键盘打开`);
    await h.evaluate(`${trigger}.focus()`);
    await h.nativeKey(key);
    await h.wait(`!(${layer})`, `${label} 键盘关闭`);
    await h.check(`${label}：${key === ' ' ? '空格' : key} 开关`, `!(${layer})`, undefined, 'once');
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
    const listbox = 'document.querySelector(".nps-menu[role=listbox]:popover-open")';
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
    await h.input('.settings-dictionary-search input', dictionaryTag);
    await wait(`!!document.querySelector('[aria-label="更多：${dictionaryTag}"]')`);
    for (const label of ['按 Tag 分类筛选', '排序'])
      await toggle(h, `词典${label}`, `document.querySelector('[aria-label="${label}"]')`, listbox);
    const dictionaryMenu = 'document.querySelector(".nps-menu:popover-open")';
    const dictionaryMore = `document.querySelector('[aria-label="更多：${dictionaryTag}"]')`;
    await toggle(h, '词典行更多', dictionaryMore, dictionaryMenu);
    await exitCheck(h, '词典行更多退出保留菜单内容', dictionaryMore, dictionaryMenu, () =>
      press(h, dictionaryMore),
    );
    await toggle(
      h,
      '词典行分类',
      `document.querySelector('[aria-label="分类：${dictionaryTag}"]')`,
      dictionaryMenu,
    );
    await click(dictionaryTag, 'document.querySelector(".settings-table")');
    releaseUpdate();
    await wait(
      'document.querySelector(".nps-toast")?.textContent.includes("发现新版本")',
      '批量操作期间显示后台通知',
    );
    await e(
      `document.querySelector('.nps-toast').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
    );
    await notificationClearance(h, '词典', '.settings-dictionary-selection .nps-selection');
    await toggle(
      h,
      '词典批量设置分类',
      'document.querySelector(".settings-dictionary-selection [aria-label=设置分类]")',
      dictionaryMenu,
    );
    await click(dictionaryTag, 'document.querySelector(".settings-table")');
    await h.reload();
    await library(h, 'correction-fixture');
    await e(
      `document.querySelector('.library-card').dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await wait('!!document.querySelector(".library-selection-bar")');
    await wait(
      'document.querySelector(".nps-toast")?.textContent.includes("发现新版本")',
      '图片库批量操作期间显示后台通知',
    );
    await e(
      `document.querySelector('.nps-toast').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
    );
    await notificationClearance(h, '图片库', '.library-selection-bar');
    await h.nativeKey('Escape');
    await e(
      `document.querySelector('.nps-toast').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}))`,
    );
    const byLabel = (label) =>
      `[...document.querySelectorAll('.library-page button')].find(n=>n.getAttribute('aria-label')===${JSON.stringify(label)}||n.textContent.trim()===${JSON.stringify(label)})`;
    const pop = (label) =>
      `[...document.querySelectorAll('${active}')].find(n=>n.querySelector('.nps-sr')?.textContent===${JSON.stringify(label)})`;
    await toggle(h, '筛选', byLabel('筛选'), pop('筛选'));
    await toggle(h, '视图', byLabel('视图'), pop('视图'));
    await press(h, byLabel('视图'));
    await toggle(h, '图片排序下拉框', 'document.querySelector("[aria-label=图片排序]")', listbox);
    await h.nativeKey('Escape');
    await toggle(
      h,
      '导入拆分箭头',
      byLabel('其他导入方式'),
      'document.querySelector(".nps-menu:popover-open [role=menu][aria-label=其他导入方式]")',
    );
    await press(h, byLabel('筛选'));
    await toggle(
      h,
      '日期范围月历',
      'document.querySelector("[aria-label=导入时间]")',
      pop('日期范围'),
    );
    await h.nativeKey('Escape');
    // All close routes pass through the same Layer presence handling.
    const trigger = byLabel('视图');
    for (const [label, close] of [
      ['再次点击触发器', () => press(h, trigger)],
      ['Esc', () => h.nativeKey('Escape')],
      ['点击外面', () => press(h, 'document.querySelector(".library-search input")')],
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
      'document.querySelector("[aria-label=导入时间]")',
      pop('日期范围'),
      () => click('不限时间', 'document.querySelector(".nps-date-range")'),
    );
    await h.nativeKey('Escape');
    for (const ratio of [1, 1.25, 1.5]) {
      await h.window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: 1240,
        height: 900,
        deviceScaleFactor: ratio,
        mobile: false,
      });
      await press(h, byLabel('其他导入方式'));
      await settle(h);

      await h.screenshot(`correction-split-${ratio * 100}`);
      await h.nativeKey('Escape');
    }
    await h.window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
    await e('document.querySelector(".library-card").click()');
    await wait('!!document.querySelector(".library-detail-picture img")');

    await press(h, 'document.querySelector(".library-detail-picture img")');
    await check(
      '详情图片单击打开大图',
      '!!document.querySelector(".library-viewer")',
      undefined,
      'once',
    );
    await h.nativeKey('Escape');
    await toggle(
      h,
      '加入收藏集',
      'document.querySelector(".library-detail [aria-label=加入收藏集]")',
      pop('加入收藏集'),
    );
    for (const record of records.slice(0, 2)) {
      await wait(
        `!!document.querySelector('[data-project-id="${record.id}"]')`,
        '换页后目标图片已渲染',
      );
      await e(
        `document.querySelector('[data-project-id="${record.id}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
      );
      await wait(
        `document.querySelector('.wb-page[data-project-id="${record.id}"]')?.checkVisibility() && document.querySelector('.studio-titlebar [aria-current=page]')?.textContent.trim()==='工作台'`,
        '双击的图片已完成加载并成为当前工作台页面',
      );
      if (record === records[0])
        await click('图片库', 'document.querySelector(".studio-titlebar")');
    }
    await click('工作台', 'document.querySelector(".studio-titlebar")');
    const wb = (label) =>
      `document.querySelector('.wb-prompt [aria-label=${JSON.stringify(label)}]')`;
    const menu = 'document.querySelector(".nps-menu:popover-open")';
    await toggle(h, '显示', wb('显示'), pop('显示方式'));
    await press(h, wb('显示'));
    for (const label of ['分类'])
      await toggle(
        h,
        `显示·${label}`,
        `document.querySelector('.nps-popover [aria-label="${label}"]')`,
        listbox,
      );
    await h.nativeKey('Escape');
    await toggle(h, '节菜单', wb('更多'), menu);
    await toggle(h, '块菜单', wb('块操作'), menu);
    await toggle(h, '复制拆分箭头', wb('其他复制方式'), menu);
    await click('添加角色');
    await toggle(h, '角色操作', wb('角色操作'), menu);
    await e(
      `${tag}.dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await toggle(h, '移动到', wb('移动到'), menu);
    await e(
      `${tag}.dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await toggle(
      h,
      'Tag 编辑',
      tag,
      'document.querySelector(".nps-popover:popover-open .wb-tag-editor")',
    );
    await press(h, tag);
    await toggle(h, 'Tag 分类下拉框', `document.querySelector('[aria-label="Tag 分类"]')`, listbox);
    await h.nativeKey('Escape');
    const tagLayer = 'document.querySelector(".nps-popover:popover-open:has(.wb-tag-editor)")';
    await exitCheck(h, 'Tag 内部取消按钮', tag, tagLayer, () => click('取消', editor));
    await press(h, tag);
    await settle(h);
    const second = 'document.querySelectorAll(".wb-tags .nps-tag")[1]';
    const secondText = await e(`${second}.querySelector('.nps-tag-en').textContent`);
    await press(h, second);
    await wait(
      `document.querySelector('.wb-tag-editor [aria-label=Tag]')?.value===${JSON.stringify(secondText)}`,
    );
    await check(
      '点击另一个 Tag 后仅新编辑浮层处于打开状态',
      `document.querySelectorAll('.nps-popover:popover-open .wb-tag-editor').length===1&&${editor}.querySelector('[aria-label=Tag]').value===${JSON.stringify(secondText)}`,
      undefined,
      'once',
    );
    await h.nativeKey('Escape');
    await click('更多', 'document.querySelector(".wb-section")');
    await click('切换为文本编辑', menu);

    await e(`document.querySelector('.wb-text-section textarea').focus({preventScroll:true})`);
    await settleLayout(h, '.wb-text-section textarea');

    await h.screenshot('024-raw-focused');
    await h.input('.wb-text-section textarea', 'synthetic_short');
    await h.input(
      '.wb-text-section textarea',
      Array.from({ length: 200 }, (_, i) => `synthetic_growth_${i}`).join(', '),
    );

    const raw =
      'tiny, synthetic_long_tag_alpha, medium_tag, synthetic_long_tag_beta, short, another_synthetic_tag, x, wide_synthetic_tag_gamma, last_tag\n\nsecond_block, another_long_synthetic_tag, final_marker';
    await h.input('.wb-text-section textarea', raw);
    await click('按块编辑（Ctrl E 切换）');
    await wait(
      'document.querySelector(".wb-tags")?.textContent.includes("synthetic_long_tag_alpha")',
    );
    await press(h, tag);
    await h.input('[aria-label="译文"]', '合成验收译文');
    await click('完成', editor);
    await e(`${scroll}.scrollTop=0;${frame}`);
    await settleLayout(h, '.wb-document-scroll');
    const startDrag = async (expression) => {
      const start = await center(h, expression);
      await move('mouseMoved', start);
      await move('mousePressed', start, true);
      await move('mouseMoved', { x: start.x + 10, y: start.y + 2 }, true);
      await wait('!!document.querySelector(".wb-drag-feedback")');
      return start;
    };
    const source = 'document.querySelector(".wb-tags [data-marquee-key]")';
    const start = await startDrag(source);
    for (const [label, target, screenshot] of [
      [
        'Tag 正中间',
        'document.querySelectorAll(".wb-tags")[0].querySelectorAll(".nps-tag")[1]',
        'same-block',
      ],
      [
        '两个 Tag 的缝',
        'document.querySelectorAll(".wb-tags")[0].querySelectorAll(".nps-tag")[2]',
        'gap',
      ],
      [
        '一行末尾',
        'document.querySelectorAll(".wb-tags")[0].querySelectorAll(".nps-tag")[3]',
        'row-end',
      ],
      [
        '跨行',
        'document.querySelectorAll(".wb-tags")[0].querySelectorAll(".nps-tag")[7]',
        'cross-row',
      ],
      [
        '跨块',
        'document.querySelectorAll(".wb-tags")[1].querySelector(".wb-add-trigger")',
        'cross-block',
      ],
    ]) {
      const point = await center(h, target);
      if (screenshot === 'gap' || screenshot === 'row-end') {
        Object.assign(
          point,
          await e(
            `(()=>{const nodes=[...document.querySelectorAll('.wb-tags')[0].querySelectorAll('.nps-tag')].filter(n=>getComputedStyle(n).visibility!=='hidden'),rects=nodes.map(n=>n.getBoundingClientRect());const a=rects[0],b=rects.find(r=>r.left>a.right&&Math.abs(r.top-a.top)<1);const last=rects.filter(r=>Math.abs(r.top-a.top)<1).at(-1);return ${screenshot === 'gap' ? '{x:(a.right+b.left)/2,y:a.top+a.height/2}' : '{x:last.right+2,y:last.top+last.height/2}'};})()`,
          ),
        );
      }
      await move('mouseMoved', point, true);
      await settleLayout(h, '.wb-document-scroll');
      await h.screenshot(`correction-tag-${screenshot}`);
    }

    await move('mouseMoved', { x: 10, y: 10 }, true);

    await h.nativeKey('Escape');
    await move('mouseReleased', start);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await startDrag(source);
    await move(
      'mouseMoved',
      await center(h, 'document.querySelectorAll(".wb-tags")[1].querySelector(".wb-add-trigger")'),
      true,
    );
    await wait('!!document.querySelectorAll(".wb-tags")[1].querySelector(".wb-insertion-slot")');
    await settleLayout(h, '.wb-document-scroll [data-wb-tag]');
    const landing = await center(h, 'document.querySelector(".wb-insertion-slot")');
    await move('mouseMoved', landing, true);
    await settleLayout(h, '.wb-document-scroll');
    await h.screenshot('correction-tag-cross-block');
    await move('mouseReleased', landing);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await settleLayout(h, '.wb-document-scroll [data-wb-tag]');

    const gap = 'document.querySelector(".wb-add-block-gap")';
    await move('mouseMoved', await center(h, tag));

    await move('mouseMoved', await center(h, gap));
    await wait(`getComputedStyle(${gap}.querySelector('.wb-add-block')).opacity==='1'`);

    await h.screenshot('correction-add-block');
    await move('mouseMoved', { x: 20, y: 300 });
    await e(`${gap}.querySelector('button').focus()`);
    await wait(`getComputedStyle(${gap}.querySelector('.wb-add-block')).opacity==='1'`);

    const tab = 'document.querySelector(".wb-tabs-scroll .wb-tab")';
    const origin = await startDrag(tab);

    for (const point of [
      { x: 0, y: 500 },
      { x: 1230, y: 500 },
    ]) {
      await move('mouseMoved', point, true);
    }
    await h.screenshot('correction-tab-drag');
    await h.nativeKey('Escape');
    await move('mouseReleased', origin);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await click('更多', 'document.querySelector(".wb-section")');
    await click('切换为文本编辑', menu);
    await h.input(
      '.wb-text-section textarea',
      Array.from({ length: 100 }, (_, index) => `scroll_fixture_tag_${index}`).join(', '),
    );
    await click('按块编辑（Ctrl E 切换）');
    await e(`${scroll}.scrollTop=0`);
    await startDrag(source);
    const lower = await e(
      `(()=>{const r=${scroll}.getBoundingClientRect();return {x:r.left+r.width/2,y:r.bottom-2}})()`,
    );
    await move('mouseMoved', lower, true);
    await wait(`${scroll}.scrollTop>60`, 'Tag 停在下边缘时自动向下滚动');
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
