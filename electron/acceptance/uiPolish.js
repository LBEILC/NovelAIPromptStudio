import path from 'node:path';

export async function uiPolishChecks({ h, mode }) {
  const { evaluate: e, check, wait, click, key } = h;
  h.category('基础组件·细节');
  const originalURL = h.window.webContents.getURL();
  const frame = 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))';
  const tip = 'document.querySelector(".nps-tip:popover-open")';
  const first = 'document.querySelector("[aria-label=验收控件一]")';
  const second = 'document.querySelector("[aria-label=验收控件二]")';
  const menu = 'document.querySelector(".nps-menu:popover-open")';
  const hover = async (target) => {
    await e(`${target}.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
    await e(frame);
  };
  const settle = async (target) => {
    await wait(`!${target}.hasAttribute('data-entering')`);
    await e(`Promise.allSettled(${target}.getAnimations().map(a=>a.finished)).then(()=>undefined)`);
  };
  // Pause real transitions so sequence evidence is deterministic even on a slow machine.
  const arm = async (selector) => {
    await e(
      `window.polishAnimations=[];window.polishListener=event=>{if(event.target.matches(${JSON.stringify(selector)})){const animations=event.target.getAnimations();animations.forEach(a=>a.pause());window.polishAnimations.push(...animations)}};document.addEventListener('transitionrun',window.polishListener,true)`,
    );
  };
  const sequence = async (name) => {
    await wait('window.polishAnimations.some(a=>a.transitionProperty==="transform")');
    await e('window.polishAnimations.forEach(a=>{a.currentTime=0})');
    await h.screenshot(`${name}-start`);
    await e(
      'window.polishAnimations.forEach(a=>{a.currentTime=Number(a.effect.getTiming().duration)/2})',
    );
    await h.screenshot(`${name}-middle`);
    await e('window.polishAnimations.forEach(a=>a.finish());window.polishAnimations=[]');
    await h.screenshot(`${name}-end`);
  };
  const disarm = () =>
    e(
      'window.polishAnimations.forEach(a=>a.finish());document.removeEventListener("transitionrun",window.polishListener,true)',
    );
  const close = async () => {
    await key('Escape');
    await wait('!document.querySelector(".nps-layer:not(.nps-tip)")');
  };
  // Full motion is explicit: CI runners report prefers-reduced-motion.
  await h.window.loadFile(path.join(mode.root, 'showcase', 'ui-showcase.html'), {
    query: { theme: 'system', motion: 'full' },
  });
  await wait('!!document.querySelector("[data-polish-probe]")');
  await e('document.querySelector("[data-polish-probe]").scrollIntoView({block:"center"})');
  await e('document.documentElement.dataset.motion="full"');
  await e(frame);
  await hover(first);
  await wait(`${tip}?.textContent==='验收提示一'`);
  await check(
    '自绘提示通过 aria-describedby 关联控件',
    `${first}.getAttribute('aria-describedby')===${tip}.id`,
  );
  await check('提示只淡入，没有平移缩放', `getComputedStyle(${tip}).transform==='none'`);
  await h.screenshot('polish-tooltip');
  // Observe timer scheduling, not elapsed time: adjacent warm targets must not schedule a dwell.
  await e(
    `window.polishTimeout=window.setTimeout;window.polishDelays=[];window.setTimeout=(fn,ms,...args)=>{window.polishDelays.push(ms);return window.polishTimeout(fn,ms,...args)};void 0`,
  );
  await hover(second);
  await check(
    '相邻提示立即切换，不再安排等待',
    `${tip}?.textContent==='验收提示二'&&!window.polishDelays.includes(500)`,
    undefined,
    'once',
  );
  await e('window.setTimeout=window.polishTimeout;void 0');
  await e(
    `${second}.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}))`,
  );
  await e('new Promise(r=>setTimeout(r,350))');
  await e(
    `window.polishDelays=[];window.setTimeout=(fn,ms,...args)=>{window.polishDelays.push(ms);return window.polishTimeout(fn,ms,...args)};void 0`,
  );
  await hover(first);
  await check('离开所有控件后恢复停留等待', 'window.polishDelays.includes(500)', undefined, 'once');
  await e('window.setTimeout=window.polishTimeout;void 0');
  await wait(`!!${tip}`);
  for (const [label, action] of [
    ['按下', `${second}.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`],
    ['滚动', 'window.dispatchEvent(new Event("scroll"))'],
    ['窗口失焦', 'window.dispatchEvent(new Event("blur"))'],
    ['Esc', 'document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))'],
  ]) {
    await e(
      `${first}.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));${first}.focus()`,
    );
    await wait(`!!${tip}`);
    await e(action);
    await check(`${label}关闭提示`, `!${tip}`, undefined, 'once');
    await e(`${first}.blur()`);
  }
  await e(`${second}.focus()`);
  await wait(`${tip}?.textContent==='验收提示二'`);
  await check('键盘聚焦显示提示', `${second}.getAttribute('aria-describedby')===${tip}.id`);
  await e(`${second}.blur()`);
  const clipped = 'document.querySelector("[data-polish-probe] [data-tip-overflow]")';
  await hover(clipped);
  await wait(`${tip}?.textContent==='Synthetic overflowing name'`);
  await check(
    '被截断文字显示完整提示',
    `${clipped}.scrollWidth>${clipped}.clientWidth&&${tip}.textContent===${clipped}.textContent`,
  );
  await e('window.dispatchEvent(new Event("scroll"))');
  await hover('document.querySelectorAll("[data-polish-probe] [data-tip-overflow]")[1]');
  await check('完整显示的文字不产生提示', `!${tip}`, undefined, 'once');
  // Force the real anchor to a viewport edge to exercise flip/clamp geometry.
  await e(
    `${first}.style.position='fixed';${first}.style.bottom='0';${first}.style.right='0';${first}.focus()`,
  );
  await wait(`!!${tip}`);
  await settle(tip);
  await check(
    '底部提示翻到上方且不超出窗口',
    `(()=>{const r=${tip}.getBoundingClientRect(),a=${first}.getBoundingClientRect();return r.bottom<=a.top+1&&r.left>=0&&r.top>=0&&r.right<=innerWidth})()`,
  );
  await e(`${first}.removeAttribute('style');${first}.blur()`);
  await arm('.nps-menu[popover]');
  await click('验收菜单');
  await wait(`!!${menu}`);
  await settle('document.querySelector("button[aria-label=验收菜单]")');
  await check(
    '菜单触发器是 quiet 按钮且打开时保持按下态',
    `(()=>{const n=document.querySelector('[aria-label=验收菜单]');return n.tagName==='BUTTON'&&n.classList.contains('nps-button-quiet')&&n.getAttribute('aria-expanded')==='true'&&getComputedStyle(n).backgroundColor!=='rgba(0, 0, 0, 0)'})()`,
  );
  await check(
    '所有表面颜色使用共享 hover 过渡',
    `['[aria-label=验收菜单]','.nps-menu-item','.nps-tag','.nps-switch'].every(s=>{const c=getComputedStyle(document.querySelector(s));return ['background-color','color','border-color'].every(p=>c.transitionProperty.includes(p))})`,
  );
  await sequence('polish-menu-enter');
  await h.screenshot('polish-menu-open');
  const parent = `${menu}.querySelector('[aria-haspopup=menu]')`;
  await hover(parent);
  await wait('document.querySelectorAll(".nps-menu:popover-open").length===2');
  await wait('window.polishAnimations.some(a=>a.transitionProperty==="transform")');
  await check(
    '侧向子菜单从实际锚点方向进入',
    `(()=>{const n=document.querySelectorAll('.nps-menu:popover-open')[1],a=window.polishAnimations.find(a=>a.transitionProperty==='transform'),m=new DOMMatrix(a.effect.getKeyframes()[0].transform);return Math.abs(m.m42)<0.01&&(n.dataset.placement==='right'?m.m41<0:m.m41>0)})()`,
    undefined,
    'once',
  );
  await sequence('polish-submenu-enter');
  await check(
    '二级菜单悬停自动展开并保留父项焦点',
    `${parent}.getAttribute('aria-expanded')==='true'&&document.querySelectorAll('.nps-menu:popover-open').length===2`,
  );
  await e(
    `${menu}.querySelector('[aria-label="翻译与分类"]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));document.querySelectorAll('.nps-menu:popover-open')[1].firstElementChild.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
  );
  await e('new Promise(r=>setTimeout(r,350))');
  await check(
    '经过相邻项进入子菜单不会误关',
    'document.querySelectorAll(".nps-menu:popover-open").length===2',
    undefined,
    'once',
  );
  await h.screenshot('polish-submenu-open');
  await disarm();
  await e(`${parent}.focus()`);
  await key('Escape');
  await wait('!document.querySelector(".nps-menu:popover-open")');
  await wait('!document.querySelector(".nps-menu[popover]")');
  // Pause actual CSS transitions to inspect entry/exit without racing a millisecond deadline.
  await arm('.nps-popover[popover]');
  await click('编辑一个 Tag');
  const panel = 'document.querySelector(".nps-popover:popover-open")';
  await wait(`!!${panel}&&window.polishAnimations.length>0`);
  await check(
    'Tag 编辑浮层实际启动透明度和变换进入动画',
    'window.polishAnimations.some(a=>a.transitionProperty==="opacity")&&window.polishAnimations.some(a=>a.transitionProperty==="transform")',
    undefined,
    'once',
  );
  await sequence('polish-tag-enter');
  await key('Escape');
  await wait('window.polishAnimations.some(a=>a.transitionProperty==="opacity")');
  await check(
    '退出时保留节点并只淡出、不位移',
    '(()=>{const n=document.querySelector(".nps-popover");return !!n&&!n.matches(":popover-open")&&window.polishAnimations.some(a=>a.transitionProperty==="opacity")&&!window.polishAnimations.some(a=>a.transitionProperty==="transform")})()',
    undefined,
    'once',
  );
  await disarm();
  await wait('!document.querySelector(".nps-popover[popover]")');
  await arm('dialog.nps-dialog');
  await click('关闭已修改的标签？');
  await wait('window.polishAnimations.some(a=>a.transitionProperty==="transform")');
  await check(
    '对话框从 0.98 淡入放大且没有位移',
    `(()=>{const a=window.polishAnimations.find(a=>a.transitionProperty==='transform'),m=new DOMMatrix(a.effect.getKeyframes()[0].transform);return Math.abs(m.a-0.98)<0.001&&m.m41===0&&m.m42===0&&window.polishAnimations.some(a=>a.transitionProperty==='opacity')})()`,
    undefined,
    'once',
  );
  await e('window.polishAnimations.forEach(a=>a.finish());window.polishAnimations=[]');
  await h.nativeKey('Escape');
  await wait('window.polishAnimations.some(a=>a.transitionProperty==="opacity")');
  await check(
    '对话框退出淡出时节点仍在、关闭后不可交互',
    '!!document.querySelector("dialog.nps-dialog[inert]:not([open])")&&!window.polishAnimations.some(a=>a.transitionProperty==="transform")',
    undefined,
    'once',
  );
  await disarm();
  await wait('!document.querySelector("dialog.nps-dialog")');
  await click('采样器');
  await wait('!!document.querySelector(".nps-layer:popover-open[role=listbox]")');
  await check(
    '下拉框复用带锚点方向的浮层',
    '!!document.querySelector(".nps-layer[data-placement]:popover-open[role=listbox]")',
  );
  await close();
  await h.window.loadFile(path.join(mode.root, 'showcase', 'ui-showcase.html'), {
    query: { theme: 'system', motion: 'off' },
  });
  await wait('!!document.querySelector("[data-polish-probe]")');
  await click('编辑一个 Tag');
  await wait(`!!${panel}`);
  await check(
    '关闭动效时浮层和悬停没有过渡',
    `${panel}.getAnimations().length===0&&getComputedStyle(${panel}).transitionDuration==='0s'&&getComputedStyle(document.querySelector('[aria-label=验收菜单]')).transitionDuration==='0s'`,
  );
  await close();
  await e(`${first}.scrollIntoView({block:'center'})`);
  await e(frame);
  await e(`${first}.focus()`);
  await wait(`!!${tip}`);
  await check(
    '关闭动效时提示直接显示且没有动画',
    `${tip}.getAnimations().length===0&&getComputedStyle(${tip}).opacity==='1'`,
  );
  await e(`${first}.blur()`);
  await click('验收菜单');
  await wait(`!!${menu}`);
  await hover(`${menu}.querySelector('[aria-haspopup=menu]')`);
  await wait('document.querySelectorAll(".nps-menu:popover-open").length===2');
  await check(
    '关闭动效时菜单及子菜单直接显示',
    '[...document.querySelectorAll(".nps-menu:popover-open")].every(n=>n.getAnimations().length===0&&getComputedStyle(n).opacity==="1")',
  );
  await close();
  await click('关闭已修改的标签？');
  await wait('!!document.querySelector("dialog[open]")');
  await check(
    '关闭动效时对话框与遮罩没有动画',
    'document.querySelector("dialog[open]").getAnimations({subtree:true}).length===0&&getComputedStyle(document.querySelector("dialog[open]"),"::backdrop").transitionDuration==="0s"',
  );
  await h.nativeKey('Escape');
  await wait('!document.querySelector("dialog")');
  await h.window.loadURL(originalURL);
}
