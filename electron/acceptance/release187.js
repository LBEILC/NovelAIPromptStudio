import { commandFor, contextMenu, menuRoot } from './release186.js';
import { expectQueueCompletion } from './generationQueueWait.js';

export async function director187Checks({ h, generationService }) {
  h.category('生成');
  const balance = generationService.state.balance;
  const call = commandFor(h);
  await call('account.connection.save', { connection: 'official' });
  await call('account.save', { token: 'acceptance-token' });
  await call('generate.resume');
  const { tab } = await call('workbench.new', { width: 512, height: 512 });
  const tabId = tab.id;
  await call('prompt.set', { tabId, scope: 'base:prompt', text: 'synthetic director study' });
  await expectQueueCompletion(h, (await call('generate.start', { tabId, count: 1 })).id);
  await h.click('工作台', 'document.querySelector(".tb")');
  await contextMenu(h, '[data-tag-key]');
  await h.click('设置分类', menuRoot);
  await h.click('外貌身体', 'document.querySelector(".submenu")');
  await h.until(
    async () =>
      (await call('workbench.get', { tabId })).tab.project.tags.some(
        (t) => t.tag === 'synthetic director study' && t.category === 'Body',
      ),
    'Tag 子菜单分类保存',
  );
  await h.check('096-08 Tag 子菜单 DOM 点击修改真实分类', async () =>
    (await call('workbench.get', { tabId })).tab.project.tags.some(
      (t) => t.tag === 'synthetic director study' && t.category === 'Body',
    ),
  );
  const current = async () => (await call('workbench.get', { tabId })).tab;
  const versions = async () => (await call('version.list', { tabId })).versions;
  const pop = 'document.querySelector(".dir-pop:not(.leaving)")';
  const open = async () => {
    await h.evaluate("document.querySelector('[data-trigger=op-director]').click()");
    await h.wait(`${pop}?.querySelector('.op-foot button:not(:disabled)')`);
  };
  const tool = async (id) => {
    await h.evaluate(`document.querySelector('[data-director-tool="${id}"]').click()`);
    await h.wait(`${pop}?.querySelector('.op-foot button:not(:disabled)')`);
  };
  const go = async () => {
    const ids = new Set((await call('generate.status')).jobs.map((j) => j.id));
    await h.evaluate("document.querySelector('.dir-pop:not(.leaving) .op-foot button').click()");
    let job;
    await h.until(async () => {
      job = (await call('generate.status')).jobs.find((j) => j.tabId === tabId && !ids.has(j.id));
      return !!job;
    }, '导演任务入队');
    await expectQueueCompletion(h, job.id);
    job = (await call('generate.status', { id: job.id })).jobs[0];
    await h.wait(
      `!!document.querySelector('[data-key="ver-${job.versionId}"]') && !document.querySelector('.dir-pop')`,
    );
    return (await versions()).find((v) => v.id === job.versionId);
  };
  await open();
  const estimate = await call('generate.estimate-director', {
    tabId,
    imageId: (await current()).versionImageId,
    tool: 'lineart',
  });
  await h.check(
    '096-01 导演入口提供六种工具、默认线稿和命令估价',
    `${pop}.querySelectorAll('[data-director-tool]').length===6 && ${pop}.querySelector('.dir-tool.on')?.dataset.directorTool==='lineart' && ${pop}.querySelector('.op-price b')?.textContent===${JSON.stringify(estimate.free ? '免费' : `${estimate.anlas} Anlas`)}`,
  );
  await tool('bg-removal');
  const three = await h.evaluate(`${pop}.querySelector('.op-size').textContent.includes('3 张')`);
  const bg = await go();
  const bgImage = (await call('library.get', { id: bg.images[0].projectId })).project;
  await h.wait(
    `document.querySelector('img[data-stage]:not(.leaving)')?.getAttribute('src')==='novelai-media://file?path='+encodeURIComponent(${JSON.stringify(bgImage.image_path)})`,
  );
  const bgThumbnails = `(()=>{const tips=[...document.querySelectorAll('[data-key="ths-${bg.id}"] [data-tip]')].map(e=>e.dataset.tip);return ['抠图','补全','混合'].every((t,i)=>tips[i]?.startsWith(t))})()`;
  await h.wait(bgThumbnails, '去背景的三个结果已同步到版本栏');
  await h.check(
    '096-02 去背景生成三种结果、缩略图说明并切到首张',
    async () =>
      three &&
      bg.operation.kind === 'director' &&
      bg.operation.tool === 'bg-removal' &&
      bg.images.map((i) => i.variant).join(',') === 'masked,generated,blend' &&
      (await h.evaluate(bgThumbnails)),
  );
  await open();
  await tool('emotion');
  await h.evaluate("document.querySelector('.dir-dd').click()");
  await h.click('生气', menuRoot);
  await h.click('弱', `${pop}.querySelector('.dir-seg')`);
  await h.input('[aria-label="换表情的附加提示词"]', 'tears');
  await go();
  await h.check('096-03 换表情发送生气、补充词和弱强度', () => {
    const r = generationService.state.requests.at(-1);
    return r.req_type === 'emotion' && r.prompt === 'angry;;tears' && r.defry === 2;
  });
  await open();
  await tool('colorize');
  await h.click('正常', `${pop}.querySelector('.dir-seg')`);
  await h.input('[aria-label="上色提示词"]', 'synthetic cyan pigment');
  await go();
  await h.check('096-04 上色发送合成颜色和默认强度', () => {
    const r = generationService.state.requests.at(-1);
    return r.req_type === 'colorize' && r.prompt === 'synthetic cyan pigment' && r.defry === 0;
  });
  await call('prompt.set-size', { tabId, width: 768, height: 1024 });
  await open();
  await tool('lineart');
  await go();
  await h.check('096-05 导演工具保留草稿尺寸且没有未生成尺寸行', async () => {
    const m = (await current()).project.metadata;
    return (
      m.width === 768 &&
      m.height === 1024 &&
      (await h.evaluate(
        `!document.querySelector('.versions').textContent.includes('未生成 · 尺寸')`,
      ))
    );
  });
  await contextMenu(h, 'img[data-stage]:not(.leaving)');
  await h.click('导演工具', menuRoot);
  await h.click('草图…', 'document.querySelector(".submenu")');
  await h.wait(`${pop}?.querySelector('.dir-tool.on')?.dataset.directorTool==='sketch'`);
  await h.check(
    '096-06 舞台子菜单 DOM 点击打开草图工具',
    `${pop}?.querySelector('.dir-tool.on')?.dataset.directorTool==='sketch'`,
  );
  await h.key('Escape');
  await h.wait('!document.querySelector(".dir-pop")');
  const source = (await current()).versionImageId;
  const enhanced = await call('generate.enhance', {
    tabId,
    imageId: source,
    magnitude: 2,
    scale: 1.5,
  });
  await expectQueueCompletion(h, enhanced.id);
  const v = (await versions()).at(-1);
  await h.wait(
    `document.querySelector('[data-key="ver-${v.id}"] .what')?.textContent.includes('尺寸')`,
  );
  await h.check('096-18 增强保留草稿尺寸并注明尺寸变化', async () => {
    const m = (await current()).project.metadata;
    return (
      m.width === 768 &&
      m.height === 1024 &&
      (await h.evaluate(
        `document.querySelector('[data-key="ver-${v.id}"] .what').textContent.includes('→')`,
      ))
    );
  });
  await call('account.relay.save', {
    baseUrl: generationService.url + '/v1',
    key: 'acceptance-token',
  });
  await call('account.connection.save', { connection: 'relay' });
  await h.wait(
    `document.querySelector('[data-trigger="op-director"]')?.getAttribute('aria-disabled')==='true'`,
  );
  await contextMenu(h, 'img[data-stage]:not(.leaving)');
  await h.check(
    '096-07 中转站禁用导演按钮及右键入口',
    `document.querySelector('[data-trigger="op-director"]').dataset.tip.includes('中转站不支持导演工具') && [...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.includes('导演工具')&&e.getAttribute('aria-disabled')==='true')`,
  );
  await h.key('Escape');
  await call('account.connection.save', { connection: 'official' });
  await h.screenshot('096-director');
  await call('workbench.close', { tabId });
  // Keep the shared fake account baseline for the following account scenarios.
  generationService.state.balance = balance;
  await call('account.refresh');
}
