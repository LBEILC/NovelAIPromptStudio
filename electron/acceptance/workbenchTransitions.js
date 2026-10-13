export async function workbenchTransitions(h, enabled, theme, { capture, finish, sequence }) {
  const { evaluate: e, check, click, wait } = h;
  const label = (text) => `${theme} / ${enabled}：${text}`;
  const live = "window.transitionSamples.filter(a=>a.playState!=='idle')";
  await click('工作台', 'document.querySelector(".studio-titlebar")');
  await e('document.querySelectorAll(".wb-tab")[0].click()');
  await wait('!document.querySelector(".nps-transition-snapshot")');
  await e('document.querySelector(".wb-document-scroll").scrollTop=60');
  await e('new Promise(resolve=>requestAnimationFrame(resolve))');
  const scroll = await e('document.querySelector(".wb-document-scroll").scrollTop');
  const selector =
    '.wb-tab-indicator,.wb-image-transition,.wb-prompt-transition,.nps-transition-snapshot';
  await capture(h, selector, () => e('document.querySelectorAll(".wb-tab")[1].click()'));
  await check(
    label('标签底框只移动，图片朝右进入，提示词只淡入且同时启动'),
    `(()=>{const live=${live};const find=s=>live.find(a=>a.effect.target.matches(s));const mark=find('.wb-tab-indicator'),image=find('.wb-image-transition'),prompt=find('.wb-prompt-transition');return ${enabled ? "!!mark && !!image && !!prompt && mark.effect.getKeyframes().every(f=>'transform' in f && !('opacity' in f)) && new DOMMatrix(image.effect.getKeyframes()[0].transform).m41>0 && prompt.effect.getKeyframes().every(f=>!('transform' in f))" : 'live.length===0'} && document.querySelectorAll('.wb-tab')[1].getAttribute('aria-selected')==='true'})()`,
    undefined,
    'once',
  );
  await finish(h);
  await capture(h, selector, () => e('document.querySelectorAll(".wb-tab")[0].click()'));
  await check(
    label('反向切换保留各标签的提示词滚动位置'),
    `${scroll}>0 && document.querySelector('.wb-document-scroll').scrollTop===${scroll} && ${enabled ? `${live}.some(a=>a.effect.target.matches('.wb-image-transition') && new DOMMatrix(a.effect.getKeyframes()[0].transform).m41<0)` : `${live}.length===0`}`,
    undefined,
    'once',
  );
  await finish(h);
  await capture(h, selector, async () => {
    for (let i = 0; i < 5; i++) await h.key('Tab', { ctrlKey: true });
  });
  await check(
    label('连续 Ctrl+Tab 不堆积旧画面，最后标签可立即操作'),
    "document.querySelectorAll('.nps-transition-snapshot[data-transition-source*=wb-image-transition],.nps-transition-snapshot[data-transition-source*=wb-prompt-transition]').length<=2 && !!document.querySelector('.wb-prompt') && !!document.querySelector('.wb-tab[aria-selected=true]')",
    "[...document.querySelectorAll('.nps-transition-snapshot')].map(n=>n.dataset.transitionSource)",
    'once',
  );
  await finish(h);
  await e('document.querySelector(".wb-document-scroll").scrollTop=0');
  await capture(h, '.wb-section .nps-transition-height,.nps-transition-snapshot', () =>
    e('document.querySelector(".wb-section [aria-expanded]").click()'),
  );
  await check(
    label('节收起立即改变状态，过渡只有高度和透明度'),
    `document.querySelector('.wb-section [aria-expanded]').getAttribute('aria-expanded')==='false' && ${enabled ? `${live}.some(a=>a.effect.getKeyframes().every(f=>'height' in f && 'opacity' in f && !('transform' in f)))` : `${live}.length===0`}`,
    undefined,
    'once',
  );
  await finish(h);
  await e('document.querySelector(".wb-section [aria-expanded]").click()');
  await wait('!document.querySelector(".nps-transition-snapshot")');
  await capture(h, '.wb-section .nps-transition-height,.nps-transition-snapshot', () =>
    e('document.querySelector("[aria-label=编辑段落]").click()'),
  );
  await check(
    label('段落编辑展开，编辑器立刻可用'),
    `!!document.querySelector('.wb-paragraph-editor textarea') && ${live}.length${enabled ? '>0' : '===0'}`,
    undefined,
    'once',
  );
  await finish(h);
  await click('取消', 'document.querySelector(".wb-paragraph-editor")');
  await wait('!document.querySelector(".nps-transition-snapshot")');
  await wait('!document.querySelector(".nps-toast")');
  const notices = '.nps-notification-presence,.nps-toast,.nps-transition-snapshot';
  await capture(h, notices, () => e('document.querySelector(".wb-copy-bar button").click()'));
  await check(
    label('通知首次进入使用下方两倍位移'),
    `!!document.querySelector('.nps-toast') && ${enabled ? `${live}.some(a=>a.effect.target.matches('.nps-notification-presence') && new DOMMatrix(a.effect.getKeyframes()[0].transform).m42===parseFloat(getComputedStyle(a.effect.target).getPropertyValue('--enter-shift'))*2)` : `${live}.length===0`}`,
    undefined,
    'once',
  );
  await e(
    'document.querySelector(".nps-toast").dispatchEvent(new PointerEvent("pointerover",{bubbles:true}))',
  );
  if (enabled) await sequence(h, 'transition-notice-enter-' + theme);
  await finish(h);
  await capture(h, notices, () =>
    e('document.querySelector(".wb-section [aria-label=复制这一节]").click()'),
  );
  await check(
    label('通知替换原地换内容，不重复滑入'),
    `${enabled ? `${live}.length>=2 && ${live}.every(a=>a.effect.getKeyframes().every(f=>!('transform' in f)))` : `${live}.length===0`} && !!document.querySelector('.nps-toast')`,
    undefined,
    'once',
  );
  if (enabled) await sequence(h, 'transition-notice-replace-' + theme);
  await finish(h);
  await capture(h, '.nps-transition-snapshot', async () => {
    await e(
      'document.querySelector(".nps-toast").dispatchEvent(new PointerEvent("pointerout",{bubbles:true}))',
    );
    await wait('!document.querySelector(".nps-toast")');
  });
  await check(
    label('通知到期立即移除，视觉退出只淡出'),
    enabled
      ? `${live}.length>0 && ${live}.every(a=>a.effect.getKeyframes().every(f=>'opacity' in f && !('transform' in f)))`
      : `${live}.length===0`,
    undefined,
    'once',
  );
  await finish(h);
}
