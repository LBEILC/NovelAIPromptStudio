import fs from 'node:fs/promises';
import path from 'node:path';
import { clipboard } from 'electron';
import { loadWindowsClipboard } from '../windowsClipboard.js';
import { preserveClipboard } from './clipboard.js';
import { createWorkbenchFixtures } from './workbenchFixtures.js';

export async function windowsClipboardChecks({ h, mode, doubles, database }) {
  if (process.platform !== 'win32') return;
  const real = doubles.realClipboard;
  const restore = preserveClipboard(real);
  const previous = { ...clipboard };
  const previousSystem = doubles.systemClipboard;
  const system = loadWindowsClipboard();
  const prompt = 'synthetic transparent clipboard fixture';
  const seed = 68000;
  const [file] = await createWorkbenchFixtures(path.join(mode.root, 'transparent-clipboard'), {
    sizes: [[832, 1216]],
    transparent: true,
    prompts: [prompt],
    seed,
  });
  const bytes = await fs.readFile(file);
  const invoke = (name, input = {}) =>
    h.evaluate(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
    );
  try {
    // This scoped probe uses the real clipboard; all other acceptance stays isolated.
    Object.assign(clipboard, real);
    doubles.systemClipboard = system;
    await h.click('工作台', 'document.querySelector(".tb")');
    doubles.selections.push({ canceled: false, filePaths: [file] });
    await h.click('打开图片', 'document.querySelector(".tb")');
    await h.wait(
      `window.studio.invoke('workbench.list',{}).then(r=>r.data.tabs.find(t=>t.id===r.data.activeTabId)?.source.path===${JSON.stringify(file)})`,
      '透明合成图成为活动标签页',
    );
    await h.wait('!!document.querySelector(".stage-acts")', '透明合成图已打开');
    const timings = [];
    for (let i = 0; i < 3; i++) {
      let finished = false;
      let elapsed;
      const start = performance.now();
      doubles.systemClipboard = {
        write: async (...args) => {
          await system.write(...args);
          elapsed = performance.now() - start;
          finished = true;
        },
      };
      await h.click('复制图片', 'document.querySelector(".stage-acts")');
      await h.until(() => finished, '真实系统剪贴板写入完成');
      timings.push(elapsed);
    }
    await fs.writeFile(
      path.join(mode.output, 'clipboard-timing.json'),
      JSON.stringify(
        { size: [832, 1216], milliseconds: timings, median: [...timings].sort((a, b) => a - b)[1] },
        null,
        2,
      ),
    );
    await h.check('透明 PNG 原文件与剪贴板逐字节相同', () => real.readBuffer('PNG').equals(bytes));
    await h.check(
      '透明位图 CF_DIBV5 和系统转换的 CF_DIB 同时可用',
      () => system.isFormatAvailable(17) && system.isFormatAvailable(8),
    );
    await h.check(
      '图片复制没有文件或文本格式',
      () => !system.isFormatAvailable(15) && !system.isFormatAvailable(13),
    );
    const pasted = await invoke('workbench.open-clipboard');
    await h.check(
      '粘贴透明 PNG 保留提示词和种子',
      () =>
        pasted.ok &&
        pasted.project.metadata.prompt_raw === prompt &&
        Number(pasted.project.metadata.seed) === seed,
    );
    doubles.systemClipboard = system;
    const managed = database.loadLibrary('all')[0];
    const result = await invoke('image.copy', { id: managed.id });
    const original = await fs.readFile(managed.image_path);
    await h.check(
      '图片库复制也写入原 PNG 和透明位图',
      () =>
        result.ok &&
        real.readBuffer('PNG').equals(original) &&
        system.isFormatAvailable(17) &&
        system.isFormatAvailable(8),
    );
  } finally {
    doubles.systemClipboard = previousSystem;
    Object.assign(clipboard, previous);
    restore();
    await h.check('透明图片验收后恢复原剪贴板', () => restore.verify());
    const tabs = await invoke('workbench.list');
    for (const tab of tabs.tabs.filter((tab) => tab.source.path === file))
      await invoke('workbench.close', { tabId: tab.id });
    await h.reload();
  }
}
