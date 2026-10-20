import path from 'node:path';
import fs from 'node:fs/promises';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { importLibraryFiles } from '../importer.js';
import { parsePrompt } from '../../src/lib/prompt.js';
import { settleLayout } from './layout.js';

const viewer = 'document.querySelector(".library-viewer")';
const canvas = 'document.querySelector(".library-viewer-canvas")';
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
  await env.h.click('图片库', 'document.querySelector(".studio-titlebar")');
  await env.h.click('全部图片', 'document.querySelector(".library-page")');
  await env.h.wait('document.querySelectorAll(".library-card").length > 0');
  await env.h.click('视图', 'document.querySelector(".library-page")');
  await env.h.click('不合并', 'document.querySelector("[aria-label=合并方式]")');
  await env.h.key('Escape', {}, 'document.activeElement');
  await env.h.input('[aria-label="搜索图片库"]', prefix);
  if (isolated) {
    if (result.imported.length !== files.length) throw Error('工作台细节夹具必须独立导入');
    const ids = result.imported.map((project) => project.id);
    const matches = `(()=>{const cards=[...document.querySelectorAll('.library-card')];return cards.length===${ids.length}&&cards.every(card=>${JSON.stringify(ids)}.includes(card.dataset.projectId))})()`;
    await env.h.wait(matches, '仅显示本分类独立导入的图片');
    await env.h.check('工作台细节仅使用本分类导入的图片 ID', matches, undefined, 'once');
    return result.imported;
  }
  await env.h.wait('document.querySelectorAll(".library-card").length === 3');
  return env.database.loadLibrary('all').filter((p) => p.name.startsWith('synthetic-study-s-'));
}

async function selectImage(h, id) {
  await h.evaluate(
    `(()=>{const card=document.querySelector('[data-project-id="${id}"]'); if(!card) throw Error('夹具卡片不可见');card.click()})()`,
  );
  await h.wait(
    `document.querySelector('.library-detail')?.dataset.detailId === ${JSON.stringify(id)}`,
  );
}

export async function libraryPolishChecks(env) {
  const { h } = env;
  const { evaluate: e, check, wait, click, key } = h;
  h.category('图片库·细节');
  const projects = await prepare(env);
  await check(
    '图片库搜索快捷键使用共享 Shortcut 并按平台显示',
    `document.querySelector('.library-search .nps-kbd')?.textContent === ${JSON.stringify(process.platform === 'darwin' ? '⌘ K' : 'Ctrl K')}`,
  );
  const pointer = pointerDriver(h);
  for (const shape of ['portrait', 'landscape']) {
    const project = projects.find((p) =>
      shape === 'portrait'
        ? p.metadata.height > p.metadata.width
        : p.metadata.width > p.metadata.height,
    );
    await selectImage(h, project.id);
    await key(' ', {}, 'document.querySelector("[data-library-grid]")');
    await wait(`${canvas} && ${canvas}.querySelector('img').naturalWidth > 0`);

    await e(frame);

    await check(
      '大图没有原生滚动条和自绘细条',
      `${canvas}.querySelector('.nps-scroll-thumb')===null && getComputedStyle(${canvas}).scrollbarWidth==='none'`,
    );
    for (const rotation of [0, 90, 270]) {
      if (rotation)
        for (let i = 0; i < (rotation === 90 ? 1 : 2); i++) await click('向右旋转', viewer);
      for (const zoom of [1, 4]) {
        await click('100%', viewer);
        if (zoom === 4)
          await e(
            `(()=>{const n=${canvas},r=n.getBoundingClientRect();n.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,deltaY:-Math.log(4)/0.002}))})()`,
          );
        await e(frame);

        for (const [horizontal, vertical] of [
          [1, 1],
          [-1, 1],
          [-1, -1],
          [1, -1],
        ]) {
          const center = await e(
            `(()=>{const r=${canvas}.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
          );
          await pointer('mousePressed', center.x, center.y);
          await pointer('mouseMoved', center.x + horizontal * 20000, center.y + vertical * 20000);
          await pointer(
            'mouseReleased',
            center.x + horizontal * 20000,
            center.y + vertical * 20000,
          );
        }
      }
    }
    await settleLayout(h, '.library-viewer');
    await e(
      `(()=>{const n=${canvas};n.scrollLeft=(n.scrollWidth-n.clientWidth)/2;n.scrollTop=(n.scrollHeight-n.clientHeight)/2;const c=n.getBoundingClientRect(),i=n.querySelector('img').getBoundingClientRect();window.polishAnchor={x:c.left+c.width*.57,y:c.top+c.height*.42};window.polishBefore={u:(polishAnchor.x-i.left)/i.width,v:(polishAnchor.y-i.top)/i.height};n.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:polishAnchor.x,clientY:polishAnchor.y,deltaY:-70}))})()`,
    );
    await e(frame);

    await h.screenshot(`polish-viewer-${shape}`);
    await e(
      `${canvas}.querySelector('img').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );

    const fitLabel = await e(`${viewer}.querySelector('[aria-label="100%"]')?.textContent`);
    await e(
      `${canvas}.querySelector('img').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );
    await check(
      '再次双击保持适应窗口',
      `${viewer}.querySelector('[aria-label="100%"]')?.textContent===${JSON.stringify(fitLabel)}`,
      undefined,
      'once',
    );
    await key('Escape', {}, viewer);
  }
  const base = projects[0];
  const raw = Array.from({ length: 100 }, (_, i) => `synthetic_tag_${i}`).join(', ');
  env.database.insertProject({
    ...base,
    id: 'polish-long-tags',
    name: 'polish-long-tags',
    tags: parsePrompt(raw),
    metadata: { ...base.metadata, prompt_raw: raw, negative_prompt_raw: '' },
    prompt_structure: {
      ...base.prompt_structure,
      base_prompt_raw: raw,
      base_undesired_raw: '',
      base_undesired_tags: [],
      characters: [],
    },
  });
  await h.reload();
  await click('图片库', 'document.querySelector(".studio-titlebar")');
  await h.input('[aria-label="搜索图片库"]', 'polish-long-tags');
  await wait('document.querySelectorAll(".library-card").length===1');
  await selectImage(h, 'polish-long-tags');
  await wait('!!document.querySelector(".library-tags:not(.library-tags-measure) .nps-button")');

  await h.screenshot('polish-detail-collapsed');
  await e(`document.querySelector('.library-tags:not(.library-tags-measure) .nps-button').click()`);
  await e(frame);

  for (let i = 0; i < 36; i++)
    env.database.insertProject({
      ...base,
      id: `polish-grid-${i}`,
      name: `polish-grid-${i}`,
      tags: [],
    });
  await h.reload();
  await click('图片库', 'document.querySelector(".studio-titlebar")');
  await h.input('[aria-label="搜索图片库"]', 'polish-grid-');
  await wait('document.querySelectorAll(".library-card").length>3');
  const grid = 'document.querySelector("[data-library-grid]")';
  const pos = await e(
    `(()=>{const n=${grid},r=n.getBoundingClientRect(),c=n.querySelector('.library-card').getBoundingClientRect();return {x:r.left+2,y:c.top+2,toX:r.right-20,toY:c.bottom-2}})()`,
  );
  await pointer('mousePressed', pos.x, pos.y);
  await pointer('mouseMoved', pos.toX, pos.toY);
  await wait('document.querySelectorAll(".library-card.picked").length>0');
  const initial = await e(
    `[...${grid}.querySelectorAll('.library-card.picked')].map(c=>c.dataset.groupId)`,
  );

  await h.screenshot('polish-checkboxes');
  await e(`${grid}.scrollTop+=180`);
  await e(frame);
  const selectedCount = `Number(document.querySelector('.library-summary b')?.textContent.match(/[0-9]+/)?.[0])`;
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
  await wait(`${grid}.scrollTop>${edge.top}+60`, '图库停在边缘持续自动滚动');
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
    await e(
      `document.querySelector('[data-project-id="${projects[0].id}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );
    await wait('!!document.querySelector(".wb-editor .nps-tag")');
    tabId = await e('document.querySelector(".wb-tab[data-active]").dataset.workbenchTabId');
    await e(`document.querySelector('.wb-tags [data-wb-tag]:last-of-type .nps-tag').click()`);
    await wait('!!document.querySelector(".wb-tag-editor")');
    await h.input('[aria-label="译文"]', '合成验收用的较长译文');
    await click('完成', 'document.querySelector(".wb-tag-editor")');
    await wait('!document.querySelector(".wb-tag-editor")');
    await click('显示', 'document.querySelector(".wb-prompt-head")');
    await h.select('语言', '对照');
    await h.key('Escape', {}, 'document.activeElement');
    await wait('!!document.querySelector(".wb-tags .nps-tag-zh")');
    await h.screenshot('polish-tag-translation');

    await e(
      `document.querySelectorAll('.wb-tags')[1].querySelector('[data-wb-tag]:last-of-type .nps-tag').click()`,
    );
    await h.input('[aria-label="译文"]', '光线');
    await click('完成', 'document.querySelector(".wb-tag-editor")');
    await click('输入中文或英文', 'document.querySelectorAll(".wb-tags")[1]');

    await h.screenshot('polish-tag-adjacent-input');
    await h.key('Escape', {}, 'document.activeElement');
    await e(
      `document.querySelectorAll('.wb-tags')[1].querySelector('[data-wb-tag]:last-of-type .nps-tag').click()`,
    );
    await h.input('[aria-label="译文"]', '合成译文'.repeat(30));
    await click('完成', 'document.querySelector(".wb-tag-editor")');

    await click('更多', 'document.querySelector(".wb-section")');
    await click('切换为文本编辑', 'document.querySelector(".nps-layer [role=menu]")');
    const raw = Array.from({ length: 160 }, (_, i) => `marquee_fixture_${i}`).join(', ');
    await h.input('.wb-text-section textarea', raw);
    await click('按块编辑（Ctrl E 切换）');
    await wait('document.querySelectorAll(".wb-tags .nps-tag").length>150');
    const scroll = 'document.querySelector(".wb-document-scroll")';
    const pointer = pointerDriver(h);
    await e(`${scroll}.scrollTop=0`);
    const pos = await e(
      `(()=>{const r=${scroll}.getBoundingClientRect(),t=${scroll}.querySelector('.nps-tag').getBoundingClientRect();return {x:r.left+10,y:t.top+1,toX:r.right-20,toY:t.bottom-1}})()`,
    );
    await pointer('mousePressed', pos.x, pos.y);
    await pointer('mouseMoved', pos.toX, pos.toY);
    await wait('document.querySelectorAll(".wb-tags .nps-tag-selected").length>0');
    const original = await e(
      `[...document.querySelectorAll('.wb-tags .nps-tag-selected')].map(t=>t.closest('[data-marquee-key]').dataset.marqueeKey)`,
    );
    for (const delta of [100, 150, 90]) {
      await e(`${scroll}.scrollTop+=${delta}`);
      await e(frame);
      await check(
        '工作台框选中多次滚动仍保留起点附近的 Tag',
        `${JSON.stringify(original)}.every(k=>document.querySelector('[data-marquee-key="'+k+'"] .nps-tag-selected'))`,
        undefined,
        'once',
      );
    }
    const edge = await e(
      `(()=>{const r=${scroll}.getBoundingClientRect();return {x:r.right-20,y:r.bottom-2,top:${scroll}.scrollTop}})()`,
    );
    await pointer('mouseMoved', edge.x, edge.y);
    await wait(`${scroll}.scrollTop>${edge.top}+60`, '工作台停在下边缘持续自动滚动');
    await pointer('mouseReleased', edge.x, edge.y);
    await check(
      '松开后选择恰好等于内容坐标矩形覆盖的 Tag',
      `(()=>{const n=${scroll},r=n.getBoundingClientRect(),top=${pos.y}-r.top,bottom=${edge.y}-r.top+n.scrollTop;return [...n.querySelectorAll('[data-marquee-key]')].every(t=>{const b=t.getBoundingClientRect(),inside=b.bottom-r.top+n.scrollTop>=top&&b.top-r.top+n.scrollTop<=bottom&&b.right>=${pos.x}&&b.left<=${edge.x};return t.querySelector('.nps-tag').classList.contains('nps-tag-selected')===inside})})()`,
      undefined,
      'once',
    );
    const selection = await e(`document.querySelectorAll('.wb-tags .nps-tag-selected').length`);
    await e(`${scroll}.scrollTop=0`);
    await e(frame);
    await check(
      '松开后的普通滚动不改变已选 Tag',
      `document.querySelectorAll('.wb-tags .nps-tag-selected').length===${selection}`,
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
    await wait(`${scroll}.scrollTop<${upper.top}-60`, '工作台停在上边缘持续自动滚动');
    await check(
      '工作台上边缘自动向上滚动',
      `${scroll}.scrollTop<${upper.top}-60`,
      undefined,
      'once',
    );
    await pointer('mouseReleased', upper.toX, upper.toY);
  } finally {
    if (tabId) {
      await e(
        `document.querySelector('[data-workbench-tab-id="${tabId}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:280,clientY:25}))`,
      );
      await click('关闭', 'document.querySelector(".nps-menu:popover-open")');
      if (await e('!!document.querySelector("dialog[open]")'))
        await click('丢弃并关闭', 'document.querySelector("dialog[open]")');
      await wait(`!document.querySelector('[data-workbench-tab-id="${tabId}"]')`);
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
