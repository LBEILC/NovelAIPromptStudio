/** Additional library behaviors run with both motion settings and both themes. */
import { filterGalleryProjects, galleryFilterOptions } from '../../src/lib/galleryFilters.js';
export async function extraLibraryChecks({
  h,
  database,
  doubles,
  reduced,
  selectCard,
  waitDetail,
  all,
  settled,
  click,
  input,
}) {
  const { evaluate: e, wait, key, check } = h;
  const scope = 'document.querySelector(".library-page")';
  const side = 'document.querySelector(".library-side")';
  const dialog = 'document.querySelector("dialog[open]")';
  const bar = 'document.querySelector(".library-selection-bar")';
  const grid = 'document.querySelector("[data-library-grid]")';
  const mod = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  await all();
  await click('筛选', scope);
  const projects = database.loadLibrary('all');
  const options = galleryFilterOptions(projects).tags;
  const common = options.find((option) => option.value === '1girl');
  const other = options.find(
    (option) =>
      option.value !== common.value &&
      option.count < common.count &&
      filterGalleryProjects(projects, { includeTags: [common.value, option.value] }).length > 0,
  );
  if (!other) throw Error('包含方式验收需要两个不同覆盖范围的真实 Tag');
  const includeTags = [common.value, other.value];
  for (const tag of includeTags) {
    await input('input[aria-label="包含 Tag"]', tag);
    await key('Enter');
    await settled();
  }
  await check(
    '全部都有要求同时命中全部包含 Tag',
    `document.querySelector('.library-count')?.textContent.trim().endsWith('${filterGalleryProjects(projects, { includeTags, tagMatch: 'all' }).length} 张')===true`,
    undefined,
    'once',
  );
  await click('有任意一个');
  await check(
    '有任意一个接受任一包含 Tag',
    `document.querySelector('.library-count')?.textContent.trim().endsWith('${filterGalleryProjects(projects, { includeTags, tagMatch: 'any' }).length} 张')===true`,
    undefined,
    'once',
  );
  await key('Escape');
  await click('清除', scope);
  await click('新建收藏集', side);
  await input('input[aria-label="收藏集名称"]', `012多选${reduced}`);
  await click('新建', dialog);
  await wait('!document.querySelector("dialog[open]")');
  const collection = database.listCollections().find((c) => c.name === `012多选${reduced}`);
  await check(
    '侧栏新建普通收藏集并进入空集合',
    () => !!collection && collection.member_ids.length === 0,
    undefined,
    'once',
  );
  await all();
  await selectCard(0, { ctrlKey: true });
  await selectCard(1, { ctrlKey: true });
  const selected = await e(
    '[...document.querySelectorAll(".library-card.picked")].map(c=>c.dataset.projectId)',
  );
  await click('加入收藏集', bar);
  await click(collection.name, 'document.querySelector(".nps-popover:popover-open")');
  await h.until(
    () =>
      selected.every((id) =>
        database
          .listCollections()
          .find((c) => c.id === collection.id)
          .member_ids.includes(id),
      ),
    '多选加入收藏集',
  );
  await check(
    '多选操作条将所选图片加入收藏集',
    () =>
      selected.length === 2 &&
      selected.every((id) =>
        database
          .listCollections()
          .find((c) => c.id === collection.id)
          .member_ids.includes(id),
      ),
    undefined,
    'once',
  );
  await key('Escape');
  await click(collection.name, side);
  await wait(
    `document.querySelectorAll('.library-card').length===2 && [...document.querySelectorAll('.library-card')].every(card=>${JSON.stringify(selected)}.includes(card.dataset.projectId))`,
    '普通收藏集成员已加载',
  );
  await check(
    '切换普通收藏集只显示成员，侧栏数量准确',
    `(()=>{const cards=[...document.querySelectorAll('.library-card')];return cards.length===2&&cards.every(c=>${JSON.stringify(selected)}.includes(c.dataset.projectId))&&document.querySelector('[data-collection-id="${collection.id}"] span').textContent==='2'})()`,
    undefined,
    'once',
  );
  await check(
    '普通收藏集管理移至网格上方，侧栏不展开按钮',
    'document.querySelector(".library-collection-row").textContent.includes("手动整理，从详情栏或多选条加入图片") && !document.querySelector(".library-side .library-collection-actions")',
    undefined,
    'both',
  );
  await click('重命名', 'document.querySelector(".library-collection-row")');
  await input('input[aria-label="收藏集名称"]', `012多选改名${reduced}`);
  await click('重命名', dialog);
  await wait('!document.querySelector("dialog[open]")');
  await check(
    '普通收藏集重命名持久化',
    () =>
      database.listCollections().find((c) => c.id === collection.id).name ===
      `012多选改名${reduced}`,
    undefined,
    'once',
  );
  await key('a', mod, grid);
  await click('移出这个收藏集', bar);
  await wait('!!document.querySelector(".library-empty")');
  await check(
    '多选移出收藏集保留原图片',
    () =>
      database.listCollections().find((c) => c.id === collection.id).member_ids.length === 0 &&
      selected.every((id) => !!database.loadProject(id)),
    undefined,
    'once',
  );
  await click('删除收藏集', 'document.querySelector(".library-collection-row")');
  await click('取消', dialog);
  await check(
    '取消删除收藏集保留集合',
    () => database.listCollections().some((c) => c.id === collection.id),
    undefined,
    'once',
  );
  await click('删除收藏集', 'document.querySelector(".library-collection-row")');
  await click('删除收藏集', dialog);
  await wait('!document.querySelector("dialog[open]")');
  await h.until(
    () => !database.listCollections().some((item) => item.id === collection.id),
    '普通收藏集删除已写入数据库',
  );
  await check(
    '普通收藏集删除不删除图片',
    () =>
      !database.listCollections().some((c) => c.id === collection.id) &&
      selected.every((id) => !!database.loadProject(id)),
    undefined,
    'once',
  );
  await all();
  await selectCard(0);
  await waitDetail();
  const id = await e('document.querySelector(".library-detail").dataset.detailId');
  const original = database.loadProject(id).name;
  await click('重命名', 'document.querySelector(".library-detail-actions")');
  await input('input[aria-label="图片名称"]', original + ' 012');
  await click('起名', dialog);
  await h.until(() => database.loadProject(id).name === original + ' 012', '图片重命名');
  await waitDetail();
  await check(
    '图片重命名同步到数据库和详情',
    () => database.loadProject(id).name === original + ' 012',
    undefined,
    'once',
  );
  const calls = doubles.calls.length;
  await click('在文件夹中显示', 'document.querySelector(".library-detail-actions")');
  await h.until(() => doubles.calls.length > calls, '显示文件');
  await check(
    '在文件夹中显示指向图库副本',
    () =>
      doubles.calls
        .slice(calls)
        .some(
          (c) => c.kind === 'showItemInFolder' && c.value === database.loadProject(id).image_path,
        ),
    undefined,
    'once',
  );
  await click('重命名', 'document.querySelector(".library-detail-actions")');
  await input('input[aria-label="图片名称"]', original);
  await click('起名', dialog);
  await h.until(() => database.loadProject(id).name === original, '恢复测试名称');
  await selectCard(0, { ctrlKey: true });
  await selectCard(1, { ctrlKey: true });
  const trashed = await e(
    '[...document.querySelectorAll(".library-card.picked")].map(c=>c.dataset.projectId)',
  );
  await click('移入回收站', bar);
  await h.until(() => trashed.every((id) => database.loadProject(id).deleted_at), '多选移入');
  await check(
    '多选操作条批量移入回收站',
    () => trashed.length === 2 && trashed.every((id) => !!database.loadProject(id).deleted_at),
    undefined,
    'once',
  );
  await h.checkSoon(
    '多张回收通知使用数量文案',
    'document.querySelector(".nps-notifications").textContent.includes("已把 2 张图片移入回收站")',
    undefined,
    undefined,
    undefined,
    'once',
  );
  await click('回收站', side);
  // Select only the two new trash records; leave pre-existing trash untouched.
  for (const id of trashed)
    await e(
      `document.querySelector('.library-card[data-project-id="${id}"]').dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}))`,
    );
  await click('恢复', bar);
  await h.until(() => trashed.every((id) => !database.loadProject(id).deleted_at), '多选恢复');
  await check(
    '回收站多选操作条批量恢复',
    () => trashed.every((id) => !database.loadProject(id).deleted_at),
    undefined,
    'once',
  );
  await all();
  await selectCard(0);
  await waitDetail();
  await key(' ', {}, grid);
  await wait('!!document.querySelector(".library-viewer")');
  const viewer = 'document.querySelector(".library-viewer")';
  await click('下一张', viewer);
  const next = await e('document.querySelector(".library-viewer-top b").textContent');
  await click('上一张', viewer);
  await check(
    '大图上一张和下一张按钮切换图片',
    'document.querySelector(".library-viewer-top b").textContent!==' + JSON.stringify(next),
    undefined,
    'once',
  );
  await click('在工作台打开', viewer);
  await wait(
    'document.querySelector(".studio-titlebar [aria-current=page]")?.textContent.trim()==="工作台"',
  );
  await check(
    '大图在工作台打开并关闭覆盖层',
    '!document.querySelector(".library-viewer")',
    undefined,
    'once',
  );
  await click('图片库', 'document.querySelector(".studio-titlebar")');
  await key('k', mod, scope);
  await check(
    'Mod+K 聚焦图片库搜索',
    'document.activeElement.matches(".gallery-search input")',
    undefined,
    'once',
  );
}
