import fs from 'node:fs/promises';
import { harness } from '../acceptance/harness.js';
import { workbenchRaw } from '../acceptance/workbenchFixtures.js';

export async function prepareWorkbenchScreenshot({ window, scene, mode, filePaths }) {
  if (!scene.workbenchState) return async () => {};
  const checks = [];
  const h = harness(window, { ...mode, slow: 1, screenshots: [] }, checks);
  const { evaluate: e, click, input, wait, key } = h;
  const state = scene.workbenchState;
  if (await e('!!document.querySelector(".tx-wrap textarea")'))
    await click('按块编辑（Ctrl E 切换）');
  await click('显示');
  await h.select('语言', '对照');
  await key('Escape');
  const scope = 'document.querySelector(".doc")';
  const select = async (selector) =>
    e(`${selector}.dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}))`);
  if (state === 'edit') await e('document.querySelector(".tags .tag[data-tag-key]").click()');
  if (state === 'add') {
    await e('document.querySelector(".ghost[data-add]").click()');
    await input('[data-add] input', '蓝发');
    await wait('document.querySelector(".complete")?.textContent.includes("blue hair")');
  }
  if (state === 'select') {
    await select('document.querySelectorAll(".tags .tag[data-tag-key]")[0]');
    await select('document.querySelectorAll(".tags .tag[data-tag-key]")[1]');
  }
  if (state === 'negsel') {
    await e(
      `document.querySelector('.blk[data-wb-scope$="undesired"]').scrollIntoView({block:"center"})`,
    );
    await select(
      `document.querySelector('.blk[data-wb-scope$="undesired"]').querySelectorAll(".tag[data-tag-key]")[0]`,
    );
    await select(
      `document.querySelector('.blk[data-wb-scope$="undesired"]').querySelectorAll(".tag[data-tag-key]")[1]`,
    );
  }
  if (state === 'prose') {
    await e('document.querySelector("[aria-label=编辑段落]").click()');
    await input('[aria-label="中文段落"]', '合成场景：旅人在窗边等待，晚光照进房间。');
  }
  if (state === 'block') await click('这一块的操作', 'document.querySelector(".blk[data-block]")');
  if (state === 'raw' || state === 'unsaved') {
    await click('按文本编辑（Ctrl E 切换）');
    if (state === 'unsaved') {
      await input('.tx-wrap textarea', workbenchRaw + '\n\nsynthetic addition');
      await click('按块编辑（Ctrl E 切换）');
    }
  }
  if (state === 'filter') await input('[aria-label="搜索 Tag 或译文"]', 'blue');
  if (state === 'view') await click('显示');
  if (state === 'copy') await click('其他复制方式');
  if (state === 'tabs')
    await e(
      'document.querySelectorAll(".tab")[1].dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:250,clientY:25}))',
    );
  if (state === 'chars') {
    await click('添加角色');
    await click('添加角色');
    await e('document.querySelectorAll(".char-sec")[1].scrollIntoView({block:"start"})');
  }
  if (state === 'missing') {
    await fs.rename(filePaths[0], filePaths[0] + '.moved');
    await window.webContents.session.clearCache();
    await e(
      '(()=>{const img=document.querySelector(".stage .canvas img");img.src=img.src+"?missing=1"})()',
    );
    await wait('document.body.innerText.includes("这张图片已被移动或删除")');
    return async () => fs.rename(filePaths[0] + '.moved', filePaths[0]);
  }
  await e('document.activeElement?.blur()');
  await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  return async () => {};
}
