import { imageMenuCopy190 } from './release190.js';
import { notificationClearance } from './interactionCorrections.js';
import { pick186Checks } from './pick186.js';
import { randomBlockUI } from './release186.js';
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
  await randomBlockUI({ h });
  const files = await createWorkbenchFixtures(path.join(mode.root, 'workbench-fixtures'));
  const previousSize = h.window.getContentSize();
  h.window.setContentSize(1240, 760);
  const modifier = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  const session = sessionExpression;
  const draft = draftExpression;
  const raw = `(${draft})?.prompt_structure.base_prompt_raw`;
  const base = 'document.querySelector(".doc[data-wb-scope=\"base:prompt\"]")';
  // All actions go through DOM or Electron/CDP. The persisted session is observed, never set.
  const scope = 'document.querySelector(".doc")';
  const menu = async (label, action, where = scope) => {
    await click(label, where);
    await click(action, 'document.querySelector(".menu:not(.leaving)")');
  };
  const rawEdit = async (text) => {
    await click(
      '按文本编辑（Ctrl E 切换）',
      'document.querySelector("[role=radiogroup][aria-label=编辑方式]")',
    );
    await input('.tx-wrap textarea', text);
    await click(
      '按块编辑（Ctrl E 切换）',
      'document.querySelector("[role=radiogroup][aria-label=编辑方式]")',
    );
    await wait(`${raw}===${JSON.stringify(text)}`);
  };
  const reopenFixture = async () => {
    await h.reload();
    await wait('!!document.querySelector(".tabs [data-tab]")');
    await key('w', modifier);
    await wait(
      '!!document.querySelector("[role=dialog]:not(.leaving *)") || !document.querySelector(".tabs [data-tab]")',
    );
    if (await e('!!document.querySelector("[role=dialog]:not(.leaving *)")'))
      await click('丢弃并关闭', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await wait('!document.querySelector(".tabs [data-tab]")');
    doubles.selections.push({ canceled: false, filePaths: [files[0]] });
    await click('打开图片', 'document.querySelector(".tb")');
    await wait('!!document.querySelector(".blk[data-block]")');
  };
  const reset = async () => {
    const hadCharacter = await e('!!document.querySelector(".char-sec")');
    if (await e('!!document.querySelector(".dirty-tag:not(.leaving)")')) {
      await click('恢复', 'document.querySelector(".cap-title")');
      if (hadCharacter) {
        await wait('!document.querySelector(".tb") || !document.querySelector(".char-sec")');
        const alive = await e('!!document.querySelector(".tb")');
        await check('含角色的草稿恢复后渲染器仍可用', () => alive, undefined, 'once');
        if (!alive) {
          await reopenFixture();
          return;
        }
      }
      await wait(`${raw}===${JSON.stringify(workbenchRaw)}`);
    }
    await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await wait('!document.querySelector("[data-list-exit]")');
    // Reload establishes a remembered block type as the original view. Normalize
    // the fixture through its public menu before subsequent Tag interactions.
    if (
      await e(
        'document.querySelector(".blk[data-block] .blk-h > .label")?.textContent.startsWith("段落")',
      )
    )
      await menu('这一块的操作', '转为 Tag 块', 'document.querySelector(".blk[data-block]")');
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
        `(()=>{const n=${selector};n.scrollIntoView({block:'nearest',inline:'nearest'});const r=(n.matches('.tabs [data-tab]')?n.querySelector('img'):n).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
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
    await wait('!document.querySelector(".drag-float")');
    await wait(
      `(()=>{let received=false;const listener=()=>{received=true};window.addEventListener('click',listener);document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));window.removeEventListener('click',listener);return received})()`,
    );
  };
  await click('工作台', 'document.querySelector(".tb")');
  await check(
    '空工作台提供图片和剪贴板两个打开入口',
    '!!document.querySelector(".pages .empty") && document.body.innerText.includes("将 NovelAI 图片拖到此处")',
  );
  await shot('empty');
  doubles.selections.push({ canceled: false, filePaths: [files[0]] });
  await click('打开图片', 'document.querySelector(".tb")');
  await wait('document.querySelectorAll(".blk[data-block]").length===4');
  await e(
    `(()=>{const tab=document.querySelector('.tabs [data-tab]');window.__middlePrevented=!tab.dispatchEvent(new MouseEvent('mousedown',{button:1,bubbles:true,cancelable:true}));tab.dispatchEvent(new MouseEvent('auxclick',{button:1,bubbles:true,cancelable:true}))})()`,
  );
  await wait('document.querySelectorAll(".tabs [data-tab]").length===0');
  await check(
    '中键直接关闭干净标签页并阻止自动滚动默认动作',
    'window.__middlePrevented && !document.querySelector("[role=dialog]:not(.leaving *)") && !document.querySelector(".tabs [data-tab]")',
    undefined,
    'once',
  );
  doubles.selections.push({ canceled: false, filePaths: [files[0]] });
  await click('打开图片', 'document.querySelector(".tb")');
  await wait('document.querySelectorAll(".blk[data-block]").length===4');
  await e(
    `document.querySelector('.tabs [data-tab]').dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }))`,
  );
  await wait('document.querySelectorAll(".tabs [data-tab]").length===0');
  await check(
    '标签页直接关闭入口沿用关闭命令',
    '!document.querySelector(".tabs [data-tab]")',
    undefined,
    'once',
  );
  doubles.selections.push({ canceled: false, filePaths: [files[0]] });
  await click('打开图片', 'document.querySelector(".tb")');
  await wait('document.querySelectorAll(".blk[data-block]").length===4');
  await check(
    '无角色时节标题为提示词，顶部包含编辑方式、搜索、显示、翻译与复制',
    `document.querySelector('.sec-h').textContent.includes('提示词') && ['编辑方式','搜索 Tag 或译文','显示','翻译','其他复制方式'].every(label=>document.querySelector('.prompt-in [aria-label="'+label+'"]'))`,
  );
  await shot('copy-header');
  await click('这一块的操作', 'document.querySelector(".blk[data-block]")');
  await check(
    'Tag 块菜单包含常用块保存与原有编辑动作',
    `(()=>{const m=document.querySelector('.menu:not(.leaving)');return ['转为段落','翻译并分类','复制','存为常用块…','上移','下移','删除'].every(label=>[...m.querySelectorAll('[role=menuitem]')].some(n=>n.textContent.trim().startsWith(label)))})()`,
  );
  await shot('copy-tag-menu');
  await key('Escape');
  await check(
    '文件打开恢复三个正面块与一个排除块',
    `${raw}===${JSON.stringify(workbenchRaw)} && document.querySelectorAll('.blk[data-block]').length===4`,
  );

  await shot('home');

  await click('其他复制方式');
  await check(
    '工作台复制菜单可交互且提供正面、排除和逐节复制',
    `[...document.querySelectorAll('[role=menuitem]')].some(x=>x.textContent.trim().startsWith('复制负面提示词'))`,
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
  await click('复制负面提示词');
  await checkCopy(
    '排除菜单复制原始排除文本',
    () => clipboard.readText() === workbenchNegative,
    undefined,
    'once',
  );
  await click('复制', 'document.querySelector(".sec-h")');
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
  await click('复制负面 · 2');
  await checkCopy(
    '仅看负面提示词时主按钮复制负面 Tag',
    () => clipboard.readText() === workbenchNegative,
    undefined,
    'once',
  );
  await shot('negsel');
  await input('.col.prompt input[aria-label="搜索 Tag 或译文"]', '');
  await click('显示');
  await h.select('只看', '全部');
  await key('Escape');
  await key('k', modifier);
  await check(
    'Mod K 聚焦工作台搜索',
    'document.activeElement.getAttribute("aria-label")==="搜索 Tag 或译文"',
    undefined,
    'once',
  );
  await input('.col.prompt [aria-label="搜索 Tag 或译文"]', 'blue');
  await check(
    '搜索后的复制仅包含匹配 Tag',
    `document.querySelector('[data-act=copy]').textContent.includes('复制可见的') && [...document.querySelectorAll('[data-tag-key]:not(.dim)')].every(n=>n.textContent.toLowerCase().includes('blue'))`,
  );
  await shot('filter');
  await input('.col.prompt input[aria-label="搜索 Tag 或译文"]', '');
  await click('显示');
  await h.select('只看', '全部');
  await key('Escape');
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
  await wait('!!document.querySelector(".blk:not([data-block]) .tags")');
  await check(
    '按分类排列保留段落',
    '!!document.querySelector(".prose") && !!document.querySelector(".blk:not([data-block]) .tags")',
  );
  await click('显示');
  await h.select('排列', '按块');
  await h.select('只看', '正面');
  await key('Escape');
  await check(
    '只看正面隐藏排除节',
    `[...document.querySelectorAll('.blk[data-wb-scope]')].every(n=>n.dataset.wbScope.endsWith(':prompt'))`,
  );
  await input('.col.prompt input[aria-label="搜索 Tag 或译文"]', '');
  await click('显示');
  await h.select('只看', '全部');
  await key('Escape');
  await menu('这一块的操作', '复制', 'document.querySelector(".blk[data-block]")');
  await checkCopy(
    '块菜单复制原文保留权重语法',
    () => clipboard.readText() === workbenchRaw.split('\n\n')[0],
  );
  await menu('这一块的操作', '下移', 'document.querySelector(".blk[data-block]")');
  await check(
    '块菜单下移保持每块原文',
    `${raw}===${JSON.stringify([workbenchRaw.split('\n\n')[1], workbenchRaw.split('\n\n')[0], workbenchRaw.split('\n\n')[2]].join('\n\n'))}`,
  );
  await menu('这一块的操作', '上移', 'document.querySelectorAll(".blk[data-block]")[1]');
  await check('块菜单上移恢复逐字原文', `${raw}===${JSON.stringify(workbenchRaw)}`);
  await menu('这一块的操作', '删除', 'document.querySelectorAll(".blk[data-block]")[2]');
  await check(
    '块菜单只删除目标块',
    `${raw}.includes(${JSON.stringify(workbenchRaw.split('\n\n')[1])}) && !${raw}.includes('glass window')`,
  );
  await reset();
  await click('段落', 'document.querySelector(".blk-gap")');
  await check(
    '块间新增段落直接进入空段落编辑',
    '!!document.querySelector(".blk[data-enter=fade]:not([data-block]) [aria-label=英文段落]")',
  );
  await click('取消', 'document.querySelector(".blk[data-enter=fade]:not([data-block])")');
  await check(
    '取消空段落后不留下块',
    '!document.querySelector(".blk[data-enter=fade]:not([data-block])")',
  );
  await e('document.querySelector(".tags .tag[data-tag-key]").click()');
  await wait('!!document.querySelector("[aria-label=Tag]")');

  await shot('edit');
  await input('[aria-label="Tag"]', 'silver hair');
  await input('[aria-label="译文"]', '银色头发');
  for (let step = 0; step < 3; step++)
    await click('增加权重', 'document.querySelector(".tag-pop")');
  await key('Enter', {}, 'document.querySelector(".tag-pop input")');
  await check(
    '改 Tag 与权重只改变目标叶片，保留其余段落和空行',
    `${raw}===${JSON.stringify(workbenchRaw.replace('1.25::blue hair::', '1.55::silver hair::'))}`,
  );
  await shot('unsaved');
  await reset();
  await click('这一块的操作', 'document.querySelector(".blk[data-block]")');
  await shot('block');
  await click('转为段落');
  await check(
    '块类型转换保留原文逐字节不变',
    `${raw}===${JSON.stringify(workbenchRaw)} && document.querySelector('.blk[data-block] .blk-h').textContent.includes('段落')`,
  );
  await h.reload();
  await wait('!!document.querySelector(".blk[data-block]")');
  await check(
    '重新加载从持久化草稿恢复手动块类型',
    `document.querySelector('.blk[data-block] .blk-h').textContent.includes('段落')`,
  );
  await menu('这一块的操作', '转为 Tag 块', 'document.querySelector(".blk[data-block]")');
  const blockButton = (index) =>
    `document.querySelector('.blk[data-block="0:${index}"] .blk-h [aria-label="这一块的操作"]')`;
  const swapped = [
    workbenchRaw.split('\n\n')[1],
    workbenchRaw.split('\n\n')[0],
    workbenchRaw.split('\n\n')[2],
  ].join('\n\n');
  await e(`${blockButton(0)}.focus()`);
  for (const [direction, index, expected, label] of [
    ['ArrowDown', 1, swapped, '097-5 块 Alt 下移交换原文并跟随焦点'],
    ['ArrowUp', 0, workbenchRaw, '097-6 块 Alt 上移恢复原文与焦点'],
    ['ArrowUp', 0, workbenchRaw, '097-7 首块 Alt 上移保持原文'],
  ]) {
    await key(direction, { altKey: true });
    const state = `${raw}===${JSON.stringify(expected)} && document.activeElement===${blockButton(index)}`;
    await wait(state);
    await check(label, state, undefined, 'once');
  }
  for (const [direction, index] of [
    ['ArrowRight', 0],
    ['ArrowLeft', 1],
    ['ArrowDown', 0],
    ['ArrowUp', 1],
  ]) {
    await reset();
    await key(
      direction,
      { altKey: true },
      `document.querySelectorAll('.tags .tag[data-tag-key]')[${index}]`,
    );
    await check(
      `关于页列出的 Alt+${direction} 能移动 Tag 并保留其他块`,
      `(${draft}).tags[0].tag==='red coat' && ${raw}.endsWith(${JSON.stringify(workbenchRaw.slice(workbenchRaw.indexOf('\n\n')))})`,
    );
  }
  await reset();
  await drag(
    'document.querySelector(".tags .tag[data-tag-key]")',
    'document.querySelectorAll(".tag[data-add]")[1]',
  );
  await wait(`(${draft})?.tags[0].tag==='red coat'`);
  await check(
    '跨块拖动 Tag 保留权重与其他段落',
    `${raw}.includes('glass window, soft light, 1.25::blue hair') && ${raw}.includes(${JSON.stringify(workbenchRaw.split('\n\n')[1])})`,
  );
  await reset();
  await e(
    'document.querySelectorAll(".tags .tag[data-tag-key]")[0].dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:true}))',
  );
  await e(
    'document.querySelectorAll(".tags .tag[data-tag-key]")[1].dispatchEvent(new MouseEvent("click",{bubbles:true,shiftKey:true}))',
  );
  await check(
    'Ctrl 单击与 Shift 单击显示多选操作条',
    'document.querySelector(".col.prompt .selbar")?.textContent.includes("已选 2 个 Tag")',
  );
  await shot('select');

  await click('复制', 'document.querySelector(".col.prompt .selbar")');
  await checkCopy(
    '多选复制保留 Tag 权重',
    () =>
      /1\.25::blue hair\s*::/.test(clipboard.readText()) &&
      clipboard.readText().includes('red coat'),
    undefined,
    'once',
  );
  await click('取消', 'document.querySelector(".col.prompt .selbar")');
  await e(
    'document.querySelector(".tags .tag[data-tag-key]").dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:true}))',
  );
  await e(
    'document.querySelector(".blk[data-wb-scope$=undesired] .tag[data-tag-key]").dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:true}))',
  );
  await click('复制', 'document.querySelector(".col.prompt .selbar")');
  await checkCopy(
    '正负混选只复制正面',
    () => clipboard.readText().includes('blue hair') && !clipboard.readText().includes('lowres'),
  );
  await click('其他复制方式');
  await click('复制其中的负面 · 1');
  await checkCopy('混选菜单单独复制其中的负面 Tag', () => clipboard.readText() === 'lowres');
  await click('取消', 'document.querySelector(".col.prompt .selbar")');
  const marquee = await e(
    `(()=>{const r=document.querySelector('.tags').getBoundingClientRect();const t=[...document.querySelectorAll('.tags .tag[data-tag-key]')].slice(0,3).map(n=>n.getBoundingClientRect());return {x:r.left-2,y:t[0].top-3,endX:t[2].right+2,endY:t[0].bottom+2}})()`,
  );
  await pointer('mousePressed', marquee.x, marquee.y);
  await pointer('mouseMoved', marquee.endX, marquee.endY);
  await pointer('mouseReleased', marquee.endX, marquee.endY);
  await check(
    '从空白处拖动框选多个 Tag',
    'document.querySelector(".col.prompt .selbar")?.textContent.includes("已选 3 个 Tag")',
  );
  await click('删除', 'document.querySelector(".col.prompt .selbar")');
  await check(
    '多选删除只删除选中 Tag',
    `${raw}.includes(${JSON.stringify(workbenchRaw.split('\n\n')[1])}) && !${raw}.includes('blue hair')`,
  );
  await reset();

  await e('document.querySelector(".tag.ghost[data-add]").click()');
  await input('.tag[data-add] input', '蓝发');
  await wait('document.querySelector(".complete")?.textContent.includes("blue hair")');
  await shot('add');
  await check(
    '中文输入从内置词典找到英文候选',
    'document.querySelector(".complete")?.textContent.includes("blue hair")',
  );
  await key('Enter', { isComposing: true }, 'document.activeElement');
  await check(
    '输入法组字回车不采用候选',
    `${raw}===${JSON.stringify(workbenchRaw)}`,
    undefined,
    'once',
  );
  await key('Escape', {}, 'document.activeElement');
  await e('document.querySelector(".tag.ghost[data-add]").click()');
  await input('.tag[data-add] input', 'synthetic_tag_one, synthetic_tag_two');
  await key('Enter', {}, 'document.activeElement');
  await wait(`${raw}?.includes('synthetic_tag_two')`);
  await check(
    '逗号分隔一次添加两个 Tag',
    `${raw}?.includes('synthetic_tag_one, synthetic_tag_two')`,
  );
  await reset();
  await click(
    '按文本编辑（Ctrl E 切换）',
    'document.querySelector("[role=radiogroup][aria-label=编辑方式]")',
  );
  await shot('raw');
  await input('.tx-wrap textarea', workbenchRaw + '\n\nsynthetic final block');
  await click(
    '按块编辑（Ctrl E 切换）',
    'document.querySelector("[role=radiogroup][aria-label=编辑方式]")',
  );
  await check('原始文本保存重新分块', 'document.querySelectorAll(".blk[data-block]").length===5');
  await reset();
  await e('document.querySelector("[aria-label=编辑段落]").click()');
  await wait('!!document.querySelector("[aria-label=英文段落]")');
  await check(
    '未配置服务时两个 AI 按钮不可用',
    '[...document.querySelectorAll(".editor button")].filter(b=>b.textContent.includes("翻译成中文")||b.textContent.includes("根据中文改写英文")).every(b=>b.disabled||b.classList.contains("is-off"))',
  );
  await input('[aria-label="中文段落"]', '合成验收译文');
  await shot('prose');
  await click('完成', 'document.querySelector(".editor")');
  await check(
    '段落译文保存在原有提示词结构中',
    `Object.values((${draft}).prompt_structure.block_annotations).flat().some(b=>b.translation==='合成验收译文')`,
  );
  const prior = preferences.credentials();
  preferences.saveAISettings({ baseUrl: mode.baseUrl, model: 'acceptance-model' });
  await click(
    '这一块的操作',
    'document.querySelector("[aria-label=编辑段落]").closest(".blk[data-block]")',
  );
  await check(
    '段落块菜单提供翻译动作',
    `document.querySelector('.menu:not(.leaving)')?.textContent.includes('翻译并分类')`,
  );
  await shot('copy-paragraph-menu');
  await click('翻译并分类', 'document.querySelector(".menu:not(.leaving)")');
  await wait('document.querySelector("[aria-label=中文段落]")?.value==="OK"');
  await check(
    '段落菜单调用段落翻译并在同一编辑器保留英文、展示译文',
    `document.querySelector('[aria-label=中文段落]').value==='OK' && document.querySelector('[aria-label=英文段落]').value!=='OK'`,
    undefined,
    'once',
  );
  await click('完成', 'document.querySelector(".editor")');
  await e('document.querySelector("[aria-label=编辑段落]").click()');
  await wait(
    '[...document.querySelectorAll(".editor button")].some(b=>b.textContent.includes("翻译成中文")&&!b.disabled)',
  );
  await click('翻译成中文');
  await wait('document.querySelector("[aria-label=中文段落]").value==="OK"');
  await check(
    '段落翻译使用验收假服务并更新中文',
    'document.querySelector("[aria-label=中文段落]").value==="OK"',
    undefined,
    'once',
  );
  await wait('!document.querySelector(".editor .loading")');
  await click('根据中文改写英文');
  await wait('document.querySelector("[aria-label=英文段落]").value==="OK"');
  await check(
    '根据中文改写英文使用同一 AI 配置',
    'document.querySelector("[aria-label=英文段落]").value==="OK"',
    undefined,
    'once',
  );
  await fetch(mode.baseUrl.replace('/v1', '/control/fail'));
  await input('[aria-label="英文段落"]', 'Synthetic draft survives failure.');
  await click('翻译成中文');
  await wait('!!document.querySelector(".editor .banner")');
  await check(
    'AI 失败保留已输入文本',
    'document.querySelector("[aria-label=英文段落]").value==="Synthetic draft survives failure."',
    undefined,
    'once',
  );
  await fetch(mode.baseUrl.replace('/v1', '/control/timeout'));
  await click('翻译成中文');
  await wait('!!document.querySelector(".editor .loading")');
  await click('取消', 'document.querySelector(".editor")');
  await check(
    '取消 AI 请求保留编辑中的文本',
    '!!document.querySelector("[aria-label=英文段落]") && !document.querySelector(".editor .loading")',
    undefined,
    'once',
  );
  await fetch(mode.baseUrl.replace('/v1', '/control/success'));
  if (await e('!!document.querySelector(".editor")'))
    await click('取消', 'document.querySelector(".editor")');
  preferences.saveAISettings({ ...prior, clearApiKey: !prior.apiKey });
  await click('添加角色');
  await wait('document.querySelectorAll(".char-sec:not(.leaving)").length===1');
  await check(
    '有角色时基础节标题为基础提示词，另一节使用负面提示词',
    `[...document.querySelectorAll('.sec-h')].some(n=>n.textContent.includes('基础提示词')) && [...document.querySelectorAll('.sec-h')].some(n=>n.textContent.includes('负面提示词'))`,
  );
  await shot('chars');
  await e(
    'document.querySelector(".tags .tag[data-tag-key]").dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:true}))',
  );
  await click('移动到');
  await check(
    '移动到只提供同种正负的节',
    '[...document.querySelectorAll(".menu:not(.leaving) [role=menuitem]")].every(n=>!n.textContent.includes("排除"))',
  );
  const emptyCharacterTarget = await e(
    '[...document.querySelectorAll(".menu:not(.leaving) [role=menuitem]")].find(n=>n.textContent.includes("角色"))?.textContent.trim()',
  );
  if (emptyCharacterTarget)
    await click(emptyCharacterTarget, 'document.querySelector(".menu:not(.leaving)")');
  else {
    await key('Escape');
    await key('Escape');
  }
  await check(
    '多选移动到空角色节保留原 Tag 权重',
    `(${draft}).prompt_structure.characters[0].prompt_tags.some(t=>t.tag==='blue hair'&&t.weight===1.25)`,
  );
  await menu('这个角色的操作', '重命名', 'document.querySelector(".char-h")');
  await input('[aria-label="角色名称"]', '合成角色');
  await key('Enter', {}, 'document.activeElement');
  await check(
    '角色重命名同步正面和排除节',
    'document.body.innerText.includes("合成角色 的负面提示词")',
  );
  await menu('这个角色的操作', '删除角色', 'document.querySelector(".char-h")');
  await check(
    '删除角色直接移除其两节',
    'document.querySelectorAll(".char-sec:not(.leaving)").length===0',
  );
  await wait(
    '!document.querySelector(".tb") || [...document.querySelectorAll(".toast:not(.leaving) button")].some(b=>b.textContent === "撤销")',
  );
  const survivedCharacterDelete = await e('!!document.querySelector(".tb")');
  await check('删除角色不使渲染器崩溃', () => survivedCharacterDelete, undefined, 'once');
  if (survivedCharacterDelete)
    await click('撤销', 'document.querySelector(".toast:not(.leaving)")');
  else await h.reload();
  await check(
    '删除角色的撤销恢复原位置和内容',
    `${survivedCharacterDelete} && ${draft}.prompt_structure.characters[0]?.label==='合成角色'&&document.querySelectorAll('.char-sec:not(.leaving)').length===1`,
  );

  await h.reload();
  await wait('!!document.querySelector(".tabs [data-tab]")');
  await key('w', modifier);
  await wait(
    '!!document.querySelector("[role=dialog]:not(.leaving *)") || !document.querySelector(".tabs [data-tab]")',
  );
  if (await e('!!document.querySelector("[role=dialog]:not(.leaving *)")'))
    await click('丢弃并关闭', 'document.querySelector("[role=dialog]:not(.leaving *)")');
  await wait('!document.querySelector(".tabs [data-tab]")');
  doubles.selections.push({ canceled: false, filePaths: [files[0]] });
  await click('打开图片', 'document.querySelector(".tb")');
  await wait('!!document.querySelector(".blk[data-block]")');
  await textEditingChecks({ h, raw, draft, reset, modifier });
  await reset();
  const stepsBeforeTyping = await e(`${draft}.params.steps`);
  await click(
    '按文本编辑（Ctrl E 切换）',
    'document.querySelector("[role=radiogroup][aria-label=编辑方式]")',
  );
  await e(`(() => {
    window.parameterErrors = [];
    window.parameterErrorObserver = new MutationObserver(() => {
      for (const node of document.querySelectorAll('.toast:has(.mark.danger)'))
        window.parameterErrors.push(node.textContent);
    });
    window.parameterErrorObserver.observe(document.body, {childList:true, subtree:true, characterData:true});
    const input = document.querySelector('.tx-wrap textarea');
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'synthetic immediate parameter edit');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector('[data-feature="tab-params"]').click();
  })()`);
  // Only wait for the parameter control to mount, never for the typing save.
  await click('增加步数');
  await wait(`${draft}.params.steps===${stepsBeforeTyping + 1}`);
  await check(
    '输入提示词后立即改步数成功且没有错误通知',
    `${draft}.params.steps===${stepsBeforeTyping + 1} && ${draft}.metadata.prompt_raw==='synthetic immediate parameter edit' && window.parameterErrors.length===0 && !document.querySelector('.toast .mark.danger')`,
  );
  await shot('typing-then-parameters');
  await e('window.parameterErrorObserver.disconnect()');
  await e('document.querySelector(\'[data-feature="tab-prompt"]\').click()');
  await click(
    '按块编辑（Ctrl E 切换）',
    'document.querySelector("[role=radiogroup][aria-label=编辑方式]")',
  );
  await reset();

  await click('存入图片库');
  await wait('document.querySelector(".stage-acts").textContent.includes("已存入图片库")');
  await check(
    '存入图片库创建真实数据库记录',
    () => database.loadLibrary('all').some((p) => p.metadata.prompt_raw === workbenchRaw),
    undefined,
    'once',
  );
  clipboard.clear();
  await click('复制图片', 'document.querySelector(".stage-acts")');
  const copiedImageMatches = () =>
    clipboard.readImage().toPNG().equals(nativeImage.createFromPath(files[0]).toPNG());
  await h.until(copiedImageMatches, '工作台图片复制完成');
  await check('工作台复制图片得到原图像素', copiedImageMatches);
  await imageMenuCopy190(
    h,
    '097-1 舞台右键前三项及复制图片尺寸正确',
    'document.querySelector("img[data-stage]")',
    nativeImage.createFromPath(files[0]).getSize(),
  );
  await notificationClearance(h, '工作台', '.stage-acts');
  doubles.selections.push({ canceled: false, filePaths: [files[1]] });
  await click('打开图片', 'document.querySelector(".tb")');
  await wait('document.querySelectorAll(".tabs [data-tab]").length===2');
  clipboard.writeImage(nativeImage.createFromPath(files[2]));
  await key('v', modifier);
  await wait('document.querySelectorAll(".tabs [data-tab]").length===3');
  await check(
    '从剪贴板打开生成独立标签页',
    'document.querySelectorAll(".tabs [data-tab]").length===3',
    undefined,
    'once',
  );
  await shot('tabs');
  await e(
    `(()=>{const list=document.querySelector('.tabs');list.style.maxWidth='60px';list.scrollLeft=0})()`,
  );
  await wait(
    'document.querySelector(".tabs").scrollWidth>document.querySelector(".tabs").clientWidth',
  );
  for (const [position, left, right, label] of [
    [0, false, true, '097-9 标签栏左端禁用向前翻且点击不滚动'],
    [1, true, false, '097-10 标签栏右端禁用向后翻'],
    [0.5, true, true, '097-11 标签栏中间允许双向翻页'],
  ]) {
    await e(
      `(()=>{const n=document.querySelector('.tabs');n.scrollLeft=(n.scrollWidth-n.clientWidth)*${position};n.dispatchEvent(new Event('scroll'))})()`,
    );
    const state = `(()=>{const n=document.querySelector('.tabs'),l=document.querySelector('[aria-label="向前翻"]'),r=document.querySelector('[aria-label="向后翻"]');return !!l && !!r && n.classList.contains('more-l')===${left} && n.classList.contains('more-r')===${right} && ${left ? "!l.hasAttribute('aria-disabled')" : "l.getAttribute('aria-disabled')==='true'"} && ${right ? "!r.hasAttribute('aria-disabled')" : "r.getAttribute('aria-disabled')==='true'"}})()`;
    await wait(state);
    if (position === 0) await e("document.querySelector('[aria-label=向前翻]').click()");
    await check(
      label,
      `${state} && ${position === 0 ? "document.querySelector('.tabs').scrollLeft===0" : 'true'}`,
      undefined,
      'once',
    );
  }
  await e("document.querySelector('.tabs').scrollLeft=0");
  await e(
    `document.querySelector('.tabs').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100}))`,
  );
  await check(
    '标签栏纵向滚轮转换为横向滚动',
    'document.querySelector(".tabs").scrollLeft>0',
    undefined,
    'once',
  );
  await e(
    `document.querySelector('.tabs').style.maxWidth='';document.querySelector('.tabs [data-tab]').click();document.querySelector('.tabs [data-tab]').focus()`,
  );
  await key('ArrowRight');
  await wait(
    'document.querySelectorAll(".tabs [data-tab]")[1].getAttribute("aria-selected")==="true"',
  );
  await check(
    '标签栏方向键切换并移动焦点',
    'document.activeElement===document.querySelectorAll(".tabs [data-tab]")[1] && document.activeElement.getAttribute("aria-selected")==="true"',
    undefined,
    'once',
  );
  const order = await e(`(${session}).tabs.map(t=>t.id)`);
  await e('document.querySelector(".tabs [data-tab]").focus()');
  await key(' ', { code: 'Space' });
  await key('ArrowRight', { code: 'ArrowRight' });
  await key(' ', { code: 'Space' });

  await wait('!document.querySelector(".drag-float")');
  await check(
    '标签页键盘空格拿起、方向键移动、空格放下',
    `(${session}).tabs[1].id===${JSON.stringify(order[0])}`,
    undefined,
    'once',
  );
  await e('document.querySelector(".tabs [data-tab]").focus()');
  await key(' ', { code: 'Space' });
  await key('ArrowRight', { code: 'ArrowRight' });
  await key('Escape', { code: 'Escape' });
  await wait('!document.querySelector(".drag-float")');
  await check(
    '标签页键盘 Esc 取消排序',
    `JSON.stringify((${session}).tabs.map(t=>t.id))===${JSON.stringify(JSON.stringify(order))}`,
    undefined,
    'once',
  );
  await drag(
    'document.querySelectorAll(".tabs [data-tab]")[1]',
    'document.querySelectorAll(".tabs [data-tab]")[0]',
  );
  await check(
    '标签页支持指针拖动换位',
    `(${session}).tabs[0].id===${JSON.stringify(order[1])}`,
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
  await wait('document.querySelectorAll(".tabs [data-tab]").length===4');
  await check(
    '拖入窗口通过真实文件路径打开图片',
    'document.querySelectorAll(".tabs [data-tab]").length===4',
    undefined,
    'once',
  );

  await e(
    'document.querySelectorAll(".tabs [data-tab]")[2].dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:280,clientY:25}))',
  );
  await click('关闭右侧标签页');
  await wait('document.querySelectorAll(".tabs [data-tab]").length===3');
  await check(
    '标签页右键关闭右侧标签页',
    'document.querySelectorAll(".tabs [data-tab]").length===3',
    undefined,
    'once',
  );
  await e('document.querySelectorAll(".tabs [data-tab]")[1].click()');
  await wait(
    `(${session}).activeTabId===document.querySelectorAll('.tabs [data-tab]')[1].dataset.tab`,
    '标签页内容与持久化选择已切换',
  );
  const missingPath = await e(`${draft}.image_path`);
  if (path.relative(mode.root, missingPath).startsWith('..'))
    throw Error('缺失图片检查仅限临时目录');
  await fs.rename(missingPath, missingPath + '.moved');
  await h.reload();
  await wait('document.body.innerText.includes("这张图片已被移动或删除")');
  await shot('missing');
  await check(
    '文件缺失时提示词仍然可编辑和复制',
    '!!document.querySelector(".blk[data-block]") && document.body.innerText.includes("这张图片已被移动或删除")',
  );
  await click(
    '按文本编辑（Ctrl E 切换）',
    'document.querySelector("[role=radiogroup][aria-label=编辑方式]")',
  );
  await input('.tx-wrap textarea', 'missing file editable');
  await click(
    '按块编辑（Ctrl E 切换）',
    'document.querySelector("[role=radiogroup][aria-label=编辑方式]")',
  );
  await click('复制提示词');
  await checkCopy(
    '缺失图片草稿仍可编辑并复制',
    () => clipboard.readText() === 'missing file editable',
    undefined,
    'once',
  );
  // Close only the disposable test tabs via the normal close command.
  await e(
    'document.querySelector(".tabs [data-tab][aria-selected=true]").dispatchEvent(new MouseEvent("auxclick",{button:1,bubbles:true,cancelable:true}))',
  );
  await wait('!!document.querySelector("[role=dialog]:not(.leaving *)")');
  await check(
    '中键关闭修改过的标签页先确认且未丢失草稿',
    'document.querySelectorAll(".tabs [data-tab]").length===3 && document.querySelector("[role=dialog]:not(.leaving *)").textContent.includes("丢弃并关闭")',
    undefined,
    'once',
  );
  await click('取消', 'document.querySelector("[role=dialog]:not(.leaving *)")');
  for (let i = 0; i < 3; i++) {
    const count = await e('document.querySelectorAll(".tabs [data-tab]").length');
    await key('w', modifier);
    await wait(
      `!!document.querySelector('[role=dialog]:not(.leaving *)') || document.querySelectorAll('.tabs [data-tab]').length < ${count}`,
    );
    if (await e('!!document.querySelector("[role=dialog]:not(.leaving *)")'))
      await click('丢弃并关闭', 'document.querySelector("[role=dialog]:not(.leaving *)")');
    await wait(`document.querySelectorAll('.tabs [data-tab]').length < ${count}`);
  }
  await wait('!!document.querySelector(".pages .empty")');
  for (const project of database.loadLibrary('all')) {
    if (project.metadata.prompt_raw === workbenchRaw) database.deleteProject(project.id);
  }
  await automaticAndVibeChecks({ h, mode, doubles });
  await pick186Checks({ h, preferences, mode, database });
  h.window.setContentSize(...previousSize);
}
