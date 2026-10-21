import path from 'node:path';
import { clipboard } from 'electron';
import { formatPositivePromptForCopy, getPromptScopes } from '../../src/lib/promptStructure.js';
export async function libraryCopyChecks(env) {
  const { h, database, files, mode, doubles } = env;
  const { evaluate: e, wait, click, input, check } = h;
  const copyButton = `document.querySelector('.prompt-in [aria-label="其他复制方式"]')`;
  h.category('图片库·复制');
  if (mode.category === '图片库·复制') {
    // Exercise the resident legacy menu across Activity hide/show, matching the
    // full suite's existing Workbench tabs rather than only an empty first open.
    await click('工作台', 'document.querySelector(".tb")');
    doubles.selections.push({ canceled: false, filePaths: [files[0]] });
    await click('打开图片', 'document.querySelector(".tb")');
    await wait('document.querySelectorAll(".tabs [data-tab]").length===1', '准备已有工作台标签页');
  }
  const refresh = async () => {
    await h.reload();
    await wait('!!document.querySelector(".tb")');
    await click('图片库', 'document.querySelector(".tb")');
    await click('全部图片', 'document.querySelector(".libp")');
    await wait('document.querySelectorAll(".card").length>0');
  };
  await click('图片库', 'document.querySelector(".tb")');
  await click('视图', 'document.querySelector(".libp")');
  await click('不合并', 'document.querySelector("[role=radiogroup][aria-label=合并方式]")');
  await h.key('Escape');
  const selectCard = async () => {
    await e('document.querySelector(".card").click()');
  };
  const waitDetail = async () =>
    wait(
      '!!document.querySelector(".col.detail[data-detail-id]") && document.querySelector(".card.on")?.dataset.groupId === "project:" + document.querySelector(".col.detail").dataset.detailId',
    );
  const originalTrash = database
    .loadLibrary('trash')
    .filter((p) => files.some((file) => path.basename(file, '.png') === p.name))
    .map((p) => p.id);
  if (originalTrash.length) {
    database.updateProjects(originalTrash, { deleted: false });
    await refresh();
  }
  const originals = database
    .loadLibrary('all')
    .filter((p) => files.some((file) => path.basename(file, '.png') === p.name));
  let copied = 0;
  for (const record of originals) {
    await input('.gallery-search input', record.name);
    await wait(
      `document.querySelectorAll('.card').length===1 && document.querySelector('.card')?.dataset.groupId===${JSON.stringify('project:' + record.id)}`,
      '搜索结果已切换到目标图片',
    );
    await selectCard(0);
    await waitDetail();
    await click('复制提示词', 'document.querySelector(".detail .bar")');
    await h.until(
      async () =>
        clipboard.readText() === formatPositivePromptForCopy(record) &&
        clipboard.readText().replaceAll('\r\n', '\n') ===
          formatPositivePromptForCopy(record).replaceAll('\r\n', '\n'),
      '复制完整正面提示词',
    );
    const libraryText = clipboard.readText();
    clipboard.clear();
    await click('在工作台打开', 'document.querySelector(".detail .bar")');
    await wait(
      'document.querySelector(".tb [aria-current=page]")?.textContent.trim()==="工作台"',
      '工作台成为当前页面',
    );
    await wait(
      `(() => {
          const page = document.querySelector('.wb-body');
          const button = ${copyButton};
          const surface = page?.closest('.app-page-surface');
          return page?.dataset.projectId === ${JSON.stringify(record.id)} &&
            !!button?.getClientRects().length && !button.disabled &&
            button.getAttribute('aria-disabled') !== 'true' &&
            (!surface || Number(getComputedStyle(surface).opacity) === 1);
        })()`,
      '目标图片在工作台加载完成，复制菜单可操作',
    );
    await e(
      `(() => { const button = ${copyButton}; button.focus(); button.click(); })()`,
      '打开提示词复制菜单',
    );
    await wait(
      `!![...document.querySelectorAll('[role=menuitem]')].find(item=>item.getClientRects().length && item.getAttribute('aria-disabled') !== 'true' && item.textContent.startsWith('复制全部提示词'))`,
      '复制菜单显示可用的“复制全部提示词”',
    );
    await e(
      `[...document.querySelectorAll('[role=menuitem]')].find(item=>item.textContent.startsWith('复制全部提示词')).click()`,
    );
    await h.until(async () => clipboard.readText() === libraryText, '工作台实际复制结果逐字一致');
    const negative = getPromptScopes(record).filter(
      (s) => s.polarity === 'undesired' && s.raw_prompt,
    );
    if (negative.length) {
      await click('其他复制方式');
      await click('复制负面提示词');
      await h.until(
        () => clipboard.readText() === negative.map((s) => s.raw_prompt).join('\n'),
        '工作台复制负面原文',
      );
    }
    await click('图片库', 'document.querySelector(".tb")');
    await waitDetail();
    copied++;
  }
  await check(
    '每张演示图正面复制与工作台一致、负面提示词与原文一致',
    () => copied === originals.length && copied === files.length,
    undefined,
    'once',
  );
  if (originalTrash.length) {
    database.updateProjects(originalTrash, { deleted: true });
    await refresh();
  }
}
