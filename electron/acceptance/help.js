import path from 'node:path';
import { help192Checks } from './help192.js';
import { createWorkbenchFixtures } from './workbenchFixtures.js';

export async function helpChecks({ h, preferences, mode, doubles }) {
  h.category('帮助');
  const section = (name) =>
    `!!document.querySelector('[data-settings-section="${name}"]:not(.leaving)')`;
  const navigate = (destination) =>
    h.window.webContents.send('studio:command-event', { type: 'navigate', destination });
  navigate('help');
  await h.wait(section('help'));
  await h.check('帮助菜单打开帮助页', section('help'));
  await help192Checks(h);
  await h.input('[aria-label="搜索功能"]', '操作条');
  await h.check(
    '位置搜索能找到局部重绘',
    '[...document.querySelectorAll(".feat-row")].some(row=>row.textContent.includes("局部重绘"))',
  );
  await h.input('[aria-label="搜索功能"]', '局部重绘');
  await h.check(
    '功能搜索只保留局部重绘',
    'document.querySelectorAll(".feat-row").length===1 && document.querySelector(".feat-row").textContent.includes("局部重绘")',
  );
  await h.input('[aria-label="搜索功能"]', 'acceptance-no-such-feature-080');
  await h.check(
    '不存在的功能显示空结果',
    '!!document.querySelector(".feat-none") && !document.querySelector(".feat-row")',
  );
  await h.input('[aria-label="搜索功能"]', '');
  const point = async (name, id, tip = '在这里') => {
    navigate('help');
    await h.wait(section('help'));
    await h.evaluate("document.querySelector('[data-help-tab=features]').click()");
    await h.input('[aria-label="搜索功能"]', name);
    await h.evaluate(
      `[...document.querySelectorAll('.feat-row')].find(row=>row.querySelector('.feat-name')?.textContent===${JSON.stringify(name)}).querySelector('.feat-go').click()`,
    );
    const condition = `!!document.querySelector('[data-spotlight]') && document.querySelector('.spot-tip')?.textContent===${JSON.stringify(tip)} && !!document.querySelector('[data-feature~="${id}"]')`;
    await h.wait(condition);
    await h.check(`${name}定位目标或前提控件`, condition);
    await h.screenshot(`help-point-${id}`);
  };
  await point('回收站', 'trash');
  await h.check('回收站定位后进入图片库', '!!document.querySelector(".libp")');
  await h.nativeKey('Escape');
  await h.check('Esc 关闭功能定位', '!document.querySelector("[data-spotlight]")');
  // Start with no open workbench tabs, even when invoked after other categories.
  await h.evaluate(
    `(async()=>{const r=await window.studio.invoke('workbench.list',{});for(const tab of r.data.tabs) await window.studio.invoke('workbench.close',{tabId:tab.id});})()`,
  );
  await point('复制提示词', 'open-image', '先打开一张图');
  await h.nativeKey('Escape');
  await point('扩图', 'open-image', '先打开一张图');
  await h.nativeKey('Escape');
  await point('生成队列', 'open-image', '先打开一张图');
  await h.nativeKey('Escape');
  await point('挑图', 'open-image', '先打开一张图');
  await h.nativeKey('Escape');
  await point('导演工具', 'open-image', '先打开一张图');
  await h.check(
    '096-20a 无图片时导演帮助指向打开图片',
    '!!document.querySelector("[data-feature~=open-image]")',
  );
  await h.nativeKey('Escape');
  await point('回收站自动清理', 'trash-clean');
  await h.nativeKey('Escape');
  await point('随机池', 'materials', '左边选「随机池」');
  await h.nativeKey('Escape');
  await h.evaluate(`window.studio.invoke('account.save',{token:'acceptance-token'})`);
  await point('用量统计', 'usage');
  await h.nativeKey('Escape');
  await point('扩图', 'open-image', '先打开一张图');
  await h.nativeKey('Escape');
  const spotlightFiles = await createWorkbenchFixtures(path.join(mode.root, 'spotlight-fixtures'));
  doubles.selections.push({ canceled: false, filePaths: [spotlightFiles[0]] });
  await h.evaluate('document.querySelector(\'[data-feature~="open-image"]\').click()');
  await h.wait('!!document.querySelector(".wb-body")');
  await h.evaluate('document.querySelector(\'[data-feature="tab-refs"]\').click()');
  await point('复制提示词', 'copy');
  await h.check(
    '复制定位切回提示词页签',
    '!!document.querySelector(\'[data-feature="tab-prompt"][aria-selected="true"]\')',
  );
  await point('图生图', 'img2img');
  await h.check(
    '图生图定位切换参考页签',
    '!!document.querySelector(\'[data-feature="tab-refs"][aria-selected="true"]\')',
  );
  await h.nativeKey('Escape');
  await h.evaluate(`window.studio.invoke('account.save',{token:'acceptance-token'})`);
  await h.evaluate(
    `(async()=>{const r=await window.studio.invoke('workbench.list',{});await window.studio.invoke('work.save',{tabId:r.data.activeTabId})})()`,
  );
  await point('扩图', 'outpaint');
  await h.nativeKey('Escape');
  await point('导演工具', 'director');
  await h.check(
    '096-20b 有图片时导演帮助指向导演工具',
    '!!document.querySelector("[data-feature=director]")',
  );
  await h.nativeKey('Escape');
  await point('生成队列', 'cost', '生成中这里变成「加入队列」');
  await h.nativeKey('Escape');
  await point('挑图', 'versions', '右键一版 → 挑图…');
  await h.nativeKey('Escape');
  navigate('help');
  await h.wait(section('help'));
  await h.input('[aria-label="搜索功能"]', '翻译词典');
  await h.evaluate(
    `[...document.querySelectorAll('.feat-row')].find(e=>e.querySelector('.feat-name')?.textContent==='翻译词典').querySelector('.feat-go').click()`,
  );
  await h.wait(section('tags'));
  await h.check('功能一览跳转翻译词典', section('tags'));
  navigate('changelog');
  await h.wait(`${section('updates')} && !!document.querySelector('.rn-log')`);
  await h.check(
    '更新日志菜单打开关于页和日志',
    `${section('updates')} && !!document.querySelector('.rn-log')`,
  );
  await h.check(
    '关于页不再包含快捷键标题',
    '![...document.querySelectorAll(\'[data-settings-section="updates"] h2\')].some(e=>e.textContent==="快捷键")',
  );
  await h.nativeKey('Escape');
  await h.wait('!document.querySelector(".rn-log")');
  const before = preferences.onboardingSettings().show;
  navigate('onboarding');
  await h.wait('!!document.querySelector("[data-onboard-page]")');
  await h.check(
    '帮助菜单重新打开完整引导',
    'document.querySelector("[data-onboard-page]").dataset.onboardPage === "recover"',
  );
  await h.nativeKey('Escape');
  await h.wait('!document.querySelector("[data-onboard-page]")');
  await h.check(
    '菜单重看引导不改变完成状态',
    () => preferences.onboardingSettings().show === before,
  );
  await h.reload();
  await h.section('帮助');
  await h.evaluate("document.querySelector('[data-help-tab=features]').click()");
  await h.evaluate('document.querySelector(\'[data-onboard="replay"]\').click()');
  await h.wait('!!document.querySelector("[data-onboard-page]")');
  for (let i = 0; i < 4; i++) {
    await h.evaluate('document.querySelector(\'[data-onboard="next"]\').click()');
    await h.wait(
      `document.querySelector('[data-onboard-page]')?.dataset.onboardPage === '${['tidy', 'folder', 'token', 'fix'][i]}'`,
    );
  }
  await h.evaluate('document.querySelector(\'[data-onboard="action"]\').click()');
  await h.wait('!document.querySelector("[data-onboard-page]")');
  await h.check(
    '修图引导操作打开工作台',
    'document.querySelector(\'.tb nav [aria-current="page"]\')?.textContent.includes("工作台")',
  );
  const files = await createWorkbenchFixtures(path.join(mode.root, 'help-fixtures'));
  await h.reload();
  doubles.selections.push({ canceled: false, filePaths: [files[0]] });
  navigate('onboarding');
  await h.wait('!!document.querySelector(\'[data-onboard="action"]\')');
  await h.evaluate('document.querySelector(\'[data-onboard="action"]\').click()');
  await h.wait(
    '!document.querySelector("[data-onboard-page]") && !!document.querySelector(".wb-body")',
  );
  await h.check('恢复提示词引导打开图片到工作台', '!!document.querySelector(".wb-body")');
  await h.reload();
  await h.section('帮助');
  await h.evaluate("document.querySelector('[data-help-tab=features]').click()");
  await h.evaluate('document.querySelector(\'[data-onboard="replay"]\').click()');
  await h.wait('!!document.querySelector("[data-onboard-page]")');
  await h.evaluate(
    '[...document.querySelectorAll(".tb nav button")].find(e=>e.textContent.includes("工作台")).click()',
  );
  const panel = 'document.querySelector(\'[aria-label="提示词栏宽度"]\')?.parentElement';
  await h.wait(`!!${panel} && ${panel}.getBoundingClientRect().height > 0`);
  await h.evaluate(
    `(()=>{const r=${panel}.getBoundingClientRect();window.__acceptanceSplit={x:r.left,y:r.top+r.height/2};document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:window.__acceptanceSplit.x,clientY:window.__acceptanceSplit.y}))})()`,
  );
  await h.check('引导浮层阻止分隔线响应', `!${panel}.classList.contains('rz-hot')`);
  await h.nativeKey('Escape');
  await h.wait('!document.querySelector("[data-onboard-page]")');
  await h.evaluate(
    "document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:window.__acceptanceSplit.x,clientY:window.__acceptanceSplit.y}))",
  );
  await h.check('关闭浮层后同一分隔线恢复响应', `${panel}.classList.contains('rz-hot')`);
  await h.evaluate('delete window.__acceptanceSplit');
}
