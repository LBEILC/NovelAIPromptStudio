import fs from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { importLibraryFiles } from '../importer.js';
import { selectGalleryGrouping } from './galleryView.js';
import { collectionContext, checkCollectionContext } from './libraryFinish.js';
import { resolveExport } from '../libraryExport.js';
import { versionName } from '../../src/lib/imageNaming.js';
import { groupGalleryProjects } from '../../src/lib/gallery.js';

function unzip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = [];
      zip.on('error', reject);
      zip.on('end', () => resolve(entries));
      zip.on('entry', (entry) =>
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on('error', reject);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            entries.push({ name: entry.fileName, bytes: Buffer.concat(chunks) });
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    });
  });
}

export async function exportChecks({ h, database, mode, doubles, preferences }) {
  h.category('导出');
  const invoke = (name, input = {}) =>
    h.evaluate(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(JSON.stringify(r.error));return r.data})`,
    );
  const files = await createWorkbenchFixtures(path.join(mode.root, 'export-fixtures'), {
    prefix: 'synthetic-export',
    sizes: [
      [64, 64],
      [64, 64],
      [64, 64],
    ],
    prompts: ['synthetic export one', 'synthetic export two', 'synthetic export three'],
  });
  const { imported } = await importLibraryFiles({
    filePaths: files,
    database,
    assetsDirectory: preferences.librarySettings().assetsDirectory,
  });
  const works = [];
  for (const name of ['Synthetic export A', 'Synthetic export B']) {
    const { tab } = await invoke('workbench.new', { name });
    let parentId = tab.versionId;
    // The second image belongs to both groups: selection must deduplicate it.
    for (const image of imported.slice(0, 2)) {
      parentId = database.versions.append({
        workId: tab.workId,
        parentId,
        project: image,
        image,
        seed: 1,
        source: 'agent',
      }).id;
    }
    works.push(tab.workId);
  }
  const ids = imported.map((p) => p.id);
  const unnamed = (await invoke('workbench.new', { name: 'synthetic s-999' })).tab;
  database.versions.append({
    workId: unnamed.workId,
    parentId: unnamed.versionId,
    project: imported[2],
    image: imported[2],
    seed: 1,
    source: 'agent',
  });
  database.createCollection({ id: 'export-fixture', name: 'Synthetic export collection' });
  database.updateCollectionProjects('export-fixture', ids);
  database.createCollection({
    id: 'export-smart-fixture',
    name: 'Synthetic export smart',
    kind: 'smart',
    filters: {},
  });
  await h.reload();
  await h.click('图片库', 'document.querySelector(".tb")');
  await h.click('全部图片', 'document.querySelector(".libp")');
  await checkCollectionContext(h, 'export-fixture');
  await checkCollectionContext(h, 'export-smart-fixture');
  await h.click('视图');
  await selectGalleryGrouping(h, '按作品');
  await h.key('Escape');
  const card = (id) =>
    `[...document.querySelectorAll('[data-group-id]:not(.leaving)')].find(e=>e.dataset.groupId===${JSON.stringify(id)})`;
  const menu = 'document.querySelector("[role=menu]:not(.leaving *)")';
  const context = async (id) => {
    await h.wait(`!!${card(id)}`);
    await h.evaluate(
      `${card(id)}.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:220}))`,
    );
    await h.wait(`!!${menu}`);
  };
  const closeMenu = async () => {
    await h.key('Escape');
    await h.wait(`!${menu}`);
  };
  await context(`work:${works[0]}`);
  await h.check('多图组右键提供导出这一组', `${menu}.textContent.includes('导出这一组')`);
  await closeMenu();
  const singleGroup = groupGalleryProjects(await database.loadLibraryCards(), {
    promptScope: 'work',
  }).find((group) => group.members.length === 1 && group.members[0].id === ids[2]);
  await context(singleGroup.id);
  await h.check('单张卡片没有导出项', `!${menu}.textContent.includes('导出')`);
  await closeMenu();
  // Select both work cards using the platform's multi-select modifier.
  for (const [index, workId] of works.entries())
    await h.evaluate(
      `${card(`work:${workId}`)}.dispatchEvent(new MouseEvent('click',${JSON.stringify({ bubbles: true, ctrlKey: index > 0 && process.platform !== 'darwin', metaKey: index > 0 && process.platform === 'darwin' })}))`,
    );
  await h.wait('!!document.querySelector(\'[data-feature="export"]\')');
  await h.evaluate('document.querySelector(\'[data-feature="export"]\').click()');
  const dlg = 'document.querySelector("[data-export-dialog]:not(.leaving *)")';
  await h.wait(`${dlg}?.querySelector('h3')?.textContent==='导出 2 张图片'`);
  await h.check(
    '两组按图片去重显示导出张数',
    `${dlg}.querySelector('h3').textContent==='导出 2 张图片'`,
  );
  await h.click('ZIP 压缩包', dlg);
  await h.screenshot('export-zip-dialog');
  const zipPath = path.join(mode.root, 'export-result.zip');
  doubles.saves.push({ canceled: false, filePath: zipPath });
  await h.click('导出…', dlg);
  const finished = `document.body.innerText.includes('已导出 2 张') && [...document.querySelectorAll('button')].some(b=>b.textContent==='打开所在位置')`;
  await h.wait(finished);
  await h.check('ZIP 导出完成并提供打开所在位置', finished);
  const plan = await resolveExport(database, { ids: ids.slice(0, 2) });
  const entries = await unzip(zipPath);
  await h.check(
    'ZIP 文件数和每个原图字节一致',
    async () =>
      entries.length === plan.count &&
      (
        await Promise.all(
          plan.items.map(async (item) =>
            entries
              .find((e) => e.name === item.fileName)
              ?.bytes.equals(await fs.readFile(item.image.image_path)),
          ),
        )
      ).every(Boolean),
  );
  await h.key('Escape');
  await collectionContext(h, 'export-fixture', '导出收藏集…');
  await h.wait(
    `${dlg}?.querySelector('h3')?.textContent==='导出收藏集「Synthetic export collection」· 3 张'`,
  );
  await h.check(
    '收藏集导出标题含名称和张数',
    `${dlg}.querySelector('h3').textContent==='导出收藏集「Synthetic export collection」· 3 张'`,
  );
  await h.click('文件夹', dlg);
  await h.screenshot('export-collection-dialog');
  const output = path.join(mode.root, 'export-folder');
  await fs.mkdir(output);
  doubles.selections.push({ canceled: false, filePaths: [output] });
  await h.click('导出…', dlg);
  await h.wait("document.body.innerText.includes('已导出 3 张')");
  await h.check(
    '收藏集导出建立同名文件夹并包含全部图片',
    async () => (await fs.readdir(path.join(output, 'Synthetic export collection'))).length === 3,
  );
  await collectionContext(h, 'export-fixture', '导出收藏集…');
  await h.wait(`${dlg}?.querySelector('[role=radio][aria-checked=true]')?.textContent==='文件夹'`);
  await h.check(
    '重新打开保留文件夹格式',
    `${dlg}.querySelector('[role=radio][aria-checked=true]').textContent==='文件夹'`,
  );
  await h.click('取消', dlg);
  await h.wait(`!${dlg}`);
  // Inspect one unnamed generated image independently of its work grouping.
  await h.click('视图');
  await selectGalleryGrouping(h, '不合并');
  await h.key('Escape');
  await h.wait(`!!${card(`project:${ids[0]}`)}`);
  await h.evaluate(`${card(`project:${ids[0]}`)}.click()`);
  const expectedName = versionName(database.loadProject(ids[0]));
  await h.wait(`document.querySelector('.lname')?.textContent===${JSON.stringify(expectedName)}`);
  await h.check(
    '生成图详情沿用作品名和版本号',
    `document.querySelector('.lname').textContent===${JSON.stringify(expectedName)}`,
  );
  await context(`project:${ids[0]}`);
  await h.check(
    '有作品名的生成图提供重命名',
    `${menu}.textContent.includes('重命名') && ![...${menu}.querySelectorAll('[role=menuitem]')].some(e=>e.textContent==='起名')`,
  );
  await closeMenu();
  await h.reload();
  await h.click('图片库', 'document.querySelector(".tb")');
  await context(`project:${ids[2]}`);
  await h.check(
    '未命名作品里的生成图仍提供起名',
    `${menu}.textContent.includes('起名') && !${menu}.textContent.includes('重命名')`,
  );
  await closeMenu();
  database.trashProjects([ids[2]]);
  await h.reload();
  await h.click('图片库', 'document.querySelector(".tb")');
  await h.click('回收站', 'document.querySelector(".libp")');
  await h.wait(`!!${card(`project:${ids[2]}`)}`);
  await h.evaluate(
    `${card(`project:${ids[2]}`)}.dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true,metaKey:true}))`,
  );
  await h.wait('!!document.querySelector(".selbar")');
  await h.check('回收站多选不提供导出', '!document.querySelector(\'[data-feature="export"]\')');
  await h.screenshot('export-trash');
}
