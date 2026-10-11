import fs from 'node:fs/promises';
import path from 'node:path';
import { clipboard, nativeImage } from 'electron';

export async function shortcutChecks({ h, files, doubles, database, mode }) {
  const { evaluate: e, wait, check, click, key } = h;
  h.category('外壳·快捷键');
  const modifier = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  const shortcut = (name, extra = {}, target = 'document.body') =>
    key(name, { ...modifier, ...extra }, target);
  await click('工作台', 'document.querySelector(".studio-titlebar")');
  for (let index = 0; index < 3; index++) {
    doubles.selections.push({ canceled: false, filePaths: [files[index]] });
    await shortcut('i');
    await wait(`document.querySelectorAll('.workbench-tab').length===${index + 1}`);
  }
  await check(
    'Mod+I 使用打开对话框并生成三个工作台标签',
    'document.querySelectorAll(".workbench-tab").length===3',
  );
  const active =
    'document.querySelector(".workbench-tab[data-active]")?.getAttribute("data-workbench-tab-id")';
  const last = await e(active);
  await shortcut('Tab');
  await wait(`${active} !== ${JSON.stringify(last)}`);
  await check('Mod+Tab 切换到下一个标签', `${active} !== ${JSON.stringify(last)}`);
  await shortcut('Tab', { shiftKey: true });
  await wait(`${active} === ${JSON.stringify(last)}`);
  await check('Mod+Shift+Tab 切回前一个标签', `${active} === ${JSON.stringify(last)}`);
  await shortcut('w');
  await wait('document.querySelectorAll(".workbench-tab").length===2');
  await check('Mod+W 关闭当前标签', 'document.querySelectorAll(".workbench-tab").length===2');
  clipboard.writeImage(nativeImage.createFromPath(files[3]));
  await shortcut('v');
  await wait('document.querySelectorAll(".workbench-tab").length===3');
  await check(
    'Mod+V 从真实剪贴板打开工作台图片',
    'document.querySelectorAll(".workbench-tab").length===3',
  );
  await click('图片库', 'document.querySelector(".studio-titlebar")');
  await shortcut('k');
  await check('图库 Mod+K 聚焦搜索', 'document.activeElement.matches(".gallery-search input")');
  const before = database.loadLibrary('all').length;
  await e('document.querySelector(".gallery-search input").focus()');
  const allowed = await shortcut('v', {}, 'document.activeElement');
  await check(
    '文本框 Mod+V 保留浏览器普通粘贴且不导入图片',
    () => allowed === true && database.loadLibrary('all').length === before,
  );
  const plainImage = path.join(mode.root, 'shortcut-import.png');
  await fs.writeFile(plainImage, nativeImage.createFromPath(files[4]).toPNG());
  doubles.selections.push({ canceled: false, filePaths: [plainImage] });
  await shortcut('i');
  await h.until(() => database.loadLibrary('all').length === before + 1, '图库快捷键导入文件');
  await wait('document.body.innerText.includes("导入 1 张")');
  await check('图库 Mod+I 导入指定图片', () => database.loadLibrary('all').length === before + 1);
  clipboard.writeImage(nativeImage.createFromPath(files[5]));
  await shortcut('v');
  await h.until(() => database.loadLibrary('all').length === before + 2, '图库快捷键导入剪贴板');
  await check(
    '图库 Mod+V 导入真实剪贴板图片',
    () => database.loadLibrary('all').length === before + 2,
  );
  await h.screenshot('shortcuts-gallery');
}

export async function createTrashDraft({ h, database }) {
  const { evaluate: e, wait, click, check } = h;
  await click('图片库', 'document.querySelector(".studio-titlebar")');
  await wait('!!document.querySelector(".gallery-card-main")');
  await e(
    'document.querySelector(".gallery-card-main").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))',
  );
  await wait('!!document.querySelector(".workbench-editor-panel")');
  await click('原始 Prompt');
  await wait('!!document.querySelector(".raw-prompt-textarea-input")');
  await h.input('.raw-prompt-textarea-input', 'acceptance_draft_tag, 1girl');
  await click('保存并解析');
  await wait('!!document.querySelector(".workbench-tab-dirty")');
  // Read the application's own persisted session to identify the opened library
  // project; setup moves only this disposable fixture into the recycle bin.
  const session = await e(
    `Object.values(localStorage).map(value=>{try{return JSON.parse(value)}catch{return null}}).find(value=>value?.version===2 && value?.tabs?.some(tab=>tab.source?.type==='library'))`,
  );
  const projectId = session.tabs.find((tab) => tab.id === session.activeTabId)?.source?.projectId;
  await check('草稿来自真实图库标签', () => Boolean(projectId && database.loadProject(projectId)));
  database.updateProjects([projectId], { deleted: true });
  return projectId;
}
