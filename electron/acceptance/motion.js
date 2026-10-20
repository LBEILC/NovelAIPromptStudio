export const motionDetails = `(async()=>({motion:document.documentElement.dataset.motion,appearance:await window.studio.invoke('settings.appearance.get',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data}),systemReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,transitions:[...document.querySelectorAll('.btn')].map(b=>getComputedStyle(b).transitionDuration)}))()`;

export async function defaultMotionChecks(h) {
  const { check, wait, window } = h;
  await h.section('外观');
  await wait("!!document.querySelector('[aria-label=动效] [role=radio][aria-checked=true]')");
  await check(
    '新临时目录的动效默认显示跟随系统',
    `(async()=> (await window.studio.invoke('settings.appearance.get',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data})).motion === 'reduced' && document.querySelector('[aria-label=动效] [role=radio][aria-checked=true]').textContent.trim() === '跟随系统')()`,
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
