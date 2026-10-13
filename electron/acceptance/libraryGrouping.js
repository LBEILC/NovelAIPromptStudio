import { parsePrompt } from '../../src/lib/prompt.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';

export async function libraryGroupingChecks({ h, database }) {
  h.category('图片库·相似分组');
  const ids = ['similarity-fixture-a', 'similarity-fixture-b'];
  const source = database.loadLibrary()[0];
  for (const [index, id] of ids.entries()) {
    const metadata = {
      ...source.metadata,
      prompt_raw: `circle, square, triangle, line${index ? ', dot' : ''}`,
    };
    database.insertProject({
      ...source,
      id,
      content_hash: id,
      name: id,
      metadata,
      tags: parsePrompt(metadata.prompt_raw),
      prompt_structure: createPromptStructure(metadata),
    });
  }
  try {
    await h.reload();
    await h.click('图片库', 'document.querySelector(".studio-titlebar")');
    await h.click('全部图片', 'document.querySelector(".library-page")');
    await h.input('input[aria-label="搜索图片库"]', 'similarity-fixture');
    await h.click('视图');
    const options = 'document.querySelector("[role=radiogroup][aria-label=合并方式]")';
    await h.click('完全相同', options);
    await h.wait(
      '!document.querySelector("[data-library-updating=true]") && document.querySelectorAll(".library-card").length===2',
    );
    await h.evaluate(
      `window.__groupingErrors=[];window.__groupingEmpty=false;window.__groupingErrorListener=e=>window.__groupingErrors.push(e.message);window.addEventListener('error',window.__groupingErrorListener);window.__groupingObserver=new MutationObserver(()=>{if(!document.querySelector('.library-card'))window.__groupingEmpty=true});window.__groupingObserver.observe(document.querySelector('[data-library-grid]'),{childList:true,subtree:true})`,
    );
    await h.click('相似', options);
    await h.wait('!!document.querySelector("input[aria-label=相似度]")');
    await h.key('Home', {}, 'document.querySelector("input[aria-label=相似度]")');
    await h.wait(
      '!document.querySelector("[data-library-updating=true]") && document.querySelectorAll(".library-card").length===1',
    );
    await h.check(
      '相似分组选中、说明和滑块显示，低阈值合并两张',
      `document.querySelector('[role=radio][aria-checked=true]')?.textContent.includes('相似') && !!document.querySelector('input[aria-label=相似度]') && document.querySelector('.library-help')?.textContent.includes('足够接近') && document.querySelectorAll('.library-card').length===1`,
      undefined,
      'once',
    );
    await h.key('End', {}, 'document.querySelector("input[aria-label=相似度]")');
    await h.wait(
      '!document.querySelector("[data-library-updating=true]") && document.querySelectorAll(".library-card").length===2',
    );
    await h.check(
      '提高相似度拆分分组，切换过程中保留原分组且无未捕获错误',
      'document.querySelectorAll(".library-card").length===2 && !window.__groupingEmpty && window.__groupingErrors.length===0',
      undefined,
      'once',
    );
    await h.click('完全相同', options);
    await h.wait(
      '!document.querySelector("input[aria-label=相似度]") && !document.querySelector("[data-library-updating=true]")',
    );
    await h.check(
      '切回完全相同恢复精确分组',
      `document.querySelector('[role=radio][aria-checked=true]')?.textContent.includes('完全相同') && document.querySelectorAll('.library-card').length===2`,
      undefined,
      'once',
    );
    await h.key('Escape');
  } finally {
    await h.evaluate(
      `window.__groupingObserver?.disconnect();window.removeEventListener('error',window.__groupingErrorListener)`,
    );
    for (const id of ids) database.deleteProject(id);
    await h.reload();
  }
}
