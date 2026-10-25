import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { selectGalleryGrouping } from './galleryView.js';

export async function backupUIChecks({ h, mode, doubles, database, app }) {
  h.category('备份·界面');
  const scope = 'document.querySelector("[data-settings-section=backup]:not(.leaving)")';
  await h.section('备份与恢复');
  await h.wait(`${scope}?.textContent.includes('个文件，约')`);
  await h.check(
    '备份页显示包含图库开关和估算大小',
    `!!${scope}?.querySelector('[role=switch][aria-label="包含图库"]') && ${scope}.textContent.includes('不包含时只有约')`,
  );
  const file = path.join(mode.root, 'ui-backup.npsbackup');
  doubles.saves.push({ canceled: false, filePath: file });
  await h.click('导出备份…', scope);
  await h.wait(`${scope}?.textContent.includes('已导出')`);
  await h.check(
    '界面导出成功横幅对应实际备份文件',
    async () =>
      (await fs.stat(file)).size > 0 &&
      (await h.evaluate(`${scope}?.textContent.includes('已导出')`)),
  );
  const id = 'backup-ui-after-export';
  database.createCollection({ id, name: 'Synthetic after backup', kind: 'manual' });
  const count = database.backup.counts().images;
  const pick = async () => {
    doubles.selections.push({ canceled: false, filePaths: [file] });
    await h.click('选择备份文件…', scope);
    await h.wait(`${scope}?.textContent.includes('用这个备份替换现在的数据')`);
  };
  const reloadBy = async (action) => {
    const loaded = once(h.window.webContents, 'did-finish-load');
    await action();
    await loaded;
    await h.wait(`!!${scope}`);
  };
  await pick();
  await h.check(
    '备份卡片显示版本、图片数量且不含图库',
    `${scope}.textContent.includes(${JSON.stringify('来自 ' + app.getVersion() + ' 版')}) && ${scope}.textContent.includes('${count.toLocaleString('en-US')} 张图片') && ${scope}.textContent.includes('不含图库')`,
  );
  await reloadBy(() => h.click('用这个备份替换现在的数据', scope));
  await h.wait(`${scope}?.textContent.includes('撤回这次恢复')`);
  await h.check(
    '恢复重载后停在备份页，显示恢复横幅且替换数据',
    async () =>
      !database.listCollections().some((c) => c.id === id) &&
      (await h.evaluate(
        `${scope}.textContent.includes('已恢复') && ${scope}.textContent.includes('撤回这次恢复')`,
      )),
  );
  await h.screenshot('backup-restored');
  await h.click('撤回这次恢复', scope);
  await reloadBy(() => h.click('撤回', 'document.querySelector("[role=dialog]:not(.leaving)")'));
  await h.check(
    '确认撤回后重载恢复修改数据且横幅消失',
    async () =>
      database.listCollections().some((c) => c.id === id) &&
      (await h.evaluate(
        `!${scope}.textContent.includes('撤回这次恢复') && !${scope}.textContent.includes('已恢复')`,
      )),
  );
  // Remove only a synthetic image inside this acceptance profile; preserve it for later scenes.
  const fixture = database.listCollections().find((c) => c.name === 'folder-command-fixture');
  const image = fixture && database.loadProject(fixture.member_ids[0]);
  if (!image || !path.resolve(image.image_path).startsWith(path.resolve(mode.root) + path.sep))
    throw Error('Missing isolated synthetic backup fixture');
  const bytes = await fs.readFile(image.image_path);
  await fs.unlink(image.image_path);
  try {
    await pick();
    await reloadBy(() => h.click('用这个备份替换现在的数据', scope));
    await h.click('图片库', 'document.querySelector(".tb")');
    await h.click(
      'folder-command-fixture',
      'document.querySelector(\'[aria-label="图片库导航"]\')',
    );
    await h.click('视图');
    await selectGalleryGrouping(h, '不合并');
    await h.key('Escape');
    await h.wait(`!!document.querySelector('[data-image-id="${image.id}"] .lmissing')`);
    await h.check(
      '无图库备份恢复后缺失图片卡片显示图片缺失',
      `document.querySelector('[data-image-id="${image.id}"] .lmissing')?.textContent.includes('图片缺失')`,
    );
    await h.screenshot('backup-missing-image');
    await h.section('备份与恢复');
    await h.click('撤回这次恢复', scope);
    await reloadBy(() => h.click('撤回', 'document.querySelector("[role=dialog]:not(.leaving)")'));
  } finally {
    await fs.writeFile(image.image_path, bytes);
    database.deleteCollection(id);
  }
}
