import fs from 'node:fs/promises';
import path from 'node:path';

export function harness(window, mode, checks) {
  let category = '启动';
  let operation = '启动渲染器';
  let lastPassed = '无';
  let diagnosticIndex = 0;
  const scale = mode.slow || 1;
  const waitBudget = mode.fullLibraryBenchmark ? 180000 : Math.min(12000 * scale, 60000);
  const evaluationBudget = mode.fullLibraryBenchmark ? 180000 : Math.min(15000 * scale, 60000);
  const settleBudget = Math.min(1000 * scale, 6000);
  const bounded = async (promise, ms, label) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error(label)), ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const diagnostics = async (reason) => {
    if (!mode.output) return;
    const name = 'timeout-' + mode.phase + '-' + ++diagnosticIndex;
    const evidence = { category, lastPassed, operation, reason };
    // Only roles and control labels from the isolated fixture. Never input values,
    // image contents, paragraphs, passwords or full body text.
    const structure = `(() => [...document.querySelectorAll('.tb button,.workbench-header-actions button,[data-pop] [role],[role=dialog]:not(.leaving *) button,.set-side button,.detail .bar button')].slice(0,100).map(e=>({role:e.getAttribute('role')||e.tagName.toLowerCase(),name:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,80),visible:!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden',disabled:e.matches(':disabled')||e.getAttribute('aria-disabled')==='true'})))()`;
    try {
      evidence.structure = await bounded(
        window.webContents.executeJavaScript(structure, true),
        3000,
        '结构读取超时',
      );
    } catch (error) {
      evidence.structureError = String(error);
    }
    try {
      await capture(name);
      evidence.screenshot = name + '.png';
    } catch (error) {
      evidence.screenshotError = String(error);
    }
    await fs.writeFile(path.join(mode.output, name + '.json'), JSON.stringify(evidence, null, 2));
  };
  const failTimeout = async (kind, started, budget, label) => {
    operation = label;
    const reason =
      kind +
      '：[' +
      category +
      '] 上一条通过：' +
      lastPassed +
      '；操作：' +
      label +
      '；已等待 ' +
      (Date.now() - started) +
      ' ms（上限 ' +
      budget +
      ' ms）';
    await diagnostics(reason);
    throw Error(reason);
  };
  const evaluate = async (code, label = operation, timeoutMs = evaluationBudget) => {
    const started = Date.now();
    const budget = Math.min(timeoutMs, evaluationBudget);
    try {
      return await bounded(
        window.webContents.executeJavaScript(code, true),
        budget,
        'Renderer evaluation timeout',
      );
    } catch (error) {
      if (error.message === 'Renderer evaluation timeout')
        await failTimeout(error.message, started, budget, label + ' / ' + code.slice(0, 160));
      throw Error(error.message + '\n执行内容：' + code.slice(0, 1200));
    }
  };
  const wait = async (expression, label = expression, timeoutMs = waitBudget) => {
    operation = label;
    const started = Date.now();
    const budget = Math.min(timeoutMs, waitBudget);
    while (Date.now() - started < budget) {
      // This is one condition deadline, including the final renderer round trip.
      // Do not report its last few milliseconds as a fresh evaluation budget.
      const remaining = budget - (Date.now() - started);
      if (remaining <= 0) break;
      let passed;
      try {
        passed = await bounded(
          window.webContents.executeJavaScript(expression, true),
          remaining,
          'condition deadline',
        );
      } catch (error) {
        if (error.message === 'condition deadline') break;
        throw Error(error.message + '\n执行内容：' + expression.slice(0, 1200));
      }
      if (passed && Date.now() - started <= budget) return;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(40, Math.max(0, budget - (Date.now() - started)))),
      );
    }
    await failTimeout('等待超时', started, budget, label);
  };
  const until = async (predicate, label) => {
    operation = label;
    const started = Date.now();
    while (Date.now() - started < waitBudget) {
      try {
        const passed = await bounded(
          predicate(),
          waitBudget - (Date.now() - started),
          'predicate timeout',
        );
        if (passed && Date.now() - started <= waitBudget) return;
      } catch (error) {
        if (error.message === 'predicate timeout')
          await failTimeout('等待超时', started, waitBudget, label);
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(30, Math.max(0, waitBudget - (Date.now() - started)))),
      );
    }
    await failTimeout('等待超时', started, waitBudget, label);
  };
  const reload = async () => {
    operation = '等待页面重新加载完成';
    const started = Date.now();
    let loaded;
    const done = new Promise((resolve) => {
      loaded = resolve;
    });
    window.webContents.once('did-finish-load', loaded);
    try {
      window.webContents.reload();
      await bounded(done, waitBudget, 'reload timeout');
    } catch (error) {
      if (error.message === 'reload timeout')
        await failTimeout('等待超时', started, waitBudget, operation);
      throw error;
    } finally {
      window.webContents.removeListener('did-finish-load', loaded);
    }
  };
  let dualThemes = false;
  const withOtherTheme = async (run) => {
    const original = mode.themeDriver.get();
    try {
      const other = original === 'light' ? 'dark' : 'light';
      mode.themeDriver.set(other);
      await wait(
        `document.documentElement.dataset.theme===${JSON.stringify(other)}`,
        '切换外观断言主题 ' + other,
      );
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
      await run();
    } finally {
      mode.themeDriver.set(original);
      await wait(
        `document.documentElement.dataset.theme===${JSON.stringify(original)}`,
        '恢复外观断言主题 ' + original,
      );
    }
  };
  const checkOne = async (label, expression, failureDetails, themeScope = 'once') => {
    operation = label;
    const record = {
      category,
      label,
      status: 'failed',
      themeScope,
      ...(mode.themeDriver ? { theme: mode.themeDriver.get() } : {}),
    };
    checks.push(record);
    try {
      let result = typeof expression === 'string' ? await evaluate(expression) : await expression();
      // A page read gets up to a second to settle: re-read every frame until it
      // holds, so a transition still running does not fail a behaviour check.
      if (typeof expression === 'string') {
        const deadline = Date.now() + settleBudget;
        while (result !== true && Date.now() < deadline) {
          await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
          result = await evaluate(expression);
        }
      }
      if (result !== true) throw new Error(`断言值：${JSON.stringify(result)}`);
      record.status = 'passed';
      lastPassed = label;
      console.log(`PASS [${category}] ${label}`);
    } catch (error) {
      record.error = String(error);
      if (failureDetails !== undefined) {
        try {
          record.details =
            typeof failureDetails === 'string'
              ? await evaluate(failureDetails)
              : await failureDetails();
        } catch (detailsError) {
          record.details = { error: String(detailsError) };
        }
      }
      record.context = await evaluate('document.body.innerText.slice(-6000)').catch(
        () => 'renderer unavailable',
      );
      console.error(
        `FAIL [${category}] ${label}\n${record.error}${record.details === undefined ? '' : `\n失败说明：${JSON.stringify(record.details)}`}\n${record.context}`,
      );
    }
    // A process-level watchdog cannot run our finally block. Keep bounded-cost
    // partial evidence so a later hard exit does not hide preceding failures.
    if (mode.output && (checks.length % 25 === 0 || record.status === 'failed')) {
      const file = path.join(mode.output, `checks-progress-${mode.phase}.json`);
      await fs.writeFile(
        file + '.tmp',
        JSON.stringify({ checks, screenshots: mode.screenshots || [], category, lastPassed }),
      );
      await fs.rename(file + '.tmp', file);
    }
  };
  // Behaviour is checked once. Only checks that pass 'both' explicitly (colours,
  // tokens, contrast) are repeated under the other theme.
  const check = async (label, expression, failureDetails, themeScope = 'once') => {
    await checkOne(label, expression, failureDetails, themeScope);
    if (dualThemes && themeScope === 'both')
      await withOtherTheme(() => checkOne(label, expression, failureDetails, themeScope));
  };
  // Compatibility signature for existing flows; only the final state gates acceptance.
  const checkSoon = async (
    label,
    expression,
    _deadline,
    action = '',
    failureDetails,
    themeScope = 'once',
  ) => {
    if (action) await evaluate(action);
    await checkOne(
      label,
      async () => {
        if (typeof expression === 'string') await wait(expression, label);
        else await until(expression, label);
        return typeof expression === 'string' ? evaluate(expression) : expression();
      },
      failureDetails,
      themeScope,
    );
    if (dualThemes && themeScope === 'both')
      await withOtherTheme(() => checkOne(label, expression, failureDetails, themeScope));
  };
  const paint = () =>
    evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const click = async (text, scope = 'document', index = 0) => {
    console.log(`操作：点击 ${text}`);
    // Find and act in one renderer turn: a temporary control can disappear
    // between separate wait/evaluate calls (for example Cancel during import).
    await wait(
      `(() => { const e = [...(${scope})?.querySelectorAll('button,[role=button],[role=radio],[role=menuitem],[role=switch],[role=checkbox],[role=option]') || []].filter(e => e.getClientRects().length && !e.closest('[inert], [aria-hidden="true"], .leaving') && !e.matches(':disabled') && e.getAttribute('aria-disabled') !== 'true' && ((()=>{const n=e.cloneNode(true);n.querySelectorAll('.k,.submenu,.n,.cnt').forEach(x=>x.remove());return n.textContent.trim()})() === ${JSON.stringify(text)} || e.getAttribute('aria-label') === ${JSON.stringify(text)}))[${index}]; if(!e) return false; e.focus(); e.click(); return true; })()`,
      '等待并点击可操作按钮：' + text,
    );
    await paint();
  };
  const input = async (selector, value) => {
    await wait(
      `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e || !e.getClientRects().length || e.disabled || e.readOnly) return false; e.focus(); Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
      '等待并输入 ' + selector,
    );
    await paint();
  };
  const key = async (key, options = {}, target = 'document.activeElement') => {
    const allowed = await evaluate(
      `${target}.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, bubbles: true, cancelable: true, ...options })}))`,
    );
    await paint();
    return allowed;
  };
  // Chromium default actions (Tab navigation / dialog cancel), never OS input.
  const nativeKey = async (key, modifiers = 0) => {
    const windowsVirtualKeyCode = { Tab: 9, Escape: 27, Enter: 13, ' ': 32 }[key];
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: key,
      text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined,
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
    const group =
      'document.querySelector(' +
      JSON.stringify('[role="radiogroup"][aria-label="' + label + '"]') +
      ')';
    if (await evaluate('!!' + group)) {
      await click(text, group);
      await wait(`${group}?.dataset.navigationPending!=='true'`, `${label} 的选择已提交`);
      return;
    }
    await click(label);
    await wait('!!document.querySelector(".menu:not(.leaving) [role=menuitem]")');
    await evaluate(
      `(() => {const e=[...document.querySelectorAll('.menu:not(.leaving) [role=menuitem]')].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!e)throw Error('缺少选项');e.click()})()`,
    );
  };
  const section = async (name) => {
    await click('设置');
    await wait('!!document.querySelector(".set-side")');
    await click(name, 'document.querySelector(".set-side")');
    await wait(
      `(()=>{const selected=[...document.querySelectorAll('.set-side [aria-current=page]')].find(e=>e.textContent.trim()===${JSON.stringify(name)});return !!selected&&document.querySelector('[data-settings-section="'+selected.dataset.settingsTarget+'"]:not(.leaving)')?.getClientRects().length>0})()`,
    );
  };
  const capture = async (name) => {
    const { data } = await bounded(
      window.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png' }),
      Math.min(5000 * scale, 30000),
      '截图超时',
    );
    await fs.writeFile(path.join(mode.output, `${name}.png`), Buffer.from(data, 'base64'));
    mode.screenshots.push({ file: `${name}.png`, category });
  };
  const screenshot = async (name) => {
    if (!dualThemes) return capture(name);
    await capture(name + '-' + mode.themeDriver.get());
    await withOtherTheme(() => capture(name + '-' + mode.themeDriver.get()));
  };
  const fontOne = async (selector, family) => {
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
    await checkOne(`实际绘制字体 ${family}（${selector}）`, () =>
      fonts.some((f) => f.isCustomFont && f.glyphCount > 0 && f.familyName.includes(family)),
    );
  };
  // Fonts do not depend on the theme.
  const font = (selector, family) => fontOne(selector, family);
  return {
    window,
    dualThemes: (enabled) => {
      dualThemes = enabled && !!mode.themeDriver;
    },
    evaluate,
    reload,
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
    uncovered: (label, reason) =>
      checks.push({ category, label, status: 'uncovered', reason, themeScope: 'once' }),
  };
}
