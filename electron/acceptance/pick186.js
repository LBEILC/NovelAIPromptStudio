import { commandFor, contextMenu, menuRoot, toastRoot } from './release186.js';
import { expectQueueCompletion } from './generationQueueWait.js';
import fs from 'node:fs';
import path from 'node:path';
import { libraryDetailsChecks } from './libraryDetails.js';
export async function pick186Checks({ h, preferences, mode, database }) {
  const call = commandFor(h);
  if (!path.resolve(preferences.filePath).startsWith(path.resolve(mode.root) + path.sep))
    throw Error('Pick account fixture must stay in the temporary profile');
  const token = JSON.parse(fs.readFileSync(preferences.filePath, 'utf8')).novelAITokenEncrypted;
  await call('account.connection.save', { connection: 'official' });
  await call('account.save', { token: 'acceptance-token' });
  const { tab } = await call('workbench.new', { width: 64, height: 64 });
  const job = await call('generate.start', { tabId: tab.id, count: 3 });
  await expectQueueCompletion(h, job.id);
  const version = (await call('version.list', { tabId: tab.id })).versions.at(-1);
  await h.click('工作台', 'document.querySelector(".tb")');
  h.category('工作台');
  await contextMenu(h, `[data-key="ver-${version.id}"]`);
  await h.click('挑图…', menuRoot);
  await h.wait('document.querySelectorAll("[data-pick-index]").length===3');
  await h.wait('[...document.querySelectorAll(".pick-cell img")].every(i=>i.naturalWidth>0)');
  await h.check(
    '096-14 挑图按图片比例成行排列',
    `(()=>{const cs=getComputedStyle(document.documentElement),min=parseFloat(cs.getPropertyValue('--thumb-ratio-min')),max=parseFloat(cs.getPropertyValue('--thumb-ratio-max'));return !!document.querySelector('.pick-row')&&[...document.querySelectorAll('.pick-cell')].every(e=>{const i=e.querySelector('img'),r=e.getBoundingClientRect(),ratio=Math.max(min,Math.min(max,i.naturalWidth/i.naturalHeight));return Math.abs(r.width/r.height/ratio-1)<=0.02})})()`,
  );
  await h.key('Enter', {}, 'document.body');
  await h.wait('!!document.querySelector(".viewer-ov:not(.pick-ov):not(.leaving)")');
  await h.key(' ', {}, 'document.body');
  await h.wait('document.querySelector(\'[data-pick-index="0"]\')?.dataset.pickMark==="keep"');
  await h.wait(
    'document.querySelector(".viewer-ov:not(.pick-ov):not(.leaving)")?.textContent.includes("2 / 3")',
  );
  await h.key('Escape');
  await h.wait('!document.querySelector(".viewer-ov:not(.pick-ov)")');
  await h.check(
    '096-15 Enter 打开普通大图，空格标记并前进，Esc 返回挑图',
    '!!document.querySelector("[data-pick]") && document.querySelector(\'[data-pick-index="0"]\').dataset.pickMark==="keep"',
  );
  await h.click('退出挑图');
  await h.wait('!document.querySelector("[data-pick]")');
  await contextMenu(h, `[data-key="ver-${version.id}"]`);
  await h.click('挑图…', menuRoot);
  await h.wait('document.querySelectorAll("[data-pick-index]").length===3');
  await h.check(
    '096-16 退出再打开同版保留挑图标记',
    'document.querySelector(\'[data-pick-index="0"]\').dataset.pickMark==="keep"',
  );
  await h.key('ArrowRight', {}, 'document.body');
  await h.key('x', {}, 'document.body');
  await h.wait('document.querySelector(\'[data-pick-index="1"]\')?.dataset.pickMark==="drop"');
  await h.screenshot('091-pick-marks');
  await h.click('把不要的 1 张移入回收站', 'document.querySelector("[data-pick]")');
  const imageId = version.images[1].projectId;
  const image = () => call('library.get', { id: imageId });
  await h.until(async () => !!(await image()).project.deleted_at, '挑图移入回收站');
  await h.click('撤销', toastRoot);
  await h.until(async () => !(await image()).project.deleted_at, '挑图撤销恢复');
  await h.check(
    '091-19 挑图空格保留、X 丢弃，回收站撤销恢复图片',
    async () => !(await image()).project.deleted_at,
  );
  await h.key('Escape');
  await h.wait('!document.querySelector("[data-pick]:not(.leaving)")');
  const other = (await call('workbench.new', { width: 64, height: 64 })).tab;
  await expectQueueCompletion(h, (await call('generate.start', { tabId: other.id, count: 1 })).id);
  const otherIds = (await call('version.list', { tabId: other.id })).versions.map(
    (v) => 'ver-' + v.id,
  );
  const firstIds = (await call('version.list', { tabId: tab.id })).versions.map(
    (v) => 'ver-' + v.id,
  );
  await h.wait(`!!document.querySelector('[data-key="${otherIds.at(-1)}"]')`);
  const immediate = [];
  for (const [id, ids] of [
    [tab.id, firstIds],
    [other.id, otherIds],
  ]) {
    await h.evaluate(`document.querySelector('[data-tab="${id}"]').click()`);
    immediate.push(
      await h.evaluate(
        `(()=>{const rows=[...document.querySelectorAll('.versions .scroll .ver[data-key^="ver-"]')];return rows.filter(r=>!r.closest('.leaving,[inert]')).length>0&&rows.filter(r=>!r.closest('.leaving,[inert]')).every(r=>${JSON.stringify(ids)}.includes(r.dataset.key))})()`,
      ),
    );
    await h.wait(`!!document.querySelector('[data-key="${ids.at(-1)}"]')`);
  }
  await h.check('096-17 已看过的标签切换立即显示自己的版本', () => immediate.every(Boolean));
  await h.check(
    '096-19 宽提示词栏仍保留舞台和提示词最小宽度且不溢出',
    `(()=>{const root=document.documentElement,keys=['--versions-w-live','--prompt-w-live'],old=keys.map(k=>root.style.getPropertyValue(k));try{root.style.setProperty(keys[0],'300px');root.style.setProperty(keys[1],'900px');const body=document.querySelector('.wb-body'),stage=body.querySelector(':scope > .col.stage'),prompt=body.querySelector('.col.prompt'),cs=getComputedStyle(root);return stage.getBoundingClientRect().width>=parseFloat(cs.getPropertyValue('--stage-min-w'))&&prompt.getBoundingClientRect().width>=parseFloat(cs.getPropertyValue('--prompt-min-w'))&&body.scrollWidth<=body.clientWidth+1}finally{keys.forEach((k,i)=>old[i]?root.style.setProperty(k,old[i]):root.style.removeProperty(k))}})()`,
  );
  await call('workbench.close', { tabId: other.id });
  await libraryDetailsChecks({ h, database });
  await call('workbench.close', { tabId: tab.id });
  const settings = JSON.parse(fs.readFileSync(preferences.filePath, 'utf8'));
  if (token === undefined) delete settings.novelAITokenEncrypted;
  else settings.novelAITokenEncrypted = token;
  fs.writeFileSync(preferences.filePath, JSON.stringify(settings));
  await call('settings.generation.save');
  await h.reload();
}
