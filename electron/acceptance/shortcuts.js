import fs from 'node:fs/promises';
import path from 'node:path';
import { clipboard, nativeImage } from 'electron';

export async function shortcutChecks({ h, files, doubles, database, mode }) {
  const { evaluate: e, wait, check, click, key } = h;
  h.category('外壳·快捷键');
  const modifier = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  const shortcut = (name, extra = {}, target = 'document.body') =>
    key(name, { ...modifier, ...extra }, target);
  await click('工作台', 'document.querySelector(".tb")');
  for (let index = 0; index < 3; index++) {
    doubles.selections.push({ canceled: false, filePaths: [files[index]] });
    await shortcut('i');
    await wait(`document.querySelectorAll('.tabs [data-tab]').length===${index + 1}`);
  }
  await check(
    'Mod+I 使用打开对话框并生成三个工作台标签页',
    'document.querySelectorAll(".tabs [data-tab]").length===3',
    undefined,
    'once',
  );
  const active =
    'document.querySelector(".tabs [data-tab][aria-selected=true]")?.getAttribute("data-tab")';
  const last = await e(active);
  await shortcut('Tab');
  await wait(`${active} !== ${JSON.stringify(last)}`);
  await check(
    'Mod+Tab 切换到下一个标签页',
    `${active} !== ${JSON.stringify(last)}`,
    undefined,
    'once',
  );
  await shortcut('Tab', { shiftKey: true });
  await wait(`${active} === ${JSON.stringify(last)}`);
  await check(
    'Mod+Shift+Tab 切回前一个标签页',
    `${active} === ${JSON.stringify(last)}`,
    undefined,
    'once',
  );
  await shortcut('w');
  await wait('document.querySelectorAll(".tabs [data-tab]").length===2');
  await check(
    'Mod+W 关闭当前标签页',
    'document.querySelectorAll(".tabs [data-tab]").length===2',
    undefined,
    'once',
  );
  clipboard.writeImage(nativeImage.createFromPath(files[3]));
  await shortcut('v');
  await wait('document.querySelectorAll(".tabs [data-tab]").length===3');
  await check(
    'Mod+V 从剪贴板替身打开工作台图片',
    'document.querySelectorAll(".tabs [data-tab]").length===3',
    undefined,
    'once',
  );
  await click('图片库', 'document.querySelector(".tb")');
  await wait('!!document.querySelector(".libp")?.getClientRects().length');
  await wait(
    '!!document.querySelector(".gallery-search input")?.getClientRects().length && !document.querySelector(".app-page-surface.leaving")',
  );
  await shortcut('k');
  await h.checkSoon(
    '图库 Mod+K 聚焦搜索',
    'document.activeElement.matches(".gallery-search input")',
    undefined,
    undefined,
    undefined,
    'once',
  );
  const before = database.loadLibrary('all').length;
  await e('document.querySelector(".gallery-search input").focus()');
  const allowed = await shortcut('v', {}, 'document.activeElement');
  await check(
    '文本框 Mod+V 保留浏览器普通粘贴且不导入图片',
    () => allowed === true && database.loadLibrary('all').length === before,
    undefined,
    'once',
  );
  const plainImage = path.join(mode.root, 'shortcut-import.png');
  await fs.writeFile(plainImage, nativeImage.createFromPath(files[4]).toPNG());
  doubles.selections.push({ canceled: false, filePaths: [plainImage] });
  await shortcut('i');
  await h.until(() => database.loadLibrary('all').length === before + 1, '图库快捷键导入文件');
  await wait('document.body.innerText.includes("导入 1 张")');
  await check(
    '图库 Mod+I 导入指定图片',
    () => database.loadLibrary('all').length === before + 1,
    undefined,
    'once',
  );
  clipboard.writeImage(nativeImage.createFromPath(files[5]));
  await shortcut('v');
  await h.until(() => database.loadLibrary('all').length === before + 2, '图库快捷键导入剪贴板');
  await check(
    '图库 Mod+V 导入剪贴板替身图片',
    () => database.loadLibrary('all').length === before + 2,
    undefined,
    'once',
  );
  await h.screenshot('shortcuts-gallery');
}

export async function createTrashDraft({ h, database }) {
  const { evaluate: e, wait, click, check } = h;
  await click('图片库', 'document.querySelector(".tb")');
  await wait('!!document.querySelector(".card")');
  await e(
    'document.querySelector(".card").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))',
  );
  await wait('!!document.querySelector(".viewer-ov")');
  await click('在工作台打开', 'document.querySelector(".viewer-ov")');
  await wait('!!document.querySelector(".col.prompt")');
  await click('按文本编辑（Ctrl E 切换）');
  await wait('!!document.querySelector(".tx-wrap textarea")');
  await h.input('.tx-wrap textarea', 'acceptance_draft_tag, 1girl');
  await click('按块编辑（Ctrl E 切换）');
  await wait('!!document.querySelector(".dirty-tag")');
  // Read the application's own persisted session to identify the opened library
  // project; setup moves only this disposable fixture into the recycle bin.
  const session = await e(
    `(async()=>{const ready=await window.studio.invoke('workbench.list',{});if(!ready.ok)throw Error(ready.error.message);const result=await window.studio.invoke('workbench.session',{});if(!result.ok)throw Error(result.error.message);return result.data})()`,
  );
  const projectId = session.tabs.find((tab) => tab.id === session.activeTabId)?.source?.projectId;
  await check(
    '草稿来自真实图库标签页',
    () => Boolean(projectId && database.loadProject(projectId)),
    undefined,
    'once',
  );
  database.updateProjects([projectId], { deleted: true });
  return projectId;
}
