export async function dictionaryChecks({ h, database }) {
  const { evaluate: e, wait, check, click, input, select, key, section } = h;
  h.category('设置·翻译词典');
  await section('翻译词典');
  const search = '[aria-label="搜索 Tag 或译文"]';
  const rows = 'document.querySelectorAll(".settings-table tbody tr")';
  await input(search, 'acceptance_');
  await wait(`${rows}.length === 200`);
  await check('超过一页显示分页', 'document.body.innerText.includes("第 1/2 页")');
  await click('下一页');
  await wait(`${rows}.length === 5`);
  await check('下一页显示剩余条目', 'document.body.innerText.includes("第 2/2 页")');
  await click('上一页');
  await wait(`${rows}.length === 200`);
  await input(search, 'acceptance_004');
  await wait(`${rows}.length === 1`);
  await check(
    '搜索原 Tag',
    'document.querySelector(".settings-tag").textContent === "acceptance_004"',
  );
  await input(search, '验收译文4');
  await wait(`${rows}.length === 11`);
  await check(
    '搜索译文只返回匹配结果',
    `[...${rows}].every(row=>row.cells[2].textContent.includes('验收译文4'))`,
  );
  await input(search, 'acceptance_');
  await wait(`${rows}.length === 200`);
  await click('按 Tag 分类筛选');
  await h.checkSoon(
    '分类选项有圆点和文字',
    'document.querySelectorAll(".nps-layer [role=option]").length>1 && [...document.querySelectorAll(".nps-layer [role=option]")].slice(1).every(e=>!!e.querySelector(".settings-category-dot") && !!e.textContent.trim())',
  );
  await key('Home');
  // Navigate the actual option list instead of assigning the filter in state.
  const index = await e(
    '[...document.querySelectorAll(".nps-layer [role=option]")].findIndex(e=>e.textContent.trim()==="外貌身体")',
  );
  for (let i = 0; i < index; i++) await key('ArrowDown');
  await key('Enter');
  await wait(`${rows}.length === 103`, '翻译词典按分类筛选后只剩外貌身体（103 条）');
  await check(
    '按分类筛选后只剩外貌身体',
    `[...${rows}].every(row=>row.cells[3].textContent.trim()==='外貌身体')`,
  );
  await select('按缓存来源筛选', 'AI');
  await wait(`${rows}.length === 0`);
  await check(
    '来源与分类组合筛选显示空状态',
    'document.body.innerText.includes("没有匹配的 Tag 数据")',
  );
  await select('按 Tag 分类筛选', '全部分类');
  await wait(`${rows}.length === 102`);
  await check(
    '来源筛选仅显示 AI',
    `[...${rows}].every(row=>row.cells[4].textContent.trim()==='AI')`,
  );
  await select('按缓存来源筛选', '全部来源');
  await input(search, 'acceptance_004');
  await wait(`${rows}.length === 1`);
  await click('验收译文4');
  await input('[aria-label="译文"]', '取消的译文');
  await click('取消', 'document.querySelector(".nps-popover")');
  await check(
    '编辑取消不写入词典',
    () =>
      database.lookupTagDictionary(['acceptance_004']).get('acceptance_004').translation ===
      '验收译文4',
  );
  await click('验收译文4');
  await input('[aria-label="译文"]', '已修改译文');
  await select('分类', '服装配饰');
  await click('保存', 'document.querySelector(".nps-popover")');
  await wait('document.querySelector(".settings-table tbody")?.textContent.includes("已修改译文")');
  await check(
    '保存单条译文与分类后列表更新',
    'document.querySelector(".settings-table tbody").textContent.includes("服装配饰")',
  );
  await input(search, 'acceptance_00');
  await wait(`${rows}.length === 10`);
  await click('acceptance_000');
  await click('acceptance_001');
  await select('批量设置 Tag 分类', '环境背景');
  await click('设置分类');
  await wait(`[...${rows}].slice(0,2).every(row=>row.cells[3].textContent.trim()==='环境背景')`);
  await check('批量分类仅修改所选两条', () =>
    [...database.lookupTagDictionary(['acceptance_000', 'acceptance_001']).values()].every(
      (item) => item.category === 'Environment',
    ),
  );
  await click('acceptance_000');
  await click('acceptance_001');
  await e(
    `document.querySelector('.settings-dictionary > .settings-actions .nps-button-danger').click()`,
  );
  await wait('!!document.querySelector("dialog[open]")');
  await check(
    '删除说明明确不修改原图 Prompt',
    'document.querySelector("dialog").textContent.includes("不会修改图片中已经保存的 Prompt")',
  );
  await click('取消', 'document.querySelector("dialog")');
  await check(
    '批量删除取消保留数据',
    () => database.lookupTagDictionary(['acceptance_000', 'acceptance_001']).size === 2,
  );
  await e(
    `document.querySelector('.settings-dictionary > .settings-actions .nps-button-danger').click()`,
  );
  await click('删除 2 条', 'document.querySelector("dialog")');
  await wait(`${rows}.length === 8`);
  await check(
    '批量删除确认删除所选条目',
    () => database.lookupTagDictionary(['acceptance_000', 'acceptance_001']).size === 0,
  );
  await h.screenshot('dictionary');
}
