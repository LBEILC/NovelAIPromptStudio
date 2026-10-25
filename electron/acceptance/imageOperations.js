import path from 'node:path';
import sharp from 'sharp';
import { createWorkbenchFixtures } from './workbenchFixtures.js';

export async function imageOperationChecks({ h, mode, doubles, database, generationService }) {
  const { evaluate: e, click, wait, check } = h;
  h.category('放大与图生图');
  const invoke = (name, input = {}) =>
    e(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
    );
  await invoke('account.connection.save', { connection: 'official' });
  await invoke('account.save', { token: 'acceptance-token' });
  const [file] = await createWorkbenchFixtures(path.join(mode.root, 'image-operations'), {
    sizes: [[832, 1216]],
    prompts: ['synthetic geometric shape'],
    parameters: [{ model: 'nai-diffusion-5-full' }],
  });
  await click('工作台', 'document.querySelector(".tb")');
  doubles.selections.push({ canceled: false, filePaths: [file] });
  await h.key('i', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
  await wait(
    `window.studio.invoke('workbench.list',{}).then(r=>r.data.tabs.some(t=>t.id===r.data.activeTabId&&t.source.path===${JSON.stringify(file)}))`,
  );
  const tabId = (await invoke('workbench.list')).activeTabId;
  const current = async () => (await invoke('workbench.get', { tabId })).tab;
  const generated = async (action) => {
    const before = new Set((await invoke('generate.status')).jobs.map((j) => j.id));
    const versionIds = new Set((await invoke('version.list', { tabId })).versions.map((v) => v.id));
    await action();
    await h.until(
      async () =>
        (await invoke('generate.status')).jobs.some(
          (j) =>
            j.tabId === tabId && !before.has(j.id) && ['completed', 'failed'].includes(j.state),
        ),
      '图片操作完成',
    );
    const job = (await invoke('generate.status')).jobs.find(
      (j) => j.tabId === tabId && !before.has(j.id),
    );
    await check(
      '图片操作成功且结果入库',
      () =>
        job.state === 'completed' &&
        job.images.length === 1 &&
        !!database.loadProject(job.images[0]),
    );
    await wait(
      `document.querySelector('[data-key="ver-${job.versionId}"]')?.classList.contains('on') && document.querySelector('.stage .canvas img')?.naturalWidth>0`,
    );
    if (job.operation)
      await check('图片操作只新增一版并保留已有版本', async () => {
        const versions = (await invoke('version.list', { tabId })).versions;
        return (
          versions.length === versionIds.size + 1 &&
          !versionIds.has(job.versionId) &&
          [...versionIds].every((id) => versions.some((v) => v.id === id))
        );
      });
    return job;
  };
  await wait('!!document.querySelector("[data-trigger=ctl-0]")');
  await click('V5 控制词', 'document.querySelector(".doc")');
  await check(
    'V5 作品节入口打开控制词面板',
    'document.querySelector("[data-trigger=ctl-0]")?.getAttribute("aria-expanded")==="true" && !!document.querySelector(".popover:not(.leaving)")',
  );
  await h.key('Escape');
  await invoke('params.set', { tabId, patch: { model: 'nai-diffusion-4-5-full' } });
  await wait('!document.querySelector("[data-trigger=ctl-0]")');
  await check('V4.5 无控制词时隐藏入口', `!document.querySelector('[aria-label="V5 控制词"]')`);
  await invoke('params.set', { tabId, patch: { model: 'nai-diffusion-5-full' } });
  const source = await generated(() => click('生成', 'document.querySelector(".gen-bar")'));
  const sourceTab = await current();
  const selectSource = async () => {
    await e(`document.querySelector('[data-key="ver-${source.versionId}"]').click()`);
    await wait(
      `window.studio.invoke('workbench.get',{tabId:${JSON.stringify(tabId)}}).then(r=>r.data.tab.versionImageId===${JSON.stringify(sourceTab.versionImageId)})`,
    );
    await wait('document.querySelector(".stage .canvas img")?.naturalWidth===832');
  };
  await e(
    `document.querySelector('.stage .canvas img').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:400,clientY:300}))`,
  );
  await check(
    '舞台右键提供放大增强和底图入口',
    `['放大…','增强…','用这张做底图'].every(t=>[...document.querySelectorAll('[role=menuitem]')].some(n=>n.textContent.includes(t)))`,
  );
  await h.key('Escape');
  await e('document.querySelector("[data-trigger=op-upscale]").click()');
  await wait(
    'document.querySelector(".op-pop:not(.leaving)")?.textContent.includes("1664 × 2432")',
  );
  await check(
    '放大浮层显示原尺寸结果尺寸和价格',
    `['832 × 1216','1664 × 2432','1 Anlas'].every(t=>document.querySelector('.op-pop:not(.leaving)').textContent.includes(t))`,
  );
  const up = await generated(() =>
    click('放大', 'document.querySelector(".op-pop:not(.leaving)")'),
  );
  await check('放大新增版本有标签且文件宽高翻倍', async () => {
    const size = await sharp(database.loadProject(up.images[0]).image_path).metadata();
    return (
      size.width === 1664 &&
      size.height === 2432 &&
      (await e(
        `document.querySelector('[data-key="ver-${up.versionId}"] .src')?.textContent==='放大'`,
      ))
    );
  });
  await h.screenshot('076-upscale');
  await selectSource();
  await e('document.querySelector("[data-trigger=op-enhance]").click()');
  await wait('document.querySelector(".op-pop:not(.leaving)")?.textContent.includes("Max")');
  await check(
    '增强提供幅度一到五及 V5 Max 档',
    `['1','2','3','4','5'].every(t=>[...document.querySelectorAll('.op-pop [aria-label="幅度"] [role=radio]')].some(n=>n.textContent===t)) && document.querySelector('.op-pop').textContent.includes('Max')`,
  );
  await click('Max', 'document.querySelector(".op-pop:not(.leaving)")');
  await wait(
    'document.querySelector(".op-pop:not(.leaving)")?.textContent.includes("1467 × 2144")',
  );
  await check(
    '增强 Max 显示结果尺寸',
    'document.querySelector(".op-pop:not(.leaving)").textContent.includes("1467 × 2144")',
  );
  const enhanced = await generated(() =>
    click('增强', 'document.querySelector(".op-pop:not(.leaving)")'),
  );
  await check(
    '增强新增版本带增强标签',
    `document.querySelector('[data-key="ver-${enhanced.versionId}"] .src')?.textContent==='增强'`,
  );
  await selectSource();
  await click('参考');
  await click('用当前这张');
  await wait('!!document.querySelector(".base-row")');
  await check(
    '底图显示默认强度和噪声',
    'document.querySelector(".base-row [aria-label=强度]")?.getAttribute("aria-valuenow")==="0.7" && document.querySelector(".base-row [aria-label=噪声]")?.getAttribute("aria-valuenow")==="0"',
  );
  await e(
    `document.querySelector('.base-row [aria-label="强度"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`,
  );
  await h.until(
    async () => Math.abs((await current()).project.references.base.strength - 0.69) < 1e-9,
    '底图强度保存',
  );
  const img2img = await generated(() => click('生成', 'document.querySelector(".gen-bar")'));
  await check(
    '调整底图后生成带图生图标签且请求使用新强度',
    async () =>
      generationService.state.requests.at(-1).action === 'img2img' &&
      Math.abs(generationService.state.requests.at(-1).parameters.strength - 0.69) < 1e-9 &&
      (await e(
        `document.querySelector('[data-key="ver-${img2img.versionId}"] .src')?.textContent==='图生图'`,
      )),
  );
  await click('移除底图');
  await wait('!document.querySelector(".base-row")');
  const plain = await generated(() => click('生成', 'document.querySelector(".gen-bar")'));
  await check(
    '移除底图后生成没有操作标签且不发送底图',
    async () =>
      generationService.state.requests.at(-1).action !== 'img2img' &&
      !generationService.state.requests.at(-1).parameters.image &&
      (await e(`!document.querySelector('[data-key="ver-${plain.versionId}"] .src')`)),
  );
  await click('图片库', 'document.querySelector(".tb")');
  await click('全部图片', 'document.querySelector(".libp")');
  await wait('!!document.querySelector(".card")');
  await e(
    `document.querySelector('.card').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:250}))`,
  );
  await click('在工作台用作底图');
  await click('工作台', 'document.querySelector(".tb")');
  await click('参考');
  await wait('!!document.querySelector(".base-row")');
  await check(
    '图片库右键把图片设为当前标签页底图',
    async () =>
      (await invoke('workbench.list')).activeTabId === tabId &&
      !!(await current()).project.references.base,
  );
  await h.screenshot('076-base-image');
}
