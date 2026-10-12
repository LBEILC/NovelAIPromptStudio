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
  const panel = 'document.querySelector(".nps-popover:popover-open")';
  const input = 'input[aria-label="包含 Tag"]';
  const chips = `document.querySelectorAll('.library-filter-tag-row:first-child .library-chip')`;
  try {
    await h.reload();
    await h.click('图片库', 'document.querySelector(".studio-titlebar")');
    await h.click('全部图片', 'document.querySelector(".library-page")');
    await h.click('筛选');
    await h.check(
      '未选两个包含 Tag 时隐藏包含方式',
      '!document.querySelector("[role=radiogroup][aria-label=包含方式]")',
      undefined,
      'once',
    );
    await h.evaluate(
      `Promise.all(document.querySelector('.nps-popover:popover-open').getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})))`,
    );
    const modelTop = await h.evaluate(
      `([...document.querySelectorAll('.library-filter-row')].find(row=>row.firstElementChild.textContent==='模型')).getBoundingClientRect().top`,
    );
    await h.input(input, 'z');
    await h.wait('document.querySelectorAll(".nps-suggestions [role=option]").length>=4');
    await h.check(
      'Tag 候选按开头、词开头、中间匹配排序，并显示图库图片数',
      `(()=>{const rows=[...document.querySelectorAll('.nps-suggestions [role=option]')];return rows[0].querySelector('.nps-mono').textContent==='zeta_circle' && rows[0].querySelector('.nps-menu-trailing').textContent==='3' && rows[1].querySelector('.nps-mono').textContent==='zeta_square' && rows.findIndex(row=>row.querySelector('.nps-mono').textContent==='round zeta')<rows.findIndex(row=>row.querySelector('.nps-mono').textContent==='azure')})()`,
      undefined,
      'once',
    );
    await h.check(
      '候选浮层不推挤模型行，Tag 使用等宽字体',
      `(()=>{const row=[...document.querySelectorAll('.library-filter-row')].find(row=>row.firstElementChild.textContent==='模型');return Math.abs(row.getBoundingClientRect().top-${modelTop})<1 && getComputedStyle(document.querySelector('.nps-suggestions .nps-mono')).fontFamily.includes('Mono')})()`,
      `(()=>{const row=[...document.querySelectorAll('.library-filter-row')].find(row=>row.firstElementChild.textContent==='模型');return {before:${modelTop},after:row.getBoundingClientRect().top,font:getComputedStyle(document.querySelector('.nps-suggestions .nps-mono')).fontFamily}})()`,
      'both',
    );
    await h.screenshot('library-tag-candidates');
    const second = await h.evaluate(
      'document.querySelectorAll(".nps-suggestions .nps-mono")[1].textContent',
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
      'document.querySelector(".nps-suggestions .nps-mono")?.textContent==="zeta_circle"',
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
      `[...document.querySelectorAll('.nps-suggestions .nps-mono')].every(node=>!['zeta_circle','zeta_square'].includes(node.textContent))`,
      undefined,
      'once',
    );
    await h.input(input, 'unmatched_synthetic_filter');
    await h.wait(
      'document.querySelector(".nps-suggestions [role=status]")?.textContent==="图片库里没有带这个 Tag 的图片"',
    );
    await h.key('Enter');
    await h.check('无匹配时回车不创建任意筛选条件', `${chips}.length===2`, undefined, 'once');
    await h.nativeKey('Escape');
    await h.wait('!document.querySelector(".nps-menu:popover-open .nps-suggestions")');
    await h.check('Esc 只收起候选，筛选面板保留', `!!${panel}`, undefined, 'once');
    await h.input(input, '');
    await h.key('Backspace');
    await h.wait(`${chips}.length===1`);
    await h.check(
      '空输入退格移除最后一个 Tag 并隐藏包含方式',
      '!document.querySelector("[role=radiogroup][aria-label=包含方式]") && !document.querySelector(".library-filter-tag-row:first-child").textContent.includes("zeta_circle")',
      undefined,
      'once',
    );
    await h.input(input, 'zeta_circle');
    await h.key('Enter', { isComposing: true });
    await h.check('输入法组字中的回车不加入候选', `${chips}.length===1`, undefined, 'once');
    await h.input('input[aria-label="排除 Tag"]', 'zeta_circle');
    await h.wait(
      'document.querySelector(".nps-suggestions .nps-mono")?.textContent==="zeta_circle"',
    );
    await h.key('Enter');
    await h.check(
      '排除 Tag 复用相同候选组件',
      'document.querySelectorAll(".library-filter-tag-row")[1].querySelector(".library-chip").textContent.includes("zeta_circle")',
      undefined,
      'once',
    );
    await h.key('Escape');
    await h.click('清除', 'document.querySelector(".library-chips")');
  } finally {
    for (const id of ids) database.deleteProject(id);
    await h.reload();
  }
}
