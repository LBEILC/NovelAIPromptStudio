import { withWorkbenchState, draftExpression, sessionExpression } from './workbenchState.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createPromptStructure } from '../../src/lib/promptStructure.js';

export async function materialsChecks({ h, mode, database, preferences }) {
  h = withWorkbenchState(h);
  h.category('内置AI与素材');
  const { evaluate: e, click, input, key, wait, check } = h;
  const previous = preferences.publicSettings();
  preferences.saveAISettings({ baseUrl: mode.baseUrl, model: 'materials-acceptance' });
  const source = {
    ...database.loadLibrary()[0],
    id: 'materials-fixture',
    name: 'Synthetic materials fixture',
    content_hash: 'materials-fixture',
    tags: [],
    prompt_structure: createPromptStructure({
      prompt_raw: 'flim grain\n\numbrela\n\n1.2::blue hair::',
    }),
  };
  database.insertProject(source);
  const originalNames = database.loadLibrary().map((p) => [p.id, p.name, p.has_custom_name]);
  const originalMaterials = new Set(database.materials.list().map((m) => m.id));
  const command = async (name, args) =>
    e(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(args)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
    );
  const dialog = 'document.querySelector("[role=dialog]:not(.leaving *)")';
  const block = 'document.querySelector(".blk[data-wb-scope=\\"base:prompt\\"]")';
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
    await click('工作台', 'document.querySelector(".tb")');
    const originalTabs = (await command('workbench.list', {})).tabs.map((t) => t.id);
    const opened = await command('workbench.open', { libraryId: source.id });
    if (!originalTabs.includes(opened.tab.id)) cleanupTab = opened.tab.id;
    await command('prompt.set', {
      tabId: opened.tab.id,
      scope: 'base:prompt',
      text: 'flim grain\n\numbrela\n\n1.2::blue hair::',
    });
    await wait('!!document.querySelector("[aria-label=整理]")');
    await click('整理');
    await h.screenshot('033-tidy-consent');
    await click('开始整理', dialog);
    await wait('!!document.querySelector(".prop-bar:not(.leaving) .progress")');
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
    await click('撤销', 'document.querySelector(".toast:not(.leaving)")');
    await wait(`${raw}.startsWith('flim grain')`);
    await check('提案收尾通知撤销恢复草稿', `${raw}.startsWith('flim grain')`);
    await click('整理');
    await wait('!!document.querySelector(".prop-bar:not(.leaving) .progress")');
    await click('取消', 'document.querySelector(".prop-bar:not(.leaving)")');
    await release();
    await check('取消整理不写回草稿', `${raw}.startsWith('flim grain')`);
    await click('这一块的操作', block);
    await click('存为常用块…');
    await input('[aria-label="常用块的名字"]', '合成常用块');
    await h.screenshot('033-material-save');
    await key('Enter');
    await wait('!document.querySelector(".saveblk-pop:not(.leaving)")');
    await click('常用块', 'document.querySelector(".blk-gap")');
    await h.screenshot('033-material-insert');
    await e(
      'document.querySelector(".ins-row .ir-t").dispatchEvent(new MouseEvent("mouseover",{bubbles:true}))',
    );
    await h.screenshot('033-material-content-preview');
    await e(
      'document.querySelector(".ins-row img")?.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}))',
    );
    await h.screenshot('033-material-image-preview');
    await key('ArrowDown', {}, 'document.querySelector(".ins-pop input")');
    await key('Enter', {}, 'document.querySelector(".ins-pop input")');
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
      '这个角色的操作',
      `document.querySelector('[data-menu-key="char-${character.id}"]').parentElement`,
    );
    await click('存为角色…');
    await click('从素材添加角色');
    await wait('!!document.querySelector(".menu:not(.leaving)")');
    await h.screenshot('033-character-insert');
    await e('document.querySelector(".menu:not(.leaving) [role=menuitem]").click()');
    await wait(`(${draftExpression}).prompt_structure.characters.length===2`);
    await check(
      '角色从素材加回且保留负面提示词',
      `(${draftExpression}).prompt_structure.characters.at(-1).undesired_raw==='lowres'`,
    );
    await click('素材', 'document.querySelector(".tb")');
    await wait('!!document.querySelector("[data-mat]")');
    await h.screenshot('033-materials-blocks');
    await e('document.querySelector(".mrow-h").click()');
    await h.screenshot('033-materials-expanded');
    await click('更多', 'document.querySelector(".mrow")');
    await click('重命名');
    await input('[aria-label="名称"]', '合成改名');
    await h.screenshot('033-materials-rename');
    await key('Enter');
    await wait('!document.querySelector("[aria-label=\\"名称\\"]")');
    await click('更多', 'document.querySelector(".mrow")');
    await click('删除');
    await wait('!document.querySelector("[data-mat]")');
    await check('撤销期内素材仍保留数据', () =>
      database.materials.list().some((x) => x.name === '合成改名'),
    );
    await click('撤销', 'document.querySelector(".toast:not(.leaving)")');
    await wait('!!document.querySelector("[data-mat]")');
    await check('撤销删除恢复素材列表与数据', () =>
      database.materials.list().some((x) => x.name === '合成改名'),
    );
    await click('更多', 'document.querySelector(".mrow")');
    await click('删除');
    await wait('!document.querySelector("[data-mat]")');
    await h.until(
      () => !database.materials.list().some((x) => x.name === '合成改名'),
      '撤销期结束后删除落库',
    );
    await check(
      '撤销期结束后素材从数据库移除',
      () => !database.materials.list().some((x) => x.name === '合成改名'),
    );
    await click('角色', 'document.querySelector(".matp .side")');
    await h.screenshot('033-materials-characters');
    await click('Vibe', 'document.querySelector(".matp .side")');
    await h.screenshot('033-materials-vibes');
    await click('图片库', 'document.querySelector(".tb")');
    await wait('!!document.querySelector(".detail .dacts")');
    await click('根据提示词起名', 'document.querySelector(".detail .dacts")');
    await h.screenshot('033-name-consent');
    await click('开始起名', dialog);
    await h.screenshot('033-name-running');
    await release();
    await wait('!!document.querySelector(".lnm-row")');
    await h.screenshot('033-name-results');
    await input('[aria-label="建议的名称"]', '合成建议');
    await click('全部接受', dialog);
    await wait('!document.querySelector("[role=dialog]:not(.leaving *)")');
    await check('名称建议接受后写入图片库', () =>
      database.loadLibrary().some((p) => p.name.startsWith('合成建议')),
    );
    const names = database.loadLibrary().map((p) => [p.id, p.name]);
    await click('根据提示词起名', 'document.querySelector(".detail .dacts")');
    await wait('!!document.querySelector(".lnm-run")');
    await release();
    await wait('!!document.querySelector(".lnm-row")');
    await click('放弃', dialog);
    await check(
      '放弃名称建议不改名',
      () =>
        JSON.stringify(database.loadLibrary().map((p) => [p.id, p.name])) === JSON.stringify(names),
    );
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
    database.deleteProject(source.id);
  }
}
