import path from 'node:path';
import { hoverAudit } from './hoverAudit.js';
import { createWorkbenchFixtures } from './workbenchFixtures.js';

export async function hoverChecks(context) {
  const { h, mode, doubles } = context;
  const audit = (name) => hoverAudit(h, mode, name);
  await h.click('工作台', 'document.querySelector(".studio-titlebar")');
  await audit('工作台空状态');
  const files = await createWorkbenchFixtures(path.join(mode.root, 'hover-fixtures'));
  for (const file of files.slice(0, 2)) {
    doubles.selections.push({ canceled: false, filePaths: [file] });
    await h.click('打开图片', 'document.querySelector(".studio-titlebar")');
    await h.wait('!!document.querySelector(".wb-prose")');
  }
  await h.wait(
    'document.querySelectorAll(".wb-tab").length===2 && !!document.querySelector(".wb-prose")',
  );
  await audit('工作台内容');
  await h.check(
    '客户端指针：按钮和页签为箭头，输入框为文字光标，大图入口为放大镜',
    `(()=>{const pairs=[['.studio-titlebar button','default'],['.wb-tab','default'],['.wb-canvas img','zoom-in'],['.wb-prompt-head input','text'],['.nps-resizer','col-resize']];return pairs.every(([s,c])=>getComputedStyle(document.querySelector(s)).cursor===c)})()`,
  );
  await h.click('显示', 'document.querySelector(".wb-prompt-head")');
  await audit('工作台显示');
  await h.nativeKey('Escape');
  await h.evaluate(`document.querySelector('[aria-label="编辑段落"]').click()`);
  await audit('段落编辑');
  await h.click('取消', 'document.querySelector(".wb-paragraph-editor")');
  await h.evaluate(`document.querySelector('.wb-section-actions button').click()`);
  await audit('工作台菜单');
  await h.nativeKey('Escape');
  for (let i = 0; i < 2; i++)
    await h.key('w', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
  await h.wait('!document.querySelector(".wb-tab")');

  await h.click('图片库', 'document.querySelector(".studio-titlebar")');
  await h.wait('!!document.querySelector(".library-card")');
  await h.evaluate('document.querySelector(".library-card").click()');
  await h.wait('!!document.querySelector(".library-detail-picture img")');
  await audit('图片库详情');
  await h.click('筛选');
  await audit('图片库筛选');
  await h.nativeKey('Escape');
  await h.click('视图');
  await audit('图片库视图');
  await h.nativeKey('Escape');
  await h.evaluate('document.querySelector(".library-detail-picture img").click()');
  await h.wait('!!document.querySelector(".library-viewer")');
  await audit('大图查看器');
  await h.evaluate('document.querySelector(".library-viewer").focus()');
  await h.nativeKey('Escape');
  await h.wait('!document.querySelector(".library-viewer")');
  await h.evaluate(
    `document.querySelectorAll('.library-card')[1].dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true,metaKey:true}))`,
  );
  await audit('图片库多选');
  await h.click('取消', 'document.querySelector(".library-selection-bar")');
  await h.click('新建收藏集');
  await audit('收藏集行内编辑');
  await h.key('Escape', {}, 'document.activeElement');

  for (const section of ['外观', 'AI 服务', '翻译词典', '图片库', '关于与更新']) {
    await h.section(section);
    await audit('设置' + section);
    if (section === '翻译词典') {
      await h.evaluate(
        'document.querySelector(".settings-table tbody td:nth-child(3) button").click()',
      );
      await audit('词典编辑');
      await h.nativeKey('Escape');
    }
    if (section === '关于与更新') {
      if (
        await h.evaluate(
          "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='检查更新'&&!b.disabled&&b.getAttribute('aria-disabled')!=='true')",
        )
      )
        await h.click('检查更新');
      if (
        await h.evaluate(
          "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='更新说明')",
        )
      )
        await h.click('更新说明');
      await h.wait('!!document.querySelector(".settings-release-notes-content a[href]")');
      await audit('更新说明与外链');
      await h.click('查看声明');
      await h.wait('!!document.querySelector("dialog[open] summary")');
      await audit('第三方声明');
      await h.click('关闭', 'document.querySelector("dialog[open]")');
    }
  }
  const original = h.window.webContents.getURL();
  await h.window.loadFile(path.join(mode.root, 'showcase', 'ui-showcase.html'), {
    query: { theme: 'system', motion: mode.motion || 'system' },
  });
  await h.wait('!!document.querySelector("[data-showcase]")');
  await audit('基础组件');
  await h.window.loadURL(original);
  await h.wait('!!document.querySelector(".studio-titlebar")');
}
