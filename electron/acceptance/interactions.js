import { selectGalleryGrouping } from './galleryView.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { clipboard } from 'electron';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { importLibraryFiles } from '../importer.js';
import { settleElements, settleLayout } from './layout.js';
import { withWorkbenchState, sessionExpression, draftExpression } from './workbenchState.js';

const frame = 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))';
const menu = 'document.querySelector(".menu:not(.leaving)")';
const tabs = 'document.querySelectorAll(".tabs [data-tab]")';
const session = sessionExpression;
const draft = draftExpression;
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
async function center(h, selector, block = 'nearest', thumbnail = true) {
  await h.evaluate(
    `(${selector}).scrollIntoView({block:${JSON.stringify(block)},inline:'nearest'})`,
  );
  await settleElements(h, `[${selector}]`);
  return h.evaluate(
    `(async()=>{const n=${selector};n.scrollIntoView({block:${JSON.stringify(block)},inline:'nearest'});await ${frame};const target=${thumbnail}&&n.matches('.tabs [data-tab]')?n.querySelector('img')||n:n;const r=target.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
}
async function context(h, selector) {
  await settleElements(h, `[${selector}]`);
  await h.evaluate(
    `(()=>{const n=${selector},r=n.getBoundingClientRect();n.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}))})()`,
  );
  await h.wait(`${menu}!==null`, '图片菜单打开');
}
async function expectMenu(h, label, labels) {
  await h.check(
    label,
    `JSON.stringify([...${menu}.querySelectorAll('[role=menuitem]')].map(n=>n.textContent.trim()))===${JSON.stringify(JSON.stringify(labels))}`,
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
  await h.click('图片库', 'document.querySelector(".tb")');
  await h.click('全部图片', 'document.querySelector(".libp")');
  await h.input('[aria-label="搜索图片库"]', query);
  await h.click('视图', 'document.querySelector(".libp")');
  await selectGalleryGrouping(h, grouping);
  await h.key('Escape', {}, 'document.activeElement');
  await h.wait('document.querySelectorAll(".card").length>0');
}
async function closeAddedTabs(h, previous) {
  await h.nativeKey('Escape');
  await h.click('工作台', 'document.querySelector(".tb")');
  const added = await h.evaluate(
    `[...${tabs}].map(t=>t.dataset.tab).filter(id=>!${JSON.stringify(previous)}.includes(id))`,
  );
  for (const id of added) {
    await context(h, `document.querySelector('[data-tab="${id}"]')`);
    await h.click('关闭', menu);
    if (await h.evaluate('!!document.querySelector("[role=dialog]:not(.leaving *)")'))
      await h.click('丢弃并关闭', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await h.wait(`!document.querySelector('[data-tab="${id}"]')`);
  }
}
async function restoredTabs(h) {
  h = withWorkbenchState(h);
  const previous = await h.evaluate(`${session}?.tabs?.map(t=>t.id) ?? []`);
  await h.click('工作台', 'document.querySelector(".tb")');
  // The full suite leaves tabs open. Reload finishes before their async file
  // reads; observe the saved IDs before opening or cleaning up our own tabs.
  await h.wait(
    `JSON.stringify([...${tabs}].map(t=>t.dataset.tab).sort())===${JSON.stringify(JSON.stringify([...previous].sort()))}`,
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
  env = { ...env, h: withWorkbenchState(env.h) };
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
  const card = (id) => `document.querySelector('[data-group-id="project:${id}"]')`;
  let collectionId;
  try {
    await library(h, 'interaction-fixture-');
    await wait('document.querySelectorAll(".card").length===6');
    await e(`${card(records[0].id)}.click()`);
    await e(
      `${card(records[3].id)}.dispatchEvent(new MouseEvent('click',{bubbles:true,...${JSON.stringify(mod)}}))`,
    );
    await wait('document.querySelectorAll(".card.picked").length===2');
    await h.screenshot('interaction-checkboxes');
    await context(h, card(records[0].id));
    await expectMenu(h, '多选右键仅提供全部选中图片的操作', [
      '在工作台打开 2 张',
      '加入收藏集…',
      '标为 NSFW（2 张）',
      '标为不是 NSFW（2 张）',
      '恢复自动判定',
      '起名',
      '移入回收站',
    ]);
    await check(
      '多选菜单显示图片张数且保留选择',
      `document.querySelector('.detail .sum')?.textContent.includes('已选 2 张')&&document.querySelectorAll('.card.picked').length===2`,
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
      '在工作台用作底图',
      '加入收藏集…',
      '复制提示词',
      '标为 NSFW',
      '起名',
      '移入回收站',
    ]);
    await check(
      '右键未选中图片清除原多选并显示该图详情',
      `document.querySelectorAll('.card.picked').length===0&&document.querySelector('.col.detail')?.dataset.detailId===${JSON.stringify(records[1].id)}`,
      undefined,
      'once',
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
    await key('Escape');
    await e('document.querySelector(".detail .pic img").click()');
    await wait('!!document.querySelector(".viewer-ov")');
    await check(
      '右键看大图使用当前图片',
      `document.querySelector('.viewer-ov img')?.getAttribute('src')?.includes(${JSON.stringify(path.basename(records[1].image_path))})===true`,
      undefined,
      'once',
    );
    await key('Escape', {}, 'document.querySelector(".viewer-ov")');
    await context(h, card(records[1].id));
    await click('加入收藏集…', menu);
    await wait('!!document.querySelector(".lcollect:not(.leaving)")');
    await h.input('[aria-label="新收藏集名称"]', '交互验收收藏集');
    await click('新建并加入', 'document.querySelector(".lcollect:not(.leaving)")');
    await wait('!document.querySelector("[role=dialog]:not(.leaving *)")');
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
    await click('交互验收收藏集', 'document.querySelector(".libp .side")');
    await wait('document.querySelectorAll(".card").length===1');
    await context(h, card(records[1].id));
    await check(
      '普通收藏集菜单提供移出入口',
      `${menu}.textContent.includes('移出这个收藏集')`,
      undefined,
      'once',
    );
    await click('移出这个收藏集', menu);
    await wait('document.querySelectorAll(".card").length===0');
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
    await library(h, 'interaction-fixture-light', '完全相同');
    await wait('document.querySelectorAll(".card").length===1');
    const stack = 'document.querySelector(".card")';
    await e(`${stack}.click()`);
    await wait('document.querySelectorAll(".lstrip img").length===3');
    const order = await e(
      `[...document.querySelectorAll('.lstrip img')].map(i=>i.getAttribute('src'))`,
    );
    const originalDetail = await e('document.querySelector(".col.detail").dataset.detailId');
    const cover = await e(`${stack}.querySelector('img').getAttribute('src')`);
    const move = pointer(h);
    await settleLayout(h, '.card');
    const bounds = await e(
      `(()=>{const r=${stack}.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})()`,
    );
    await move('mouseMoved', { x: bounds.left - 5, y: bounds.top - 5 });
    await settleLayout(h, '.card');
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
        `${stack}.querySelector('img').naturalWidth>0&&${stack}.querySelector('.stack').textContent==='${index + 1} / 3'&&document.querySelector('.col.detail').dataset.detailId===${JSON.stringify(originalDetail)}&&!document.querySelector('.card.picked')`,
        undefined,
        'once',
      );
    }
    await h.screenshot('interaction-stack-scrub');
    const displayedSrc = await e(`${stack}.querySelector('img').getAttribute('src')`);
    const displayed = records.find((r) =>
      displayedSrc.includes(encodeURIComponent(r.thumbnail_path || r.image_path)),
    )?.id;
    if (!displayed) throw Error('翻看缩略图不属于本场景夹具');
    await e(`${stack}.click()`);
    await wait(
      `document.querySelector('.col.detail').dataset.detailId===${JSON.stringify(displayed)}`,
    );
    await check(
      '翻看时点击在详情栏打开刚才看到的图片',
      `document.querySelector('.col.detail').dataset.detailId===${JSON.stringify(displayed)}`,
      undefined,
      'once',
    );
    await context(h, stack);
    await move('mouseMoved', { x: bounds.left - 5, y: bounds.top - 5 });
    await check(
      '离开一摞恢复封面并移除分段条',
      `${stack}.querySelector('img').getAttribute('src')===${JSON.stringify(cover)}&&!${stack}.querySelector('.scrub-bar')`,
      undefined,
      'once',
    );
    await key('Escape');
    await e('document.querySelector(".detail .pic img").click()');
    await wait('!!document.querySelector(".viewer-ov")');
    await check(
      '翻看选中成员后从详情打开对应大图',
      `document.querySelector('.viewer-ov img')?.getAttribute('src')?.includes(${JSON.stringify(path.basename(records.find((r) => r.id === displayed).image_path))})===true`,
      undefined,
      'once',
    );
    await key('Escape', {}, 'document.querySelector(".viewer-ov")');
    await context(h, stack);
    await click('起名', menu);
    await wait('!!document.querySelector(".lname-edit input")');
    await check(
      '一组起名不提供仅当前图片选项',
      '!document.querySelector(".dcap").textContent.includes("仅当前图片")',
    );
    await check(
      '一组右键起名进入详情行内编辑并提示按顺序编号',
      `!document.querySelector('[role=dialog]:not(.leaving *)')&&!!document.querySelector('.lname-edit input')&&document.querySelector('.lname-hint').textContent.includes('3 张图片将按顺序编号')`,
      undefined,
      'once',
    );
    await key('Escape', {}, 'document.activeElement');
    await context(h, stack);
    await h.screenshot('interaction-menu-stack');
    await click('整组移入回收站（3 张）', menu);
    await wait('document.querySelectorAll(".card").length===0');
    await click('回收站', 'document.querySelector(".libp .side")');
    await h.input('[aria-label="搜索图片库"]', 'interaction-fixture-light');
    await wait('document.querySelectorAll(".card").length>0');
    await key('a', mod, 'document.querySelector(".lgrid")');
    await context(h, 'document.querySelector(".card")');
    await expectMenu(h, '回收站右键仅提供恢复和永久删除', ['恢复', '永久删除…']);
    await h.screenshot('interaction-menu-trash');
    await click('永久删除…', menu);
    await wait('!!document.querySelector("[role=dialog]:not(.leaving *)")');
    await check(
      '回收站右键永久删除仍需确认',
      `document.querySelector('[role=dialog]:not(.leaving *)').textContent.includes('永久删除')`,
      undefined,
      'once',
    );
    await click('取消', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await context(h, 'document.querySelector(".card")');
    await click('恢复', menu);
    await wait('document.querySelectorAll(".card").length===0');
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
  env = { ...env, h: withWorkbenchState(env.h) };
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
      `document.querySelector('.setcol .path span')?.textContent===${JSON.stringify(target)}`,
    );
    await wait(
      '![...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="更改位置")?.disabled',
    );
  };
  try {
    await h.section('通用');
    await click(
      env.mode.reducedMotion ? '跟随系统' : '完整',
      'document.querySelector("[aria-label=动效]")',
    );
    await library(h, 'workbench-interaction-fixture');
    for (const [index, record] of records.slice(0, 2).entries()) {
      await wait(`!!document.querySelector('[data-group-id="project:${record.id}"]')`);
      await e(`document.querySelector('[data-group-id="project:${record.id}"]').click()`);
      await wait(
        `document.querySelector('.col.detail')?.dataset.detailId===${JSON.stringify(record.id)}`,
      );
      await key('Enter', {}, 'document.querySelector(".lgrid")');
      await wait(`${tabs}.length===${previousTabs.length + index + 1}`);
      if (index === 0) await click('图片库', 'document.querySelector(".tb")');
    }
    await wait(`${tabs}.length===${previousTabs.length + 2}`);
    await click('工作台', 'document.querySelector(".tb")');
    const ids = await e(
      `[...${tabs}].map(t=>t.dataset.tab).filter(id=>!${JSON.stringify(previousTabs)}.includes(id))`,
    );
    const tab = (index) => `document.querySelector('[data-tab="${ids[index]}"]')`;
    // Reload and DOM clicks do not reset Chromium's pointer position. Enter the
    // tab from outside after scrolling, with no held button or open menu.
    await h.nativeKey('Escape');
    await move('mouseReleased', { x: 20, y: 300 });
    await move('mouseMoved', { x: 20, y: 300 });
    const previewPoint = await center(h, tab(0));
    await check(
      '标签页预览前置状态为无菜单且指针目标可见',
      `!document.querySelector('.menu:not(.leaving),[role=dialog]:not(.leaving *)')&&${tab(0)}.contains(document.elementFromPoint(${previewPoint.x},${previewPoint.y}))`,
      undefined,
      'once',
    );
    await move('mouseMoved', previewPoint);
    await wait('!!document.querySelector(".tab-peek:not(.leaving) img")');
    await wait('document.querySelector(".tab-peek:not(.leaving) img")?.naturalWidth>0');
    await check(
      '标签页预览包含缩略图、文件名、尺寸和导入时间',
      `(()=>{const p=document.querySelector('.tab-peek:not(.leaving)'),t=${tab(0)},i=p?.querySelector('img');return !!i&&i.src===t.querySelector('img').src&&p.querySelector('[data-file]')?.textContent===t.dataset.tip&&p.textContent.includes('×')&&/导入/.test(p.textContent)&&i.naturalWidth>0})()`,
    );

    await h.screenshot('interaction-tab-preview');
    // Scrolling an overflowing strip can move the next tab under a stationary
    // pointer. Leave it before scrollIntoView so the subsequent move is a real
    // entry, not a no-op after the scroll event has dismissed the preview.
    await move('mouseMoved', { x: 20, y: 300 });
    await move('mouseMoved', await center(h, tab(1)));
    await wait(`document.querySelector('.tab-peek img')?.src===${tab(1)}.querySelector('img').src`);
    await check(
      '相邻切换后当前标签页也能预览',
      `${tab(1)}.getAttribute('aria-selected')==='true'&&document.querySelector('.tab-peek img')?.src===${tab(1)}.querySelector('img').src`,
      undefined,
      'once',
    );
    let start = await center(h, tab(0));
    await move('mouseMoved', start);
    await move('mousePressed', start, true);
    await move('mouseMoved', { x: start.x + 10, y: start.y + 2 }, true);
    const target = await center(h, tab(1), 'nearest', false);
    await move('mouseMoved', target, true);
    await h.screenshot('interaction-tab-drag');
    await move('mouseReleased', target);
    await wait('!document.querySelector(".tabs [data-tab][data-dragging]")');
    const dragStart = async (selector) => {
      const point = await center(h, selector);
      await move('mouseMoved', point);
      await move('mousePressed', point, true);
      await move('mouseMoved', { x: point.x + 10, y: point.y + 2 }, true);
      await wait('!!document.querySelector(".drag-float")');
      return point;
    };
    await check(
      '标签页放下后交换位置',
      `[...${tabs}].findIndex(t=>t.dataset.tab===${JSON.stringify(ids[0])})>[...${tabs}].findIndex(t=>t.dataset.tab===${JSON.stringify(ids[1])})`,
      undefined,
      'once',
    );
    await e(`${tab(1)}.click()`);
    await wait('document.querySelectorAll(".tags .tag[data-tag-key]").length>3');
    const source = 'document.querySelector(".tags [data-tag-key]")';
    const original = await e(`${draft}.prompt_structure.base_prompt_raw`);
    start = await dragStart(source);
    await move('mouseMoved', { x: start.x + 65, y: start.y + 20 }, true);

    await h.screenshot('interaction-tag-drag');
    await h.nativeKey('Escape');
    await move('mouseReleased', start);
    await wait('!document.querySelector(".drag-float")');
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
    await wait('!document.querySelector(".drag-float")');
    await check(
      '拖出有效区域取消 Tag 移动',
      `${draft}.prompt_structure.base_prompt_raw===${JSON.stringify(original)}`,
      undefined,
      'once',
    );
    start = await dragStart(source);
    const nextBlock = await center(
      h,
      'document.querySelectorAll(".tags")[1].querySelector(".ghost[data-add]")',
    );
    await move('mouseMoved', nextBlock, true);
    await wait('!!document.querySelector(".tag.slot")');

    await h.screenshot('interaction-tag-cross-block');
    await move('mouseReleased', nextBlock);
    await wait(`${draft}.prompt_structure.base_prompt_raw!==${JSON.stringify(original)}`);
    await check(
      '跨块放下保留内容并移至目标块',
      `!document.querySelectorAll('.tags')[0].textContent.includes('blue hair')&&document.querySelectorAll('.tags')[1].textContent.includes('blue hair')&&document.querySelectorAll('.tags')[1].textContent.includes('1.25')`,
      undefined,
      'once',
    );
    await click('添加角色');
    await wait(`${draft}.prompt_structure.characters.length===1`);
    await click('Tag 块', 'document.querySelector(".char-empty")');
    await h.input('[data-add^=new-] input', 'character_anchor');
    await key('Enter');
    await wait(
      `${draft}.prompt_structure.characters[0].prompt_tags.some(t=>t.tag==='character_anchor')`,
    );
    const characterAdd = `document.querySelector('.char-sec').querySelector('.ghost[data-add],.char-empty')`;
    await e(`${characterAdd}.scrollIntoView({block:'center'});${frame}`);
    start = await dragStart(source);
    const character = await center(h, characterAdd, 'center');
    await move('mouseMoved', character, true);
    await wait('!!document.querySelector(".tag.slot")');

    // Inserting the slot and edge auto-scroll can move the original add button.
    // Release over the displayed destination, not its pre-insertion coordinates.
    const landing = await center(h, 'document.querySelector(".tag.slot")', 'center');
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
      await h.section('通用');
      await click(mode, 'document.querySelector("[aria-label=动效]")');
      await click('工作台', 'document.querySelector(".tb")');
      await wait('document.documentElement.dataset.motion==="off"');
      const index = 0;
      const add = `document.querySelectorAll('.char-sec')[${index}].querySelector('.ghost[data-add],.char-empty')`;
      await e(`${add}.scrollIntoView({block:'center'});${frame}`);
      const tag = mode === '跟随系统' ? 'standing' : 'glass window';
      start = await dragStart(source);
      await move('mouseMoved', await center(h, add, 'center'), true);
      await wait(`!!document.querySelectorAll('.char-sec')[${index}].querySelector('.tag.slot')`);
      const point = await center(h, 'document.querySelector(".tag.slot")', 'center');
      await move('mouseMoved', point, true);
      await move('mouseReleased', point);
      await wait(
        `${draft}.prompt_structure.characters[${index}].prompt_tags.some(t=>t.tag===${JSON.stringify(tag)})`,
      );
      await check(
        `系统减少动态效果且${mode}时跨角色放下写入草稿并清理拖动状态`,
        `${draft}.prompt_structure.characters[${index}].prompt_tags.some(t=>t.tag===${JSON.stringify(tag)})&&!${draft}.tags.some(t=>t.tag===${JSON.stringify(tag)})&&!document.querySelector('.drag-float,.tag.slot,.tag.dragging')`,
        undefined,
        'once',
      );
    }
    const changed = await e(`${draft}.prompt_structure.base_prompt_raw`);
    await h.window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    const targetStorage = path.join(env.mode.root, 'interaction-moved-assets');
    await migrate(targetStorage);
    migrated = true;
    await click('工作台', 'document.querySelector(".tb")');
    for (const i of [0, 1]) {
      await e(`${tab(i)}.click()`);
      await wait(
        `(()=>{const t=${tab(i)}.querySelector('img'),image=document.querySelector('.stage .canvas img');return t.complete&&t.naturalWidth>0&&image?.complete&&image.naturalWidth>0})()`,
      );
      const projectId = await e(
        `${session}.tabs.find(t=>t.id===${JSON.stringify(ids[i])}).source.projectId`,
      );
      const updated = env.database.loadProject(projectId);
      // The tab switch cross-fades: wait for the new image itself, not just any decoded canvas image.
      const moved = `(()=>{const t=${tab(i)}.querySelector('img'),i=document.querySelector('.stage .canvas img');return decodeURIComponent(t.src).includes(${JSON.stringify(path.basename(updated.thumbnail_path))})&&decodeURIComponent(i.src).includes('interaction-moved-assets')&&t.naturalWidth>0&&i.naturalWidth>0})()`;
      try {
        await wait(moved, '迁移后的标签页图片换成新路径');
      } catch (error) {
        console.error(
          '迁移路径证据',
          await e(
            `({session:${session},canvas:[...document.querySelectorAll('.stage .canvas img')].map(n=>({src:n.src,width:n.naturalWidth})),thumbnail:${tab(i)}.querySelector('img').src})`,
          ),
        );
        throw error;
      }
      await check('迁移后已打开标签页的缩略图和原图加载新路径', moved, undefined, 'once');
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
    await h.section('通用');
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
