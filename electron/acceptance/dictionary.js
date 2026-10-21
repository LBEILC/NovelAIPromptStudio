import { scrollChecks } from './scroll.js';
import { clipboard } from 'electron';
export async function dictionaryChecks({ h, database, preferences, mode }) {
  const { evaluate: e, wait, check, input, select, key, section } = h;
  h.category('设置·翻译词典');
  const click = async (label, ...rest) => {
    if (label.startsWith('更多：'))
      return h.click(
        '更多',
        'document.querySelector(' +
          JSON.stringify('[data-dxrow="' + label.slice(3) + '"]:not(.leaving *)') +
          ')',
      );
    if (label.startsWith('分类：'))
      return e(
        'document.querySelector(' +
          JSON.stringify('[data-dxrow="' + label.slice(3) + '"]:not(.leaving *) [data-cat]') +
          ').click()',
      );
    return h.click(label, ...rest);
  };
  const usage = await database.tagImageCounts();
  const mostUsed = [...usage].sort((a, b) => b[1] - a[1])[0];
  if (mostUsed)
    database.updateTagDictionary(mostUsed[0], {
      translation: '合成使用次数译文',
      category: 'Body',
    });
  await section('翻译词典');
  const search = '.dict [aria-label="搜索 Tag 或译文"]';
  const rows = 'document.querySelectorAll(".dict [data-dxrow]")';
  const count =
    'Number(document.querySelector(".dict-more").textContent.replaceAll(",", "").match(/[0-9]+/)?.[0] || 0)';
  const tab = async (label) => {
    await e(
      `[...document.querySelectorAll('[role=tab]')].find(t=>t.textContent.startsWith(${JSON.stringify(label)})).click()`,
    );
  };
  if (mostUsed) {
    await wait(`!!document.querySelector('[data-dxrow] .num button')`);
    await check(
      '默认排序把使用图片最多的 Tag 放在首位',
      `Number(document.querySelector('[data-dxrow] .num button').textContent)===${mostUsed[1]}`,
    );
    const tag = await e(`document.querySelector('[data-dxrow]').dataset.dxrow`);
    await e(`document.querySelector('[data-dxrow] .num button').click()`);
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
    `[...document.querySelectorAll('.dict-views [role=tab]')].length===5 && Number(document.querySelector('.dict-views [role=tab] span').textContent.replaceAll(',',''))>=205`,
  );
  await tab('AI 翻译');
  await wait(`${count}===102`);
  await check(
    'AI 分页签仅显示 AI 来源',
    `[...${rows}].every(row=>row.querySelector('.src').textContent==='AI')`,
  );
  await tab('已修改');
  await wait(`${count}===103`);
  await check(
    '手动来源优先',
    `[...${rows}].every(row=>row.querySelector('.src').textContent==='已修改')`,
  );
  for (const label of ['暂无译文', '未分类']) {
    await tab(label);
    await wait(`${count}===0`);
    await check(
      `${label}分页签按当前筛选显示空状态`,
      'document.body.innerText.includes("没有找到匹配的 Tag")',
    );
  }
  await tab('全部');
  await select('排序', '按 Tag 名称');
  await wait(`${count}===205`);
  await check(
    '按 Tag 排序',
    `document.querySelector('[data-dxrow]').dataset.dxrow==='acceptance_000'`,
  );
  await select('按分类筛选', '外貌身体');
  await wait(`${count}===103`);
  await check(
    '分类筛选覆盖窗口之外的条目',
    `[...${rows}].every(row=>row.children[3].textContent.includes('外貌身体'))`,
  );
  await select('按分类筛选', '全部分类');
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
  await click('验收译文4');
  await input('[aria-label="译文"]', '点外部保存译文');
  await e(
    `document.querySelector('.dict h1').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`,
  );
  await wait(
    '!document.querySelector(\'[aria-label="译文"]\') && document.body.innerText.includes("点外部保存译文")',
  );
  await check(
    '点击编辑行外保存译文',
    () =>
      database.lookupTagDictionary(['acceptance_004']).get('acceptance_004').translation ===
      '点外部保存译文',
  );
  await input(search, 'acceptance_00');
  await wait(`${count}===10`);
  await click('点外部保存译文');
  await input('[aria-label="译文"]', '已修改译文');
  await key('Enter', {}, 'document.activeElement');
  await wait(
    `document.querySelector('[aria-label="译文"]')?.closest('[data-dxrow]')?.dataset.dxrow==='acceptance_005'`,
  );
  await check(
    '回车保存并跳到下一行译文',
    () =>
      database.lookupTagDictionary(['acceptance_004']).get('acceptance_004').translation ===
      '已修改译文',
  );
  await input('[aria-label="译文"]', '第五条译文');
  await key('Tab', {}, 'document.activeElement');
  await wait(`!!document.querySelector('.menu:not(.leaving)')`);
  await check(
    'Tab 保存译文并打开分类菜单',
    () =>
      database.lookupTagDictionary(['acceptance_005']).get('acceptance_005').translation ===
      '第五条译文',
  );
  await click('环境背景', 'document.querySelector(".menu:not(.leaving)")');
  await wait(
    `document.querySelector('[data-dxrow="acceptance_005"]')?.textContent.includes('环境背景')`,
  );
  await check(
    '分类菜单保存单条分类',
    () =>
      database.lookupTagDictionary(['acceptance_005']).get('acceptance_005').category ===
      'Environment',
  );
  await h.screenshot('dictionary-inline');
  await tab('已修改');
  await wait(`!!document.querySelector('[data-dxrow="acceptance_005"]')`);
  await check(
    '全部分页签的译文修改出现在已修改分页签',
    `document.querySelector('[data-dxrow="acceptance_005"]').textContent.includes('第五条译文')`,
  );
  await tab('全部');
  await select('排序', '最近修改');
  await check(
    '最近修改排序将刚改分类的条目放在首位',
    `document.querySelector('[data-dxrow]').dataset.dxrow==='acceptance_005'`,
  );
  await select('排序', '按 Tag 名称');
  await input(search, 'acceptance_');
  await wait(`${count}===205`);
  await click('全选当前分页签');
  await check(
    '全选包含窗口外全部筛选结果',
    'document.querySelector(".dict-sel").textContent.includes("已选 205 项")',
  );
  await check(
    '未配置 AI 不可重新翻译',
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='用 AI 重新翻译');return b.disabled||b.getAttribute('aria-disabled')==='true'})()`,
  );
  await h.screenshot('dictionary-selection');
  await click('设置分类', 'document.querySelector(".dict-sel")');
  await click('环境背景', 'document.querySelector(".menu:not(.leaving)")');
  await wait(`[...${rows}].every(row=>row.children[3].textContent.includes('环境背景'))`);
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
    'document.querySelector(".menu:not(.leaving)").textContent.includes("还原")',
  );
  await h.screenshot('dictionary-more');
  await click('还原', 'document.querySelector(".menu:not(.leaving)")');
  await check(
    '还原确认逐字说明删除修改和重新获取译文',
    `(()=>{const dialog=document.querySelector('[role=dialog]:not(.leaving *)');return dialog.querySelector('h3').textContent==='还原“acceptance 004”？' && JSON.stringify([...dialog.querySelectorAll('p')].map(p=>p.textContent))===${JSON.stringify(JSON.stringify(['将删除修改过的译文和分类。此 Tag再次出现时会重新查询内置词典；内置词典中没有的，需要再次“翻译并分类”才会有译文。']))}})()`,
    undefined,
    'once',
  );
  await h.screenshot('dictionary-revert-confirm');
  await click('取消', 'document.querySelector("[role=dialog]:not(.leaving *)")');
  await check(
    '取消还原保留数据',
    () => database.lookupTagDictionary(['acceptance_004']).size === 1,
  );
  await click('更多：acceptance_004');
  await click('还原', 'document.querySelector(".menu:not(.leaving)")');
  await click('还原', 'document.querySelector("[role=dialog]:not(.leaving *)")');
  await wait(`${count}===0`);
  await check(
    '还原移除当前词典记录',
    () => database.lookupTagDictionary(['acceptance_004']).size === 0,
  );
  await input(search, 'acceptance_');
  await wait(`${count}===204`);
  await e(`document.querySelector('.dscroll').scrollTop=1e7`);
  await wait(`!!document.querySelector('[data-dxrow="acceptance_204"]')`);
  await check(
    '窗口化列表滚到底仍显示最后一条',
    `!!document.querySelector('[data-dxrow="acceptance_204"]')`,
  );
  await scrollChecks(h, '.dscroll');
  await h.screenshot('dictionary');
  await input(search, 'acceptance_204');
  await wait(`${count}===1`);

  database.updateTagDictionary('view_fixture_empty', { translation: '', category: 'Body' });
  database.updateTagDictionary('view_fixture_unsorted', {
    translation: '合成未分类',
    category: 'Unsorted',
  });
  await section('通用');
  await section('翻译词典');
  await input(search, 'view_fixture_');
  await tab('暂无译文');
  await wait(`${count}===1`);
  await click('暂无译文');
  await input('[aria-label="译文"]', '填写后的译文');
  await key('Enter', {}, 'document.activeElement');
  await wait(
    `document.querySelector('[data-dxrow="view_fixture_empty"]')?.textContent.includes('填写后的译文')`,
  );
  await check('暂无译文分页签编辑后保留当前行', `${count}===1`);
  await tab('全部');
  await tab('暂无译文');
  await wait(`${count}===0`);
  await check('离开分页签后已补译文的行不再匹配', `${count}===0`);
  await tab('未分类');
  await wait(`${count}===1`);
  await click('分类：view_fixture_unsorted');
  await click('服装配饰', 'document.querySelector(".menu:not(.leaving)")');
  await wait(
    `document.querySelector('[data-dxrow="view_fixture_unsorted"]')?.textContent.includes('服装配饰')`,
  );
  await check('未分类分页签分类后保留当前行', `${count}===1`);
  await tab('全部');
  await tab('未分类');
  await wait(`${count}===0`);
  await check('切换分页签后已分类行不再匹配', `${count}===0`);
  await tab('全部');
  database.upsertTagDictionary([
    {
      tag: 'view_fixture_ai',
      translation: 'AI 合成译文',
      category: 'Body',
      translation_source: 'ai',
      category_source: 'ai',
    },
  ]);
  await section('通用');
  await section('翻译词典');
  await input(search, 'view_fixture_ai');
  await tab('AI 翻译');
  await wait(`${count}===1`);
  await click('AI 合成译文');
  await input('[aria-label="译文"]', '人工修订译文');
  await key('Enter', {}, 'document.activeElement');
  await wait(
    `document.querySelector('[data-dxrow="view_fixture_ai"]')?.textContent.includes('人工修订译文')`,
  );
  await check('AI 翻译分页签修改来源后保留当前行', `${count}===1`);
  await tab('已修改');
  await wait(`${count}===1`);
  await check(
    '人工修订出现在已修改分页签',
    `document.querySelector('[data-dxrow="view_fixture_ai"]').textContent.includes('人工修订译文')`,
  );
  await tab('AI 翻译');
  await wait(`${count}===0`);
  await check('离开 AI 翻译分页签后已修改行不再匹配', `${count}===0`);
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
    await section('通用');
    await section('翻译词典');
    await input(search, 'dictionary_fixture_');
    await wait(`${count}===55`);
    await click('全选当前分页签');
  };
  try {
    original();
    await configure('dictionary-success');
    for (let i = 0; i < 5; i++)
      await click(`选择 dictionary fixture ${String(i).padStart(3, '0')}`);
    await click('用 AI 重新翻译');
    await check(
      '重译前确认实际选择数量',
      `document.querySelector('[role=dialog]:not(.leaving *) h3')?.textContent==='用 AI 重新翻译 50 项？'`,
    );
    await click('重新翻译', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await wait('document.querySelector(".toast:not(.leaving)")?.textContent==="已重新翻译 50 项"');
    await check(
      '50 条直接翻译成功，未选中的五条保持原样',
      () =>
        aiTags.every(
          (tag, i) =>
            database.lookupTagDictionary([tag]).get(tag).translation ===
            (i < 5 ? '重译前' : '合成重译结果'),
        ),
      undefined,
      'once',
    );
    original();
    await configure('dictionary-success');
    await click('用 AI 重新翻译');
    await check(
      '重译前确认包含服务地址和覆盖说明',
      `document.querySelector('[role=dialog]:not(.leaving *) h3')?.textContent==='用 AI 重新翻译 55 项？' && document.querySelector('[role=dialog]:not(.leaving *)').textContent.includes('改过的也会被替换')`,
    );
    await h.screenshot('dictionary-retranslate-confirm');
    await click('取消', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await check(
      '取消重译确认不修改任何词典条目',
      () =>
        aiTags.every(
          (tag) => database.lookupTagDictionary([tag]).get(tag).translation === '重译前',
        ),
      undefined,
      'once',
    );
    await click('用 AI 重新翻译');
    await click('重新翻译', 'document.querySelector("[role=dialog]:not(.leaving *)")');
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
      'document.querySelector(".toast:not(.leaving)")?.textContent === "已重新翻译 55 项"',
    );
    await check(
      '全部成功显示定稿通知',
      'document.querySelector(".toast:not(.leaving)").textContent === "已重新翻译 55 项"',
      undefined,
      'once',
    );
    await click('更多：dictionary_fixture_000');
    await click('复制 Tag', 'document.querySelector(".menu:not(.leaving)")');
    await h.until(() => clipboard.readText() === 'dictionary fixture 000', '词典复制 Tag 完成');
    await check(
      '更多菜单复制空格形式的 Tag',
      () => clipboard.readText() === 'dictionary fixture 000',
      undefined,
      'once',
    );
    await click('更多：dictionary_fixture_000');
    await click('删除', 'document.querySelector(".menu:not(.leaving)")');
    await check(
      '单条删除确认使用定稿标题、正文与按钮',
      `(()=>{const dialog=document.querySelector('[role=dialog]:not(.leaving *)');return dialog.querySelector('h3').textContent==='删除“dictionary fixture 000”？' && JSON.stringify([...dialog.querySelectorAll('p')].map(p=>p.textContent))===${JSON.stringify(JSON.stringify(['软件不保存译文的历史记录。此 Tag再次出现时会重新查询内置词典；内置词典中没有的，需要再次“翻译并分类”才会有译文。']))} && [...dialog.querySelectorAll('.acts button')].map(b=>b.textContent).join('|')==='取消|删除'})()`,
      undefined,
      'once',
    );
    await h.screenshot('dictionary-delete-confirm');
    await click('删除', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await wait(`${count}===54`);
    await check(
      '非手动条目删除当前记录',
      () => database.lookupTagDictionary([aiTags[0]]).size === 0,
      undefined,
      'once',
    );
    await click('更多：dictionary_fixture_001');
    await click('在图片库中查找', 'document.querySelector(".menu:not(.leaving)")');
    await wait('!!document.querySelector(".gallery-search input")');
    await check(
      '更多菜单在图片库搜索对应 Tag',
      'document.querySelector(".gallery-search input").value.replaceAll("_"," ") === "dictionary fixture 001"',
    );
    await input('.gallery-search input', '');
    original();
    await configure('dictionary-partial');
    await click('用 AI 重新翻译');
    await click('重新翻译', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await wait('document.querySelector(".dict-sel")?.textContent.includes("正在翻译 50 / 55")');

    await h.screenshot('dictionary-retranslate-progress');
    await fetch(mode.baseUrl.replace('/v1', '/control/dictionary-continue'));
    await wait(
      'document.querySelector(".toast:not(.leaving)")?.textContent.includes("已翻译 5 项，其余没有改动")',
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
    await check(
      '失败通知提供重试',
      `document.querySelector('.toast')?.textContent.includes('重试')`,
    );
    await h.screenshot('dictionary-retranslate-failures');
    preferences.saveAISettings({ baseUrl: mode.baseUrl, model: 'dictionary-success' });
    for (const tag of aiTags.slice(50))
      database.updateTagDictionary(tag, { translation: '已完成后保留的修订', category: 'Body' });
    await click('重试', 'document.querySelector(".toast:not(.leaving)")');
    await wait(
      'document.querySelector(".toast:not(.leaving)")?.textContent.includes("已重新翻译 50 项")',
    );
    await check(
      '重试只发送失败条目，保留已成功条目的后续修订',
      () => {
        const items = database.lookupTagDictionary(aiTags);
        return aiTags.every(
          (tag, i) =>
            items.get(tag).translation === (i < 50 ? '合成重译结果' : '已完成后保留的修订'),
        );
      },
      undefined,
      'once',
    );
    original();
    await configure('dictionary-cancel');
    await click('用 AI 重新翻译');
    await click('重新翻译', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await wait('document.querySelector(".dict-sel")?.textContent.includes("0 / 55")');

    await click('停止', 'document.querySelector(".dict-sel")');
    await wait('document.querySelector(".toast:not(.leaving)")?.textContent.includes("已停止")');
    await check(
      '取消结果使用定稿并保留未完成条目',
      'document.querySelector(".toast:not(.leaving)").textContent.includes("已停止：翻译了 0 项，其余没有改动")',
      undefined,
      'once',
    );
    await click('删除', 'document.querySelector(".dict-sel")');
    await check(
      '批量删除确认显示实际条数',
      'document.querySelector("[role=dialog]:not(.leaving *) h3").textContent === "删除这 55 项？"',
      undefined,
      'once',
    );
    await click('取消', 'document.querySelector("[role=dialog]:not(.leaving *)")');
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
