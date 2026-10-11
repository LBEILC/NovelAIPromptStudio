import fs from 'node:fs/promises';
import path from 'node:path';
import { harness } from './harness.js';

export async function runLibraryBenchmark({ mode, preferences, createWindow }) {
  const count = mode.count || 5000;
  preferences.saveAppearanceSettings({ themeMode: 'light', motion: 'off' });
  mode.screenshots = [];
  const checks = [];
  const window = createWindow();
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') console.error('Renderer error:', details.message);
  });
  window.webContents.on('render-process-gone', (_event, details) =>
    console.error('Renderer exited:', details),
  );
  const loaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  const h = harness(window, mode, checks);
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
    await h.wait('!!document.querySelector(".studio-titlebar")');
    const navigationStart = performance.now();
    await h.click('图片库', 'document.querySelector(".studio-titlebar")');
    while (
      !(await h.evaluate(
        '!!document.querySelector(".library-card") && !document.querySelector("[data-library-updating=true]")',
      ))
    ) {
      if (performance.now() - navigationStart > 180000)
        throw Error('Cold library startup exceeded 180 seconds');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const coldOpenMs = performance.now() - navigationStart;
    await h.click('视图');
    await h.click('不合并');
    await h.key('Escape');
    await h.wait('!document.querySelector("[data-library-updating=true]")');
    await h.evaluate(
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    );
    await h.check(
      `${count} 张完整出现在列表计数中`,
      `document.querySelector('.library-side [aria-label=全部图片] span').textContent==='${count}'`,
    );
    await h.click('工作台', 'document.querySelector(".studio-titlebar")');
    const warmStart = performance.now();
    await h.click('图片库', 'document.querySelector(".studio-titlebar")');
    await h.wait(
      'document.querySelector(".library-card")?.getClientRects().length>0 && !document.querySelector("[data-library-updating=true]")',
    );
    const warmOpenMs = performance.now() - warmStart;
    await h.evaluate(
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    );
    console.log(
      '滚动前几何',
      await h.evaluate(
        `(()=>{const g=document.querySelector('[data-library-grid]');return {height:g.clientHeight,scroll:g.scrollHeight,rows:document.querySelector('.library-rows').style.height,count:document.querySelector('.library-count').textContent,cards:g.querySelectorAll('.library-card').length}})()`,
      ),
    );
    const scroll =
      count === 20000
        ? await h.evaluate(
            `(async()=>{const g=document.querySelector('[data-library-grid]');g.scrollTop=g.scrollHeight;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {reachedBottom:g.scrollTop+g.clientHeight>=g.scrollHeight-1,maxCards:g.querySelectorAll('.library-card').length,frames:0,lastIndex:Number(g.querySelector('.library-row:last-child .library-card:last-child')?.dataset.libraryIndex)}})()`,
          )
        : await h.evaluate(`new Promise(resolve=>{
      const grid=document.querySelector('[data-library-grid]');
      const samples=[];let before=performance.now(),frames=0,maxCards=0;
      const tick=now=>{
        if(frames++)samples.push(now-before);
        before=now;maxCards=Math.max(maxCards,grid.querySelectorAll('.library-card').length);
        if(grid.scrollTop+grid.clientHeight>=grid.scrollHeight-1){resolve({maxFrameMs:Math.max(...samples),p95FrameMs:[...samples].sort((a,b)=>a-b)[Math.floor(samples.length*.95)],frames,maxCards,reachedBottom:true,scrollHeight:grid.scrollHeight,top:grid.scrollTop});return;}
        grid.scrollTop+=Math.max(1,grid.clientHeight/2);requestAnimationFrame(tick);
      };requestAnimationFrame(tick);
    })`);
    await h.check(
      count === 20000 ? '20000 张可打开并定位到最后一张' : '连续滚动到底且只渲染窗口内卡片',
      () =>
        scroll.reachedBottom &&
        scroll.maxCards < 100 &&
        (count === 20000 ? scroll.lastIndex === 19999 : scroll.frames > 100),
    );
    await h.evaluate(
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    );
    const details = await h.evaluate(`(async()=>{
      const times=[];
      const cards=[...document.querySelectorAll('.library-card')].slice(-5);
      for(const card of cards){
        const start=performance.now();card.click();
        while(document.querySelector('.library-detail')?.dataset.detailId!==card.dataset.projectId){
          if(performance.now()-start>10000)throw Error('Detail timeout');
          await new Promise(resolve=>requestAnimationFrame(resolve));
        }
        times.push(performance.now()-start);
      }return times;
    })()`);
    await h.check('详情切换测量五张实际图片', () => details.length === 5);
    await h.screenshot(`library-${count}`);
    await fs.writeFile(
      path.join(mode.output, 'metrics.json'),
      JSON.stringify(
        {
          platform: process.platform,
          count,
          viewport: '1240x760',
          coldOpenMs,
          warmOpenMs,
          scroll,
          detailSamplesMs: details,
          detailMaxMs: Math.max(...details),
          checks,
        },
        null,
        2,
      ),
    );
    if (checks.some((check) => check.status === 'failed'))
      throw Error('Library benchmark assertion failed');
  } catch (error) {
    console.error(await h.evaluate('document.body.innerText.slice(-5000)'));
    await h.screenshot('failure');
    throw error;
  } finally {
    window.destroy();
  }
}
