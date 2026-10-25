import { selectGalleryGrouping } from './galleryView.js';
import { libraryNamingChecks } from './libraryNaming.js';
import { libraryGroupingChecks } from './libraryGrouping.js';
import { libraryViewerChecks } from './libraryViewer.js';
import { libraryTagFilterChecks } from './libraryTagFilter.js';
import { scrollChecks } from './scroll.js';
import { libraryCopyChecks } from './libraryCopy.js';
import { checkCollectionContext, collectionContext, libraryFinishChecks } from './libraryFinish.js';
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
  const trashDetailImage = async () => {
    const actions = 'document.querySelector(".detail .dacts")';
    const grouped = await e(`!!${actions}?.querySelector('[aria-label="把这一张移入回收站"]')`);
    await click(grouped ? '把这一张移入回收站' : '移入回收站', actions);
  };
  const input = async (...args) => {
    await h.input(...args);
    await settled();
  };
  const mod = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  const scope = 'document.querySelector(".libp")';
  const dialog = 'document.querySelector("[role=dialog]:not(.leaving *)")';
  const grid = 'document.querySelector(".lgrid")';
  const selectCard = async (index = 0, options = {}) => {
    await settled();
    await wait(
      `document.querySelector('.card:not(.leaving)[data-index="${index}"]')?.checkVisibility()`,
      '目标卡片已完成渲染并可见',
    );
    // Read identity and dispatch in one renderer turn: undo can replace/reorder cards.
    const group = await e(
      `(()=>{const node=document.querySelector('.card:not(.leaving)[data-index="${index}"]');const id=node.dataset.groupId;node.focus();node.dispatchEvent(new MouseEvent('click',${JSON.stringify({ bubbles: true, ...options })}));return id;})()`,
    );
    await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    if (
      !options.shiftKey &&
      !options.ctrlKey &&
      !options.metaKey &&
      group.startsWith('project:') &&
      !(await e('!!document.querySelector(".card.picked")'))
    )
      await wait(
        `document.querySelector('.detail')?.dataset.detailId===${JSON.stringify(group.slice(8))}`,
      );
    else
      await wait(
        'document.querySelector(".col.detail[data-detail-id]") || document.querySelector(".detail .sum")',
      );
  };
  const closePopover = async () => {
    await key('Escape', {}, 'document.activeElement');
    await wait('!document.querySelector(".popover:not(.leaving)")');
  };
  const all = async () => {
    await click('全部图片', scope);
    await input('.gallery-search input', '');
    if (await e('!!document.querySelector(".lchips.open .btn")'))
      await click('清除', 'document.querySelector(".lchips")');
    await wait('document.querySelectorAll(".card").length>0');
  };
  const refresh = async (empty = false) => {
    await h.reload();
    await wait('!!document.querySelector(".tb")');
    await click('图片库', 'document.querySelector(".tb")');
    if (empty) await click('全部图片', scope);
    else await all();
  };
  const setGrouping = async (label) => {
    await click('视图', scope);
    await selectGalleryGrouping(h, label);
    await closePopover();
    await wait('document.querySelectorAll(".card").length>0');
    if (label === '不合并')
      await wait(
        `(()=>{const grids=[...document.querySelectorAll('.lib-grid-col .lgrid')];const cards=[...document.querySelectorAll('.lib-grid-col .lgrid .card')];return grids.length===1 && !grids[0].classList.contains('leaving') && cards.length>0 && cards.every(c=>c.dataset.groupId?.startsWith('project:'))})()`,
        '不分组后的独立图片列表已替换旧分组',
      );
  };
  const screen = async (name) => {
    await h.screenshot(`library-${name}-${mode.theme}`);
  };
  const waitDetail = async () =>
    wait(
      `(()=>{const d=document.querySelector('.detail')?.dataset.detailId,g=document.querySelector('.card.on')?.dataset.groupId;return !!d&&!!g&&(g.startsWith('group:')||g==='project:'+d)})()`,
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
      `window.studio.invoke('settings.appearance.save',{settings:{motion:${JSON.stringify(reduced ? 'off' : 'full')}}}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data})`,
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
    await e("document.querySelector('.lib-grid-col > .scroll').style.maxHeight='200px'");
    await settled();
    // Group changes retain the outgoing grid briefly. Wait for the final grid before
    // dragging: removing the outgoing content can otherwise reset the scroll offset.
    await wait(
      'document.querySelectorAll(".lib-grid-col .lgrid").length===1 && !document.querySelector(".lib-grid-col .lgrid.leaving,.lib-grid-col .lgrid.jump")',
      '分组切换及视口调整完成后再拖动滚动条',
    );
    await scrollChecks(h, '.lib-grid-col > .scroll');
    await e(
      "document.querySelector('.lib-grid-col > .scroll').scrollTop=document.querySelector('.lib-grid-col > .scroll').scrollHeight",
    );
    await settled();
    // Works may combine several database images into one card, even without grouping.
    const lastIndex = await e(
      `Math.max(...[...document.querySelectorAll('.lgrid:not(.leaving) .card[data-group-id^="project:"]')].map(node=>Number(node.dataset.index)))`,
    );
    await check(
      '滚动到底后存在可检查相邻顺序的图片卡片',
      () => Number.isInteger(lastIndex) && lastIndex > 0,
      () =>
        e(
          `(()=>{const s=document.querySelector('.lib-grid-col > .scroll');return {top:s.scrollTop,height:s.scrollHeight,viewport:s.clientHeight,cards:[...document.querySelectorAll('.lgrid .card')].map(c=>({kind:c.dataset.groupId?.split(':')[0],index:c.dataset.index,visible:c.checkVisibility()}))}})()`,
        ),
    );
    await selectCard(lastIndex);
    await check(
      '虚拟滚动复用卡片后点击仍选中当前图片并显示对应详情',
      `(()=>{const c=document.querySelector('.lgrid:not(.leaving) .card.on');return c?.dataset.index==='${lastIndex}' && c.getAttribute('aria-selected')==='true' && document.querySelector('.detail')?.dataset.detailId===c.dataset.groupId.slice(8)})()`,
    );
    await key('ArrowLeft', {}, 'document.querySelector(".lgrid:not(.leaving) .card.on")');
    await h.checkSoon(
      '复用卡片后方向键仍按图片顺序选择',
      `document.querySelector('.lgrid:not(.leaving) .card.on')?.dataset.index==='${lastIndex - 1}'`,
    );
    await e("document.querySelector('.lib-grid-col > .scroll').style.maxHeight=''");
    await e("document.querySelector('.lib-grid-col > .scroll').scrollTop=0");
    await settled();
    if (mode.category === '图片库·滚动条') return;
    await selectCard();
    await waitDetail();

    const expectedAll = database.loadLibrary('all').length,
      expectedTrash = database.loadLibrary('trash').length;
    await check(
      '侧栏全部图片与回收站数量来自真实数据库',
      `Number(document.querySelector('.libp .side [data-key="sv-"] .n').textContent)===${expectedAll} && Number(document.querySelector('.libp .side [data-key="sv-trash"] .n').textContent)===${expectedTrash}`,
      undefined,
      'once',
    );

    if (!reduced) await screen('mixed');
    await selectCard(1);
    await waitDetail();
    const current = await e('document.querySelector(".card.on").dataset.groupId');
    await key('ArrowRight', {}, grid);
    await wait(`document.querySelector('.card.on')?.dataset.groupId!==${JSON.stringify(current)}`);
    await check(
      '左右键按顺序移动当前卡片',
      'document.querySelector(".card.on").dataset.index==="2"',
      undefined,
      'once',
    );
    await key('ArrowLeft', {}, grid);
    await check(
      '关于页列出的左键返回上一张卡片',
      'document.querySelector(".card.on").dataset.index==="1"',
      undefined,
      'once',
    );
    await key('ArrowRight', {}, grid);
    await key('ArrowDown', {}, grid);
    await check(
      '下键移动到相邻行水平位置最近的一张',
      `(()=>{const c=document.querySelector('.card.on');const previous=document.querySelector('[data-index="2"]');const x=previous.getBoundingClientRect().x+previous.clientWidth/2;const items=[...document.querySelectorAll(".card")].filter(n=>Math.abs(n.getBoundingClientRect().y-c.getBoundingClientRect().y)<2);const nearest=items.reduce((a,b)=>Math.abs(a.getBoundingClientRect().x+a.clientWidth/2-x)<=Math.abs(b.getBoundingClientRect().x+b.clientWidth/2-x)?a:b);return c===nearest && c.getBoundingClientRect().y>previous.getBoundingClientRect().y})()`,
      undefined,
      'once',
    );
    await key('ArrowUp', {}, grid);
    await check(
      '上键返回上方最近的一张',
      'Number(document.querySelector(".card.on").dataset.index)<5',
      undefined,
      'once',
    );
    await selectCard(0);
    await selectCard(1, mod);
    await check(
      '平台修饰键单击进入多选',
      'document.querySelectorAll(".card.picked").length===2 && !!document.querySelector(".ldock .selbar:not(.leaving)")',
      undefined,
      'once',
    );
    await e('document.querySelectorAll(".lpick")[2].click()');
    await check(
      '复选框追加第三张且不清空已有多选',
      'document.querySelectorAll(".card.picked").length===3',
      undefined,
      'once',
    );
    await selectCard(0);
    await check(
      '多选时点击图片仅移除这一张',
      'document.querySelectorAll(".card.picked").length===2',
      undefined,
      'once',
    );
    await e(`${grid}.click()`);
    await check(
      '点击网格空白处退出多选',
      '!document.querySelector(".card.picked")',
      undefined,
      'once',
    );
    await key('Escape', {}, grid);
    await e('document.querySelector(".lpick").click()');
    await check(
      '无多选时复选框进入多选且有名称和勾选语义',
      'document.querySelectorAll(".card.picked").length===1 && document.querySelector(".lpick[role=checkbox][aria-checked=true]").getAttribute("aria-label").length>0',
      undefined,
      'once',
    );
    await e(
      `(()=>{const card=document.querySelector('.card.picked');for(const [type,detail] of [['click',1],['click',2],['dblclick',2]])card.dispatchEvent(new MouseEvent(type,{bubbles:true,detail}))})()`,
    );
    await check(
      '多选最后一张双击不会打开工作台',
      '!!document.querySelector(".libp") && !document.querySelector(".card.picked")',
      undefined,
      'once',
    );
    await e('document.querySelector(".lpick").focus()');
    await key(' ', {}, 'document.querySelector(".lpick")');
    await check(
      '空格切换复选框且不打开大图',
      'document.querySelectorAll(".card.picked").length===1 && !document.querySelector(".viewer-ov")',
      undefined,
      'once',
    );
    await key('Enter', {}, 'document.querySelector(".lpick")');
    await check(
      '回车切换复选框且不打开工作台',
      '!document.querySelector(".card.picked") && !!document.querySelector(".libp")',
      undefined,
      'once',
    );
    if (await e('!!document.querySelector(".viewer-ov")')) {
      await key('Escape', {}, 'document.querySelector(".viewer-ov")');
      await wait('!document.querySelector(".viewer-ov")');
    }
    await click('图片库', 'document.querySelector(".tb")');
    await key('Escape', {}, grid);
    await selectCard(0);
    await selectCard(1, { shiftKey: true });
    await wait('document.querySelectorAll(".fan img").length===2');
    await e(
      'Promise.all([...document.querySelectorAll(".fan img")].map(n=>n.decode())).then(()=>true)',
    );

    await h.screenshot('029-library-two-covers');
    await selectCard(2, { shiftKey: true });
    await check(
      'Shift 单击连续选中三张',
      'document.querySelectorAll(".card.picked").length===3',
      undefined,
      'once',
    );

    if (!reduced) await screen('select');
    await click('取消', 'document.querySelector(".ldock .selbar:not(.leaving)")');
    await check(
      '多选取消退出操作条',
      '!document.querySelector(".ldock .selbar:not(.leaving)")',
      undefined,
      'once',
    );
    await e(
      `(()=>{const node=${grid};const r=node.getBoundingClientRect();for(const [type,x,y] of [['pointerdown',r.left+5,r.top+5],['pointermove',r.left+240,r.top+160],['pointerup',r.left+240,r.top+160]])node.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:2,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y}));})()`,
    );
    await check(
      '拖动框选选择实际相交的卡片',
      'document.querySelectorAll(".card.picked").length>0',
      undefined,
      'once',
    );
    await key('Escape', {}, grid);
    await key('a', mod, grid);
    await check(
      'Mod+A 选择全部组，Esc 退出',
      `document.querySelector('.ldock .selbar:not(.leaving)')?.textContent.includes('${expectedAll} 张')`,
      undefined,
      'once',
    );
    await key('Escape', {}, grid);
    await check(
      'Esc 清空多选',
      '!document.querySelector(".ldock .selbar:not(.leaving)")',
      undefined,
      'once',
    );

    await input('.gallery-search input', 'waiting');
    await wait(
      'document.querySelectorAll(".card").length>0 || !!document.querySelector(".libp .empty")',
    );
    const paragraphMatches = database
      .loadLibrary('all')
      .filter((p) =>
        getPromptScopes(p).some((s) => s.raw_prompt.toLowerCase().includes('waiting')),
      );
    await check(
      '搜索能命中段落中的词',
      `document.querySelectorAll('.card').length===${paragraphMatches.length} && ${paragraphMatches.length}>0`,
      undefined,
      'once',
    );
    await input('.gallery-search input', '');
    await wait('document.querySelectorAll(".card").length>2');
    await click('筛选', scope);
    await input('input[aria-label="包含的 Tag"]', '1girl');
    await key('Enter');
    await closePopover();
    await wait('document.querySelector(".cnt")?.textContent==="1"');
    await check(
      '包含的 Tag 生效并显示条件数',
      'document.querySelectorAll(".card").length>0 && document.querySelector(".chip").textContent.includes("1girl")',
      undefined,
      'once',
    );
    await click('筛选', scope);
    await input('input[aria-label="排除的 Tag"]', '1girl');
    await key('Enter');
    await closePopover();
    await wait('!!document.querySelector(".libp .empty")');
    await check(
      '组合包含与排除生效',
      'document.querySelector(".libp .empty").textContent.includes("没有符合的图片")',
      undefined,
      'once',
    );
    if (!reduced) await screen('nomatch');
    await e(
      `[...document.querySelectorAll('.lchips .chip')].find(c=>c.textContent.includes('排除')&&c.textContent.includes('1girl')).querySelector('button').click()`,
    );
    await wait('document.querySelectorAll(".card").length>0');
    await click('清除', scope);
    await check(
      '逐条移除和一次清除筛选',
      '!document.querySelector(".cnt") && !document.querySelector(".lchips.open .chip")',
      undefined,
      'once',
    );
    await click('筛选', scope);
    for (const index of [0, 1]) {
      await e(
        `document.querySelectorAll('.lchecks')[${index}].querySelector('[role=checkbox]').click()`,
      );
      await closePopover();
      await wait(
        'document.querySelectorAll(".card").length>0 || !!document.querySelector(".libp .empty")',
      );
      await check(
        `${index === 0 ? '模型' : 'Vibe'} 条件单独生效`,
        'document.querySelectorAll(".chip").length===1',
        undefined,
        'once',
      );
      await click('清除', scope);
      await click('筛选', scope);
    }
    await e('document.querySelector("[data-trigger=lcal]").click()');
    await click('最近 7 天', 'document.querySelector(".lcal-quick")');
    await closePopover();
    await check(
      '导入时间预设生效',
      'document.querySelector(".chip")?.textContent.includes("最近 7 天")',
      undefined,
      'once',
    );
    await click('筛选', scope);
    await e('document.querySelector("[data-trigger=lcal]").click()');
    await input('input[aria-label="开始日期"]', '1990-01-01');
    await key('Enter', {}, 'document.activeElement');
    await input('input[aria-label="结束日期"]', '1990-01-02');
    await key('Enter', {}, 'document.activeElement');
    await key('Escape', {}, 'document.activeElement');
    await closePopover();
    await wait('!!document.querySelector(".libp .empty")');
    await check(
      '自定义时间范围生效',
      '!!document.querySelector(".libp .empty")',
      undefined,
      'once',
    );
    await click('清除', scope);
    await click('筛选', scope);
    await input('input[aria-label="包含的 Tag"]', '1girl');
    await key('Enter');

    if (!reduced) await screen('filter');
    await click('存为智能收藏集');
    await wait('!!document.querySelector(".libp .side input")');
    await check(
      '智能收藏集立即创建并以条件值命名，侧栏自动编辑',
      'document.querySelector(".libp .side input").value==="1girl"&&!document.querySelector("[role=dialog]:not(.leaving *)")',
      undefined,
      'once',
    );
    await input('input[aria-label="收藏集名称"]', `012智能${reduced}`);
    await key('Enter', {}, 'document.activeElement');
    await wait(
      `[...document.querySelectorAll('.libp .side .nm')].some(n=>n.textContent==='012智能${reduced}')`,
    );

    const smart = database.listCollections().find((c) => c.name === `012智能${reduced}`);
    await check(
      '将当前条件存为智能收藏集',
      () => !!smart && smart.filters.includeTags.includes('1girl'),
      undefined,
      'once',
    );
    await check(
      '智能收藏集显示只读规则和编辑入口',
      'document.querySelector(".lchips").textContent.includes("1girl") && !![...document.querySelectorAll(".lchips button")].find(button=>button.textContent.trim()==="编辑规则") && !document.querySelector(".lchips [aria-label^=移除]")',
      undefined,
      'both',
    );
    await checkCollectionContext(h, smart.id);
    if (!reduced) await screen('smart');
    await click('编辑规则', scope);
    await input('input[aria-label="排除的 Tag"]', 'solo');
    await key('Enter');
    await click('保存规则');
    await wait('!document.querySelector(".popover:not(.leaving)")');
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
    await collectionContext(h, smart.id, '重命名');
    await input('input[aria-label="收藏集名称"]', `012改名${reduced}`);
    await key('Enter', {}, 'document.activeElement');
    await wait(
      `[...document.querySelectorAll('.libp .side .nm')].some(n=>n.textContent==='012改名${reduced}')`,
    );
    await check(
      '智能收藏集重命名持久化',
      () => database.listCollections().some((c) => c.name === `012改名${reduced}`),
      undefined,
      'once',
    );
    await collectionContext(h, smart.id, '删除');
    await check(
      '删除收藏集先确认且聚焦取消',
      'document.activeElement.textContent.trim()==="取消"',
      undefined,
      'once',
    );
    await click('删除', dialog);
    await wait('!document.querySelector("[role=dialog]:not(.leaving *)")');
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
    const target = await e('document.querySelector(".col.detail").dataset.detailId');
    await click('加入收藏集', 'document.querySelector(".detail .dacts")');
    const manual = database.listCollections().find((c) => c.kind === 'manual');
    const collectionRow = `[...document.querySelectorAll('.lcollect:not(.leaving) [role=checkbox]')].find(n=>n.querySelector('.nm')?.textContent===${JSON.stringify(manual.name)})`;
    await click(manual.name, 'document.querySelector(".popover:not(.leaving)")');
    await h.until(
      () =>
        database
          .listCollections()
          .find((c) => c.id === manual.id)
          .member_ids.includes(target),
      '加入收藏集',
    );
    // The database write finishes before React receives the updated collection.
    // Wait for the checked state before invoking the inverse operation.
    await wait(`${collectionRow}?.getAttribute('aria-checked')==='true'`, '收藏集勾选已呈现在界面');
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
    await click(manual.name, 'document.querySelector(".popover:not(.leaving)")');
    await h.until(
      () =>
        !database
          .listCollections()
          .find((c) => c.id === manual.id)
          .member_ids.includes(target),
      '移出收藏集',
    );
    await wait(
      `${collectionRow}?.getAttribute('aria-checked')==='false'`,
      '移出收藏集已呈现在界面',
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
    await wait('!!document.querySelector(".card .stack")');
    await e(
      `(()=>{const c=[...document.querySelectorAll('.card')].find(c=>c.querySelector('.stack'));c.focus();c.click()})()`,
    );
    await wait('document.querySelectorAll(".col.detail .lstrip img").length>1');
    await e('document.querySelectorAll(".col.detail .lstrip img")[1].click()');
    await wait(
      'document.querySelectorAll(".col.detail .lstrip img")[1]?.classList.contains("is-cur")',
    );
    const cover = await e('document.querySelector(".col.detail").dataset.detailId');
    await e('document.querySelector(".detail .pic img").click()');
    await wait('!!document.querySelector(".viewer-ov")');
    await check(
      '详情图片打开当前成员的大图',
      `document.querySelector('.viewer-ov .vframe:not(.leaving) img')?.getAttribute('src')==='novelai-media://file?path='+encodeURIComponent(${JSON.stringify(database.loadProject(cover).image_path)})`,
      undefined,
      'once',
    );
    await key('Escape', {}, 'document.querySelector(".viewer-ov")');
    if (!reduced) await screen('group');
    await refresh();

    await setGrouping('不合并');
    if (!reduced) await libraryCopyChecks(env);
    h.category(`图片库·${reduced ? '关闭动效' : '正常动效'}`);
    await input('.gallery-search input', '');
    await wait('document.querySelectorAll(".card").length>2');
    await selectCard(0);
    await waitDetail();
    await key(' ', {}, grid);
    await wait('!!document.querySelector(".viewer-ov")');
    const viewer = 'document.querySelector(".viewer-ov")';
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
    const beforeName = await e('document.querySelector(".viewer-bar > .mono").textContent');
    await key('ArrowRight', {}, viewer);
    await check(
      '大图右键切换',
      'document.querySelector(".viewer-bar > .mono").textContent!==' + JSON.stringify(beforeName),
      undefined,
      'once',
    );
    await key('ArrowLeft', {}, viewer);
    await check(
      '大图左键切回',
      'document.querySelector(".viewer-bar > .mono").textContent===' + JSON.stringify(beforeName),
      undefined,
      'once',
    );

    if (!reduced) await screen('viewer');
    await key('Escape', {}, viewer);
    await wait('!document.querySelector(".viewer-ov")');
    await check(
      '关闭大图焦点回到原卡片',
      'document.activeElement.matches(".card.on")',
      undefined,
      'once',
    );
    await key('Enter', {}, grid);
    await wait('document.querySelector(".tb [aria-current=page]")?.textContent.trim()==="工作台"');
    await check(
      'Enter 在工作台打开',
      'document.querySelectorAll(".tabs [data-tab]").length>0',
      undefined,
      'once',
    );
    await click('图片库', 'document.querySelector(".tb")');
    const doubleClickCard = '.lgrid:not(.leaving) [data-group-id]:not(.leaving)';
    await wait(
      `document.querySelector('.tb [aria-current=page]')?.textContent.trim()==='图片库' && !document.querySelector('.app-page-surface.leaving') && document.querySelector(${JSON.stringify(doubleClickCard)})?.checkVisibility()`,
      '图片库换页完成且目标卡片可见后再双击',
    );
    await e(
      `document.querySelector(${JSON.stringify(doubleClickCard)}).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );
    await wait('!!document.querySelector(".viewer-ov")');
    await check('双击卡片打开大图', '!!document.querySelector(".viewer-ov")');
    await key('Escape');
    await wait('!document.querySelector(".viewer-ov")');
    await selectCard(0);
    await waitDetail();
    const trashId = await e('document.querySelector(".col.detail").dataset.detailId');
    await trashDetailImage();
    await h.until(() => !!database.loadProject(trashId).deleted_at, '移入回收站');
    await wait('!![...document.querySelectorAll(".toast button")].find(b=>b.textContent==="撤销")');
    await check(
      '单图回收通知使用定稿文案',
      'document.querySelector(".toast:not(.leaving)").textContent.includes("已移入回收站")',
      undefined,
      'once',
    );
    await click('撤销', 'document.querySelector(".toast:not(.leaving)")');
    await h.until(() => !database.loadProject(trashId).deleted_at, '撤销移入回收站');
    // Restore commits before the renderer clears selection and reloads the library.
    // Its completion notification is emitted after that reload; select only then.
    await wait(
      '[...document.querySelectorAll(".toast:not(.leaving)")].some(n=>n.textContent.includes("已恢复"))',
      '撤销恢复已完成界面刷新',
    );
    await check(
      '移入回收站后通知可以撤销',
      () => !database.loadProject(trashId).deleted_at,
      undefined,
      'once',
    );
    await selectCard(0);
    await waitDetail();
    const trashAgain = await e('document.querySelector(".col.detail").dataset.detailId');
    await trashDetailImage();
    await h.until(() => !!database.loadProject(trashAgain).deleted_at, '再次移入');
    // The database write precedes the gallery reload and selection reset.
    // Wait for the action's completion notice before selecting in the trash view.
    await wait(
      '[...document.querySelectorAll(".toast:not(.leaving)")].some(n=>n.textContent.startsWith("已移入回收站"))',
      '再次移入回收站已完成列表刷新和选择清理',
    );
    await click('回收站', scope);
    await wait('document.querySelectorAll(".card").length>0');
    await check(
      '回收站不显示导入',
      '![...document.querySelectorAll(".ltools button")].some(b=>b.textContent.trim()==="导入")',
      undefined,
      'once',
    );
    await input('.gallery-search input', database.loadProject(trashAgain).name);
    await wait('document.querySelectorAll(".card").length===1');
    await selectCard(0);
    await waitDetail();

    if (!reduced) await screen('trash');
    await click('恢复', 'document.querySelector(".detail .dacts")');
    await h.until(() => !database.loadProject(trashAgain).deleted_at, '恢复图片');
    await check(
      '回收站恢复图片',
      () => !database.loadProject(trashAgain).deleted_at,
      undefined,
      'once',
    );
    await all();
    await input('.gallery-search input', 'not-a-real-image-012');
    await wait('!!document.querySelector(".libp .empty")');
    await click('清除搜索', scope);
    await wait('document.querySelectorAll(".card").length>0');
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
      `window.studio.invoke('settings.appearance.save',{settings:{motion:${JSON.stringify(importReduced ? 'off' : 'full')}}}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data})`,
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
    await wait(
      'document.querySelector(".toast:not(.leaving)")?.textContent.includes("已导入 0 张")',
    );
    await check(
      '重复图片被跳过',
      () => database.loadLibrary('all').length === before + 1,
      undefined,
      'once',
    );
    clipboard.writeImage(
      nativeImage.createFromPath(fresh[0]).resize({ width: 333 + Number(importReduced) }),
    );
    await key('v', mod, 'document.querySelector(".libp")');
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
    await wait('document.querySelectorAll(".zipdlg .ztile").length===4');
    await wait('document.querySelector(".zipdlg")?.textContent.includes("其中 1 张")');
    await check(
      'ZIP 默认选中全部可导入图片',
      'document.querySelectorAll(".zipdlg .ztile.on").length===3',
    );
    await click('全不选', dialog);
    await click('全选', dialog);
    await check(
      'ZIP 全选只选择可导入图片',
      'document.querySelectorAll(".zipdlg .ztile.on").length===3',
      undefined,
      'once',
    );
    await wait('document.querySelectorAll(".zipdlg .ztile img")[1]?.naturalWidth>0');
    await e(
      'document.querySelectorAll(".zipdlg .ztile")[1].dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))',
    );
    await wait('!!document.querySelector(".viewer-ov")');
    await check(
      'ZIP 双击打开大图预览',
      '!!document.querySelector(".zipdlg") && !!document.querySelector(".viewer-ov")',
      undefined,
      'once',
    );
    await click('关闭', 'document.querySelector(".viewer-ov")');
    await click('全不选', dialog);
    await e(
      `(()=>{const cards=document.querySelectorAll('.zipdlg .ztile');cards[1].click();cards[3].dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))})()`,
    );
    await check(
      'ZIP Shift 连选跳过重复项',
      'document.querySelectorAll(".zipdlg .ztile.on").length===3 && !document.querySelector(".zipdlg .ztile.dup.on")',
    );
    for (const modifier of ['ctrlKey', 'shiftKey']) {
      await click('全不选', dialog);
      await e(`document.querySelectorAll('.zipdlg .ztile')[3].click()`);
      await e(
        `(()=>{const grid=document.querySelector('.zipgrid'),r=grid.querySelectorAll('.ztile')[1].getBoundingClientRect();for(const [type,x,y] of [['pointerdown',r.left+2,r.top+2],['pointermove',r.right-2,r.bottom-2],['pointerup',r.right-2,r.bottom-2]])grid.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y,${modifier}:true}))})()`,
      );
      await check(
        `ZIP ${modifier} 框选保留已有选择`,
        'document.querySelectorAll(".zipdlg .ztile.on").length===2 && !document.querySelector(".zipdlg .ztile.dup.on")',
      );
    }
    await click('全不选', dialog);
    await e('document.querySelectorAll(".zipdlg .ztile")[1].click()');
    await check(
      'ZIP 标记已有图片并支持挑选',
      'document.querySelectorAll(".zipdlg .ztile.on").length===1 && document.querySelectorAll(".zipdlg .zdup").length===1',
      undefined,
      'once',
    );
    await screen('zip');
    await click('导入 1 张', 'document.querySelector(".zipdlg")');
    await h.until(() => database.loadLibrary('all').length === before + 3, 'ZIP 只导入所选');
    await check(
      'ZIP 只导入选中的图片',
      () => database.loadLibrary('all').length === before + 3,
      undefined,
      'once',
    );
    const commandNames = ['import.prepare', 'import.previews', 'import.cancel'];
    const originalHandlers = commandNames.map((name) => env.commandHandlers[name]);
    try {
      const sample = database.loadProject(database.loadLibrary('all')[0].id);
      env.commandHandlers['import.prepare'] = () => ({
        ok: true,
        sessionId: 'large-zip-acceptance',
        requiresSelection: true,
        archives: [{ id: 'large', name: 'synthetic-large.zip', count: 60 }],
        entries: Array.from({ length: 60 }, (_, i) => ({
          id: `large-${i}`,
          archiveId: 'large',
          fileName: `synthetic-${i}.png`,
          previewPath: sample.image_path,
          previewWidth: sample.metadata.width,
          previewHeight: sample.metadata.height,
        })),
      });
      env.commandHandlers['import.previews'] = () => ({ ok: true });
      env.commandHandlers['import.cancel'] = () => ({ ok: true });
      await click('导入', scope);
      await wait('document.querySelectorAll(".zipdlg [data-zid]").length===60');
      await wait('!!document.querySelector(".sb")');
      await e(
        `document.querySelector('.zipgrid').dispatchEvent(new PointerEvent('pointermove',{bubbles:true}));document.querySelector('.sb').dispatchEvent(new PointerEvent('pointerenter'))`,
      );
      const canDrag = await e(
        `(()=>{const t=document.querySelector('.sb'),r=t.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===t})()`,
      );
      if (canDrag) {
        const point = await e(
          `(()=>{const n=document.querySelector('.zipgrid'),t=document.querySelector('.sb'),r=t.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,end:n.getBoundingClientRect().bottom-1}})()`,
        );
        for (const [type, y] of [
          ['mousePressed', point.y],
          ['mouseMoved', point.end],
          ['mouseReleased', point.end],
        ]) {
          await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
            type,
            x: point.x,
            y,
            button: type === 'mouseMoved' ? 'none' : 'left',
            buttons: type === 'mouseReleased' ? 0 : 1,
            clickCount: type === 'mouseMoved' ? 0 : 1,
          });
          if (type === 'mousePressed')
            await wait('document.querySelector(".sb")?.classList.contains("drag")');
        }
      } else
        await e(
          "document.querySelector('.zipgrid').scrollTop=document.querySelector('.zipgrid').scrollHeight",
        );
      await wait(
        `(()=>{const n=document.querySelector('.zipgrid');return n.scrollTop>=n.scrollHeight-n.clientHeight-1})()`,
      );
      await e(`document.querySelector('[data-zid="large-59"]').click()`);
      await check(
        '大 ZIP 可拖动滚动条到底并修改最后一张的选择',
        `${canDrag}&&document.querySelector('[data-zid="large-59"]').getAttribute('aria-pressed')==='false'&&document.querySelectorAll('.zipdlg .ztile.on').length===59`,
        undefined,
        'once',
      );
      await click('取消', dialog);
      await check(
        '取消大 ZIP 挑选不写入图库',
        () => database.loadLibrary('all').length === before + 3,
        undefined,
        'once',
      );
    } finally {
      commandNames.forEach((name, i) => {
        env.commandHandlers[name] = originalHandlers[i];
      });
    }
    await libraryImportExtras({ h, database, doubles, mode, files, reduced: importReduced, click });
    await all();
    await input('.gallery-search input', uniqueName);
    await wait('document.querySelectorAll(".card").length===1');
    await selectCard(0);
    await waitDetail();
    const doomed = await e('document.querySelector(".col.detail").dataset.detailId');
    await trashDetailImage();
    await h.until(() => !!database.loadProject(doomed).deleted_at, '待永久删除图片进入回收站');
    await click('回收站', scope);
    await input('.gallery-search input', uniqueName);
    await wait('document.querySelectorAll(".card").length===1');
    await selectCard(0);
    await waitDetail();
    await click('永久删除', 'document.querySelector(".detail .dacts")');
    await check(
      '永久删除默认聚焦取消并说明原文件不受影响',
      'document.activeElement.textContent.trim()==="取消" && document.querySelector("[role=dialog]:not(.leaving *)").textContent.includes("原文件不受影响")',
      undefined,
      'once',
    );
    await screen('purge');
    await click('取消', dialog);
    await check('取消永久删除保留图片', () => !!database.loadProject(doomed), undefined, 'once');
    await selectCard(0, { ctrlKey: true });
    await click('永久删除', 'document.querySelector(".ldock .selbar:not(.leaving)")');
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
    await wait('!!document.querySelector(".libp .empty")');

    await screen('empty');
    const emptyCollection = database
      .listCollections()
      .find((collection) => collection.kind === 'manual');
    await click(emptyCollection.name, 'document.querySelector(".libp .side")');
    await check(
      '全库无图片时收藏集侧栏仍可用且显示空收藏集说明',
      '!!document.querySelector(".libp .side .it.on[data-key^=sv-]") && document.querySelector(".libp .empty").textContent.includes("收藏集为空")',
      undefined,
      'once',
    );
    await checkCollectionContext(h, emptyCollection.id);
    database.updateProjects(activeIds, { deleted: false });
    await refresh();
  }
  if (!['图片库·导入', '减少动态效果'].includes(mode.category))
    await libraryFinishChecks({ h, database, refresh, click, input, selectCard, waitDetail });
}
