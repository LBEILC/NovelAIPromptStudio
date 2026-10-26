import sharp from 'sharp';

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
        (!partial ||
          (finished.failedEdges?.join(',') === 'top' &&
            operation.failedEdges?.join(',') === 'top' &&
            !!finished.failure))
      );
    });
  }
  generationService.state.failAt = 0;
  generationService.state.holdAt = 0;
}
