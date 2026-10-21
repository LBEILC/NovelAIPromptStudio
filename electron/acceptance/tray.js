export async function trayChecks({ h, app, preferences, trayController }) {
  if (process.platform !== 'win32') return;
  h.category('外壳·托盘');
  h.dualThemes(false);
  const window = h.window;
  const { menu, tray } = trayController;
  const original = preferences.productivitySettings().closeAction;
  const check = (label, predicate) => h.check(label, predicate, undefined, 'once');
  const dialog = '[role="dialog"][aria-label="关闭窗口"]';
  try {
    await h.evaluate(
      `window.__closeRequests = 0; window.__stopCloseWatch = window.studio.onCommandEvent(e => { if(e.type === 'close-request') window.__closeRequests++; }); void 0;`,
    );
    await h.evaluate(
      `window.studio.invoke('settings.productivity.save', { settings: { closeAction: 'ask' } })`,
    );
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    await h.until(() => window.isVisible(), '主窗口显示完成');
    window.close();
    await h.wait(`!!document.querySelector('${dialog}')`);
    await check(
      'ask 关闭发事件、显示弹框且主窗口仍存在',
      async () =>
        !window.isDestroyed() &&
        window.isVisible() &&
        (await h.evaluate('window.__closeRequests === 1')),
    );
    // Capture the settled dialog, without asserting animation timing or styling.
    await h.evaluate(
      `Promise.all(document.querySelector('${dialog}').parentElement.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))).then(()=>undefined)`,
    );
    await h.screenshot('tray-close-ask');
    await h.evaluate(`document.querySelector('${dialog} [role="checkbox"]').click()`);
    await h.evaluate(
      `[...document.querySelectorAll('${dialog} button')].find(b => b.textContent === '最小化到托盘').click()`,
    );
    await h.until(() => !window.isVisible(), '保存后隐藏主窗口');
    await check(
      '选择托盘并记住后窗口隐藏、托盘存在、偏好已保存',
      () =>
        !window.isVisible() &&
        !tray.isDestroyed() &&
        preferences.productivitySettings().closeAction === 'tray',
    );
    tray.emit('click');
    await h.until(() => window.isVisible(), '托盘左键显示');
    await check('托盘左键恢复隐藏窗口', () => window.isVisible());
    window.close();
    await h.until(() => !window.isVisible(), '记住选择后再次隐藏');
    await check('记住 tray 后再次关闭不发询问事件', 'window.__closeRequests === 1');
    app.emit('second-instance', {}, [], '');
    await h.until(() => window.isVisible(), '再次启动显示');
    await check('再次启动恢复隐藏窗口', () => window.isVisible());
    window.minimize();
    tray.emit('click');
    await h.until(() => !window.isMinimized(), '托盘还原最小化窗口');
    await check('托盘左键还原最小化窗口', () => !window.isMinimized());
    await h.until(() => !menu.webContents.isLoading(), '托盘菜单加载完成');
    const invoke = (name, input = {}) =>
      menu.webContents.executeJavaScript(
        `window.studio.invoke(${JSON.stringify(name)}, ${JSON.stringify(input)})`,
      );
    for (const name of ['account.get', 'settings.appearance.get'])
      await check('托盘允许 ' + name, async () => (await invoke(name)).ok);
    for (const [name, input] of [
      ['library.list', {}],
      ['workbench.session', {}],
      ['settings.productivity.save', { settings: { closeAction: 'quit' } }],
      ['window.close-choice', { action: 'quit', remember: true }],
      ['updates.install', {}],
      ['unknown.command', {}],
    ])
      await check('托盘拒绝 ' + name, async () => {
        const result = await invoke(name, input);
        return !result.ok && result.error.code === 'forbidden';
      });
    await check(
      '托盘允许尺寸报告',
      async () => (await invoke('tray.menu-size', { width: 260, height: 180 })).ok,
    );
    await menu.webContents.executeJavaScript(
      `window.__trayEvents=[];window.studio.onCommandEvent(e=>window.__trayEvents.push(e.type)); void 0;`,
    );
    tray.emit('right-click');
    await h.until(() => menu.isVisible(), '右键菜单显示');
    await check(
      '每次打开托盘菜单发送重置事件',
      async () =>
        await menu.webContents.executeJavaScript(`window.__trayEvents.includes('tray-menu-open')`),
    );
    await check(
      '托盘允许关闭菜单',
      async () => (await invoke('tray.action', { action: 'close' })).ok && !menu.isVisible(),
    );
    tray.emit('right-click');
    await h.until(() => menu.isVisible(), '再次打开菜单');
    menu.emit('blur');
    await check('菜单失焦后隐藏', () => !menu.isVisible());
    window.hide();
    await invoke('tray.action', { action: 'show' });
    await check('菜单打开主窗口并隐藏菜单', () => window.isVisible() && !menu.isVisible());
    await check(
      '托盘权限拒绝未改变关闭偏好',
      () => preferences.productivitySettings().closeAction === 'tray',
    );
  } finally {
    preferences.saveProductivitySettings({ closeAction: original });
    await h.evaluate('window.__stopCloseWatch?.(); void 0;');
    window.hide();
  }
}
