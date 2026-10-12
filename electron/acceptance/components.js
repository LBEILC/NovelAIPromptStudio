import path from 'node:path';
import { componentDetails } from './componentDetails.js';
import { buttonStateChecks } from './buttonStates.js';

export async function componentChecks({ h, mode }) {
  const { evaluate: e, wait, check, click, key } = h;
  for (const theme of [mode.theme]) {
    h.category(`基础组件·${theme}`);
    await h.window.loadFile(path.join(mode.root, 'showcase', 'ui-showcase.html'), {
      query: { theme: 'system', motion: mode.motion || 'system' },
    });
    await wait('!!document.querySelector("[data-showcase]")');
    const slider = 'input[type=range]';
    await e(`document.querySelector('${slider}').focus()`);
    for (const [name, options, value] of [
      ['ArrowRight', {}, '0.63'],
      ['Home', {}, '0'],
      ['ArrowRight', { shiftKey: true }, '0.1'],
      ['End', {}, '1'],
      ['ArrowRight', {}, '1'],
    ]) {
      await key(name, options);
      await h.checkSoon(
        `滑块 ${options.shiftKey ? 'Shift+' : ''}${name} 数值及 ARIA 为 ${value}`,
        `document.querySelector('${slider}').value==='${value}' && document.querySelector('${slider}').getAttribute('aria-valuetext')===Number('${value}').toFixed(2)`,
        undefined,
        undefined,
        undefined,
        'once',
      );
    }
    // Dispatch through Chromium's page input pipeline to obtain real pointer capture.
    const pointer = async (selector, ratio) => {
      await e(
        `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
      );
      await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const rect = await e(
        `(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`,
      );
      const cdp = h.window.webContents.debugger;
      const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      console.log(
        'Pointer target',
        selector,
        rect,
        await e(`document.elementFromPoint(${start.x},${start.y})?.outerHTML.slice(0,300)`),
      );
      await cdp.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
      await cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...start,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      await e('new Promise(resolve=>requestAnimationFrame(resolve))');
      await cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: rect.x + rect.width * ratio,
        y: start.y,
        button: 'left',
        buttons: 1,
      });
      await e('new Promise(resolve=>requestAnimationFrame(resolve))');
      await cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: rect.x + rect.width * ratio,
        y: start.y,
        button: 'left',
        clickCount: 1,
      });
    };
    await pointer(slider, 0);
    await h.checkSoon(
      '滑块指针拖到左端为零',
      `document.querySelector('${slider}').value==='0'`,
      undefined,
      undefined,
      undefined,
      'once',
    );
    await pointer(slider, 1);
    await h.checkSoon(
      '滑块指针拖到右端为一',
      `document.querySelector('${slider}').value==='1'`,
      undefined,
      undefined,
      undefined,
      'once',
    );
    await pointer(slider, 0.5);
    await h.checkSoon(
      '点击滑块轨道更新数值',
      `Math.abs(Number(document.querySelector('${slider}').value)-.5)<.03`,
      undefined,
      undefined,
      undefined,
      'once',
    );
    await e('document.querySelector("[role=separator]").focus()');
    for (const [name, options, value] of [
      ['ArrowRight', {}, '356'],
      ['ArrowRight', { shiftKey: true }, '420'],
      ['ArrowLeft', {}, '404'],
      ['Home', {}, '196'],
      ['End', {}, '520'],
    ]) {
      await key(name, options);
      await h.checkSoon(
        `面板 ${options.shiftKey ? 'Shift+' : ''}${name} 宽度 ${value}`,
        `document.querySelector('[role=separator]').getAttribute('aria-valuenow')==='${value}'`,
        undefined,
        undefined,
        undefined,
        'both',
      );
    }
    await e(
      'document.querySelector("[role=separator]").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))',
    );
    await h.checkSoon(
      '面板双击恢复默认宽度',
      'document.querySelector("[role=separator]").getAttribute("aria-valuenow")==="340"',
      undefined,
      undefined,
      undefined,
      'both',
    );
    await pointer('[role=separator]', 20);
    await h.checkSoon(
      '面板指针拖动改变宽度',
      'Number(document.querySelector("[role=separator]").getAttribute("aria-valuenow"))>340',
      undefined,
      undefined,
      undefined,
      'both',
    );
    for (const [label, selector] of [
      ['右键菜单', '.nps-layer [role=menu]'],
      ['编辑一个 Tag', '.nps-layer[role=dialog]'],
      ['关闭已修改的标签页？', 'dialog[open]'],
    ]) {
      await click(label);
      await wait(`!!document.querySelector('${selector}')`);
      await check(
        `${label}打开焦点进入`,
        `document.querySelector('${selector}').contains(document.activeElement)`,
        undefined,
        'once',
      );
      if (label !== '右键菜单') {
        await e(
          `(() => {const nodes=document.querySelector('${selector}').querySelectorAll('button,input,textarea,[tabindex="0"]');nodes[nodes.length-1].focus()})()`,
        );
        await h.nativeKey('Tab');
        await check(
          `${label} Tab 焦点循环`,
          `document.querySelector('${selector}').contains(document.activeElement)`,
          undefined,
          'once',
        );
      }
      if (label === '关闭已修改的标签页？') {
        await e(
          'document.querySelector(".studio-titlebar button, .nps-demo-sheet button").focus()',
        );
        await check(
          '模态对话框阻止背景获取焦点',
          'document.querySelector("dialog").contains(document.activeElement)',
          undefined,
          'once',
        );
      }
      await h.nativeKey('Escape');
      await wait(`!document.querySelector('${selector}')`);
      await check(
        `${label} Esc 关闭归还焦点`,
        `document.activeElement.textContent.trim()===${JSON.stringify(label)}`,
        undefined,
        'once',
      );
    }
    await e('document.querySelector("input[role=combobox]").focus()');
    await e(
      `document.activeElement.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'铜'}))`,
    );
    await key('Enter', { isComposing: true });
    await check(
      '输入法候选 Enter 不采用补全',
      'document.querySelector("input[role=combobox]").value==="铜色"',
      undefined,
      'once',
    );
    await e(
      `document.activeElement.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'铜色'}))`,
    );
    await key('ArrowDown');
    await key('Enter');
    await h.checkSoon(
      '组合输入结束后 Enter 采用补全',
      'document.querySelector("input[role=combobox]").value.includes("copper")',
      undefined,
      undefined,
      undefined,
      'once',
    );
    await click('复制提示词', 'document', 1);
    await wait('!!document.querySelector(".nps-notifications .nps-toast")');
    await click(
      '删除',
      '[...document.querySelectorAll("section")].find(node=>node.textContent.includes("可以实际操作的示例"))',
    );
    await h.checkSoon(
      '连续通知立即显示后一条且只有一条',
      'document.querySelectorAll(".nps-notifications .nps-toast").length===1 && document.querySelector(".nps-notifications .nps-toast").textContent.includes("已移入回收站")',
      undefined,
      undefined,
      undefined,
      'once',
    );
    await e(
      `document.querySelector('.nps-notifications .nps-toast').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
    );
    await new Promise((resolve) => setTimeout(resolve, 4300));
    await check(
      '通知悬停超过寿命仍保留',
      '!!document.querySelector(".nps-notifications .nps-toast")',
      undefined,
      'once',
    );
    await e(
      `document.querySelector('.nps-notifications .nps-toast').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}))`,
    );
    await wait('!document.querySelector(".nps-notifications .nps-toast")');
    await check(
      '通知离开后消失',
      '!document.querySelector(".nps-notifications .nps-toast")',
      undefined,
      'once',
    );
    await componentDetails(h);
    await buttonStateChecks(h);
    await h.screenshot(`components-${theme}`);
    await h.window.loadFile(path.join(mode.root, 'showcase', 'ui-showcase.html'), {
      query: { theme: 'system', motion: 'off' },
    });
    await wait('!!document.querySelector("[data-showcase]")');
    await check(
      '关闭动效加载圆环静止',
      '[...document.querySelectorAll(".nps-loader")].length>0 && [...document.querySelectorAll(".nps-loader")].every(e=>getComputedStyle(e).animationName==="none")',
      undefined,
      'both',
    );
    await h.window.loadFile(path.join(mode.root, 'showcase', 'ui-showcase.html'), {
      query: { theme: 'system', motion: mode.motion || 'system', probe: 'long-select' },
    });
    await wait('!!document.querySelector("[data-long-select-probe]")');
    await click('长列表验收');
    await wait('!!document.querySelector(".nps-layer[role=listbox]:popover-open")');
    await wait(
      `[...document.querySelectorAll('.nps-layer[role=listbox]')].every(n=>n.getAnimations().every(a=>a.playState!=='running'))`,
    );
    await check(
      '长下拉列表不遮挡触发器',
      `(()=>{const t=document.querySelector('[aria-label="长列表验收"]'),r=t.getBoundingClientRect(),l=document.querySelector('.nps-layer[role=listbox]').getBoundingClientRect();return t.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) && (l.bottom<=r.top+1 || l.top>=r.bottom-1)})()`,
      `(()=>{const t=document.querySelector('[aria-label="长列表验收"]').getBoundingClientRect();return {trigger:t.toJSON(),layer:document.querySelector('.nps-layer[role=listbox]').getBoundingClientRect().toJSON(),hit:document.elementFromPoint(t.x+t.width/2,t.y+t.height/2)?.outerHTML}})()`,
      'both',
    );
    const longTrigger = await e(
      `(()=>{const r=document.querySelector('[aria-label="长列表验收"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    for (const type of ['mousePressed', 'mouseReleased'])
      await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
        type,
        ...longTrigger,
        button: 'left',
        clickCount: 1,
      });
    await check(
      '再次点击长列表触发器只关闭而不误选条目',
      `!document.querySelector('.nps-layer[role=listbox]') && document.querySelector('output').textContent==='0'`,
      `document.querySelector('output').textContent`,
      'once',
    );
    await click('长列表验收');
    await key('End');
    await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await check(
      '长列表滚动到末项后保持可见且不被重新定位拉回',
      `(()=>{const n=document.querySelector('.nps-layer[role=listbox]'),r=n.getBoundingClientRect(),last=[...n.querySelectorAll('[role=option]')].at(-1).getBoundingClientRect();return last.top>=r.top && last.bottom<=r.bottom+1})()`,
      undefined,
      'both',
    );
    await key('Enter');
    await check(
      '限制高度的长列表仍能选择最后一项',
      `document.querySelector('output').textContent==='99'`,
      undefined,
      'once',
    );
  }
}
