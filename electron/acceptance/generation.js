import path from 'node:path';
import { spawn } from 'node:child_process';
import { createWorkbenchFixtures } from './workbenchFixtures.js';

export async function generationChecks({ app, h, mode, doubles, database, generationService }) {
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
  await click('工作台', 'document.querySelector(".studio-titlebar")');
  doubles.selections.push({ canceled: false, filePaths: [files[0]] });
  await click('打开图片', 'document.querySelector(".studio-titlebar")');
  await wait(
    `(async()=>{const list=(await window.studio.invoke('workbench.list',{})).data;if(!list.activeTabId)return false;const current=(await window.studio.invoke('workbench.get',{tabId:list.activeTabId})).data;return current.tab.source.path===${JSON.stringify(files[0])}&&!!document.querySelector('.wb-section')})()`,
    '新生成夹具打开完成后再进入设置',
  );
  await check(
    '没有令牌时版本栏和生成底栏均不显示',
    '!document.querySelector(".wb-versions")&&!document.querySelector(".wb-generation-bar")',
  );
  await h.section('NovelAI 账号');
  await input('[aria-label="持久令牌"]', 'wrong-token');
  await click('保存', 'document.querySelector("[data-settings-section=novelai]")');
  await wait('document.body.innerText.includes("保存失败：持久令牌无效")');
  await check(
    '无效令牌不保存',
    'document.body.innerText.includes("保存失败：持久令牌无效")&&!document.body.innerText.includes("已保存 ••••••••")',
  );
  await input('[aria-label="持久令牌"]', 'acceptance-token');
  await click('保存', 'document.querySelector("[data-settings-section=novelai]")');
  await wait('document.body.innerText.includes("已保存 ••••••••")');
  await check(
    '正确令牌显示余额与用量',
    `document.body.innerText.includes('10,000 Anlas')&&!!document.querySelector('[aria-label="V5 免费用量"]')`,
  );
  await click('工作台', 'document.querySelector(".studio-titlebar")');
  await wait('!!document.querySelector(".wb-generation-bar")');
  const tabId = await e('window.studio.invoke("workbench.list",{}).then(r=>r.data.activeTabId)');
  await e(
    `window.studio.invoke('prompt.set',{tabId:${JSON.stringify(tabId)},scope:'base:prompt',text:'rain, cloud'})`,
  );
  await wait('document.querySelector(".wb-version-draft")?.textContent.includes("未生成")');
  await click('增加张数');
  await click('增加张数');
  await wait('!document.querySelector(".wb-generation-bar button.nps-button-cinnabar")?.disabled');
  await click('生成', 'document.querySelector(".wb-generation-bar")');
  await wait('document.querySelectorAll(".wb-version-thumb").length===3', '三张生成完成');
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
  await h.screenshot('generation-three-images');
  generationService.state.delay = 500;
  await click('生成', 'document.querySelector(".wb-generation-bar")');
  await wait('document.body.innerText.includes("停止")');
  await click('停止', 'document.querySelector(".wb-generation-bar")');
  await wait('document.body.innerText.includes("已停止：完成 1 张，其余已取消")');
  await check(
    '停止后只完成当前这一张',
    'document.body.innerText.includes("已停止：完成 1 张，其余已取消")',
  );
  generationService.state.delay = 20;
  generationService.state.failNext = 500;
  await click('生成', 'document.querySelector(".wb-generation-bar")');
  await wait('document.body.innerText.includes("生成失败：NovelAI 服务繁忙")');
  await check(
    '失败显示叉与准确错误',
    '!!document.querySelector("[data-generation-state=failed]")&&document.body.innerText.includes("本次未消耗 Anlas")',
  );
  await click('重试');
  await wait('!document.querySelector("[data-generation-state=failed]")');
  await wait('document.querySelectorAll(".wb-version-thumb").length>=5');
  const invoke = (name, args = {}) =>
    e(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(args)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data;})`,
    );
  const tree = await invoke('version.list', { tabId }),
    second = tree.versions[1];
  await invoke('prompt.set', { tabId, scope: 'base:prompt', text: 'rain, cloud, sunshine' });
  await invoke('generate.start', { tabId, count: 1 });
  await wait('document.querySelectorAll("[data-version-id]").length>=3');
  await e(`document.querySelector('[data-version-id="${second.id}"] .wb-version-row').click()`);
  await invoke('prompt.set', { tabId, scope: 'base:prompt', text: 'rain, cloud, snow' });
  const branchJob = await invoke('generate.start', { tabId, count: 1 });
  await wait('document.body.innerText.includes("已从第 2 版分出分支 1")');
  await check(
    '旧版生成分出固定编号分支并显示分叉行',
    'document.body.innerText.includes("版本 · 分支 1")&&!!document.querySelector(".wb-version-fork")',
  );
  await e(
    `document.querySelector('.wb-versions header span').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:120}))`,
  );
  await click('重命名分支…');
  await input('[aria-label="分支名称"]', '雪景');
  await click('确定');
  await wait('document.body.innerText.includes("版本 · 雪景")');
  await e(`document.querySelector('.wb-version-fork').click()`);
  await check(
    '切回原分支后分叉行保留改名',
    'document.body.innerText.includes("版本 · 主线")&&document.querySelector(".wb-version-fork")?.textContent.includes("雪景")',
  );
  await e(
    `document.querySelector('.wb-version-thumb').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:200}))`,
  );
  const beforeNewWork = await invoke('workbench.list');
  await click('作为新作品打开');
  await wait('document.body.innerText.includes("来自")');
  await check('从图片打开新作品记录来源', async () => {
    const tabs = await invoke('workbench.list');
    return tabs.tabs.length === beforeNewWork.tabs.length + 1 && tabs.activeTabId !== tabId;
  });
  await e(
    `[...document.querySelectorAll('.wb-versions button')].find(b=>b.textContent.includes('来自')).click()`,
  );
  await wait(
    `window.studio.invoke('workbench.list',{}).then(r=>r.data.activeTabId===${JSON.stringify(tabId)})`,
  );
  await check(
    '来源标记可以跳回原作品',
    async () => (await invoke('workbench.list')).activeTabId === tabId,
  );
  await click('832×1216', 'document.querySelector(".wb-generation-bar")');
  await click('横图 1216×832');
  await wait(
    'document.querySelector(".wb-size-button")?.textContent.includes("1216×832")&&document.querySelector(".wb-version-draft small")?.textContent.startsWith("尺寸")',
  );
  await check(
    '横图免费且尺寸变化位于摘要第一行',
    'document.querySelector(".wb-version-draft small")?.textContent.startsWith("尺寸 832×1216→1216×832")',
  );
  await click('1216×832', 'document.querySelector(".wb-generation-bar")');
  await click('自定义…');
  await input('[aria-label=宽]', '1000');
  await input('[aria-label=高]', '1500');
  await check(
    '自定义尺寸取最近的 64 倍数',
    'document.body.innerText.includes("将使用 1024×1472")&&document.body.innerText.includes("超出免费范围")',
  );
  await click('确定');
  await wait('document.body.innerText.includes("改成 832×1216")');
  await click('改成 832×1216');
  await wait('!document.body.innerText.includes("改成 832×1216")');
  generationService.state.balance = 0;
  generationService.state.tier = 0;
  await invoke('account.refresh');
  await wait(
    'document.querySelector(".wb-generation-cost")?.classList.contains("is-insufficient")',
  );
  await check(
    '余额不足时费用标红并禁用生成',
    'document.querySelector(".wb-generation-cost").classList.contains("is-insufficient")&&document.querySelector(".wb-generation-bar button.nps-button-cinnabar").getAttribute("aria-disabled")==="true"',
  );
  generationService.state.balance = 10000;
  generationService.state.tier = 3;
  await invoke('account.refresh');
  const before = await invoke('workbench.get', { tabId });
  const pending = await call('generate.start', { tabId, count: 1 });
  await wait('document.body.innerText.includes("Agent 待确认 · 1")');
  await check('真实命令行生成进入待确认且没有发请求', () => pending.state === 'pending');
  await e(`document.querySelector('.wb-version-row.is-current').focus()`);
  await click('Agent 待确认 · 1');
  // Drain the deferred version preview after focus has moved to confirmation.
  await e('new Promise(resolve=>setTimeout(resolve,450))');
  await check(
    'Agent确认不被已失焦版本的延迟对比浮层关闭',
    `!!document.querySelector('.wb-generation-title .nps-popover:popover-open')`,
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
  await click('图片库', 'document.querySelector(".studio-titlebar")');
  await input('[aria-label="搜索图片库"]', '');
  await click('生成记录');
  await wait('!!document.querySelector(".library-version-badge")');
  await check(
    '生成记录逐张列出且最新卡片标注版本和Agent',
    `(()=>{const cards=[...document.querySelectorAll('.library-card')];return cards.length>0&&!document.querySelector('.library-stack')&&/第 [0-9]+ 版/.test(cards[0].querySelector('.library-version-badge')?.textContent)&&cards[0].textContent.includes('Agent')})()`,
  );
  await h.section('Agent');
  await click('直接生成');
  await check(
    '直接生成先出现确认框',
    '!!document.querySelector("dialog[open]")&&document.body.innerText.includes("允许 Agent 直接生成？")',
  );
  await click('取消', 'document.querySelector("dialog[open]")');
}
