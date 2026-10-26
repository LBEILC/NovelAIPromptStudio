import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createWorkbenchFixtures } from './workbenchFixtures.js';

const uiCall = (h, name, input = {}) =>
  h.evaluate(
    `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
  );

export async function inpaintSyncChecks(h, tabId) {
  await h.click('工作台', 'document.querySelector(".tb")');
  await h.wait(
    '!!document.querySelector("img[data-stage]:not(.leaving)") && !!document.querySelector("[data-trigger=op-inpaint]")',
  );
  await h.evaluate('document.querySelector("[data-trigger=op-inpaint]").click()');
  await h.wait(
    '!!document.querySelector(".inpaint-ov:not(.leaving) .ip-mask") && document.querySelector(".ip-stage")?.getBoundingClientRect().width>0',
  );
  for (const [type, point] of [
    ['pointerdown', [0.4, 0.4]],
    ['pointermove', [0.55, 0.55]],
    ['pointerup', [0.55, 0.55]],
  ]) {
    await h.evaluate(`(() => {
      const r=document.querySelector('.ip-stage').getBoundingClientRect();
      document.querySelector('.ip-canvas').dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles:true, button:0, buttons:${type === 'pointerup' ? 0 : 1}, clientX:r.left+r.width*${point[0]}, clientY:r.top+r.height*${point[1]} }));
    })()`);
  }
  await h.until(
    async () => (await uiCall(h, 'inpaint.get', { tabId })).maskRatio > 0,
    '重绘涂抹同步到命令层',
  );
  const state = await uiCall(h, 'inpaint.get', { tabId });
  const rect = await h.evaluate(`(() => {
    const mask=document.querySelector('.ip-mask'), box=document.querySelector('.ip-rect');
    return { x:Math.round(parseFloat(box.style.left)*mask.width/100), y:Math.round(parseFloat(box.style.top)*mask.height/100), width:Math.round(parseFloat(box.style.width)*mask.width/100), height:Math.round(parseFloat(box.style.height)*mask.height/100) };
  })()`);
  await h.check(
    '093 用户涂抹同步为 active 且重绘框与界面一致',
    () =>
      state.active &&
      ['x', 'y', 'width', 'height'].every((k) => state.rect[k] === rect[k]) &&
      state.maskRatio > 0,
  );
  await fs.access(state.previewPath);
  await fs.access(state.cropPath);
  await h.screenshot('093-inpaint-sync');
  await h.click('取消', 'document.querySelector(".inpaint-ov")');
  await h.until(
    async () => !(await uiCall(h, 'inpaint.get', { tabId })).active,
    '关闭局部重绘清除同步状态',
  );
  await h.check(
    '093 关闭局部重绘后 active 为 false',
    async () => !(await uiCall(h, 'inpaint.get', { tabId })).active,
  );
  await h.wait('!document.querySelector(".inpaint-ov")');
}

export async function agentImageChecks({ h, call, directory, database }) {
  const ui = (name, input) => uiCall(h, name, input);
  await ui('account.connection.save', { connection: 'official' });
  await ui('account.save', { token: 'acceptance-token' });
  await ui('settings.generation.save', { agentMode: 'confirm' });
  const [file] = await createWorkbenchFixtures(directory, {
    sizes: [[512, 512]],
    prompts: ['synthetic agent operation source'],
  });
  const imported = await call('library.import', { path: file });
  const opened = await ui('workbench.open', { libraryId: imported.project.id });
  const tabId = opened.tab.id,
    imageId = imported.project.id;
  await ui('params.set', { tabId, patch: { model: 'nai-diffusion-5-full' }, dropReferences: true });
  await ui('prompt.set', { tabId, scope: 'base:prompt', text: 'synthetic agent redraw draft' });
  await h.click('工作台', 'document.querySelector(".tb")');
  await h.wait(
    `document.querySelector('img[data-stage]:not(.leaving)')?.getAttribute('src')==='novelai-media://file?path='+encodeURIComponent(${JSON.stringify(imported.project.image_path)})`,
    '操作前舞台已显示源图',
  );
  const stage = await h.evaluate(
    'document.querySelector("img[data-stage]:not(.leaving)").getAttribute("src")',
  );
  const current = (await call('workbench.get', { tabId })).tab;
  let count = (await call('version.list', { tabId })).versions.length;
  const shapes = [{ type: 'ellipse', cx: 256, cy: 256, rx: 70, ry: 90 }];
  const grid = await call('image.grid', { tabId, imageId });
  const estimate = await call('generate.estimate-inpaint', { tabId, imageId, shapes });
  await h.check('093 Agent 网格与重绘预览可读取且尺寸受限', async () => {
    const a = await sharp(grid.path).metadata(),
      b = await sharp(estimate.previewPath).metadata();
    return Math.max(a.width, a.height, b.width, b.height) <= 1568 && estimate.maskRatio > 0;
  });
  for (const operation of ['inpaint', 'enhance']) {
    const job = await call(`generate.${operation}`, {
      tabId,
      imageId,
      ...(operation === 'inpaint' ? { shapes } : { magnitude: 2, scale: 1 }),
    });
    const status = (await call('generate.status', { id: job.id })).jobs[0];
    await h.check(
      `093 Agent ${operation} 进入待确认并提供操作数据`,
      async () =>
        status.state === 'pending' &&
        status.operation === operation &&
        status.source === 'agent' &&
        (operation !== 'inpaint' || (await fs.access(status.previewPath).then(() => true))),
    );
    await h.wait('!!document.querySelector("[data-trigger=queue]")');
    await h.evaluate('document.querySelector("[data-trigger=queue]").click()');
    await h.wait('!!document.querySelector("[aria-label=生成队列]")');
    await h.screenshot(`093-agent-${operation}-pending`);
    await h.wait(
      `(() => { const button=document.querySelector('[aria-label=生成队列] [data-pending-op="${operation}"] button[aria-label="确认"]'); if(!button || button.disabled)return false; button.click(); return true; })()`,
    );
    await h.until(
      async () =>
        ['completed', 'failed'].includes(
          (await call('generate.status', { id: job.id })).jobs[0].state,
        ),
      `Agent ${operation} 经界面确认后结束`,
    );
    const done = (await call('generate.status', { id: job.id })).jobs[0];
    count++;
    await h.check(`093 Agent ${operation} 完成新增版本且舞台不切换`, async () => {
      const after = (await call('workbench.get', { tabId })).tab;
      return (
        done.state === 'completed' &&
        (await call('version.list', { tabId })).versions.length === count &&
        after.versionImageId === current.versionImageId &&
        after.versionId === current.versionId &&
        database.versions.get(done.versionId)?.source === 'agent' &&
        (await h.evaluate(
          `document.querySelector('img[data-stage]:not(.leaving)')?.getAttribute('src')===${JSON.stringify(stage)}`,
        ))
      );
    });
    await h.key('Escape');
  }
}
