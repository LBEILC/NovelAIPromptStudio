import fs from 'node:fs/promises';
import path from 'node:path';
import { clipboard, nativeImage } from 'electron';
import { parsePrompt } from '../../src/lib/prompt.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';
import { selectGalleryGrouping } from './galleryView.js';

export async function blurChecks({ h, database, mode, trayController }) {
  h.category('图片模糊');
  const { evaluate: e, wait, check } = h;
  const click = async (target, scope) => {
    if (target.startsWith('.') || target.startsWith('[')) {
      await wait(
        `(() => { const node=document.querySelector(${JSON.stringify(target)}); if(!node?.getClientRects().length || node.closest('[inert],.leaving') || node.matches(':disabled')) return false; node.click(); return true; })()`,
        '点击已就绪的目标元素',
      );
      await e('new Promise(resolve=>requestAnimationFrame(resolve))');
    } else await h.click(target, scope);
  };
  const ids = ['blur-fixture-sensitive', 'blur-fixture-safe', 'blur-fixture-other'];
  const card = (id) => `.card[data-group-id="project:${id}"]`;
  const img = (id) => `document.querySelector('${card(id)} img')`;
  const blurred = (id) =>
    `${img(id)}?.hasAttribute('data-blur') && ${img(id)}.src.includes('blur=1')`;
  const clear = (id) =>
    `!!${img(id)} && !${img(id)}.hasAttribute('data-blur') && !${img(id)}.src.includes('blur=1')`;
  const settled = async (label, expression) => {
    await wait(expression, label);
    await check(label, expression);
  };
  const gallery = async () => {
    await click('图片库', 'document.querySelector(".tb")');
    await wait(`document.querySelector('.tb [aria-current=page]')?.textContent.trim()==='图片库'`);
    await click('全部图片', 'document.querySelector(".libp")');
    await h.input('.gallery-search input', 'blur-fixture');
    await wait(`document.querySelectorAll('.card').length>0`);
  };
  const setMode = async (name) => {
    await h.section('通用');
    await click(name, `document.querySelector('[role=radiogroup][aria-label="图片模糊"]')`);
    await gallery();
  };
  const openWorkbench = async () => {
    await click('在工作台打开', 'document.querySelector(".detail .bar")');
    await wait(
      `document.querySelector('.tb [aria-current=page]')?.textContent.trim()==='工作台' && document.querySelector('.wb-body')?.dataset.projectId===${JSON.stringify(ids[0])}`,
      '图片已打开且工作台成为当前页面',
    );
  };
  const mark = async (id, name) => {
    await e(
      `document.querySelector('${card(id)}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:220}))`,
    );
    await click(name, `document.querySelector('[role=menu]:not(.leaving)')`);
  };
  const stateFile = path.join(mode.root, 'blur-state.json');
  if (mode.phase > 0) {
    await gallery();
    if (mode.phase === 1) {
      await settled('重启进程保留只模糊 NSFW', blurred(ids[0]));
      await check(
        '重启后的保存模式为 NSFW 且一键开关关闭',
        `window.studio.invoke('settings.blur.get',{}).then(r=>r.ok && r.data.mode==='nsfw' && !r.data.quickAll)`,
      );
      await check('重启后其他图片仍显示原图', clear(ids[1]));
      await setMode('关闭');
      await click('[data-blur-toggle]');
      await settled(
        '一键模糊全部图片并保存',
        `document.querySelector('[data-blur-toggle]')?.getAttribute('aria-pressed')==='true' && [...document.querySelectorAll('.card img')].every(n=>n.hasAttribute('data-blur'))`,
      );
    } else {
      await settled(
        '重启进程保留一键模糊开关',
        `document.querySelector('[data-blur-toggle]')?.getAttribute('aria-pressed')==='true' && [...document.querySelectorAll('.card img')].every(n=>n.hasAttribute('data-blur'))`,
      );
      await click('[data-blur-toggle]');
      await settled(
        '再次关闭一键模糊后恢复原图',
        `${clear(ids[0])} && !document.querySelector('.card img[data-blur]') && document.querySelector('[data-blur-toggle]')?.getAttribute('aria-pressed')==='false'`,
      );
      const { mode: savedMode, quickAll, words } = JSON.parse(await fs.readFile(stateFile, 'utf8'));
      const saved = { mode: savedMode, quickAll, words };
      await h.input('.gallery-search input', '');
      await check(
        '验收结束恢复原模糊设置',
        `window.studio.invoke('settings.blur.save',{settings:${JSON.stringify(saved)}}).then(r=>r.ok)`,
      );
    }
    return;
  }
  const previous = await e(`window.studio.invoke('settings.blur.get',{}).then(r=>r.data)`);
  const { mode: previousMode, quickAll, words } = previous;
  await fs.writeFile(stateFile, JSON.stringify({ mode: previousMode, quickAll, words }));
  const source = database.loadLibrary('all')[0];
  // Enable the version strip through the same isolated fake account as generation checks.
  await e(
    `window.studio.invoke('account.save',{token:'acceptance-token'}).then(r=>{if(!r.ok)throw Error(r.error.message)})`,
  );
  ids.forEach((id, index) => {
    const metadata = {
      width: source.metadata.width,
      height: source.metadata.height,
      model: 'nai-diffusion-4-5-full',
      prompt_raw: `${index === 0 ? 'nsfw, ' : ''}synthetic_one, synthetic_two, synthetic_three, synthetic_four`,
    };
    database.insertProject({
      ...source,
      id,
      name: id,
      content_hash: id,
      metadata,
      tags: parsePrompt(metadata.prompt_raw),
      prompt_structure: createPromptStructure(metadata),
    });
  });
  await h.reload();
  await gallery();
  await click('视图', 'document.querySelector(".libp")');
  await selectGalleryGrouping(h, '不合并');
  await h.key('Escape');
  await settled(
    '默认关闭且标题栏开关未选中',
    `!document.querySelector('img[data-blur]') && document.querySelector('[data-blur-toggle]')?.getAttribute('aria-pressed')==='false'`,
  );
  await setMode('只模糊 NSFW');
  await settled(
    '只模糊带 NSFW 提示词的图片并提供眼睛按钮',
    `${blurred(ids[0])} && !!document.querySelector('${card(ids[0])} [data-blur-eye]') && ${clear(ids[1])} && ${clear(ids[2])}`,
  );
  await click(card(ids[0]));
  await settled(
    '详情显示 NSFW 自动判定来源',
    `document.querySelector('.detail')?.textContent.includes('NSFW · 自动（含 nsfw）')`,
  );
  await h.screenshot('blur-nsfw');
  await click(`${card(ids[0])} [data-blur-eye]`);
  await settled('眼睛临时显示这一张原图', clear(ids[0]));
  await click('工作台', 'document.querySelector(".tb")');
  await gallery();
  await settled('离开图片库后收回临时显示', blurred(ids[0]));
  await click(card(ids[0]));
  await openWorkbench();
  await settled(
    '工作台舞台按 NSFW 模糊',
    `document.querySelector('img[data-stage]')?.hasAttribute('data-blur') && !!document.querySelector('.versions img[data-blur]')`,
  );
  await click('[aria-label="显示这个标签页的图"]');
  await settled(
    '显示标签页后舞台和版本栏都显示原图',
    `!!document.querySelector('img[data-stage]') && !!document.querySelector('.versions img') && !document.querySelector('.wb-body img[data-blur]') && !document.querySelector('.tabs [aria-selected=true] img[data-blur]')`,
  );
  await e(
    `document.querySelector('.tabs [data-tab][aria-selected=true]').dispatchEvent(new MouseEvent('auxclick',{bubbles:true,button:1}))`,
  );
  await wait(`!document.querySelector('.wb-body[data-project-id="${ids[0]}"]')`);
  await gallery();
  await click(card(ids[0]));
  await openWorkbench();
  await settled(
    '关闭标签页再打开后重新模糊',
    `document.querySelector('img[data-stage]')?.hasAttribute('data-blur')`,
  );
  await gallery();
  await mark(ids[1], '标为 NSFW');
  await settled('手动标记立即模糊', blurred(ids[1]));
  await click(card(ids[1]));
  await settled(
    '详情显示手动来源',
    `document.querySelector('.detail')?.textContent.includes('NSFW · 手动标记')`,
  );
  await click('筛选');
  await click('是', `document.querySelector('[role=radiogroup][aria-label=NSFW]')`);
  await h.key('Escape');
  await settled(
    'NSFW 筛选仅留下自动和手动两张图片',
    `document.querySelectorAll('.card').length===2 && !!${img(ids[0])} && !!${img(ids[1])}`,
  );
  await mark(ids[1], '恢复自动判定');
  await settled(
    '恢复自动判定后安全图片离开 NSFW 结果',
    `document.querySelectorAll('.card').length===1 && !${img(ids[1])}`,
  );
  await click('筛选');
  await click('不限', `document.querySelector('[role=radiogroup][aria-label=NSFW]')`);
  await h.key('Escape');
  await settled('恢复自动判定后安全图不模糊', clear(ids[1]));
  await mark(ids[0], '不是 NSFW');
  await settled('手动安全标记显示原图', clear(ids[0]));
  await h.section('通用');
  await click('编辑…');
  await h.input('[aria-label="添加敏感词"]', 'synthetic_added_word');
  await click('添加', 'document.querySelector(".nsfw-dlg")');
  await click('保存', 'document.querySelector(".nsfw-dlg")');
  await wait('!document.querySelector(".nsfw-dlg")');
  await gallery();
  await settled('编辑敏感词后手动安全标记仍优先', clear(ids[0]));
  await setMode('所有图片都模糊');
  await settled(
    '所有图片模式锁定标题栏开关',
    `document.querySelector('[data-blur-toggle]')?.getAttribute('aria-disabled')==='true' && [...document.querySelectorAll('.card img')].every(n=>n.hasAttribute('data-blur'))`,
  );
  await click(card(ids[0]));
  await openWorkbench();
  clipboard.clear();
  await click('复制图片', 'document.querySelector(".stage-acts")');
  const copied = () =>
    clipboard.readImage().toPNG().equals(nativeImage.createFromPath(source.image_path).toPNG());
  await h.until(copied, '模糊模式复制原图完成');
  await check('模糊不改变剪贴板原图像素字节', copied);
  await setMode('关闭');
  if (process.platform === 'win32') {
    const { menu, tray } = trayController;
    tray.emit('right-click');
    await h.until(() => menu.isVisible() && !menu.webContents.isLoading(), '托盘菜单打开');
    await check('托盘包含模糊所有图片操作', () =>
      menu.webContents.executeJavaScript(
        `!![...document.querySelectorAll('[role=menuitem]')].find(n=>n.textContent.includes('模糊所有图片'))`,
      ),
    );
    await menu.webContents.executeJavaScript(
      `[...document.querySelectorAll('[role=menuitem]')].find(n=>n.textContent.includes('模糊所有图片')).click()`,
    );
    await settled(
      '托盘开关同步主窗口所有网格图片',
      `[...document.querySelectorAll('.card img')].every(n=>n.hasAttribute('data-blur')) && document.querySelector('[data-blur-toggle]')?.getAttribute('aria-pressed')==='true'`,
    );
    await click('[data-blur-toggle]');
  }
  await gallery();
  await click(card(ids[1]));
  await wait(`document.querySelector('.detail')?.dataset.detailId===${JSON.stringify(ids[1])}`);
  await e(`[...document.querySelectorAll('[data-toast-close]')].forEach(n=>n.click())`);
  await wait(`!document.querySelector('.toast:not(.leaving)')`);
  const tags = `.detail .tag`;
  for (let i = 0; i < 3; i++) {
    await e(`document.querySelectorAll('${tags}')[${i}].click()`);
    await wait(`document.querySelectorAll('.toast:not(.leaving)').length===${i + 1}`);
  }
  const texts = await e(
    `[...document.querySelectorAll('.toast:not(.leaving) .selectable')].map(n=>n.textContent)`,
  );
  await check(
    '三条不同通知共存且最新在前',
    `document.querySelector('.toast:not(.leaving) .selectable').textContent.includes('synthetic_three')`,
  );
  await e(`document.querySelectorAll('${tags}')[3].click()`);
  await settled(
    '第四条通知替换最早一条且仍有三条',
    `document.querySelectorAll('.toast:not(.leaving)').length===3 && document.querySelector('.toast:not(.leaving) .selectable').textContent.includes('synthetic_four') && ![...document.querySelectorAll('.toast:not(.leaving) .selectable')].some(n=>n.textContent===${JSON.stringify(texts[2])})`,
  );
  await e(
    `document.querySelector('.toast-stack').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
  );
  await settled('指针进入通知堆叠后展开', `!!document.querySelector('.toast-stack.open')`);
  await click('.toast:not(.leaving) [data-toast-close]');
  await settled(
    '关闭第一条后剩下两条通知',
    `document.querySelectorAll('.toast:not(.leaving)').length===2`,
  );
  await e(
    `document.querySelector('.toast-stack').dispatchEvent(new PointerEvent('pointerout',{bubbles:true}))`,
  );
  await mark(ids[0], '恢复自动判定');
  await setMode('只模糊 NSFW');
  await settled('准备跨进程 NSFW 持久化状态', blurred(ids[0]));
  await h.input('.gallery-search input', '');
}
