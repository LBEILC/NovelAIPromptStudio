import { TOOLTIP_SCROLL_CLOSE_MS } from './feedback.js';
import { settleLayout } from './layout.js';
// Supplementary checks converted from the archived 004/004a verification lists.
export async function componentDetails(h) {
  const { evaluate: e, wait, check, key, click, input } = h;
  await check(
    '加载圆环位于文字前且文字未裁切',
    `[...document.querySelectorAll('.nps-button[aria-busy=true]')].every(button=>{const icon=button.querySelector('.nps-loader').getBoundingClientRect(),text=button.querySelector('.nps-button-label').getBoundingClientRect(),box=button.getBoundingClientRect();return icon.right<=text.left && text.right<=box.right && text.width>0})`,
    undefined,
    'both',
  );
  await check(
    '不可用按钮可聚焦但点击不执行',
    `(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='不可用');button.focus();return document.activeElement===button && !button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))})()`,
    undefined,
    'once',
  );
  await check(
    '加载按钮阻止点击',
    `!document.querySelector('.nps-button[aria-busy=true]').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))`,
    undefined,
    'once',
  );
  await click('采样器');
  await key('End');
  await key('Enter');
  await h.checkSoon(
    '下拉 End 和 Enter 选择最后一项',
    'document.querySelector("button[aria-label=采样器]").textContent.includes("DPM++ 2M")',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await click('采样器');
  await key('Home');
  await key('e');
  await key('Enter');
  await h.checkSoon(
    '下拉首字母跳转选择 Euler',
    'document.querySelector("button[aria-label=采样器]").textContent.trim()==="Euler"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await click('采样器');
  await key('End');
  await key('Escape');
  await h.checkSoon(
    '下拉 Esc 不提交高亮且焦点归还',
    'document.activeElement.matches("button[aria-label=采样器]") && document.activeElement.textContent.trim()==="Euler"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await e('document.querySelector("[role=radiogroup] [aria-checked=true]").focus()');
  await key('Home');
  await key('ArrowRight');
  await h.checkSoon(
    '选项组方向键选中相邻项且只有一个 Tab 停靠点',
    '[...document.querySelectorAll("[role=radio]")].filter(e=>e.tabIndex===0).length===1 && document.activeElement.textContent.trim()==="译文" && document.activeElement.getAttribute("aria-checked")==="true"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await e('document.querySelector("[role=tab][aria-selected=true]").focus()');
  await key('ArrowRight');
  await h.nativeKey('Tab');
  await h.checkSoon(
    '页签方向键切换后 Tab 进入对应面板',
    'document.activeElement.matches("[role=tabpanel]:not([hidden])") && document.querySelector("[role=tab][aria-selected=true]").textContent==="参数"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  for (const role of ['switch', 'checkbox']) {
    await e(`document.querySelector('[role=${role}]:not(:disabled)').focus()`);
    const old = await e('document.activeElement.getAttribute("aria-checked")');
    await h.nativeKey(' ');
    await h.checkSoon(
      `${role} Space 切换`,
      `document.activeElement.getAttribute('aria-checked')!==${JSON.stringify(old)}`,
      undefined,
      undefined,
      undefined,
      'once',
    );
    await check(
      `${role} 禁用状态不响应点击`,
      `(()=>{const button=document.querySelector('[role=${role}]:disabled'),value=button.getAttribute('aria-checked');button.click();return button.getAttribute('aria-checked')===value})()`,
      undefined,
      'once',
    );
  }
  await input('[role=spinbutton]', '99');
  await key('Enter');
  await h.checkSoon(
    '步进器越界输入提交后限制到最大值',
    'document.querySelector("[role=spinbutton]").value==="5.00" && document.querySelector("[role=spinbutton]").getAttribute("aria-valuenow")==="5"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await key('ArrowDown');
  await h.checkSoon(
    '步进器下方向键按步长减小',
    'document.querySelector("[role=spinbutton]").value==="4.95"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await click('减少权重');
  await h.checkSoon(
    '步进器减号按钮更新值',
    'document.querySelector("[role=spinbutton]").value==="4.90"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await click('增加权重');
  await h.checkSoon(
    '步进器加号按钮更新值',
    'document.querySelector("[role=spinbutton]").value==="4.95"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await click('右键菜单');
  await key('End');
  await key('ArrowUp');
  await h.checkSoon(
    '菜单键盘跳过不可用项',
    'document.activeElement.textContent.trim()==="翻译并分类"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await key('ArrowUp');
  await key('ArrowRight');
  await h.checkSoon(
    '菜单右方向键进入子菜单',
    'document.activeElement.textContent.trim()==="提示词" && document.querySelectorAll(".nps-layer:popover-open [role=menu]").length>=2',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await key('ArrowLeft');
  await h.checkSoon(
    '菜单左方向键返回父菜单',
    'document.activeElement.textContent.trim()==="移动到"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await key('Tab');
  await h.checkSoon(
    '菜单 Tab 关闭并归还焦点',
    'document.activeElement.textContent.trim()==="右键菜单" && !document.querySelector(".nps-layer:popover-open [role=menu]")',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await e('document.querySelector(".nps-menu-trigger[tabindex]").focus()');
  await key('F10', { shiftKey: true });
  await h.checkSoon(
    'Shift+F10 打开 Tag 右键菜单',
    '!!document.querySelector(".nps-layer:popover-open [role=menu]")',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await key('Escape');
  await e(
    `document.querySelector('.nps-menu-trigger[tabindex]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:innerWidth-2,clientY:innerHeight-2}))`,
  );
  await wait('!!document.querySelector(".nps-layer:popover-open [role=menu]")');
  await wait('!document.querySelector(".nps-layer:popover-open[data-entering]")');
  await e(
    'Promise.allSettled([...document.querySelectorAll(".nps-layer:popover-open")].flatMap(n=>n.getAnimations().map(a=>a.finished))).then(()=>undefined)',
  );
  await check(
    '右下边缘的右键菜单限制在视口内',
    `(()=>{const r=document.querySelector('.nps-layer:popover-open:not(.nps-tip)').getBoundingClientRect();return r.x>=0 && r.y>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1})()`,
    undefined,
    'both',
  );
  await key('Home');
  for (let i = 0; i < 4; i++) await key('ArrowDown');
  await key('ArrowRight');
  await h.checkSoon(
    '边缘子菜单翻转或限制在视口内',
    `[...document.querySelectorAll('.nps-layer:popover-open:not(.nps-tip)')].length===2 && [...document.querySelectorAll('.nps-layer:popover-open:not(.nps-tip)')].every(node=>{const r=node.getBoundingClientRect();return r.x>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1})`,
    undefined,
    undefined,
    undefined,
    'both',
  );
  await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 1,
    y: 1,
    button: 'left',
    clickCount: 1,
  });
  await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 1,
    y: 1,
    button: 'left',
    clickCount: 1,
  });
  await wait('!document.querySelector(".nps-layer:popover-open [role=menu]")');
  await check(
    '点击外部关闭整组菜单',
    '!document.querySelector(".nps-layer:popover-open [role=menu]")',
    undefined,
    'once',
  );
  await e(
    `(()=>{document.querySelector('[aria-label="右键菜单"]').focus();[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='编辑一个 Tag').click()})()`,
  );
  await wait('!!document.querySelector(".nps-layer[role=dialog]")');
  await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 1,
    y: 1,
    button: 'left',
    clickCount: 1,
  });
  await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 1,
    y: 1,
    button: 'left',
    clickCount: 1,
  });
  await check(
    '编辑浮层关闭归还自身触发器而非打开前的旧焦点',
    `document.activeElement.textContent.trim()==='编辑一个 Tag' && !document.querySelector('.nps-layer[role=dialog]')`,
    'document.activeElement.outerHTML.slice(0,400)',
    'once',
  );
  await click('编辑一个 Tag');
  const popoverHasMotion = await e('document.documentElement.dataset.motion === "full"');
  await h.nativeKey('Tab', 8);
  await h.checkSoon(
    '编辑浮层 Shift+Tab 保持焦点在内部',
    'document.querySelector(".nps-layer[role=dialog]").contains(document.activeElement)',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 1,
    y: 1,
    button: 'left',
    clickCount: 1,
  });
  await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 1,
    y: 1,
    button: 'left',
    clickCount: 1,
  });
  await wait('!document.querySelector(".nps-layer[role=dialog]")');
  await h.checkSoon(
    '编辑浮层外部点击关闭并归还焦点',
    `document.activeElement.textContent.trim()==="编辑一个 Tag" && !document.querySelector('.nps-layer.nps-popover:popover-open') && (${popoverHasMotion} || !document.querySelector('.nps-layer.nps-popover'))`,
    undefined,
    undefined,
    `({active:document.activeElement.outerHTML.slice(0,400),layers:[...document.querySelectorAll('.nps-layer.nps-popover')].map(node=>({html:node.outerHTML.slice(0,200),animations:node.getAnimations().length}))})`,
    'once',
  );
  await click('关闭已修改的标签页？');
  await h.checkSoon(
    '破坏性对话框默认焦点为取消',
    'document.activeElement.textContent.trim()==="取消"',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await e('document.querySelector("dialog .nps-actions button:last-child").focus()');
  await h.nativeKey('Enter');
  await check(
    '破坏性确认阻止 Enter 误触',
    '!!document.querySelector("dialog[open]")',
    undefined,
    'once',
  );
  await h.nativeKey(' ');
  await wait('!document.querySelector("dialog[open]")');
  await check(
    'Space 明确确认可关闭对话框',
    '!document.querySelector("dialog[open]")',
    undefined,
    'once',
  );
  await check(
    '进度及通知风险横幅提供可访问语义',
    'document.querySelector("[role=progressbar]").getAttribute("aria-valuenow")==="38" && document.querySelector(".nps-notifications").getAttribute("aria-live")==="polite" && document.querySelectorAll(".nps-banner[role=alert]").length===2',
    undefined,
    'once',
  );
  // Focusing an offscreen control also scrolls the document, which intentionally
  // dismisses tooltips. Finish that scroll before measuring keyboard focus.
  await e(
    `(async()=>{const button=[...document.querySelectorAll('button[data-tip]')].find(button=>button.textContent.trim()==='复制提示词');button.scrollIntoView({block:'nearest',behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));button.focus({preventScroll:true})})()`,
  );
  await wait(
    'document.querySelector(".nps-layer[role=tooltip]")?.textContent.includes("复制当前筛选")',
  );
  await check(
    '提示在键盘聚焦后出现',
    'document.querySelector(".nps-layer[role=tooltip]").textContent.includes("复制当前筛选")',
    undefined,
    'once',
  );
  await h.checkSoon(
    '滚动立即关闭提示',
    '!document.querySelector(".nps-layer[role=tooltip]")',
    TOOLTIP_SCROLL_CLOSE_MS,
    "window.dispatchEvent(new Event('scroll'));",
    undefined,
    'once',
  );
  await settleLayout(h, '.nps-demo-selection');
  const before = await e(
    'document.querySelector(".nps-demo-selection").getBoundingClientRect().height',
  );
  await click('取消', 'document.querySelector(".nps-demo-selection")');
  await h.checkSoon(
    '取消多选条不推动布局',
    `document.querySelector('.nps-demo-selection').getBoundingClientRect().height===${before} && !document.querySelector('.nps-demo-selection').innerText.includes('已选 3 个 Tag')`,
    undefined,
    undefined,
    undefined,
    'both',
  );
}
