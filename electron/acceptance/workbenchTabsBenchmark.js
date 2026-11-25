import path from 'node:path';
import fs from 'node:fs/promises';
import { harness } from './harness.js';

export async function benchmarkWorkbenchTabs({
  app,
  mode,
  preferences,
  commandRuntime,
  createWindow,
}) {
  const { count, phase, root, output } = mode;
  const metricsFile = path.join(output, 'metrics.json');
  if (phase) console.log('Measuring restored workbench', count);
  const metrics = phase ? JSON.parse(await fs.readFile(metricsFile, 'utf8')) : {};
  preferences.completeOnboarding(app.getVersion());
  if (!phase) {
    const token = await commandRuntime.dispatch(
      'account.save',
      { token: 'acceptance-token' },
      'ui',
    );
    if (!token.ok) throw Error(token.error.message);
  }
  let lists = 0;
  commandRuntime.observeUI((name) => {
    if (name === 'version.list') lists++;
  });
  const window = createWindow();
  const h = harness(window, { ...mode, fullLibraryBenchmark: true }, []);
  const e = h.evaluate;
  const call = (name, input) =>
    e(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data.tab?.id || true})`,
    );
  await h.wait('!!document.querySelector(".tb")');
  if (!phase) {
    const directory = path.resolve('demo/images/final');
    const images = (await fs.readdir(directory)).filter((f) => f.endsWith('.png')).sort();
    const ids = [];
    for (let i = 0; i < count; i++) {
      const file = path.join(root, 'fixture-' + i + '.png');
      await fs.copyFile(path.join(directory, images[i % images.length]), file);
      await fs.appendFile(file, String(i));
      const start = performance.now();
      ids.push(await call('workbench.open', { path: file }));
      metrics.openMs = performance.now() - start;
    }
    for (const id of ids.slice(1, 1 + count * 0.4))
      await call('prompt.set', {
        tabId: id,
        scope: 'base:prompt',
        text: 'synthetic benchmark draft',
      });
  } else {
    await h.wait(`document.querySelectorAll('.tabs [data-tab]').length === ${count}`);
    metrics.coldMs = Date.now() - mode.started;
    await e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    metrics.startupVersionLists = lists;
    metrics.switchMs = await e(
      `(async()=>{const start=performance.now();document.querySelector('.tabs [data-tab]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-start})()`,
    );
    const tabId = await e("document.querySelector('.tabs [aria-selected=true]').dataset.tab");
    await call('workbench.list', {});
    metrics.editMs = await e(`(async()=>{
      const base=(await window.studio.invoke('workbench.session',{})).data;
      const tab=base.tabs.find(t=>t.id===${JSON.stringify(tabId)});
      const next=structuredClone(tab);
      next.project.tags[0].tag='benchmark';
      const input=${mode.label === 'before' ? '{base,next:{...base,tabs:base.tabs.map(t=>t.id===tab.id?next:t)}}' : '{base:{...base,order:base.tabs.map(t=>t.id),tabs:[tab]},next:{...base,order:base.tabs.map(t=>t.id),tabs:[next]}}'};
      const start=performance.now();
      const result=await window.studio.invoke('workbench.commit',input);
      if(!result.ok)throw Error(result.error.message);
      return performance.now()-start;
    })()`);
    preferences.saveProductivitySettings({ confirmCloseChangedTabs: false });
    await e(
      `window.benchTasks=[];new PerformanceObserver(l=>window.benchTasks.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask'});document.querySelector('.tabs [data-tab]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:25}))`,
    );
    await h.wait("!!document.querySelector('.menu:not(.leaving)')");
    metrics.closeMs = await window.webContents.executeJavaScript(`(async()=>{
      const button=[...document.querySelectorAll('.menu button,.menu [role=menuitem]')].find(b=>b.textContent.trim()==='关闭其他标签页');
      if (!button) throw Error('Missing close action');
      const start=performance.now();
      button.click();
      while(document.querySelectorAll('.tabs [data-tab]:not(.leaving)').length!==1) {
        document.querySelector('[role=dialog]:not(.leaving *) .acts .line-danger')?.click();
        if(performance.now()-start>600000) throw Error('Close did not finish');
        await new Promise(r=>requestAnimationFrame(r));
      }
      const result=await window.studio.invoke('workbench.list',{});
      if(!result.ok || result.data.tabs.length!==1) throw Error('Close did not persist');
      return performance.now()-start;
    })()`);
    metrics.closeLongestTaskMs = await e('Math.max(0,...window.benchTasks)');
  }
  await fs.writeFile(metricsFile, JSON.stringify(metrics, null, 2));
  console.table(metrics);
}
