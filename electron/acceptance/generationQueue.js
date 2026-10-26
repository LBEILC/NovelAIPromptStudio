import { expectQueueCompletion } from './generationQueueWait.js';

export async function generationQueueChecks({ h, generationService }) {
  h.category('生成');
  const invoke = (name, input = {}) =>
    h.evaluate(`(async () => {
    const r = await window.studio.invoke(${JSON.stringify(name)}, ${JSON.stringify(input)});
    if (!r.ok) throw Error(r.error.message); return r.data;
  })()`);
  await invoke('account.save', { token: 'acceptance-token' });
  const { tab } = await invoke('workbench.new', { width: 64, height: 64 });
  const start = generationService.state.requests.length;
  generationService.state.holdAt = start + 1;
  const first = await invoke('generate.start', { tabId: tab.id, count: 1 });
  await generationService.waitForHold();
  try {
    const second = await invoke('generate.start', { tabId: tab.id, count: 1 });
    await invoke('generate.pause');
    generationService.state.resume();
    await expectQueueCompletion(h, first.id);
    const paused = await invoke('generate.status');
    await h.check(
      '生成中接排第二项，暂停后当前图片完成且后项未发送',
      () =>
        paused.paused &&
        paused.jobs.find((j) => j.id === second.id)?.state === 'queued' &&
        generationService.state.requests.length === start + 1,
    );
    await invoke('generate.resume');
    await expectQueueCompletion(h, second.id);
    const tree = await invoke('version.list', { tabId: tab.id });
    const generated = tree.versions.filter((v) => v.parentId);
    await h.check(
      '继续队列后两项各成一版，父版本均为提交时选择的版本',
      () =>
        generated.length === 2 &&
        generated.every((v) => v.parentId === first.parentId && v.images.length === 1),
    );
  } finally {
    generationService.state.resume?.();
    generationService.state.holdAt = 0;
  }
  await invoke('workbench.close', { tabId: tab.id });
}
