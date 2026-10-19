// One global check for "motion off": in every main view, no element (or its
// ::before / ::after) declares a transition or animation longer than 1 ms, and
// nothing finite is still running. Replaces re-running the whole suite under
// reduced motion; the flows that depend on transition events stay covered by
// the categories run.js keeps for 减少动态效果.
const audit = `(() => {
  const ms = (value) =>
    value.split(',').map((part) => part.trim()).map((part) => (part.endsWith('ms') ? parseFloat(part) : parseFloat(part) * 1000));
  const name = (node) => node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') + (node.classList.length ? '.' + [...node.classList].join('.') : '');
  const offenders = [];
  for (const node of document.querySelectorAll('*'))
    for (const pseudo of [null, '::before', '::after']) {
      const style = getComputedStyle(node, pseudo);
      if (pseudo && style.content === 'none') continue;
      const transition = Math.max(...ms(style.transitionDuration));
      const animation = style.animationName === 'none' ? 0 : Math.max(...ms(style.animationDuration));
      if (transition > 1 || animation > 1)
        offenders.push({ node: name(node) + (pseudo || ''), transition: style.transitionDuration, animation: style.animationName + ' ' + style.animationDuration });
    }
  for (const animation of document.getAnimations()) {
    const timing = animation.effect?.getComputedTiming();
    if (timing && timing.iterations !== Infinity && Number(timing.duration) > 1 && animation.playState === 'running')
      offenders.push({ node: animation.effect.target ? name(animation.effect.target) : 'unknown', running: Number(timing.duration) });
  }
  window.motionOffOffenders = offenders.slice(0, 20);
  return offenders.length === 0;
})()`;

export async function motionOffChecks({ h }) {
  h.category('减少动态效果·全局');
  const { check, click, wait, section, key } = h;
  const details = 'window.motionOffOffenders';
  const inspect = async (view) => {
    await check(`${view}：没有超过 1 毫秒的过渡或动画`, audit, details);
  };
  // The path users take: motion follows the system, and the system asks for
  // reduced motion. Left on for the categories that run after this one.
  await section('外观');
  await click('跟随系统', 'document.querySelector("[role=radiogroup][aria-label=动效]")');
  await wait("document.documentElement.dataset.motion==='off'", '动效跟随系统后关闭');
  await check(
    '动效已经关闭',
    "document.documentElement.dataset.motion==='off'",
    "({motion:document.documentElement.dataset.motion,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches})",
  );
  await click('工作台', 'document.querySelector(".studio-titlebar")');
  await wait(
    `document.querySelector('.studio-titlebar [aria-current=page]')?.textContent.trim()==='工作台'`,
  );
  await inspect('工作台');
  await click('图片库', 'document.querySelector(".studio-titlebar")');
  await click('全部图片', 'document.querySelector(".library-side")');
  await wait('document.querySelectorAll(".library-card").length>0');
  await h.evaluate('document.querySelector(".library-card").click()');
  await wait('!!document.querySelector(".library-detail-picture img")');
  await inspect('图片库与详情栏');
  await click('视图', 'document.querySelector(".library-tools")');
  await wait('!!document.querySelector(":popover-open")');
  await inspect('图片库的视图浮层');
  await key('Escape');
  for (const name of ['外观', '图片库', 'AI 服务', '翻译词典', '关于与更新']) {
    await section(name);
    await inspect(`设置·${name}`);
  }
}
