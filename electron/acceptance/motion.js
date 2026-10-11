export const motionDetails = `(async()=>({motion:document.documentElement.dataset.motion,appearance:await window.studio.getAppearanceSettings(),systemReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,transitions:[...document.querySelectorAll('.nps-button')].map(b=>getComputedStyle(b).transitionDuration)}))()`;

export async function motionChecks(h) {
  const { evaluate: e, checkSoon, click, wait, window } = h;
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
        await click(label, 'document.querySelector("[role=radiogroup][aria-label=动效]")');
        const off = motion === 'off' || (motion === 'reduced' && reduced);
        await checkSoon(
          `系统减少动态效果=${reduced}，${label}的保存值、有效模式和实际过渡一致`,
          `(async()=>{const s=await window.studio.getAppearanceSettings();const durations=[...document.querySelectorAll('.nps-button')].flatMap(b=>getComputedStyle(b).transitionDuration.split(',').map(parseFloat));return s.motion===${JSON.stringify(motion)} && document.documentElement.dataset.motion===${JSON.stringify(off ? 'off' : 'full')} && durations.length>0 && ${off ? 'durations.every(d=>d<=0.001)' : 'durations.some(d=>d>0.001)'}})()`,
          undefined,
          '',
          motionDetails,
        );
      }
      // Deliberately keep CDP reduction enabled across reload, as in the reported
      // leaked-emulation scenario. Persisted Full must still win.
      if (reduced) {
        await new Promise((resolve) => {
          window.webContents.once('did-finish-load', resolve);
          window.webContents.reload();
        });
        await wait('!!document.querySelector(".studio-titlebar")');
        await checkSoon(
          '未撤销的 CDP 减少动态效果在刷新后仍不能覆盖完整',
          `(async()=>{const s=await window.studio.getAppearanceSettings();return s.motion==='full' && matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.motion==='full'})()`,
          undefined,
          '',
          motionDetails,
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
  );
}
