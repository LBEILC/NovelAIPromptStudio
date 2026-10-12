import path from 'node:path';
import { clipboard } from 'electron';
import { formatPositivePromptForCopy, getPromptScopes } from '../../src/lib/promptStructure.js';
export async function libraryCopyChecks(env) {
  const { h, database, files, mode, doubles } = env;
  const { evaluate: e, wait, click, input, check } = h;
  const copyButton = `document.querySelector('.wb-copy-bar [aria-label="其他复制方式"]')`;
  h.category('图片库·复制');
  if (mode.category === '图片库·复制') {
    // Exercise the resident legacy menu across Activity hide/show, matching the
    // full suite's existing Workbench tabs rather than only an empty first open.
    await click('工作台', 'document.querySelector(".studio-titlebar")');
    doubles.selections.push({ canceled: false, filePaths: [files[0]] });
    await click('打开图片', 'document.querySelector(".workbench-page")');
    await wait('document.querySelectorAll(".workbench-tab").length===1', '准备已有工作台标签');
  }
  const refresh = async () => {
    await h.reload();
    await wait('!!document.querySelector(".studio-titlebar")');
    await click('图片库', 'document.querySelector(".studio-titlebar")');
    await click('全部图片', 'document.querySelector(".library-page")');
    await wait('document.querySelectorAll(".library-card").length>0');
  };
  await click('图片库', 'document.querySelector(".studio-titlebar")');
  await click('视图', 'document.querySelector(".library-page")');
  await click('不合并', 'document.querySelector("[role=radiogroup][aria-label=合并方式]")');
  await h.key('Escape');
  const selectCard = async () => {
    await e('document.querySelector(".library-card").click()');
  };
  const waitDetail = async () =>
    wait(
      '!!document.querySelector(".library-detail[data-detail-id]") && document.querySelector(".library-card.current")?.dataset.projectId === document.querySelector(".library-detail").dataset.detailId',
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
  await e(
    `(()=>{const write=navigator.clipboard.writeText.bind(navigator.clipboard);window.__libraryCopy='';navigator.clipboard.writeText=async text=>{window.__libraryCopy=text;return write(text)}})()`,
  );
  for (const record of originals) {
    await input('.gallery-search input', record.name);
    await wait(
      `document.querySelectorAll('.library-card').length===1 && document.querySelector('.library-card')?.dataset.projectId===${JSON.stringify(record.id)}`,
      '搜索结果已切换到目标图片',
    );
    await selectCard(0);
    await waitDetail();
    await click('复制 Prompt', 'document.querySelector(".library-detail-bar")');
    await h.until(
      async () =>
        (await e('window.__libraryCopy')) === formatPositivePromptForCopy(record) &&
        clipboard.readText().replaceAll('\r\n', '\n') ===
          formatPositivePromptForCopy(record).replaceAll('\r\n', '\n'),
      '复制完整正向 Prompt',
    );
    const libraryText = await e('window.__libraryCopy');
    await e('window.__libraryCopy=null');
    await click('在工作台打开', 'document.querySelector(".library-detail-bar")');
    await wait(
      'document.querySelector(".studio-titlebar [aria-current=page]")?.textContent.trim()==="工作台"',
      '工作台成为当前页面',
    );
    await wait(
      `(() => {
          const page = document.querySelector('.workbench-active-page');
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
      '打开 Prompt 复制菜单',
    );
    await wait(
      `!![...document.querySelectorAll('[role=menuitem]')].find(item=>item.getClientRects().length && item.getAttribute('aria-disabled') !== 'true' && item.textContent.startsWith('复制全部 Prompt'))`,
      '复制菜单显示可用的“复制全部 Prompt”',
    );
    await e(
      `[...document.querySelectorAll('[role=menuitem]')].find(item=>item.textContent.startsWith('复制全部 Prompt')).click()`,
    );
    await h.until(
      async () => (await e('window.__libraryCopy')) === libraryText,
      '工作台实际复制结果逐字一致',
    );
    await click('图片库', 'document.querySelector(".studio-titlebar")');
    await waitDetail();
    const negative = getPromptScopes(record).filter(
      (s) => s.polarity === 'undesired' && s.raw_prompt,
    );
    for (let index = 0; index < negative.length; index++) {
      await e(`document.querySelectorAll('.library-doc details .nps-button')[${index}].click()`);
      await h.until(
        async () =>
          (await e('window.__libraryCopy')) === negative[index].raw_prompt &&
          clipboard.readText().replaceAll('\r\n', '\n') ===
            negative[index].raw_prompt.replaceAll('\r\n', '\n'),
        '复制原始排除内容',
      );
    }
    copied++;
  }
  await check(
    '每张演示图正向复制与工作台一致、排除内容与原文一致',
    () => copied === originals.length && copied === files.length,
    undefined,
    'once',
  );
  if (originalTrash.length) {
    database.updateProjects(originalTrash, { deleted: true });
    await refresh();
  }
}
