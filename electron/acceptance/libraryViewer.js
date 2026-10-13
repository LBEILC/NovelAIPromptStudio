import { parsePrompt } from '../../src/lib/prompt.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';

export async function libraryViewerChecks({ h, database }) {
  h.category('图片库·大图顺序');
  const source = database.loadLibrary()[0];
  const ids = Array.from({ length: 5 }, (_, i) => `viewer-fixture-${i}`);
  ids.forEach((id, index) => {
    const metadata = {
      ...source.metadata,
      prompt_raw: `geometric shape, ${index === 0 ? 'circle' : index === 4 ? 'square' : 'triangle'}`,
    };
    database.insertProject({
      ...source,
      id,
      content_hash: id,
      name: id,
      metadata,
      created_at: new Date(Date.UTC(2030, 0, 5 - index)).toISOString(),
      tags: parsePrompt(metadata.prompt_raw),
      prompt_structure: createPromptStructure(metadata),
    });
  });
  const viewer = 'document.querySelector(".library-viewer")';
  const at = (id) => `${viewer}?.dataset.viewerProjectId===${JSON.stringify(id)}`;
  const move = async (key, index, label) => {
    await h.key(key, {}, viewer);
    await h.wait(at(ids[index]), label);
    await h.check(label, at(ids[index]), undefined, 'once');
  };
  try {
    await h.reload();
    await h.click('图片库', 'document.querySelector(".studio-titlebar")');
    await h.click('全部图片', 'document.querySelector(".library-page")');
    await h.input('input[aria-label="搜索图片库"]', 'viewer-fixture');
    await h.click('视图');
    await h.select('图片排序', '最近导入的在前');
    await h.click('完全相同', 'document.querySelector("[role=radiogroup][aria-label=合并方式]")');
    await h.key('Escape');
    await h.wait(
      '!document.querySelector("[data-library-updating=true]") && document.querySelectorAll(".library-card").length===3',
    );
    await h.evaluate('document.querySelector(".library-card").click()');
    await h.key(' ', {}, 'document.querySelector("[data-library-grid]")');
    await h.wait(at(ids[0]));
    await h.check(
      '大图第一张禁用上一张并说明已到头',
      'document.querySelector(".library-viewer-prev").getAttribute("aria-disabled")==="true" && document.querySelector(".library-viewer-prev").dataset.tip==="已经是第一张"',
      undefined,
      'once',
    );
    for (let i = 1; i < 5; i++) await move('ArrowRight', i, `右键按完整顺序到第 ${i + 1} 张`);
    await move('ArrowRight', 4, '最后一张继续向右不循环');
    await h.check(
      '末尾禁用下一张并说明已到头',
      'document.querySelector(".library-viewer-next").getAttribute("aria-disabled")==="true" && document.querySelector(".library-viewer-next").dataset.tip==="已经是最后一张"',
      undefined,
      'once',
    );
    await move('ArrowLeft', 3, '向左进入一摞落在最后一张');
    await h.check(
      '大图显示当前摞内序号和三个成员缩略图',
      'document.querySelector(".library-viewer-top").textContent.includes("3 / 3") && document.querySelectorAll(".library-viewer .library-strip button").length===3',
      undefined,
      'both',
    );
    await move('ArrowDown', 4, '向下跳到下一组封面');
    await move('ArrowUp', 1, '向上跳到上一组封面');
    await move('ArrowUp', 0, '一摞内向上跳到前一单张');
    await move('ArrowLeft', 0, '第一张继续向左不循环');
    await h.click('下一张', viewer);
    await h.wait(at(ids[1]));
    await h.evaluate(
      'document.querySelectorAll(".library-viewer .library-strip button")[1].click()',
    );
    await h.wait(at(ids[2]));
    await h.check('底部缩略图直接选择当前摞的成员', at(ids[2]), undefined, 'once');
    await h.click('上一张', viewer);
    await h.wait(at(ids[1]));
    await h.check('两侧按钮使用同一完整顺序', at(ids[1]), undefined, 'once');
    await h.key('Escape', {}, viewer);
  } finally {
    for (const id of ids) database.deleteProject(id);
    await h.reload();
  }
}
