import { notificationClearance } from './interactionCorrections.js';
import { settings186Checks, queueRestart186 } from './settings186.js';
import { scrollChecks } from './scroll.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hash } from 'node:crypto';
import { clipboard, nativeImage } from 'electron';
import { describeAssetDirectory } from '../libraryStorage.js';
import { dictionaryChecks } from './dictionary.js';
import { createTrashDraft } from './shortcuts.js';
import { appearanceLayerChecks } from './appearanceLayers.js';
import { settingsGenerationChecks } from './settingsGeneration.js';
import { settingsExceptionChecks } from './settingsExceptions.js';

export async function settingsChecks(context, restart) {
  const { h, mode, app, database, preferences, doubles, files, encrypted } = context;
  const { evaluate: e, wait, check, click, input, select, section } = h;
  const aiInput = (index) =>
    ['input[aria-label="服务地址"]', 'input[aria-label="API Key"]', 'input[aria-label="模型"]'][
      index
    ];
  const savedFile = path.join(mode.root, 'settings-expected.json');
  if (!restart) {
    if (['设置', '全部'].includes(mode.category)) await settings186Checks(context);
    await appearanceLayerChecks(context);
    if (mode.category === '设置·通用') return;
    if (['设置', '全部'].includes(mode.category)) await settingsGenerationChecks(context);
  }
  if (restart) {
    const expected = JSON.parse(await fs.readFile(savedFile, 'utf8'));
    h.category('设置·重启');
    await check(
      '重启保留三个字体与自动更新偏好',
      () =>
        JSON.stringify(preferences.appearanceSettings()) === JSON.stringify(expected.appearance) &&
        preferences.productivitySettings().autoCheckUpdates === expected.autoCheck,
      () => ({
        expected,
        actual: {
          appearance: preferences.appearanceSettings(),
          autoCheck: preferences.productivitySettings().autoCheckUpdates,
        },
      }),
      'once',
    );
    await section('AI 服务');
    await wait(
      '!!document.querySelector("[data-settings-section=ai] input[type=password],[data-settings-section=ai] .field:not(label)")',
    );
    await wait(
      `document.querySelector('${aiInput(0)}')?.value===${JSON.stringify(expected.ai.baseUrl)}`,
      '重启后的 AI 设置完成异步加载',
    );
    await check(
      '重启保留地址与模型',
      () =>
        ['baseUrl', 'model'].every((key) => preferences.publicSettings()[key] === expected.ai[key]),
      undefined,
      'once',
    );
    if (encrypted)
      await check(
        '重启 Key 显示已保存状态且不可输入',
        'document.querySelector("[data-settings-section=ai] .field:not(label)")?.textContent === "已保存 ••••••••" && !document.querySelector("[data-settings-section=ai] input[type=password]")',
        undefined,
        'once',
      );
    else h.uncovered('重启验证安全存储', '本平台 safeStorage 不可用');
    await h.screenshot(`restart-${mode.phase}`);
    return;
  }
  if (mode.category === '减少动态效果') {
    h.category('设置·翻译词典·关闭动效');
    await section('翻译词典');
    await input('.dict [aria-label="搜索 Tag 或译文"]', 'acceptance_');
    await wait('document.querySelector(".dict-more").textContent.includes("205")');
    await scrollChecks(h, '.dscroll');
  }
  if (!['设置·AI 服务', '减少动态效果'].includes(mode.category)) {
    await dictionaryChecks(context);
    if (mode.category === '设置·翻译词典') return;
    h.category('设置·图片库');
    const dbPath = path.join(app.getPath('userData'), 'data', 'studio.sqlite');
    const startupBackup = (await fs.readdir(path.dirname(dbPath))).find(
      (name) => name.startsWith('studio.pre-work-originals-') && name.endsWith('.sqlite'),
    );
    if (!startupBackup) throw Error('启动原图迁移没有留下数据库备份');
    const startupBackupPath = path.join(path.dirname(dbPath), startupBackup);
    const startupBackupHash = hash('sha256', await fs.readFile(startupBackupPath));
    await section('图片库');
    await wait(`document.body.innerText.includes(${JSON.stringify(startupBackup)})`);
    const initial = await describeAssetDirectory(context.assetsDirectory);
    const size =
      initial.totalBytes < 1024
        ? `${initial.totalBytes} B`
        : initial.totalBytes < 1048576
          ? `${(initial.totalBytes / 1024).toFixed(1)} KB`
          : `${(initial.totalBytes / 1048576).toFixed(1)} MB`;
    await check(
      '文件数量与占用对应临时资源目录',
      `document.body.innerText.includes(${JSON.stringify(`${initial.fileCount} 个文件 · 占用 ${size}`)})`,
      undefined,
      'once',
    );
    await check(
      '启动原图迁移的数据库备份在设置中可见',
      `document.body.innerText.includes(${JSON.stringify(startupBackup)})`,
      undefined,
      'once',
    );
    await check(
      '数据库路径属于隔离目录',
      `document.body.innerText.includes(${JSON.stringify(dbPath)})`,
      undefined,
      'once',
    );
    await click('打开文件夹', 'document', 1);
    await h.until(() => doubles.calls.at(-1)?.value === dbPath, '定位数据库');
    await check(
      '打开数据库文件夹请求正确路径',
      () => doubles.calls.at(-1)?.value === dbPath,
      undefined,
      'once',
    );
    const backup = path.join(path.dirname(dbPath), 'studio.pre-acceptance.sqlite');
    const retainedBackup = path.join(path.dirname(dbPath), 'studio.pre-retained.sqlite');
    const beforeDatabase = hash('sha256', await fs.readFile(dbPath));
    await fs.writeFile(retainedBackup, 'retained backup evidence');
    await fs.writeFile(backup, 'acceptance metadata only');
    const backupRow = `[...document.querySelectorAll('.setrow')].find(row=>row.textContent.includes('studio.pre-acceptance.sqlite'))`;
    await section('通用');
    await wait(
      'document.querySelector(\'[data-settings-section="storage"]\')?.getClientRects().length === 0',
      '图片库设置已隐藏，可以加载新增备份',
    );
    await section('图片库');
    await wait('document.body.innerText.includes("studio.pre-acceptance.sqlite")');
    await check(
      '备份刷新显示文件名与准确大小',
      'document.body.innerText.includes("24 B")',
      undefined,
      'once',
    );
    await click('打开所在文件夹', backupRow);
    await h.until(() => doubles.calls.at(-1)?.value === backup, '定位备份');
    await check(
      '定位备份请求正确路径且不修改文件',
      async () =>
        doubles.calls.at(-1)?.value === backup &&
        (await fs.readFile(backup, 'utf8')) === 'acceptance metadata only',
      undefined,
      'once',
    );
    await fs.unlink(backup);
    await click('打开所在文件夹', backupRow);
    await wait('!!document.querySelector("[data-settings-section=storage] .banner.danger")');
    await check(
      '已删除备份显示定位错误',
      '!!document.querySelector("[data-settings-section=storage] .banner.danger")?.textContent',
      undefined,
      'once',
    );
    await section('通用');
    await wait(
      'document.querySelector(\'[data-settings-section="storage"]\')?.getClientRects().length === 0',
      '图片库设置已隐藏，可以重新加载备份列表',
    );
    await section('图片库');
    await wait(
      '![...document.querySelectorAll(".setrow small")].some(e=>e.textContent.includes("studio.pre-acceptance.sqlite"))',
    );
    await check(
      '刷新移除已删除备份',
      '![...document.querySelectorAll(".setrow small")].some(e=>e.textContent.includes("studio.pre-acceptance.sqlite"))',
      undefined,
      'once',
    );
    await check(
      '备份查看与删除测试未改动数据库及其他备份',
      async () =>
        hash('sha256', await fs.readFile(dbPath)) === beforeDatabase &&
        hash('sha256', await fs.readFile(startupBackupPath)) === startupBackupHash &&
        (await fs.readFile(retainedBackup, 'utf8')) === 'retained backup evidence',
      undefined,
      'once',
    );
    doubles.selections.push({ canceled: true, filePaths: [] });
    await click('更改位置');
    await wait(
      '![...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="更改位置")?.disabled',
    );
    await check(
      '取消迁移保留资源路径',
      () => preferences.librarySettings().assetsDirectory === context.assetsDirectory,
      undefined,
      'once',
    );
    const target = path.join(mode.root, 'moved-assets');
    await fs.mkdir(target);
    doubles.selections.push({ canceled: false, filePaths: [target] });
    doubles.messages.push({ response: 0 });
    const progress = [];
    const send = h.window.webContents.send.bind(h.window.webContents);
    h.window.webContents.send = (channel, ...args) => {
      if (
        channel === 'studio:command-event' &&
        args[0]?.type === 'progress' &&
        args[0]?.topic === 'library:storage-progress'
      )
        progress.push({
          ...args[0].data,
          oldPresent: database
            .loadLibrary('all')
            .every((project) => requireExists(project.image_path)),
        });
      return send(channel, ...args);
    };
    await click('更改位置');
    await wait(
      `document.querySelector('.setcol .path span')?.textContent === ${JSON.stringify(target)}`,
    );
    h.window.webContents.send = send;
    await check(
      '迁移产生进度且校验结束前旧文件存在',
      () => progress.length > 0 && progress.every((p) => p.oldPresent),
      undefined,
      'once',
    );
    await check(
      '迁移后资源数与占用保持一致',
      async () => {
        const current = await describeAssetDirectory(target);
        return current.fileCount === initial.fileCount && current.totalBytes === initial.totalBytes;
      },
      undefined,
      'once',
    );
    await click('图片库', 'document.querySelector(".tb")');
    await h.check(
      '迁移后图库图片仍能解码',
      async () => {
        let decoded = false;
        await h.until(async () => {
          decoded = await e(
            '!!document.querySelector(".libp") && !document.querySelector("[data-library-updating=true]") && [...document.querySelectorAll(".card img")].some(i=>i.getClientRects().length && i.complete && i.naturalWidth>0)',
          );
          return decoded;
        }, '迁移后的图库图片解码完成');
        // Use the successful observation; a virtualized grid may replace the
        // observed image before a second renderer round trip.
        return decoded;
      },
      undefined,
      'once',
    );
    const draftProjectId = await createTrashDraft(context);
    await section('图片库');
    await click('清空回收站');
    await wait('!!document.querySelector("[role=dialog]:not(.leaving *)")');
    await check(
      '清空草稿图片时确认框说明工作区草稿影响',
      'document.querySelector("[role=dialog]:not(.leaving *)").textContent.includes("还没保存的改动，会一起丢弃")',
      undefined,
      'once',
    );
    await click('取消', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await wait('!document.querySelector("[role=dialog]:not(.leaving *)")');
    await check(
      '清空回收站取消保留图片',
      () => database.loadLibrary('trash').length === 2,
      undefined,
      'once',
    );
    await click('清空回收站');
    await wait('!!document.querySelector("[role=dialog]:not(.leaving *)")');
    await e(
      'document.querySelector("[role=dialog]:not(.leaving *) .acts button:last-child").click()',
    );
    await wait('document.body.innerText.includes("0 张图片 · 永久删除后无法恢复")');
    await check(
      '清空回收站确认删除图片',
      () => database.loadLibrary('trash').length === 0,
      undefined,
      'once',
    );
    await check(
      '已清空的草稿图片不再存在',
      () => database.loadProject(draftProjectId) == null,
      undefined,
      'once',
    );
    await h.screenshot('storage');
  }
  h.category('设置·AI 服务');
  // Hold real saved snapshots until after editing and switching sections. This
  // acceptance-only gate reproduces a slow read without relying on a sleep.
  const slowAIRead = process.env.NPS_ACCEPTANCE_SLOW_AI_READ === '1';
  let releaseAIRead;
  let aiReads = 0;
  if (slowAIRead) {
    const gate = new Promise((resolve) => {
      releaseAIRead = resolve;
    });
    context.commandHandlers['settings.ai.get'] = async () => {
      const saved = preferences.publicSettings();
      aiReads++;
      await gate;
      return saved;
    };
  }
  const aiDraftMatches = `document.querySelector(${JSON.stringify(aiInput(0))})?.value === ${JSON.stringify(mode.baseUrl)} && (document.querySelector('input[aria-label="模型"]')?.value==='acceptance-model' || document.querySelector('[aria-label="模型"]')?.textContent.includes('acceptance-model')) && document.querySelector('[data-settings-section=ai] input[type=password]')?.value===${JSON.stringify(encrypted ? 'acceptance-local-key' : '')}`;
  const aiDraftDetails = `(()=>{const key=document.querySelector('[data-settings-section=ai] input[type=password]'); return {baseUrl:document.querySelector(${JSON.stringify(aiInput(0))})?.value, model:document.querySelector('[aria-label="模型"]')?.value, apiKey:{empty:!key?.value,length:key?.value.length ?? 0}}})()`;
  try {
    // Layout checks may have already loaded and retained the AI page. Start a
    // fresh renderer after installing the gate so this is truly its first read.
    if (slowAIRead) await h.reload();
    await section('AI 服务');
    // 1.5 起没填 API Key 时默认是"ChatGPT 账号"：这一段验收的是 API Key 方式，先切过去
    const apiKeyTab = `[...document.querySelectorAll('[data-settings-section=ai] [role=radio]')].find((x)=>x.textContent.trim()==='API Key')`;
    await wait(`!!${apiKeyTab}`);
    await e(
      `(()=>{if(document.querySelector('[data-settings-section=ai] input[type=password],[data-settings-section=ai] .field:not(label)')) return true; ${apiKeyTab}.click(); return true})()`,
    );
    await wait(
      '!!document.querySelector("[data-settings-section=ai] input[type=password],[data-settings-section=ai] .field:not(label)")',
    );
    if (slowAIRead) await h.until(() => aiReads === 1, '首次设置读取已挂起');
    await input(aiInput(0), mode.baseUrl);
    if (encrypted) {
      if (await e('!!document.querySelector("[data-settings-section=ai] .field:not(label)")'))
        await click('更换');
      await input(aiInput(1), 'acceptance-local-key');
    } else
      h.uncovered(
        '保存与恢复安全存储 Key',
        '本平台 safeStorage.isEncryptionAvailable() 返回 false',
      );
    if (await e('!!document.querySelector(\'input[aria-label="模型"]\')'))
      await input(aiInput(2), 'acceptance-model');
    else await select('模型', 'acceptance-model');

    await section('通用');
    await section('AI 服务');
    await check('分页切换保留 AI 草稿', aiDraftMatches, aiDraftDetails, 'once');
    if (slowAIRead) {
      await h.until(() => aiReads >= 2, '切回分页重新读取设置');
      releaseAIRead();
      // A subsequent IPC round trip and React paint drain the released replies.
      await e(
        "(async()=>{await window.studio.invoke('settings.ai.get',{}); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()",
      );
      await check('晚到的已保存 AI 设置不覆盖草稿字段', aiDraftMatches, aiDraftDetails, 'once');
      if (!(await e(aiDraftMatches)))
        throw new Error('AI 草稿已丢失，停止后续连接测试，避免访问被覆盖后的服务地址');
    }
  } finally {
    if (slowAIRead) {
      releaseAIRead();
      context.commandHandlers['settings.ai.get'] = () => preferences.publicSettings();
    }
  }
  await click('重新读取模型列表');
  {
    await wait('document.body.innerText.includes("已读取 2 个模型")');
    await select('模型', 'acceptance-other');
    await h.checkSoon(
      '选择模型会更新当前模型',
      'document.querySelector("button[aria-label=模型]").textContent.includes("acceptance-other") && !document.querySelector("input[aria-label=模型]")',
      undefined,
      undefined,
      undefined,
      'once',
    );
    await select('模型', 'acceptance-model');
    await click('测试连接');
    await wait('document.body.innerText.includes("连接正常")');
    await check(
      '本地兼容服务读取模型并成功连接',
      'document.body.innerText.includes("连接正常")',
      undefined,
      'once',
    );
    await h.screenshot('027-ai-connected');
    await input(aiInput(0), mode.baseUrl + '/');
    await check(
      '027 修改服务地址清除测试结果并显示未保存状态',
      'document.querySelector(".set-foot").textContent.includes("有未保存的修改")&&!document.querySelector(".set-foot").textContent.includes("连接正常")',
    );
    await h.screenshot('027-ai-dirty');
    await input(aiInput(0), mode.baseUrl);
    await fetch(mode.baseUrl.replace('/v1', '/control/fail'));
    await click('测试连接');
    await wait('document.body.innerText.includes("验收服务暂时失败")');
    await check(
      '服务失败显示错误并允许重试',
      '![...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="测试连接").disabled',
      undefined,
      'once',
    );
    await fetch(mode.baseUrl.replace('/v1', '/control/success'));
    await click('测试连接');
    await wait('document.body.innerText.includes("连接正常")');
    await check(
      '失败后重试成功',
      'document.body.innerText.includes("连接正常")',
      undefined,
      'once',
    );
  }
  await input(aiInput(0), mode.baseUrl + '/');
  await click('保存');
  await wait('document.body.innerText.includes("已保存")');
  await notificationClearance(h, 'AI服务页脚', '.set-foot');
  if (encrypted)
    await check(
      '空 Key 再保存保留加密 Key',
      () => preferences.credentials().apiKey === 'acceptance-local-key',
      undefined,
      'once',
    );
  await h.screenshot('ai');
  if (['设置·AI 服务', '减少动态效果'].includes(mode.category)) return;
  h.category('设置·关于与更新');
  await section('关于与更新');
  await wait(
    `document.body.innerText.includes(${JSON.stringify(`版本 ${app.getVersion()}`)})`,
    '关于页版本信息完成加载',
  );
  await check(
    '实际版本与非官方说明',
    `document.body.innerText.includes(${JSON.stringify(`版本 ${app.getVersion()}`)}) && document.body.innerText.includes('非官方工具，与 NovelAI 没有隶属关系。')`,
    undefined,
    'once',
  );
  const previousAutoCheck = preferences.productivitySettings().autoCheckUpdates;
  await click('自动检查更新');
  await h.until(
    () => preferences.productivitySettings().autoCheckUpdates === !previousAutoCheck,
    '自动更新开关保存',
  );
  await wait(
    `document.querySelector('[aria-label="自动检查更新"]').getAttribute('aria-checked')===${JSON.stringify(String(!previousAutoCheck))}`,
  );
  await check(
    '自动更新开关保存新值',
    `document.querySelector('[aria-label="自动检查更新"]').getAttribute('aria-checked')===${JSON.stringify(String(!previousAutoCheck))}`,
    undefined,
    'once',
  );
  if (
    await e(
      "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='检查更新'&&!b.disabled&&b.getAttribute('aria-disabled')!=='true')",
    )
  )
    await click('检查更新');
  await wait('document.body.innerText.includes("发现新版本 99.0.0")');
  await check(
    '更新结果来自验收替身',
    'document.body.innerText.includes("发现新版本 99.0.0")',
    undefined,
    'once',
  );
  await check(
    '发现新版本后检查更新不可用且说明原因',
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='检查更新');return !!b&&(b.disabled||b.getAttribute('aria-disabled')==='true')&&b.dataset.tip==='已发现新版本'})()`,
  );
  await wait('document.querySelector(".rn-md")?.textContent.includes("验收发布说明")');
  await check(
    '缺少 JSON 时在更新横幅下展开 Markdown 说明',
    '!!document.querySelector(".rn-md")&&!document.querySelector("[role=dialog]:not(.leaving *)")',
    undefined,
    'once',
  );
  doubles.structuredNotes = {
    schema: 'nps-release-notes/1',
    version: '99.0.0',
    date: '2026-10-20',
    items: [
      {
        kind: 'new',
        area: 'lib',
        title: '日期范围',
        detail: '支持选择导入日期。',
        highlight: true,
        icon: 'calendar',
      },
      {
        kind: 'improved',
        area: 'set',
        title: '服务设置',
        detail: '保存后显示结果。',
        highlight: true,
        icon: 'shield',
      },
      { kind: 'fixed', area: 'app', title: '窗口显示', detail: '正确显示窗口内容。' },
    ],
  };
  await e("window.studio.invoke('updates.check',{})");
  await wait('document.querySelectorAll(".rn-card").length===2');
  await check(
    '027 结构化更新横幅显示分类计数、两张重点卡片和分组',
    'document.querySelector(".upd").textContent.includes("发现新版本 99.0.0")&&document.querySelector(".upd").textContent.includes("新增 1 项 · 改进 1 项 · 修复 1 项")&&document.querySelectorAll(".rn-card").length===2&&[...document.querySelectorAll(".rn-g")].some(n=>n.textContent.includes("修复"))',
  );
  await h.screenshot('027-settings-update');
  await click('收起说明');
  await check(
    '027 更新说明可以收起',
    '!document.querySelector(".rn")?.closest(".expand")?.classList.contains("open")',
  );
  await click('更新说明');
  delete doubles.structuredNotes;
  await e("window.studio.invoke('updates.check',{})");
  await wait('!!document.querySelector(".rn-md")');
  await h.section('帮助');
  await e("document.querySelector('[data-help-tab=feedback]').click()");
  for (const [label, expected] of [
    ['报告问题', 'bug'],
    ['提出建议', 'enhancement'],
  ]) {
    await click(label);
    await h.checkSoon(
      `${label}链接只包含项目表单参数`,
      () => {
        const url = new URL(doubles.calls.at(-1).value);
        return (
          url.origin === 'https://github.com' &&
          url.pathname === '/LBEILC/NovelAIPromptStudio/issues/new' &&
          url.searchParams.get('labels') === expected &&
          [...url.searchParams.keys()].sort().join() === 'labels,title'
        );
      },
      undefined,
      undefined,
      undefined,
      'once',
    );
  }
  await click('复制');
  await wait('document.body.innerText.includes("已复制诊断信息")');
  await check(
    '剪贴板诊断只包含版本和平台',
    () =>
      clipboard.readText().replaceAll('\r\n', '\n') ===
      `NovelAI Prompt Studio v${app.getVersion()}\n平台：${{ win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform]}`,
    undefined,
    'once',
  );
  await h.section('关于与更新');
  await click('查看声明');
  await e(`(() => {
    const names = ['MiSans VF 4.003','Newsreader','IBM Plex Mono','Remix Icon'];
    for (const summary of document.querySelectorAll('[role=dialog]:not(.leaving *) details summary'))
      if (names.includes(summary.textContent)) summary.click();
  })()`);
  await h.checkSoon(
    '声明包含三种字体和 Remix Icon 完整许可',
    '["MiSans VF 4.003","Newsreader","IBM Plex Mono","Remix Icon"].every(name=>[...document.querySelectorAll("[role=dialog]:not(.leaving *) details")].some(d=>d.querySelector("summary").textContent===name && d.querySelector("pre").textContent.length>500))',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await h.nativeKey('Escape');
  await wait('!document.querySelector("[role=dialog]:not(.leaving *)")');
  await check(
    'Esc 关闭声明且焦点归还',
    'document.activeElement.textContent.trim()==="查看声明"',
    undefined,
    'once',
  );
  h.category('设置·通用');
  const libraryBefore = JSON.stringify(database.loadLibrary('all'));
  await section('通用');
  for (const [label, family] of [
    ['界面字体', 'IBM Plex Mono'],
    ['等宽字体', 'MiSans'],
    ['段落字体', 'MiSans'],
  ]) {
    // A previous Chromium drag may leave the pointer over a newly opened option.
    // Move it outside before exercising keyboard-only menu navigation.
    await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 1,
      y: 1,
      button: 'none',
      buttons: 0,
    });
    await click(label);
    await h.checkSoon(
      `${label}三种内置字体排在最前`,
      '[...document.querySelectorAll(".menu:not(.leaving) [role=menuitem]")].slice(0,3).map(e=>e.textContent.trim()).join("|") === "MiSans（内置）|IBM Plex Mono（内置）|Newsreader（内置）"',
      undefined,
      undefined,
      undefined,
      'both',
    );
    const fontMenu = 'document.querySelector(".menu:not(.leaving) [role=menu]")';
    await wait(`${fontMenu}?.checkVisibility()`);
    await h.key('ArrowDown', {}, fontMenu);
    if (family === 'IBM Plex Mono') await h.key('ArrowDown', {}, fontMenu);
    await h.key('Enter', {}, fontMenu);
    await wait(
      `document.querySelector('[aria-label="${label}"]').textContent.includes('${family}')`,
    );
    await h.checkSoon(
      `${label}键盘选择立即应用`,
      `getComputedStyle(document.documentElement).getPropertyValue('--font-${label === '界面字体' ? 'ui' : label === '等宽字体' ? 'mono' : 'prose'}').includes('${family}')`,
      undefined,
      undefined,
      undefined,
      'both',
    );
  }
  await section('翻译词典');
  await check(
    '改字体不改变图片、提示词、Tag 和收藏状态',
    () => JSON.stringify(database.loadLibrary('all')) === libraryBefore,
    undefined,
    'once',
  );
  await settingsExceptionChecks(context);
  database.updateProjects([database.loadLibrary('all').at(-1).id], { deleted: true });
  await fs.writeFile(
    savedFile,
    JSON.stringify({
      appearance: preferences.appearanceSettings(),
      autoCheck: preferences.productivitySettings().autoCheckUpdates,
      ai: preferences.publicSettings(),
    }),
  );
  if (mode.category === '全部' || mode.restart) await queueRestart186(context, true);
}

import { existsSync as requireExists } from 'node:fs';
