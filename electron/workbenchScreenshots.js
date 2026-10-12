import fs from 'node:fs/promises';
import { harness } from './acceptance/harness.js';
import { workbenchRaw } from './acceptance/workbenchFixtures.js';

export async function prepareWorkbenchScreenshot({ window, scene, mode, filePaths }) {
  if (!scene.workbenchState) return async () => {};
  const checks = [];
  const h = harness(window, { ...mode, slow: 1, screenshots: [] }, checks);
  const { evaluate: e, click, input, wait, key } = h;
  const state = scene.workbenchState;
  await click('显示');
  await h.select('语言', '对照');
  await key('Escape');
  const scope = 'document.querySelector(".wb-section")';
  const select = async (selector) =>
    e(`${selector}.dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}))`);
  if (state === 'edit') await e('document.querySelector(".wb-tags .nps-tag").click()');
  if (state === 'add') {
    await click('输入中文或英文', 'document.querySelector(".wb-add-tags")');
    await input('.wb-add-tags input', '蓝发');
    await wait('document.querySelector(".nps-suggestions")?.textContent.includes("blue hair")');
  }
  if (state === 'select') {
    await select('document.querySelectorAll(".wb-tags .nps-tag")[0]');
    await select('document.querySelectorAll(".wb-tags .nps-tag")[1]');
  }
  if (state === 'negsel') {
    await e('document.querySelectorAll(".wb-section")[1].scrollIntoView({block:"center"})');
    await select('document.querySelectorAll(".wb-section")[1].querySelectorAll(".nps-tag")[0]');
    await select('document.querySelectorAll(".wb-section")[1].querySelectorAll(".nps-tag")[1]');
  }
  if (state === 'prose') {
    await e('document.querySelector("[aria-label=编辑段落]").click()');
    await input('[aria-label="中文段落"]', '合成场景：旅人在窗边等待，晚光照进房间。');
  }
  if (state === 'block') await click('这一块的操作', 'document.querySelector(".wb-block")');
  if (state === 'raw' || state === 'unsaved') {
    await click('更多', scope);
    await click('编辑原始文本');
    if (state === 'unsaved') {
      await input('[aria-label="原始文本"]', workbenchRaw + '\n\nsynthetic addition');
      await click('保存', 'document.querySelector(".wb-raw-editor")');
    }
  }
  if (state === 'filter') await input('[aria-label="搜索 Tag 或译名"]', 'blue');
  if (state === 'view') await click('显示');
  if (state === 'copy') await click('其他复制方式');
  if (state === 'tabs')
    await e(
      'document.querySelectorAll(".wb-tab")[1].dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:250,clientY:25}))',
    );
  if (state === 'chars') {
    await click('添加角色');
    await click('添加角色');
    await e('document.querySelectorAll(".wb-section")[2].scrollIntoView({block:"start"})');
  }
  if (state === 'missing') {
    await fs.rename(filePaths[0], filePaths[0] + '.moved');
    await window.webContents.session.clearCache();
    await e(
      '(()=>{const img=document.querySelector(".wb-canvas img");img.src=img.src+"?missing=1"})()',
    );
    await wait('document.body.innerText.includes("这张图片已被移动或删除")');
    return async () => fs.rename(filePaths[0] + '.moved', filePaths[0]);
  }
  await e('document.activeElement?.blur()');
  await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  return async () => {};
}
