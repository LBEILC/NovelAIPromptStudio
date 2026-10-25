import path from 'node:path';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { backupUIChecks } from './backupUI.js';

export async function backupChecks({ h, mode, doubles, commandHandlers, database, app }) {
  h.category('备份');
  const folder = path.join(mode.root, 'folder-command-fixture');
  await fs.mkdir(folder, { recursive: true });
  await sharp({ create: { width: 16, height: 16, channels: 3, background: '#123456' } })
    .png()
    .toFile(path.join(folder, 'synthetic.png'));
  await h.check('文件夹命令扫描并导入到对应收藏集', async () => {
    const scan = await commandHandlers['import.folder.scan'](
      { path: folder },
      { sender: h.window.webContents },
    );
    if (!scan.ok) throw Error(scan.error);
    const result = await commandHandlers['import.folder.commit'](
      {
        sessionId: scan.sessionId,
        folderIds: scan.folders.map((f) => f.id),
        skipNoMetadata: false,
      },
      { sender: h.window.webContents },
    );
    return (
      result.ok &&
      result.imported === 1 &&
      database
        .listCollections()
        .some((c) => c.name === 'folder-command-fixture' && c.member_ids.length === 1)
    );
  });
  const id = 'acceptance-backup-collection';
  database.createCollection({ id, name: 'Backup original', kind: 'manual' });
  const file = path.join(mode.root, 'command-backup.npsbackup');
  doubles.saves.push({ canceled: false, filePath: file });
  await h.check('命令导出不含图库的备份并检查清单', async () => {
    const result = await commandHandlers['backup.export'](
      { includeLibrary: false },
      { sender: h.window.webContents },
    );
    const info = await commandHandlers['backup.inspect']({ path: file }, {});
    return result.ok && result.bytes > 0 && info.ok && info.compatible && !info.includesLibrary;
  });
  database.updateCollection(id, { name: 'Backup changed' });
  await h.check('恢复替换数据并重新加载窗口', async () => {
    const loaded = once(h.window.webContents, 'did-finish-load');
    const result = await commandHandlers['backup.restore']({ path: file }, {});
    if (!result.ok) throw Error(result.error);
    await loaded;
    return (
      database.listCollections().find((c) => c.id === id)?.name === 'Backup original' &&
      commandHandlers['backup.status']().lastRestore !== null
    );
  });
  await h.wait('!!window.studio && !!document.querySelector(".tb")');
  await h.check('撤回恢复后回到修改过的数据', async () => {
    const loaded = once(h.window.webContents, 'did-finish-load');
    const result = await commandHandlers['backup.undo']({}, {});
    if (!result.ok) throw Error(result.error);
    await loaded;
    return (
      database.listCollections().find((c) => c.id === id)?.name === 'Backup changed' &&
      commandHandlers['backup.status']().lastRestore === null
    );
  });
  await h.wait('!!window.studio && !!document.querySelector(".tb")');
  database.deleteCollection(id);
  await backupUIChecks({ h, mode, doubles, database, app });
}
