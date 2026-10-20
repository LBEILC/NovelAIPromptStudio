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

  await e(`${node}.dispatchEvent(new PointerEvent('pointermove',{bubbles:true}))`);
  await wait(
    `(()=>{const n=${thumb},r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n})()`,
    '细条已可接收拖动',
  );
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
}
