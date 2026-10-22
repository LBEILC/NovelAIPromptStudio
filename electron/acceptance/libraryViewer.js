import { selectGalleryGrouping } from './galleryView.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaUrl } from '../../src/lib/imageStage.js';
import { parsePrompt } from '../../src/lib/prompt.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';

export async function libraryViewerChecks({ h, database, mode }) {
  h.category('图片库·大图顺序');
  const source = database.loadLibrary()[0];
  const ids = Array.from({ length: 5 }, (_, i) => `viewer-fixture-${i}`);
  for (const [index, id] of ids.entries()) {
    await fs.copyFile(source.image_path, path.join(mode.root, id + '.png'));
    const metadata = {
      ...source.metadata,
      prompt_raw: `geometric shape, ${index === 0 ? 'circle' : index === 4 ? 'square' : 'triangle'}`,
    };
    database.insertProject({
      ...source,
      id,
      content_hash: id,
      image_path: path.join(mode.root, id + '.png'),
      name: id,
      metadata,
      created_at: new Date(Date.UTC(2030, 0, 5 - index)).toISOString(),
      tags: parsePrompt(metadata.prompt_raw),
      prompt_structure: createPromptStructure(metadata),
    });
  }
  const viewer = 'document.querySelector(".viewer-ov")';
  const at = (id) =>
    `${viewer}?.querySelector(".vframe:not(.leaving) img")?.getAttribute("src")===${JSON.stringify(mediaUrl(path.join(mode.root, id + '.png')))}`;
  const move = async (key, index, label) => {
    await h.key(key, {}, viewer);
    await h.wait(at(ids[index]), label);
    await h.check(label, at(ids[index]), undefined, 'once');
  };
  try {
    await h.reload();
    await h.click('图片库', 'document.querySelector(".tb")');
    await h.click('全部图片', 'document.querySelector(".libp")');
    await h.input('input[aria-label="搜索图片库"]', 'viewer-fixture');
    await h.click('视图');
    await h.evaluate('document.querySelector("[data-trigger=lsort]").click()');
    await h.click('最近导入的在前');
    await selectGalleryGrouping(h, '完全相同');
    await h.key('Escape');
    await h.wait(
      '!document.querySelector("[data-library-updating=true]") && document.querySelectorAll(".card").length===3',
    );
    await h.evaluate('document.querySelector(".card").click()');
    await h.wait(`document.querySelector('.detail')?.dataset.detailId===${JSON.stringify(ids[0])}`);
    await h.key(' ', {}, 'document.querySelector(".lgrid")');
    await h.wait(at(ids[0]));
    await h.evaluate(
      'document.querySelector(".viewer-img").dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:-300,clientX:400,clientY:300}))',
    );
    await h.check(
      '滚轮放大当前图片',
      'Number(document.querySelector(".vframe:not(.leaving) img").style.transform.match(/scale\\(([^)]+)\\)/)[1])>1',
      undefined,
      'once',
    );
    await h.evaluate(
      'document.querySelector(".vframe:not(.leaving) img").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))',
    );
    await h.check(
      '双击恢复适应窗口且清除平移',
      'document.querySelector(".vframe:not(.leaving) img").style.transform===""',
      undefined,
      'once',
    );
    await move('ArrowLeft', 0, '第一张继续向左不循环');
    for (let i = 1; i < 5; i++) await move('ArrowRight', i, `右键按完整顺序到第 ${i + 1} 张`);
    await move('ArrowRight', 4, '最后一张继续向右不循环');
    await move('ArrowLeft', 3, '向左进入一摞落在最后一张');
    await h.click('上一张', viewer);
    await h.wait(at(ids[2]));
    await h.check('底部上一张使用同一完整顺序', at(ids[2]), undefined, 'once');
    await h.click('下一张', viewer);
    await h.wait(at(ids[3]));
    await h.check('底部下一张使用同一完整顺序', at(ids[3]), undefined, 'once');
    await h.key('Escape', {}, viewer);
  } finally {
    for (const id of ids) database.deleteProject(id);
    await h.reload();
  }
}
