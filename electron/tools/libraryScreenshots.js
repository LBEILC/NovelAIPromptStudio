import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { dialog, shell } from 'electron';
import { installAcceptanceDoubles } from './acceptanceMode.js';
import { harness } from '../acceptance/harness.js';
import { importLibraryFiles } from '../importer.js';
const require = createRequire(import.meta.url);

/** Drive real library states after ordinary screenshot startup has settled. */
export async function prepareLibraryScreenshot({
  window,
  scene,
  mode,
  database,
  assetsDirectory,
  filePaths,
}) {
  if (!scene.libraryState) return async () => {};
  const h = harness(window, { ...mode, screenshots: [] }, []);
  const { evaluate: e, wait, click, input, key } = h;
  const scope = 'document.querySelector(".libp")';
  const cleanup = [];
  const settle = async () => {
    await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await wait('!document.querySelector("[data-library-updating=true]")');
  };
  const reload = async () => {
    window.webContents.reload();
    await wait('document.documentElement.dataset.screenshotReady===' + JSON.stringify(scene.name));
    await settle();
  };
  const select = async () => {
    await e('document.querySelector(".card").click()');
    await wait(
      '!!document.querySelector(".card.on") && !!document.querySelector(".detail")?.dataset.detailId',
    );
  };
  const group = async () => {
    await click('视图', scope);
    await click('完全相同');
    await key('Escape');
    await settle();
    await wait('!!document.querySelector(".card .stack")');
    await e(`[...document.querySelectorAll('.card')].find(c=>c.querySelector('.stack')).click()`);
    await wait('document.querySelectorAll(".detail .lstrip img").length>1');
  };
  try {
    await click('全部图片', scope);
    await settle();
    await select();
    const state = scene.libraryState;
    if (state === 'mixed') {
      const directory = path.join(mode.root, 'mixed');
      await fs.mkdir(directory, { recursive: true });
      const files = [];
      for (const [name, width, height] of [
        ['横图', 800, 480],
        ['方图', 600, 600],
      ]) {
        const file = path.join(directory, `${name}.png`);
        await sharp(filePaths[0]).extract({ left: 0, top: 0, width, height }).toFile(file);
        files.push(file);
      }
      const result = await importLibraryFiles({ filePaths: files, database, assetsDirectory });
      cleanup.push(() => result.imported.forEach((item) => database.deleteProject(item.id)));
      await reload();
    }
    if (state === 'group' || state === 'viewer') await group();
    if (state === 'filter') {
      await click('筛选', scope);
      await input('input[aria-label="包含的 Tag"]', '1girl');
      await key('Enter');
      await settle();
    }
    if (state === 'view') await click('视图', scope);
    if (state === 'select') {
      await e(
        `[...document.querySelectorAll('.card')].filter((_,i)=>[0,2,4].includes(i)).forEach(c=>c.dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true})))`,
      );
      await wait('!!document.querySelector(".ldock .selbar")');
    }
    if (state === 'collect') await click('加入收藏集', 'document.querySelector(".detail")');
    if (state === 'smart') {
      await click('智能收藏集', 'document.querySelector(".libp .side")');
      await settle();
    }
    if (state === 'nomatch') {
      await input('.gallery-search input', 'no-such-image');
      await wait('!!document.querySelector(".libp .empty")');
    }
    if (state === 'empty') {
      const ids = database.loadLibrary('all').map((p) => p.id);
      database.updateProjects(ids, { deleted: true });
      cleanup.push(() => database.updateProjects(ids, { deleted: false }));
      await reload();
      await wait('!!document.querySelector(".libp .empty")');
    }
    if (state === 'trash' || state === 'purge') {
      await click('回收站', scope);
      await settle();
      await select();
      if (state === 'purge') {
        await click('永久删除', 'document.querySelector(".detail")');
        await wait('!!document.querySelector("[role=dialog]:not(.leaving *)")');
      }
    }
    if (state === 'viewer') {
      await key(' ', {}, 'document.querySelector(".lgrid")');
      await wait('!!document.querySelector(".viewer-ov")');
    }
    if (state === 'drop') {
      await e(
        `(()=>{const d=new DataTransfer();for(let i=0;i<12;i++)d.items.add(new File(['image'],'reference-'+i+'.png',{type:'image/png'}));const target=document.querySelector('.lib-grid-col > .scroll');for(const type of ['dragenter','dragover'])target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:d,clientX:400,clientY:300}));})()`,
      );
      await wait('!!document.querySelector(".dropzone")');
    }
    if (state === 'zip' || state === 'import') {
      const doubles = installAcceptanceDoubles(mode, { dialog, shell });
      cleanup.push(() => doubles.restore());
      const directory = path.join(mode.root, `import-${state}`);
      await fs.mkdir(directory, { recursive: true });
      const files = [];
      for (let i = 0; i < (state === 'zip' ? 10 : 90); i++) {
        const file = path.join(directory, `${state}-${i}.png`);
        const metadata = await sharp(filePaths[i % filePaths.length]).metadata();
        await sharp(filePaths[i % filePaths.length])
          .extract({
            left: i,
            top: 0,
            width: Math.min(600, metadata.width - i),
            height: Math.min(800, metadata.height),
          })
          .png()
          .toFile(file);
        files.push(file);
      }
      let paths = files;
      if (state === 'zip') {
        const archive = new (require('yazl').ZipFile)();
        [...files, ...filePaths.slice(0, 2)].forEach((file, i) =>
          archive.addFile(file, `${i}.png`),
        );
        archive.end();
        const zip = path.join(directory, 'NovelAI.zip');
        await fs.writeFile(zip, Buffer.concat(await Array.fromAsync(archive.outputStream)));
        paths = [zip];
      }
      doubles.selections.push({ canceled: false, filePaths: paths });
      await click('导入', scope);
      if (state === 'zip') {
        await wait('document.querySelectorAll(".zipdlg .ztile").length===12');
        await wait('document.querySelector(".zipdlg")?.textContent.includes("其中 2 张")');
        await wait(
          '[...document.querySelectorAll(".zipdlg .ztile img")].every(image=>image.complete&&image.naturalWidth>0)',
        );
      } else {
        await wait('!!document.querySelector(".ldock .job")');
        cleanup.push(async () => {
          if (await e('!!document.querySelector(".ldock .job")')) await click('取消剩余', scope);
        });
      }
    }
    await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    return async () => {
      for (const action of cleanup.reverse()) await action();
    };
  } catch (error) {
    for (const action of cleanup.reverse()) await action();
    throw error;
  }
}
