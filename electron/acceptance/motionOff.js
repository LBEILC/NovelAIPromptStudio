// Reduced-motion acceptance checks the saved preference and final UI state.
// Animation duration, sampled frames and pixels belong to visual review.
export async function motionOffChecks({ h }) {
  h.category('减少动态效果');
  await h.section('通用');
  await h.click('跟随系统', 'document.querySelector("[role=radiogroup][aria-label=动效]")');
  await h.wait("document.documentElement.dataset.motion==='off'", '动效跟随系统后关闭');
  await h.check('动效已经关闭', "document.documentElement.dataset.motion==='off'");
}
