import { selectGalleryGrouping } from './galleryView.js';
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
    e('Number(document.querySelector(".lcount")?.textContent.match(/(?:·\\s*)?(\\d+) 张/)?.[1])');
  const close = () => key('Escape', {}, 'document.activeElement');
  const screenshot = async (name) => {
    await settleLayout(h, '.libp,.popover:not(.leaving)');
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
    await click('图片库', 'document.querySelector(".tb")');
    await click('全部图片', 'document.querySelector(".libp .side")');
    await input('[aria-label="搜索图片库"]', '');
    if (
      await e(
        '!![...document.querySelectorAll(".lchips.open button")].find(b=>b.textContent.trim()==="清除")',
      )
    )
      await click('清除', 'document.querySelector(".lchips")');
    await click('筛选');
    await e('document.querySelector("[data-trigger=lcal]").click()');
    await click('最近 7 天', 'document.querySelector(".lcal-quick")');
    await settle();
    await check(
      '027 快捷日期生效并只关闭月历',
      '!document.querySelector(".lcal")&&document.querySelector("[data-trigger=lcal]").textContent.includes("最近 7 天")&&document.querySelector(".chip").textContent.includes("最近 7 天")',
    );
    await e('document.querySelector("[data-trigger=lcal]").click()');
    await e(
      `[...document.querySelectorAll('.lcal-d')].find(n=>n.querySelector('span').textContent==='${Number(today.slice(8))}').click()`,
    );
    await e(
      `[...document.querySelectorAll('.lcal-d')].find(n=>n.querySelector('span').textContent==='${Number(earlier.slice(8))}')?.click()`,
    );
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
      `[...document.querySelectorAll('.lcal-d')].find(n=>n.querySelector('span').textContent==='${Number(today.slice(8))}')?.dataset.tip==='导入了 ${todayCount} 张'`,
    );
    await check(
      '027 反向选择对调日期，导入日显示当前范围真实数量',
      `document.querySelector('.chip').textContent.includes('${earlier} 至 ${today}')&&!![...document.querySelectorAll('.lcal-d')].find(n=>n.querySelector('span').textContent==='${Number(today.slice(8))}')?.querySelector('.dot')&&[...document.querySelectorAll('.lcal-d')].find(n=>n.querySelector('span').textContent==='${Number(today.slice(8))}').dataset.tip==='导入了 ${todayCount} 张'`,
    );

    await screenshot('027-library-calendar');
    await input('[aria-label="开始日期"]', '2026-13-01');
    await key('Enter', {}, 'document.activeElement');
    await check(
      '027 非法日期还原并标记输入错误',
      `document.querySelector('[aria-label="开始日期"]').value==='${earlier}'&&document.querySelector('[aria-label="开始日期"]').closest('.field').classList.contains('is-error')`,
    );
    await close();
    await check(
      '027 Esc 只关闭月历，保留筛选',
      '!document.querySelector(".lcal")&&!!document.querySelector(".lfilter")',
    );
    await click('清除', 'document.querySelector(".lfilter")');
    await close();
    await click('新建收藏集');
    await input('.libp .side input', '027 手动收藏集');
    await key('Enter', {}, 'document.activeElement');
    await wait(
      `!![...document.querySelectorAll('.libp .side .nm')].find(n=>n.textContent==='027 手动收藏集')`,
    );
    const manual = database
      .listCollections()
      .find((collection) => collection.name === '027 手动收藏集');
    collections.push(manual.id);
    await check(
      '027 新建收藏集使用行内编辑',
      `!document.querySelector("[role=dialog]:not(.leaving *)")&&!![...document.querySelectorAll('.libp .side .nm')].find(n=>n.textContent==='027 手动收藏集')`,
    );
    await collectionContext(h, manual.id, '重命名');
    await input('.libp .side input', '027 已改名');
    await key('Enter', {}, 'document.activeElement');
    await h.until(
      () => database.listCollections().some((collection) => collection.name === '027 已改名'),
      '027 收藏集改名落库',
    );
    await collectionContext(h, manual.id, '删除');
    await click('删除', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await h.until(
      () => !database.listCollections().some((collection) => collection.id === manual.id),
      '027 收藏集已删除',
    );
    await click('全部图片', 'document.querySelector(".libp .side")');
    await click('视图');
    for (const label of ['基础相同', '不合并', '相似']) {
      await selectGalleryGrouping(h, label);
      await settle();
    }

    await screenshot('027-library-view');
    await selectGalleryGrouping(h, '不合并');
    await close();
    await click('筛选');
    await input('[aria-label="包含的 Tag"]', 'refinement group');
    await key('Enter', {}, 'document.activeElement');
    await settle();
    await h.until(async () => (await count()) === 9, '包含规则的九张合成图片已显示');
    const beforeSmart = await count();
    await click('存为智能收藏集');
    await wait('!!document.querySelector(".libp .side input")');
    const smart = database
      .listCollections()
      .find((collection) => collection.name === 'refinement group');
    collections.push(smart.id);
    await check(
      '027 智能收藏集以条件值命名并全选，网格数量保持',
      async () =>
        (await count()) === beforeSmart &&
        (await e(
          'document.activeElement===document.querySelector(".libp .side input")&&document.activeElement.selectionStart===0&&document.activeElement.selectionEnd===document.activeElement.value.length',
        )),
    );
    await key('Enter', {}, 'document.activeElement');
    await check(
      '027 智能规则只读且可编辑',
      '!document.querySelector(".lchips [aria-label^=移除]")&&document.querySelector(".lchips").textContent.includes("编辑规则")',
    );
    await click('编辑规则');
    await input('[aria-label="排除的 Tag"]', 'round shape');
    await key('Enter', {}, 'document.activeElement');
    await settle();
    await h.until(async () => (await count()) === 5, '排除规则结果已更新');
    await check('027 编辑规则实时减少结果', async () => (await count()) < beforeSmart);
    await screenshot('027-library-edit-rules');
    await close();
    await h.until(async () => (await count()) === beforeSmart, '放弃草稿后网格恢复已保存规则');
    await check(
      '027 Esc 放弃草稿并恢复规则和网格',
      async () =>
        (await count()) === beforeSmart &&
        !database.listCollections().find((collection) => collection.id === smart.id).filters
          .excludeTags.length,
    );
    await click('编辑规则');
    await input('[aria-label="排除的 Tag"]', 'round shape');
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
    await wait(
      '[...document.querySelectorAll(".lchips.open button")].some(n=>n.textContent.trim()==="编辑规则") && !document.querySelector(".popover:not(.leaving) .lfilter")',
      '027 规则保存完成并回到只读状态',
    );
    await check(
      '027 保存规则更新只读条件行',
      'document.querySelector(".lchips").textContent.includes("round shape")',
    );
    await click('全部图片', 'document.querySelector(".libp .side")');
    await input('[aria-label="搜索图片库"]', '027 sample');
    await settle();
    await e('document.querySelector(".card").click()');
    await wait(
      '!!document.querySelector(".lname")&&document.querySelector(".col.detail").dataset.detailId===document.querySelector(".card.on").dataset.groupId.replace("project:","")',
    );
    await e('document.querySelector(".lname").click()');
    await input('.lname-edit input', '027 sample renamed');
    await screenshot('027-library-inline-name');
    await key('Enter', {}, 'document.activeElement');
    await wait('document.querySelector(".lname")?.textContent==="027 sample renamed"');
    await check(
      '027 行内起名同步详情和卡片',
      `!!document.querySelector('.card[aria-label="027 sample renamed"]')`,
    );
    await e(
      `document.querySelectorAll('.card')[1].dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await wait('document.querySelectorAll(".card.picked").length===2');
    await check(
      '027 Ctrl/Cmd 点另一张选中两张并显示单张计数',
      'document.querySelector(".detail .sum b").textContent==="已选 2 张"&&document.querySelector(".detail").textContent.includes("在工作台打开 2 张")',
    );
    await screenshot('027-library-multiple');
    await click('取消选择', 'document.querySelector(".detail .bar")');
    await click('视图');
    await selectGalleryGrouping(h, '完全相同');
    await close();
    await settle();

    await click('筛选');
    await input('[aria-label="包含的 Tag"]', 'round shape');
    await wait(
      '[...document.querySelectorAll(".complete:not(.leaving) .mi")].some(n=>n.textContent.includes("round shape"))',
    );
    await key('Enter', {}, 'document.activeElement');
    await wait('document.querySelector(".lchips")?.textContent.includes("round shape")');
    await close();
    await h.until(async () => (await count()) === 4, '027 普通包含条件已更新网格');
    const ordinaryCount = await count();
    await e(`document.querySelector('[data-key="sv-${collections.at(-1)}"]').click()`);
    await h.until(async () => (await count()) === 5, '027 智能收藏集规则已更新网格');
    await check('027 智能收藏集不叠加普通筛选', async () => (await count()) === 5);
    await click('全部图片', 'document.querySelector(".libp .side")');
    await h.until(async () => (await count()) === ordinaryCount, '027 全部图片的普通筛选已恢复');
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
