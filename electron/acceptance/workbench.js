import { textEditingChecks, automaticAndVibeChecks } from './workbenchText.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { clipboard, nativeImage } from 'electron';
import { createWorkbenchFixtures, workbenchRaw, workbenchNegative } from './workbenchFixtures.js';
import { settleElements } from './layout.js';
import { withWorkbenchState, sessionExpression, draftExpression } from './workbenchState.js';

export async function workbenchChecks({ h, mode, doubles, database, preferences }) {
  h = withWorkbenchState(h);
  const { evaluate: e, wait, click, input, check, key } = h;
  h.category('工作台');
  const files = await createWorkbenchFixtures(path.join(mode.root, 'workbench-fixtures'));
  const previousSize = h.window.getContentSize();
  h.window.setContentSize(1240, 760);
  const modifier = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  const session = sessionExpression;
  const draft = draftExpression;
  const raw = `(${draft})?.prompt_structure.base_prompt_raw`;
  const base = 'document.querySelector(".wb-section[data-wb-scope=\"base:prompt\"]")';
  // All actions go through DOM or Electron/CDP. The persisted session is observed, never set.
  const scope = 'document.querySelector(".wb-section")';
  const menu = async (label, action, where = scope) => {
    await click(label, where);
    await click(action, 'document.querySelector(".nps-layer [role=menu]")');
  };
  const rawEdit = async (text) => {
    await menu('更多', '切换为文本编辑');
    await input('.wb-text-section textarea', text);
    await click('按块编辑（Ctrl E 切换）');
    await wait(`${raw}===${JSON.stringify(text)}`);
  };
  const reset = async () => {
    if (await e('!!document.querySelector(".wb-stage-dirty[data-visible]")')) {
      await click('恢复', 'document.querySelector(".wb-stage-title")');
      await wait(`${raw}===${JSON.stringify(workbenchRaw)}`);
    }
    await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await wait('!document.querySelector("[data-list-exit]")');
    // Reload establishes a remembered block type as the original view. Normalize
    // the fixture through its public menu before subsequent Tag interactions.
    if (
      await e('document.querySelector(".wb-block > header > span")?.textContent.startsWith("段落")')
    )
      await menu('块操作', '转为 Tag 块', 'document.querySelector(".wb-block")');
  };
  const checkCopy = async (label, predicate) => {
    await h.until(predicate, label);
    await check(label, predicate, undefined, 'once');
  };
  const shot = (state) => h.screenshot('workbench-' + state);
  const pointer = (type, x, y) =>
    h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
    });
  const drag = async (source, target) => {
    const center = async (selector) => {
      await e(`(${selector}).scrollIntoView({block:'nearest',inline:'nearest'})`);
      await settleElements(h, `[${selector}]`);
      return e(
        `(()=>{const n=${selector};n.scrollIntoView({block:'nearest',inline:'nearest'});const r=(n.matches('.wb-tab')?n.querySelector('img'):n).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
      );
    };
    const from = await center(source);
    await pointer('mouseMoved', from.x, from.y);
    await pointer('mousePressed', from.x, from.y);
    await pointer('mouseMoved', from.x + 10, from.y + 2);
    await e('new Promise(resolve=>requestAnimationFrame(resolve))');
    const to = await center(target);
    await pointer('mouseMoved', to.x, to.y);
    await e('new Promise(resolve=>requestAnimationFrame(resolve))');
    await pointer('mouseReleased', to.x, to.y);
    await wait('!document.querySelector(".wb-drag-feedback")');
    await wait(
      `(()=>{let received=false;const listener=()=>{received=true};window.addEventListener('click',listener);document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));window.removeEventListener('click',listener);return received})()`,
    );
  };
  await click('工作台', 'document.querySelector(".studio-titlebar")');
  await check(
    '空工作台提供图片和剪贴板两个打开入口',
    '!!document.querySelector(".wb-empty") && document.body.innerText.includes("把一张 NovelAI 图片拖到这里")',
  );
  await shot('empty');
  doubles.selections.push({ canceled: false, filePaths: [files[0]] });
  await click('打开图片', 'document.querySelector(".studio-titlebar")');
  await wait('document.querySelectorAll(".wb-block").length===4');
  await e(
    `(()=>{const tab=document.querySelector('.wb-tab');window.__middlePrevented=!tab.dispatchEvent(new MouseEvent('mousedown',{button:1,bubbles:true,cancelable:true}));tab.dispatchEvent(new MouseEvent('auxclick',{button:1,bubbles:true,cancelable:true}))})()`,
  );
  await wait('document.querySelectorAll(".wb-tab").length===0');
  await check(
    '中键直接关闭干净标签页并阻止自动滚动默认动作',
    'window.__middlePrevented && !document.querySelector("dialog[open]") && !document.querySelector(".wb-tab")',
    undefined,
    'once',
  );
  doubles.selections.push({ canceled: false, filePaths: [files[0]] });
  await click('打开图片', 'document.querySelector(".studio-titlebar")');
  await wait('document.querySelectorAll(".wb-block").length===4');
  await e(
    `document.querySelector('.wb-tab').dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }))`,
  );
  await wait('document.querySelectorAll(".wb-tab").length===0');
  await check(
    '标签页直接关闭入口沿用关闭命令',
    '!document.querySelector(".wb-tab")',
    undefined,
    'once',
  );
  doubles.selections.push({ canceled: false, filePaths: [files[0]] });
  await click('打开图片', 'document.querySelector(".studio-titlebar")');
  await wait('document.querySelectorAll(".wb-block").length===4');
  await check(
    '无角色时节标题为提示词，顶部包含编辑方式、搜索、显示、翻译与复制',
    `document.querySelector('.wb-section-head > button').textContent.trim()==='提示词' && !document.querySelector('.wb-prompt-head strong') && document.querySelector('.wb-prompt').getAttribute('aria-label')==='提示词' && document.querySelector('.wb-prompt-head input').placeholder==='搜索 Tag 或译文' && document.querySelector('.wb-prompt-head [aria-label="翻译"]').getAttribute('data-tip')==='翻译'&&!!document.querySelector('.wb-prompt-head [aria-label=复制]')`,
  );
  await shot('copy-header');
  await click('块操作', 'document.querySelector(".wb-block")');
  await check(
    'Tag 块菜单使用定稿动作、三个分隔线且没有未实现项目',
    `(()=>{const m=document.querySelector('.nps-layer [role=menu]');return [...m.querySelectorAll('[role=menuitem]')].map(n=>n.getAttribute('aria-label')).join('|')==='转为段落|翻译并分类|复制|上移|下移|删除' && m.querySelectorAll('.nps-menu-separator').length===3})()`,
  );
  await shot('copy-tag-menu');
  await key('Escape');
  await check(
    '文件打开恢复三个正面块与一个排除块',
    `${raw}===${JSON.stringify(workbenchRaw)} && document.querySelectorAll('.wb-block').length===4`,
  );
  await check(
    '默认标签页仅显示缩略图且竖图宽度符合令牌',
    `(()=>{const t=document.querySelector('.wb-tab'),i=t.querySelector('img'),s=getComputedStyle(i);return !t.querySelector('.wb-tab-name') && Math.abs(i.width-Math.max(parseFloat(s.getPropertyValue('--tab-thumb-min-w')),i.height*832/1216))<2})()`,
  );
  await check(
    '工作台节标题实际使用标题令牌，文档与节块间距匹配界面稿',
    `(()=>{const doc=document.querySelector('.wb-document-scroll'),css=getComputedStyle(doc),px=name=>parseFloat(css.getPropertyValue(name)),heads=[...document.querySelectorAll('.wb-section-head')];return parseFloat(css.paddingTop)===px('--sp-1') && parseFloat(css.paddingBottom)===px('--sp-5') && heads.length>0 && heads.every(head=>{const title=getComputedStyle(head.firstElementChild),style=getComputedStyle(head);return title.fontSize===css.getPropertyValue('--fs-title').trim() && parseFloat(style.paddingTop)===px('--sp-3')+px('--sp-0') && parseFloat(style.paddingBottom)===px('--sp-0')}) && [...document.querySelectorAll('.wb-block')].every(block=>{const style=getComputedStyle(block);return parseFloat(style.paddingTop)===px('--sp-2')+px('--sp-0') && parseFloat(style.paddingBottom)===px('--sp-3')})})()`,
    undefined,
    'both',
  );
  await shot('home');

  await click('其他复制方式');
  await check(
    '工作台复制菜单可交互且提供正面、排除和逐节复制',
    `[...document.querySelectorAll('[role=menuitem]')].some(x=>x.getAttribute('aria-label')==='复制全部负面提示词')`,
  );
  await shot('copy');
  await click('复制全部提示词');
  await checkCopy(
    '默认全部复制与原始正面文本逐字一致',
    () => clipboard.readText().replaceAll('\r\n', '\n') === workbenchRaw,
    undefined,
    'once',
  );
  await click('其他复制方式');
  await click('复制全部负面提示词');
  await checkCopy(
    '排除菜单复制原始排除文本',
    () => clipboard.readText() === workbenchNegative,
    undefined,
    'once',
  );
  await click('复制这一节', scope);
  await checkCopy(
    '节标题复制未经格式化的原始文本',
    () => clipboard.readText().replaceAll('\r\n', '\n') === workbenchRaw,
    undefined,
    'once',
  );
  await click('显示');
  await shot('view');
  await h.select('只看', '负面');
  await key('Escape');
  await click('复制负面提示词 · 2');
  await checkCopy(
    '仅看负面提示词时主按钮复制负面 Tag',
    () => clipboard.readText() === workbenchNegative,
    undefined,
    'once',
  );
  await shot('negsel');
  await click('清除');
  await key('k', modifier);
  await check(
    'Mod K 聚焦工作台搜索',
    'document.activeElement.getAttribute("aria-label")==="搜索 Tag 或译文"',
    undefined,
    'once',
  );
  await input('.wb-prompt [aria-label="搜索 Tag 或译文"]', 'blue');
  await check(
    '搜索使不匹配 Tag 变淡并收起无匹配块',
    '!!document.querySelector(".wb-filters") && document.body.innerText.includes("已经收起")',
  );
  await shot('filter');
  await click('清除');
  await click('显示');
  for (const language of ['译文', '对照', '原文']) {
    await h.select('语言', language);
    await check(
      `显示语言切换为${language}`,
      `document.querySelector('[aria-label="语言"]').textContent.includes(${JSON.stringify(language)})`,
    );
  }
  await h.select('排列', '按分类');
  await key('Escape');
  await wait(
    'document.body.innerText.includes("按分类排列时不能拖动排序")',
    '选择排列后立即关闭浮层仍提交选择',
  );
  await check(
    '按分类排列保留段落并提示不可拖动排序',
    '!!document.querySelector(".wb-prose") && document.body.innerText.includes("按分类排列时不能拖动排序")',
  );
  await click('显示');
  await h.select('排列', '按块');
  await h.select('只看', '正面');
  await key('Escape');
  await check('只看正面隐藏排除节', 'document.querySelectorAll(".wb-section").length===1');
  await click('清除');
  await menu('块操作', '复制', 'document.querySelector(".wb-block")');
  await checkCopy(
    '块菜单复制原文保留权重语法',
    () => clipboard.readText() === workbenchRaw.split('\n\n')[0],
  );
  await menu('块操作', '下移', 'document.querySelector(".wb-block")');
  await check(
    '块菜单下移保持每块原文',
    `${raw}===${JSON.stringify([workbenchRaw.split('\n\n')[1], workbenchRaw.split('\n\n')[0], workbenchRaw.split('\n\n')[2]].join('\n\n'))}`,
  );
  await menu('块操作', '上移', 'document.querySelectorAll(".wb-block")[1]');
  await check('块菜单上移恢复逐字原文', `${raw}===${JSON.stringify(workbenchRaw)}`);
  await menu('块操作', '删除', 'document.querySelectorAll(".wb-block")[2]');
  await check(
    '块菜单只删除目标块',
    `${raw}.includes(${JSON.stringify(workbenchRaw.split('\n\n')[1])}) && !${raw}.includes('glass window')`,
  );
  await reset();
  await click('段落', 'document.querySelector(".wb-add-block-gap")');
  await check(
    '块间新增段落直接进入空段落编辑',
    '!!document.querySelector(".wb-new-block [aria-label=英文段落]")',
  );
  await click('取消', 'document.querySelector(".wb-new-block")');
  await check('取消空段落后不留下块', '!document.querySelector(".wb-new-block")');
  await e('document.querySelector(".wb-tags .nps-tag").click()');
  await wait('!!document.querySelector("[aria-label=Tag]")');
  await check(
    'Tag 编辑使用两列并提供取消与权重步进器',
    `(()=>{const p=document.querySelector('.wb-tag-editor');return [...p.querySelectorAll('label')].every(l=>getComputedStyle(l).gridTemplateColumns.split(' ').length===2) && !!p.querySelector('[aria-label="减小权重"]') && !!p.querySelector('[aria-label="增加权重"]') && [...p.querySelectorAll('button')].some(b=>b.textContent==='取消')})()`,
  );
  await shot('edit');
  await input('[aria-label="Tag"]', 'silver hair');
  await input('[aria-label="译文"]', '银色头发');
  await input('[aria-label="权重"]', '1.4');
  await key('Enter', {}, 'document.activeElement');
  await click('完成', 'document.querySelector(".wb-tag-editor")');
  await check(
    '改 Tag 与权重只改变目标叶片，保留其余段落和空行',
    `${raw}===${JSON.stringify(workbenchRaw.replace('1.25::blue hair::', '1.4::silver hair::'))}`,
  );
  await shot('unsaved');
  await reset();
  await click('块操作', 'document.querySelector(".wb-block")');
  await shot('block');
  await click('转为段落');
  await check(
    '块类型转换保留原文逐字节不变',
    `${raw}===${JSON.stringify(workbenchRaw)} && document.querySelector('.wb-block header').textContent.includes('段落')`,
  );
  await h.reload();
  await wait('!!document.querySelector(".wb-block")');
  await check(
    '重新加载从持久化草稿恢复手动块类型',
    `document.querySelector('.wb-block header').textContent.includes('段落')`,
  );
  await menu('块操作', '转为 Tag 块', 'document.querySelector(".wb-block")');
  await key('ArrowRight', { altKey: true }, 'document.querySelector(".wb-tags .nps-tag")');
  await wait(`(${draft})?.tags[0].tag==='red coat'`);
  await check(
    'Alt 加方向键移动 Tag 并保留其他块原文',
    `${raw}.endsWith(${JSON.stringify(workbenchRaw.slice(workbenchRaw.indexOf('\n\n')))}) && (${draft}).tags[1].weight===1.25`,
  );
  for (const [direction, index, expected] of [
    ['ArrowLeft', 1, 'blue hair'],
    ['ArrowDown', 0, 'red coat'],
    ['ArrowUp', 1, 'blue hair'],
  ]) {
    await key(
      direction,
      { altKey: true },
      `document.querySelectorAll('.wb-tags .nps-tag')[${index}]`,
    );
    await wait(`(${draft})?.tags[0].tag===${JSON.stringify(expected)}`);
    await check(
      `关于页列出的 Alt+${direction} 能移动 Tag`,
      `(${draft})?.tags[0].tag===${JSON.stringify(expected)}`,
      undefined,
      'once',
    );
  }
  await reset();
  await drag(
    'document.querySelector(".wb-tags .nps-tag")',
    'document.querySelectorAll(".wb-add-tags")[1]',
  );
  await wait(`(${draft})?.tags[0].tag==='red coat'`);
  await check(
    '跨块拖动 Tag 保留权重与其他段落',
    `${raw}.includes('glass window, soft light, 1.25::blue hair') && ${raw}.includes(${JSON.stringify(workbenchRaw.split('\n\n')[1])})`,
  );
  await reset();
  await e(
    'document.querySelectorAll(".wb-tags .nps-tag")[0].dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:true}))',
  );
  await e(
    'document.querySelectorAll(".wb-tags .nps-tag")[1].dispatchEvent(new MouseEvent("click",{bubbles:true,shiftKey:true}))',
  );
  await check(
    'Ctrl 单击与 Shift 单击显示多选操作条',
    'document.querySelector(".nps-selection")?.textContent.includes("已选 2 个 Tag")',
  );
  await shot('select');
  await check(
    '多选浮条位于复制栏上方',
    `(()=>{const a=document.querySelector('.nps-selection').getBoundingClientRect(),b=document.querySelector('.wb-copy-bar').getBoundingClientRect();return a.bottom<=b.top})()`,
  );
  await key('Home', {}, 'document.querySelector(".wb-body .nps-resizer")');
  await check(
    '最窄提示词栏的多选按钮不换行且不溢出',
    `(()=>{const n=document.querySelector('.nps-selection'),r=n.getBoundingClientRect();return [...n.children].every(x=>{const b=x.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom+1&&b.right<=r.right+1})})()`,
  );
  await e(
    'document.querySelector(".wb-body .nps-resizer").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))',
  );
  await click('复制', 'document.querySelector(".nps-selection")');
  await checkCopy(
    '多选复制保留 Tag 权重',
    () =>
      /1\.25::blue hair\s*::/.test(clipboard.readText()) &&
      clipboard.readText().includes('red coat'),
    undefined,
    'once',
  );
  await click('取消', 'document.querySelector(".nps-selection")');
  await e(
    'document.querySelector(".wb-tags .nps-tag").dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:true}))',
  );
  await e(
    'document.querySelector(".wb-section:last-of-type .nps-tag").dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:true}))',
  );
  await click('复制', 'document.querySelector(".nps-selection")');
  await checkCopy(
    '正负混选只复制正面',
    () => clipboard.readText().includes('blue hair') && !clipboard.readText().includes('lowres'),
  );
  await click('其他复制方式');
  await click('复制其中的负面 Tag');
  await checkCopy('混选菜单单独复制其中的负面 Tag', () => clipboard.readText() === 'lowres');
  await click('取消', 'document.querySelector(".nps-selection")');
  const marquee = await e(
    `(()=>{const r=document.querySelector('.wb-tags').getBoundingClientRect();const t=[...document.querySelectorAll('.wb-tags .nps-tag')].slice(0,3).map(n=>n.getBoundingClientRect());return {x:r.left-2,y:t[0].top-3,endX:t[2].right+2,endY:t[0].bottom+2}})()`,
  );
  await pointer('mousePressed', marquee.x, marquee.y);
  await pointer('mouseMoved', marquee.endX, marquee.endY);
  await pointer('mouseReleased', marquee.endX, marquee.endY);
  await check(
    '从空白处拖动框选多个 Tag',
    'document.querySelector(".nps-selection")?.textContent.includes("已选 3 个 Tag")',
  );
  await click('删除', 'document.querySelector(".nps-selection")');
  await check(
    '多选删除只删除选中 Tag',
    `${raw}.includes(${JSON.stringify(workbenchRaw.split('\n\n')[1])}) && !${raw}.includes('blue hair')`,
  );
  await reset();
  await check(
    '添加 Tag 默认是虚线按钮',
    'getComputedStyle(document.querySelector(".wb-add-trigger")).borderTopStyle==="dashed" && !document.querySelector(".wb-add-tags input")',
  );
  await click('输入中文或英文', 'document.querySelector(".wb-add-tags")');
  const initialInputWidth = await e(
    'document.querySelector(".wb-add-tags input").getBoundingClientRect().width',
  );
  await input('.wb-add-tags input', 'synthetic long descriptive tag with many characters');
  await check(
    'Tag 输入框随输入内容变宽',
    `document.querySelector('.wb-add-tags input').getBoundingClientRect().width>${initialInputWidth}`,
  );
  await input('.wb-add-tags input', '蓝发');
  await wait('document.querySelector(".nps-suggestions")?.textContent.includes("blue hair")');
  await shot('add');
  await check(
    '中文输入从内置词典找到英文候选',
    'document.querySelector(".nps-suggestions")?.textContent.includes("blue hair")',
  );
  await key('Enter', { isComposing: true }, 'document.activeElement');
  await check(
    '输入法组字回车不采用候选',
    `${raw}===${JSON.stringify(workbenchRaw)}`,
    undefined,
    'once',
  );
  await key('Escape', {}, 'document.activeElement');
  await input('.wb-add-tags input', 'synthetic_tag_one, synthetic_tag_two');
  await wait('document.querySelector(".nps-suggestions")?.textContent.includes("会添加 2 个")');
  await key('Enter', {}, 'document.activeElement');
  await wait(`${raw}?.includes('synthetic_tag_two')`);
  await check(
    '逗号分隔一次添加两个 Tag',
    `${raw}?.includes('synthetic_tag_one, synthetic_tag_two')`,
  );
  await reset();
  await menu('更多', '切换为文本编辑');
  await shot('raw');
  await input('.wb-text-section textarea', workbenchRaw + '\n\nsynthetic final block');
  await click('按块编辑（Ctrl E 切换）');
  await check('原始文本保存重新分块', 'document.querySelectorAll(".wb-block").length===5');
  await reset();
  await e('document.querySelector("[aria-label=编辑段落]").click()');
  await wait('!!document.querySelector("[aria-label=英文段落]")');
  await check(
    '未配置服务时两个 AI 按钮不可用',
    '[...document.querySelectorAll(".wb-paragraph-editor button")].filter(b=>b.textContent.includes("译成中文")||b.textContent.includes("按中文改写英文")).every(b=>b.disabled||b.getAttribute("aria-disabled")==="true")',
  );
  await input('[aria-label="中文段落"]', '合成验收译文');
  await shot('prose');
  await click('完成', 'document.querySelector(".wb-paragraph-editor")');
  await check(
    '段落译文保存在原有提示词结构中',
    `Object.values((${draft}).prompt_structure.block_annotations).flat().some(b=>b.translation==='合成验收译文')`,
  );
  const prior = preferences.credentials();
  preferences.saveAISettings({ baseUrl: mode.baseUrl, model: 'acceptance-model' });
  await click('块操作', 'document.querySelector("[aria-label=编辑段落]").closest(".wb-block")');
  await check(
    '段落块菜单使用译成中文动作',
    `!!document.querySelector('.nps-layer [role=menu] [aria-label="译成中文"]') && !document.querySelector('.nps-layer [role=menu] [aria-label="翻译并分类"]')`,
  );
  await shot('copy-paragraph-menu');
  await click('译成中文', 'document.querySelector(".nps-layer [role=menu]")');
  await wait('document.querySelector("[aria-label=中文段落]")?.value==="OK"');
  await check(
    '段落菜单调用段落翻译并在同一编辑器保留英文、展示译文',
    `document.querySelector('[aria-label=中文段落]').value==='OK' && document.querySelector('[aria-label=英文段落]').value!=='OK'`,
    undefined,
    'once',
  );
  await click('完成', 'document.querySelector(".wb-paragraph-editor")');
  await e('document.querySelector("[aria-label=编辑段落]").click()');
  await wait(
    '[...document.querySelectorAll(".wb-paragraph-editor button")].some(b=>b.textContent.includes("译成中文")&&!b.disabled)',
  );
  await click('译成中文');
  await wait('document.querySelector("[aria-label=中文段落]").value==="OK"');
  await check(
    '段落翻译使用验收假服务并更新中文',
    'document.querySelector("[aria-label=中文段落]").value==="OK"',
    undefined,
    'once',
  );
  await click('按中文改写英文');
  await wait('document.querySelector("[aria-label=英文段落]").value==="OK"');
  await check(
    '按中文改写英文使用同一 AI 配置',
    'document.querySelector("[aria-label=英文段落]").value==="OK"',
    undefined,
    'once',
  );
  await fetch(mode.baseUrl.replace('/v1', '/control/fail'));
  await input('[aria-label="英文段落"]', 'Synthetic draft survives failure.');
  await click('译成中文');
  await wait('!!document.querySelector(".wb-paragraph-editor .nps-banner")');
  await check(
    'AI 失败保留已输入文本',
    'document.querySelector("[aria-label=英文段落]").value==="Synthetic draft survives failure."',
    undefined,
    'once',
  );
  await fetch(mode.baseUrl.replace('/v1', '/control/timeout'));
  await click('译成中文');
  await wait('!!document.querySelector(".wb-paragraph-editor [aria-busy=true]")');
  await click('取消', 'document.querySelector(".wb-paragraph-editor")');
  await check(
    '取消 AI 请求保留编辑中的文本',
    '!!document.querySelector("[aria-label=英文段落]") && !document.querySelector(".wb-paragraph-editor [aria-busy=true]")',
    undefined,
    'once',
  );
  await fetch(mode.baseUrl.replace('/v1', '/control/success'));
  await click('取消', 'document.querySelector(".wb-paragraph-editor")');
  preferences.saveAISettings({ ...prior, clearApiKey: !prior.apiKey });
  await click('添加角色');
  await wait('document.querySelectorAll(".wb-section").length===4');
  await check(
    '有角色时基础节标题为基础提示词，另一节使用负面提示词',
    `[...document.querySelectorAll('.wb-section-head > button')].some(n=>n.textContent.trim()==='基础提示词') && [...document.querySelectorAll('.wb-section-head > button')].some(n=>n.textContent.trim()==='负面提示词')`,
  );
  await shot('chars');
  await e(
    'document.querySelector(".wb-tags .nps-tag").dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:true}))',
  );
  await click('移动到');
  await check(
    '移动到只提供同种正负的节',
    '[...document.querySelectorAll(".nps-layer [role=menuitem]")].every(n=>!n.textContent.includes("排除"))',
  );
  await click('角色 1', 'document.querySelector(".nps-layer [role=menu]")');
  await check(
    '多选移动到空角色节保留原 Tag 权重',
    `(${draft}).prompt_structure.characters[0].prompt_tags.some(t=>t.tag==='blue hair'&&t.weight===1.25)`,
  );
  await menu('角色操作', '重命名', 'document.querySelectorAll(".wb-section")[2]');
  await input('[aria-label="角色名称"]', '合成角色');
  await key('Enter', {}, 'document.activeElement');
  await check(
    '角色重命名同步正面和排除节',
    'document.body.innerText.includes("合成角色 的负面提示词")',
  );
  await menu('角色操作', '删除角色', 'document.querySelectorAll(".wb-section")[2]');
  await check('删除角色直接移除其两节', 'document.querySelectorAll(".wb-section").length===2');
  await click('撤销', 'document.querySelector(".nps-notifications")');
  await check(
    '删除角色的撤销恢复原位置和内容',
    `${draft}.prompt_structure.characters[0].label==='合成角色'&&document.querySelectorAll('.wb-section').length===4`,
  );

  await reset();
  await textEditingChecks({ h, raw, draft, reset, modifier });
  await key('Home', {}, 'document.querySelector(".wb-body .nps-resizer")');
  await check(
    '提示词栏最窄宽度为440',
    `Math.abs(document.querySelector('.wb-prompt').getBoundingClientRect().width-440)<2`,
  );
  await check(
    '提示词栏最窄时头部控件保持单行',
    `(()=>{const p=document.querySelector('.wb-prompt-head'),r=p.getBoundingClientRect();return [...p.children].every(x=>{const b=x.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom&&b.right<=r.right+1})})()`,
  );
  await e(
    'document.querySelector(".wb-body .nps-resizer").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))',
  );
  await check(
    '双击分隔线恢复520宽度',
    `Math.abs(document.querySelector('.wb-prompt').getBoundingClientRect().width-520)<2`,
  );
  await click('存入图片库');
  await wait('document.querySelector(".wb-image-actions").textContent.includes("已存入图片库")');
  await check(
    '存入图片库创建真实数据库记录',
    () => database.loadLibrary('all').some((p) => p.metadata.prompt_raw === workbenchRaw),
    undefined,
    'once',
  );
  doubles.selections.push({ canceled: false, filePaths: [files[1]] });
  await click('打开图片', 'document.querySelector(".studio-titlebar")');
  await wait('document.querySelectorAll(".wb-tab").length===2');
  clipboard.writeImage(nativeImage.createFromPath(files[2]));
  await key('v', modifier);
  await wait('document.querySelectorAll(".wb-tab").length===3');
  await check(
    '从剪贴板打开生成独立标签页',
    'document.querySelectorAll(".wb-tab").length===3',
    undefined,
    'once',
  );
  await shot('tabs');
  await e(
    `(()=>{const list=document.querySelector('.wb-tabs-scroll');list.style.maxWidth='120px';list.scrollLeft=0})()`,
  );
  await wait(
    'document.querySelector(".wb-tabs-scroll").scrollWidth>document.querySelector(".wb-tabs-scroll").clientWidth',
  );
  await e(
    `document.querySelector('.wb-tabs').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100}))`,
  );
  await check(
    '标签栏纵向滚轮转换为横向滚动',
    'document.querySelector(".wb-tabs-scroll").scrollLeft>0',
    undefined,
    'once',
  );
  await e(
    `document.querySelector('.wb-tabs-scroll').style.maxWidth='';document.querySelector('.wb-tab').focus()`,
  );
  await key('ArrowRight');
  await wait('document.querySelectorAll(".wb-tab")[1].getAttribute("aria-selected")==="true"');
  await check(
    '标签栏方向键切换并移动焦点',
    'document.activeElement===document.querySelectorAll(".wb-tab")[1] && document.activeElement.getAttribute("aria-selected")==="true"',
    undefined,
    'once',
  );
  const order = await e(`(${session}).tabs.map(t=>t.id)`);
  await e('document.querySelector(".wb-tab").focus()');
  await key(' ', { code: 'Space' });
  await key('ArrowRight', { code: 'ArrowRight' });
  await key(' ', { code: 'Space' });
  await wait(`(${session}).tabs[1].id===${JSON.stringify(order[0])}`);
  await wait('!document.querySelector(".wb-drag-feedback")');
  await check(
    '标签页键盘空格拿起、方向键移动、空格放下',
    `(${session}).tabs[1].id===${JSON.stringify(order[0])}`,
    undefined,
    'once',
  );
  await e('document.querySelector(".wb-tab").focus()');
  await key(' ', { code: 'Space' });
  await key('ArrowRight', { code: 'ArrowRight' });
  await key('Escape', { code: 'Escape' });
  await wait('!document.querySelector(".wb-drag-feedback")');
  await check(
    '标签页键盘 Esc 取消排序',
    `(${session}).tabs[1].id===${JSON.stringify(order[0])}`,
    undefined,
    'once',
  );
  await drag('document.querySelectorAll(".wb-tab")[1]', 'document.querySelectorAll(".wb-tab")[0]');
  await check(
    '标签页支持指针拖动换位',
    `(${session}).tabs[0].id===${JSON.stringify(order[0])}`,
    undefined,
    'once',
  );
  for (const type of ['dragEnter', 'dragOver', 'drop'])
    await h.window.webContents.debugger.sendCommand('Input.dispatchDragEvent', {
      type,
      x: 300,
      y: 250,
      data: { items: [], files: [files[2]], dragOperationsMask: 1 },
    });
  await wait('document.querySelectorAll(".wb-tab").length===4');
  await check(
    '拖入窗口通过真实文件路径打开图片',
    'document.querySelectorAll(".wb-tab").length===4',
    undefined,
    'once',
  );
  await check(
    '横图与方图缩略图遵守比例和最大宽度',
    `(()=>{const imgs=[...document.querySelectorAll('.wb-tab img')];return imgs.every(i=>{const s=getComputedStyle(i);return i.width>=parseFloat(s.getPropertyValue('--tab-thumb-min-w'))-1&&i.width<=parseFloat(s.getPropertyValue('--tab-thumb-max-w'))+1})})()`,
  );
  await e(
    'document.querySelectorAll(".wb-tab")[2].dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:280,clientY:25}))',
  );
  await click('关闭右侧标签页');
  await wait('document.querySelectorAll(".wb-tab").length===3');
  await check(
    '标签页右键关闭右侧标签页',
    'document.querySelectorAll(".wb-tab").length===3',
    undefined,
    'once',
  );
  await e('document.querySelectorAll(".wb-tab")[1].click()');
  await wait(
    `(${session}).activeTabId===document.querySelectorAll('.wb-tab')[1].dataset.workbenchTabId`,
    '标签页内容与持久化选择已切换',
  );
  await fs.rename(files[1], files[1] + '.moved');
  await h.reload();
  await wait('document.body.innerText.includes("这张图片已被移动或删除")');
  await shot('missing');
  await check(
    '文件缺失时提示词仍然可编辑和复制',
    '!!document.querySelector(".wb-block") && document.body.innerText.includes("这张图片已被移动或删除")',
  );
  await menu('更多', '切换为文本编辑');
  await input('.wb-text-section textarea', 'missing file editable');
  await click('按块编辑（Ctrl E 切换）');
  await click('复制提示词');
  await checkCopy(
    '缺失图片草稿仍可编辑并复制',
    () => clipboard.readText() === 'missing file editable',
    undefined,
    'once',
  );
  // Close only the disposable test tabs via the normal close command.
  await e(
    'document.querySelector(".wb-tab[aria-selected=true]").dispatchEvent(new MouseEvent("auxclick",{button:1,bubbles:true,cancelable:true}))',
  );
  await wait('!!document.querySelector("dialog[open]")');
  await check(
    '中键关闭修改过的标签页先确认且未丢失草稿',
    'document.querySelectorAll(".wb-tab").length===3 && document.querySelector("dialog[open]").textContent.includes("丢弃并关闭")',
    undefined,
    'once',
  );
  await click('取消', 'document.querySelector("dialog[open]")');
  for (let i = 0; i < 3; i++) {
    const count = await e('document.querySelectorAll(".wb-tab").length');
    await key('w', modifier);
    await wait(
      `!!document.querySelector('dialog[open]') || document.querySelectorAll('.wb-tab').length < ${count}`,
    );
    if (await e('!!document.querySelector("dialog[open]")'))
      await click('丢弃并关闭', 'document.querySelector("dialog[open]")');
    await wait(`document.querySelectorAll('.wb-tab').length < ${count}`);
  }
  await wait('!!document.querySelector(".wb-empty")');
  for (const project of database.loadLibrary('all')) {
    if (project.metadata.prompt_raw === workbenchRaw) database.deleteProject(project.id);
  }
  await automaticAndVibeChecks({ h, mode, doubles });
  h.window.setContentSize(...previousSize);
}
