import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { clipboard, nativeImage } from 'electron';
import { pauseFileRead } from './readGate.js';

export async function libraryImportExtras({ h, database, doubles, mode, files, reduced, click }) {
  const { evaluate: e, wait, check } = h;
  const scope = 'document.querySelector(".libp")';
  const before = database.loadLibrary('all').length;
  doubles.selections.push({ canceled: true, filePaths: [] });
  await click('导入', scope);
  await check(
    '取消文件选择不改变图库',
    () => database.loadLibrary('all').length === before,
    undefined,
    'once',
  );
  clipboard.writeImage(
    nativeImage.createFromPath(files[0]).resize({ width: 355 + Number(reduced) }),
  );
  await click('更多导入方式', scope);
  await click('从剪贴板导入', 'document.querySelector(".menu:not(.leaving)")');
  await h.until(() => database.loadLibrary('all').length === before + 1, '菜单从剪贴板导入');
  await check(
    '小箭头菜单从剪贴板导入',
    () => database.loadLibrary('all').length === before + 1,
    undefined,
    'once',
  );
  const batch = [];
  for (let i = 0; i < 60; i++) {
    const file = path.join(mode.root, `cancel-${reduced}-${i}.png`);
    await sharp(files[1])
      .extract({ left: i, top: 100 + Number(reduced), width: 410, height: 510 })
      .png()
      .toFile(file);
    batch.push(file);
  }
  const count = database.loadLibrary('all').length;
  doubles.selections.push({ canceled: false, filePaths: batch });
  const readGate = pauseFileRead(batch[25]);
  try {
    await click('导入', scope);
    await h.until(readGate.reached, '第一批提交后暂停第 26 张图片的真实读取');
    await wait(
      'document.querySelector(".ldock .job b")?.textContent.includes("26 / 60")',
      '导入界面显示已处理的第一批图片',
    );
    await h.screenshot(`library-import-${reduced ? 'off' : 'full'}-${mode.theme}`);
    await click('取消剩余', scope);
    // The cancellation handler is synchronous. A following IPC reply fences the
    // click's request before releasing the genuine in-flight file read.
    await e(
      "window.studio.invoke('updates.status',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data})",
      '等待取消请求经过主进程',
    );
  } finally {
    readGate.restore();
  }
  await wait('!document.querySelector(".ldock .job")');
  const imported = database.loadLibrary('all').length - count;
  await check(
    '取消剩余导入保留已完成的图片',
    () => imported > 0 && imported < 60,
    () => ({ imported, total: batch.length }),
    'once',
  );
  const file = batch.at(-1);
  await fs.access(file);
  await wait(
    '!!document.querySelector(".lib-grid-col > .scroll") && !document.querySelector("[data-library-updating=true]")',
    '取消导入后的拖入目标已就绪',
  );
  await e(
    `(()=>{const input=document.createElement('input');input.type='file';input.hidden=true;input.id='acceptance-drop-file';document.body.append(input)})()`,
  );
  const cdp = h.window.webContents.debugger;
  await cdp.sendCommand('DOM.enable');
  const { root } = await cdp.sendCommand('DOM.getDocument');
  const { nodeId } = await cdp.sendCommand('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#acceptance-drop-file',
  });
  await cdp.sendCommand('DOM.setFileInputFiles', { nodeId, files: [file] });
  await wait(
    'document.querySelector("#acceptance-drop-file")?.files?.length === 1 && !!document.querySelector(".lib-grid-col > .scroll")',
    '拖入文件与目标元素均已就绪',
  );
  await e(
    `(()=>{const source=document.querySelector('#acceptance-drop-file');const data=new DataTransfer();data.items.add(source.files[0]);window.__acceptanceDrop=data;const target=document.querySelector('.lib-grid-col > .scroll');for(const type of ['dragenter','dragover'])target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:data,clientX:400,clientY:300}));})()`,
  );
  await wait('!!document.querySelector(".dropzone")');
  await h.screenshot(`library-drop-${reduced ? 'off' : 'full'}-${mode.theme}`);
  await e(
    `(()=>{document.querySelector('.lib-grid-col > .scroll').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__acceptanceDrop,clientX:400,clientY:300}));document.querySelector('#acceptance-drop-file').remove();delete window.__acceptanceDrop;})()`,
  );
  await h.until(
    () => database.loadLibrary('all').some((p) => p.name === path.basename(file, '.png')),
    '拖入文件导入',
  );
  await check(
    '拖进窗口通过真实文件路径导入',
    () => database.loadLibrary('all').some((p) => p.name === path.basename(file, '.png')),
    undefined,
    'once',
  );
  await check('导入保留用户选择的原文件', async () => !!(await fs.stat(file)), undefined, 'once');
}
