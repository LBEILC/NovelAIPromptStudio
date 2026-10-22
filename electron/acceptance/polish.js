import { selectGalleryGrouping } from './galleryView.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { importLibraryFiles } from '../importer.js';
import { parsePrompt } from '../../src/lib/prompt.js';
import { settleLayout } from './layout.js';

const viewer = 'document.querySelector(".viewer-ov")';
const canvas = 'document.querySelector(".viewer-img")';
const frame = 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))';

function pointerDriver(h) {
  return async (type, x, y, extra = {}) => {
    await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: type === 'mouseMoved' ? 0 : 1,
      ...extra,
    });
    await h.evaluate(frame);
  };
}

async function prepare(env, isolated = false) {
  env.h.window.setContentSize(1240, 760);
  const prefix = isolated ? 'workbench-polish-fixture' : 'synthetic-study';
  const files = await createWorkbenchFixtures(path.join(env.mode.root, 'polish-fixtures'), {
    prefix,
    seed: isolated ? 43000 : 42000,
  });
  const result = await importLibraryFiles({
    filePaths: files,
    database: env.database,
    assetsDirectory: env.preferences.librarySettings().assetsDirectory,
  });
  if (result.errors.length) throw Error('细节验收夹具导入失败');
  await env.h.reload();
  await env.h.click('图片库', 'document.querySelector(".tb")');
  await env.h.click('全部图片', 'document.querySelector(".libp")');
  await env.h.wait('document.querySelectorAll(".card").length > 0');
  await env.h.click('视图', 'document.querySelector(".libp")');
  await selectGalleryGrouping(env.h, '不合并');
  await env.h.key('Escape', {}, 'document.activeElement');
  await env.h.input('[aria-label="搜索图片库"]', prefix);
  if (isolated) {
    if (result.imported.length !== files.length) throw Error('工作台细节夹具必须独立导入');
    const ids = result.imported.map((project) => project.id);
    const matches = `(()=>{const cards=[...document.querySelectorAll('.card')];return cards.length===${ids.length}&&cards.every(card=>${JSON.stringify(ids)}.includes(card.dataset.groupId.replace("project:","")))})()`;
    await env.h.wait(matches, '仅显示本分类独立导入的图片');
    await env.h.check('工作台细节仅使用本分类导入的图片 ID', matches, undefined, 'once');
    return result.imported;
  }
  await env.h.wait('document.querySelectorAll(".card").length === 3');
  return env.database.loadLibrary('all').filter((p) => p.name.startsWith('synthetic-study-s-'));
}

async function selectImage(h, id) {
  await h.evaluate(
    `(()=>{const card=document.querySelector('[data-group-id="project:${id}"]'); if(!card) throw Error('夹具卡片不可见');card.click()})()`,
  );
  await h.wait(`document.querySelector('.col.detail')?.dataset.detailId === ${JSON.stringify(id)}`);
}

export async function libraryPolishChecks(env) {
  const { h } = env;
  const { evaluate: e, check, wait, click, key } = h;
  h.category('图片库·细节');
  const projects = await prepare(env);
  const pointer = pointerDriver(h);
  for (const shape of ['portrait', 'landscape']) {
    const project = projects.find((p) =>
      shape === 'portrait'
        ? p.metadata.height > p.metadata.width
        : p.metadata.width > p.metadata.height,
    );
    await selectImage(h, project.id);
    await key(' ', {}, 'document.querySelector(".lgrid")');
    await wait(`${canvas} && ${canvas}.querySelector('img').naturalWidth > 0`);

    await e(frame);

    await e(
      `(()=>{const n=${canvas},r=n.getBoundingClientRect();n.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,deltaY:-600}))})()`,
    );
    const center = await e(
      `(()=>{const r=${canvas}.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
    );
    await pointer('mousePressed', center.x, center.y);
    await pointer('mouseMoved', center.x + 100, center.y + 60);
    await pointer('mouseReleased', center.x + 100, center.y + 60);
    await settleLayout(h, '.viewer-ov');
    await e(
      `(()=>{const n=${canvas};n.scrollLeft=(n.scrollWidth-n.clientWidth)/2;n.scrollTop=(n.scrollHeight-n.clientHeight)/2;const c=n.getBoundingClientRect(),i=n.querySelector('img').getBoundingClientRect();window.polishAnchor={x:c.left+c.width*.57,y:c.top+c.height*.42};window.polishBefore={u:(polishAnchor.x-i.left)/i.width,v:(polishAnchor.y-i.top)/i.height};n.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:polishAnchor.x,clientY:polishAnchor.y,deltaY:-70}))})()`,
    );
    await e(frame);

    await h.screenshot(`polish-viewer-${shape}`);
    await e(
      `${canvas}.querySelector('img').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );

    const fitLabel = await e(`${viewer}.querySelector('.vz-pct')?.textContent`);
    await e(
      `${canvas}.querySelector('img').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );
    await check(
      '再次双击保持适应窗口',
      `${viewer}.querySelector('.vz-pct')?.textContent===${JSON.stringify(fitLabel)}`,
      undefined,
      'once',
    );
    await key('Escape', {}, viewer);
  }
  const base = projects[0];
  for (let i = 0; i < 36; i++)
    env.database.insertProject({
      ...base,
      id: `polish-grid-${i}`,
      name: `polish-grid-${i}`,
      tags: [],
    });
  await h.reload();
  await click('图片库', 'document.querySelector(".tb")');
  await h.input('[aria-label="搜索图片库"]', 'polish-grid-');
  await wait('document.querySelectorAll(".card").length>3');
  const grid = 'document.querySelector(".lib-grid-col > .scroll")';
  const pos = await e(
    `(()=>{const n=${grid},r=n.getBoundingClientRect(),c=n.querySelector('.card').getBoundingClientRect();return {x:c.right+2,y:c.top+2,toX:r.right-20,toY:c.bottom-2}})()`,
  );
  await pointer('mousePressed', pos.x, pos.y);
  await pointer('mouseMoved', pos.toX, pos.toY);
  await wait('document.querySelectorAll(".card.picked").length>0');
  const initial = await e(
    `[...${grid}.querySelectorAll('.card.picked')].map(c=>c.dataset.groupId)`,
  );

  await h.screenshot('polish-checkboxes');
  await e(`${grid}.scrollTop+=180`);
  await e(frame);
  const selectedCount = `Number(document.querySelector('.detail .sum b')?.textContent.match(/[0-9]+/)?.[0])`;
  await check(
    '图库框选随滚动扩展，已框住的数量不减少',
    `${selectedCount}>${initial.length}`,
    undefined,
    'once',
  );
  const edge = await e(
    `(()=>{const r=${grid}.getBoundingClientRect();return {x:r.right-20,y:r.bottom-2,top:${grid}.scrollTop}})()`,
  );
  await pointer('mouseMoved', edge.x, edge.y);
  await wait(`${grid}.scrollTop>${edge.top}`, '图库停在边缘持续自动滚动');
  await pointer('mouseReleased', edge.x, edge.y);
  const count = await e(selectedCount);
  await e(`${grid}.scrollTop=0`);
  await e(frame);
  await check(
    '松开后图库选区保留滚动前的首行和扩展数量',
    `${selectedCount}===${count} && ${JSON.stringify(initial)}.every(id=>document.querySelector('[data-group-id="'+id+'"]')?.classList.contains('picked'))`,
    undefined,
    'once',
  );
  const outside = await e(
    `(()=>{const n=${grid},r=n.getBoundingClientRect();return {x:r.left+2,y:r.top+2,toX:r.right-20,toY:r.bottom+150,height:n.scrollHeight}})()`,
  );
  await pointer('mousePressed', outside.x, outside.y);
  await pointer('mouseMoved', outside.toX, outside.toY);
  await e(`${grid}.scrollTop=${grid}.scrollHeight`);
  await e(frame);

  await pointer('mouseReleased', outside.toX, outside.toY);
}

export async function workbenchPolishChecks(env) {
  const { h } = env;
  const { evaluate: e, click, wait, check } = h;
  h.category('工作台·细节');
  const previousSize = h.window.getContentSize();
  const previousIds = env.database
    .loadLibrary('all')
    .map((project) => project.id)
    .sort();
  const projects = await prepare(env, true);
  let tabId;
  try {
    await selectImage(h, projects[0].id);
    await click('在工作台打开', 'document.querySelector(".detail")');
    await wait('!!document.querySelector(".prompt-in .tag[data-tag-key]")');
    tabId = await e('document.querySelector(".tabs [data-tab][aria-selected=true]").dataset.tab');
    await click('按文本编辑（Ctrl E 切换）');
    const raw = Array.from({ length: 160 }, (_, i) => `marquee_fixture_${i}`).join(', ');
    await h.input('.tx-wrap textarea', raw);
    await click('按块编辑（Ctrl E 切换）');
    await wait('document.querySelectorAll(".tags .tag[data-tag-key]").length>150');
    const scroll = 'document.querySelector(".col.prompt .scroll")';
    const pointer = pointerDriver(h);
    await e(`${scroll}.scrollTop=0`);
    const pos = await e(
      `(()=>{const r=${scroll}.getBoundingClientRect(),t=${scroll}.querySelector('.tag[data-tag-key]').getBoundingClientRect();return {x:r.left+10,y:t.top+1,toX:r.right-20,toY:t.bottom-1}})()`,
    );
    await pointer('mousePressed', pos.x, pos.y);
    await pointer('mouseMoved', pos.toX, pos.toY);
    await wait('document.querySelectorAll(".tags .tag[data-tag-key].sel").length>0');
    const original = await e(
      `[...document.querySelectorAll('.tags .tag[data-tag-key].sel')].map(t=>t.closest('[data-tag-key]').dataset.tagKey)`,
    );
    for (const delta of [100, 150, 90]) {
      await e(`${scroll}.scrollTop+=${delta}`);
      await e(frame);
      await check(
        '工作台框选中多次滚动仍保留起点附近的 Tag',
        `${JSON.stringify(original)}.every(k=>document.querySelector('[data-tag-key="'+k+'"].sel'))`,
        undefined,
        'once',
      );
    }
    const edge = await e(
      `(()=>{const r=${scroll}.getBoundingClientRect();return {x:r.right-20,y:r.bottom-2,top:${scroll}.scrollTop}})()`,
    );
    await pointer('mouseMoved', edge.x, edge.y);
    await wait(`${scroll}.scrollTop>${edge.top}`, '工作台停在下边缘持续自动滚动');
    await pointer('mouseReleased', edge.x, edge.y);
    await check(
      '松开后选择恰好等于内容坐标矩形覆盖的 Tag',
      `(()=>{const n=${scroll},r=n.getBoundingClientRect(),top=${pos.y}-r.top,bottom=${edge.y}-r.top+n.scrollTop;return [...n.querySelectorAll('[data-tag-key]')].every(t=>{const b=t.getBoundingClientRect(),inside=b.bottom-r.top+n.scrollTop>=top&&b.top-r.top+n.scrollTop<=bottom&&b.right>=${pos.x}&&b.left<=${edge.x};return t.classList.contains('sel')===inside})})()`,
      undefined,
      'once',
    );
    const selection = await e(`document.querySelectorAll('.tags .tag[data-tag-key].sel').length`);
    await e(`${scroll}.scrollTop=0`);
    await e(frame);
    await check(
      '松开后的普通滚动不改变已选 Tag',
      `document.querySelectorAll('.tags .tag[data-tag-key].sel').length===${selection}`,
      undefined,
      'once',
    );
    await e(`${scroll}.scrollTop=300`);
    await e(frame);
    const upper = await e(
      `(()=>{const r=${scroll}.getBoundingClientRect();return {x:r.left+10,y:r.top+r.height/2,toX:r.right-20,toY:r.top+2,top:${scroll}.scrollTop}})()`,
    );
    await pointer('mousePressed', upper.x, upper.y);
    await pointer('mouseMoved', upper.toX, upper.toY);
    await wait(`${scroll}.scrollTop<${upper.top}`, '工作台停在上边缘持续自动滚动');
    await check('工作台上边缘自动向上滚动', `${scroll}.scrollTop<${upper.top}`, undefined, 'once');
    await pointer('mouseReleased', upper.toX, upper.toY);
  } finally {
    if (tabId) {
      await e(
        `document.querySelector('[data-tab="${tabId}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:280,clientY:25}))`,
      );
      await click('关闭', 'document.querySelector(".menu:not(.leaving)")');
      if (await e('!!document.querySelector("[role=dialog]:not(.leaving *)")'))
        await click('丢弃并关闭', 'document.querySelector("[role=dialog]:not(.leaving *)")');
      await wait(`!document.querySelector('[data-tab="${tabId}"]')`);
    }
    for (const project of projects) {
      env.database.deleteProject(project.id);
      for (const file of [project.image_path, project.thumbnail_path]) {
        const relative = path.relative(env.mode.root, file);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
          throw Error('细节验收只清理本次临时目录内的夹具资源');
        await fs.rm(file, { force: true });
      }
    }
    await h.reload();
    h.window.setContentSize(...previousSize);
  }
  await check(
    '工作台细节清理夹具后保留原有图库图片',
    () =>
      JSON.stringify(
        env.database
          .loadLibrary('all')
          .map((project) => project.id)
          .sort(),
      ) === JSON.stringify(previousIds),
    undefined,
    'once',
  );
}
