import path from 'node:path';
import fs from 'node:fs/promises';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { importLibraryFiles } from '../importer.js';
import { library, cleanup } from './interactions.js';
import { focusRingChecks } from './focusRings.js';

export async function detailLayoutChecks(env) {
  const { h, mode } = env;
  h.category('详情布局');
  const prefix = 'layout-synthetic';
  const files = await createWorkbenchFixtures(path.join(mode.root, prefix), {
    prefix,
    seed: 57000,
    sizes: [
      [384, 1152],
      [1152, 384],
      [768, 768],
      [640, 960],
      [960, 640],
    ],
    prompts: [2, 8, 40, 100, 150].map((count) =>
      Array.from({ length: count }, (_, i) => `layout_sample_${i}`).join(', '),
    ),
  });
  const imported = await importLibraryFiles({
    filePaths: files,
    database: env.database,
    assetsDirectory: env.preferences.librarySettings().assetsDirectory,
  });
  if (imported.errors.length || imported.imported.length !== 5)
    throw Error('五种比例布局夹具导入失败');
  const records = imported.imported;
  try {
    await h.reload();
    await library(h, prefix);
    await h.wait('document.querySelectorAll(".library-card").length===5');
    for (const theme of ['light', 'dark']) {
      mode.themeDriver.set(theme);
      await h.evaluate('document.fonts.ready.then(()=>true)');
      await h.evaluate(
        `document.querySelector('[data-project-id="${records.at(-1).id}"]').click()`,
      );
      await h.wait(
        `document.querySelector('.library-detail')?.dataset.detailId===${JSON.stringify(records.at(-1).id)}`,
      );
      for (const record of [...records, ...records.toReversed().slice(1)]) {
        await h.evaluate(`(()=>{
          const id=${JSON.stringify(record.id)};
          window.detailLayoutFrames=[];
          const sample=()=>{
            const detail=document.querySelector('.library-detail[data-detail-id="'+id+'"]');
            if(detail){
              const nodes=[...detail.querySelectorAll('.library-detail-picture,.library-caption,.library-section-title,.library-block-label')];
              window.detailLayoutFrames.push({id,time:performance.now(),positions:nodes.map(n=>{const r=n.getBoundingClientRect();return {name:n.className,y:r.top,height:r.height}}),ready:!!detail.querySelector('img[data-image-ready]')});
            }
            if(window.detailLayoutFrames.length<20)window.detailLayoutFrame=requestAnimationFrame(sample);
          };
          window.detailLayoutFrame=requestAnimationFrame(sample);
          document.querySelector('[data-project-id="'+id+'"]').click();
        })()`);
        await h.wait('window.detailLayoutFrames.length>=20', '详情首帧到图片解码后的连续布局采样');
        const frames = await h.evaluate('window.detailLayoutFrames');
        await fs.writeFile(
          path.join(mode.output, `024-detail-${theme}-${record.id}.json`),
          JSON.stringify(frames, null, 2),
        );
        await h.check(
          `${theme}：详情 ${record.metadata.width}×${record.metadata.height} 首帧到末帧标题位置不跳动`,
          `(()=>{const frames=window.detailLayoutFrames,first=frames[0].positions;return frames.length===20&&frames.every(f=>f.positions.length===first.length&&f.positions.every((p,i)=>Math.abs(p.y-first[i].y)<.5&&Math.abs(p.height-first[i].height)<.5))})()`,
          'window.detailLayoutFrames',
          'once',
        );
        await h.check(
          `${theme}：新详情的负面节初始关闭`,
          `!document.querySelector('.library-detail details[open]')`,
          undefined,
          'once',
        );
        await h.evaluate(
          `document.querySelector('.library-detail summary')?.click();document.querySelector('.library-tags:not(.library-tags-measure) button')?.click()`,
        );
        await h.wait(`!document.querySelector('.library-detail [data-height-animating]')`);
      }
      await h.screenshot(`024-detail-stable-${theme}`);
    }
    // Exact count varies with platform fonts; open through the existing accessible text.
    await h.evaluate(
      `document.querySelector('.library-tags:not(.library-tags-measure) button')?.click()`,
    );
    await focusRingChecks(h, '图片库筛选条件与更多 Tag');
  } finally {
    await h.evaluate('cancelAnimationFrame(window.detailLayoutFrame)');
    await cleanup(env, records);
  }
}
