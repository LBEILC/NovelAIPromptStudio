import {
  pointer,
  center,
  prepare,
  library,
  restoredTabs,
  closeAddedTabs,
  cleanup,
} from './interactions.js';

const frame = 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))';
const active = '.nps-layer:popover-open:not([aria-hidden="true"]):not(.nps-tip)';
const tag = 'document.querySelector(".wb-tags .nps-tag")';
const tags = '[...document.querySelectorAll(".wb-document-scroll [data-wb-tag]")]';
const editor = 'document.querySelector(".nps-popover:popover-open .wb-tag-editor")';
const scroll = 'document.querySelector(".wb-document-scroll")';

async function settle(h) {
  await h.wait(
    `[...document.querySelectorAll('${active}')].every(n=>n.getAnimations({subtree:true}).every(a=>a.playState!=='running'))`,
    '浮层到达可检查的稳定状态',
  );
}

async function press(h, expression) {
  const point = await center(h, expression);
  const cdp = h.window.webContents.debugger;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await cdp.sendCommand('Input.dispatchMouseEvent', {
      type,
      ...point,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mousePressed' ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
    });
}

async function toggle(h, label, trigger, layer) {
  for (let count = 1; count <= 5; count++) {
    await press(h, trigger);
    await h.wait(`!!(${layer})===${count % 2 === 1}`, `${label} 第 ${count} 次点击完成`);
    await h.check(
      `${label}：连续第 ${count} 次点击${count % 2 ? '打开' : '关闭'}`,
      `!!(${layer})===${count % 2 === 1}`,
      undefined,
      'once',
    );
  }
  await h.nativeKey('Escape');
  await h.wait(`!(${layer})`);
  await h.check(
    `${label}：Esc 返回触发器`,
    `document.activeElement===${trigger}`,
    'window.correctionExit',
    'once',
  );
  for (const key of ['Enter', ' ']) {
    await h.evaluate(`${trigger}.focus()`);
    await h.nativeKey(key);
    await h.wait(`!!(${layer})`, `${label} 键盘打开`);
    await h.evaluate(`${trigger}.focus()`);
    await h.nativeKey(key);
    await h.wait(`!(${layer})`, `${label} 键盘关闭`);
    await h.check(`${label}：${key === ' ' ? '空格' : key} 开关`, `!(${layer})`, undefined, 'once');
  }
}

async function exitCheck(h, label, trigger, layer, close) {
  await press(h, trigger);
  await h.wait(`!!(${layer})`);
  await settle(h);
  await h.evaluate(`(()=>{
    const node=${layer}; window.correctionExit=null; let closing=false;
    const record=animated=>{
      if(window.correctionExit)return;
      const off=document.documentElement.dataset.motion==='off';
      window.correctionExit={off,connected:node.isConnected,animated,duration:getComputedStyle(node).transitionDuration};
    };
    // Listening for the exit transition avoids sampling one frame later, which misses a 120ms fade on slow CI frames.
    // With motion off a sub-millisecond transition may still run so that transitionend fires; it is not a fade.
    node.addEventListener('transitionrun',event=>{
      if(closing&&event.target===node&&event.propertyName==='opacity'&&document.documentElement.dataset.motion!=='off')record(true);
    });
    node.addEventListener('beforetoggle',event=>{
      if(event.newState!=='closed')return;
      closing=true;
      requestAnimationFrame(()=>{
        if(node.getAnimations().some(a=>a.transitionProperty==='opacity'&&a.playState==='running'))record(true);
        requestAnimationFrame(()=>record(false));
      });
    },{once:true});
  })()`);
  await close();
  await h.wait('window.correctionExit!==null', `${label} 已观察到关闭`);
  await h.check(
    `${label}：完整动效保留淡出，关闭动效直接退出`,
    `(()=>{const r=window.correctionExit,t=getComputedStyle(document.documentElement).getPropertyValue('--dur-1').trim(),ms=parseFloat(t)*(t.endsWith('ms')?1:1000);return r.off?!r.animated:r.connected&&r.animated&&r.duration.split(',').some(s=>Math.abs(parseFloat(s)*1000-ms)<1)})()`,
    'window.correctionExit',
    'once',
  );
  await h.wait(`!(${layer})`);
}

async function geometry(h, label) {
  await h.check(
    label,
    `(()=>{
      const nodes=${tags}.filter(n=>getComputedStyle(n).visibility!=='hidden');
      const rects=nodes.map(n=>n.getBoundingClientRect());
      const unchanged=nodes.every((n,i)=>{const text=n.querySelector('.nps-tag-en').textContent,r=rects[i],old=window.correctionSizes[text];return old&&Math.abs(r.width-old.width)<1&&Math.abs(r.height-old.height)<1});
      const separate=rects.every((a,i)=>rects.slice(i+1).every(b=>a.right<=b.left+0.5||b.right<=a.left+0.5||a.bottom<=b.top+0.5||b.bottom<=a.top+0.5));
      const overlay=document.querySelector('.wb-drag-feedback'),r=overlay.getBoundingClientRect(),b=${scroll}.getBoundingClientRect();
      const hidden=[...document.querySelectorAll('.wb-tag-dragging')].every(n=>getComputedStyle(n).visibility==='hidden');
      return unchanged&&separate&&hidden&&r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;
    })()`,
  );
}

export async function interactionCorrectionChecks(env) {
  const { h } = env;
  const { evaluate: e, check, click, wait } = h;
  h.category('交互修正');
  const size = h.window.getContentSize();
  h.window.setContentSize(1240, 900);
  const records = await prepare(env, 'correction-fixture');
  const dictionaryTag = 'correction_dictionary_fixture';
  env.database.upsertTagDictionary([
    {
      tag: dictionaryTag,
      translation: '合成验收词条',
      category: 'Unsorted',
      translation_source: 'manual',
      category_source: 'manual',
    },
  ]);
  const originalMotion = env.preferences.appearanceSettings().motion;
  const move = pointer(h);
  await h.reload();
  const previousTabs = await restoredTabs(h);
  try {
    await h.section('外观');
    await click(
      env.mode.reducedMotion ? '跟随系统' : '完整',
      'document.querySelector("[aria-label=动效]")',
    );
    const listbox = 'document.querySelector(".nps-menu[role=listbox]:popover-open")';
    const fontsBefore = env.preferences.appearanceSettings();
    for (const [label, key] of [
      ['界面字体', 'sansFont'],
      ['等宽字体', 'monoFont'],
      ['段落字体', 'proseFont'],
    ]) {
      await toggle(h, label, `document.querySelector('[aria-label="${label}"]')`, listbox);
      await check(
        `${label}连续开关后偏好保持原值`,
        () => env.preferences.appearanceSettings()[key] === fontsBefore[key],
        () => ({ expected: fontsBefore[key], actual: env.preferences.appearanceSettings()[key] }),
        'once',
      );
    }
    await h.section('翻译词典');
    await h.input('.settings-dictionary-search input', dictionaryTag);
    await wait(`!!document.querySelector('[aria-label="更多：${dictionaryTag}"]')`);
    for (const label of ['按 Tag 分类筛选', '排序'])
      await toggle(h, `词典${label}`, `document.querySelector('[aria-label="${label}"]')`, listbox);
    const dictionaryMenu = 'document.querySelector(".nps-menu:popover-open")';
    const dictionaryMore = `document.querySelector('[aria-label="更多：${dictionaryTag}"]')`;
    await toggle(h, '词典行更多', dictionaryMore, dictionaryMenu);
    await exitCheck(h, '词典行更多退出保留菜单内容', dictionaryMore, dictionaryMenu, () =>
      press(h, dictionaryMore),
    );
    await toggle(
      h,
      '词典行分类',
      `document.querySelector('[aria-label="分类：${dictionaryTag}"]')`,
      dictionaryMenu,
    );
    await click(dictionaryTag, 'document.querySelector(".settings-table")');
    await toggle(
      h,
      '词典批量设置分类',
      'document.querySelector(".settings-dictionary-selection [aria-label=设置分类]")',
      dictionaryMenu,
    );
    await click(dictionaryTag, 'document.querySelector(".settings-table")');
    await library(h, 'correction-fixture');
    const byLabel = (label) =>
      `[...document.querySelectorAll('.library-page button')].find(n=>n.getAttribute('aria-label')===${JSON.stringify(label)}||n.textContent.trim()===${JSON.stringify(label)})`;
    const pop = (label) =>
      `[...document.querySelectorAll('${active}')].find(n=>n.querySelector('.nps-sr')?.textContent===${JSON.stringify(label)})`;
    await toggle(h, '筛选', byLabel('筛选'), pop('筛选'));
    await toggle(h, '视图', byLabel('视图'), pop('视图'));
    await press(h, byLabel('视图'));
    await toggle(h, '图片排序下拉框', 'document.querySelector("[aria-label=图片排序]")', listbox);
    await h.nativeKey('Escape');
    await toggle(h, '导入拆分箭头', byLabel('其他导入方式'), pop('其他导入方式'));
    await press(h, byLabel('筛选'));
    await toggle(
      h,
      '日期预设下拉框',
      'document.querySelector("[aria-label=导入时间]")',
      'document.querySelector(".nps-menu[role=listbox]:popover-open")',
    );
    await h.nativeKey('Escape');
    // All close routes pass through the same Layer presence handling.
    const trigger = byLabel('视图');
    for (const [label, close] of [
      ['再次点击触发器', () => press(h, trigger)],
      ['Esc', () => h.nativeKey('Escape')],
      ['点击外面', () => press(h, 'document.querySelector(".library-search input")')],
    ])
      await exitCheck(h, label, trigger, pop('视图'), close);
    await press(h, byLabel('筛选'));
    await exitCheck(
      h,
      '选中下拉选项',
      'document.querySelector("[aria-label=导入时间]")',
      'document.querySelector(".nps-menu[role=listbox]:popover-open")',
      () => click('不限时间', 'document.querySelector(".nps-menu[role=listbox]:popover-open")'),
    );
    await h.nativeKey('Escape');
    for (const ratio of [1, 1.25, 1.5]) {
      await h.window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: 1240,
        height: 900,
        deviceScaleFactor: ratio,
        mobile: false,
      });
      await press(h, byLabel('其他导入方式'));
      await settle(h);
      await check(
        `拆分按钮 ${ratio * 100}%：上下对齐、内角为零、无间隙且展开保持墨色`,
        `(async()=>{
        const buttons=[...document.querySelectorAll('.library-import-buttons .nps-button')],a=buttons[0].getBoundingClientRect(),b=buttons[1].getBoundingClientRect(),x=getComputedStyle(buttons[0]),y=getComputedStyle(buttons[1]),probe=document.createElement('span');
        await Promise.allSettled(buttons.flatMap(n=>n.getAnimations()).map(a=>a.finished));
        probe.style.background='var(--ink-hover)';document.body.append(probe);const ink=getComputedStyle(probe).backgroundColor;probe.remove();
        return window.devicePixelRatio===${ratio}&&a.top===b.top&&a.bottom===b.bottom&&a.right===b.left&&x.borderTopRightRadius==='0px'&&x.borderBottomRightRadius==='0px'&&y.borderTopLeftRadius==='0px'&&y.borderBottomLeftRadius==='0px'&&y.backgroundColor===ink&&y.borderTopColor===ink;
      })()`,
        `(()=>{const b=[...document.querySelectorAll('.library-import-buttons .nps-button')];return {ratio:devicePixelRatio,buttons:b.map(n=>{const s=getComputedStyle(n);return {rect:n.getBoundingClientRect().toJSON(),radius:[s.borderTopLeftRadius,s.borderTopRightRadius],bg:s.backgroundColor,border:s.borderTopColor,ink:s.getPropertyValue('--ink-hover')}})}})()`,
      );
      await h.screenshot(`correction-split-${ratio * 100}`);
      await h.nativeKey('Escape');
    }
    await h.window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
    await e('document.querySelector(".library-card").click()');
    await wait('!!document.querySelector(".library-detail-picture img")');
    await check(
      '详情图片使用放大镜指针',
      'getComputedStyle(document.querySelector(".library-detail-picture img")).cursor==="zoom-in"',
    );
    await press(h, 'document.querySelector(".library-detail-picture img")');
    await check(
      '详情图片单击打开大图',
      '!!document.querySelector(".library-viewer")',
      undefined,
      'once',
    );
    await h.nativeKey('Escape');
    await toggle(
      h,
      '加入收藏集',
      'document.querySelector(".library-detail [aria-label=加入收藏集]")',
      pop('加入收藏集'),
    );
    for (const record of records.slice(0, 2)) {
      await e(
        `document.querySelector('[data-project-id="${record.id}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
      );
      await wait('!!document.querySelector(".wb-document-scroll")');
      if (record === records[0])
        await click('图片库', 'document.querySelector(".studio-titlebar")');
    }
    await click('工作台', 'document.querySelector(".studio-titlebar")');
    const wb = (label) =>
      `document.querySelector('.wb-prompt [aria-label=${JSON.stringify(label)}]')`;
    const menu = 'document.querySelector(".nps-menu:popover-open")';
    await toggle(h, '显示', wb('显示'), pop('显示方式'));
    await press(h, wb('显示'));
    for (const label of ['语言', '排列', '只看', '分类'])
      await toggle(
        h,
        `显示·${label}`,
        `document.querySelector('.nps-popover [aria-label="${label}"]')`,
        listbox,
      );
    await h.nativeKey('Escape');
    await toggle(h, '节菜单', wb('更多'), menu);
    await toggle(h, '块菜单', wb('块操作'), menu);
    await toggle(h, '复制拆分箭头', wb('其他复制方式'), menu);
    await click('添加角色');
    await toggle(h, '角色操作', wb('角色操作'), menu);
    await e(
      `${tag}.dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await toggle(h, '移动到', wb('移动到'), menu);
    await e(
      `${tag}.dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true}))`,
    );
    await toggle(
      h,
      'Tag 编辑',
      tag,
      'document.querySelector(".nps-popover:popover-open .wb-tag-editor")',
    );
    await press(h, tag);
    await toggle(h, 'Tag 分类下拉框', `document.querySelector('[aria-label="Tag 分类"]')`, listbox);
    await h.nativeKey('Escape');
    const tagLayer = 'document.querySelector(".nps-popover:popover-open:has(.wb-tag-editor)")';
    await exitCheck(h, 'Tag 内部取消按钮', tag, tagLayer, () => click('取消', editor));
    await press(h, tag);
    await settle(h);
    await e(
      `window.correctionTagTransitions=[];window.correctionTagListener=event=>{const n=event.target;if(n.matches('.nps-popover')&&n.querySelector('.wb-tag-editor'))window.correctionTagTransitions.push({property:event.propertyName,exiting:n.getAttribute('aria-hidden')==='true'})};document.addEventListener('transitionrun',window.correctionTagListener,true)`,
    );
    const second = 'document.querySelectorAll(".wb-tags .nps-tag")[1]';
    const secondText = await e(`${second}.querySelector('.nps-tag-en').textContent`);
    await press(h, second);
    await wait(
      `document.querySelector('.wb-tag-editor [aria-label=Tag]')?.value===${JSON.stringify(secondText)}`,
    );
    await check(
      '点击另一个 Tag 后仅新编辑浮层处于打开状态',
      `document.querySelectorAll('.nps-popover:popover-open .wb-tag-editor').length===1&&${editor}.querySelector('[aria-label=Tag]').value===${JSON.stringify(secondText)}`,
      undefined,
      'once',
    );
    if (!env.mode.reducedMotion)
      await wait(
        'window.correctionTagTransitions.some(t=>t.exiting&&t.property==="opacity")&&window.correctionTagTransitions.some(t=>!t.exiting&&t.property==="transform")',
        '旧 Tag 浮层退出且新 Tag 浮层进入',
      );
    await check(
      '切换 Tag 时旧浮层淡出、新浮层进入；关闭动效时无过渡',
      `document.documentElement.dataset.motion==='off'?document.querySelector('.nps-popover:popover-open').getAnimations().length===0:window.correctionTagTransitions.some(t=>t.exiting&&t.property==='opacity')&&window.correctionTagTransitions.some(t=>!t.exiting&&t.property==='transform')`,
      'window.correctionTagTransitions',
      'once',
    );
    await e('document.removeEventListener("transitionrun",window.correctionTagListener,true)');
    await h.nativeKey('Escape');
    await click('更多', 'document.querySelector(".wb-section")');
    await click('编辑原始文本', menu);
    const raw =
      'tiny, synthetic_long_tag_alpha, medium_tag, synthetic_long_tag_beta, short, another_synthetic_tag, x, wide_synthetic_tag_gamma, last_tag\n\nsecond_block, another_long_synthetic_tag, final_marker';
    await h.input('[aria-label="原始文本"]', raw);
    await click('保存', 'document.querySelector(".wb-raw-editor")');
    await wait(
      'document.querySelector(".wb-tags")?.textContent.includes("synthetic_long_tag_alpha")',
    );
    await press(h, tag);
    await h.input('[aria-label="译文"]', '合成验收译文');
    await click('完成', editor);
    await e(`${scroll}.scrollTop=0;${frame}`);
    await e(
      `window.correctionSizes=Object.fromEntries(${tags}.map(n=>{const r=n.getBoundingClientRect();return [n.querySelector('.nps-tag-en').textContent,{width:r.width,height:r.height}]}))`,
    );
    const startDrag = async (expression) => {
      const start = await center(h, expression);
      await move('mouseMoved', start);
      await move('mousePressed', start, true);
      await move('mouseMoved', { x: start.x + 10, y: start.y + 2 }, true);
      await wait('!!document.querySelector(".wb-drag-feedback")');
      return start;
    };
    const source = 'document.querySelector(".wb-tags [data-marquee-key]")';
    const start = await startDrag(source);
    await e(`window.correctionFrames=[];window.correctionSample=true;window.correctionFrameId=0;
      const correctionSampleFrame=()=>{if(!window.correctionSample)return;window.correctionFrameId=requestAnimationFrame(()=>{setTimeout(()=>{
        if(!window.correctionSample)return;
        const nodes=${tags}.filter(n=>getComputedStyle(n).visibility!=='hidden'),rects=nodes.map(n=>n.getBoundingClientRect());
        const dimensions=nodes.every((n,i)=>{const old=window.correctionSizes[n.querySelector('.nps-tag-en').textContent],r=rects[i];return old&&Math.abs(r.width-old.width)<1&&Math.abs(r.height-old.height)<1});
        const separate=rects.every((a,i)=>rects.slice(i+1).every(b=>a.right<=b.left+0.5||a.left>=b.right-0.5||a.bottom<=b.top+0.5||a.top>=b.bottom-0.5));
        const animations=nodes.flatMap(n=>n.getAnimations());
        window.correctionFrames.push({dimensions,separate,animated:animations.some(a=>a.playState==='running'),translation:animations.every(a=>a.effect.getKeyframes().every(k=>!k.transform||k.transform==='none'||k.transform.startsWith('translate(')))});
        correctionSampleFrame();
      },0)})};correctionSampleFrame();`);
    for (const [label, target, screenshot] of [
      [
        '同块',
        'document.querySelectorAll(".wb-tags")[0].querySelectorAll(".nps-tag")[1]',
        'same-block',
      ],
      [
        '跨行',
        'document.querySelectorAll(".wb-tags")[0].querySelectorAll(".nps-tag")[7]',
        'cross-row',
      ],
      [
        '跨块',
        'document.querySelectorAll(".wb-tags")[1].querySelector(".wb-add-trigger")',
        'cross-block',
      ],
    ]) {
      const point = await center(h, target);
      await move('mouseMoved', point, true);
      for (let sample = 0; sample < 3; sample++) {
        await e(frame);
        await geometry(
          h,
          `Tag ${label}采样 ${sample + 1}：自身宽高不变、互不重叠、原位无副本且限位`,
        );
      }
      await h.screenshot(`correction-tag-${screenshot}`);
    }
    await e('window.correctionSample=false;cancelAnimationFrame(window.correctionFrameId)');
    await check(
      '逐帧拖动采样保持自身尺寸与不相交，完整动效确实只用位移',
      `window.correctionFrames.length>3&&window.correctionFrames.every(f=>f.dimensions&&f.separate&&f.translation)&&(document.documentElement.dataset.motion==='off'?!window.correctionFrames.some(f=>f.animated):window.correctionFrames.some(f=>f.animated))`,
      'window.correctionFrames',
      'once',
    );
    await move('mouseMoved', { x: 10, y: 10 }, true);
    await geometry(h, '指针越过栏边界时 Tag 副本仍在提示词栏内');
    await h.nativeKey('Escape');
    await move('mouseReleased', start);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await startDrag(source);
    await move(
      'mouseMoved',
      await center(h, 'document.querySelectorAll(".wb-tags")[1].querySelector(".wb-add-trigger")'),
      true,
    );
    await wait('!!document.querySelectorAll(".wb-tags")[1].querySelector(".wb-insertion-slot")');
    await e(`Promise.allSettled(${tags}.flatMap(n=>n.getAnimations()).map(a=>a.finished))`);
    await h.screenshot('correction-tag-cross-block');
    await e(
      `window.correctionPreview=${tags}.filter(n=>getComputedStyle(n).visibility!=='hidden').map(n=>{const r=n.getBoundingClientRect(),b=${scroll}.getBoundingClientRect();return {text:n.querySelector('.nps-tag-en').textContent,x:r.left-b.left,y:r.top-b.top+${scroll}.scrollTop}})`,
    );
    const landing = await center(h, 'document.querySelector(".wb-insertion-slot")');
    await move('mouseMoved', landing, true);
    await move('mouseReleased', landing);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await check(
      '放下后的真实排版与拖动预览一致',
      `window.correctionPreview.every(old=>{const n=${tags}.find(n=>n.querySelector('.nps-tag-en').textContent===old.text),r=n.getBoundingClientRect(),b=${scroll}.getBoundingClientRect();return Math.abs(r.left-b.left-old.x)<1&&Math.abs(r.top-b.top+${scroll}.scrollTop-old.y)<1})`,
    );
    const gap = 'document.querySelector(".wb-add-block-gap")';
    await move('mouseMoved', await center(h, tag));
    await check(
      '指针在块里时加一块不可见',
      `getComputedStyle(${gap}.querySelector('button')).opacity==='0'`,
    );
    await move('mouseMoved', await center(h, gap));
    await wait(`getComputedStyle(${gap}.querySelector('button')).opacity==='1'`);
    await check(
      '空隙中的加一块可见且不覆盖任何 Tag',
      `(()=>{const b=${gap}.querySelector('button'),r=b.getBoundingClientRect();return getComputedStyle(b).opacity==='1'&&${tags}.every(t=>{const a=t.getBoundingClientRect();return a.right<=r.left||a.left>=r.right||a.bottom<=r.top||a.top>=r.bottom})})()`,
    );
    await h.screenshot('correction-add-block');
    await move('mouseMoved', { x: 20, y: 300 });
    await e(`${gap}.querySelector('button').focus()`);
    await wait(`getComputedStyle(${gap}.querySelector('button')).opacity==='1'`);
    await check(
      '键盘聚焦加一块时可见',
      `getComputedStyle(${gap}.querySelector('button')).opacity==='1'`,
    );
    const tab = 'document.querySelector(".wb-tabs-scroll .wb-tab")';
    const origin = await startDrag(tab);
    for (const point of [
      { x: 0, y: 500 },
      { x: 1230, y: 500 },
    ]) {
      await move('mouseMoved', point, true);
      await check(
        '标签页拖动：纵向不变、左右限位且原位无影子',
        `(()=>{const d=document.querySelector('.wb-drag-feedback'),r=d.getBoundingClientRect(),b=document.querySelector('.wb-tabs-scroll').getBoundingClientRect(),a=${tab}.getBoundingClientRect();return Math.abs((r.top+r.bottom)/2-(a.top+a.bottom)/2)<1&&r.left>=b.left-1&&r.right<=b.right+1&&getComputedStyle(${tab}).visibility==='hidden'})()`,
      );
    }
    await h.screenshot('correction-tab-drag');
    await h.nativeKey('Escape');
    await move('mouseReleased', origin);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await click('更多', 'document.querySelector(".wb-section")');
    await click('编辑原始文本', menu);
    await h.input(
      '[aria-label="原始文本"]',
      Array.from({ length: 100 }, (_, index) => `scroll_fixture_tag_${index}`).join(', '),
    );
    await click('保存', 'document.querySelector(".wb-raw-editor")');
    await e(`${scroll}.scrollTop=0`);
    await startDrag(source);
    const lower = await e(
      `(()=>{const r=${scroll}.getBoundingClientRect();return {x:r.left+r.width/2,y:r.bottom-2}})()`,
    );
    await move('mouseMoved', lower, true);
    await wait(`${scroll}.scrollTop>60`, 'Tag 停在下边缘时自动向下滚动');
    const scrolled = await e(`${scroll}.scrollTop`);
    const upper = await e(
      `(()=>{const r=${scroll}.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+2}})()`,
    );
    await move('mouseMoved', upper, true);
    await wait(`${scroll}.scrollTop<${scrolled}`, 'Tag 停在上边缘时自动向上滚动');
    await check(
      'Tag 拖动同时支持上下边缘自动滚动',
      `${scroll}.scrollTop<${scrolled}`,
      undefined,
      'once',
    );
    await h.nativeKey('Escape');
    await move('mouseReleased', upper);
  } finally {
    await h.nativeKey('Escape');
    await move('mouseReleased', { x: 20, y: 300 });
    await h.window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
    await h.section('外观');
    await click(
      { full: '完整', reduced: '跟随系统', off: '关闭' }[originalMotion],
      'document.querySelector("[aria-label=动效]")',
    );
    await closeAddedTabs(h, previousTabs);
    await cleanup(env, records);
    env.database.deleteTagDictionary(dictionaryTag);
    h.window.setContentSize(...size);
  }
}
