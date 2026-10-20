export const motionDetails = `(async()=>({motion:document.documentElement.dataset.motion,appearance:await window.studio.invoke('settings.appearance.get',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data}),systemReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,transitions:[...document.querySelectorAll('.nps-button')].map(b=>getComputedStyle(b).transitionDuration)}))()`;

export async function defaultMotionChecks(h) {
  const { check, wait, window } = h;
  await h.section('外观');
  await wait("!!document.querySelector('[aria-label=动效] button[aria-checked=true]')");
  await check(
    '新临时目录的动效默认显示跟随系统',
    `(async()=> (await window.studio.invoke('settings.appearance.get',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data})).motion === 'reduced' && document.querySelector('[aria-label=动效] button[aria-checked=true]').textContent.trim() === '跟随系统')()`,
    undefined,
    'once',
  );
  const cdp = window.webContents.debugger;
  try {
    for (const reduced of [true, false]) {
      await cdp.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }],
      });
      const expected = `document.documentElement.dataset.motion === '${reduced ? 'off' : 'full'}'`;
      await wait(expected);
      await check(`默认动效跟随系统减少动态效果=${reduced}`, expected, undefined, 'once');
    }
  } finally {
    await cdp.sendCommand('Emulation.setEmulatedMedia', { features: [] });
  }
  await h.click('工作台');
}

export async function applyMotionBaseline(h, mode) {
  if (!mode.motion) return;
  await h.section('外观');
  await h.click(
    mode.motion === 'off' ? '关闭' : '跟随系统',
    'document.querySelector("[aria-label=动效]")',
  );
  await h.wait(
    `(async()=>(await window.studio.invoke('settings.appearance.get',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data})).motion===${JSON.stringify(mode.motion === 'off' ? 'off' : 'reduced')})()`,
    '指定动效基线已保存',
  );
  await h.check(
    '指定动效基线已应用',
    `document.documentElement.dataset.motion===(${mode.motion === 'off'} || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'full')`,
    undefined,
    'once',
  );
}

export async function motionChecks(h) {
  const { evaluate: e, checkSoon, wait, check, window } = h;
  const cdp = window.webContents.debugger;
  const baseline = await e("matchMedia('(prefers-reduced-motion: reduce)').matches");
  try {
    for (const reduced of [false, true]) {
      await cdp.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }],
      });
      await wait(`matchMedia('(prefers-reduced-motion: reduce)').matches === ${reduced}`);
      for (const [label, motion] of [
        ['跟随系统', 'reduced'],
        ['关闭', 'off'],
        ['完整', 'full'],
      ]) {
        const button = `[...document.querySelectorAll('[role=radiogroup][aria-label=动效] button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`;
        await wait(`!!(${button}) && !(${button}).disabled`, '动效选项可操作：' + label);
        const off = motion === 'off' || (motion === 'reduced' && reduced);
        await checkSoon(
          `系统减少动态效果=${reduced}，${label}的有效模式和实际过渡一致`,
          `(()=>{const durations=[...document.querySelectorAll('.nps-button')].flatMap(b=>getComputedStyle(b).transitionDuration.split(',').map(parseFloat));return document.documentElement.dataset.motion===${JSON.stringify(off ? 'off' : 'full')} && durations.length>0 && ${off ? 'durations.every(d=>d<=0.001)' : 'durations.some(d=>d>0.001)'}})()`,
          undefined,
          `(${button}).click()`,
          motionDetails,
          'both',
        );
        // Persistence is real disk I/O, not part of the visual feedback budget.
        const saved = `(async()=>(await window.studio.invoke('settings.appearance.get',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data})).motion===${JSON.stringify(motion)})()`;
        await wait(saved, '动效偏好保存完成：' + motion);
        await check(
          `系统减少动态效果=${reduced}，${label}的偏好已保存`,
          saved,
          motionDetails,
          'once',
        );
      }
      // Deliberately keep CDP reduction enabled across reload, as in the reported
      // leaked-emulation scenario. Persisted Full must still win.
      if (reduced) {
        await h.reload();
        await wait('!!document.querySelector(".studio-titlebar")');
        await wait(
          `(async()=>(await window.studio.invoke('settings.appearance.get',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data})).motion==='full')()`,
          '刷新后读取已保存的完整动效偏好',
        );
        await checkSoon(
          '未撤销的 CDP 减少动态效果在刷新后仍不能覆盖完整',
          `matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.motion==='full'`,
          undefined,
          '',
          motionDetails,
          'both',
        );
      }
    }
  } finally {
    await cdp.sendCommand('Emulation.setEmulatedMedia', { features: [] });
  }
  await checkSoon(
    '撤销 CDP 模拟后恢复进程的系统偏好',
    `matchMedia('(prefers-reduced-motion: reduce)').matches === ${baseline}`,
    undefined,
    '',
    motionDetails,
    'both',
  );
}
