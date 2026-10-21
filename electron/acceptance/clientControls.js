import path from 'node:path';
import { createWorkbenchFixtures } from './workbenchFixtures.js';

export async function clientControlChecks({ h, mode, doubles }) {
  h.category('客户端控件');
  await h.section('外观');
  await h.screenshot('022-segments-appearance');
  await h.click('图片库', 'document.querySelector(".tb")');
  await h.click('视图');
  await h.wait('!!document.querySelector(".popover:not(.leaving)")');
  await h.screenshot('022-segments-grouping');
  await h.key('Escape');
  await h.click('工作台', 'document.querySelector(".tb")');
  const files = await createWorkbenchFixtures(path.join(mode.root, 'client-control-fixtures'));
  for (const file of files.slice(0, 2)) {
    doubles.selections.push({ canceled: false, filePaths: [file] });
    await h.click('打开图片', 'document.querySelector(".tb")');
    await h.wait('!!document.querySelector(".prose")');
  }
  await h.wait('document.querySelectorAll(".tabs [data-tab]").length===2');
  await h.click('显示', 'document.querySelector(".prompt-in")');
  await h.screenshot('022-segments-workbench');
  await h.key('Escape');
  await h.wait('!document.querySelector(".view-pop")');
  await h.evaluate(
    'document.querySelector(".tabs [data-tab]").dispatchEvent(new PointerEvent("pointerover",{bubbles:true}))',
  );
  await h.wait('!!document.querySelector(".tab-peek")');
  await h.check(
    '标签预览时间为日期或今天时分，没有原始时间戳',
    `[...document.querySelectorAll('.tab-peek .help')].some(n=>/^\\d{2}-\\d{2} \\d{2}:\\d{2} 导入(?: · .*)?$/.test(n.textContent))`,
  );
  await h.screenshot('022-tab-preview');
  await h.evaluate('document.activeElement.blur()');
  await h.screenshot('022-canvas-shadow');
  for (let i = 0; i < 2; i++)
    await h.key('w', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
  await h.wait('!document.querySelector(".tabs [data-tab]")');
}
