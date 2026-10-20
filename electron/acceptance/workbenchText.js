import path from 'node:path';
import { settleLayout } from './layout.js';
import { clipboard } from 'electron';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
export async function textEditingChecks({ h, raw, draft, reset, modifier }) {
  const { evaluate: e, click, input, key, wait, check } = h;
  const before = await e(raw);
  await key('e', modifier);
  await wait('!!document.querySelector(".wb-text-section textarea")');
  await check('Ctrl E切换文本方式不改变草稿', `${raw}===${JSON.stringify(before)}`);
  await h.reload();
  await check(
    '重新启动渲染器后保留文本编辑方式',
    '!!document.querySelector(".wb-text-section textarea")',
  );
  await key('e', modifier);
  await check(
    'Ctrl E切回按块仍保持草稿',
    `${raw}===${JSON.stringify(before)}&&!document.querySelector('.wb-text-section textarea')`,
  );
  await key('e', modifier);
  await input('.wb-text-section textarea', '1.3::rain::, {clouds}, -1.5::wind::, wa');
  await e(
    `(()=>{const n=document.querySelector('.wb-text-section textarea');n.focus();n.setSelectionRange(n.value.length,n.value.length);n.dispatchEvent(new Event('select',{bubbles:true}))})()`,
  );
  await wait('!!document.querySelector(".wb-text-suggestions [role=option]")');
  const candidate = await e(
    'document.querySelector(".wb-text-suggestions [role=option]").textContent',
  );
  await check(
    '逗号后输入wa出现补全',
    'document.querySelectorAll(".wb-text-suggestions [role=option]").length>0',
  );
  await check(
    '输入 wa 后补全项不超过六个',
    'document.querySelectorAll(".wb-text-suggestions [role=option]").length<=6',
  );
  await h.screenshot('workbench-text-autocomplete');
  await key('Enter', {}, 'document.querySelector(".wb-text-section textarea")');
  await check(
    '补全回车插入Tag和逗号空格',
    `(()=>{const n=document.querySelector('.wb-text-section textarea');return n.value.endsWith(', ')&&!n.value.endsWith(', wa')})()`,
  );
  await input('.wb-text-section textarea', '1.3::rain::, {clouds}, -1.5::wind::');
  await e(
    `(()=>{const n=document.querySelector('.wb-text-section textarea'),at=n.value.indexOf('}');n.focus();n.setSelectionRange(at,at+1)})()`,
  );
  const cdp = h.window.webContents.debugger;
  await cdp.sendCommand('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
  });
  await cdp.sendCommand('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
  });
  await h.wait(
    '!!document.querySelector(".tx-hl .bad")&&document.querySelector(".tx-err")?.textContent.includes("第 1 行：{ 没有配对")',
  );
  await check(
    '不配对括号显示波浪线和行号',
    '!!document.querySelector(".tx-hl .bad")&&document.querySelector(".tx-err").textContent.includes("第 1 行：{ 没有配对")',
  );
  await check(
    '正负权重呈现对应高亮',
    '!!document.querySelector(".tx-hl .up.l2")&&!!document.querySelector(".tx-hl .neg")',
  );
  await h.screenshot('workbench-text-syntax');
  await cdp.sendCommand('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'z',
    code: 'KeyZ',
    windowsVirtualKeyCode: 90,
    modifiers: process.platform === 'darwin' ? 4 : 2,
    // CDP key events bypass Cocoa's key-binding translation on macOS.
    // Supply the native edit command that Command-Z normally carries.
    ...(process.platform === 'darwin' ? { commands: ['undo'] } : {}),
  });
  await cdp.sendCommand('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'z',
    code: 'KeyZ',
    windowsVirtualKeyCode: 90,
    modifiers: process.platform === 'darwin' ? 4 : 2,
  });
  await check(
    '文字框原生撤销恢复匹配括号后波浪线消失',
    '!document.querySelector(".tx-err")&&!document.querySelector(".tx-hl .bad")',
  );
  await check(
    '文本选中颜色跟随select-bg',
    `(()=>{const n=document.querySelector('.tx'),p=document.createElement('span');p.style.background='var(--select-bg)';document.body.append(p);const ok=getComputedStyle(n,'::selection').backgroundColor===getComputedStyle(p).backgroundColor;p.remove();return ok})()`,
    undefined,
    'both',
  );
  await key('e', modifier);
  await check(
    '文本方式的显式权重回写到块',
    `${draft}.tags.some(t=>t.tag==='rain'&&t.weight===1.3)`,
  );
  await reset();
  await e(
    `window.stageBefore=document.querySelector('.wb-canvas img').getBoundingClientRect().toJSON()`,
  );
  await click('Tag 块', 'document.querySelector(".wb-add-block-gap")');
  await input('.wb-new-block input', 'synthetic_new_block');
  await key('Enter', {}, 'document.querySelector(".wb-new-block input")');
  await check(
    '加Tag块直接输入后留下新的块',
    '[...document.querySelectorAll(".wb-block")].some(n=>n.textContent.includes("新的块")&&n.textContent.includes("synthetic_new_block"))',
  );
  await check(
    '修改标记和恢复出现但舞台位置不变',
    `(()=>{const r=document.querySelector('.wb-canvas img').getBoundingClientRect(),b=window.stageBefore;return !!document.querySelector('.wb-stage-dirty[data-visible]')&&!!document.querySelector('.wb-stage-reset[data-visible]')&&Math.abs(r.top-b.top)<1&&Math.abs(r.height-b.height)<1})()`,
  );
  await reset();
  await check(
    '恢复后标记消失并恢复草稿',
    `!document.querySelector('.wb-stage-dirty[data-visible]')&&${raw}===${JSON.stringify(before)}`,
  );
  await click('添加角色');
  await check(
    '新增角色为空且包含自己的负面节',
    `!!document.querySelector('.wb-character-empty')&&${draft}.prompt_structure.characters[0].label==='角色 1'&&${draft}.prompt_structure.characters[0].prompt_tags.length===0&&document.body.textContent.includes('角色 1 的负面提示词')`,
  );
  await click('＋ Tag 块', 'document.querySelector(".wb-character-empty")');
  await input('.wb-new-block input', 'synthetic_character');
  await key('Enter', {}, 'document.querySelector(".wb-new-block input")');
  await check(
    '空角色输入后成为一个Tag块',
    `${draft}.prompt_structure.characters[0].prompt_tags.some(t=>t.tag==='synthetic_character')&&!document.querySelector('.wb-character-empty')`,
  );
  await h.screenshot('workbench-empty-character-filled');
  await reset();
  await key('e', modifier);
  await input(
    '.wb-text-section textarea',
    Array.from({ length: 100 }, (_, i) => `synthetic_bottom_${i}`).join(', '),
  );
  await key('e', modifier);
  await e(
    `(()=>{const n=[...document.querySelectorAll('.wb-tags [data-wb-tag]')].at(-1);n.scrollIntoView({block:'end'});n.querySelector('.nps-tag').click()})()`,
  );
  await wait('!!document.querySelector(".wb-tag-editor")');
  await check(
    '底部Tag浮层向上翻边并保留窗口边距',
    `(()=>{const n=document.querySelector('.wb-tag-editor').closest('.nps-layer'),r=n.getBoundingClientRect(),m=parseFloat(getComputedStyle(n).getPropertyValue('--sp-2'));return n.dataset.placement==='top'&&r.left>=m-1&&r.right<=innerWidth-m+1&&r.top>=m-1&&r.bottom<=innerHeight-m+1})()`,
  );
  await key('Escape');
  await reset();
}

export async function automaticAndVibeChecks({ h, mode, doubles }) {
  const { evaluate: e, click, wait, check, key } = h;
  const files = await createWorkbenchFixtures(path.join(mode.root, 'automatic-vibe-fixtures'), {
    sizes: [
      [160, 240],
      [160, 240],
    ],
    prompts: ['synthetic subject', 'synthetic vibe subject'],
    parameters: [
      { model: 'nai-diffusion-5-full', tag_hint_qt: 1, tag_hint_uc_preset: 3 },
      {
        reference_image_multiple: [Buffer.alloc(128, 7).toString('base64')],
        reference_strength_multiple: [0.2],
      },
    ],
  });
  for (let i = 0; i < files.length; i++) {
    doubles.selections.push({ canceled: false, filePaths: [files[i]] });
    await click('打开图片', 'document.querySelector(".studio-titlebar")');
    await wait('!!document.querySelector(".wb-prompt")');
    if (i === 0) {
      await check(
        '自动添加内容默认折叠且V5档位不标推断',
        'document.querySelectorAll(".wb-automatic").length===2&&!document.querySelector(".wb-auto-tags")&&document.body.textContent.includes("质量 Tag · Standard · 3 个")&&document.body.textContent.includes("负面预设 · Light")&&!document.querySelector(".wb-automatic").textContent.includes("推断")',
      );
      await click('显示', 'document.querySelector(".wb-automatic")');
      await check(
        '自动内容展开后显示只读Tag',
        '!!document.querySelector(".wb-auto-tags")&&document.querySelector(".wb-auto-tags").textContent.includes("masterpiece")&&!document.querySelector(".wb-auto-tags [data-interactive]")',
      );
      await settleLayout(h, '.wb-auto-group');
      await check(
        '自动内容展开完成后不裁切',
        `(()=>{const n=document.querySelector('.wb-auto-group').closest('.nps-transition-height');return !!n&&n.scrollHeight<=n.clientHeight+1})()`,
      );
      await h.screenshot('workbench-automatic-expanded');
      await click('复制提示词');
      await check('复制默认不带V5自动质量词', () => clipboard.readText() === 'synthetic subject');
      await click('其他复制方式');
      await click('复制全部提示词，含 NovelAI 自动加的 3 个');
      await check(
        '显式复制可以包含V5自动质量词',
        () => clipboard.readText() === 'synthetic subject, very aesthetic, masterpiece, no text',
      );
    } else {
      await wait('!!document.querySelector(".wb-vibes button")');
      await click('0.20', 'document.querySelector(".wb-vibes")');
      await check(
        'Vibe浮层显示强度、未知信息提取和编码文件',
        'document.querySelector(".wb-vibe-detail").textContent.includes("参考强度 0.20")&&document.querySelector(".wb-vibe-detail").textContent.includes("未知 · 原图里没有记录")&&document.querySelector(".wb-vibe-detail").textContent.includes("编码文件")',
      );
      await h.screenshot('workbench-vibe-detail');
      await key('Escape');
      await e('document.querySelector(".wb-canvas img").click()');
      await wait('!!document.querySelector(".library-viewer img")');

      await h.nativeKey('Escape');
    }
    await key('w', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
    await wait('!document.querySelector(".wb-tab")');
  }
}
