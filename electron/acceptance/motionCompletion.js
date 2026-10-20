import fs from 'node:fs/promises';
import path from 'node:path';
import { focusRingChecks } from './focusRings.js';

export async function motionCompletion({ h, mode }, enabled, theme, { capture, finish, sequence }) {
  const { evaluate: e, check, click, wait } = h;
  const label = (text) => `${theme} / ${enabled}：${text}`;
  const cssTransition = (selector, property) =>
    `(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)return false;const s=getComputedStyle(n);const declared=s.transitionProperty.split(',').some(p=>p.trim()==='all'||p.trim().startsWith(${JSON.stringify(property)}));const moving=s.transitionDuration.split(',').some(d=>parseFloat(d)>0.001);return ${enabled}?declared&&moving:!moving})()`;
  const settle = () =>
    e(
      `new Promise(resolve=>requestAnimationFrame(()=>{for(const a of document.getAnimations())if(a.effect?.getTiming().iterations!==Infinity)a.finish();requestAnimationFrame(resolve)}))`,
    );
  await click('图片库', 'document.querySelector(".studio-titlebar")');
  await click('全部图片', 'document.querySelector(".library-side")');
  await wait('!document.querySelector("[data-library-updating=true]")');
  await settle();
  // Unpaused rAF/Long Tasks trace. These are real frames, independent of the screenshot sampler.
  const trace = await e(`(async()=>{
    const marker=document.querySelector('.library-nav-indicator'),rows=[],longTasks=[];
    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(n=>({start:n.startTime,duration:n.duration}))));
    observer.observe({type:'longtask',buffered:false});
    const start=performance.now();document.querySelector('.library-side [data-collection-id="acceptance"]').click();
    await Promise.resolve();
    const first=marker.getAnimations().map(a=>({state:a.playState,frames:a.effect.getKeyframes()}));
    for(let i=0;i<30;i++){
      await new Promise(requestAnimationFrame);
      const a=marker.getAnimations()[0],r=marker.getBoundingClientRect();
      rows.push({time:performance.now()-start,y:r.y,progress:a?.effect.getComputedTiming().progress??1,content:document.querySelector('.library-side-item.on')?.dataset.collectionId==='acceptance'});
      if(i>2&&!a)break;
    }
    observer.disconnect();return {first,rows,longTasks};
  })()`);
  await fs.writeFile(
    path.join(mode.output, `024-navigation-trace-${theme}-${enabled}.json`),
    JSON.stringify(trace, null, 2),
  );
  await wait(
    'document.querySelector(".library-side-item.on")?.dataset.collectionId==="acceptance" && !document.querySelector("[data-library-updating=true]")',
  );
  await check(
    label('导航选中收藏集且内容更新'),
    'document.querySelector(".library-side-item.on")?.dataset.collectionId === "acceptance"',
    undefined,
    'once',
  );
  await check(
    label('当前导航不加粗，悬停底色由唯一标记承担'),
    `(()=>{const n=document.querySelector('.library-side-item.on'),s=getComputedStyle(n);return s.fontWeight===getComputedStyle(document.querySelector('.library-side-item')).fontWeight&&s.backgroundColor==='rgba(0, 0, 0, 0)'})()`,
    undefined,
    'once',
  );
  await click('全部图片', 'document.querySelector(".library-side")');
  await settle();
  await capture(h, '.library-nav-indicator,.nps-transition-snapshot', async () => {
    await click('验收收藏集', 'document.querySelector(".library-side")');
    await wait(
      'document.querySelector(".library-side-item.on")?.dataset.collectionId==="acceptance"',
    );
  });
  await check(
    label('手动收藏集不显示旧规则栏，导航保持选中'),
    '!document.querySelector(".library-collection-row") && document.querySelector(".library-side-item.on")?.dataset.collectionId==="acceptance"',
    undefined,
    'once',
  );
  if (enabled) await sequence(h, `024-sidebar-rules-${theme}`);
  await finish(h);
  await focusRingChecks(h, '收藏集导航');
  await capture(h, '.library-collection-collapse,.nps-transition-snapshot', async () => {
    await click('全部图片', 'document.querySelector(".library-side")');
    await wait(
      'document.querySelector(".library-side-item.on")?.dataset.collectionId!=="acceptance"',
    );
  });
  await check(
    label('退出手动收藏集更新导航且不保留旧规则栏'),
    '!document.querySelector(".library-collection-row") && document.querySelector(".library-side-item.on")?.dataset.collectionId!=="acceptance"',
    undefined,
    'once',
  );
  await finish(h);
  await settle();
  await h.nativeKey('Tab');
  await e('document.activeElement?.blur()');
  await settle();
  await capture(h, '.nps-field', () =>
    e('document.querySelector("[aria-label=搜索图片库]").focus()'),
  );
  await check(
    label('搜索焦点框进入有颜色或粗细过渡'),
    cssTransition('[aria-label=搜索图片库]', 'outline-'),
    undefined,
    'once',
  );
  if (enabled) await sequence(h, `024-focus-${theme}`);
  await finish(h);
  await capture(h, '.nps-field', () => e('document.activeElement.blur()'));
  await check(
    label('搜索焦点框离开同样淡出'),
    cssTransition('[aria-label=搜索图片库]', 'outline-'),
    undefined,
    'once',
  );
  await finish(h);
  await wait('document.querySelectorAll(".library-card").length>1');
  await wait('!document.querySelector("[data-library-updating=true]")');
  await settle();
  await capture(h, '.library-card img,.library-pick', () =>
    e('document.querySelector(".library-card:not(.current)").click()'),
  );
  await check(
    label('当前卡片边框颜色或粗细过渡'),
    cssTransition('.library-card img', 'outline-'),
    `({samples:window.transitionSamples.map(a=>({target:a.effect.target.className,state:a.playState,property:a.transitionProperty})),cards:[...document.querySelectorAll('.library-card img')].slice(0,3).map(n=>({class:n.parentElement.className,outline:getComputedStyle(n).outline,transition:getComputedStyle(n).transition}))})`,
    'once',
  );
  await finish(h);
  await capture(h, '.library-card img,.library-pick', () =>
    e('document.querySelectorAll(".library-card")[1].querySelector("[role=checkbox]").click()'),
  );
  await check(
    label('多选卡片边框和复选框淡入'),
    cssTransition('.library-card img', 'outline-') +
      ' && ' +
      cssTransition('.library-pick', 'opacity'),
    `({samples:window.transitionSamples.map(a=>({target:a.effect.target.className,state:a.playState,property:a.transitionProperty})),cards:[...document.querySelectorAll('.library-card img')].slice(0,3).map(n=>({class:n.parentElement.className,outline:getComputedStyle(n).outline,transition:getComputedStyle(n).transition}))})`,
    'once',
  );
  await finish(h);
  await click('取消', 'document.querySelector(".library-selection-bar")');
  await click('新建收藏集', 'document.querySelector(".library-side")');
  const name = `motion-fixture-${theme}-${enabled}`;
  await h.input('.library-side [aria-label=收藏集名称]', name);
  await capture(h, '.library-side .nps-menu-trigger,[data-list-exit]', async () => {
    await h.key('Enter', {}, 'document.activeElement');
    await wait(`!!document.querySelector('.library-side [aria-label="${name}"]')`);
  });
  await check(
    label('新建收藏集存在于列表'),
    `!!document.querySelector('.library-side [aria-label="${name}"]')`,
    undefined,
    'once',
  );
  await finish(h);
  await click(name, 'document.querySelector(".library-side")');
  await h.evaluate(
    `document.querySelector('.library-side [aria-label="${name}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:180}))`,
  );
  await click('删除', 'document.querySelector(".nps-menu:popover-open")');
  await capture(h, '[data-list-exit],.library-side .nps-menu-trigger', async () => {
    await click('删除', 'document.querySelector("dialog[open]")');
    await wait(`!document.querySelector('.library-side [aria-label="${name}"]')`);
  });
  await check(
    label('收藏集删除立即生效，淡出的副本不可操作'),
    `[...document.querySelectorAll('[data-list-exit]')].every(n=>n.inert&&!n.querySelector('[data-collection-id],[data-wb-tag]'))`,
    undefined,
    'once',
  );
  await finish(h);
  await settle();
  await click('工作台', 'document.querySelector(".studio-titlebar")');
  if (await e('!!document.querySelector(".wb-stage-dirty[data-visible]")')) {
    await click('恢复', 'document.querySelector(".wb-stage-title")');
    await wait('!document.querySelector(".wb-stage-dirty[data-visible]")');
  }
  await settle();
  await e('document.querySelector(".wb-add-trigger").click()');
  const text = `motion_insert_${theme}_${enabled}`;
  await h.input('[aria-label="输入中文或英文"]', text);
  await capture(h, '[data-wb-tag],[data-list-exit],.wb-stage-dirty', () =>
    h.key('Enter', {}, 'document.querySelector("[aria-label=输入中文或英文]")'),
  );
  await check(
    label('首次修改标记草稿'),
    `!!document.querySelector('.wb-stage-dirty[data-visible]')`,
    undefined,
    'once',
  );
  await check(
    label('新增 Tag 淡入且实际内容立即存在'),
    `[...document.querySelectorAll('[data-wb-tag]')].some(n=>n.textContent.includes(${JSON.stringify(text)}))`,
    undefined,
    'once',
  );
  await finish(h);
  await h.key('Escape');
  await e(
    `([...document.querySelectorAll('[data-wb-tag]')].find(n=>n.textContent.includes(${JSON.stringify(text)}))).querySelector(".wb-sortable-tag").click()`,
  );
  await wait('!!document.querySelector(".wb-tag-editor")');
  // Escape also collapses the add-tag helper. Measure deletion only after that
  // independent height transition has settled.
  await settle();
  await capture(h, '[data-list-exit],[data-wb-tag],.wb-stage-dirty', () =>
    click('删除', 'document.querySelector(".wb-tag-editor")'),
  );
  await check(
    label('删除 Tag 先淡出，退出副本不带业务标识'),
    `[...document.querySelectorAll('[data-list-exit]')].every(n=>n.inert&&!n.querySelector('[data-collection-id],[data-wb-tag]'))`,
    undefined,
    'once',
  );
  if (enabled) await sequence(h, `024-tag-exit-${theme}`);
  await finish(h);
  await settle();
  await check(
    label('删除结束清除副本且没有残留动画'),
    "!document.querySelector('[data-list-exit]')",
    undefined,
    'once',
  );
  // Adding and deleting a tag may normalize its raw separators. Reset through
  // the user command rather than assuming the serialized prompt is identical.
  await capture(h, '.wb-stage-dirty,.nps-transition-snapshot', async () => {
    await click('恢复', 'document.querySelector(".wb-stage-title")');
    await wait('!document.querySelector(".wb-stage-dirty[data-visible]")');
  });
  await check(
    label('恢复原图提示词后清除草稿标记'),
    `!document.querySelector('.wb-stage-dirty[data-visible]')`,
    undefined,
    'once',
  );
  await finish(h);
}
