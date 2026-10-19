import { libraryNamingChecks } from './libraryNaming.js';
import { libraryGroupingChecks } from './libraryGrouping.js';
import { libraryViewerChecks } from './libraryViewer.js';
import { libraryTagFilterChecks } from './libraryTagFilter.js';
import { scrollChecks } from './scroll.js';
import { libraryCopyChecks } from './libraryCopy.js';
import {
  checkLibraryButtonGaps,
  checkCollectionContext,
  libraryFinishChecks,
} from './libraryFinish.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { clipboard, nativeImage } from 'electron';
import { createRequire } from 'node:module';
import { getPromptScopes } from '../../src/lib/promptStructure.js';
import { importLibraryFiles } from '../importer.js';
import { extraLibraryChecks } from './libraryExtras.js';
import { libraryImportExtras } from './libraryImportExtras.js';
import { motionDetails } from './motion.js';
import { capture, finish } from './transitions.js';
import { focusRingChecks } from './focusRings.js';
const require = createRequire(import.meta.url);

export async function libraryChecks(env) {
  const { h, database, files, mode, doubles, assetsDirectory } = env;
  const { evaluate: e, wait, check, key } = h;
  const settled = async () => {
    await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await wait('!document.querySelector("[data-library-updating=true]")');
  };
  const click = async (...args) => {
    await h.click(...args);
    await settled();
  };
  const input = async (...args) => {
    await h.input(...args);
    await settled();
  };
  const mod = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  const scope = 'document.querySelector(".library-page")';
  const dialog = 'document.querySelector("dialog[open]")';
  const grid = 'document.querySelector("[data-library-grid]")';
  const selectCard = async (index = 0, options = {}) => {
    await e(
      `(()=>{const node=document.querySelector('[data-library-index="${index}"]');node.focus();node.dispatchEvent(new MouseEvent('click',${JSON.stringify({ bubbles: true, ...options })}));})()`,
    );
    await wait(
      'document.querySelector(".library-detail[data-detail-id]") || document.querySelector(".library-summary")',
    );
  };
  const closePopover = async () => {
    await key('Escape', {}, 'document.activeElement');
    await wait('!document.querySelector(".nps-popover:popover-open")');
  };
  const all = async () => {
    await click('全部图片', scope);
    await wait('document.querySelectorAll(".library-card").length>0');
  };
  const refresh = async (empty = false) => {
    await h.reload();
    await wait('!!document.querySelector(".studio-titlebar")');
    await click('图片库', 'document.querySelector(".studio-titlebar")');
    if (empty) await click('全部图片', scope);
    else await all();
  };
  const setGrouping = async (label) => {
    await click('视图', scope);
    await click(label, 'document.querySelector("[role=radiogroup][aria-label=合并方式]")');
    await closePopover();
    await wait('document.querySelectorAll(".library-card").length>0');
  };
  const screen = async (name) => {
    await h.screenshot(`library-${name}-${mode.theme}`);
  };
  const waitDetail = async () =>
    wait(
      'document.querySelector(".library-card.current")?.dataset.projectId === document.querySelector(".library-detail")?.dataset.detailId',
    );
  if (mode.category === '图片库') await libraryNamingChecks(env);
  if (!['图片库·导入', '图片库·收尾'].includes(mode.category)) await libraryGroupingChecks(env);
  if (!['图片库·导入', '图片库·收尾'].includes(mode.category)) await libraryViewerChecks(env);
  if (!['图片库·导入', '图片库·收尾'].includes(mode.category)) await libraryTagFilterChecks(env);
  if (mode.category === '图片库·收尾') {
    await libraryFinishChecks({ h, database, refresh, click, input, selectCard, waitDetail });
    return;
  }
  const fresh = [];
  for (const [name, width, height] of [
    ['landscape', 800, 480],
    ['square', 600, 600],
  ]) {
    const file = path.join(mode.root, `library-${name}.png`);
    await sharp(files[0]).extract({ left: 0, top: 0, width, height }).png().toFile(file);
    fresh.push(file);
  }
  const mixed = await importLibraryFiles({ filePaths: fresh, database, assetsDirectory });
  if (mixed.imported.length !== 2) throw Error('横图与方图准备失败');
  const paragraph = database.loadLibrary('all').find((p) => p.name === 'library-landscape');
  const raw = 'A woman is waiting beside a quiet window. The evening light falls across her face.';
  database.insertProject({
    ...paragraph,
    id: 'acceptance-paragraph',
    name: '验收段落',
    tags: [],
    metadata: { ...paragraph.metadata, prompt_raw: raw },
    prompt_structure: { ...paragraph.prompt_structure, base_prompt_raw: raw },
  });
  await refresh();
  for (const reduced of mode.category === '图片库·导入'
    ? []
    : mode.category === '减少动态效果'
      ? [true]
      : [false, true]) {
    h.category(`图片库·${reduced ? '关闭动效' : '正常动效'}`);
    await e(
      `window.studio.saveAppearanceSettings({motion:${JSON.stringify(reduced ? 'off' : 'full')}})`,
    );
    await refresh();
    await h.checkSoon(
      '图片库应用保存的动效模式',
      `document.documentElement.dataset.motion === '${reduced ? 'off' : 'full'}'`,
      12000,
      '',
      motionDetails,
      'once',
    );
    await wait(`document.documentElement.dataset.motion === '${reduced ? 'off' : 'full'}'`);
    await all();
    await setGrouping('不合并');
    // Constrain the viewport so this small synthetic fixture exercises virtual scrolling.
    await e(`${grid}.style.maxHeight='200px'`);
    await settled();
    await scrollChecks(h, '[data-library-grid]');
    await e(`${grid}.style.maxHeight=''`);
    await e(`${grid}.scrollTop=0`);
    await settled();
    if (mode.category === '图片库·滚动条') return;
    await selectCard();
    await waitDetail();
    await check(
      '详情 Tag 折叠包含展开按钮且不超过两行',
      `[...document.querySelectorAll('.library-tags-container > .library-tags:not(.library-tags-measure)')].every(block=>new Set([...block.children].map(tag=>tag.offsetTop)).size<=2)`,
      undefined,
      'both',
    );
    const expectedAll = database.loadLibrary('all').length,
      expectedTrash = database.loadLibrary('trash').length;
    await check(
      '侧栏全部图片与回收站数量来自真实数据库',
      `Number(document.querySelector('.library-side [aria-label="全部图片"] span').textContent)===${expectedAll} && Number(document.querySelector('.library-side [aria-label="回收站"] span').textContent)===${expectedTrash}`,
      undefined,
      'once',
    );
    await check(
      '横竖方图每行等高、非末行铺满、比例准确',
      `(()=>{const rows=[...document.querySelectorAll('.library-row')];const cards=rows.flatMap(row=>[...row.querySelectorAll('.library-card')]);return rows.length>1 && rows.every((row,i)=>{const rect=row.getBoundingClientRect();const items=[...row.querySelectorAll('.library-card')];return items.every(c=>Math.abs(c.getBoundingClientRect().height-rect.height)<=1) && (i===rows.length-1 || Math.abs(items.at(-1).getBoundingClientRect().right-rect.right)<=1)}) && cards.every(c=>{const image=c.querySelector('img');const rect=c.getBoundingClientRect();return !image.complete||!image.naturalWidth||Math.abs(rect.width/rect.height-Math.min(2.5,Math.max(.5,image.naturalWidth/image.naturalHeight)))<.02})})()`,
      undefined,
      'both',
    );
    await checkLibraryButtonGaps(h, '默认');
    if (!reduced) await screen('mixed');
    await selectCard(1);
    await waitDetail();
    const current = await e('document.querySelector(".library-card.current").dataset.groupId');
    await key('ArrowRight', {}, grid);
    await wait(
      `document.querySelector('.library-card.current')?.dataset.groupId!==${JSON.stringify(current)}`,
    );
    await check(
      '左右键按顺序移动当前卡片',
      'document.querySelector(".library-card.current").dataset.libraryIndex==="2"',
      undefined,
      'once',
    );
    await key('ArrowLeft', {}, grid);
    await check(
      '关于页列出的左键返回上一张卡片',
      'document.querySelector(".library-card.current").dataset.libraryIndex==="1"',
      undefined,
      'once',
    );
    await key('ArrowRight', {}, grid);
    await key('ArrowDown', {}, grid);
    await check(
      '下键移动到相邻行水平位置最近的一张',
      `(()=>{const c=document.querySelector('.library-card.current');const previous=document.querySelector('[data-library-index="2"]');const x=previous.getBoundingClientRect().x+previous.clientWidth/2;const items=[...c.parentElement.children];const nearest=items.reduce((a,b)=>Math.abs(a.getBoundingClientRect().x+a.clientWidth/2-x)<=Math.abs(b.getBoundingClientRect().x+b.clientWidth/2-x)?a:b);return c===nearest && c.parentElement!==previous.parentElement})()`,
      undefined,
      'once',
    );
    await key('ArrowUp', {}, grid);
    await check(
      '上键返回上方最近的一张',
      'Number(document.querySelector(".library-card.current").dataset.libraryIndex)<5',
      undefined,
      'once',
    );
    await selectCard(0, { ctrlKey: true });
    await selectCard(1, { metaKey: true });
    await check(
      'Ctrl 与 Cmd 单击均进入多选',
      'document.querySelectorAll(".library-card.picked").length===2 && !!document.querySelector(".library-selection-bar")',
      undefined,
      'once',
    );
    await e('document.querySelectorAll(".library-pick")[2].click()');
    await check(
      '复选框追加第三张且不清空已有多选',
      'document.querySelectorAll(".library-card.picked").length===3',
      undefined,
      'once',
    );
    await selectCard(0);
    await check(
      '多选时点击图片仅移除这一张',
      'document.querySelectorAll(".library-card.picked").length===2',
      undefined,
      'once',
    );
    await e(`${grid}.click()`);
    await check(
      '点击网格空白处退出多选',
      '!document.querySelector(".library-card.picked")',
      undefined,
      'once',
    );
    await e('document.querySelector(".library-pick").click()');
    await check(
      '无多选时复选框进入多选且有名称和勾选语义',
      'document.querySelectorAll(".library-card.picked").length===1 && document.querySelector(".library-pick[role=checkbox][aria-checked=true]").getAttribute("aria-label").length>0',
      undefined,
      'once',
    );
    await e(
      `(()=>{const card=document.querySelector('.library-card.picked');for(const [type,detail] of [['click',1],['click',2],['dblclick',2]])card.dispatchEvent(new MouseEvent(type,{bubbles:true,detail}))})()`,
    );
    await check(
      '多选最后一张双击不会打开工作台',
      '!!document.querySelector(".library-page") && !document.querySelector(".library-card.picked")',
      undefined,
      'once',
    );
    await e('document.querySelector(".library-pick").focus()');
    await h.nativeKey(' ');
    await check(
      '空格切换复选框且不打开大图',
      'document.querySelectorAll(".library-card.picked").length===1 && !document.querySelector(".library-viewer")',
      undefined,
      'once',
    );
    await h.nativeKey('Enter');
    await check(
      '回车切换复选框且不打开工作台',
      '!document.querySelector(".library-card.picked") && !!document.querySelector(".library-page")',
      undefined,
      'once',
    );
    await key('Escape', {}, grid);
    await selectCard(0);
    await selectCard(2, { shiftKey: true });
    await check(
      'Shift 单击连续选中三张',
      'document.querySelectorAll(".library-card.picked").length===3',
      undefined,
      'once',
    );
    await checkLibraryButtonGaps(h, '多选');
    if (!reduced) await screen('select');
    await click('取消', 'document.querySelector(".library-selection-bar")');
    await check(
      '多选取消退出操作条',
      '!document.querySelector(".library-selection-bar")',
      undefined,
      'once',
    );
    await e(
      `(()=>{const node=${grid};const r=node.getBoundingClientRect();for(const [type,x,y] of [['pointerdown',r.left+5,r.top+5],['pointermove',r.left+240,r.top+160],['pointerup',r.left+240,r.top+160]])node.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:2,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y}));})()`,
    );
    await check(
      '拖动框选选择实际相交的卡片',
      'document.querySelectorAll(".library-card.picked").length>0',
      undefined,
      'once',
    );
    await key('Escape', {}, grid);
    await key('a', mod, grid);
    await check(
      'Mod+A 选择全部组，Esc 退出',
      `document.querySelector('.library-selection-bar')?.textContent.includes('${expectedAll} 张')`,
      undefined,
      'once',
    );
    await key('Escape', {}, grid);
    await check(
      'Esc 清空多选',
      '!document.querySelector(".library-selection-bar")',
      undefined,
      'once',
    );

    await input('.gallery-search input', 'waiting');
    await wait(
      'document.querySelectorAll(".library-card").length>0 || !!document.querySelector(".library-empty")',
    );
    const paragraphMatches = database
      .loadLibrary('all')
      .filter((p) =>
        getPromptScopes(p).some((s) => s.raw_prompt.toLowerCase().includes('waiting')),
      );
    await check(
      '搜索能命中段落中的词',
      `document.querySelectorAll('.library-card').length===${paragraphMatches.length} && ${paragraphMatches.length}>0`,
      undefined,
      'once',
    );
    await input('.gallery-search input', '');
    await wait('document.querySelectorAll(".library-card").length>2');
    await click('筛选', scope);
    await input('input[aria-label="包含 Tag"]', '1girl');
    await key('Enter');
    await closePopover();
    await wait('document.querySelector(".library-condition-count")?.textContent==="1"');
    await check(
      '包含 Tag 生效并显示条件数',
      'document.querySelectorAll(".library-card").length>0 && document.querySelector(".library-chip").textContent.includes("1girl")',
      undefined,
      'once',
    );
    await click('筛选', scope);
    await input('input[aria-label="排除 Tag"]', '1girl');
    await key('Enter');
    await closePopover();
    await wait('!!document.querySelector(".library-empty")');
    await check(
      '组合包含与排除生效',
      'document.querySelector(".library-empty").textContent.includes("没有符合条件的图片")',
      undefined,
      'once',
    );
    if (!reduced) await screen('nomatch');
    await click('移除排除 1girl', scope);
    await wait('document.querySelectorAll(".library-card").length>0');
    await click('清除', scope);
    await check(
      '逐条移除和一次清除筛选',
      '!document.querySelector(".library-condition-count") && !document.querySelector(".library-chip")',
      undefined,
      'once',
    );
    await click('筛选', scope);
    for (const index of [0, 1]) {
      await e(
        `document.querySelectorAll('.library-filter-options')[${index}].querySelector('[role=checkbox]').click()`,
      );
      await closePopover();
      await wait(
        'document.querySelectorAll(".library-card").length>0 || !!document.querySelector(".library-empty")',
      );
      await check(
        `${index === 0 ? '模型' : 'Vibe'} 条件单独生效`,
        'document.querySelectorAll(".library-chip").length===1',
        undefined,
        'once',
      );
      await click('清除', scope);
      await click('筛选', scope);
    }
    await h.select('导入时间', '最近 7 天');
    await closePopover();
    await check(
      '导入时间预设生效',
      'document.querySelector(".library-chip")?.textContent.includes("最近 7 天")',
      undefined,
      'once',
    );
    await click('筛选', scope);
    await h.select('导入时间', '自定义范围');
    await input('input[aria-label="开始日期"]', '1990-01-01');
    await input('input[aria-label="结束日期"]', '1990-01-02');
    await closePopover();
    await wait('!!document.querySelector(".library-empty")');
    await check(
      '自定义时间范围生效',
      '!!document.querySelector(".library-empty")',
      undefined,
      'once',
    );
    await click('清除', scope);
    await click('筛选', scope);
    await input('input[aria-label="包含 Tag"]', '1girl');
    await key('Enter');
    await checkLibraryButtonGaps(h, '筛选');
    if (!reduced) await screen('filter');
    await click('存为智能收藏集');
    await input('input[aria-label="智能收藏集名称"]', `012智能${reduced}`);
    await capture(h, '.library-collection-collapse,.library-side .nps-menu-trigger', async () => {
      await click('存为智能收藏集', dialog);
      await wait(`!!document.querySelector('.library-side [aria-label="012智能${reduced}"]')`);
    });
    await check(
      '智能收藏集规则栏按高度展开；关闭动效直接到位',
      `(()=>{const off=document.documentElement.dataset.motion==='off'||document.documentElement.dataset.motion!=='full'&&matchMedia('(prefers-reduced-motion: reduce)').matches;return off?window.transitionSamples.length===0:window.transitionSamples.some(a=>a.effect.target.matches('.library-collection-collapse')&&a.effect.getKeyframes().some(f=>'height'in f))})()`,
      undefined,
      'once',
    );
    await finish(h);
    await focusRingChecks(h, '智能收藏集规则栏');
    const smart = database.listCollections().find((c) => c.name === `012智能${reduced}`);
    await check(
      '将当前条件存为智能收藏集',
      () => !!smart && smart.filters.includeTags.includes('1girl'),
      undefined,
      'once',
    );
    await check(
      '智能收藏集显示规则和全部管理入口',
      'document.querySelector(".library-collection-row").textContent.includes("包含 1girl") && document.querySelectorAll(".library-collection-row button").length===3',
      undefined,
      'both',
    );
    await checkCollectionContext(h, smart.id);
    if (!reduced) await screen('smart');
    await click('编辑规则', scope);
    await input('input[aria-label="排除 Tag"]', 'solo');
    await key('Enter');
    await click('保存规则');
    await wait('!document.querySelector(".nps-popover:popover-open")');
    await check(
      '智能收藏集规则使用同一筛选浮层更新',
      () =>
        database
          .listCollections()
          .find((c) => c.id === smart.id)
          .filters.excludeTags.includes('solo'),
      undefined,
      'once',
    );
    await click('重命名', 'document.querySelector(".library-collection-row")');
    await input('input[aria-label="收藏集名称"]', `012改名${reduced}`);
    await capture(h, '.library-collection-title,.nps-transition-snapshot', async () => {
      await click('重命名', dialog);
      await wait(`!!document.querySelector('.library-side [aria-label="012改名${reduced}"]')`);
    });
    await check(
      '收藏集改名原位替换内容；关闭动效直接到位',
      `(()=>{const off=document.documentElement.dataset.motion==='off'||document.documentElement.dataset.motion!=='full'&&matchMedia('(prefers-reduced-motion: reduce)').matches;return off?window.transitionSamples.length===0:window.transitionSamples.some(a=>a.effect.target.matches('.library-collection-title')&&a.effect.getKeyframes().every(f=>'opacity'in f&&!('transform'in f)))})()`,
      undefined,
      'once',
    );
    await finish(h);
    await check(
      '智能收藏集重命名持久化',
      () => database.listCollections().some((c) => c.name === `012改名${reduced}`),
      undefined,
      'once',
    );
    await click('删除收藏集', 'document.querySelector(".library-collection-row")');
    await check(
      '删除收藏集先确认且聚焦取消',
      'document.activeElement.textContent.trim()==="取消"',
      undefined,
      'once',
    );
    await click('删除收藏集', dialog);
    await wait('!document.querySelector("dialog[open]")');
    await h.until(
      () => !database.listCollections().some((collection) => collection.id === smart.id),
      '智能收藏集删除已写入数据库',
    );
    await check(
      '删除收藏集不删除图片',
      () =>
        !database.listCollections().some((c) => c.id === smart.id) &&
        database.loadLibrary('all').length === expectedAll,
      undefined,
      'once',
    );

    await all();
    await selectCard(0);
    await waitDetail();
    const target = await e('document.querySelector(".library-detail").dataset.detailId');
    await click('加入收藏集', 'document.querySelector(".library-detail-actions")');
    const manual = database.listCollections().find((c) => c.kind === 'manual');
    await click(manual.name, 'document.querySelector(".nps-popover:popover-open")');
    await h.until(
      () =>
        database
          .listCollections()
          .find((c) => c.id === manual.id)
          .member_ids.includes(target),
      '加入收藏集',
    );
    await check(
      '详情浮层勾选加入收藏集',
      () =>
        database
          .listCollections()
          .find((c) => c.id === manual.id)
          .member_ids.includes(target),
      undefined,
      'once',
    );
    await click(manual.name, 'document.querySelector(".nps-popover:popover-open")');
    await h.until(
      () =>
        !database
          .listCollections()
          .find((c) => c.id === manual.id)
          .member_ids.includes(target),
      '移出收藏集',
    );
    await check(
      '详情浮层取消勾选移出收藏集',
      () =>
        !database
          .listCollections()
          .find((c) => c.id === manual.id)
          .member_ids.includes(target),
      undefined,
      'once',
    );
    await input('input[aria-label="新收藏集名称"]', `012普通${reduced}`);
    if (!reduced) await screen('collect');
    await click('新建并加入');
    await h.until(
      () =>
        database
          .listCollections()
          .some((c) => c.name === `012普通${reduced}` && c.member_ids.includes(target)),
      '新建并加入',
    );
    await check(
      '当场新建普通收藏集并加入图片',
      () =>
        database
          .listCollections()
          .some((c) => c.name === `012普通${reduced}` && c.member_ids.includes(target)),
      undefined,
      'once',
    );
    // Changing collection may unmount the original picker; Escape is safe in either case.
    await key('Escape');
    await all();
    await setGrouping('完全相同');
    await e(
      `(()=>{const c=[...document.querySelectorAll('.library-card')].find(c=>c.querySelector('.library-stack'));c.focus();c.click()})()`,
    );
    await wait('document.querySelectorAll(".library-detail .library-strip button").length>1');
    await e('document.querySelectorAll(".library-detail .library-strip button")[1].click()');
    await wait(
      'document.querySelector(".library-detail .library-strip button.is-current")?.getAttribute("aria-label")===document.querySelector(".library-caption b")?.textContent',
    );
    const cover = await e('document.querySelector(".library-detail").dataset.detailId');
    await click('设为封面', 'document.querySelector(".library-detail-actions")');
    await wait(
      '!!document.querySelector(".library-detail .library-strip button.is-cover.is-current")',
    );
    await check(
      '一摞图片逐张切换并设为封面',
      () => database.loadProject(cover).group_cover_id === cover,
      undefined,
      'once',
    );
    await e('document.querySelector(".library-detail-picture img").click()');
    await wait('!!document.querySelector(".library-viewer .library-strip")');
    const coverMetadata = database.loadProject(cover).metadata;
    await check(
      '一摞大图顶部显示实际尺寸及当前序号',
      `(()=>{const buttons=[...document.querySelectorAll('.library-viewer .library-strip button')];const index=buttons.findIndex(b=>b.classList.contains('is-current'));return buttons.length>1&&index>=0&&document.querySelector('.library-viewer-top .library-mono').textContent.trim()===${JSON.stringify(`${coverMetadata.width} × ${coverMetadata.height}`)}+' · '+(index+1)+' / '+buttons.length})()`,
      undefined,
      'both',
    );
    await key('Escape', {}, 'document.querySelector(".library-viewer")');
    if (!reduced) await screen('group');
    await refresh();
    await check(
      '重新加载后封面仍在',
      () => database.loadProject(cover).group_cover_id === cover,
      undefined,
      'once',
    );
    await setGrouping('不合并');
    if (!reduced) await libraryCopyChecks(env);
    h.category(`图片库·${reduced ? '关闭动效' : '正常动效'}`);
    await input('.gallery-search input', '');
    await wait('document.querySelectorAll(".library-card").length>2');
    await selectCard(0);
    await waitDetail();
    await key(' ', {}, grid);
    await wait('!!document.querySelector(".library-viewer")');
    const viewer = 'document.querySelector(".library-viewer")';
    await click('放大', viewer);
    await check(
      '大图放大有实际尺寸',
      'document.querySelector(".library-viewer-canvas img").style.width!==""',
      undefined,
      'both',
    );
    await click('缩小', viewer);
    await click('100%', viewer);
    await check(
      '100% 使用图片原始宽度',
      'document.querySelector(".library-viewer-canvas img").clientWidth===document.querySelector(".library-viewer-canvas img").naturalWidth',
      undefined,
      'both',
    );
    await click('向左旋转', viewer);
    await check(
      '向左旋转',
      'document.querySelector(".library-viewer-canvas img").style.transform.includes("-90deg")',
      undefined,
      'both',
    );
    await click('向右旋转', viewer);
    await click('左右翻转', viewer);
    await check(
      '向右旋转和左右翻转',
      'document.querySelector(".library-viewer-canvas img").style.transform.includes("0deg")&&document.querySelector(".library-viewer-canvas img").style.transform.includes("scaleX(-1)")',
      undefined,
      'both',
    );
    await click('复制图片', viewer);
    await h.until(() => !clipboard.readImage().isEmpty(), '复制大图');
    await check('复制图片得到像素', () => !clipboard.readImage().isEmpty(), undefined, 'once');
    const saved = path.join(mode.root, `saved-${reduced}.png`);
    doubles.saves.push({ canceled: false, filePath: saved });
    await click('另存为', viewer);
    await h.until(async () => !!(await fs.stat(saved).catch(() => null)), '另存为完成');
    await check(
      '另存为通过文件选择替身保存副本',
      async () => (await fs.stat(saved)).size > 0,
      undefined,
      'once',
    );
    const beforeName = await e('document.querySelector(".library-viewer-top b").textContent');
    await key('ArrowRight', {}, viewer);
    await check(
      '大图右键切换',
      'document.querySelector(".library-viewer-top b").textContent!==' + JSON.stringify(beforeName),
      undefined,
      'once',
    );
    await key('ArrowLeft', {}, viewer);
    await check(
      '大图左键切回',
      'document.querySelector(".library-viewer-top b").textContent===' + JSON.stringify(beforeName),
      undefined,
      'once',
    );
    await checkLibraryButtonGaps(h, '大图');
    await check(
      '大图摞内位置与小图条一致',
      "(()=>{const strip=document.querySelector('.library-viewer .library-strip');return !strip || document.querySelector('.library-viewer-top .library-mono').textContent.trim().endsWith(' · '+([...strip.children].findIndex(b=>b.classList.contains('is-current'))+1)+' / '+strip.children.length)})()",
      undefined,
      'both',
    );
    if (!reduced) await screen('viewer');
    await key('Escape', {}, viewer);
    await wait('!document.querySelector(".library-viewer")');
    await check(
      '关闭大图焦点回到原卡片',
      'document.activeElement.matches(".library-card.current")',
      undefined,
      'once',
    );
    await key('Enter', {}, grid);
    await wait(
      'document.querySelector(".studio-titlebar [aria-current=page]")?.textContent.trim()==="工作台"',
    );
    await check(
      'Enter 在工作台打开',
      'document.querySelectorAll(".workbench-tab").length>0',
      undefined,
      'once',
    );
    await click('图片库', 'document.querySelector(".studio-titlebar")');
    await e(
      'document.querySelector(".library-card").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))',
    );
    await wait(
      'document.querySelector(".studio-titlebar [aria-current=page]")?.textContent.trim()==="工作台"',
    );
    await check(
      '双击在工作台打开',
      'document.querySelectorAll(".workbench-tab").length>0',
      undefined,
      'once',
    );
    await click('图片库', 'document.querySelector(".studio-titlebar")');
    await selectCard(0);
    await waitDetail();
    const trashId = await e('document.querySelector(".library-detail").dataset.detailId');
    await click('移入回收站', 'document.querySelector(".library-detail-actions")');
    await h.until(() => !!database.loadProject(trashId).deleted_at, '移入回收站');
    await wait(
      '!![...document.querySelectorAll(".nps-toast button")].find(b=>b.textContent==="撤销")',
    );
    await check(
      '单图回收通知使用定稿文案',
      'document.querySelector(".nps-notifications").textContent.includes("已移入回收站")',
      undefined,
      'once',
    );
    await click('撤销', 'document.querySelector(".nps-notifications")');
    await h.until(() => !database.loadProject(trashId).deleted_at, '撤销移入回收站');
    await check(
      '移入回收站后通知可以撤销',
      () => !database.loadProject(trashId).deleted_at,
      undefined,
      'once',
    );
    await selectCard(0);
    await waitDetail();
    const trashAgain = await e('document.querySelector(".library-detail").dataset.detailId');
    await click('移入回收站', 'document.querySelector(".library-detail-actions")');
    await h.until(() => !!database.loadProject(trashAgain).deleted_at, '再次移入');
    await click('回收站', scope);
    await wait('document.querySelectorAll(".library-card").length>0');
    await check(
      '回收站不显示导入',
      '![...document.querySelectorAll(".library-tools button")].some(b=>b.textContent.trim()==="导入")',
      undefined,
      'once',
    );
    await input('.gallery-search input', database.loadProject(trashAgain).name);
    await wait('document.querySelectorAll(".library-card").length===1');
    await selectCard(0);
    await waitDetail();
    await checkLibraryButtonGaps(h, '回收站');
    await check(
      '恢复按钮有返回图标',
      '!!document.querySelector(".library-detail-actions .ri-arrow-go-back-line")',
      undefined,
      'both',
    );
    await check(
      '清空回收站位于说明行且使用安静危险小按钮',
      "!document.querySelector('.library-tools .nps-button-danger') && !!document.querySelector('.library-chips.library-help .nps-button-danger.nps-small')",
      undefined,
      'both',
    );
    if (!reduced) await screen('trash');
    await click('恢复', 'document.querySelector(".library-detail-actions")');
    await h.until(() => !database.loadProject(trashAgain).deleted_at, '恢复图片');
    await check(
      '回收站恢复图片',
      () => !database.loadProject(trashAgain).deleted_at,
      undefined,
      'once',
    );
    await all();
    await input('.gallery-search input', 'not-a-real-image-012');
    await wait('!!document.querySelector(".library-empty")');
    await click('清除搜索和筛选', scope);
    await wait('document.querySelectorAll(".library-card").length>0');
    await check(
      '无结果空状态能清除搜索筛选',
      'document.querySelector(".gallery-search input").value===""',
      undefined,
      'once',
    );
    await all();
    await extraLibraryChecks({
      h,
      database,
      doubles,
      reduced,
      selectCard,
      waitDetail,
      all,
      settled,
      click,
      input,
    });
  }
  for (const importReduced of mode.category === '减少动态效果' ? [true] : [false, true]) {
    h.category(`图片库·导入与永久删除·${importReduced ? '关闭动效' : '正常动效'}`);
    await e(
      `window.studio.saveAppearanceSettings({motion:${JSON.stringify(importReduced ? 'off' : 'full')}})`,
    );
    await refresh();
    const uniqueName = `library-import-unique-${importReduced}`;
    const unique = path.join(mode.root, `${uniqueName}.png`);
    await sharp(files[1])
      .extract({ left: 10 + Number(importReduced), top: 10, width: 510, height: 710 })
      .png()
      .toFile(unique);
    const before = database.loadLibrary('all').length;
    doubles.selections.push({ canceled: false, filePaths: [unique] });
    await click('导入', scope);
    await h.until(() => database.loadLibrary('all').length === before + 1, '导入图片');
    await check(
      '文件选择可导入图片',
      () => database.loadLibrary('all').length === before + 1,
      undefined,
      'once',
    );
    doubles.selections.push({ canceled: false, filePaths: [unique] });
    await click('导入', scope);
    await wait('document.body.innerText.includes("跳过重复 1 张")');
    await check(
      '重复图片被跳过',
      () => database.loadLibrary('all').length === before + 1,
      undefined,
      'once',
    );
    clipboard.writeImage(
      nativeImage.createFromPath(fresh[0]).resize({ width: 333 + Number(importReduced) }),
    );
    await key('v', mod, 'document.querySelector(".library-page")');
    await h.until(() => database.loadLibrary('all').length === before + 2, '从剪贴板导入');
    await check(
      'Mod+V 从剪贴板导入',
      () => database.loadLibrary('all').length === before + 2,
      undefined,
      'once',
    );
    const zip = path.join(mode.root, 'library-select.zip');
    const zipfile = new (require('yazl').ZipFile)();
    zipfile.addFile(files[0], 'duplicate.png');
    for (let i = 0; i < 3; i++) {
      const file = path.join(mode.root, `zip-${i}.png`);
      await sharp(files[1])
        .extract({ left: 20 + i + Number(importReduced) * 10, top: 30, width: 430, height: 530 })
        .png()
        .toFile(file);
      zipfile.addFile(file, `new-${i}.png`);
    }
    zipfile.end();
    await fs.writeFile(zip, Buffer.concat(await Array.fromAsync(zipfile.outputStream)));
    doubles.selections.push({ canceled: false, filePaths: [zip] });
    await click('导入', scope);
    await wait('document.querySelectorAll(".library-zip .library-card").length===4');
    await wait('document.querySelector(".library-zip")?.textContent.includes("其中 1 张")');
    await click('全选', dialog);
    await check(
      'ZIP 全选只选择可导入图片',
      'document.querySelectorAll(".library-zip .library-card.picked").length===3',
      undefined,
      'once',
    );
    await wait('document.querySelectorAll(".library-zip .library-card img")[1]?.naturalWidth>0');
    await e(
      'document.querySelectorAll(".library-zip .library-card")[1].dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))',
    );
    await wait('!!document.querySelector(".library-zip-preview")');
    await check(
      'ZIP 双击打开大图预览',
      'document.querySelectorAll("dialog[open]").length===2',
      undefined,
      'once',
    );
    await click('关闭', '[...document.querySelectorAll("dialog[open]")].at(-1)');
    await click('全不选', dialog);
    await e('document.querySelectorAll(".library-zip .library-card")[1].click()');
    await check(
      'ZIP 标记已有图片并支持挑选',
      'document.querySelectorAll(".library-zip .library-card.picked").length===1 && document.querySelectorAll(".library-zip .library-stack").length===1',
      undefined,
      'once',
    );
    await screen('zip');
    await click('导入 1 张', dialog);
    await h.until(() => database.loadLibrary('all').length === before + 3, 'ZIP 只导入所选');
    await check(
      'ZIP 只导入选中的图片',
      () => database.loadLibrary('all').length === before + 3,
      undefined,
      'once',
    );
    await libraryImportExtras({ h, database, doubles, mode, files, reduced: importReduced, click });
    await all();
    await input('.gallery-search input', uniqueName);
    await wait('document.querySelectorAll(".library-card").length===1');
    await selectCard(0);
    await waitDetail();
    const doomed = await e('document.querySelector(".library-detail").dataset.detailId');
    await click('移入回收站', 'document.querySelector(".library-detail-actions")');
    await h.until(() => !!database.loadProject(doomed).deleted_at, '待永久删除图片进入回收站');
    await click('回收站', scope);
    await input('.gallery-search input', uniqueName);
    await wait('document.querySelectorAll(".library-card").length===1');
    await selectCard(0);
    await waitDetail();
    await click('永久删除', 'document.querySelector(".library-detail-actions")');
    await check(
      '永久删除默认聚焦取消并说明原文件不受影响',
      'document.activeElement.textContent.trim()==="取消" && document.querySelector("dialog[open]").textContent.includes("原文件不受影响")',
      undefined,
      'once',
    );
    await screen('purge');
    await click('取消', dialog);
    await check('取消永久删除保留图片', () => !!database.loadProject(doomed), undefined, 'once');
    await selectCard(0, { ctrlKey: true });
    await click('永久删除', 'document.querySelector(".library-selection-bar")');
    await click('永久删除', dialog);
    await h.until(() => !database.loadProject(doomed), '永久删除完成');
    await check(
      '永久删除清理图库副本并保留原文件',
      async () => !database.loadProject(doomed) && !!(await fs.stat(unique)),
      undefined,
      'once',
    );
    await all();
    const activeIds = database.loadLibrary('all').map((p) => p.id);
    database.updateProjects(activeIds, { deleted: true });
    await refresh(true);
    await wait('!!document.querySelector(".library-empty")');
    await check(
      '空图库使用标准 SVG 空状态',
      `(()=>{const mark=document.querySelector('.nps-empty-mark');return document.querySelector('.library-empty').textContent.includes('图片库里还没有图片')&&!!mark?.querySelector('svg')&&getComputedStyle(mark.querySelector('[data-color=text]')).fill===getComputedStyle(mark).color&&getComputedStyle(mark.querySelector('[data-color=empty]')).stroke===getComputedStyle(mark).color})()`,
      undefined,
      'both',
    );
    await screen('empty');
    const emptyCollection = database
      .listCollections()
      .find((collection) => collection.kind === 'manual');
    await click(emptyCollection.name, 'document.querySelector(".library-side")');
    await check(
      '全库无图片时收藏集管理行仍可用',
      '!!document.querySelector(".library-collection-row") && document.querySelectorAll(".library-collection-row button").length===2',
      undefined,
      'once',
    );
    database.updateProjects(activeIds, { deleted: false });
    await refresh();
  }
  if (!['图片库·导入', '减少动态效果'].includes(mode.category))
    await libraryFinishChecks({ h, database, refresh, click, input, selectCard, waitDetail });
}
