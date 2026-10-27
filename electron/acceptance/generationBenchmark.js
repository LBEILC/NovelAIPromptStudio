import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { Session } from 'node:inspector/promises';
import { harness } from './harness.js';
import { createWorkbenchFixtures } from './workbenchFixtures.js';
import { importLibraryFiles } from '../importer.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';

export async function runGenerationBenchmark({
  app,
  mode,
  database,
  preferences,
  createWindow,
  generationService,
  assetsDirectory,
  commandRuntime,
}) {
  preferences.completeOnboarding(app.getVersion());
  preferences.saveAppearanceSettings({ themeMode: 'light', motion: 'full' });
  const files = await createWorkbenchFixtures(path.join(mode.root, 'fixtures'));
  await importLibraryFiles({ filePaths: files.slice(0, 1), database, assetsDirectory });
  const image = database.loadLibrary('all')[0];
  const call = async (name, input = {}) => {
    const result = await commandRuntime.dispatch(name, input, 'ui');
    if (!result.ok) throw Error(`${name}: ${result.error.message}`);
    return result.data;
  };
  await call('account.save', { token: 'acceptance-token' });
  await call('settings.generation.save', { agentMode: 'direct' });
  const tabs = [];
  const sizes = mode.scenario === 'A' ? [300, 50] : Array(40).fill(8);
  for (const [index, size] of sizes.entries()) {
    const { tab } = await call('workbench.new', {
      width: 64,
      height: 64,
      params: { quality: 'None', uc: 'None' },
    });
    const root = (await call('version.list', { tabId: tab.id })).versions[0];
    let last = root;
    for (let n = 1; n <= size; n++) {
      const project = {
        ...root.project,
        metadata: {
          ...root.project.metadata,
          prompt_raw:
            Array.from({ length: 60 }, (_, i) => `synthetic_tag_${i}`).join(', ') +
            `, variation_${n}`,
          seed: '1',
        },
      };
      project.prompt_structure = createPromptStructure(project.metadata);
      last = database.versions.append({
        workId: root.workId,
        parentId: last.id,
        project,
        source: 'agent',
        image,
        seed: 1,
      });
    }
    await call('version.open', { tabId: tab.id, versionId: last.id });
    tabs.push({ ...tab, versionId: last.id });
    console.log(`Fixture ${index + 1}/${sizes.length}: ${size} versions`);
  }
  const timings = {};
  for (const [i, t] of tabs.entries()) {
    if (mode.scenario !== 'A') break;
    const start = performance.now();
    await call('version.list', { tabId: t.id });
    timings[sizes[i]] = performance.now() - start;
  }
  if (mode.scenario === 'A') await call('workbench.close', { tabId: tabs[1].id });
  await call('version.open', { tabId: tabs[0].id, versionId: tabs[0].versionId });
  const session = commandRuntime.store.get();
  session.activeTabId = tabs[0].id;
  await commandRuntime.store.save(session);
  const window = createWindow();
  const loaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  const h = harness(window, mode, []);
  const e = h.evaluate;
  const renderer = window.webContents.debugger;
  const inspector = new Session();
  const samples = [];
  try {
    renderer.attach('1.3');
    await renderer.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await loaded;
    await h.wait('!!document.querySelector("[data-key^=ver-]")');
    await h.wait(
      `document.querySelector('.tabs [aria-selected="true"]')?.dataset.tab === ${JSON.stringify(tabs[0].id)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await renderer.sendCommand('Performance.enable');
    const scriptTime = async () =>
      (await renderer.sendCommand('Performance.getMetrics')).metrics.find(
        (m) => m.name === 'ScriptDuration',
      ).value;
    const scriptBefore = await scriptTime();
    // Refresh publishes real account state, causing the mounted version column
    // to render. This is an upper bound: it includes other renderer subscribers.
    await call('account.refresh');
    await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const rerenderScriptMs = ((await scriptTime()) - scriptBefore) * 1000;
    generationService.state.delay = 1000;
    await e(
      `window.benchLong=[];window.benchObserver=new PerformanceObserver(list=>window.benchLong.push(...list.getEntries().map(x=>x.duration)));window.benchObserver.observe({type:'longtask'});`,
    );
    commandRuntime.observeUI((name, input, ms) => {
      if (name === 'version.list' || name === 'library.get')
        samples.push({ name, tabId: input.tabId, ms, at: Date.now() });
    });
    inspector.connect();
    await inspector.post('Profiler.enable');
    await inspector.post('Profiler.start');
    await renderer.sendCommand('Profiler.enable');
    await renderer.sendCommand('Profiler.start');
    const cli = (name, input) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            path.join(app.getAppPath(), 'agent/nai-studio.mjs'),
            name,
            '--json',
            JSON.stringify(input),
          ],
          {
            env: {
              ...process.env,
              ELECTRON_RUN_AS_NODE: '1',
              NAI_STUDIO_USER_DATA: app.getPath('userData'),
              NAI_STUDIO_NO_LAUNCH: '1',
            },
            windowsHide: true,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        let out = '',
          err = '';
        child.stdout.on('data', (b) => (out += b));
        child.stderr.on('data', (b) => (err += b));
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0 ? resolve(JSON.parse(out)) : reject(Error(err || out)),
        );
      });
    const perImage = [],
      navigation = [];
    let failure = null;
    try {
      for (let n = 0; n < 20; n++) {
        const begin = samples.length;
        const response = await cli('generate.start', { tabId: tabs[0].id, count: 1 });
        const job = response.data;
        if (!job?.id) throw Error('CLI did not return a job id');
        if (job.state === 'pending') await call('generate.confirm', { ids: [job.id] });
        if (n % 2 === 0) {
          navigation.push(
            await e(
              `(async()=>{const start=performance.now();[...document.querySelectorAll('.tb button')].find(n=>n.textContent.trim()==='图片库').click();while(!document.querySelector('.libp')?.getClientRects().length){await new Promise(requestAnimationFrame);if(performance.now()-start>12000)throw Error('Navigation timeout')}return performance.now()-start})()`,
            ),
          );
          await h.click('工作台', 'document.querySelector(".tb")');
        }
        await h.until(
          async () =>
            !['queued', 'generating', 'pending'].includes(
              (await call('generate.status', { id: job.id })).jobs[0].state,
            ),
          '生成完成',
        );
        const done = (await call('generate.status', { id: job.id })).jobs[0];
        if (done.state !== 'completed') throw Error(JSON.stringify(done));
        await new Promise((resolve) => setTimeout(resolve, 350));
        const rows = samples.slice(begin);
        perImage.push({
          versionList: rows.filter((x) => x.name === 'version.list' && x.tabId === tabs[0].id)
            .length,
          otherTabs: rows.filter((x) => x.name === 'version.list' && x.tabId !== tabs[0].id).length,
          libraryGet: rows.filter((x) => x.name === 'library.get').length,
        });
        console.log(`Image ${n + 1}: ${JSON.stringify(perImage.at(-1))}`);
      }
    } catch (error) {
      failure = String(error);
      console.error(failure);
    }
    const longTasks = await e('window.benchObserver.disconnect();window.benchLong');
    const main = await inspector.post('Profiler.stop');
    const web = await renderer.sendCommand('Profiler.stop');
    await fs.writeFile(path.join(mode.output, 'main.cpuprofile'), JSON.stringify(main.profile));
    await fs.writeFile(path.join(mode.output, 'renderer.cpuprofile'), JSON.stringify(web.profile));
    const result = {
      scenario: mode.scenario,
      failure,
      completed: perImage.length,
      cpu: os.cpus()[0].model,
      timings,
      rerenderScriptMs,
      perImage,
      navigation,
      navigationMedian: [...navigation].sort((a, b) => a - b)[Math.floor(navigation.length / 2)],
      navigationMax: Math.max(...navigation),
      longTaskTotal: longTasks.reduce((a, b) => a + b, 0),
      longTaskMax: Math.max(0, ...longTasks),
      samples,
    };
    await fs.writeFile(path.join(mode.output, 'metrics.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, samples: undefined }));
    if (failure) throw Error(failure);
  } finally {
    commandRuntime.observeUI(null);
    inspector.disconnect();
    window.destroy();
  }
}
