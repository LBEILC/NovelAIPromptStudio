import path from 'node:path';
import { settleLayout } from './layout.js';
import { clipboard } from 'electron';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
export async function textEditingChecks({ h, raw, draft, reset, modifier }) {
  const { evaluate: e, click, input, key, wait, check } = h;
  const before = await e(raw);
  await key('e', modifier);
  await wait('!!document.querySelector(".tx-wrap textarea")');
  await check('Ctrl E切换文本方式不改变草稿', `${raw}===${JSON.stringify(before)}`);
  await h.reload();
  await check('重新启动渲染器后保留文本编辑方式', '!!document.querySelector(".tx-wrap textarea")');
  await key('e', modifier);
  await check(
    'Ctrl E切回按块仍保持草稿',
    `${raw}===${JSON.stringify(before)}&&!document.querySelector('.tx-wrap textarea')`,
  );
  await key('e', modifier);
  await input('.tx-wrap textarea', '1.3::rain::, {clouds}, -1.5::wind::, wa');
  await e(
    `(()=>{const n=document.querySelector('.tx-wrap textarea');n.focus();n.setSelectionRange(n.value.length,n.value.length);n.dispatchEvent(new Event('select',{bubbles:true}))})()`,
  );
  await wait('!!document.querySelector(".complete:not(.leaving) .mi")');
  const candidate = await e('document.querySelector(".complete:not(.leaving) .mi").textContent');
  await check(
    '逗号后输入wa出现补全',
    'document.querySelectorAll(".complete:not(.leaving) .mi").length>0',
  );
  await check(
    '输入 wa 后补全项不超过六个',
    'document.querySelectorAll(".complete:not(.leaving) .mi").length<=6',
  );
  await h.screenshot('workbench-text-autocomplete');
  await key('Enter', {}, 'document.querySelector(".tx-wrap textarea")');
  await check(
    '补全回车插入Tag和逗号空格',
    `(()=>{const n=document.querySelector('.tx-wrap textarea');return n.value.endsWith(', ')&&!n.value.endsWith(', wa')})()`,
  );
  await input('.tx-wrap textarea', '1.3::rain::, {clouds}, -1.5::wind::');
  await wait(
    'document.querySelector(".tx-hl").textContent.trimEnd()==="1.3::rain::, {clouds}, -1.5::wind::"',
    '新的文本已完成渲染后再选择待删除的括号',
  );
  await e(
    `(async()=>{await new Promise(resolve=>requestAnimationFrame(resolve));const n=document.querySelector('.tx-wrap textarea'),at=n.value.indexOf('}');n.focus();n.setSelectionRange(at,at+1)})()`,
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
  await wait(
    'document.querySelector(".tx-wrap textarea").value==="1.3::rain::, {clouds}, -1.5::wind::"&&!document.querySelector(".tx-err")',
    '原生撤销恢复文本与错误提示的最终状态',
  );
  await check(
    '文字框原生撤销恢复匹配括号后波浪线消失',
    '!document.querySelector(".tx-err")&&!document.querySelector(".tx-hl .bad")',
  );

  await key('e', modifier);
  await check(
    '文本方式的显式权重回写到块',
    `${draft}.tags.some(t=>t.tag==='rain'&&t.weight===1.3)`,
  );
  await reset();
  await click('Tag 块', 'document.querySelector(".blk-gap")');
  await input('[data-add^=new-] input', 'synthetic_new_block');
  await key('Enter', {}, 'document.querySelector("[data-add^=new-] input")');
  await check(
    '加Tag块直接输入后留下新的块',
    '[...document.querySelectorAll(".blk[data-block]")].some(n=>n.textContent.includes("新的块")&&n.textContent.includes("synthetic_new_block"))',
  );

  await reset();
  await check(
    '恢复后标记消失并恢复草稿',
    `!document.querySelector('.dirty-tag')&&${raw}===${JSON.stringify(before)}`,
  );
  await click('添加角色');
  await check(
    '新增角色为空且包含自己的负面节',
    `!!document.querySelector('.char-empty')&&${draft}.prompt_structure.characters[0].label==='角色 1'&&${draft}.prompt_structure.characters[0].prompt_tags.length===0&&document.body.textContent.includes('角色 1 的负面提示词')`,
  );
  await click('Tag 块', 'document.querySelector(".char-empty")');
  await input('[data-add^=new-] input', 'synthetic_character');
  await key('Enter', {}, 'document.querySelector("[data-add^=new-] input")');
  await check(
    '空角色输入后成为一个Tag块',
    `${draft}.prompt_structure.characters[0].prompt_tags.some(t=>t.tag==='synthetic_character')&&!document.querySelector('.char-empty')`,
  );
  await h.screenshot('workbench-empty-character-filled');
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
    await click('打开图片', 'document.querySelector(".tb")');
    await wait('!!document.querySelector(".col.prompt")');
    if (i === 0) {
      await check(
        '自动添加内容默认折叠且V5档位不标推断',
        'document.querySelectorAll(".auto-row").length===2&&!document.querySelector(".auto-tags")&&document.body.textContent.includes("质量 Tag · Standard · 3 个")&&document.body.textContent.includes("负面预设 · Light")&&!document.querySelector(".auto-row").textContent.includes("推断")',
      );
      await click('显示', 'document.querySelector(".auto-row")');
      await check(
        '自动内容展开后显示只读Tag',
        '!!document.querySelector(".auto-tags")&&document.querySelector(".auto-tags").textContent.includes("masterpiece")&&!document.querySelector(".auto-tags [data-interactive]")',
      );
      await settleLayout(h, '.auto-row');

      await h.screenshot('workbench-automatic-expanded');
      await click('复制提示词');
      await check('复制默认不带V5自动质量词', () => clipboard.readText() === 'synthetic subject');
      await click('其他复制方式');
      await click('复制全部提示词（含 NovelAI 自动添加的 3 个）');
      await check(
        '显式复制可以包含V5自动质量词',
        () => clipboard.readText() === 'synthetic subject, very aesthetic, masterpiece, no text',
      );
    } else {
      await wait('!!document.querySelector(".vibes button")');
      await click('0.20', 'document.querySelector(".vibes")');
      await check(
        'Vibe浮层显示强度、未知信息提取和编码',
        '[...document.querySelectorAll(".vibe-pop .frow")].some(n=>n.textContent.includes("参考强度")&&n.querySelector(".mono")?.textContent==="0.20")&&document.querySelector(".vibe-pop").textContent.includes("未知 · 原图里没有记录")&&[...document.querySelectorAll(".vibe-pop .frow")].some(n=>n.querySelector(".label")?.textContent==="编码"&&!!n.querySelector(".path")?.textContent)',
      );
      await h.screenshot('workbench-vibe-detail');
      await key('Escape');
      await e('document.querySelector(".stage .canvas img").click()');
      await wait('!!document.querySelector(".viewer-ov img")');

      await h.nativeKey('Escape');
    }
    await key('w', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
    await wait('!document.querySelector(".tabs [data-tab]")');
  }
}
