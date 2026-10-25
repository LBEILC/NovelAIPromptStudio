import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const folderDialog =
  'document.querySelector(\'[role="dialog"][aria-label="导入文件夹"]:not(.leaving)\')';

export async function createFolderFixture(mode) {
  const root = path.join(mode.root, 'folder-ui-fixture');
  for (const dir of ['角色/初音', '场景/初音', '场景/空的'])
    await fs.mkdir(path.join(root, dir), { recursive: true });
  for (const [i, file] of [
    'root.png',
    '角色/初音/one.png',
    '角色/初音/two.png',
    '场景/初音/three.png',
  ].entries())
    await sharp({ create: { width: 19 + i, height: 23, channels: 3, background: '#345678' } })
      .png()
      .toFile(path.join(root, file));
  await fs.copyFile(path.join(root, '角色/初音/one.png'), path.join(root, '场景/初音/repeat.png'));
  await fs.writeFile(path.join(root, 'ignored.zip'), 'synthetic ignored archive');
  return root;
}

export async function folderImportChecks({ h, mode, doubles, database }) {
  h.category('图片库·文件夹');
  const root = await createFolderFixture(mode);
  const before = database.loadLibrary('all').length;
  const collections = database.listCollections().length;
  await h.click('图片库', 'document.querySelector(".tb")');
  await h.click('全部图片', 'document.querySelector(\'[aria-label="图片库导航"]\')');
  const open = async () => {
    doubles.selections.push({ canceled: false, filePaths: [root] });
    await h.click('更多导入方式');
    await h.click('导入文件夹…');
    await h.wait(`!!${folderDialog}`);
  };
  await open();
  await h.check(
    '文件夹树包含根、父目录和同名子目录，收藏集消歧且提示 ZIP',
    `(() => {const d=${folderDialog};const names=[...d.querySelectorAll('[role=treeitem] b')].map(e=>e.textContent);return ['folder-ui-fixture','角色','场景'].every(t=>names.includes(t)) && names.filter(t=>t==='初音').length===2 && ['初音（角色）','初音（场景）','1 个 ZIP 不会导入'].every(t=>d.textContent.includes(t));})()`,
  );
  await h.evaluate(
    `[...${folderDialog}.querySelectorAll('[role=treeitem]')].find(e=>e.querySelector('b')?.textContent==='场景').click()`,
  );
  await h.check(
    '取消父目录同时取消有图子目录并更新导入数量',
    `(() => {const d=${folderDialog};const rows=[...d.querySelectorAll('[role=treeitem]')];return rows.find(e=>e.textContent.includes('初音（场景）')).getAttribute('aria-checked')==='false' && rows.find(e=>e.querySelector('b')?.textContent==='场景').getAttribute('aria-checked')==='false' && d.textContent.includes('导入 3 张');})()`,
  );
  await h.click('全选', folderDialog);
  await h.screenshot('folder-import-preview');
  await h.click('导入 5 张', folderDialog);
  await h.wait(`!${folderDialog}`);
  await h.until(
    () => database.loadLibrary('all').length === before + 4,
    '文件夹导入完成且重复图片只保存一份',
  );
  const expected = [
    ['folder-ui-fixture', 1],
    ['初音（角色）', 2],
    ['初音（场景）', 2],
  ];
  await h.wait(
    `['初音（角色）','初音（场景）'].every(t=>document.querySelector('[aria-label="图片库导航"]')?.textContent.includes(t))`,
  );
  await h.check(
    '导入后收藏集及成员数量正确且跨目录图片去重',
    () =>
      expected.every(([name, count]) =>
        database.listCollections().some((c) => c.name === name && c.member_ids.length === count),
      ) && database.loadLibrary('all').length === before + 4,
  );
  const sidebarCounts = expected.map(([name, count]) => ({
    id: database.listCollections().find((c) => c.name === name).id,
    count,
  }));
  const countsVisible = `${JSON.stringify(sidebarCounts)}.every(({id,count})=>document.querySelector('[data-key="sv-'+id+'"] .n')?.textContent===String(count))`;
  await h.wait(countsVisible);
  await h.check('左栏三个收藏集显示各自图片张数', countsVisible);
  await open();
  await h.check(
    '再次扫描将三个收藏集合并到已有收藏集',
    `${folderDialog}.querySelectorAll('[data-tip^="并进已有的收藏集"]').length===3`,
  );
  await h.click('导入 5 张', folderDialog);
  await h.wait(
    `!${folderDialog} && !document.querySelector('[aria-label="更多导入方式"]')?.disabled`,
  );
  await h.check(
    '再次导入不增加收藏集或图片',
    () =>
      database.listCollections().length === collections + 3 &&
      database.loadLibrary('all').length === before + 4,
  );
  doubles.selections.push({ canceled: false, filePaths: [root] });
  await h.key(
    'I',
    {
      ctrlKey: process.platform !== 'darwin',
      metaKey: process.platform === 'darwin',
      shiftKey: true,
    },
    'document.body',
  );
  await h.wait(`!!${folderDialog}`);
  await h.check('图片库 Mod Shift I 打开文件夹对话框', `!!${folderDialog}`);
  await h.click('取消', folderDialog);
}
