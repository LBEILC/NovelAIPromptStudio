import { scrollChecks } from './scroll.js';
import { clipboard } from 'electron';
export async function dictionaryChecks({ h, database, preferences, mode }) {
  const { evaluate: e, wait, check, click, input, select, key, section } = h;
  h.category('设置·翻译词典');
  const usage = await database.tagImageCounts();
  const mostUsed = [...usage].sort((a, b) => b[1] - a[1])[0];
  if (mostUsed)
    database.updateTagDictionary(mostUsed[0], {
      translation: '合成使用次数译文',
      category: 'Body',
    });
  await section('翻译词典');
  const search = '[aria-label="搜索 Tag 或译文"]';
  const rows = 'document.querySelectorAll(".settings-table tr[data-tag]")';
  const count = 'Number(document.querySelector(".settings-table").getAttribute("aria-rowcount"))-1';
  const tab = async (label) => {
    await e(
      `[...document.querySelectorAll('[role=tab]')].find(t=>t.textContent.startsWith(${JSON.stringify(label)})).click()`,
    );
  };
  if (mostUsed) {
    await wait(`!!document.querySelector('tr[data-tag] .settings-usage button')`);
    await check(
      '默认排序把使用图片最多的 Tag 放在首位',
      `Number(document.querySelector('tr[data-tag] .settings-usage button').textContent)===${mostUsed[1]}`,
    );
    const tag = await e(`document.querySelector('tr[data-tag]').dataset.tag`);
    await e(`document.querySelector('tr[data-tag] .settings-usage button').click()`);
    await wait('!!document.querySelector(".gallery-search input")');
    await check(
      '点击使用数量切换图库并搜索对应 Tag',
      `document.querySelector('.gallery-search input').value.replaceAll('_',' ')===${JSON.stringify(tag.replaceAll('_', ' '))}`,
    );
    await input('.gallery-search input', '');
    await section('翻译词典');
  }
  await input(search, 'acceptance_');
  await wait(`${count}===205`);
  await check(
    '词典连续滚动只渲染窗口内条目',
    `${rows}.length>0 && ${rows}.length<205 && !document.body.innerText.includes('下一页')`,
  );
  await check(
    '分页签数量包含全部词典条目',
    `[...document.querySelectorAll('.settings-dictionary-views [role=tab]')].length===5 && Number(document.querySelector('.settings-dictionary-views [role=tab] span').textContent.replaceAll(',',''))>=205`,
  );
  await tab('AI 翻译的');
  await wait(`${count}===102`);
  await check(
    'AI 分页签仅显示 AI 来源',
    `[...${rows}].every(row=>row.querySelector('.settings-source').textContent==='AI')`,
  );
  await tab('你改过的');
  await wait(`${count}===103`);
  await check(
    '手动来源优先',
    `[...${rows}].every(row=>row.querySelector('.settings-source').textContent==='你改过')`,
  );
  for (const label of ['没有译文', '未分类']) {
    await tab(label);
    await wait(`${count}===0`);
    await check(
      `${label}分页签按当前筛选显示空状态`,
      'document.body.innerText.includes("没有匹配的 Tag 数据")',
    );
  }
  await tab('全部');
  await select('排序', '按 Tag');
  await wait(`${count}===205`);
  await check(
    '按 Tag 排序',
    `document.querySelector('tr[data-tag]').dataset.tag==='acceptance_000'`,
  );
  await select('按 Tag 分类筛选', '外貌身体');
  await wait(`${count}===103`);
  await check(
    '分类筛选覆盖窗口之外的条目',
    `[...${rows}].every(row=>row.cells[3].textContent.includes('外貌身体'))`,
  );
  await select('按 Tag 分类筛选', '全部分类');
  await input(search, 'acceptance_004');
  await wait(`${count}===1`);
  await click('验收译文4');
  await input('[aria-label="译文"]', '取消的译文');
  await key('Escape', {}, 'document.activeElement');
  await check(
    'Esc 取消就地编辑不写入',
    () =>
      database.lookupTagDictionary(['acceptance_004']).get('acceptance_004').translation ===
      '验收译文4',
  );
  await input(search, 'acceptance_00');
  await wait(`${count}===10`);
  await click('验收译文4');
  await input('[aria-label="译文"]', '已修改译文');
  await key('Enter', {}, 'document.activeElement');
  await wait(
    `document.querySelector('[aria-label="译文"]')?.closest('tr')?.dataset.tag==='acceptance_005'`,
  );
  await check(
    '回车保存并跳到下一行译文',
    () =>
      database.lookupTagDictionary(['acceptance_004']).get('acceptance_004').translation ===
      '已修改译文',
  );
  await input('[aria-label="译文"]', '第五条译文');
  await key('Tab', {}, 'document.activeElement');
  await wait(`document.activeElement?.getAttribute('aria-label')==='分类：acceptance_005'`);
  await check(
    'Tab 保存并聚焦分类',
    () =>
      database.lookupTagDictionary(['acceptance_005']).get('acceptance_005').translation ===
      '第五条译文',
  );
  await click('分类：acceptance_005');
  await click('环境背景', 'document.querySelector(".nps-layer")');
  await wait(
    `document.querySelector('tr[data-tag="acceptance_005"]')?.textContent.includes('环境背景')`,
  );
  await check(
    '分类菜单保存单条分类',
    () =>
      database.lookupTagDictionary(['acceptance_005']).get('acceptance_005').category ===
      'Environment',
  );
  await h.screenshot('dictionary-inline');
  await select('排序', '最近修改');
  await check(
    '最近修改排序将刚改分类的条目放在首位',
    `document.querySelector('tr[data-tag]').dataset.tag==='acceptance_005'`,
  );
  await select('排序', '按 Tag');
  await input(search, 'acceptance_');
  await wait(`${count}===205`);
  await click('选择当前分页签');
  await check(
    '全选包含窗口外全部筛选结果',
    'document.querySelector(".settings-dictionary-selection").textContent.includes("已选 205 条")',
  );
  await check(
    '未配置 AI 不可重新翻译',
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='用 AI 重新翻译');return b.disabled||b.getAttribute('aria-disabled')==='true'})()`,
  );
  await h.screenshot('dictionary-selection');
  await click('设置分类', 'document.querySelector(".settings-dictionary-selection")');
  await click('环境背景', 'document.querySelector(".nps-layer")');
  await wait(`[...${rows}].every(row=>row.cells[3].textContent.includes('环境背景'))`);
  await check(
    '批量分类包含未渲染条目',
    () =>
      database.lookupTagDictionary(['acceptance_204']).get('acceptance_204').category ===
      'Environment',
  );
  await input(search, 'acceptance_004');
  await wait(`${count}===1`);
  await click('更多：acceptance_004');
  await check(
    '手动条目更多菜单显示还原',
    'document.querySelector(".nps-layer").textContent.includes("还原")',
  );
  await h.screenshot('dictionary-more');
  await click('还原', 'document.querySelector(".nps-layer")');
  await click('取消', 'document.querySelector("dialog")');
  await check(
    '取消还原保留数据',
    () => database.lookupTagDictionary(['acceptance_004']).size === 1,
  );
  await click('更多：acceptance_004');
  await click('还原', 'document.querySelector(".nps-layer")');
  await click('还原', 'document.querySelector("dialog")');
  await wait(`${count}===0`);
  await check(
    '还原移除当前词典记录',
    () => database.lookupTagDictionary(['acceptance_004']).size === 0,
  );
  await input(search, 'acceptance_');
  await wait(`${count}===204`);
  await e(`document.querySelector('.settings-table-scroll').scrollTop=1e7`);
  await wait(`!!document.querySelector('tr[data-tag="acceptance_204"]')`);
  await check(
    '窗口化列表滚到底仍显示最后一条',
    `!!document.querySelector('tr[data-tag="acceptance_204"]')`,
  );
  await scrollChecks(h, '.settings-table-scroll');
  await h.screenshot('dictionary');
  await input(search, 'acceptance_204');
  await wait(`${count}===1`);
  await h.checkSoon(
    '筛选缩短内容后细条隐藏且不保留虚假滚动高度',
    `(()=>{const n=document.querySelector('.settings-table-scroll');return n.querySelector('.nps-scroll-thumb').hidden && n.scrollHeight===n.clientHeight && n.scrollTop===0})()`,
  );
  database.updateTagDictionary('view_fixture_empty', { translation: '', category: 'Body' });
  database.updateTagDictionary('view_fixture_unsorted', {
    translation: '合成未分类',
    category: 'Unsorted',
  });
  await section('外观');
  await section('翻译词典');
  await input(search, 'view_fixture_');
  await tab('没有译文');
  await wait(`${count}===1`);
  await click('点击填写');
  await input('[aria-label="译文"]', '填写后的译文');
  await key('Enter', {}, 'document.activeElement');
  await wait(
    `document.querySelector('tr[data-tag="view_fixture_empty"]')?.textContent.includes('填写后的译文')`,
  );
  await check('没有译文分页签编辑后保留当前行', `${count}===1`);
  await tab('全部');
  await tab('没有译文');
  await wait(`${count}===0`);
  await check('离开分页签后已补译文的行不再匹配', `${count}===0`);
  await tab('未分类');
  await wait(`${count}===1`);
  await click('分类：view_fixture_unsorted');
  await click('服装配饰', 'document.querySelector(".nps-layer")');
  await wait(
    `document.querySelector('tr[data-tag="view_fixture_unsorted"]')?.textContent.includes('服装配饰')`,
  );
  await check('未分类分页签分类后保留当前行', `${count}===1`);
  await tab('全部');
  await tab('未分类');
  await wait(`${count}===0`);
  await check('切换分页签后已分类行不再匹配', `${count}===0`);
  await tab('全部');
  const prior = preferences.credentials();
  const aiTags = Array.from(
    { length: 55 },
    (_, i) => `dictionary_fixture_${String(i).padStart(3, '0')}`,
  );
  const original = () =>
    aiTags.forEach((tag) =>
      database.updateTagDictionary(tag, { translation: '重译前', category: 'Body' }),
    );
  const configure = async (model) => {
    preferences.saveAISettings({ baseUrl: mode.baseUrl, model });
    await section('外观');
    await section('翻译词典');
    await input(search, 'dictionary_fixture_');
    await wait(`${count}===55`);
    await click('选择当前分页签');
  };
  try {
    original();
    await configure('dictionary-success');
    await click('用 AI 重新翻译');
    await h.until(
      () =>
        [...database.lookupTagDictionary(aiTags).values()].every(
          (item) => item.translation === '合成重译结果',
        ),
      '两批 AI 重译完成',
    );
    await check(
      'AI 重译成功覆盖全部 55 条并更新来源',
      () =>
        [...database.lookupTagDictionary(aiTags).values()].every(
          (item) => item.translation_source === 'ai' && item.category_source === 'ai',
        ),
      undefined,
      'once',
    );
    await wait(
      'document.querySelector(".settings-dictionary-progress")?.textContent.includes("55 / 55")',
    );
    await click('更多：dictionary_fixture_000');
    await click('复制 Tag', 'document.querySelector(".nps-layer")');
    await h.until(() => clipboard.readText() === 'dictionary fixture 000', '词典复制 Tag 完成');
    await check(
      '更多菜单复制空格形式的 Tag',
      () => clipboard.readText() === 'dictionary fixture 000',
      undefined,
      'once',
    );
    await click('更多：dictionary_fixture_000');
    await click('删除，下次重新翻译', 'document.querySelector(".nps-layer")');
    await click('删除 1 条', 'document.querySelector("dialog")');
    await wait(`${count}===54`);
    await check(
      '非手动条目删除当前记录',
      () => database.lookupTagDictionary([aiTags[0]]).size === 0,
      undefined,
      'once',
    );
    await click('更多：dictionary_fixture_001');
    await click('在图片库里查找', 'document.querySelector(".nps-layer")');
    await wait('!!document.querySelector(".gallery-search input")');
    await check(
      '更多菜单在图片库搜索对应 Tag',
      'document.querySelector(".gallery-search input").value.replaceAll("_"," ") === "dictionary fixture 001"',
    );
    await input('.gallery-search input', '');
    original();
    await configure('dictionary-partial');
    await click('用 AI 重新翻译');
    await wait(
      'document.querySelector(".settings-dictionary-progress")?.textContent.includes("55 / 55") && document.querySelector(".settings-dictionary-progress")?.textContent.includes("50 条失败")',
    );
    await check(
      'AI 部分失败保留前 50 条并提交最后 5 条',
      () => {
        const items = database.lookupTagDictionary(aiTags);
        return aiTags.every(
          (tag, i) => items.get(tag).translation === (i < 50 ? '重译前' : '合成重译结果'),
        );
      },
      undefined,
      'once',
    );
    original();
    await configure('dictionary-cancel');
    await click('用 AI 重新翻译');
    await wait(
      'document.querySelector(".settings-dictionary-progress")?.textContent.includes("0 / 55")',
    );
    await click('取消', 'document.querySelector(".settings-dictionary-selection")');
    await wait(
      'document.querySelector(".settings-dictionary-progress")?.textContent.includes("已取消")',
    );
    await check(
      '取消 AI 请求保留未完成批次原值',
      () =>
        [...database.lookupTagDictionary(aiTags).values()].every(
          (item) => item.translation === '重译前',
        ),
      undefined,
      'once',
    );
  } finally {
    preferences.saveAISettings(prior);
  }
}
