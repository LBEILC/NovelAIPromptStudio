export const motionDetails = `(async()=>({motion:document.documentElement.dataset.motion,appearance:await window.studio.getAppearanceSettings(),systemReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,transitions:[...document.querySelectorAll('.nps-button')].map(b=>getComputedStyle(b).transitionDuration)}))()`;

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
        const saved = `(async()=>(await window.studio.getAppearanceSettings()).motion===${JSON.stringify(motion)})()`;
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
          `(async()=>(await window.studio.getAppearanceSettings()).motion==='full')()`,
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
