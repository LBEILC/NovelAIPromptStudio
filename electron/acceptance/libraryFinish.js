export async function collectionContext(h, id, action) {
  await h.evaluate(
    `document.querySelector('[data-collection-id="${id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:180}))`,
  );
  await h.wait('!!document.querySelector(".nps-menu:popover-open")');
  if (action) await h.click(action, 'document.querySelector(".nps-menu:popover-open")');
}

export async function checkCollectionContext(h, id) {
  await collectionContext(h, id);
  await h.check(
    '收藏集右键菜单包含重命名和删除；智能收藏集提供编辑规则',
    `(async()=>{const menu=document.querySelector('.nps-menu:popover-open'),items=[...menu.querySelectorAll('[role=menuitem]')];return (items.length===2||items.length===3&&items[0].textContent.trim()==='编辑规则…')&&items.at(-2).textContent.trim()==='重命名'&&items.at(-1).textContent.trim()==='删除'})()`,
    undefined,
    'both',
  );
  await h.click('重命名', 'document.querySelector(".nps-menu:popover-open")');
  await h.wait('!!document.querySelector(".library-side input")');
  await h.check(
    '右键重命名就地编辑、全选且使用已定占位文案',
    `(()=>{const input=document.querySelector('.library-side input');return !document.querySelector('dialog[open]')&&input.placeholder==='收藏集名称'&&document.activeElement===input&&input.selectionStart===0&&input.selectionEnd===input.value.length})()`,
    undefined,
    'once',
  );
  await h.key('Escape', {}, 'document.activeElement');
}

export async function libraryFinishChecks({
  h,
  database,
  refresh,
  click,
  input,
  selectCard,
  waitDetail,
}) {
  const { evaluate: e, wait, check, key } = h;
  h.category('图片库·012a收尾');
  const scope = 'document.querySelector(".library-page")';
  const popup = 'document.querySelector(".nps-popover:popover-open")';
  const models = ['NovelAI Diffusion V5 Full AABBCCDD', 'NovelAI Diffusion V5 12345678'];
  const base = database.loadLibrary('all')[0];
  for (const [index, model] of models.entries())
    database.insertProject({
      ...base,
      id: '012a-model-' + index,
      name: '012a-model-' + index,
      tags: [],
      metadata: {
        ...base.metadata,
        model,
        width: 0,
        height: 0,
        steps: '',
        guidance: '',
        seed: '',
        extra_json: '{}',
      },
    });
  const legacy = database.createCollection({
    id: '012a-legacy',
    name: '012a旧模型规则',
    kind: 'smart',
    filters: { models: [models[0]] },
  });
  const empty = database.createCollection({
    id: '012a-empty-rules',
    name: '012a无规则',
    kind: 'smart',
    filters: {},
  });
  await refresh();
  await click('视图', scope);
  await click('不合并', popup);
  await key('Escape');
  await click(legacy.name, scope);
  await wait('document.querySelectorAll(".library-card").length===1');
  await check(
    '原始模型名称的旧智能规则继续精确生效',
    'document.querySelector(".library-card").dataset.projectId==="012a-model-0"',
    undefined,
    'once',
  );
  await click('编辑规则', scope);
  await check(
    '旧规则只选同名组一部分时保留半选状态',
    `(()=>{const label=[...document.querySelectorAll('.library-filter-check')].find(n=>n.textContent.trim()==='V5');return label?.getAttribute('aria-checked')==='mixed'})()`,
    undefined,
    'once',
  );
  await key('Escape');
  await click(empty.name, scope);
  await check(
    '无条件智能收藏集仍提供编辑规则且没有虚构条件',
    'document.querySelector(".library-chips").textContent.trim()==="编辑规则" && !document.querySelector(".library-chip")',
    undefined,
    'once',
  );
  await click('全部图片', scope);
  await input('.gallery-search input', '012a-model-');
  await wait('document.querySelectorAll(".library-card").length===2');
  await selectCard(0);
  await waitDetail();
  await check(
    '缺失参数整行隐藏、缺失尺寸显示未知',
    '!document.querySelector("[data-generation-parameters]") && document.querySelector(".library-caption").textContent.includes("尺寸未知")',
    undefined,
    'both',
  );
  await e(
    `document.querySelector('.library-caption .library-mono [data-tip]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
  );
  await wait('!!document.querySelector("[role=tooltip]:popover-open")');
  await check(
    '详情显示短模型名并提供原名悬停提示',
    `(()=>{const model=document.querySelector('.library-caption .library-mono [data-tip]');return model?.textContent==='V5'&&!model.hasAttribute('title')&&${JSON.stringify(models)}.includes(document.querySelector('[role=tooltip]:popover-open')?.textContent)})()`,
    undefined,
    'both',
  );
  await key('Escape');
  await click('筛选', scope);
  await e(
    `[...document.querySelectorAll('.library-filter-check')].find(n=>n.textContent.trim()==='V5').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`,
  );
  await wait('!!document.querySelector("[role=tooltip]:popover-open")');
  await check(
    '同短名模型合为一个复选项且保留全部原名提示',
    `(()=>{const labels=[...document.querySelectorAll('.library-filter-check')].filter(n=>n.textContent.trim()==='V5');return labels.length===1&&!labels[0].hasAttribute('title')&&${JSON.stringify(models)}.every(v=>document.querySelector('[role=tooltip]:popover-open')?.textContent.includes(v))})()`,
    undefined,
    'both',
  );
  await e(
    "[...document.querySelectorAll('.library-filter-check')].find(n=>n.textContent.trim()==='V5').click()",
  );
  await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await key('Escape');
  await check(
    '选择合并模型选项同时保留两种原名的图片',
    'document.querySelectorAll(".library-card").length===2',
    undefined,
    'once',
  );
  await click('筛选', scope);
  await click('存为智能收藏集', popup);
  await input('input[aria-label="收藏集名称"]', '012a合并模型');
  await key('Enter', {}, 'document.activeElement');
  await h.until(
    () => database.listCollections().some((c) => c.name === '012a合并模型'),
    '保存合并模型规则',
  );
  await check(
    '合并模型选项保存的是全部原始名称',
    () => {
      const saved = database.listCollections().find((c) => c.name === '012a合并模型');
      return (
        saved.filters.models.length === 2 && models.every((v) => saved.filters.models.includes(v))
      );
    },
    undefined,
    'once',
  );
  await click('全部图片', scope);
  await click('筛选', scope);
  const modelInput = `[...document.querySelectorAll('.library-filter-check')].find(n=>n.textContent.trim()==='V5')`;
  await wait(
    `!!(${modelInput}) && (${modelInput}).getAttribute('aria-checked')==='false'`,
    '全部图片的模型筛选已重置',
  );
  await h.checkSoon(
    '点击合并模型复选项后全部别名选中',
    `(${modelInput}).getAttribute('aria-checked')==='true'`,
    undefined,
    `(${modelInput}).click()`,
    undefined,
    'once',
  );
  await h.checkSoon(
    '再次取消合并模型复选项取消全部别名',
    `(()=>{const label=[...document.querySelectorAll('.library-filter-check')].find(n=>n.textContent.trim()==='V5');const input=label;return input.getAttribute('aria-checked')==='false'})()`,
    undefined,
    `(${modelInput}).click()`,
    undefined,
    'once',
  );
  await key('Escape');
  await click('视图', scope);
  await click('图片排序', popup);
  await check(
    '排序选项使用三条定稿文案',
    `['最近导入的在前','最早导入的在前','按名称'].every(v=>document.body.textContent.includes(v))`,
    undefined,
    'once',
  );
  await key('Escape');
  await key('Escape');
  await e(
    `(()=>{const data=new DataTransfer();data.items.add(new File(['invalid'],'unsupported.txt',{type:'text/plain'}));window.__invalidLibraryDrop=data;for(const type of ['dragenter','dragover'])document.querySelector('.library-scroll').dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:data,clientX:400,clientY:300}));})()`,
  );
  await wait('!!document.querySelector(".library-drop")');
  await e(
    `(()=>{document.querySelector('.library-scroll').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__invalidLibraryDrop,clientX:400,clientY:300}));delete window.__invalidLibraryDrop;})()`,
  );
  await wait(
    'document.querySelector(".nps-notifications").textContent.includes("只能导入 PNG、JPG、WEBP 图片和 ZIP")',
  );
  await check(
    '不支持文件显示已定导入提示',
    'document.querySelector(".nps-notifications").textContent.includes("只能导入 PNG、JPG、WEBP 图片和 ZIP") && !document.querySelector(".library-drop")',
    undefined,
    'once',
  );
  const trash = database.loadLibrary('trash').map((p) => p.id);
  await click('回收站', scope);
  await click('清空回收站', scope);
  await wait('!!document.querySelector("dialog[open]")', '清空回收站已读完占用空间并打开确认');
  await check(
    '清空确认说明实际图片数量、不可撤销和原文件不受影响',
    `document.querySelector('dialog[open] .nps-dialog-body p').textContent==='将永久删除回收站中的 ${trash.length} 张图片，此操作无法撤销。原文件不受影响。'`,
    undefined,
    'once',
  );
  await click('取消', 'document.querySelector("dialog[open]")');
  database.updateProjects(trash, { deleted: false });
  await refresh();
  await click('回收站', scope);
  await check(
    '回收站为空时清空按钮保留并禁用',
    '(()=>{const b=[...document.querySelectorAll(".library-page button")].find(b=>b.textContent.trim()==="清空回收站");return !!b&&(b.disabled||b.getAttribute("aria-disabled")==="true")&&b.dataset.tip==="回收站为空"})()',
    undefined,
    'once',
  );
  database.updateProjects(trash, { deleted: true });
  // Remove only synthetic database records; their pixel files are shared with base.
  for (const [index] of models.entries()) database.deleteProject('012a-model-' + index);
  for (const collection of database
    .listCollections()
    .filter((c) => [legacy.id, empty.id].includes(c.id) || c.name === '012a合并模型'))
    database.deleteCollection(collection.id);
  await refresh();
}
