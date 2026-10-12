import path from 'node:path';
import fs from 'node:fs/promises';
import { clipboard } from 'electron';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { importLibraryFiles } from '../importer.js';

const frame = 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))';
const menu = 'document.querySelector(".nps-menu:popover-open [role=menu]")';
const tabs = 'document.querySelectorAll(".wb-tabs-scroll .wb-tab")';
const session = `JSON.parse(localStorage.getItem('novelai-prompt-studio.workbench-session.v2'))`;
const draft = `(()=>{const s=${session};return s?.tabs.find(t=>t.id===s.activeTabId)?.draft})()`;
const mod = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };

function pointer(h) {
  return async (type, point, pressed = false) => {
    await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mouseReleased' ? 0 : pressed ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
    });
    await h.evaluate(frame);
    if (type === 'mouseReleased') {
      // dnd-kit briefly suppresses the click following a pointer drop. Wait for
      // propagation to resume before dispatching the next independent action.
      await h.wait(
        `(()=>{let received=false;const listener=()=>{received=true};window.addEventListener('click',listener);document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));window.removeEventListener('click',listener);return received})()`,
        '拖动结束后的点击抑制已解除',
      );
    }
  };
}
async function center(h, selector, block = 'nearest') {
  return h.evaluate(
    `(async()=>{const n=${selector};n.scrollIntoView({block:${JSON.stringify(block)},inline:'nearest'});await ${frame};const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
}
async function context(h, selector) {
  await h.evaluate(
    `(()=>{const n=${selector},r=n.getBoundingClientRect();n.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}))})()`,
  );
  await h.wait(`${menu}!==null`, '图片菜单打开');
}
async function expectMenu(h, label, labels) {
  await h.check(
    label,
    `JSON.stringify([...${menu}.querySelectorAll(':scope > div > button')].map(n=>n.getAttribute('aria-label')))===${JSON.stringify(JSON.stringify(labels))}`,
    undefined,
    'once',
  );
}
async function prepare(env, prefix, dark = false) {
  const files = await createWorkbenchFixtures(path.join(env.mode.root, prefix), {
    prefix,
    seed: dark ? 46000 : 45000,
    dark,
  });
  const imported = await importLibraryFiles({
    filePaths: files,
    database: env.database,
    assetsDirectory: env.preferences.librarySettings().assetsDirectory,
  });
  if (imported.errors.length || imported.imported.length !== 3)
    throw Error('交互验收夹具导入不完整');
  return imported.imported;
}
async function library(h, query, grouping = '不合并') {
  await h.click('图片库', 'document.querySelector(".studio-titlebar")');
  await h.click('全部图片', 'document.querySelector(".library-page")');
  await h.input('[aria-label="搜索图片库"]', query);
  await h.click('视图', 'document.querySelector(".library-page")');
  await h.click(grouping, 'document.querySelector("[aria-label=合并方式]")');
  await h.key('Escape', {}, 'document.activeElement');
  await h.wait('document.querySelectorAll(".library-card").length>0');
}
async function closeAddedTabs(h, previous) {
  await h.click('工作台', 'document.querySelector(".studio-titlebar")');
  const added = await h.evaluate(
    `[...${tabs}].map(t=>t.dataset.workbenchTabId).filter(id=>!${JSON.stringify(previous)}.includes(id))`,
  );
  for (const id of added) {
    await context(h, `document.querySelector('[data-workbench-tab-id="${id}"]')`);
    await h.click('关闭', menu);
    if (await h.evaluate('!!document.querySelector("dialog[open]")'))
      await h.click('丢弃并关闭', 'document.querySelector("dialog[open]")');
    await h.wait(`!document.querySelector('[data-workbench-tab-id="${id}"]')`);
  }
}
async function restoredTabs(h) {
  const previous = await h.evaluate(`${session}?.tabs?.map(t=>t.id) ?? []`);
  await h.click('工作台', 'document.querySelector(".studio-titlebar")');
  // The full suite leaves tabs open. Reload finishes before their async file
  // reads; observe the saved IDs before opening or cleaning up our own tabs.
  await h.wait(
    `JSON.stringify([...${tabs}].map(t=>t.dataset.workbenchTabId).sort())===${JSON.stringify(JSON.stringify([...previous].sort()))}`,
    '已有标签页恢复后再开始交互验收',
  );
  return previous;
}
async function cleanup(env, records) {
  for (const record of records) {
    const current = env.database.loadProject(record.id);
    env.database.deleteProject(record.id);
    for (const file of [current?.image_path, current?.thumbnail_path].filter(Boolean)) {
      const relative = path.relative(env.mode.root, file);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
        throw Error('只清理临时 Profile 的验收夹具');
      await fs.rm(file, { force: true });
    }
  }
  await env.h.reload();
}

export async function libraryInteractionChecks(env) {
  const { h } = env;
  const { evaluate: e, wait, check, click, key } = h;
  h.category('图片库·交互');
  h.window.setContentSize(1240, 760);
  const records = [
    ...(await prepare(env, 'interaction-fixture-light')),
    ...(await prepare(env, 'interaction-fixture-dark', true)),
  ];
  await h.reload();
  const previousTabs = await restoredTabs(h);
  const card = (id) => `document.querySelector('[data-project-id="${id}"]')`;
  let collectionId;
  try {
    await library(h, 'interaction-fixture-');
    await wait('document.querySelectorAll(".library-card").length===6');
    for (const record of [records[0], records[3]])
      await e(
        `${card(record.id)}.dispatchEvent(new MouseEvent('click',{bubbles:true,...${JSON.stringify(mod)}}))`,
      );
    await wait('document.querySelectorAll(".library-card.picked").length===2');
    await check(
      '浅深图片上的复选框选中实心、未选中半透明且处于选框之上',
      `(()=>{const cards=[...document.querySelectorAll('.library-card')];return cards.length===6&&cards.every(c=>{const p=c.querySelector('.library-pick'),s=getComputedStyle(p),picked=c.classList.contains('picked');return +s.zIndex>0&&s.opacity==='1'&&(picked?s.backgroundColor===getComputedStyle(c).getPropertyValue('--ink').trim().replace('#1c1c1c','rgb(28, 28, 28)').replace('#f1efea','rgb(241, 239, 234)'):p.dataset.theme==='light'&&s.backgroundColor.includes('0.12'))})})()`,
    );
    await h.screenshot('interaction-checkboxes');
    await context(h, card(records[0].id));
    await expectMenu(h, '多选右键仅提供全部选中图片的操作', [
      '在工作台打开 2 张',
      '起名…',
      '加入收藏集',
      '移入回收站',
    ]);
    await check(
      '多选菜单显示图片张数且保留选择',
      `document.querySelector('.library-menu-heading')?.textContent==='已选 2 张'&&document.querySelectorAll('.library-card.picked').length===2`,
      undefined,
      'once',
    );
    await h.screenshot('interaction-menu-multiple');
    await click('在工作台打开 2 张', menu);
    await wait(`${tabs}.length===${previousTabs.length + 2}`);
    await check(
      '多选菜单打开每一张图片的独立标签页',
      `${session}.tabs.filter(t=>${JSON.stringify([records[0].id, records[3].id])}.includes(t.source.projectId)).length===2`,
      undefined,
      'once',
    );
    await library(h, 'interaction-fixture-');
    await context(h, card(records[1].id));
    await expectMenu(h, '单张右键菜单项目及顺序正确', [
      '在工作台打开',
      '看大图',
      '复制提示词',
      '复制图片',
      '另存为…',
      '起名…',
      '加入收藏集',
      '在文件夹中显示',
      '移入回收站',
    ]);
    await check(
      '右键未选中图片清除原多选并显示该图详情',
      `document.querySelectorAll('.library-card.picked').length===0&&document.querySelector('.library-detail')?.dataset.detailId===${JSON.stringify(records[1].id)}`,
      undefined,
      'once',
    );
    await check(
      '单图菜单显示快捷键、三个分隔线和危险操作颜色',
      `${menu}.querySelectorAll('.nps-menu-separator').length===3&&${menu}.querySelectorAll('.nps-kbd').length===2&&${menu}.querySelector('[aria-label="移入回收站"]').classList.contains('nps-error')`,
    );
    await h.screenshot('interaction-menu-single');
    await click('复制提示词', menu);
    await h.until(
      () =>
        clipboard.readText().replaceAll('\r\n', '\n') ===
        records[1].metadata.prompt_raw.replaceAll('\r\n', '\n'),
      '右键复制提示词完成',
    );
    await check(
      '右键复制提示词与原图逐字一致',
      () =>
        clipboard.readText().replaceAll('\r\n', '\n') ===
        records[1].metadata.prompt_raw.replaceAll('\r\n', '\n'),
      undefined,
      'once',
    );
    await context(h, card(records[1].id));
    await click('看大图', menu);
    await wait('!!document.querySelector(".library-viewer")');
    await check(
      '右键看大图使用当前图片',
      `document.querySelector('.library-viewer img')?.getAttribute('src')?.includes(${JSON.stringify(path.basename(records[1].image_path))})===true`,
      undefined,
      'once',
    );
    await key('Escape', {}, 'document.querySelector(".library-viewer")');
    await context(h, card(records[1].id));
    await click('加入收藏集', menu);
    await wait('!!document.querySelector("[role=menu][aria-label=加入收藏集]")');
    await click('新建收藏集…', 'document.querySelector("[role=menu][aria-label=加入收藏集]")');
    await h.input('[aria-label="新收藏集名称"]', '交互验收收藏集');
    await click('新建并加入', 'document.querySelector("dialog[open]")');
    await wait('!document.querySelector("dialog[open]")');
    collectionId = env.database.listCollections().find((c) => c.name === '交互验收收藏集')?.id;
    await check(
      '右键新建收藏集并加入目标图片',
      () =>
        env.database
          .listCollections()
          .some((c) => c.id === collectionId && c.member_ids.includes(records[1].id)),
      undefined,
      'once',
    );
    await click('交互验收收藏集', 'document.querySelector(".library-side")');
    await wait('document.querySelectorAll(".library-card").length===1');
    await context(h, card(records[1].id));
    await check(
      '普通收藏集菜单提供移出入口',
      `${menu}.querySelector('[aria-label="移出这个收藏集"]')!==null`,
      undefined,
      'once',
    );
    await click('移出这个收藏集', menu);
    await wait('document.querySelectorAll(".library-card").length===0');
    await check(
      '移出收藏集保留图库图片',
      () =>
        !!env.database.loadProject(records[1].id) &&
        !env.database
          .listCollections()
          .find((c) => c.id === collectionId)
          .member_ids.includes(records[1].id),
      undefined,
      'once',
    );
    await library(h, 'interaction-fixture-light', '提示词完全相同');
    await wait('document.querySelectorAll(".library-card").length===1');
    const stack = 'document.querySelector(".library-card")';
    await e(`${stack}.click()`);
    await wait('document.querySelectorAll(".library-strip button").length===3');
    const order = await e(
      `[...document.querySelectorAll('.library-strip img')].map(i=>i.getAttribute('src'))`,
    );
    const originalDetail = await e('document.querySelector(".library-detail").dataset.detailId');
    const cover = await e(`${stack}.querySelector('img').getAttribute('src')`);
    const move = pointer(h);
    const bounds = await e(
      `(()=>{const r=${stack}.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})()`,
    );
    for (const index of [0, 2, 1]) {
      await move('mouseMoved', {
        x: bounds.left + (bounds.width * (index + 0.5)) / 3,
        y: bounds.top + bounds.height / 2,
      });
      await wait(
        `${stack}.querySelector('img').getAttribute('src')===${JSON.stringify(order[index])}`,
      );
      await check(
        `横向第 ${index + 1} 段显示对应缩略图且不改变详情和多选`,
        `${stack}.querySelector('img').naturalWidth>0&&${stack}.querySelector('.library-stack').textContent==='${index + 1} / 3'&&${stack}.querySelectorAll('.library-scrub > span').length===3&&document.querySelector('.library-detail').dataset.detailId===${JSON.stringify(originalDetail)}&&!document.querySelector('.library-card.picked')`,
        undefined,
        'once',
      );
    }
    await h.screenshot('interaction-stack-scrub');
    const displayed = await e(`${stack}.querySelector('img').dataset.scrubImage`);
    await e(`${stack}.click()`);
    await wait(
      `document.querySelector('.library-detail').dataset.detailId===${JSON.stringify(displayed)}`,
    );
    await check(
      '翻看时点击在详情栏打开刚才看到的图片',
      `document.querySelector('.library-detail').dataset.detailId===${JSON.stringify(displayed)}`,
      undefined,
      'once',
    );
    await context(h, stack);
    await move('mouseMoved', { x: bounds.left - 5, y: bounds.top - 5 });
    await check(
      '离开一摞恢复封面并移除分段条',
      `${stack}.querySelector('img').getAttribute('src')===${JSON.stringify(cover)}&&!${stack}.querySelector('.library-scrub')`,
      undefined,
      'once',
    );
    await click('看大图', menu);
    await wait('!!document.querySelector(".library-viewer")');
    await check(
      '翻看时打开右键菜单后离开卡片仍操作刚才的图片',
      `document.querySelector('.library-viewer img')?.getAttribute('src')?.includes(${JSON.stringify(path.basename(records.find((r) => r.id === displayed).image_path))})===true`,
      undefined,
      'once',
    );
    await key('Escape', {}, 'document.querySelector(".library-viewer")');
    await context(h, stack);
    await click('起名…', menu);
    await wait('!!document.querySelector("dialog[open]")');
    await check(
      '一摞右键起名沿用按顺序编号的对话框',
      `document.querySelector('dialog[open]').textContent.includes('给这 3 张图片起名')&&document.querySelectorAll('.library-rename-row').length===2`,
      undefined,
      'once',
    );
    await click('取消', 'document.querySelector("dialog[open]")');
    await context(h, stack);
    await h.screenshot('interaction-menu-stack');
    await click('移入回收站', menu);
    await wait('document.querySelectorAll(".library-card").length===0');
    await click('回收站', 'document.querySelector(".library-side")');
    await h.input('[aria-label="搜索图片库"]', 'interaction-fixture-light');
    await wait('document.querySelectorAll(".library-card").length>0');
    await key('a', mod, 'document.querySelector("[data-library-grid]")');
    await context(h, 'document.querySelector(".library-card")');
    await expectMenu(h, '回收站右键仅提供恢复和永久删除', ['恢复', '永久删除…']);
    await h.screenshot('interaction-menu-trash');
    await click('永久删除…', menu);
    await wait('!!document.querySelector("dialog[open]")');
    await check(
      '回收站右键永久删除仍需确认',
      `document.querySelector('dialog[open]').textContent.includes('永久删除')`,
      undefined,
      'once',
    );
    await click('取消', 'document.querySelector("dialog[open]")');
    await context(h, 'document.querySelector(".library-card")');
    await click('恢复', menu);
    await wait('document.querySelectorAll(".library-card").length===0');
    await check(
      '右键恢复这一摞的全部图片',
      () => records.slice(0, 3).every((record) => !env.database.loadProject(record.id).deleted_at),
      undefined,
      'once',
    );
  } finally {
    await closeAddedTabs(h, previousTabs);
    if (collectionId) env.database.deleteCollection(collectionId);
    await cleanup(env, records);
  }
}

export async function workbenchInteractionChecks(env) {
  const { h, doubles } = env;
  const { evaluate: e, wait, check, click, key } = h;
  h.category('工作台·交互');
  h.window.setContentSize(1240, 760);
  const records = await prepare(env, 'workbench-interaction-fixture');
  await h.reload();
  const previousTabs = await restoredTabs(h);
  const originalStorage = env.preferences.librarySettings().assetsDirectory;
  const originalMotion = env.preferences.appearanceSettings().motion;
  const move = pointer(h);
  let migrated = false;
  const migrate = async (target) => {
    await fs.mkdir(target, { recursive: true });
    await h.section('图片库');
    doubles.selections.push({ canceled: false, filePaths: [target] });
    doubles.messages.push({ response: 0 });
    await click('更改位置');
    await wait(
      `document.querySelector('.settings-column code')?.textContent===${JSON.stringify(target)}`,
    );
    await wait(
      '![...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="更改位置")?.disabled',
    );
  };
  try {
    await h.section('外观');
    await click(
      env.mode.reducedMotion ? '跟随系统' : '完整',
      'document.querySelector("[aria-label=动效]")',
    );
    await library(h, 'workbench-interaction-fixture');
    for (const [index, record] of records.slice(0, 2).entries()) {
      await wait(`!!document.querySelector('[data-project-id="${record.id}"]')`);
      await e(
        `document.querySelector('[data-project-id="${record.id}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
      );
      await wait(`${tabs}.length===${previousTabs.length + index + 1}`);
      if (index === 0) await click('图片库', 'document.querySelector(".studio-titlebar")');
    }
    await wait(`${tabs}.length===${previousTabs.length + 2}`);
    await click('工作台', 'document.querySelector(".studio-titlebar")');
    const ids = await e(
      `[...${tabs}].map(t=>t.dataset.workbenchTabId).filter(id=>!${JSON.stringify(previousTabs)}.includes(id))`,
    );
    const tab = (index) => `document.querySelector('[data-workbench-tab-id="${ids[index]}"]')`;
    // Reload and DOM clicks do not reset Chromium's pointer position. Enter the
    // tab from outside after scrolling, with no held button or open menu.
    await h.nativeKey('Escape');
    await move('mouseReleased', { x: 20, y: 300 });
    await move('mouseMoved', { x: 20, y: 300 });
    const previewPoint = await center(h, tab(0));
    await check(
      '标签页预览前置状态为无菜单且指针目标可见',
      `!document.querySelector('.nps-menu:popover-open,dialog[open]')&&${tab(0)}.contains(document.elementFromPoint(${previewPoint.x},${previewPoint.y}))`,
      undefined,
      'once',
    );
    await move('mouseMoved', previewPoint);
    await wait('!!document.querySelector(".wb-tab-preview:popover-open img")');
    await wait('document.querySelector(".wb-tab-preview:popover-open img")?.naturalWidth>0');
    await check(
      '标签页预览包含缩略图、未命名提示和导入时间',
      `(()=>{const p=document.querySelector('.wb-tab-preview:popover-open'),t=${tab(0)},i=p?.querySelector('img');return !!i&&i.src===t.querySelector('img').src&&p.textContent.includes('没有起名')&&p.textContent.includes(${JSON.stringify(records[0].created_at)})&&i.naturalWidth>0})()`,
    );
    await check(
      '预览图片最长边受限且保留原比例',
      `(()=>{const i=document.querySelector('.wb-tab-preview img'),r=i.getBoundingClientRect();return Math.max(r.width,r.height)<=240&&Math.abs(r.width/r.height-i.naturalWidth/i.naturalHeight)<0.01})()`,
    );
    await check(
      '标签页预览使用浮层纸色与阴影而非普通文字提示底色',
      `(()=>{const p=document.querySelector('.wb-tab-preview'),probe=document.createElement('span');probe.style.background='var(--surface)';document.body.append(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();const s=getComputedStyle(p);return s.backgroundColor===expected&&s.boxShadow!=='none'})()`,
    );
    await h.screenshot('interaction-tab-preview');
    await move('mouseMoved', await center(h, tab(1)));
    await wait(
      `document.querySelector('.wb-tab-preview img')?.src===${tab(1)}.querySelector('img').src`,
    );
    await check(
      '相邻切换后当前标签页也能预览',
      `${tab(1)}.getAttribute('aria-selected')==='true'&&document.querySelector('.wb-tab-preview img')?.src===${tab(1)}.querySelector('img').src`,
      undefined,
      'once',
    );
    const order = await e(`[...${tabs}].map(t=>t.dataset.workbenchTabId)`);
    const dragStart = async (selector) => {
      const start = await center(h, selector);
      await move('mouseMoved', start);
      await move('mousePressed', start, true);
      await move('mouseMoved', { x: start.x + 10, y: start.y + 2 }, true);
      await wait('!!document.querySelector(".wb-drag-feedback")');
      return start;
    };
    let start = await dragStart(tab(0));
    await move('mouseMoved', await center(h, tab(1)), true);
    await wait('!document.querySelector(".wb-tab-preview:popover-open")');
    await check(
      '标签页拖动有副本和原位占位且没有悬停预览',
      `!!document.querySelector('.wb-drag-feedback img')&&getComputedStyle(${tab(0)}).visibility==='hidden'&&!document.querySelector('.wb-tab-preview:popover-open')`,
    );
    await h.screenshot('interaction-tab-drag');
    await check(
      '拖动放大与让位过渡遵循当前动效偏好',
      `(()=>{const overlay=getComputedStyle(document.querySelector('.wb-drag-feedback')),tab=getComputedStyle(${tab(0)}),off=document.documentElement.dataset.motion==='off';return off?overlay.transform==='none'&&tab.transitionDuration==='0s':overlay.transform.includes('1.03')&&tab.transitionProperty.includes('transform')&&tab.transitionDuration.includes('0.24s')})()`,
    );
    await h.nativeKey('Escape');
    await move('mouseReleased', start);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await check(
      'Esc 取消标签页拖动后顺序不变',
      `JSON.stringify([...${tabs}].map(t=>t.dataset.workbenchTabId))===${JSON.stringify(JSON.stringify(order))}`,
      undefined,
      'once',
    );
    start = await dragStart(tab(0));
    const target = await center(h, tab(1));
    await move('mouseMoved', target, true);
    await move('mouseReleased', target);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await check(
      '标签页放下后交换位置',
      `[...${tabs}].findIndex(t=>t.dataset.workbenchTabId===${JSON.stringify(ids[0])})>[...${tabs}].findIndex(t=>t.dataset.workbenchTabId===${JSON.stringify(ids[1])})`,
      undefined,
      'once',
    );
    await e(`${tab(1)}.click()`);
    await wait('document.querySelectorAll(".wb-tags .nps-tag").length>3');
    const source = 'document.querySelector(".wb-tags [data-marquee-key]")';
    const original = await e(`${draft}.prompt_structure.base_prompt_raw`);
    start = await dragStart(source);
    await move('mouseMoved', { x: start.x + 65, y: start.y + 20 }, true);
    await check(
      'Tag 拖动副本保留原内容与原位占位',
      `!!document.querySelector('.wb-drag-feedback .nps-tag')&&!!document.querySelector('.wb-tag-dragging')&&getComputedStyle(document.querySelector('.wb-tag-dragging')).visibility==='hidden'`,
    );
    await h.screenshot('interaction-tag-drag');
    await h.nativeKey('Escape');
    await move('mouseReleased', start);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await check(
      '取消 Tag 拖动不修改提示词',
      `${draft}.prompt_structure.base_prompt_raw===${JSON.stringify(original)}`,
      undefined,
      'once',
    );
    start = await dragStart(source);
    const outside = { x: 20, y: 300 };
    await move('mouseMoved', outside, true);
    await move('mouseReleased', outside);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await check(
      '拖出有效区域取消 Tag 移动',
      `${draft}.prompt_structure.base_prompt_raw===${JSON.stringify(original)}`,
      undefined,
      'once',
    );
    start = await dragStart(source);
    const nextBlock = await center(
      h,
      'document.querySelectorAll(".wb-tags")[1].querySelector(".wb-add-trigger")',
    );
    await move('mouseMoved', nextBlock, true);
    await wait('!!document.querySelector(".wb-insertion-slot")');
    await check(
      '跨块拖动在目标块显示等尺寸插入空位',
      `(()=>{const s=document.querySelector('.wb-insertion-slot'),d=document.querySelector('.wb-drag-feedback');return !!s&&Math.abs(s.getBoundingClientRect().width-parseFloat(d.style.width))<1&&getComputedStyle(s.closest('.wb-block')).outlineStyle==='solid'})()`,
    );
    await h.screenshot('interaction-tag-cross-block');
    await move('mouseReleased', nextBlock);
    await wait(`${draft}.prompt_structure.base_prompt_raw!==${JSON.stringify(original)}`);
    await check(
      '跨块放下保留内容并移至目标块',
      `!document.querySelectorAll('.wb-tags')[0].textContent.includes('blue hair')&&document.querySelectorAll('.wb-tags')[1].textContent.includes('blue hair')&&document.querySelectorAll('.wb-tags')[1].textContent.includes('1.25')`,
      undefined,
      'once',
    );
    await click('添加角色');
    await wait(`${draft}.prompt_structure.characters.length===1`);
    const characterAdd = `document.querySelectorAll('.wb-section')[2].querySelector('.wb-add-trigger')`;
    await e(`${characterAdd}.scrollIntoView({block:'center'});${frame}`);
    start = await dragStart(source);
    const character = await center(h, characterAdd, 'center');
    await move('mouseMoved', character, true);
    await wait('!!document.querySelector(".wb-insertion-slot")');
    await check(
      '跨角色拖动在空角色节显示插入位置',
      `document.querySelectorAll('.wb-section')[2].querySelector('.wb-insertion-slot')!==null`,
      undefined,
      'once',
    );
    // Inserting the slot and edge auto-scroll can move the original add button.
    // Release over the displayed destination, not its pre-insertion coordinates.
    const landing = await center(h, 'document.querySelector(".wb-insertion-slot")', 'center');
    await move('mouseMoved', landing, true);
    await move('mouseReleased', landing);
    await wait(`${draft}.prompt_structure.characters[0].prompt_tags.some(t=>t.tag==='red coat')`);
    await check(
      '跨角色放下将 Tag 移入目标角色并保留其他内容',
      `${draft}.prompt_structure.characters[0].prompt_tags.some(t=>t.tag==='red coat')&&!${draft}.prompt_structure.base_prompt_raw.includes('red coat')&&${draft}.prompt_structure.base_prompt_raw.includes('blue hair')`,
      undefined,
      'once',
    );
    await h.window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    for (const mode of ['跟随系统', '关闭']) {
      await h.section('外观');
      await click(mode, 'document.querySelector("[aria-label=动效]")');
      await click('工作台', 'document.querySelector(".studio-titlebar")');
      await wait('document.documentElement.dataset.motion==="off"');
      await click('角色操作', 'document.querySelectorAll(".wb-section")[2]');
      await click('移除角色', menu);
      await wait('!!document.querySelector("dialog[open]")');
      await click('移除角色', 'document.querySelector("dialog[open]")');
      await wait(`${draft}.prompt_structure.characters.length===0`);
      await click('添加角色');
      await wait(`${draft}.prompt_structure.characters.length===1`);
      const index = 0;
      const section = 2 + index * 2;
      const add = `document.querySelectorAll('.wb-section')[${section}].querySelector('.wb-add-trigger')`;
      await e(`${add}.scrollIntoView({block:'center'});${frame}`);
      const tag = mode === '跟随系统' ? 'standing' : 'glass window';
      start = await dragStart(source);
      await check(
        `系统减少动态效果且${mode}时拖动不放大也不过渡`,
        `matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(document.querySelector('.wb-drag-feedback')).transform==='none'&&getComputedStyle(document.querySelector('.wb-sortable-tag')).transitionDuration==='0s'`,
      );
      await move('mouseMoved', await center(h, add, 'center'), true);
      await wait(
        `!!document.querySelectorAll('.wb-section')[${section}].querySelector('.wb-insertion-slot')`,
      );
      const point = await center(h, 'document.querySelector(".wb-insertion-slot")', 'center');
      await move('mouseMoved', point, true);
      await move('mouseReleased', point);
      await wait(
        `${draft}.prompt_structure.characters[${index}].prompt_tags.some(t=>t.tag===${JSON.stringify(tag)})`,
      );
      await check(
        `系统减少动态效果且${mode}时跨角色放下写入草稿并清理拖动状态`,
        `${draft}.prompt_structure.characters[${index}].prompt_tags.some(t=>t.tag===${JSON.stringify(tag)})&&!${draft}.tags.some(t=>t.tag===${JSON.stringify(tag)})&&!document.querySelector('.wb-drag-feedback,.wb-insertion-slot,.wb-tag-dragging')`,
        undefined,
        'once',
      );
    }
    const changed = await e(`${draft}.prompt_structure.base_prompt_raw`);
    await h.window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    const targetStorage = path.join(env.mode.root, 'interaction-moved-assets');
    await migrate(targetStorage);
    migrated = true;
    await click('工作台', 'document.querySelector(".studio-titlebar")');
    for (const [i, record] of records.slice(0, 2).entries()) {
      await e(`${tab(i)}.click()`);
      await wait(
        `(()=>{const t=${tab(i)}.querySelector('img'),image=document.querySelector('.wb-canvas img');return t.complete&&t.naturalWidth>0&&image?.complete&&image.naturalWidth>0})()`,
      );
      const updated = env.database.loadProject(record.id);
      await check(
        '迁移后已打开标签页的缩略图和原图加载新路径',
        `(()=>{const t=${tab(i)}.querySelector('img'),i=document.querySelector('.wb-canvas img');return decodeURIComponent(t.src).includes(${JSON.stringify(path.basename(updated.thumbnail_path))})&&decodeURIComponent(i.src).includes('interaction-moved-assets')&&t.naturalWidth>0&&i.naturalWidth>0})()`,
        undefined,
        'once',
      );
    }
    await e(`${tab(1)}.click()`);
    await check(
      '迁移保留标签页草稿且更新持久化来源路径',
      `${draft}.prompt_structure.base_prompt_raw===${JSON.stringify(changed)}&&${session}.tabs.filter(t=>${JSON.stringify(ids)}.includes(t.id)).every(t=>t.source.path.includes('interaction-moved-assets'))`,
      undefined,
      'once',
    );
    await h.screenshot('interaction-migrated-tabs');
  } finally {
    await h.nativeKey('Escape');
    await move('mouseReleased', { x: 20, y: 300 });
    await h.window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    if (migrated) await migrate(originalStorage);
    await h.section('外观');
    await click(
      { full: '完整', reduced: '跟随系统', off: '关闭' }[originalMotion],
      'document.querySelector("[aria-label=动效]")',
    );
    await h.until(
      () => env.preferences.appearanceSettings().motion === originalMotion,
      '恢复原动效偏好',
    );
    await closeAddedTabs(h, previousTabs);
    await cleanup(env, records);
  }
}

export { pointer, center, prepare, library, restoredTabs, closeAddedTabs, cleanup };
