import path from 'node:path';
import { spawn } from 'node:child_process';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { importLibraryFiles } from '../importer.js';

export async function generationChecks({
  app,
  h,
  mode,
  doubles,
  database,
  generationService,
  preferences,
}) {
  const { evaluate: e, click, input, wait, check } = h;
  h.category('生成');
  const script = path.join(app.getAppPath(), 'agent', 'nai-studio.mjs');
  const userData = app.getPath('userData');
  const cli = (name, input = {}, entry = script) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [entry, name, '--json', JSON.stringify(input)], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          NAI_STUDIO_USER_DATA: userData,
          NAI_STUDIO_NO_LAUNCH: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (data) => {
        stdout += data;
      });
      child.stderr.on('data', (data) => {
        stderr += data;
      });
      const timeout = setTimeout(() => {
        child.kill();
        reject(Error(`CLI timeout: ${name}`));
      }, 20000);
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        try {
          resolve({ code, result: JSON.parse(stdout.trim()) });
        } catch {
          reject(Error(`CLI ${name}: ${stderr}\n${stdout}`));
        }
      });
    });
  const call = async (name, input = {}, entry = script) => {
    const response = await cli(name, input, entry);
    if (response.code !== 0 || !response.result.ok)
      throw Error(`${name}: ${JSON.stringify(response)}`);
    return response.result.data;
  };

  const files = await createWorkbenchFixtures(path.join(mode.root, 'generation-fixtures'));
  await click('工作台', 'document.querySelector(".tb")');
  doubles.selections.push({ canceled: false, filePaths: [files[0]] });
  await click('打开图片', 'document.querySelector(".tb")');
  await wait(
    `(async()=>{const list=(await window.studio.invoke('workbench.list',{})).data;if(!list.activeTabId)return false;const current=(await window.studio.invoke('workbench.get',{tabId:list.activeTabId})).data;return current.tab.source.path===${JSON.stringify(files[0])}&&document.querySelector('.wb-body')?.dataset.projectId===current.tab.project.id&&document.querySelector('[data-tab="'+list.activeTabId+'"]')?.getAttribute('aria-selected')==='true'&&!document.querySelector('.app-page-surface.leaving')&&!!document.querySelector('.doc')})()`,
    '新生成夹具打开完成后再进入设置',
  );
  await check(
    '没有令牌时底栏提供生成引导且不展示生成参数',
    '!!document.querySelector(".gen-bar")&&!document.querySelector(".gen-bar .seedf")',
  );
  await click('生成', 'document.querySelector(".wb-body .gen-bar")');
  await wait('!!document.querySelector(".notoken:not(.leaving)")');
  await check(
    '无令牌生成显示配置引导',
    'document.body.innerText.includes("持久令牌后，就可以在这里生成新的一版")',
  );
  await h.screenshot('generation-no-token-guide');
  await h.key('Escape');
  await check('Esc 关闭令牌引导', '!document.querySelector(".popover:not(.leaving)")');
  await click('生成');
  await click('去设置');
  await wait('!!document.querySelector("[data-settings-section=novelai]")');
  await check(
    '生成引导打开 NovelAI 账号页',
    '!!document.querySelector("[data-settings-section=novelai] [aria-label=持久令牌]")',
  );
  await input('[aria-label="持久令牌"]', 'wrong-token');
  await click('保存', 'document.querySelector("[data-settings-section=novelai]")');
  await wait('document.body.innerText.includes("保存失败：持久令牌无效")');
  await check(
    '无效令牌不保存',
    'document.body.innerText.includes("保存失败：持久令牌无效")&&!document.body.innerText.includes("已保存 ••••••••")',
  );
  await input('[aria-label="持久令牌"]', 'acceptance-token');
  await click('保存', 'document.querySelector("[data-settings-section=novelai]")');
  await wait('!!document.querySelector(".gen-bar")');
  await check(
    '保存令牌后返回工作台并可生成',
    'document.querySelector(".tb [aria-current=page]")?.textContent.trim()==="工作台"&&!!document.querySelector(".gen-bar")',
  );
  await h.section('NovelAI 账号');
  await check(
    '正确令牌显示余额与用量',
    `document.body.innerText.includes('10,000 Anlas')&&!!document.querySelector('[aria-label="V5 免费用量"]')`,
  );
  await click('工作台', 'document.querySelector(".tb")');
  await wait('!!document.querySelector(".gen-bar")');
  await h.screenshot('034-08-versions-original');
  const tabId = await e('window.studio.invoke("workbench.list",{}).then(r=>r.data.activeTabId)');
  await e(
    `window.studio.invoke('prompt.set',{tabId:${JSON.stringify(tabId)},scope:'base:prompt',text:'rain, cloud'})`,
  );
  await wait('document.querySelector(".ver.draft")?.textContent.includes("未生成")');
  await click('增加张数');
  await click('增加张数');
  await wait('!document.querySelector(".gen-bar button.seal")?.disabled');
  await click('生成', 'document.querySelector(".gen-bar")');
  await wait('document.querySelectorAll(".ver.on .ths img").length===3', '三张生成完成');
  await check('生成三张全部入库且舞台停在第一张', async () => {
    const r = await e(`window.studio.invoke('generate.status',{}).then(r=>r.data)`);
    const j = r.jobs.find((j) => j.tabId === tabId);
    const t = await e(
      `window.studio.invoke('workbench.get',{tabId:${JSON.stringify(tabId)}}).then(r=>r.data.tab)`,
    );
    return (
      j.completed === 3 &&
      t.versionImageId === j.images[0] &&
      j.images.every((id) => !!database.loadProject(id))
    );
  });
  await check('提示词改动生成独立版本并保持草稿内容', async () => {
    const tree = await e(
      `window.studio.invoke('version.list',{tabId:${JSON.stringify(tabId)}}).then(r=>r.data)`,
    );
    return (
      tree.versions.length === 2 && tree.versions[1].project.metadata.prompt_raw === 'rain, cloud'
    );
  });
  await check('生成请求保持全软件串行', () => generationService.state.maxActive === 1);
  await wait('!!document.querySelector(".stage .canvas img")?.naturalWidth');
  await check(
    '生成后舞台图片在版本栏中唯一标为当前',
    `(async()=>{
    const t=(await window.studio.invoke('workbench.get',{tabId:${JSON.stringify(tabId)}})).data.tab;
    const images=[...document.querySelectorAll('.ths .is-cur')];
    const stage=document.querySelector('.stage .canvas img');
    const image=(await window.studio.invoke('library.get',{id:t.versionImageId})).data.project;
    return images.length===1 && images[0].querySelector('img')?.getAttribute('src')==='novelai-media://file?path='+encodeURIComponent(image.thumbnail_path||image.image_path) && stage?.getAttribute('src')==='novelai-media://file?path='+encodeURIComponent(image.image_path);
  })()`,
  );
  await h.screenshot('generation-three-images');
  await h.screenshot('034-08-versions-multiple');
  await wait(
    `window.studio.invoke('generate.status',{}).then(r=>r.data.jobs.filter(j=>j.tabId===${JSON.stringify(tabId)}).every(j=>j.state==='completed'))`,
    '上一批完成结算后再测试停止',
  );
  generationService.state.holdAt = generationService.state.requests.length + 1;
  await click('生成', 'document.querySelector(".gen-bar")');
  await h.until(() => !!generationService.state.resume, '当前图片请求到达假服务后再停止');
  await wait('document.body.innerText.includes("停止")');
  await click('停止', 'document.querySelector(".gen-bar")');
  await wait(
    `window.studio.invoke('generate.status',{}).then(r=>r.data.jobs.some(j=>j.tabId===${JSON.stringify(tabId)}&&j.state==='generating'&&j.stop))`,
    '停止命令已写入队列后返回当前图片',
  );
  const stoppedId = await e(
    `window.studio.invoke('generate.status',{}).then(r=>r.data.jobs.find(j=>j.tabId===${JSON.stringify(tabId)}&&j.state==='generating'&&j.stop).id)`,
  );
  const requestsAtStop = generationService.state.requests.length;
  generationService.state.resume();
  await wait(
    `window.studio.invoke('generate.status',{id:${JSON.stringify(stoppedId)}}).then(r=>r.data.jobs[0].state==='canceled')`,
    '停止后的当前图片已入库且队列结束',
  );
  await check('停止后只完成当前这一张', async () => {
    const job = await e(
      `window.studio.invoke('generate.status',{id:${JSON.stringify(stoppedId)}}).then(r=>r.data.jobs[0])`,
    );
    return (
      job.completed === 1 &&
      job.images.length === 1 &&
      !!database.loadProject(job.images[0]) &&
      generationService.state.requests.length === requestsAtStop
    );
  });
  generationService.state.delay = 20;
  generationService.state.failNext = 500;
  await click('生成', 'document.querySelector(".gen-bar")');
  await wait('document.body.innerText.includes("生成失败：NovelAI 服务繁忙")');
  await check(
    '失败显示叉与准确错误',
    '!!document.querySelector(".slot.fail")&&document.body.innerText.includes("本次未消耗 Anlas")',
  );
  await click('重试');
  await wait('!document.querySelector(".slot.fail")');
  await wait('document.querySelectorAll(".versions .ths > span:has(img)").length>=5');
  await wait(
    `window.studio.invoke('generate.status',{}).then(r=>r.data.jobs.filter(j=>j.tabId===${JSON.stringify(tabId)}).every(j=>!['queued','generating'].includes(j.state)))`,
    '重试生成结束后再编辑下一版',
  );
  const invoke = (name, args = {}) =>
    e(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(args)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data;})`,
    );
  const tree = await invoke('version.list', { tabId }),
    second = tree.versions[1];
  await invoke('prompt.set', { tabId, scope: 'base:prompt', text: 'rain, cloud, sunshine' });
  const mainJob = await invoke('generate.start', { tabId, count: 1 });
  await wait(
    `window.studio.invoke('generate.status',{id:${JSON.stringify(mainJob.id)}}).then(r=>r.data.jobs[0]?.state==='completed')`,
    '主线生成完成后再切回旧版',
  );
  await wait('document.querySelectorAll(".ver[data-key^=ver-]").length>=3');
  await e(`document.querySelector('[data-key="ver-${second.id}"]').click()`);
  await wait(
    `window.studio.invoke('workbench.get',{tabId:${JSON.stringify(tabId)}}).then(r=>r.data.tab.versionId===${JSON.stringify(second.id)})`,
    '旧版切换写入后再改提示词',
  );
  await invoke('prompt.set', { tabId, scope: 'base:prompt', text: 'rain, cloud, snow' });
  const branchJob = await invoke('generate.start', { tabId, count: 1 });
  await wait(
    `window.studio.invoke('generate.status',{id:${JSON.stringify(branchJob.id)}}).then(r=>r.data.jobs[0]?.state==='completed'&&r.data.jobs[0].branchNotice==='已从第 2 版分出分支 1')`,
    '分支生成完成并保留分叉结果',
  );
  await check(
    '旧版生成分出固定编号分支并显示分叉行',
    'document.querySelector(".versions .br-head")?.textContent.includes("分支 1")&&!!document.querySelector(".ver.fork")',
  );
  await e(
    `document.querySelector('.versions .br-head').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:120}))`,
  );
  await h.screenshot('034-08-versions-branch');
  await click('重命名分支…');
  await input('[aria-label="分支名称"]', '雪景');
  await click('确定');
  await wait('document.querySelector(".versions .br-head")?.textContent.includes("雪景")');
  await e(`document.querySelector('.ver.fork').click()`);
  await check(
    '切回原分支后分叉行保留改名',
    'document.querySelector(".versions .br-head")?.textContent.includes("主线")&&document.querySelector(".ver.fork")?.textContent.includes("雪景")',
  );
  await e(
    `document.querySelector('.versions .ths > span:has(img)').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:200}))`,
  );
  const beforeNewWork = await invoke('workbench.list');
  await click('作为新作品打开');
  await wait('document.body.innerText.includes("来自")');
  await check('从图片打开新作品记录来源', async () => {
    const tabs = await invoke('workbench.list');
    return tabs.tabs.length === beforeNewWork.tabs.length + 1 && tabs.activeTabId !== tabId;
  });
  await e(`document.querySelector('.versions .from').click()`);
  await wait(
    `window.studio.invoke('workbench.list',{}).then(r=>r.data.activeTabId===${JSON.stringify(tabId)})`,
  );
  await check(
    '来源标记可以跳回原作品',
    async () => (await invoke('workbench.list')).activeTabId === tabId,
  );
  await click('832×1216', 'document.querySelector(".gen-bar")');
  await click('横图1216×832');
  await wait(
    'document.querySelector(".size-btn")?.textContent.includes("1216×832")&&document.querySelector(".ver.draft .what")?.textContent.startsWith("尺寸")',
  );
  await check(
    '横图免费且尺寸变化位于摘要第一行',
    'document.querySelector(".ver.draft .what")?.textContent.startsWith("尺寸 832×1216→1216×832")',
  );
  await click('1216×832', 'document.querySelector(".gen-bar")');
  await click('自定义…');
  await input('[aria-label=宽]', '1000');
  await input('[aria-label=高]', '1500');
  await check(
    '自定义尺寸取最近的 64 倍数',
    'document.body.innerText.includes("将使用 1024×1472")&&document.body.innerText.includes("超出免费范围")',
  );
  await click('确定');
  await wait('document.body.innerText.includes("改成 832×1216")');
  await h.screenshot('033-fix-paid-banner');
  await click('改成 832×1216');
  await wait('!document.body.innerText.includes("改成 832×1216")');
  // 034: exercise final user-visible state through the actual controls.
  await e('document.querySelector(".count-n").click()');
  await input('[aria-label="张数"]', '1');
  await h.key('Enter');
  await e('document.querySelector(".gen-bar button.seed-val").click()');
  await input('[aria-label="Seed"]', '1234567890');
  await h.screenshot('034-04-seed-edit');
  await h.key('Enter');
  const sent = generationService.state.requests.length;
  await click('生成', 'document.querySelector(".gen-bar")');
  await wait(
    `window.studio.invoke('generate.status',{}).then(r=>r.data.jobs.filter(j=>j.tabId===${JSON.stringify(tabId)}).every(j=>!['queued','generating'].includes(j.state)))`,
  );
  await check(
    '手输 Seed 用于下一次生成',
    () =>
      generationService.state.requests.length === sent + 1 &&
      generationService.state.requests.at(-1).parameters.seed === 1234567890,
  );
  await e('document.querySelector(".gen-bar button.seed-val").click()');
  await input('[aria-label="Seed"]', '4294967296');
  await h.key('Enter');
  await check(
    '超范围 Seed 提示并恢复原值',
    'document.body.innerText.includes("Seed 只能是 0 到 4294967295 的整数")&&document.querySelector(".seed-val").textContent==="1234567890"',
  );
  await e('document.querySelector(".gen-bar button.seed-val").click()');
  await input('[aria-label="Seed"]', '0');
  await h.key('Escape');
  await check(
    'Esc 取消 Seed 编辑',
    'document.querySelector("button.seed-val")?.textContent==="1234567890"',
  );
  await e('document.querySelector(".gen-bar button.seed-val").click()');
  await input('[aria-label="Seed"]', '');
  await h.key('Enter');
  await click('生成', 'document.querySelector(".gen-bar")');
  await wait(
    `window.studio.invoke('generate.status',{}).then(r=>r.data.jobs.filter(j=>j.tabId===${JSON.stringify(tabId)}).every(j=>!['queued','generating'].includes(j.state)))`,
  );
  await check('Seed 清空后恢复随机生成', async () => {
    const jobs = (await invoke('generate.status')).jobs;
    return (
      !jobs.at(-1).fixedSeed &&
      generationService.state.requests.length === sent + 2 &&
      (await e('document.querySelector(".seed-val")?.textContent==="随机"'))
    );
  });
  generationService.state.tier = 1;
  await invoke('account.refresh');
  await invoke('settings.generation.save', { continuous: true });
  await e('document.querySelector(".gen-bar button.seed-val").click()');
  await input('[aria-label="Seed"]', '1234567890');
  await h.key('Enter');
  await invoke('settings.generation.save', { continuous: false });
  for (const outside of ['.stage .canvas', '.versions', '.tb']) {
    await e(
      `document.querySelector('.ver[data-key^=ver-]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:200}))`,
    );
    await wait('!!document.querySelector(".menu:not(.leaving)")');
    await h.screenshot('034-05-menu');
    await e(
      `document.querySelector(${JSON.stringify(outside)}).dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`,
    );
    await wait('!document.querySelector(".menu:not(.leaving)")');
    await check(
      `右键菜单在 ${outside} 按下后关闭`,
      '!document.querySelector(".menu:not(.leaving)")',
    );
  }
  generationService.state.balance = 0;
  generationService.state.tier = 0;
  await invoke('account.refresh');
  await wait('document.querySelector(".cost")?.classList.contains("short")');
  await check(
    '余额不足时禁用生成',
    'document.querySelector(".gen-bar button.seal").getAttribute("aria-disabled")==="true"',
  );
  generationService.state.balance = 10000;
  generationService.state.tier = 3;
  await invoke('account.refresh');
  const before = await invoke('workbench.get', { tabId });
  const pending = await call('generate.start', { tabId, count: 1 });
  await wait('document.body.innerText.includes("Agent 待确认 · 1")');
  await check('真实命令行生成进入待确认且没有发请求', () => pending.state === 'pending');
  await e(`document.querySelector('.ver.on').focus()`);
  await click('Agent 待确认 · 1');
  // Drain the deferred version preview after focus has moved to confirmation.
  await e('new Promise(resolve=>setTimeout(resolve,450))');
  await check(
    'Agent确认不被已失焦版本的延迟对比浮层关闭',
    `!!document.querySelector('.queue:not(.leaving)')`,
  );
  await click('生成 1 张');
  await wait('!document.body.innerText.includes("Agent 待确认 · 1")');
  await h.wait(
    `window.studio.invoke('generate.status',{id:${JSON.stringify(pending.id)}}).then(r=>r.data.jobs[0].state==='completed')`,
  );
  await check('Agent 结果另起版本且舞台保持原图', async () => {
    const now = await invoke('workbench.get', { tabId }),
      versions = await invoke('version.list', { tabId });
    return (
      now.tab.project.image_path === before.tab.project.image_path &&
      versions.versions.at(-1).source === 'agent'
    );
  });
  await click('图片库', 'document.querySelector(".tb")');
  await input('[aria-label="搜索图片库"]', '');
  await click('生成记录');
  await wait('!!document.querySelector(".card .stack")');
  await check(
    '生成记录逐张列出且最新卡片标注版本和Agent',
    `(()=>{const cards=[...document.querySelectorAll('.card')];return cards.length>0&&!document.querySelector('.stack .ri-stack-line')&&/第 [0-9]+ 版/.test(cards[0].querySelector('.stack')?.textContent)&&cards[0].textContent.includes('Agent')})()`,
  );
  await h.section('Agent');
  await click('直接生成');
  await check(
    '直接生成先出现确认框',
    '!!document.querySelector("[role=dialog]:not(.leaving *)")&&document.body.innerText.includes("允许 Agent 直接生成？")',
  );
  await click('取消', 'document.querySelector("[role=dialog]:not(.leaving *)")');
  // Exercise the public CLI and real main-process queue using only the local fake service.
  const refTab = (await call('workbench.open', { path: files[1] })).tab.id;
  await call('params.set', {
    tabId: refTab,
    patch: { model: 'nai-diffusion-4-5-full', steps: 23 },
    dropReferences: true,
  });
  const reference = await call('reference.add-vibe', { tabId: refTab, path: files[0] });
  const referenceId = reference.tab.project.references.vibes[0].id;
  await call('reference.set', { tabId: refTab, id: referenceId, strength: 0.4 });
  const needsConfirm = await cli('params.set', {
    tabId: refTab,
    patch: { model: 'nai-diffusion-5-full' },
  });
  await check(
    '命令行换模型要求显式移除参考且保留草稿',
    async () =>
      needsConfirm.result.error?.code === 'needs_confirm' &&
      (await call('workbench.get', { tabId: refTab })).tab.project.references.vibes.length === 1,
  );
  const encodesBefore = generationService.state.encodes.length;
  const referenceJob = await call('generate.start', { tabId: refTab, count: 2 });
  await check(
    'Agent待确认时不编码参考图',
    () =>
      referenceJob.state === 'pending' && generationService.state.encodes.length === encodesBefore,
  );
  await invoke('generate.confirm', { ids: [referenceJob.id] });
  await wait(
    `window.studio.invoke('generate.status',{id:${JSON.stringify(referenceJob.id)}}).then(r=>r.data.jobs[0].state==='completed')`,
    '参考生成完成',
  );
  await check('两张生成只编码一次并保存参考库及版本参数', async () => {
    const tree = await call('version.list', { tabId: refTab }),
      library = await call('vibe.library'),
      price = await call('generate.estimate', { tabId: refTab, count: 1 });
    return (
      generationService.state.encodes.length === encodesBefore + 1 &&
      library.items.length > 0 &&
      price.parts.encode === 0 &&
      tree.versions.every(
        (v) => v.project.params && v.project.references && v.project.keptParameters,
      )
    );
  });
  await call('reference.remove', { tabId: refTab, id: referenceId });
  await call('reference.add-precise', { tabId: refTab, path: files[0] });
  await check('精确参考费用包含基础价和附加费', async () => {
    const price = await call('generate.estimate', { tabId: refTab, count: 2 });
    return price.parts.precise === 10 && price.parts.base > 0 && price.parts.encode === 0;
  });
  await call('params.set', {
    tabId: refTab,
    patch: { model: 'nai-diffusion-5-full', effort: 'Medium', steps: 50, uc: 'None' },
    dropReferences: true,
  });
  await check('命令行Medium固定项与参考移除生效', async () => {
    const p = (await call('workbench.get', { tabId: refTab })).tab.project;
    return (
      p.params.steps === 14 &&
      p.params.uc === 'Heavy' &&
      p.params.rescale === null &&
      p.references.vibes.length + p.references.precise.length === 0
    );
  });

  const blank = await call('workbench.new', {
    width: 64,
    height: 64,
    params: { model: 'nai-diffusion-5-full', effort: 'High' },
  });
  const blankId = blank.tab.id;
  await call('prompt.set', { tabId: blankId, scope: 'base:prompt', text: 'synthetic cloud study' });
  const firstBlankJob = await call('generate.queue', { tabId: blankId, count: 1 });
  await invoke('generate.confirm', { ids: [firstBlankJob.id] });
  await wait(
    `window.studio.invoke('generate.status',{id:${JSON.stringify(firstBlankJob.id)}}).then(r=>r.data.jobs[0].state==='completed')`,
    '空白作品首张生成完成',
  );
  const blankTree = (await call('version.list', { tabId: blankId })).versions;
  await check('新建空白作品生成首张后成为第1版并进入图片库', async () => {
    const cards = await database.loadLibraryCards();
    return (
      blankTree.length === 2 &&
      blankTree[0].isStart &&
      blankTree[0].number === 0 &&
      blankTree[1].number === 1 &&
      blankTree[1].images.length === 1 &&
      cards.some(
        (card) =>
          card.id === blankTree[1].images[0].projectId &&
          card.generated_work_id === blank.tab.workId,
      )
    );
  });
  await call('version.open', { tabId: blankId, versionId: blankTree[0].id });
  await call('prompt.set', {
    tabId: blankId,
    scope: 'base:prompt',
    text: 'synthetic alternate clouds',
  });
  const blankBranchJob = await invoke('generate.start', { tabId: blankId, count: 1 });
  await wait(
    `window.studio.invoke('generate.status',{id:${JSON.stringify(blankBranchJob.id)}}).then(r=>r.data.jobs[0].state==='completed')`,
    '空白作品分支生成完成',
  );
  const branchVersion = (await call('version.list', { tabId: blankId })).versions.at(-1);
  await call('branch.rename', { branchId: branchVersion.branchId, name: 'Synthetic branch' });
  const draftBeforeDelete = (await call('workbench.get', { tabId: blankId })).tab.project;
  const deletedBranch = await call('branch.delete', { branchId: branchVersion.branchId });
  const deletedTab = (await call('workbench.get', { tabId: blankId })).tab;
  const inTrash = database.loadProject(branchVersion.images[0].projectId).deleted_at;
  await call('branch.restore', { undo: deletedBranch.undo });
  await check('删除分支回到分叉版且保留草稿，撤销恢复图片、名称和编号', async () => {
    const restored = (await call('version.list', { tabId: blankId })).versions.find(
      (v) => v.id === branchVersion.id,
    );
    return (
      !!inTrash &&
      deletedTab.versionId === blankTree[0].id &&
      JSON.stringify(deletedTab.project) === JSON.stringify(draftBeforeDelete) &&
      restored?.branchName === 'Synthetic branch' &&
      restored.number === branchVersion.number &&
      restored.branchNumber === branchVersion.branchNumber &&
      !restored.images[0].deleted
    );
  });
  await click('工作台', 'document.querySelector(".tb")');
  const linear = await invoke('workbench.new', { width: 64, height: 64 });
  await invoke('prompt.set', {
    tabId: linear.tab.id,
    scope: 'base:prompt',
    text: 'synthetic linear deletion study',
  });
  const linearJob = await invoke('generate.start', { tabId: linear.tab.id, count: 1 });
  await wait(
    `window.studio.invoke('generate.status',{id:${JSON.stringify(linearJob.id)}}).then(r=>r.data.jobs[0].state==='completed')`,
    '主线删除夹具生成完成',
  );
  const linearVersion = (await call('version.list', { tabId: linear.tab.id })).versions.at(-1);
  await call('library.rename', {
    id: linearVersion.images[0].projectId,
    name: 'synthetic-linear-trash-restore',
  });
  const versionSelector = `[data-key="ver-${linearVersion.id}"]`;
  await wait(`!!document.querySelector(${JSON.stringify(versionSelector)})`);
  await e(
    `document.querySelector(${JSON.stringify(versionSelector)}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:200}))`,
  );
  await click('删除这一版', 'document.querySelector("[role=menu]:not(.leaving *)")');
  await h.until(() => !database.versions.get(linearVersion.id), '主线版本已删除');
  const mainDeleted = !!database.loadProject(linearVersion.images[0].projectId).deleted_at;
  await click('撤销', 'document.querySelector(".toast:not(.leaving)")');
  await h.until(() => !!database.versions.get(linearVersion.id), '主线版本撤销完成');
  await check(
    '删除主线上的一版并撤销，版本与图片恢复',
    () => mainDeleted && !database.versions.get(linearVersion.id).images[0].deleted,
  );
  await wait(`!!document.querySelector('[data-key="ths-${linearVersion.id}"] img')`);
  await e(
    `document.querySelector('[data-key="ths-${linearVersion.id}"] span:has(img)').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:240}))`,
  );
  await click('移入回收站', 'document.querySelector("[role=menu]:not(.leaving *)")');
  await h.until(() => !database.versions.get(linearVersion.id), '最后一张图片带走版本');
  await check('删掉最后一张图后主线版本移走，标签页回到起点', async () => {
    const current = (await call('workbench.get', { tabId: linear.tab.id })).tab;
    return (
      current.versionId === linear.tab.versionId &&
      !!database.loadProject(linearVersion.images[0].projectId).deleted_at
    );
  });
  await click('图片库', 'document.querySelector(".tb")');
  await click('回收站', 'document.querySelector(".libp .side")');
  await input('[aria-label="搜索图片库"]', 'synthetic-linear-trash-restore');
  await wait('document.querySelectorAll(".card").length===1');
  await e(
    'document.querySelector(".card").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:400,clientY:300}))',
  );
  await click('恢复', 'document.querySelector("[role=menu]:not(.leaving *)")');
  await h.until(() => !!database.versions.get(linearVersion.id), '回收站恢复版本');
  await check('回收站恢复最后一张图时带回版本且编号和分支名不变', () => {
    const restored = database.versions.get(linearVersion.id);
    return (
      restored.number === linearVersion.number &&
      restored.branchName === linearVersion.branchName &&
      !restored.images[0].deleted
    );
  });
  const originalWork = (
    await call('work.open-from-image', {
      tabId: linear.tab.id,
      versionId: linearVersion.id,
      imageId: linearVersion.images[0].projectId,
    })
  ).tab;
  const originalRoot = (await call('version.list', { tabId: originalWork.id })).versions[0];
  const originalUndo = await call('work.remove-original', { tabId: originalWork.id });
  await call('version.open', { tabId: originalWork.id, versionId: originalRoot.id });
  const continued = await e(
    `window.studio.invoke('generate.start',${JSON.stringify({ tabId: originalWork.id, count: 1 })}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
  );
  await wait(
    `window.studio.invoke('generate.status',{id:${JSON.stringify(continued.id)}}).then(r=>r.data.jobs[0].state==='completed')`,
    '原图移入回收站后从起点生成完成',
  );
  await check('原图进入回收站后保持根快照并继续生成', async () => {
    const tree = (await call('version.list', { tabId: originalWork.id })).versions;
    const job = (await call('generate.status', { id: continued.id })).jobs[0];
    return (
      originalUndo.trashed &&
      tree[0].originState === 'trashed' &&
      JSON.stringify(tree[0].project) === JSON.stringify(originalRoot.project) &&
      job.completed === 1 &&
      job.images.every((id) => !!database.loadProject(id))
    );
  });
  await call('work.restore-original', { undo: originalUndo.undo });
  await check('撤销恢复原图并保留后续生成结果', async () => {
    const tree = (await call('version.list', { tabId: originalWork.id })).versions;
    return (
      tree[0].originState === 'library' &&
      tree.some((v) => v.images.some((image) => !image.deleted))
    );
  });
  await click('工作台', 'document.querySelector(".tb")');
  await h.screenshot('049-original-restored');
  const vibeFiles = await createWorkbenchFixtures(path.join(mode.root, 'vibe-length-fixtures'), {
    sizes: [[64, 64]],
    parameters: [
      {
        reference_image_multiple: ['synthetic-vibe-a', 'synthetic-vibe-b'],
        reference_strength_multiple: [0.25],
        reference_information_extracted_multiple: [],
      },
    ],
  });
  const vibeTab = (await invoke('workbench.open', { path: vibeFiles[0] })).tab.id;
  await wait(
    `window.studio.invoke('workbench.list',{}).then(r=>r.data.activeTabId===${JSON.stringify(vibeTab)})`,
    'Vibe 夹具打开',
  );
  const requestCount = generationService.state.requests.length;
  await click('生成', 'document.querySelector(".gen-bar")');
  await wait(
    `window.studio.invoke('generate.status',{}).then(r=>r.data.jobs.some(j=>j.tabId===${JSON.stringify(vibeTab)}&&j.state==='completed'))`,
    '缺失 Vibe 数值的图片生成成功',
  );
  await check('界面生成自动补齐三个 Vibe 数组且假服务接受', () => {
    const p = generationService.state.requests[requestCount].parameters;
    return (
      JSON.stringify(p.reference_strength_multiple) === '[0.25,0.6]' &&
      JSON.stringify(p.reference_information_extracted_multiple) === '[1,1]' &&
      p.reference_image_multiple.length === 2
    );
  });
  const only = await invoke('workbench.new', { width: 64, height: 64 });
  const chain = [];
  for (let n = 1; n <= 4; n++) {
    await invoke('prompt.set', {
      tabId: only.tab.id,
      scope: 'base:prompt',
      text: `synthetic only-version ${n}`,
    });
    const job = await invoke('generate.start', { tabId: only.tab.id, count: 1 });
    await wait(
      `window.studio.invoke('generate.status',{id:${JSON.stringify(job.id)}}).then(r=>r.data.jobs[0].state==='completed')`,
      '单版删除夹具生成完成',
    );
    chain.push((await invoke('version.list', { tabId: only.tab.id })).versions.at(-1));
  }
  const middle = chain[2],
    last = chain[3],
    previous = chain[1];
  await invoke('version.open', { tabId: only.tab.id, versionId: middle.id });
  const selector = `[data-key="ver-${middle.id}"]`;
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await e(
    `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:200}))`,
  );
  await click('只删除这一版', 'document.querySelector("[role=menu]:not(.leaving *)")');
  await h.until(() => !database.versions.get(middle.id), '仅第三版删除完成');
  await wait(
    `!document.querySelector(${JSON.stringify(selector)}) && !!document.querySelector('[data-key="ver-${last.id}"]')`,
    '单版删除后的版本列表更新完成',
  );
  await check('只删第三版：第四版接到第二版，内容和图片不变，当前跳到第四版', async () => {
    const v = database.versions.get(last.id);
    const current = (await invoke('workbench.get', { tabId: only.tab.id })).tab;
    return (
      v.parentId === previous.id &&
      JSON.stringify(v.project) === JSON.stringify(last.project) &&
      !v.images[0].deleted &&
      current.versionId === last.id
    );
  });
  await click('撤销', 'document.querySelector(".toast:not(.leaving)")');
  await h.until(() => !!database.versions.get(middle.id), '单版删除撤销完成');
  await check(
    '撤销单版删除恢复第三版和第四版原始关系',
    () =>
      database.versions.get(last.id).parentId === middle.id &&
      !database.versions.get(middle.id).images[0].deleted,
  );
  await wait(
    `!!document.querySelector(${JSON.stringify(selector)}) && !!document.querySelector('[data-key="ver-${last.id}"]')`,
    '撤销后的版本列表更新完成',
  );
  await e(`Promise.all(document.querySelector('.versions').getAnimations({subtree:true})
    .filter(a=>a.effect?.getTiming().iterations!==Infinity)
    .map(a=>a.finished.catch(()=>{}))).then(()=>undefined)`);
  await h.screenshot('053-only-version-restored');
  const returnFiles = await createWorkbenchFixtures(path.join(mode.root, 'return-work'), {
    prefix: 'synthetic-return-work',
    sizes: [[64, 64]],
    prompts: ['synthetic return origin'],
  });
  const imported = await importLibraryFiles({
    filePaths: returnFiles,
    database,
    assetsDirectory: preferences.librarySettings().assetsDirectory,
  });
  if (imported.errors.length || imported.imported.length !== 1) throw Error('作品恢复夹具导入失败');
  const original = imported.imported[0];
  const opened = (await invoke('workbench.open', { libraryId: original.id })).tab;
  for (const text of ['synthetic return origin', 'synthetic return second']) {
    await invoke('prompt.set', { tabId: opened.id, scope: 'base:prompt', text });
    const job = await invoke('generate.start', { tabId: opened.id, count: 1 });
    await wait(
      `window.studio.invoke('generate.status',{id:${JSON.stringify(job.id)}}).then(r=>r.data.jobs[0]?.state==='completed')`,
      '作品恢复夹具生成完成',
    );
  }
  const returnTree = (await invoke('version.list', { tabId: opened.id })).versions;
  const target = returnTree.at(-1);
  const targetImage = target.images[0].projectId;
  await invoke('workbench.close', { tabId: opened.id });
  await h.reload();
  const openLibraryCard = async (id, query) => {
    await click('图片库', 'document.querySelector(".tb")');
    await click('全部图片', 'document.querySelector(".libp")');
    await input('[aria-label="搜索图片库"]', query);
    await click('视图', 'document.querySelector(".libp")');
    await click('不合并', 'document.querySelector("[aria-label=合并方式]")');
    await h.key('Escape');
    const card = `[data-group-id="project:${id}"]`;
    await wait(`!!document.querySelector(${JSON.stringify(card)})`, '待恢复作品的图库图片可见');
    await e(
      `document.querySelector(${JSON.stringify(card)}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}))`,
    );
    await click('在工作台打开', 'document.querySelector("[role=menu]:not(.leaving *)")');
    await wait(`!!document.querySelector('[data-key="ver-${target.id}"]')`, '恢复作品版本栏');
  };
  await openLibraryCard(targetImage, 'synthetic return second');
  const restoredList = await invoke('workbench.list');
  const restored = (await invoke('workbench.get', { tabId: restoredList.activeTabId })).tab;
  await check(
    '图库生成图恢复原作品的两版历史并选中第二版和指定图片',
    () =>
      returnTree.length === 2 &&
      restored.workId === opened.workId &&
      restored.versionId === target.id &&
      restored.versionImageId === targetImage,
  );
  await openLibraryCard(original.id, 'synthetic return origin');
  await check('图库原图回到同一个作品标签并保留上次版本', async () => {
    const list = await invoke('workbench.list');
    const current = (await invoke('workbench.get', { tabId: list.activeTabId })).tab;
    return (
      list.tabs.length === restoredList.tabs.length &&
      current.id === restored.id &&
      current.versionId === target.id
    );
  });
  await h.screenshot('056-reopened-work');
}
