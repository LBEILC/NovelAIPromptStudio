import { parsePrompt } from '../../src/lib/prompt.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';

export async function libraryNamingChecks({ h, database, doubles }) {
  h.category('图片库·起名');
  const { evaluate: e, wait, check, click, input } = h;
  const dialog = 'document.querySelector("dialog[open]")';
  const actions = 'document.querySelector(".library-detail-actions")';
  const bar = 'document.querySelector(".library-selection-bar")';
  const confirmNaming = async () => {
    if (await e('!!document.querySelector("dialog[open]")')) await click('起名', dialog);
    else if (await e('!!document.querySelector(".library-batch-name:popover-open")'))
      await click('确定', 'document.querySelector(".library-batch-name:popover-open")');
    else await h.key('Enter', {}, 'document.querySelector(".library-inline-name input")');
    await wait(
      '!document.querySelector("dialog[open],.library-inline-name,.library-batch-name:popover-open")',
      '起名完成后编辑关闭',
    );
    await wait(
      '!document.querySelector("[data-library-updating=true]")',
      '起名后的图库排列刷新完成',
    );
  };
  const fixtureIds = [];
  let updateRequested = false;
  let releaseUpdate;
  const updateReady = new Promise((resolve) => {
    releaseUpdate = resolve;
  });
  doubles.beforeUpdateCheck = () => {
    updateRequested = true;
    return updateReady;
  };
  const previousSize = h.window.getContentSize();
  h.window.setContentSize(1240, 760);
  const source = database.loadLibrary()[0];
  const make = (index) => {
    const id = `naming-fixture-${index}`;
    const metadata = {
      model: 'nai-diffusion-4-5-full',
      width: 832,
      height: 1216,
      prompt_raw: `geometric shape, synthetic group ${Math.floor(index / 2)}`,
      extra_json: JSON.stringify({
        studio_naming: {
          original_filename: `synthetic sample ${index === 5 ? 'fixture '.repeat(12) : ''}s-${1000 + index} (1).PNG`,
        },
      }),
    };
    database.insertProject({
      ...source,
      id,
      name: `synthetic sample s-${1000 + index} (1)`,
      content_hash: id,
      created_at: new Date(Date.UTC(2030, 0, 1, 0, 0, index)).toISOString(),
      updated_at: new Date().toISOString(),
      metadata,
      tags: parsePrompt(metadata.prompt_raw),
      prompt_structure: createPromptStructure(metadata),
    });
    fixtureIds.push(id);
  };
  const refresh = async () => {
    await h.reload();
    await click('图片库', 'document.querySelector(".studio-titlebar")');
    await click('全部图片', 'document.querySelector(".library-page")');
    await input('input[aria-label="搜索图片库"]', 'synthetic sample');
    await wait(
      '!document.querySelector("[data-library-updating=true]") && document.querySelectorAll(".library-card").length > 0',
    );
  };
  const grouping = async (name) => {
    await click('视图');
    await click(name, 'document.querySelector("[role=radiogroup][aria-label=合并方式]")');
    await h.key('Escape', {}, 'document.activeElement');
    await wait(
      '!document.querySelector(".nps-popover:popover-open") && !document.querySelector("[data-library-updating=true]")',
    );
  };
  const card = async (index, multi = false) => {
    await e(
      `(()=>{const c=document.querySelector('[data-library-index="${index}"]');c.focus();c.dispatchEvent(new MouseEvent('click',{bubbles:true,${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:${multi}}))})()`,
    );
    if (!multi)
      await wait(
        `(async()=>{const detail=document.querySelector('.library-detail'), card=document.querySelector('.library-card.current');if(!detail?.dataset.detailId||!card||detail.getAttribute('aria-busy')!=='false')return false;const ids=[detail.dataset.detailId,card.dataset.projectId];const [a,b]=await Promise.all(ids.map(id=>window.studio.invoke('library.get',{id}).then(r=>r.data.project)));return a.id===b.id||a.exact_group_fingerprint===b.exact_group_fingerprint})()`,
      );
  };
  const undo = async () => {
    await click('撤销', 'document.querySelector(".nps-toast")');
    await h.until(
      () => fixtureIds.every((id) => !database.loadProject(id).has_custom_name),
      '撤销恢复原名标记',
    );
  };
  const saveDefault = async (expected) => {
    doubles.saves.push({ canceled: true });
    const count = doubles.calls.length;
    await click('另存为', 'document.querySelector(".library-viewer")');
    await h.until(() => doubles.calls.length > count, '另存为默认名称已传给原生对话框');
    await check(
      '另存为默认名称：' + expected,
      () =>
        doubles.calls
          .slice(count)
          .some((c) => c.kind === 'save' && c.options.defaultPath === expected),
      undefined,
      'once',
    );
  };
  try {
    for (let i = 0; i < 6; i++) make(i);
    await refresh();
    await check(
      '详情 IPC 与列表逐字一致，缺失图片返回 null',
      `(async()=>{const images=${JSON.stringify([...database.loadLibrary('all'), ...database.loadLibrary('trash')])};for(const image of images) if(JSON.stringify(await window.studio.invoke('library.get',{id:image.id}).then(result=>result.ok?result.data.project:result.error.code==='not_found'?null:Promise.reject(Error(result.error.message))))!==JSON.stringify(image)) return false;return await window.studio.invoke('library.get',{id:'missing-naming-fixture'}).then(result=>result.ok?result.data.project:result.error.code==='not_found'?null:Promise.reject(Error(result.error.message)))===null;})()`,
      undefined,
      'once',
    );
    await grouping('不合并');
    await card(0);
    const id = await e('document.querySelector(".library-detail").dataset.detailId');
    const original = database.loadProject(id);
    await e(
      `document.querySelector('.library-file').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
    );
    await wait('!!document.querySelector("[role=tooltip]:popover-open")');
    await check(
      '未起名详情省略标题，文件行保留完整悬停名称',
      `!document.querySelector('.library-name') && !document.querySelector('.library-file').hasAttribute('title') && document.querySelector('[role=tooltip]:popover-open')?.textContent === ${JSON.stringify(original.original_filename)}`,
      undefined,
      'both',
    );
    await h.key('Escape');
    await check(
      '未起名卡片使用导入日期作为无障碍名称',
      'document.querySelector(".library-card.current").getAttribute("aria-label").startsWith("图片，导入于 ")',
      undefined,
      'once',
    );
    await h.screenshot('library-unnamed');
    await check(
      '长文件名中间省略并完整保留末尾',
      `(()=>{const start=document.querySelector('.library-file-start'),end=document.querySelector('.library-file-end'),row=document.querySelector('.library-file');return start.scrollWidth>start.clientWidth && getComputedStyle(start).textOverflow==='ellipsis' && end.textContent.endsWith('(1).PNG') && row.scrollWidth<=row.clientWidth+1})()`,
      undefined,
      'both',
    );
    await h.font('.library-file-start', 'IBM Plex Mono');
    await e('document.querySelector(".library-detail-picture img").click()');
    await wait('!!document.querySelector(".library-viewer")');

    await saveDefault(original.original_filename);
    await click('关闭', 'document.querySelector(".library-viewer")');
    await click('起名', actions);
    await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await check(
      '详情起名使用行内编辑且自动聚焦',
      '!document.querySelector("dialog[open]")&&document.activeElement===document.querySelector(".library-inline-name input")',
      undefined,
      'once',
    );
    await input('input[aria-label="图片名称"]', '   ');
    await h.key('Enter', {}, 'document.activeElement');
    await wait('!document.querySelector(".library-inline-name")');
    await check(
      '空白名称结束编辑且不修改图片',
      () => !database.loadProject(id).has_custom_name,
      undefined,
      'once',
    );
    await click('起名', actions);
    await input('input[aria-label="图片名称"]', 's-42');
    await confirmNaming();
    await wait('document.querySelector(".library-name")?.textContent === "s-42"');
    await check(
      '单张不加编号，形似文件名的显式名称仍显示标题',
      () => database.loadProject(id).name === 's-42' && database.loadProject(id).has_custom_name,
      undefined,
      'once',
    );
    await e(
      `document.querySelector('.nps-toast').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
    );
    await h.until(() => updateRequested, '自动更新请求已到达固定发布信息夹具');
    releaseUpdate();
    await e('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await check(
      '后台更新通知不替换带撤销的起名通知',
      'document.querySelector(".nps-toast button")?.textContent === "撤销" && !document.querySelector(".nps-toast").textContent.includes("发现新版本")',
      undefined,
      'once',
    );
    await undo();
    await wait(
      'document.querySelector(".nps-toast")?.textContent.includes("发现新版本 v99.0.0")',
      '撤销后显示等待中的后台更新通知',
    );
    await check(
      '撤销恢复数据后显示后台通知',
      () => !database.loadProject(id).has_custom_name,
      undefined,
      'once',
    );
    await e(
      `document.querySelector('.nps-toast').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}))`,
    );
    await wait('!document.querySelector(".library-name")');
    await click('起名', actions);
    await input('input[aria-label="图片名称"]', '命名验收.png');
    await confirmNaming();
    await wait('document.querySelector(".library-name")?.textContent === "命名验收.png"');
    await e('document.querySelector(".library-detail-picture img").click()');
    await wait('!!document.querySelector(".library-viewer")');
    await saveDefault('命名验收.png');
    await click('关闭', 'document.querySelector(".library-viewer")');
    await input('input[aria-label="搜索图片库"]', original.original_filename);
    await wait('document.querySelectorAll(".library-card").length === 1');
    await check(
      '改名后按完整原始文件名仍能搜索到图片',
      `document.querySelector('.library-card').dataset.projectId === ${JSON.stringify(id)}`,
      undefined,
      'once',
    );
    await undo();
    await input('input[aria-label="搜索图片库"]', 'synthetic sample');
    await grouping('完全相同');
    await wait('document.querySelectorAll(".library-card").length === 3');
    await card(0);
    await h.key(
      'a',
      process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true },
      'document.querySelector(".library-card")',
    );
    await check(
      '多选操作条起名紧跟加入收藏集',
      '(()=>{const b=[...document.querySelectorAll(".library-selection-bar button")];return b.findIndex(e=>e.textContent.trim()==="起名")===b.findIndex(e=>e.textContent.trim()==="加入收藏集")+1})()',
      undefined,
      'both',
    );
    await h.screenshot('library-select');
    const ordered = await e(
      '[...document.querySelectorAll(".library-card")].map(c=>c.dataset.projectId)',
    );
    await click('起名', bar);
    await input('input[aria-label="图片名称"]', '批量验收');
    await check(
      '六张预览两位编号',
      'document.querySelector(".library-batch-name").textContent.includes("批量验收-01、批量验收-02……")',
      undefined,
      'both',
    );
    await h.screenshot('library-rename');

    await confirmNaming();
    await h.until(
      () => fixtureIds.every((id) => database.loadProject(id).has_custom_name),
      '批量起名写入',
    );
    await check(
      '批量按当前组顺序编号，所有路径不变',
      () => {
        const records = fixtureIds.map((id) => database.loadProject(id));
        return (
          records.every((p) => p.image_path === source.image_path) &&
          ordered.every(
            (cover, index) =>
              records.find((p) => p.id === cover).name ===
              `批量验收-${String(index * 2 + 2).padStart(2, '0')}`,
          ) &&
          new Set(records.map((p) => p.name)).size === 6
        );
      },
      undefined,
      'once',
    );
    await wait(
      'document.querySelector(".nps-toast")?.textContent.includes("已给 6 张图片起名")',
      '起名通知已显示',
    );
    await check(
      '完成通知给出实际图片数和撤销',
      'document.querySelector(".nps-toast").textContent.includes("已给 6 张图片起名") && document.querySelector(".nps-toast button").textContent === "撤销"',
      undefined,
      'once',
    );
    await undo();
    await click('取消', bar);
    await card(0);
    const current = await e('document.querySelector(".library-detail").dataset.detailId');
    const members = await e(
      '[...document.querySelectorAll(".library-strip button")].map(b=>b.getAttribute("aria-label"))',
    );
    await click('起名', actions);
    await input('input[aria-label="图片名称"]', '整摞验收');
    await confirmNaming();
    await h.until(
      () => fixtureIds.filter((id) => database.loadProject(id).has_custom_name).length === 2,
      '整摞两张起名',
    );
    await wait(
      'document.querySelector(".library-name")?.textContent.startsWith("整摞验收-")',
      '整摞起名刷新到详情',
    );
    await wait(
      '[...document.querySelectorAll(".library-strip button")].map(b=>b.getAttribute("aria-label")).join("|") === "整摞验收-01|整摞验收-02"',
      '整摞缩略图名称刷新完成',
    );
    await check(
      '整摞按详情缩略图顺序编号',
      '([...document.querySelectorAll(".library-strip button")].map(b=>b.getAttribute("aria-label")).join("|") === "整摞验收-01|整摞验收-02")',
      undefined,
      'once',
    );
    await undo();
    await wait('!document.querySelector(".library-name")');
    await click('起名', actions);
    await input('input[aria-label="图片名称"]', '取消行内编辑');
    await h.key('Escape', {}, 'document.activeElement');
    await check(
      '整组行内起名按 Esc 放弃修改',
      () => fixtureIds.every((id) => !database.loadProject(id).has_custom_name),
      undefined,
      'once',
    );
    for (let i = 6; i < 100; i++) make(i);
    await refresh();
    await grouping('不合并');
    await card(0);
    await h.key(
      'a',
      process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true },
      'document.querySelector(".library-card")',
    );
    await wait('document.querySelector(".library-selection-bar")?.textContent.includes("100 张")');
    await click('起名', bar);
    await input('input[aria-label="图片名称"]', '百张验收');
    await check(
      '一百张预览切换为三位编号',
      'document.querySelector(".library-batch-name").textContent.includes("百张验收-001、百张验收-002……")',
      undefined,
      'once',
    );
    await confirmNaming();
    await h.until(
      () => fixtureIds.every((id) => database.loadProject(id).has_custom_name),
      '百张起名事务完成',
    );
    await check(
      '百张实际编号连续且顺序与导入倒序一致',
      () =>
        fixtureIds.every(
          (id, i) =>
            database.loadProject(id).name === `百张验收-${String(100 - i).padStart(3, '0')}`,
        ),
      undefined,
      'once',
    );
    await undo();
    await click('取消', bar);
  } finally {
    releaseUpdate();
    delete doubles.beforeUpdateCheck;
    for (const id of fixtureIds) database.deleteProject(id);
    await h.reload();
    await click('图片库', 'document.querySelector(".studio-titlebar")');
    await input('input[aria-label="搜索图片库"]', '');
    h.window.setContentSize(...previousSize);
  }
}
