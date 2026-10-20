import { BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
export async function clientChecks({ h, doubles, mode }) {
  h.category('客户端边界');
  const contents = h.window.webContents;
  await h.check(
    '整个窗口关闭拼写检查',
    () => contents.session.spellCheckerEnabled === false,
    () => contents.getLastWebPreferences(),
    'once',
  );

  await h.check(
    '非编辑区全选被阻止',
    `(()=>{
    const event=new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(event);
    return event.defaultPrevented;
  })()`,
    undefined,
    'once',
  );
  if (mode.packaged) {
    contents.openDevTools();
    await h.check(
      '正式版禁用开发者工具且缩放为一倍',
      () => !contents.isDevToolsOpened() && contents.getZoomFactor() === 1,
      undefined,
      'once',
    );
    const flatten = (items) =>
      items.flatMap((item) => [item, ...flatten(item.submenu?.items || [])]);
    const items = Menu.getApplicationMenu()?.items || [];
    await h.check(
      '正式应用菜单没有浏览器角色',
      () =>
        !flatten(items).some((item) =>
          ['reload', 'forcereload', 'toggledevtools', 'zoomin', 'zoomout', 'resetzoom'].includes(
            item.role?.toLowerCase(),
          ),
        ),
      undefined,
      'once',
    );
    if (process.platform === 'darwin')
      await h.check(
        'macOS 自有菜单和设置快捷键',
        () =>
          items.map((item) => item.label).join('|') === 'NovelAI Prompt Studio|编辑|窗口|帮助' &&
          items[0].submenu.items.find((item) => item.label === '设置…')?.accelerator ===
            'Command+,',
        undefined,
        'once',
      );
    return;
  }
  const url = contents.getURL(),
    count = BrowserWindow.getAllWindows().length;
  await h.evaluate(
    `(()=>{const a=document.createElement('a');a.id='client-link-probe';a.href='https://example.test/client';a.textContent='外部链接';a.style.cssText='position:fixed;top:100px;left:100px;z-index:9999';document.body.append(a)})()`,
  );
  for (const gesture of ['左键', '中键', '回车']) {
    const before = doubles.calls.filter((call) => call.kind === 'openExternal').length;
    if (gesture === '左键')
      await h.evaluate(`document.querySelector('#client-link-probe').click()`);
    else if (gesture === '回车') {
      await h.evaluate(`document.querySelector('#client-link-probe').focus()`);
      await h.nativeKey('Enter');
    } else {
      const rect = await h.evaluate(
        `(()=>{const r=document.querySelector('#client-link-probe').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
      );
      for (const type of ['mousePressed', 'mouseReleased'])
        await contents.debugger.sendCommand('Input.dispatchMouseEvent', {
          type,
          ...rect,
          button: 'middle',
          clickCount: 1,
        });
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await h.check(
      `外部链接${gesture}只调用一次系统浏览器，原窗口不跳转`,
      () =>
        doubles.calls.filter((call) => call.kind === 'openExternal').length === before + 1 &&
        contents.getURL() === url &&
        BrowserWindow.getAllWindows().length === count,
      undefined,
      'once',
    );
  }
  await h.evaluate(`document.querySelector('#client-link-probe').remove()`);
  await h.click('工作台', 'document.querySelector(".tb")');
  const fixtures = await createWorkbenchFixtures(path.join(mode.root, 'client-fixtures'));
  doubles.selections.push({ canceled: false, filePaths: [fixtures[0]] });
  await h.click('打开图片', 'document.querySelector(".tb")');
  await h.wait('!!document.querySelector(".prose")');

  await h.check(
    '图片与图标禁止原生拖动，文字和网址落下时阻止默认插入',
    `(()=>{
    const img=document.querySelector('.stage .canvas img'),svg=document.querySelector('svg');
    const drag=[img,svg].every(n=>{const e=new DragEvent('dragstart',{bubbles:true,cancelable:true});n.dispatchEvent(e);return e.defaultPrevented&&getComputedStyle(n).webkitUserDrag==='none'});
    const transfer=new DataTransfer();transfer.setData('text/plain','https://example.test/drop');transfer.setData('text/uri-list','https://example.test/drop');
    const drop=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer});document.body.dispatchEvent(drop);return drag&&drop.defaultPrevented;
  })()`,
    undefined,
    'once',
  );
  await h.evaluate(
    `(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('.prose'));getSelection().removeAllRanges();getSelection().addRange(r)})()`,
  );
  await h.screenshot('client-prompt-selection');
  await h.evaluate('getSelection().removeAllRanges()');
  await h.key('w', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
  await h.wait('!document.querySelector(".tabs [data-tab]")');
  await h.section('关于与更新');
  await h.screenshot('client-content-selection');
}
