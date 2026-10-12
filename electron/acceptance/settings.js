import { settingsLayoutChecks } from './settingsLayout.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hash } from 'node:crypto';
import { clipboard, nativeImage, ipcMain } from 'electron';
import { describeAssetDirectory } from '../libraryStorage.js';
import { dictionaryChecks } from './dictionary.js';
import { createTrashDraft } from './shortcuts.js';

export async function settingsChecks(context, restart) {
  if (context.mode.category === '设置·版式') return settingsLayoutChecks(context.h);
  const { h, mode, app, database, preferences, doubles, files, encrypted } = context;
  const { evaluate: e, wait, check, click, input, select, section } = h;
  const aiInput = (index) =>
    `.settings-column input${index === 1 ? '[type=password]' : index === 2 ? '[aria-label="模型"]' : ':not([type=password]):not([aria-label])'}`;
  const savedFile = path.join(mode.root, 'settings-expected.json');
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
    await wait('!!document.querySelector("input[type=password]")');
    await wait(
      `(()=>{const fields=[...document.querySelectorAll('textarea')];return document.querySelector('${aiInput(0)}')?.value===${JSON.stringify(expected.ai.baseUrl)} && fields[0]?.value===${JSON.stringify(expected.ai.translationPrompt)} && fields[1]?.value===${JSON.stringify(expected.ai.classificationPrompt)}})()`,
      '重启后的 AI 设置完成异步加载',
    );
    await check(
      '重启保留地址、模型和两种提示词',
      () =>
        ['baseUrl', 'model', 'translationPrompt', 'classificationPrompt'].every(
          (key) => preferences.publicSettings()[key] === expected.ai[key],
        ),
      undefined,
      'once',
    );
    if (encrypted)
      await check(
        '重启 Key 已安全保存且输入为空',
        'document.querySelector("input[type=password]").value === "" && document.querySelector("input[type=password]").placeholder === "已安全保存"',
        undefined,
        'once',
      );
    else h.uncovered('重启验证安全存储', '本平台 safeStorage 不可用');
    if (mode.phase === 1) {
      await click('恢复默认', 'document', 0);
      await h.checkSoon(
        '仅恢复翻译规则，分类草稿保持',
        `(()=>{const areas=[...document.querySelectorAll('textarea')];return areas[0].value===${JSON.stringify(preferences.publicSettings().defaultPrompts.translation)} && areas[1].value==='验收分类规则'})()`,
        undefined,
        undefined,
        undefined,
        'once',
      );
      await click('恢复默认', 'document', 1);
      await h.checkSoon(
        '分类规则恢复到默认内容',
        `[...document.querySelectorAll('textarea')][1].value===${JSON.stringify(preferences.publicSettings().defaultPrompts.classification)}`,
        undefined,
        undefined,
        undefined,
        'once',
      );
      await click('保存');
      await wait('document.body.innerText.includes("AI 服务设置已安全保存")');
      await check(
        '两种提示词分别恢复默认',
        () => {
          const s = preferences.publicSettings();
          return (
            s.translationPrompt === s.defaultPrompts.translation &&
            s.classificationPrompt === s.defaultPrompts.classification
          );
        },
        undefined,
        'once',
      );
      expected.ai = preferences.publicSettings();
      await fs.writeFile(savedFile, JSON.stringify(expected));
    }
    await h.screenshot(`restart-${mode.phase}`);
    return;
  }
  if (['全部', '设置'].includes(mode.category)) await settingsLayoutChecks(h);
  if (mode.category !== '设置·AI 服务') {
    await dictionaryChecks(context);
    if (mode.category === '设置·翻译词典') return;
    h.category('设置·图片库');
    await section('图片库');
    await wait(
      'document.body.innerText.includes("还没有升级前的备份。软件在升级数据格式之前会自动留一份。")',
    );
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
      '无备份显示正确空状态',
      'document.body.innerText.includes("还没有升级前的备份。软件在升级数据格式之前会自动留一份。")',
      undefined,
      'once',
    );
    const dbPath = path.join(app.getPath('userData'), 'data', 'studio.sqlite');
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
    const backupRow = `[...document.querySelectorAll('.settings-line')].find(row=>row.textContent.includes('studio.pre-acceptance.sqlite'))`;
    await section('外观');
    await section('图片库');
    await wait('document.body.innerText.includes("studio.pre-acceptance.sqlite")');
    await check(
      '备份刷新显示文件名与准确大小',
      'document.body.innerText.includes("24 B")',
      undefined,
      'once',
    );
    await click('在文件夹中显示', backupRow);
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
    await click('在文件夹中显示', backupRow);
    await wait('!!document.querySelector(".settings-body [role=alert]")');
    await check(
      '已删除备份显示定位错误',
      '!!document.querySelector(".settings-body [role=alert]")?.textContent',
      undefined,
      'once',
    );
    await section('外观');
    await section('图片库');
    await wait(
      '![...document.querySelectorAll(".settings-line small")].some(e=>e.textContent.includes("studio.pre-acceptance.sqlite"))',
    );
    await check(
      '刷新移除已删除备份',
      '![...document.querySelectorAll(".settings-line small")].some(e=>e.textContent.includes("studio.pre-acceptance.sqlite"))',
      undefined,
      'once',
    );
    await check(
      '备份查看与删除测试未改动数据库及其他备份',
      async () =>
        hash('sha256', await fs.readFile(dbPath)) === beforeDatabase &&
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
      if (channel === 'library:storage-progress')
        progress.push({
          ...args[0],
          oldPresent: database
            .loadLibrary('all')
            .every((project) => requireExists(project.image_path)),
        });
      return send(channel, ...args);
    };
    await click('更改位置');
    await wait(
      `document.querySelector('.settings-column code')?.textContent === ${JSON.stringify(target)}`,
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
    await click('图片库', 'document.querySelector(".studio-titlebar")');
    await h.checkSoon(
      '迁移后图库图片仍能解码',
      '!!document.querySelector(".library-page") && !document.querySelector("[data-library-updating=true]") && [...document.querySelectorAll(".library-card img")].some(i=>i.getClientRects().length && i.complete && i.naturalWidth>0)',
      12000,
      undefined,
      undefined,
      'once',
    );
    const draftProjectId = await createTrashDraft(context);
    await section('图片库');
    await click('清空回收站');
    await wait('!!document.querySelector("dialog[open]")');
    await check(
      '清空草稿图片时确认框说明工作区草稿影响',
      'document.querySelector("dialog").textContent.includes("工作区草稿")',
      undefined,
      'once',
    );
    await click('取消', 'document.querySelector("dialog")');
    await wait('!document.querySelector("dialog[open]")');
    await check(
      '清空回收站取消保留图片',
      () => database.loadLibrary('trash').length === 2,
      undefined,
      'once',
    );
    await click('清空回收站');
    await wait('!!document.querySelector("dialog[open]")');
    await e('document.querySelector("dialog .nps-actions button:last-child").click()');
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
    ipcMain.removeHandler('ai:settings:get');
    ipcMain.handle('ai:settings:get', async () => {
      const saved = preferences.publicSettings();
      aiReads++;
      await gate;
      return saved;
    });
  }
  const aiDraftMatches = `document.querySelector(${JSON.stringify(aiInput(0))})?.value === ${JSON.stringify(mode.baseUrl)} && document.querySelector('[aria-label="模型"]')?.value==='acceptance-model' && document.querySelector('input[type=password]')?.value===${JSON.stringify(encrypted ? 'acceptance-local-key' : '')} && [...document.querySelectorAll('textarea')].map(e=>e.value).join('|') === '验收翻译规则|验收分类规则'`;
  const aiDraftDetails = `(()=>{const key=document.querySelector('input[type=password]'); const areas=[...document.querySelectorAll('textarea')]; return {baseUrl:document.querySelector(${JSON.stringify(aiInput(0))})?.value, model:document.querySelector('[aria-label="模型"]')?.value, apiKey:{empty:!key?.value,length:key?.value.length ?? 0}, translationPrompt:areas[0]?.value, classificationPrompt:areas[1]?.value}})()`;
  try {
    await section('AI 服务');
    await wait('!!document.querySelector("input[type=password]")');
    if (slowAIRead) await h.until(() => aiReads === 1, '首次设置读取已挂起');
    await input(aiInput(0), mode.baseUrl);
    if (encrypted) await input(aiInput(1), 'acceptance-local-key');
    else
      h.uncovered(
        '保存与恢复安全存储 Key',
        '本平台 safeStorage.isEncryptionAvailable() 返回 false',
      );
    await input(aiInput(2), 'acceptance-model');
    await input('textarea', '验收翻译规则');
    await e(
      `(() => {const e=[...document.querySelectorAll('textarea')][1]; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'验收分类规则');e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    );
    await section('外观');
    await section('AI 服务');
    await check('分页切换保留 AI 草稿', aiDraftMatches, aiDraftDetails, 'once');
    if (slowAIRead) {
      await h.until(() => aiReads >= 2, '切回分页重新读取设置');
      releaseAIRead();
      // A subsequent IPC round trip and React paint drain the released replies.
      await e(
        '(async()=>{await window.studio.getAISettings(); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()',
      );
      await check('晚到的已保存 AI 设置不覆盖五个草稿字段', aiDraftMatches, aiDraftDetails, 'once');
      if (!(await e(aiDraftMatches)))
        throw new Error('AI 草稿已丢失，停止后续连接测试，避免访问被覆盖后的服务地址');
    }
  } finally {
    if (slowAIRead) {
      releaseAIRead();
      ipcMain.removeHandler('ai:settings:get');
      ipcMain.handle('ai:settings:get', () => preferences.publicSettings());
    }
  }
  await click('重新读取模型列表');
  {
    await wait('document.body.innerText.includes("已读取 2 个模型")');
    await select('模型列表', 'acceptance-other');
    await h.checkSoon(
      '选择模型列表会修改模型输入',
      'document.querySelector("input[aria-label=模型]").value === "acceptance-other"',
      undefined,
      undefined,
      undefined,
      'once',
    );
    await select('模型列表', 'acceptance-model');
    await click('测试连接');
    await wait('document.body.innerText.includes("连接成功")');
    await check(
      '本地兼容服务读取模型并成功连接',
      'document.body.innerText.includes("连接成功 · acceptance-model")',
      undefined,
      'once',
    );
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
    await wait('document.body.innerText.includes("连接成功")');
    await check(
      '失败后重试成功',
      'document.body.innerText.includes("连接成功")',
      undefined,
      'once',
    );
  }
  await input('textarea', '验收翻译规则（已保存）');
  await click('保存');
  await wait('document.body.innerText.includes("AI 服务设置已安全保存")');
  if (encrypted)
    await check(
      '空 Key 再保存保留加密 Key',
      () => preferences.credentials().apiKey === 'acceptance-local-key',
      undefined,
      'once',
    );
  await h.screenshot('ai');
  if (mode.category === '设置·AI 服务') return;
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
  await click('检查更新');
  await wait('document.body.innerText.includes("发现新版本 99.0.0")');
  await check(
    '更新结果来自验收替身',
    'document.body.innerText.includes("发现新版本 99.0.0")',
    undefined,
    'once',
  );
  await click('更新说明');
  await wait('document.querySelector("dialog")?.textContent.includes("验收发布说明")');
  await check('发布说明对话框打开', '!!document.querySelector("dialog[open]")', undefined, 'once');
  await click('关闭', 'document.querySelector("dialog")');
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
  await wait('document.body.innerText.includes("诊断信息已复制")');
  await check(
    '剪贴板诊断只包含版本和平台',
    () =>
      clipboard.readText().replaceAll('\r\n', '\n') ===
      `NovelAI Prompt Studio v${app.getVersion()}\n平台：${{ win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform]}`,
    undefined,
    'once',
  );
  await click('查看声明');
  await h.checkSoon(
    '声明包含三种字体和 Remix Icon 完整许可',
    '["MiSans VF 4.003","Newsreader","IBM Plex Mono","Remix Icon"].every(name=>[...document.querySelectorAll("dialog details")].some(d=>d.querySelector("summary").textContent===name && d.querySelector("pre").textContent.length>500))',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await h.nativeKey('Escape');
  await wait('!document.querySelector("dialog[open]")');
  await check(
    'Esc 关闭声明且焦点归还',
    'document.activeElement.textContent.trim()==="查看声明"',
    undefined,
    'once',
  );
  h.category('设置·外观');
  const libraryBefore = JSON.stringify(database.loadLibrary('all'));
  await section('外观');
  for (const [label, family] of [
    ['界面字体', 'IBM Plex Mono'],
    ['等宽字体', 'MiSans'],
    ['段落字体', 'MiSans'],
  ]) {
    await click(label);
    await h.checkSoon(
      `${label}三种内置字体排在最前`,
      '[...document.querySelectorAll(".nps-layer [role=option]")].slice(0,3).map(e=>e.textContent.trim()).join("|") === "MiSans（内置）|IBM Plex Mono（内置）|Newsreader（内置）"',
      undefined,
      undefined,
      undefined,
      'both',
    );
    await h.key('Home');
    if (family === 'IBM Plex Mono') await h.key('ArrowDown');
    await h.key('Enter');
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
  await h.font('.settings-sidebar button:nth-child(3) .nps-button-label', 'IBM Plex Mono');
  await section('翻译词典');
  await wait('!!document.querySelector(".settings-tag")');
  await h.font('.settings-tag', 'MiSans');
  await check(
    '改字体不改变图片、Prompt、Tag 和收藏状态',
    () => JSON.stringify(database.loadLibrary('all')) === libraryBefore,
    undefined,
    'once',
  );
  database.updateProjects([database.loadLibrary('all').at(-1).id], { deleted: true });
  await fs.writeFile(
    savedFile,
    JSON.stringify({
      appearance: preferences.appearanceSettings(),
      autoCheck: preferences.productivitySettings().autoCheckUpdates,
      ai: preferences.publicSettings(),
    }),
  );
}

import { existsSync as requireExists } from 'node:fs';
