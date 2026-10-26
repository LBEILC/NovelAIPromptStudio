import { commandFor, contextMenu, menuRoot, toastRoot } from './release186.js';
import { expectQueueCompletion } from './generationQueueWait.js';

export async function generation186Checks({ h, generationService }) {
  const call = commandFor(h);
  await call('account.connection.save', { connection: 'official' });
  await call('account.save', { token: 'acceptance-token' });
  await call('generate.resume');
  await h.click('工作台', 'document.querySelector(".tb")');
  const { item: pool } = await call('material.pool.create', { name: '合成生成池' });
  await call('material.pool.replace', {
    id: pool.id,
    text: 'synthetic red\nsynthetic blue\nsynthetic green',
  });
  const { tab } = await call('workbench.new', { width: 64, height: 64 });
  await call('prompt.set', { tabId: tab.id, scope: 'base:prompt', text: '__合成生成池*2__' });
  const first = await call('generate.start', { tabId: tab.id, count: 3 });
  await expectQueueCompletion(h, first.id);
  const tree = (await call('version.list', { tabId: tab.id })).versions.filter((v) => !v.isStart);
  const version = tree.at(-1);
  const thumbs = `[data-key="ths-${version.id}"]`;
  await h.wait(`document.querySelectorAll('${thumbs} [data-tip^="抽到的内容"]').length===3`);
  const recorded = tree.length === 1 && version.images.length === 3;
  await contextMenu(h, `${thumbs} span:has(img)`);
  await h.click('用这张抽到的内容', menuRoot);
  const raw = async () =>
    (await call('workbench.get', { tabId: tab.id })).tab.project.metadata.prompt_raw;
  await h.until(async () => !(await raw()).includes('__'), '使用本张随机结果');
  const applied = await raw();
  await h.click('撤销', toastRoot);
  await h.until(async () => (await raw()).includes('__'), '撤销随机结果');
  await h.check(
    '091-10 三张随机结果同版，缩略图记录可应用并撤销',
    async () => recorded && !applied.includes('__') && (await raw()) === '__合成生成池*2__',
  );

  h.category('生成');
  await call('prompt.set', { tabId: tab.id, scope: 'base:prompt', text: 'synthetic queue study' });
  generationService.state.holdAt = generationService.state.requests.length + 1;
  const running = await call('generate.start', { tabId: tab.id, count: 1 });
  await generationService.waitForHold();
  try {
    await h.wait('document.querySelector(".gen-bar")?.textContent.includes("加入队列")');
    const countVisible = await h.evaluate('!!document.querySelector(".gen-bar .stepper")');
    await h.click('加入队列', 'document.querySelector(".gen-bar")');
    const queued = async () =>
      (await call('generate.status')).jobs.filter((j) => j.state === 'queued');
    await h.until(async () => (await queued()).some((j) => j.tabId === tab.id), '底栏加入队列');
    const second = (await queued()).find((j) => j.tabId === tab.id);
    await h.check(
      '091-11 生成中保留张数控件并能给同标签页接排',
      () => countVisible && second.tabId === tab.id,
    );
    await h.evaluate('document.querySelector("[data-trigger=queue]:not(.leaving)").click()');
    await h.wait(
      '!!document.querySelector(".queue .q-run") && !!document.querySelector(".queue .q-job")',
    );
    await h.check(
      '091-12 标题栏队列面板显示运行项和排队项',
      'document.querySelector(".queue .q-top b")?.textContent==="生成队列" && !!document.querySelector(".queue .q-run") && !!document.querySelector(".queue .q-job")',
    );
    const row = (id) => `document.querySelector('[data-qid="${id}"]')`;
    await h.evaluate(`${row(second.id)}.querySelector('.q-count').click()`);
    await h.input('.q-count-in', '8');
    await h.key('Enter');
    await h.until(
      async () => (await queued()).find((j) => j.id === second.id)?.count === 8,
      '队列张数修改',
    );
    await h.check(
      '091-13 排队项张数回车保存为八张',
      async () => (await queued()).find((j) => j.id === second.id)?.count === 8,
    );
    const menu = async (id, label) => {
      await h.click('这一项的操作', row(id));
      await h.click(label, menuRoot);
    };
    await menu(second.id, '暂缓');
    await h.wait(`${row(second.id)}?.classList.contains('deferred')`);
    const deferred = (await queued()).find((j) => j.id === second.id).deferred;
    await menu(second.id, '恢复');
    await h.wait(`!${row(second.id)}?.classList.contains('deferred')`);
    const third = await call('generate.start', { tabId: tab.id, count: 2 });
    await h.wait(`!!${row(third.id)}`);
    await menu(third.id, '移到最前');
    await h.until(async () => (await queued())[0]?.id === third.id, '移到队首');
    await h.check(
      '091-14 暂缓、恢复和移到最前更新队列',
      async () =>
        deferred &&
        !(await queued()).find((j) => j.id === second.id).deferred &&
        (await queued())[0].id === third.id,
    );
    await h.evaluate(
      `${row(second.id)}.querySelector('.q-grip').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}))`,
    );
    await h.wait(`${row(second.id)}.classList.contains('dragging')`);
    await h.evaluate(
      `window.dispatchEvent(new PointerEvent('pointermove',{clientY:${row(third.id)}.getBoundingClientRect().top-1}))`,
    );
    await h.wait(
      `document.querySelector('.q-list [data-qid]')?.dataset.qid===${JSON.stringify(second.id)}`,
    );
    await h.evaluate("window.dispatchEvent(new PointerEvent('pointerup'))");
    await h.until(async () => (await queued())[0]?.id === second.id, '拖动排序落库');
    await h.check(
      '091-15 拖动第二项到第一项上方保存顺序',
      async () => (await queued())[0].id === second.id,
    );
    await menu(second.id, '移除');
    await h.until(async () => !(await queued()).some((j) => j.id === second.id), '移除排队项');
    await h.click('撤销', toastRoot);
    await h.until(async () => (await queued())[0]?.id === second.id, '撤销恢复原位');
    await h.check(
      '091-16 移除后撤销恢复原位和八张数量',
      async () => (await queued())[0].id === second.id && (await queued())[0].count === 8,
    );
    await h.click('暂停队列', 'document.querySelector(".queue")');
    await h.until(async () => (await call('generate.status')).paused, '暂停队列');
    generationService.state.resume();
    await expectQueueCompletion(h, running.id);
    await h.wait(
      'document.querySelector("[data-trigger=queue]:not(.leaving)")?.textContent.includes("队列已暂停")',
    );
    const paused = (await call('generate.status')).paused;
    // Hold the next real loopback request so resume can be observed deterministically.
    generationService.state.holdAt = generationService.state.requests.length + 1;
    await h.click('继续', 'document.querySelector(".queue")');
    await generationService.waitForHold();
    await h.check(
      '091-17 暂停显示队列已暂停，继续后恢复发送',
      async () => paused && !(await call('generate.status')).paused,
    );
    await h.screenshot('091-queue');
  } finally {
    await call('generate.pause');
    for (const job of (await call('generate.status')).jobs.filter(
      (j) => j.tabId === tab.id && ['queued', 'generating'].includes(j.state),
    )) {
      if (job.state === 'generating') await call('generate.stop', { id: job.id });
      else await call('generate.cancel', { ids: [job.id] });
    }
    generationService.state.resume?.();
    generationService.state.holdAt = 0;
    await h.until(
      async () =>
        !(await call('generate.status')).jobs.some(
          (j) => j.tabId === tab.id && j.state === 'generating',
        ),
      '夹具当前请求收尾',
    );
    await call('generate.resume');
    await h.key('Escape');
    await call('workbench.close', { tabId: tab.id });
    await call('material.pool.delete', { id: pool.id });
  }
}
