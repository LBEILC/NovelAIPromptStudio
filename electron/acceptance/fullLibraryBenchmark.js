import fs from 'node:fs';
import path from 'node:path';
import { harness } from './harness.js';
import { importLibraryFiles } from '../importer.js';
import { diskBytes } from '../../scripts/library-benchmark/fixture.mjs';

export async function runFullLibraryBenchmark({
  app,
  mode,
  database,
  preferences,
  createWindow,
  assetsDirectory,
}) {
  preferences.completeOnboarding();
  const window = createWindow();
  const loaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  mode.screenshots = [];
  // Large-library measurements have their own generous observation budget.
  const h = harness(window, { ...mode, slow: 6, phase: mode.run }, []);
  const e = h.evaluate;
  const results = {};
  const memory = (prefix) => {
    const metrics = app.getAppMetrics();
    results[`${prefix}MainBytes`] = metrics
      .filter((m) => m.type === 'Browser')
      .reduce((n, m) => n + m.memory.workingSetSize * 1024, 0);
    results[`${prefix}RendererBytes`] = metrics
      .filter((m) => m.pid === window.webContents.getOSProcessId())
      .reduce((n, m) => n + m.memory.workingSetSize * 1024, 0);
  };
  const ready =
    "!!document.querySelector('.lgrid:not(.leaving) .card') && !document.querySelector('.lgrid.leaving')";
  const images = `(()=>{const box=document.querySelector('.lib-grid-col > .scroll'); if(!box)return false; const r=box.getBoundingClientRect();const images=[...box.querySelectorAll('.card img')].filter(i=>{const b=i.getBoundingClientRect();return b.bottom>r.top&&b.top<r.bottom});return images.length>0&&images.every(i=>i.complete&&i.naturalWidth>0)})()`;
  try {
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
      enabled: true,
    });
    await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1240,
      height: 760,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await window.webContents.debugger.sendCommand('Profiler.enable');
    await window.webContents.debugger.sendCommand('Profiler.start');
    await loaded;
    // The acceptance window is offscreen; showInactive establishes native readiness without stealing focus.
    window.showInactive();
    await h.wait("!!document.querySelector('.tb') && !!document.querySelector('.pages .body')");
    await e("window.studio.invoke('workbench.list', {})");
    results.coldStartMs = Date.now() - mode.startedAt;
    memory('idle');
    const first = performance.now();
    await h.click('图片库', 'document.querySelector(".tb")');
    await h.wait(ready);
    await h.wait(images);
    results.firstScreenMs = performance.now() - first;
    console.log('first screen', results.firstScreenMs);
    const scroll = await window.webContents.executeJavaScript(
      `new Promise(resolve=>{
      const g=document.querySelector('.lib-grid-col > .scroll');let last=performance.now(),down=true,frames=0,longFrames=0,max=0;
      const tick=now=>{const dt=now-last;last=now;if(frames++){if(dt>50)longFrames++;max=Math.max(max,dt)}
        if(down&&g.scrollTop+g.clientHeight>=g.scrollHeight-1)down=false;
        if(!down&&g.scrollTop<=0){resolve({scrollLongFrames:longFrames,scrollMaxFrameMs:max,scrollFrames:frames});return;}
        g.scrollTop+= (down?1:-1)*Math.max(1,g.clientHeight*2);requestAnimationFrame(tick);
      };requestAnimationFrame(tick);
    })`,
      true,
    );
    Object.assign(results, scroll);
    memory('afterScroll');
    const allCount = await e("document.querySelector('.lcount').textContent");
    const search = performance.now();
    await h.input('.gallery-search input', 'forest');
    await h.wait(
      ready + ` && document.querySelector('.lcount')?.textContent !== ${JSON.stringify(allCount)}`,
    );
    await h.wait("document.querySelector('.gallery-search input').value==='forest'");
    await e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    results.searchMs = performance.now() - search;
    await h.input('.gallery-search input', '');
    await h.wait(
      ready + ` && document.querySelector('.lcount')?.textContent === ${JSON.stringify(allCount)}`,
    );
    const filter = performance.now();
    await h.click('Synthetic collection', 'document.querySelector(".libp .side")');
    await h.wait(
      ready +
        ` && document.querySelector('.libp .side [aria-current=true]')?.textContent.includes('Synthetic collection') && document.querySelector('.lcount')?.textContent !== ${JSON.stringify(allCount)}`,
    );
    results.filterMs = performance.now() - filter;
    await h.click('生成记录', 'document.querySelector(".libp .side")');
    await h.input('.gallery-search input', 'synthetic-000019');
    await h.wait(
      ready +
        ` && !!document.querySelector('.lgrid:not(.leaving) .card[data-group-id="project:synthetic-000019"]')`,
    );
    const workId = 'synthetic-work-0';
    const versions = database.versions.list(workId);
    if (versions.length < 11) throw Error('Expected a work with at least eleven versions');
    await e(
      `document.querySelector('.lgrid:not(.leaving) .card[data-group-id="project:synthetic-000019"]').click()`,
    );
    await h.wait(`document.querySelector('.detail')?.dataset.detailId === 'synthetic-000019'`);
    const opened = performance.now();
    await h.click('在工作台打开', 'document.querySelector(".detail")');
    await h.wait(
      "!!document.querySelector('.doc .tag') && [...document.querySelectorAll('.wb-body img')].some(i=>i.complete&&i.naturalWidth>0)",
    );
    results.openWorkMs = performance.now() - opened;
    results.openedWorkVersions = versions.length;
    results.databaseBytes = fs.statSync(path.join(mode.root, 'userData/data/studio.sqlite')).size;
    results.thumbnailBytes = diskBytes(path.join(assetsDirectory, 'thumbnails'));
    const { profile } = await window.webContents.debugger.sendCommand('Profiler.stop');
    fs.writeFileSync(
      path.join(mode.output, `renderer-${mode.run}.cpuprofile`),
      JSON.stringify(profile),
    );
    const files = fs
      .readdirSync(path.join(mode.root, 'import-input'))
      .map((f) => path.join(mode.root, 'import-input', f));
    const importStart = performance.now();
    const imported = await importLibraryFiles({ filePaths: files, database, assetsDirectory });
    results.importMs = performance.now() - importStart;
    if (imported.errors.length || imported.imported.length !== mode.importCount)
      throw Error('Import benchmark count mismatch');
    results.importPerSecond = (mode.importCount * 1000) / results.importMs;
    await mode.stopMainProfile?.();
    results.peakProfileBytes = diskBytes(mode.root);
    fs.writeFileSync(mode.resultPath, JSON.stringify(results, null, 2));
  } finally {
    window.destroy();
  }
}
