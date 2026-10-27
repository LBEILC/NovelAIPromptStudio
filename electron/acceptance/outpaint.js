import sharp from 'sharp';
import path from 'node:path';
import { createWorkbenchFixtures } from './workbenchFixtures.js';

export async function outpaintChecks({ h, database, generationService }) {
  h.category('扩图命令');
  const call = (name, input = {}) =>
    h.evaluate(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
    );
  await call('account.connection.save', { connection: 'official' });
  await call('account.save', { token: 'acceptance-token' });
  const source = (await database.loadLibraryCards()).find(
    (p) => p.metadata.width >= 512 && p.metadata.height >= 512 && !p.deleted_at,
  );
  const opened = await call('workbench.open', { libraryId: source.id });
  const tabId = opened.tab.id;
  await call('params.set', {
    tabId,
    patch: { model: 'nai-diffusion-5-full' },
    dropReferences: true,
  });
  const input = { tabId, imageId: source.id, edges: { left: 64, right: 0, top: 64, bottom: 0 } };
  const estimate = await call('generate.estimate-outpaint', input);
  await h.check(
    '扩图同时估价两种画法并返回分块框',
    () =>
      !estimate.whole.unavailable &&
      !estimate.edges.unavailable &&
      estimate.edges.blocks.map((b) => b.edge).join(',') === 'left,top',
  );
  const original = await sharp(database.loadProject(source.id).image_path).metadata();
  const waitJob = async (id) => {
    await h.until(
      async () =>
        ['completed', 'failed', 'canceled'].includes(
          (await call('generate.status', { id })).jobs[0].state,
        ),
      '扩图任务结束',
    );
    return (await call('generate.status', { id })).jobs[0];
  };
  for (const scenario of ['whole', 'edges', 'partial', 'failed', 'cancel']) {
    const before = (await call('version.list', { tabId })).versions.length;
    const requests = generationService.state.requests.length;
    generationService.state.failAt =
      scenario === 'partial' ? requests + 2 : scenario === 'failed' ? requests + 1 : 0;
    generationService.state.holdAt = scenario === 'cancel' ? requests + 1 : 0;
    const started = await call('generate.outpaint', {
      ...input,
      mode: scenario === 'whole' ? 'whole' : 'edges',
    });
    if (scenario === 'cancel') {
      await generationService.waitForHold();
      await call('generate.cancel', { ids: [started.id] });
      generationService.state.resume();
    }
    const finished = await waitJob(started.id);
    const versions = (await call('version.list', { tabId })).versions;
    await h.check(`扩图 ${scenario} 保存正确的版本和失败边`, async () => {
      if (scenario === 'failed')
        return finished.state === 'failed' && !finished.images.length && versions.length === before;
      const partial = scenario === 'partial' || scenario === 'cancel';
      const image = database.loadProject(finished.images[0]);
      if (!image) return false;
      const size = await sharp(image.image_path).metadata();
      const operation = database.versions.get(finished.versionId).operation;
      return (
        finished.state === (scenario === 'cancel' ? 'canceled' : 'completed') &&
        versions.length === before + 1 &&
        operation.kind === 'outpaint' &&
        size.width === original.width + 64 &&
        size.height === original.height + (partial ? 0 : 64) &&
        image.metadata.width === size.width &&
        image.metadata.height === size.height &&
        (!partial ||
          (finished.failedEdges?.join(',') === 'top' &&
            operation.failedEdges?.join(',') === 'top' &&
            !!finished.failure))
      );
    });
  }
  generationService.state.failAt = 0;
  generationService.state.holdAt = 0;
  await outpaintUIChecks({ h, database, generationService, call, waitJob });
}

async function outpaintUIChecks({ h, database, generationService, call, waitJob }) {
  h.category('局部重绘与扩图');
  const source = (await database.loadLibraryCards()).find(
    (p) => p.metadata.width >= 512 && p.metadata.height > p.metadata.width && !p.deleted_at,
  );
  if (!source) throw Error('Missing synthetic portrait');
  const [file] = await createWorkbenchFixtures(
    path.join(path.dirname(database.loadProject(source.id).image_path), 'outpaint-ui-fixtures'),
    { sizes: [[512, 768]], prompts: ['synthetic outpaint UI'] },
  );
  const W = 512,
    H = 768;
  const opened = await call('workbench.open', { path: file });
  const tabId = opened.tab.id;
  await call('work.save', { tabId });
  const parent = (await call('version.list', { tabId })).versions[0];
  await call('params.set', {
    tabId,
    patch: { model: 'nai-diffusion-5-full' },
    dropReferences: true,
  });
  await h.click('工作台', 'document.querySelector(".tb nav")');
  const overlay = 'document.querySelector(".outpaint-ov:not(.leaving)")';
  const start = async () => {
    await call('version.open', { tabId, versionId: parent.id });
    await h.wait(`document.querySelector('img[data-stage]')?.naturalWidth === ${W}`);
    await h.evaluate('document.querySelector(\'[data-trigger="op-outpaint"]\').click()');
    await h.wait(`${overlay}?.querySelector('[data-outpaint-canvas]') != null`);
  };
  await start();
  await h.check(
    '打开扩图且未扩边时不能生成',
    `${overlay}?.querySelector('.op-bar > button:last-child')?.getAttribute('aria-disabled') === 'true'`,
  );
  const square = async () => {
    await h.click('1:1', overlay);
    await h.wait(
      `[...${overlay}.querySelectorAll('[role="radio"]')].every(e=>!e.textContent.includes('…'))`,
    );
  };
  await square();
  await h.check(
    '正方形预设扩左右边并完成两种画法估价',
    `(() => {
    const e=${overlay}, cards=[...e.querySelectorAll('[role="radio"]')];
    return e.querySelectorAll('.op-plus').length===2 &&
      [...e.querySelectorAll('.op-ratios button')].some(b=>b.textContent==='1:1' && b.getAttribute('aria-pressed')==='true') &&
      e.querySelector('.ip-info b').textContent==='${H} × ${H}' &&
      cards.length===2 && cards.every(c=>/免费|Anlas/.test(c.textContent)) &&
      cards[0].textContent.includes('生成') && cards[1].textContent.includes('2 次');
  })()`,
  );
  const checkCard = async (label, mixed) => {
    const edges = await h.evaluate(
      `Object.fromEntries([...${overlay}.querySelectorAll('[data-outpaint-handle]')].map(n=>[n.dataset.outpaintHandle,Number(n.getAttribute('aria-valuenow'))]))`,
    );
    const estimate = await call('generate.estimate-outpaint', {
      tabId,
      imageId: parent.project.id,
      edges,
    });
    const card = `${overlay}.querySelectorAll('.op-card')[1]`;
    await h.wait(`${card}?.textContent.includes(${JSON.stringify(mixed ? '等' : '每次')})`);
    const blocks = estimate.edges.blocks;
    const expected = `每次 ${blocks[0].width} × ${blocks[0].height}`;
    const state = mixed
      ? `(()=>{const n=${card},tip=n.getAttribute('data-tip')||'';return n.textContent.includes('等') && tip.includes('左') && tip.includes('上') && ${JSON.stringify(blocks.map((b) => `${b.width} × ${b.height}`))}.every(size=>tip.includes(size))})()`
      : `${card}.textContent.includes(${JSON.stringify(expected)}) && /每次 \\d+ × \\d+/.test(${card}.textContent)`;
    await h.wait(state);
    await h.check(label, state, undefined, 'once');
  };
  await checkCard('097-12 左右等量扩图显示估价返回的每块尺寸', false);
  const drag = async (distance) => {
    await h.evaluate(`(() => {
      const handle=${overlay}.querySelector('[data-outpaint-handle="bottom"]');
      const r=handle.getBoundingClientRect();
      handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,clientX:r.x,clientY:r.y}));
      const area=${overlay}.querySelector('.op-area');
      area.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,clientX:r.x,clientY:r.y+${distance}}));
      area.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:r.x,clientY:r.y+${distance}}));
    })()`);
  };
  await drag(40);
  await h.check(
    '拖动下边按64像素吸附',
    `(() => {const n=Number(${overlay}.querySelector('[data-outpaint-handle="bottom"]').getAttribute('aria-valuenow'));return n>0 && n%64===0})()`,
  );
  await drag(10000);
  await h.check(
    '拖动下边不超过原图两倍上限',
    `Number(${overlay}.querySelector('[data-outpaint-handle="bottom"]').getAttribute('aria-valuenow'))===${H}`,
  );
  await h.click('重置', overlay);
  await h.check(
    '重置清空四条扩边',
    `[...${overlay}.querySelectorAll('[data-outpaint-handle]')].every(e=>e.getAttribute('aria-valuenow')==='0')`,
  );
  for (const side of ['left', 'top']) {
    await h.evaluate(
      `(()=>{const n=${overlay}.querySelector('[data-outpaint-handle="${side}"]'),r=n.getBoundingClientRect(),area=${overlay}.querySelector('.op-area'),dx=${side === 'left' ? -40 : 0},dy=${side === 'top' ? -40 : 0};n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,clientX:r.x,clientY:r.y}));area.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,clientX:r.x+dx,clientY:r.y+dy}));area.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:r.x+dx,clientY:r.y+dy}))})()`,
    );
  }
  await checkCard('097-13 左上扩图标明尺寸不同并列出各块尺寸', true);
  await h.click('重置', overlay);
  for (const scenario of ['edges', 'partial', 'whole']) {
    if (scenario !== 'edges') {
      await start();
      await h.click('重置', overlay);
    }
    await square();
    await h.evaluate(
      `[...${overlay}.querySelectorAll('[role="radio"]')][${scenario === 'whole' ? 0 : 1}].click()`,
    );
    const before = (await call('version.list', { tabId })).versions.length;
    const jobsBefore = new Set((await call('generate.status')).jobs.map((j) => j.id));
    generationService.state.failAt =
      scenario === 'partial' ? generationService.state.requests.length + 2 : 0;
    await h.click('扩图', overlay);
    await h.wait(`!${overlay}`);
    const job = (await call('generate.status')).jobs.find((j) => !jobsBefore.has(j.id));
    const result = await waitJob(job.id);
    const expectedW = scenario === 'partial' ? W + Math.floor((H - W) / 128) * 64 : H;
    const state = `(() => { const img=document.querySelector('img[data-stage]');return img?.naturalWidth===${expectedW} && img?.naturalHeight===${H} && document.querySelector('.wb-body')?.textContent.includes('${expectedW} × ${H}') })()`;
    await h.wait(state, '扩图结果自动进入舞台并显示实际尺寸');
    await h.check(`扩图界面 ${scenario} 自动切换新图及实际尺寸`, state);
    const versions = (await call('version.list', { tabId })).versions;
    const record = database.loadProject(result.images[0]);
    await h.check(
      `扩图界面 ${scenario} 保存一版和正确图库尺寸`,
      () =>
        versions.length === before + 1 &&
        record.metadata.width === expectedW &&
        record.metadata.height === H,
    );
    await h.check(`扩图界面 ${scenario} 版本快照保存实际扩图尺寸`, () => {
      const snapshot = versions.find((v) => v.id === result.versionId)?.project.metadata;
      return snapshot?.width === expectedW && snapshot?.height === H;
    });
    await h.wait('!document.querySelector(\'[data-key="draft"]\')', '扩图完成后没有未生成行');
    await h.check(
      `扩图界面 ${scenario} 草稿与快照一致且没有未生成行`,
      '!document.querySelector(\'[data-key="draft"]\')',
    );
    await h.check(
      `扩图界面 ${scenario} 版本栏显示扩图标签`,
      `!![...document.querySelectorAll('[data-tip]')].find(e=>e.textContent==='扩图' && e.getAttribute('data-tip').includes('${scenario === 'partial' ? '只扩了' : '往外扩图'}'))`,
    );
    if (scenario === 'partial')
      await h.check(
        '第二块失败通知并保留第一块',
        `document.body.textContent.includes('扩图没画完')`,
      );
    await h.screenshot(`outpaint-${scenario}`);
  }
  generationService.state.failAt = 0;
}
