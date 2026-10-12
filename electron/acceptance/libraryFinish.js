/** Measure painted icon/text separation, including anonymous flex text items. */
export async function checkLibraryButtonGaps(h, state) {
  await h.check(
    `图片库图文按钮间距为 ctl-gap（${state}）`,
    `(()=>{
    const buttons=[...document.querySelectorAll('.library-page button,.library-viewer button,.nps-popover:popover-open button')].filter(b=>b.getClientRects().length);
    const measurements=[];
    for(const button of buttons){
      for(const icon of button.querySelectorAll('i[class*="ri-"]')){
        if(!icon.getClientRects().length)continue;
        const nodes=[...icon.parentNode.childNodes];
        const at=nodes.indexOf(icon);
        const rectFor=node=>{
          if(node.nodeType===3){const value=node.textContent;const start=value.search(/\\S/);if(start<0)return null;const r=document.createRange();r.setStart(node,start);r.setEnd(node,value.trimEnd().length);return r.getBoundingClientRect();}
          return node.nodeType===1&&node.textContent.trim()&&node.getClientRects().length?node.getBoundingClientRect():null;
        };
        const next=nodes.slice(at+1).map(rectFor).find(Boolean);
        const prev=nodes.slice(0,at).reverse().map(rectFor).find(Boolean);
        if(!next&&!prev)continue;
        const r=icon.getBoundingClientRect();
        const gap=next?next.left-r.right:r.left-prev.right;
        measurements.push({text:button.textContent.trim(),gap,expected:parseFloat(getComputedStyle(button).getPropertyValue('--ctl-gap'))});
      }
    }
    window.__libraryGapMeasurements=measurements;
    return measurements.length>0&&measurements.every(m=>Math.abs(m.gap-m.expected)<=1);
  })()`,
    undefined,
    'both',
  );
}

export async function checkCollectionContext(h, id) {
  await h.evaluate(
    `document.querySelector('[data-collection-id="${id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:180}))`,
  );
  await h.wait('!!document.querySelector(".nps-menu:popover-open")');
  await h.check(
    '收藏集右键菜单包含重命名和危险色删除',
    `(()=>{const items=[...document.querySelectorAll('.nps-menu:popover-open [role=menuitem]')];return items.length===2&&items[0].textContent.trim()==='重命名'&&items[1].textContent.trim()==='删除收藏集'&&getComputedStyle(items[1]).color===getComputedStyle(document.querySelector('.library-collection-row .nps-button-danger')).color})()`,
    undefined,
    'both',
  );
  await h.click('重命名', 'document.querySelector(".nps-menu:popover-open")');
  await h.wait('!!document.querySelector("dialog[open]")');
  await h.check(
    '右键重命名使用已定占位文案',
    'document.querySelector("dialog[open] input").placeholder === "收藏集名称"',
    undefined,
    'once',
  );
  await h.click('取消', 'document.querySelector("dialog[open]")');
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
    `(()=>{const label=[...document.querySelectorAll('.library-filter-options label')].find(n=>n.textContent.trim()==='V5');return !!label?.querySelector('input').indeterminate})()`,
    undefined,
    'once',
  );
  await key('Escape');
  await click(empty.name, scope);
  await check(
    '无条件智能收藏集显示全部图片说明',
    'document.querySelector(".library-collection-row").textContent.includes("没有规则，包含全部图片")',
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
  await check(
    '详情显示短模型名并提供原名悬停提示',
    `(()=>{const model=document.querySelector('.library-caption [title]');return model?.textContent==='V5'&&${JSON.stringify(models)}.includes(model.title)})()`,
    undefined,
    'both',
  );
  await click('筛选', scope);
  await check(
    '同短名模型合为一个复选项且保留全部原名提示',
    `(()=>{const labels=[...document.querySelectorAll('.library-filter-options label')].filter(n=>n.textContent.trim()==='V5');return labels.length===1&&${JSON.stringify(models)}.every(v=>labels[0].title.includes(v))})()`,
    undefined,
    'both',
  );
  await e(
    "[...document.querySelectorAll('.library-filter-options label')].find(n=>n.textContent.trim()==='V5').querySelector('input').click()",
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
  await input('input[aria-label="智能收藏集名称"]', '012a合并模型');
  await click('存为智能收藏集', 'document.querySelector("dialog[open]")');
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
  const modelInput = `[...document.querySelectorAll('.library-filter-options label')].find(n=>n.textContent.trim()==='V5')?.querySelector('input')`;
  await wait(`!!(${modelInput}) && !(${modelInput}).checked`, '全部图片的模型筛选已重置');
  await h.checkSoon(
    '点击合并模型复选项后全部别名选中',
    `(${modelInput}).checked && !(${modelInput}).indeterminate`,
    undefined,
    `(${modelInput}).click()`,
    undefined,
    'once',
  );
  await h.checkSoon(
    '再次取消合并模型复选项取消全部别名',
    `(()=>{const label=[...document.querySelectorAll('.library-filter-options label')].find(n=>n.textContent.trim()==='V5');const input=label.querySelector('input');return !input.checked&&!input.indeterminate})()`,
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
    `['最近导入的在前','最早导入的在前','按名称排序'].every(v=>document.body.textContent.includes(v))`,
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
    '清空确认说明包含实际释放空间且不再有占位文字',
    `(()=>{const text=document.querySelector('dialog[open]').textContent;return /会释放 [\\d.]+ (KB|MB)。/.test(text)&&!text.includes('文案待定')})()`,
    undefined,
    'once',
  );
  await click('取消', 'document.querySelector("dialog[open]")');
  database.updateProjects(trash, { deleted: false });
  await refresh();
  await click('回收站', scope);
  await check(
    '回收站为空时不显示清空按钮',
    '![...document.querySelectorAll(".library-page button")].some(b=>b.textContent.trim()==="清空回收站")',
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
