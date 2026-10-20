import { parsePrompt } from '../../src/lib/prompt.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';
import { localDateKey } from '../../src/lib/dateRange.js';
import { collectionContext } from './libraryFinish.js';
import { settleLayout } from './layout.js';

export async function libraryRefinementChecks({ h, database }) {
  h.category('图片库·027');
  h.dualThemes(true);
  const { evaluate: e, wait, click, input, key, check } = h;
  const ids = [];
  const collections = [];
  const source = database.loadLibrary('all')[0];
  const today = localDateKey(new Date());
  const previous = new Date();
  previous.setDate(previous.getDate() - 3);
  const earlier = localDateKey(previous);
  const settle = () => wait('!document.querySelector("[data-library-updating=true]")');
  const count = () =>
    e(
      'Number(document.querySelector(".library-count").textContent.match(/(?:·\\s*)?(\\d+) 张/)[1])',
    );
  const close = () => key('Escape', {}, 'document.activeElement');
  const screenshot = async (name) => {
    await settleLayout(h, '.library-page,.nps-popover:popover-open');
    await h.screenshot(name);
  };
  try {
    for (let index = 0; index < 11; index++) {
      const id = `027-refinement-${index}`;
      const metadata = {
        model: 'synthetic',
        width: 832,
        height: 1216,
        prompt_raw:
          index < 9
            ? `refinement group${index % 2 ? ', round shape' : ''}`
            : `refinement single ${index}`,
      };
      database.insertProject({
        ...source,
        id,
        name: `027 sample ${index}`,
        content_hash: id,
        metadata,
        tags: parsePrompt(metadata.prompt_raw),
        prompt_structure: createPromptStructure(metadata),
        created_at: new Date().toISOString(),
      });
      ids.push(id);
    }
    database.updateProjectNames(
      ids.map((id, index) => ({ id, name: `027 sample ${index}`, has_custom_name: true })),
    );
    await h.reload();
    await click('图片库', 'document.querySelector(".studio-titlebar")');
    await click('全部图片', 'document.querySelector(".library-side")');
    await input('[aria-label="搜索图片库"]', '');
    if (
      await e(
        '!![...document.querySelectorAll(".library-chips button")].find(b=>b.textContent.trim()==="清除")',
      )
    )
      await click('清除', 'document.querySelector(".library-chips")');
    await click('筛选');
    await click('导入时间');
    await click('最近 7 天', 'document.querySelector(".nps-date-quick")');
    await settle();
    await check(
      '027 快捷日期生效并只关闭月历',
      '!document.querySelector(".nps-date-range")&&document.querySelector("[aria-label=导入时间]").textContent.includes("最近 7 天")&&document.querySelector(".library-chip").textContent.includes("最近 7 天")',
    );
    await click('导入时间');
    await e(`document.querySelector('[data-date="${today}"]').click()`);
    await e(`document.querySelector('[data-date="${earlier}"]')?.click()`);
    // Cross-month ranges use the date field if the earlier day is outside this page.
    if (earlier.slice(0, 7) !== today.slice(0, 7)) {
      await input('[aria-label="开始日期"]', earlier);
      await key('Enter', {}, 'document.activeElement');
    }
    await settle();
    const todayCount = database
      .loadLibrary('all')
      .filter((project) => localDateKey(new Date(project.created_at)) === today).length;
    await wait(
      `document.querySelector('[data-date="${today}"]')?.dataset.tip==='导入了 ${todayCount} 张'`,
    );
    await check(
      '027 反向选择对调日期，导入日显示当前范围真实数量',
      `document.querySelector('.library-chip').textContent.includes('${earlier} 至 ${today}')&&!!document.querySelector('[data-date="${today}"] .dot')&&document.querySelector('[data-date="${today}"]').dataset.tip==='导入了 ${todayCount} 张'`,
    );
    await check(
      '027 月历及日期输入框完整显示在浮层内',
      `(()=>{const layer=document.querySelector('.nps-date-range').closest('.nps-popover'),r=layer.getBoundingClientRect();return [...layer.querySelectorAll('.nps-date-day,.nps-date-inputs input')].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right+1&&b.top>=r.top&&b.bottom<=r.bottom&&b.width>20&&b.height>20})})()`,
    );
    await screenshot('027-library-calendar');
    await input('[aria-label="开始日期"]', '2026-13-01');
    await key('Enter', {}, 'document.activeElement');
    await check(
      '027 非法日期还原并标记输入错误',
      `document.querySelector('[aria-label="开始日期"]').value==='${earlier}'&&document.querySelector('[aria-label="开始日期"]').closest('.nps-field').classList.contains('nps-field-error')`,
    );
    await close();
    await check(
      '027 Esc 只关闭月历，保留筛选',
      '!document.querySelector(".nps-date-range")&&!!document.querySelector(".library-filter-panel")',
    );
    await click('清除', 'document.querySelector(".library-filter-panel")');
    await close();
    await click('新建收藏集');
    await input('.library-side input', '027 手动收藏集');
    await key('Enter', {}, 'document.activeElement');
    await wait(`!!document.querySelector('.library-side [aria-label="027 手动收藏集"]')`);
    const manual = database
      .listCollections()
      .find((collection) => collection.name === '027 手动收藏集');
    collections.push(manual.id);
    await check(
      '027 新建收藏集使用行内编辑',
      `!document.querySelector("dialog[open]")&&!!document.querySelector('.library-side [aria-label="027 手动收藏集"]')`,
    );
    await collectionContext(h, manual.id, '重命名');
    await input('.library-side input', '027 已改名');
    await key('Enter', {}, 'document.activeElement');
    await h.until(
      () => database.listCollections().some((collection) => collection.name === '027 已改名'),
      '027 收藏集改名落库',
    );
    await collectionContext(h, manual.id, '删除');
    await click('删除', 'document.querySelector("dialog[open]")');
    await h.until(
      () => !database.listCollections().some((collection) => collection.id === manual.id),
      '027 收藏集已删除',
    );
    await click('全部图片', 'document.querySelector(".library-side")');
    await click('视图');
    const heights = [];
    for (const label of ['基础相同', '不合并', '相似']) {
      await click(label, 'document.querySelector("[aria-label=合并方式]")');
      await settle();
      heights.push(
        await e(
          'document.querySelector(".nps-popover:popover-open").getBoundingClientRect().height',
        ),
      );
      if (label !== '相似')
        await check(
          `027 ${label} 禁用相似度`,
          'document.querySelector("[aria-label=相似度]").getAttribute("aria-disabled")==="true"',
        );
    }
    await check(
      '027 切换三种合并方式时视图浮层高度不变',
      () => Math.max(...heights) - Math.min(...heights) < 1,
    );
    await screenshot('027-library-view');
    await click('不合并', 'document.querySelector("[aria-label=合并方式]")');
    await close();
    await click('筛选');
    await input('[aria-label="包含 Tag"]', 'refinement group');
    await key('Enter', {}, 'document.activeElement');
    await settle();
    const beforeSmart = await count();
    await click('存为智能收藏集');
    await wait('!!document.querySelector(".library-side input")');
    const smart = database
      .listCollections()
      .find((collection) => collection.name === 'refinement group');
    collections.push(smart.id);
    await check(
      '027 智能收藏集以条件值命名并全选，网格数量保持',
      async () =>
        (await count()) === beforeSmart &&
        (await e(
          'document.activeElement===document.querySelector(".library-side input")&&document.activeElement.selectionStart===0&&document.activeElement.selectionEnd===document.activeElement.value.length',
        )),
    );
    await key('Enter', {}, 'document.activeElement');
    await check(
      '027 智能规则只读且可编辑',
      '!document.querySelector(".library-chips [aria-label^=移除]")&&document.querySelector(".library-chips").textContent.includes("编辑规则")',
    );
    await click('编辑规则');
    await input('[aria-label="排除 Tag"]', 'round shape');
    await key('Enter', {}, 'document.activeElement');
    await settle();
    await check('027 编辑规则实时减少结果', async () => (await count()) < beforeSmart);
    await screenshot('027-library-edit-rules');
    await close();
    await settle();
    await check(
      '027 Esc 放弃草稿并恢复规则和网格',
      async () =>
        (await count()) === beforeSmart &&
        !database.listCollections().find((collection) => collection.id === smart.id).filters
          .excludeTags.length,
    );
    await click('编辑规则');
    await input('[aria-label="排除 Tag"]', 'round shape');
    await key('Enter', {}, 'document.activeElement');
    await click('保存规则');
    await h.until(
      () =>
        database
          .listCollections()
          .find((collection) => collection.id === smart.id)
          .filters.excludeTags.includes('round shape'),
      '027 规则保存',
    );
    await check(
      '027 保存规则更新只读条件行',
      'document.querySelector(".library-chips").textContent.includes("round shape")',
    );
    await click('全部图片', 'document.querySelector(".library-side")');
    await input('[aria-label="搜索图片库"]', '027 sample');
    await settle();
    await e('document.querySelector(".library-card").click()');
    await wait(
      '!!document.querySelector(".library-name")&&document.querySelector(".library-detail").getAttribute("aria-busy")==="false"&&document.querySelector(".library-detail").dataset.detailId===document.querySelector(".library-card.current").dataset.projectId',
    );
    await e('document.querySelector(".library-name").click()');
    await input('.library-inline-name input', '027 sample renamed');
    await screenshot('027-library-inline-name');
    await key('Enter', {}, 'document.activeElement');
    await wait('document.querySelector(".library-name")?.textContent==="027 sample renamed"');
    await check(
      '027 行内起名同步详情和卡片',
      `!!document.querySelector('.library-card[aria-label="027 sample renamed"]')`,
    );
    await e(
      `document.querySelectorAll('.library-card')[1].dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await wait('document.querySelectorAll(".library-card.picked").length===2');
    await check(
      '027 Ctrl/Cmd 点另一张选中两张并显示单张计数',
      'document.querySelector(".library-summary b").textContent==="已选 2 张"&&document.querySelector(".library-detail-bar").textContent.includes("在工作台打开 2 张")',
    );
    await screenshot('027-library-multiple');
    await click('取消选择', 'document.querySelector(".library-detail-bar")');
    await click('视图');
    await click('完全相同', 'document.querySelector("[aria-label=合并方式]")');
    await close();
    await settle();
    await check(
      '027 分组角标在非悬停时一直显示',
      `(()=>{const badge=document.querySelector('.library-stack');return !!badge&&getComputedStyle(badge).opacity==='1'&&!!badge.querySelector('.ri-stack-line')})()`,
    );
    await click('筛选');
    await input('[aria-label="包含 Tag"]', 'round shape');
    await key('Enter', {}, 'document.activeElement');
    await close();
    await settle();
    const ordinaryCount = await count();
    await e(`document.querySelector('[data-collection-id="${collections.at(-1)}"]').click()`);
    await settle();
    await check('027 智能收藏集不叠加普通筛选', async () => (await count()) === 5);
    await click('全部图片', 'document.querySelector(".library-side")');
    await settle();
    await check(
      '027 回到全部图片恢复普通筛选',
      async () => (await count()) === ordinaryCount && ordinaryCount === 4,
    );
  } finally {
    for (const id of collections)
      if (database.listCollections().some((collection) => collection.id === id))
        database.deleteCollection(id);
    for (const id of ids) database.deleteProject(id);
    await h.reload();
  }
}
