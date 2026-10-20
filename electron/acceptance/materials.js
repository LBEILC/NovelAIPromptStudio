import { withWorkbenchState, draftExpression, sessionExpression } from './workbenchState.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function materialsChecks({ h, mode, database, preferences }) {
  h = withWorkbenchState(h);
  h.category('内置AI与素材');
  const { evaluate: e, click, input, key, wait, check } = h;
  const previous = preferences.publicSettings();
  preferences.saveAISettings({ baseUrl: mode.baseUrl, model: 'materials-acceptance' });
  const source = database.loadLibrary()[0];
  const originalNames = database.loadLibrary().map((p) => [p.id, p.name, p.has_custom_name]);
  const originalMaterials = new Set(database.materials.list().map((m) => m.id));
  const command = async (name, args) =>
    e(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(args)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
    );
  const dialog = 'document.querySelector("dialog[open]")';
  const block = 'document.querySelector(".wb-section[data-wb-scope=\\"base:prompt\\"] .wb-block")';
  const raw = `(${draftExpression}).prompt_structure.base_prompt_raw`;
  const release = () => fetch(mode.baseUrl.replace('/v1', '/control/ai-continue'));
  let cleanupTab = '';
  const screenshot = h.screenshot;
  if (process.env.NPS_COMPARE_033) {
    const output = path.resolve('.codex-runs/033-states');
    await fs.mkdir(output, { recursive: true });
    h.screenshot = async (name) => {
      await fs.writeFile(
        path.join(output, `${name}.json`),
        JSON.stringify({
          session: await e(sessionExpression),
          materials: database.materials.list(),
          library: database.loadLibrary(),
          size: h.window.getContentSize(),
        }),
      );
      await screenshot(name);
    };
  }
  try {
    await h.reload();
    await click('工作台', 'document.querySelector(".studio-titlebar")');
    const originalTabs = (await command('workbench.list', {})).tabs.map((t) => t.id);
    const opened = await command('workbench.open', { libraryId: source.id });
    if (!originalTabs.includes(opened.tab.id)) cleanupTab = opened.tab.id;
    for (const c of opened.tab.project.prompt_structure.characters)
      await command('character.remove', { tabId: opened.tab.id, characterId: c.id });
    await command('prompt.set', {
      tabId: opened.tab.id,
      scope: 'base:prompt',
      text: 'flim grain\n\numbrela\n\n1.2::blue hair::',
    });
    await wait('!!document.querySelector("[aria-label=整理]")');
    await click('整理');
    await h.screenshot('033-tidy-consent');
    await click('开始整理', dialog);
    await wait('!!document.querySelector(".tidy-progress")');
    await h.screenshot('033-tidy-running');
    await release();
    await wait('document.querySelectorAll("[data-proposal]").length===2');
    await check(
      '整理命令丢弃改动数值权重的提案',
      'document.querySelectorAll("[data-proposal]").length===2',
    );
    await click('接受这一处');
    await h.screenshot('033-tidy-partial');
    await click('放弃其余');
    await wait(`${raw}==='film grain\\n\\numbrela\\n\\n1.2::blue hair::'`);
    await check(
      '接受与放弃的提案按决定写回草稿',
      `${raw}==='film grain\\n\\numbrela\\n\\n1.2::blue hair::'`,
    );
    await h.screenshot('033-tidy-finished');
    await click('撤销', 'document.querySelector(".nps-notifications")');
    await wait(`${raw}.startsWith('flim grain')`);
    await check('提案收尾通知撤销恢复草稿', `${raw}.startsWith('flim grain')`);
    await click('整理');
    await wait('!!document.querySelector(".tidy-progress")');
    await click('取消', 'document.querySelector(".tidy-bar")');
    await release();
    await check('取消整理不写回草稿', `${raw}.startsWith('flim grain')`);
    await click('块操作', block);
    await click('存为常用块…');
    await input('[aria-label="常用块的名字"]', '合成常用块');
    await h.screenshot('033-material-save');
    await key('Enter');
    await wait('!document.querySelector(".material-picker:popover-open")');
    await click('常用块', 'document.querySelector(".wb-section[data-wb-scope=\\"base:prompt\\"]")');
    await h.screenshot('033-material-insert');
    await e(
      'document.querySelector(".material-insert-row > div").dispatchEvent(new MouseEvent("mouseover",{bubbles:true}))',
    );
    await h.screenshot('033-material-content-preview');
    await e(
      'document.querySelector(".material-insert-row img")?.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}))',
    );
    await h.screenshot('033-material-image-preview');
    await key('ArrowDown', {}, 'document.querySelector(".material-picker input")');
    await key('Enter', {}, 'document.querySelector(".material-picker input")');
    await wait(`${raw}.split('flim grain').length===3`);
    await check('保存常用块后可插入且用过次数增加', async () =>
      database.materials.list().some((x) => x.name === '合成常用块' && x.uses === 1),
    );
    await click('添加角色');
    await wait(`(${draftExpression}).prompt_structure.characters.length>0`);
    const s = await e(sessionExpression);
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    const character = active.project.prompt_structure.characters.at(-1);
    await command('prompt.set', {
      tabId: active.id,
      scope: `character:${character.id}:prompt`,
      text: 'standing',
    });
    await command('prompt.set', {
      tabId: active.id,
      scope: `character:${character.id}:undesired`,
      text: 'lowres',
    });
    await click(
      '角色操作',
      `document.querySelector('[data-wb-scope="character:${character.id}:prompt"]')`,
    );
    await click('存为角色…');
    await click('从素材添加角色');
    await wait('!!document.querySelector("[role=menu][aria-label=\\"从素材添加角色\\"]")');
    await h.screenshot('033-character-insert');
    await e(
      'document.querySelector("[role=menu][aria-label=\\"从素材添加角色\\"] [role=menuitem]").click()',
    );
    await wait(`(${draftExpression}).prompt_structure.characters.length===2`);
    await check(
      '角色从素材加回且保留负面提示词',
      `(${draftExpression}).prompt_structure.characters.at(-1).undesired_raw==='lowres'`,
    );
    await click('素材', 'document.querySelector(".studio-titlebar")');
    await wait('!!document.querySelector("[data-material-id]")');
    await h.screenshot('033-materials-blocks');
    await e('document.querySelector(".material-head").click()');
    await h.screenshot('033-materials-expanded');
    await click('素材操作');
    await click('改名');
    await input('[aria-label="素材名称"]', '合成改名');
    await h.screenshot('033-materials-rename');
    await key('Enter');
    await wait('!document.querySelector("[aria-label=\\"素材名称\\"]")');
    await click('素材操作');
    await click('删除');
    await check('素材删除确认前仍保留数据', () =>
      database.materials.list().some((x) => x.name === '合成改名'),
    );
    await click('取消', dialog);
    await click('素材操作');
    await click('删除');
    await click('删除', dialog);
    await wait('!document.querySelector("[data-material-id]")');
    await check(
      '确认删除素材后列表移除',
      () => !database.materials.list().some((x) => x.name === '合成改名'),
    );
    await click('角色', 'document.querySelector(".materials-page .library-side")');
    await h.screenshot('033-materials-characters');
    await click('Vibe', 'document.querySelector(".materials-page .library-side")');
    await h.screenshot('033-materials-vibes');
    await click('图片库', 'document.querySelector(".studio-titlebar")');
    await wait('!!document.querySelector(".library-detail-actions")');
    await click('根据提示词起名', 'document.querySelector(".library-detail-actions")');
    await h.screenshot('033-name-consent');
    await click('开始起名', dialog);
    await h.screenshot('033-name-running');
    await release();
    await wait('!!document.querySelector(".ai-name-row")');
    await h.screenshot('033-name-results');
    await input('[aria-label="建议名称 1"]', '合成建议');
    await click('全部接受', dialog);
    await wait('!document.querySelector("dialog[open]")');
    await check('名称建议接受后写入图片库', () =>
      database.loadLibrary().some((p) => p.name.startsWith('合成建议')),
    );
    const names = database.loadLibrary().map((p) => [p.id, p.name]);
    await click('根据提示词起名', 'document.querySelector(".library-detail-actions")');
    await wait('!!document.querySelector(".tidy-progress")');
    await release();
    await wait('!!document.querySelector(".ai-name-row")');
    await click('放弃', dialog);
    await check(
      '放弃名称建议不改名',
      () =>
        JSON.stringify(database.loadLibrary().map((p) => [p.id, p.name])) === JSON.stringify(names),
    );
    await click('筛选');
    await h.screenshot('033-fix-filter-sidebar');
    await key('Escape');
    await e(
      'document.querySelector(".library-card").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:300,clientY:200}))',
    );
    await h.screenshot('033-fix-card-menu');
    await key('Escape');
    await e('document.querySelector(".library-card").click()');
    await e(
      `document.querySelectorAll(".library-card")[1].dispatchEvent(new MouseEvent("click",{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await wait('document.querySelectorAll(".library-card.picked").length===2');
    await e(
      'document.querySelector(".library-card").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:300,clientY:200}))',
    );
    await h.screenshot('033-fix-multiple-menu');
    await e(
      'document.querySelector("[role=menu] [aria-label=起名], [role=menu] [aria-label=重命名]").click()',
    );
    await wait('!!document.querySelector("dialog[open]")');
    await check(
      '一组起名不提供仅当前图片选项',
      '!document.querySelector("dialog[open]").textContent.includes("仅当前图片")',
    );
    await h.screenshot('033-fix-group-name');
    await click('取消', dialog);
    await click('工作台', 'document.querySelector(".studio-titlebar")');
    await h.screenshot('033-fix-no-token');
    await check(
      '没有令牌时底栏只保留生成入口',
      '!document.querySelector(".wb-copy-bar [aria-label=复制]")&&!!document.querySelector(".wb-prompt-head [aria-label=复制]")',
    );
    await command('prompt.set', {
      tabId: opened.tab.id,
      scope: 'base:prompt',
      text: 'A quiet garden stretches behind the small house. Soft morning light falls across the stone path and the wooden door.',
    });
    await wait('!!document.querySelector("[aria-label=编辑段落]")');
    await h.screenshot('033-fix-paragraph-view');
    await e('document.querySelector("[aria-label=编辑段落]").click()');
    await input(
      '[aria-label="中文段落"]',
      '房屋后方是一座安静的花园。柔和的晨光照在石径与木门上。',
    );
    await h.screenshot('033-fix-paragraph-edit');
    await h.section('NovelAI 账号');
    await h.screenshot('033-fix-no-token-settings');
    await check(
      '没有令牌时账号页隐藏余额与用量',
      '(()=>{const text=document.querySelector("[data-settings-section=novelai]").innerText;return !text.includes("余额")&&!text.includes("用量")})()',
    );
  } finally {
    await release();
    preferences.saveAISettings(previous);
    for (const [id, name, custom] of originalNames)
      database.updateProjectName(id, name, custom, true);
    for (const material of database.materials.list())
      if (!originalMaterials.has(material.id)) database.materials.remove(material.id);
    if (cleanupTab) await command('workbench.close', { tabId: cleanupTab });
  }
}
