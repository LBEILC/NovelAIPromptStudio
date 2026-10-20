import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { settleLayout } from './layout.js';

export async function agentChecks({ app, h, mode, doubles, database }) {
  h.category('Agent');
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
  const status = await call('app.status');
  await h.check(
    '真实 CLI 返回应用版本与工作台数量',
    () => status.version === app.getVersion() && Number.isInteger(status.workbenchTabs),
    undefined,
    'once',
  );
  const help = await call('help');
  await h.check(
    'help 列出全部公开命令和输入格式',
    () =>
      help.commands.length === 39 &&
      help.commands.every((c) => c.input && !c.name.startsWith('workbench.commit')),
    undefined,
    'once',
  );
  const forbidden = await cli('settings.get');
  await h.check(
    'CLI 拒绝读取设置并返回退出码 1',
    () => forbidden.code === 1 && forbidden.result.error.code === 'forbidden',
    undefined,
    'once',
  );
  for (const name of ['settings.ai.get', 'trash.delete-permanently']) {
    const result = await cli(name);
    await h.check(
      `CLI 拒绝 ${name}`,
      () => result.code === 1 && result.result.error.code === 'forbidden',
      undefined,
      'once',
    );
  }
  await h.section('Agent');
  await h.check(
    'Agent 位于词典与关于之间，包含工具、能力和生成设置',
    `(()=>{const pages=[...document.querySelectorAll('.settings-sidebar button')].map(n=>n.textContent.trim()),at=pages.indexOf('Agent'),page=document.querySelector('[data-settings-section=agent]');return pages[at-1]==='翻译词典'&&pages[at+1]==='关于与更新'&&['命令行工具','Agent 技能','Agent 能做什么','生成方式','花费上限'].every(label=>page.textContent.includes(label))})()`,
    undefined,
    'once',
  );
  await h.click('安装');
  await h.wait(
    `document.querySelector('[data-settings-section=agent]').textContent.includes('已安装')`,
  );
  const installed = path.join(mode.root, 'agent-install', 'runtime', 'agent', 'nai-studio.mjs');
  await h.check(
    '安装仅写隔离目录且安装后的 CLI 可运行',
    async () => {
      const s = await call('app.status', {}, installed);
      return s.version === app.getVersion();
    },
    undefined,
    'once',
  );
  await h.click('重新安装');
  await h.wait('!document.querySelector("[data-settings-section=agent] [aria-busy=true]")');
  await h.click('复制内容');
  await h.wait('document.querySelector(".nps-toast")?.textContent.includes("已复制技能内容")');
  await h.check(
    '复制技能用通知反馈，页面不插入状态文字',
    'document.querySelector(".nps-toast")?.textContent.includes("已复制技能内容")&&!document.querySelector("[data-settings-section=agent]").textContent.includes("已复制技能内容")',
  );
  const skill = await fs.readFile(
    path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'agent', 'SKILL.md'),
    'utf8',
  );
  await h.wait(
    `(async()=>await window.studio.invoke('clipboard.read-text',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data})===${JSON.stringify(skill)})()`,
  );
  await h.check(
    '技能全文与分发文件逐字一致',
    `(async()=>await window.studio.invoke('clipboard.read-text',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data})===${JSON.stringify(skill)})()`,
    undefined,
    'once',
  );
  await h.click('打开所在文件夹');
  await h.check(
    '打开技能目录使用系统文件管理器入口',
    () =>
      doubles.calls.some(
        (c) =>
          c.kind === 'openPath' &&
          c.value === path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'agent'),
      ),
    undefined,
    'once',
  );
  await settleLayout(h, '[data-settings-section=agent]');
  await h.screenshot('agent-settings');
  if (mode.packaged) return;

  await h.click('工作台', 'document.querySelector(".studio-titlebar")');
  const files = await createWorkbenchFixtures(path.join(mode.root, 'agent-fixtures'), {
    prefix: 'agent-synthetic',
  });
  const read = await call('image.read', { path: files[0] });
  await h.check(
    '读图返回参数和按块组织的提示词且不打开标签页',
    async () =>
      read.project.metadata.width > 0 &&
      read.document.scopes[0].blocks.length === 3 &&
      (await call('workbench.list')).tabs.length === status.workbenchTabs,
    undefined,
    'once',
  );
  const opened = await call('workbench.open', { path: files[0] });
  const tabId = opened.tab.id;
  await h.wait(
    `!!document.querySelector('[data-workbench-tab-id="${tabId}"][aria-selected=true]')`,
  );
  const draft = await call('workbench.get', { tabId });
  const changed = await call('tag.set', {
    tabId,
    scope: 'base:prompt',
    block: 0,
    index: 0,
    text: 'agent synthetic hair',
    expectedRevision: draft.revision,
  });
  await h.wait(
    `document.querySelector('.wb-document-scroll').textContent.includes('agent synthetic hair')`,
  );
  await h.check(
    'CLI 修改后当前草稿立即可见并显示可撤销通知',
    `document.querySelector('.nps-toast')?.textContent.includes('Agent 修改了提示词')&&[...document.querySelectorAll('.nps-toast button')].some(n=>n.textContent==='撤销')`,
    undefined,
    'once',
  );
  await settleLayout(h, '.wb-document-scroll');
  await h.screenshot('agent-edit');
  const stale = await cli('tag.set', {
    tabId,
    scope: 'base:prompt',
    block: 0,
    index: 0,
    text: 'stale overwrite',
    expectedRevision: draft.revision,
  });
  await h.check(
    '旧修订号返回 conflict，草稿保留新内容',
    () => stale.code === 1 && stale.result.error.code === 'conflict',
    undefined,
    'once',
  );
  await h.click('撤销', 'document.querySelector(".nps-toast")');
  await h.wait(
    `!document.querySelector('.wb-document-scroll').textContent.includes('agent synthetic hair')`,
  );
  const restored = await call('workbench.get', { tabId });
  await h.check(
    '撤销只恢复 Agent 刚才的修改',
    () =>
      restored.tab.project.metadata.prompt_raw === draft.tab.project.metadata.prompt_raw &&
      restored.revision > changed.revision,
    undefined,
    'once',
  );

  await h.evaluate(`document.querySelector('.wb-tags .nps-tag').click()`);
  await h.wait('!!document.querySelector(".wb-tag-editor [aria-label=Tag]")');
  await h.input('.wb-tag-editor [aria-label=Tag]', 'user unfinished hair');
  const locked = await cli('tag.set', {
    tabId,
    scope: 'base:prompt',
    block: 0,
    index: 0,
    text: 'agent overwrite',
  });
  await h.check(
    '同一块有用户输入时拒绝修改且保留输入',
    async () =>
      locked.result.error.code === 'conflict' &&
      (await h.evaluate(
        `document.querySelector('.wb-tag-editor [aria-label=Tag]').value==='user unfinished hair'`,
      )),
    undefined,
    'once',
  );
  await call('block.set-text', {
    tabId,
    scope: 'base:prompt',
    block: 2,
    text: 'agent other block',
  });
  await h.check(
    'Agent 修改其他块不会清掉编辑器里的用户输入',
    `document.querySelector('.wb-tag-editor [aria-label=Tag]').value==='user unfinished hair'`,
    undefined,
    'once',
  );
  await h.click('完成', 'document.querySelector(".wb-tag-editor")');
  const merged = await call('workbench.get', { tabId });
  await h.check(
    '保存用户输入后两个块的修改都保留',
    () =>
      merged.tab.project.metadata.prompt_raw.includes('user unfinished hair') &&
      merged.tab.project.metadata.prompt_raw.includes('agent other block'),
    undefined,
    'once',
  );
  const saved = await call('workbench.save-to-library', {
    tabId,
    expectedRevision: merged.revision,
  });
  const search = await call('library.search', { query: 'user unfinished hair' });
  await h.check(
    '保存当前草稿后能通过同一筛选逻辑找到图片',
    () =>
      search.items.some((p) => p.id === saved.project.id) &&
      database.loadProject(saved.project.id).metadata.prompt_raw.includes('user unfinished hair'),
    undefined,
    'once',
  );
  await h.check(
    '保存没有修改原始图片中的提示词',
    async () =>
      !(await call('image.read', { path: files[0] })).project.metadata.prompt_raw.includes(
        'user unfinished hair',
      ),
    undefined,
    'once',
  );
  const second = await call('workbench.open', { path: files[1] });
  await call('tag.set', {
    tabId,
    scope: 'base:prompt',
    block: 0,
    index: 0,
    text: 'agent background hair',
  });
  await h.check(
    '修改其他标签页保留当前页并显示修改标记',
    `!!document.querySelector('[data-workbench-tab-id="${second.tab.id}"][aria-selected=true]')&&!!document.querySelector('[data-workbench-tab-id="${tabId}"] .wb-dirty')`,
    undefined,
    'once',
  );
  await call('workbench.close', { tabId });
  await call('workbench.close', { tabId: second.tab.id });
  const reopened = await h.evaluate(
    `window.studio.invoke('workbench.open',{source:{type:'library',projectId:${JSON.stringify(saved.project.id)}}}).then(result=>{if(!result.ok)throw Error(result.error.message);return {ok:true,project:result.data.tab.project,source:result.data.tab.source}})`,
  );
  await h.check(
    '界面从图库重新打开时读取已保存草稿',
    () => reopened.ok && reopened.project.metadata.prompt_raw.includes('user unfinished hair'),
    undefined,
    'once',
  );
  const imported = await call('library.import', { path: files[1] });
  await call('library.rename-many', {
    changes: [
      { id: saved.project.id, name: '命令批量起名 1' },
      { id: imported.project.id, name: '命令批量起名 2' },
    ],
    expectedRevision: imported.revision,
  });
  await h.click('图片库', 'document.querySelector(".studio-titlebar")');
  await h.input('[aria-label="搜索图片库"]', '命令批量起名');
  await h.wait(
    '!!document.querySelector(\'.library-card[aria-label="命令批量起名 1"]\') && !!document.querySelector(\'.library-card[aria-label="命令批量起名 2"]\')',
  );
  await h.check(
    '批量起名后图片库卡片显示两个新名称',
    '!!document.querySelector(\'.library-card[aria-label="命令批量起名 1"]\') && !!document.querySelector(\'.library-card[aria-label="命令批量起名 2"]\')',
    undefined,
    'once',
  );
  database.deleteProject(imported.project.id);
  // Only the synthetic record created by this check is removed from the isolated database.
  database.deleteProject(saved.project.id);
}
