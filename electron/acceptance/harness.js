import fs from 'node:fs/promises';
import path from 'node:path';
import { UI_FEEDBACK_MS, waitForFeedback } from './feedback.js';

export function harness(window, mode, checks) {
  const evaluate = (code) =>
    Promise.race([
      window.webContents.executeJavaScript(code, true),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(Error(`Renderer evaluation timeout: ${code.slice(0, 400)}`)),
          15000,
        );
        timer.unref();
      }),
    ]).catch((error) => {
      throw Error(`${error.message}\n执行内容：${code.slice(0, 1200)}`);
    });
  const wait = async (expression, label = expression) => {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(`等待超时：[${category}] ${label}\n表达式：${expression}`);
  };
  const until = async (predicate, label) => {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw Error(`等待超时：${label}`);
  };
  let category = '启动';
  const check = async (label, expression) => {
    const record = { category, label, status: 'failed' };
    checks.push(record);
    try {
      const result =
        typeof expression === 'string' ? await evaluate(expression) : await expression();
      if (result !== true) throw new Error(`断言值：${JSON.stringify(result)}`);
      record.status = 'passed';
      console.log(`PASS [${category}] ${label}`);
    } catch (error) {
      record.error = String(error);
      record.context = await evaluate('document.body.innerText.slice(-6000)').catch(
        () => 'renderer unavailable',
      );
      console.error(`FAIL [${category}] ${label}\n${record.error}\n${record.context}`);
    }
  };
  const checkSoon = (label, expression, timeoutMs = UI_FEEDBACK_MS, action = '') =>
    check(label, () =>
      typeof expression === 'string'
        ? evaluate(
            `(${waitForFeedback.toString()})(()=>(${expression}),${timeoutMs},()=>{${action}})`,
          )
        : waitForFeedback(expression, timeoutMs),
    );
  const click = async (text, scope = 'document', index = 0) => {
    console.log(`操作：点击 ${text}`);
    await wait(
      `!![...(${scope})?.querySelectorAll('button') || []].filter(e => e.getClientRects().length && (e.textContent.trim() === ${JSON.stringify(text)} || e.getAttribute('aria-label') === ${JSON.stringify(text)}))[${index}]`,
    );
    await evaluate(
      `(() => { const e = [...${scope}.querySelectorAll('button')].filter(e => e.getClientRects().length && (e.textContent.trim() === ${JSON.stringify(text)} || e.getAttribute('aria-label') === ${JSON.stringify(text)}))[${index}]; if(!e) throw Error('找不到按钮：' + ${JSON.stringify(text)}); e.focus(); e.click(); })()`,
    );
  };
  const input = async (selector, value) => {
    await evaluate(
      `(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.focus(); Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
  };
  const key = (key, options = {}, target = 'document.activeElement') =>
    evaluate(
      `${target}.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, bubbles: true, cancelable: true, ...options })}))`,
    );
  // Chromium default actions (Tab navigation / dialog cancel), never OS input.
  const nativeKey = async (key, modifiers = 0) => {
    const windowsVirtualKeyCode = { Tab: 9, Escape: 27, Enter: 13, ' ': 32 }[key];
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: key,
      windowsVirtualKeyCode,
      modifiers,
    });
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: key,
      windowsVirtualKeyCode,
      modifiers,
    });
  };
  const select = async (label, text) => {
    await click(label);
    await wait('!!document.querySelector(".nps-layer [role=option]")');
    await evaluate(
      `(() => {const e=[...document.querySelectorAll('.nps-layer [role=option]')].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!e)throw Error('缺少选项');e.click()})()`,
    );
  };
  const section = async (name) => {
    await click('设置');
    await wait('!!document.querySelector(".settings-sidebar")');
    await click(name, 'document.querySelector(".settings-sidebar")');
    await wait(
      `!![...document.querySelectorAll('.settings-sidebar [aria-current=page]')].find(e=>e.textContent.trim()===${JSON.stringify(name)})`,
    );
  };
  const screenshot = async (name) => {
    const { data } = await Promise.race([
      window.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png' }),
      new Promise((_, reject) => setTimeout(() => reject(Error('截图超时')), 5000)),
    ]);
    await fs.writeFile(path.join(mode.output, `${name}.png`), Buffer.from(data, 'base64'));
    mode.screenshots.push({ file: `${name}.png`, category });
  };
  const font = async (selector, family) => {
    await evaluate(
      `(async()=>{document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()`,
    );
    const cdp = window.webContents.debugger;
    await cdp.sendCommand('DOM.enable');
    await cdp.sendCommand('CSS.enable');
    const { root } = await cdp.sendCommand('DOM.getDocument');
    const { nodeId } = await cdp.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    const { fonts } = await cdp.sendCommand('CSS.getPlatformFontsForNode', { nodeId });
    console.log(
      '字体证据',
      selector,
      JSON.stringify(fonts),
      await evaluate(
        `getComputedStyle(document.querySelector(${JSON.stringify(selector)})).fontFamily`,
      ),
    );
    await check(`实际绘制字体 ${family}（${selector}）`, () =>
      fonts.some((f) => f.isCustomFont && f.glyphCount > 0 && f.familyName.includes(family)),
    );
  };
  return {
    window,
    evaluate,
    wait,
    until,
    check,
    checkSoon,
    click,
    input,
    key,
    nativeKey,
    select,
    section,
    screenshot,
    font,
    category: (value) => {
      category = value;
    },
    uncovered: (label, reason) => checks.push({ category, label, status: 'uncovered', reason }),
  };
}
