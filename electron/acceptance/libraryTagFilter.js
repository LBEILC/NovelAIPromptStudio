import { parsePrompt } from '../../src/lib/prompt.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';

export async function libraryTagFilterChecks({ h, database }) {
  h.category('图片库·Tag 候选');
  const source = database.loadLibrary()[0];
  const ids = ['filter-fixture-0', 'filter-fixture-1', 'filter-fixture-2'];
  ids.forEach((id, index) => {
    const metadata = {
      width: 832,
      height: 1216,
      model: 'nai-diffusion-4-5-full',
      prompt_raw: index < 2 ? 'zeta_circle, zeta_square, round zeta, azure' : 'zeta_circle, azure',
    };
    database.insertProject({
      ...source,
      id,
      name: id,
      content_hash: id,
      metadata,
      tags: parsePrompt(metadata.prompt_raw).map((tag) => ({
        ...tag,
        translation: tag.tag === 'zeta_circle' ? '测试圆形' : '',
      })),
      prompt_structure: createPromptStructure(metadata),
    });
  });
  const panel = 'document.querySelector(".popover:not(.leaving)")';
  const input = 'input[aria-label="包含的 Tag"]';
  const chips = `document.querySelectorAll('[data-tagin=inc] .mini-tag')`;
  try {
    await h.reload();
    await h.click('图片库', 'document.querySelector(".tb")');
    await h.click('全部图片', 'document.querySelector(".libp")');
    await h.click('筛选');
    await h.check(
      '未选两个包含的 Tag 时隐藏包含方式',
      '!document.querySelector("[role=radiogroup][aria-label=包含方式]")',
      undefined,
      'once',
    );
    await h.input(input, 'z');
    await h.wait('document.querySelectorAll(".complete:not(.leaving) .mi").length>=4');
    await h.check(
      'Tag 候选按开头、词开头、中间匹配排序',
      `(()=>{const rows=[...document.querySelectorAll('.complete:not(.leaving) .mi')];return rows[0].querySelector('.en').textContent==='zeta_circle' && rows[1].querySelector('.en').textContent==='zeta_square' && rows.findIndex(row=>row.querySelector('.en').textContent==='round zeta')<rows.findIndex(row=>row.querySelector('.en').textContent==='azure')})()`,
      undefined,
      'once',
    );

    await h.screenshot('library-tag-candidates');
    const second = await h.evaluate(
      'document.querySelectorAll(".complete:not(.leaving) .en")[1].textContent',
    );
    await h.key('ArrowDown');
    await h.key('Enter');
    await h.wait(`${chips}.length===1`);
    await h.check(
      '方向键加回车加入第二个候选而非输入片段',
      `${chips}[0].textContent.includes(${JSON.stringify(second)})`,
      undefined,
      'once',
    );
    await h.input(input, '测试圆');
    await h.wait(
      'document.querySelector(".complete:not(.leaving) .en")?.textContent==="zeta_circle"',
    );
    await h.nativeKey('Tab');
    await h.wait(`${chips}.length===2`);
    await h.check(
      '中文译文可匹配，Tab 加入候选，两个 Tag 时出现包含方式',
      '!!document.querySelector("[role=radiogroup][aria-label=包含方式]")',
      undefined,
      'once',
    );
    await h.input(input, 'zeta');
    await h.check(
      '已选 Tag 不再进入候选',
      `[...document.querySelectorAll('.complete:not(.leaving) .en')].every(node=>!['zeta_circle','zeta_square'].includes(node.textContent))`,
      undefined,
      'once',
    );
    await h.input(input, 'unmatched_synthetic_filter');
    await h.wait('!document.querySelector(".complete:not(.leaving)")');
    await h.key('Enter');
    await h.check('无匹配时回车不创建任意筛选条件', `${chips}.length===2`, undefined, 'once');
    await h.input(input, 'azure');
    await h.wait('!!document.querySelector(".complete:not(.leaving) .mi")');
    await h.nativeKey('Escape');
    await h.wait('!document.querySelector(".complete:not(.leaving)")');
    await h.check('Esc 只收起候选，筛选面板保留', `!!${panel}`, undefined, 'once');
    await h.input(input, '');
    await h.key('Backspace');
    await h.wait(`${chips}.length===1`);
    await h.check(
      '空输入退格移除最后一个 Tag 并隐藏包含方式',
      '!document.querySelector("[role=radiogroup][aria-label=包含方式]") && !document.querySelector("[data-tagin=inc]").textContent.includes("zeta_circle")',
      undefined,
      'once',
    );
    await h.input(input, 'zeta_circle');
    await h.key('Enter', { isComposing: true });
    await h.check('输入法组字中的回车不加入候选', `${chips}.length===1`, undefined, 'once');
    await h.input('input[aria-label="排除的 Tag"]', 'zeta_circle');
    await h.wait(
      'document.querySelector(".complete:not(.leaving) .en")?.textContent==="zeta_circle"',
    );
    await h.key('Enter');
    await h.check(
      '排除的 Tag 复用相同候选组件',
      'document.querySelector("[data-tagin=exc] .mini-tag").textContent.includes("zeta_circle")',
      undefined,
      'once',
    );
    await h.key('Escape');
    await h.click('清除', 'document.querySelector(".lchips")');
  } finally {
    for (const id of ids) database.deleteProject(id);
    await h.reload();
  }
}
