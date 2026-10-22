import { selectGalleryGrouping } from './galleryView.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { project } from '../../scripts/data-layer/fixture.mjs';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { harness } from './harness.js';
import { settleLayout } from './layout.js';
import { pointer, center } from './interactions.js';

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
export async function runCommandBenchmark({ mode, database, createWindow, preferences, doubles }) {
  preferences.saveAppearanceSettings({ themeMode: 'light', motion: 'full' });
  const files = await createWorkbenchFixtures(path.join(mode.root, 'fixtures'));
  // The same 010a fixture, including large metadata and 59 tags per image.
  for (let at = 0; at < 5000; at += 25) {
    database.insertProjects(
      Array.from({ length: 25 }, (_, i) => ({
        ...project(at + i),
        image_path: files[i % 3],
        thumbnail_path: files[i % 3],
      })),
    );
    if (at % 1000 === 0) console.log(`性能夹具 ${at}/5000`);
  }
  const firstCardsStart = performance.now();
  const cards = await database.loadLibraryCards();
  const firstCardsMs = performance.now() - firstCardsStart;
  database.createCollection({ id: 'benchmark-half', name: '基准筛选', kind: 'manual' });
  database.updateCollectionProjects(
    'benchmark-half',
    cards.slice(0, 2500).map((c) => c.id),
  );
  mode.screenshots = [];
  const checks = [];
  const window = createWindow();
  const loaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  const h = harness(window, mode, checks);
  const e = h.evaluate;
  const samples = {
    input: [],
    drag: [],
    tabs: [],
    filter: [],
    firstCards: [firstCardsMs],
    import100: [],
    dictionary: [],
    importDays: [],
  };
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
    await loaded;
    await h.wait('!!document.querySelector(".tb")');
    await e("window.studio.invoke('workbench.list', {})");
    for (const file of files) {
      doubles.selections.push({ canceled: false, filePaths: [file] });
      await h.click('打开图片', 'document.querySelector(".tb")');
      await h.wait(
        `document.querySelectorAll('.tabs [data-tab]').length===${files.indexOf(file) + 1}`,
      );
    }
    await h.wait('document.querySelectorAll(".tabs [data-tab]").length===3');
    await settleLayout(h, '.wb-body');
    await h.click('更多');
    await h.click('切换为文本编辑');
    await h.wait('!!document.querySelector(".tx-wrap textarea")');
    samples.input =
      await e(`(async()=>{const n=document.querySelector('.tx-wrap textarea');n.focus();const times=[];for(const char of ' synthetic benchmark text repeated for input measurement'){
      const start=performance.now();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(n,n.value+char);n.dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));times.push(performance.now()-start);
    }return times.slice(5)})()`);
    await h.click('按块编辑（Ctrl E 切换）');
    samples.tabs = await e(
      `(async()=>{const times=[];for(let i=0;i<30;i++){const n=document.querySelectorAll('.tabs [data-tab]')[i%3],start=performance.now();n.click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(n.getAttribute('aria-selected')!=='true')throw Error('Tab did not select');times.push(performance.now()-start);}return times.slice(3)})()`,
    );
    await settleLayout(h, '.col.prompt .scroll');
    const move = pointer(h),
      start = await center(h, 'document.querySelector(".tags .tag[data-tag-key]")');
    await move('mouseMoved', start);
    await move('mousePressed', start, true);
    await move('mouseMoved', { x: start.x + 12, y: start.y + 5 }, true);
    await h.wait('!!document.querySelector(".drag-float")');
    await e(
      `window.agentFrames=[];window.agentSampling=true;let before;function tick(now){if(before)window.agentFrames.push(now-before);before=now;if(window.agentSampling)requestAnimationFrame(tick)}requestAnimationFrame(tick)`,
    );
    for (let i = 0; i < 30; i++)
      await move(
        'mouseMoved',
        { x: start.x + 20 + (i % 5) * 35, y: start.y + 10 + (i % 3) * 20 },
        true,
      );
    samples.drag = await e('window.agentSampling=false;window.agentFrames.slice(5)');
    await h.nativeKey('Escape');
    await move('mouseReleased', start);
    await h.click('图片库', 'document.querySelector(".tb")');
    await h.wait(
      '!!document.querySelector(".card")&&!document.querySelector("[data-library-updating=true]")',
    );
    await h.click('视图');
    await selectGalleryGrouping(h, '不合并');
    await h.key('Escape');
    await h.wait('!document.querySelector("[data-library-updating=true]")');
    samples.filter = await e(
      `(async()=>{const times=[];for(let i=0;i<12;i++){const half=i%2===0,n=document.querySelector(half?'.libp .side [data-key="sv-benchmark-half"]':'.libp .side [aria-label="全部图片"]'),start=performance.now();n.click();do{await new Promise(resolve=>requestAnimationFrame(resolve));if(performance.now()-start>10000)throw Error('Filter timeout')}while(document.querySelector('[data-library-updating=true]')||!document.querySelector('.lcount').textContent.includes((half?'2500':'5000')+' 张'));await new Promise(resolve=>requestAnimationFrame(resolve));times.push(performance.now()-start);}return times.slice(2)})()`,
    );
    const importStart = performance.now();
    for (let at = 0; at < 100; at += 25) {
      const inserted = database.insertProjects(
        Array.from({ length: 25 }, (_, i) => ({
          ...project(5000 + at + i),
          image_path: files[i % 3],
          thumbnail_path: files[i % 3],
        })),
      );
      if (inserted.some((item) => item.error)) throw Error('Benchmark import failed');
    }
    samples.import100.push(performance.now() - importStart);
    const existing = database.listTagDictionary({ all: true }).items;
    database.deleteTagDictionaries(existing.map((item) => item.tag));
    database.upsertTagDictionary(
      Array.from({ length: 2000 }, (_, i) => ({
        tag: `benchmark_dictionary_${i}`,
        translation: `基准词条 ${i}`,
        category: 'Unsorted',
        translation_source: 'manual',
        category_source: 'manual',
      })),
    );
    await h.click('设置', 'document.querySelector(".tb")');
    samples.dictionary = await e(
      `(async()=>{const start=performance.now();[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='翻译词典').click();do{await new Promise(resolve=>requestAnimationFrame(resolve));if(performance.now()-start>10000)throw Error('Dictionary timeout')}while(!document.querySelector('.dict-count')?.textContent.includes('2000'));return [performance.now()-start]})()`,
    );
    samples.importDays = await e(
      `(async()=>{const month=new Date().toISOString().slice(0,7),times=[];for(let i=0;i<12;i++){const start=performance.now();const result=await window.studio.invoke('library.import-days',{month});if(!result.ok)throw Error(result.error.message);times.push(performance.now()-start)}return times.slice(2)})()`,
    );
    const metrics = Object.fromEntries(
      Object.entries(samples).map(([key, values]) => [key, median(values)]),
    );
    if (Object.values(metrics).some((n) => !Number.isFinite(n)))
      throw Error('Missing benchmark samples');
    await fs.writeFile(
      path.join(mode.output, 'metrics.json'),
      JSON.stringify({ platform: process.platform, metrics, samples }, null, 2),
    );
    console.log('Agent performance', metrics);
    if (!process.env.CI && metrics.importDays >= 50)
      throw Error(`Import-day counts exceeded 50 ms for 5000 images: ${metrics.importDays}`);
  } catch (error) {
    await fs.writeFile(path.join(mode.output, 'failure.txt'), await e('document.body.innerText'));
    throw error;
  } finally {
    window.destroy();
  }
}
