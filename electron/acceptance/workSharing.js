import { selectGalleryGrouping } from './galleryView.js';
import path from 'node:path';
import fs from 'node:fs';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { importLibraryFiles } from '../importer.js';
import { isUnnamedImage } from '../../src/lib/imageNaming.js';

export async function workSharingChecks({ h, mode, database, preferences }) {
  h.category('作品共用');
  const invoke = (name, input = {}) =>
    h.evaluate(`(async () => {
    const result = await window.studio.invoke(${JSON.stringify(name)}, ${JSON.stringify(input)});
    if (!result.ok) throw Error(JSON.stringify(result.error));
    return result.data;
  })()`);
  // Match the full-suite state, where version UI is enabled by the local fake account.
  await invoke('account.save', { token: 'acceptance-token' });
  const files = await createWorkbenchFixtures(path.join(mode.root, 'shared-work-fixtures'), {
    prefix: 'synthetic-shared-060',
    sizes: [
      [64, 64],
      [64, 64],
      [64, 64],
    ],
    prompts: ['synthetic shared first', 'synthetic shared second', 'synthetic shared third'],
  });
  const imported = await importLibraryFiles({
    filePaths: files,
    database,
    assetsDirectory: preferences.librarySettings().assetsDirectory,
  });
  if (imported.errors.length || imported.imported.length !== 3) throw Error('共用作品夹具导入失败');
  const b = (await invoke('workbench.new', { name: 'Synthetic shared B' })).tab;
  let versionId = b.versionId;
  for (const image of imported.imported)
    versionId = database.versions.append({
      workId: b.workId,
      parentId: versionId,
      project: image,
      image,
      seed: 1,
      source: 'agent',
    }).id;
  const imageId = imported.imported[2].id;
  await invoke('workbench.open', { libraryId: imageId, workId: b.workId });
  await h.click('工作台', 'document.querySelector(".tb")');
  await h.wait(
    `document.querySelector('.wb-body')?.dataset.projectId===${JSON.stringify(imageId)} && !!document.querySelector('.stage [data-stage]')`,
    'B 第三版图片已显示',
  );
  await h.evaluate(
    `document.querySelector('.stage [data-stage]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:400,clientY:200}))`,
  );
  await h.click('作为新作品打开', 'document.querySelector("[role=menu]:not(.leaving *)")');
  await h.wait(
    `window.studio.invoke('workbench.list',{}).then(r=>r.data.activeTabId!==${JSON.stringify(b.id)})`,
    '从 B 创建新作品',
  );
  const tabs = await invoke('workbench.list');
  const a = (await invoke('workbench.get', { tabId: tabs.activeTabId })).tab;
  await h.check(
    '从 B 第三版打开的新作品尚未建立',
    () => !a.workSaved && database.versions.get(versionId).number === 3,
  );
  await h.click('工作台', 'document.querySelector(".tb")');
  await h.click('存为新作品', 'document.querySelector(".stage")');
  await h.wait(
    `window.studio.invoke('workbench.get',{tabId:${JSON.stringify(a.id)}}).then(r=>r.data.tab.workSaved)`,
    '新作品保存完成',
  );
  const saved = await invoke('workbench.get', { tabId: a.id });
  await invoke('workbench.close', { tabId: a.id });
  await h.check('保存后关闭标签页，原图同时属于 A 和 B', async () => {
    const card = (await database.loadLibraryCards()).find((p) => p.id === imageId);
    return (
      saved.tab.workSaved &&
      card.work_refs.some((r) => r.workId === a.workId && r.role === 'origin') &&
      card.work_refs.some((r) => r.workId === b.workId && r.role === 'version' && r.number === 3)
    );
  });
  await h.reload();
  await h.click('图片库', 'document.querySelector(".tb")');
  await h.click('全部图片', 'document.querySelector(".libp")');
  await h.input('[aria-label="搜索图片库"]', 'synthetic-shared-060');
  await h.click('视图', 'document.querySelector(".libp")');
  await selectGalleryGrouping(h, '按作品');
  await h.click('最新生成', 'document.querySelector("[aria-label=封面]")');
  await h.key('Escape');
  const selector = (id) => `[data-group-id="work:${id}"]`;
  await h.wait(
    `!!document.querySelector(${JSON.stringify(selector(a.workId))}) && !!document.querySelector(${JSON.stringify(selector(b.workId))})`,
    '图库显示两个作品组',
  );
  await h.check('按作品合并时同一张图片进入两组', async () => {
    const cards = await database.loadLibraryCards();
    const { groupGalleryProjects } = await import('../../src/lib/gallery.js');
    const groups = groupGalleryProjects(cards, { promptScope: 'work' });
    return [a.workId, b.workId].every((id) =>
      groups.find((g) => g.id === `work:${id}`)?.members.some((p) => p.id === imageId),
    );
  });
  await h.screenshot('060-shared-work-groups');
  const openGroup = async (workId) => {
    await h.click('图片库', 'document.querySelector(".tb")');
    await h.wait(`!!document.querySelector(${JSON.stringify(selector(workId))})`);
    await h.evaluate(
      `document.querySelector(${JSON.stringify(selector(workId))}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}))`,
    );
    await h.click('在工作台打开', 'document.querySelector("[role=menu]:not(.leaving *)")');
    await h.wait(
      `window.studio.invoke('workbench.list',{}).then(async r=>{
        const tab=(await window.studio.invoke('workbench.get',{tabId:r.data.activeTabId})).data.tab;
        return tab.workId===${JSON.stringify(workId)} &&
          document.querySelector('[data-tab="'+tab.id+'"]')?.getAttribute('aria-selected')==='true' &&
          document.querySelector('.wb-body')?.dataset.projectId===tab.project.id &&
          !document.querySelector('.app-page-surface.leaving');
      })`,
      '按组打开完成',
    );
    const list = await invoke('workbench.list');
    return (await invoke('workbench.get', { tabId: list.activeTabId })).tab;
  };
  const openedA = await openGroup(a.workId);
  const openedB = await openGroup(b.workId);
  await h.check(
    '分别按组打开定位 A 原图与 B 第三版同一张图',
    () =>
      openedA.workId === a.workId &&
      openedA.versionId === a.versionId &&
      openedB.workId === b.workId &&
      openedB.versionId === versionId &&
      openedB.versionImageId === imageId,
    () => ({
      expected: { a: a.workId, aVersion: a.versionId, b: b.workId, bVersion: versionId, imageId },
      openedA: {
        workId: openedA.workId,
        versionId: openedA.versionId,
        imageId: openedA.versionImageId,
      },
      openedB: {
        workId: openedB.workId,
        versionId: openedB.versionId,
        imageId: openedB.versionImageId,
      },
    }),
  );
  await h.click('图片库', 'document.querySelector(".tb")');
  await h.wait(`!!document.querySelector(${JSON.stringify(selector(a.workId))})`);
  await h.evaluate(
    `document.querySelector(${JSON.stringify(selector(a.workId))}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}))`,
  );
  await h.click('移入回收站', 'document.querySelector("[role=menu]:not(.leaving *)")');
  await h.click('只从这个作品里去掉', 'document.querySelector("[role=dialog]")');
  await h.wait(
    `window.studio.invoke('library.get',{id:${JSON.stringify(imageId)}}).then(r=>r.data.project.work_refs.length===1)`,
    'A 的引用已移除',
  );
  await h.check('只从 A 去掉原图，B 的第三版和图库记录保留', () => {
    const p = database.loadProject(imageId);
    return (
      database.versions.list(a.workId)[0].originState === 'removed' &&
      !p.deleted_at &&
      p.work_refs.length === 1 &&
      p.work_refs[0].workId === b.workId &&
      database.versions.get(versionId).images.some((i) => i.projectId === imageId && !i.deleted)
    );
  });
  await h.click('撤销');
  await h.wait(
    `window.studio.invoke('library.get',{id:${JSON.stringify(imageId)}}).then(r=>r.data.project.work_refs.length===2)`,
    '撤销恢复原图归属',
  );
  await h.check(
    '撤销后恢复 A 原图归属',
    () => database.loadProject(imageId).work_refs.length === 2,
  );
  const detachA = async () => {
    await h.click('全部图片', 'document.querySelector(".libp")');
    await h.wait(`!!document.querySelector(${JSON.stringify(selector(a.workId))})`);
    await h.evaluate(
      `document.querySelector(${JSON.stringify(selector(a.workId))}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}))`,
    );
    await h.click('移入回收站', 'document.querySelector("[role=menu]:not(.leaving *)")');
    await h.click('只从这个作品里去掉', 'document.querySelector("[role=dialog]")');
    await h.wait(
      `window.studio.invoke('trash.detached',{}).then(r=>r.data.items.some(x=>x.workId===${JSON.stringify(a.workId)}))`,
      '去掉记录已保存',
    );
    await h.click('回收站', 'document.querySelector(".libp")');
    const { items } = await invoke('trash.detached');
    const entry = items.find((r) => r.workId === a.workId);
    const card = `[...document.querySelectorAll('[data-group-id]')].find(e=>e.dataset.groupId===${JSON.stringify(`detached:${entry.undo}`)})`;
    await h.wait(`!!(${card})`, '回收站显示 A 的去掉记录');
    return card;
  };
  const firstCard = await detachA();
  await h.check('回收站命令返回 A 的原图记录及 B 的现有引用', async () => {
    const { items } = await invoke('trash.detached');
    const entry = items.find((r) => r.workId === a.workId);
    return (
      entry?.role === 'origin' &&
      entry.image.id === imageId &&
      entry.image.work_refs.some((r) => r.workId === b.workId)
    );
  });
  await h.screenshot('061-detached-in-trash');
  await h.evaluate(
    `(${firstCard}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}))`,
  );
  await h.click(
    // 没起名的作品不写名字（1.6.0）
    isUnnamedImage(openedA.displayName) ? '放回作品' : `放回「${openedA.displayName}」`,
    'document.querySelector("[role=menu]:not(.leaving *)")',
  );
  await h.wait(
    `window.studio.invoke('trash.detached',{}).then(r=>!r.data.items.some(x=>x.workId===${JSON.stringify(a.workId)}))`,
    '回收站放回完成',
  );
  await h.click('全部图片', 'document.querySelector(".libp")');
  await h.wait(
    `!!document.querySelector(${JSON.stringify(selector(a.workId))})`,
    '放回后 A 组重新出现',
  );
  await h.check(
    '从回收站放回后 A 与 B 都引用原图',
    () => database.loadProject(imageId).work_refs.length === 2,
  );
  const secondCard = await detachA();
  await h.evaluate(
    `(${secondCard}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}))`,
  );
  await h.click('不再恢复', 'document.querySelector("[role=menu]:not(.leaving *)")');
  await h.wait(
    `window.studio.invoke('trash.detached',{}).then(r=>!r.data.items.some(x=>x.workId===${JSON.stringify(a.workId)}))`,
    '不再恢复已丢掉记录',
  );
  await h.wait(`!(${secondCard})`, '丢掉记录后卡片消失');
  await h.check('丢掉记录后 B 第三版、图片和文件仍在', () => {
    const p = database.loadProject(imageId);
    return (
      !p.deleted_at &&
      p.work_refs.length === 1 &&
      p.work_refs[0].workId === b.workId &&
      database.versions.get(versionId).images.some((i) => i.projectId === imageId && !i.deleted) &&
      fs.existsSync(p.image_path) &&
      fs.existsSync(p.thumbnail_path)
    );
  });
  await h.screenshot('061-detached-discarded');
}
