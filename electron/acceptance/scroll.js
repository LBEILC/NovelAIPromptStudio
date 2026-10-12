export async function scrollChecks(h, selector) {
  const { evaluate: e, wait, check } = h;
  const node = `document.querySelector(${JSON.stringify(selector)})`;
  const thumb = `${node}.querySelector('.nps-scroll-thumb')`;
  await check(
    '滚动容器隐藏系统滚动条且细条不参与键盘和读屏',
    `getComputedStyle(${node}).scrollbarWidth==='none' && getComputedStyle(${node},'::-webkit-scrollbar').width==='0px' && ${thumb}.tabIndex===-1 && ${thumb}.getAttribute('aria-hidden')==='true'`,
  );
  await e(`${node}.scrollTop=0`);
  await wait(`${node}.scrollTop===0`);
  await e(`${node}.scrollTop=100`);
  await wait(`${thumb}.dataset.visible==='true'`);
  await h.checkSoon(
    '滚动后细条出现并保持在滚动视口内',
    `(()=>{const n=${node},t=${thumb},a=n.getBoundingClientRect(),b=t.getBoundingClientRect();return b.top>=a.top && b.bottom<=a.bottom+1 && !t.hidden})()`,
  );
  await wait(`!${thumb}.dataset.visible`);
  await check('停下后细条按令牌期限淡出', `!${thumb}.dataset.visible`);
  await e(`${node}.dispatchEvent(new PointerEvent('pointermove',{bubbles:true}))`);
  const point = await e(
    `(()=>{const r=${thumb}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  const mouse = (type, y) =>
    h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
    });
  await mouse('mousePressed', point.y);
  const pressed = await e(
    `({dragging:${thumb}.dataset.dragging,hit:document.elementFromPoint(${point.x},${point.y})?.className,top:${node}.scrollTop})`,
  );
  await mouse('mouseMoved', point.y + 40);
  await mouse('mouseReleased', point.y + 40);
  await check('拖动细条能滚动内容', `${node}.scrollTop>100`, async () => ({
    pressed,
    current: await e(
      `({top:${node}.scrollTop,height:${node}.scrollHeight,viewport:${node}.clientHeight})`,
    ),
  }));
  await e(`${node}.scrollTop=${node}.scrollHeight`);
  await wait(`${node}.scrollTop>=${node}.scrollHeight-${node}.clientHeight-1`);
  await h.checkSoon(
    '窗口化列表滚到底时细条到轨道底部',
    `(()=>{const n=${node},t=${thumb},a=n.getBoundingClientRect(),b=t.getBoundingClientRect(),inset=parseFloat(getComputedStyle(n).getPropertyValue('--sb-inset'));return Math.abs(a.bottom-b.bottom-inset)<2})()`,
  );
  const reduced = await e('matchMedia("(prefers-reduced-motion: reduce)").matches');
  await h.window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await check(
    '减少动态效果时细条没有过渡',
    `getComputedStyle(${thumb}).transitionDuration.split(',').every(t=>parseFloat(t)===0)`,
  );
  await h.window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }],
  });
}
