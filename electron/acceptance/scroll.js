export async function scrollChecks(h, selector) {
  const { evaluate: e, wait, check } = h;
  const node = `document.querySelector(${JSON.stringify(selector)})`;
  const thumb = `document.querySelector('.sb')`;

  await e(`${node}.scrollTop=0`);
  await wait(`${node}.scrollTop===0`);
  await e(`${node}.scrollTop=100`);
  await e(
    `${node}.dispatchEvent(new PointerEvent('pointermove',{bubbles:true}));${thumb}.dispatchEvent(new PointerEvent('pointerenter'))`,
  );
  await wait(`${thumb}.classList.contains('show')`);

  await e(`${node}.dispatchEvent(new PointerEvent('pointermove',{bubbles:true}))`);
  await wait(
    `(()=>{const n=${thumb},r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n})()`,
    '细条已可接收拖动',
  );
  // Dispatch the drag in one renderer turn so layout changes between IPC calls
  // cannot move the thumb away from a previously sampled screen coordinate.
  const pressed = await e(
    `(()=>{const n=${thumb},r=n.getBoundingClientRect(),y=r.y+r.height/2;
      n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientY:y}));
      const pressed={dragging:n.classList.contains('drag'),top:${node}.scrollTop};
      window.dispatchEvent(new PointerEvent('pointermove',{clientY:y+40}));
      window.dispatchEvent(new PointerEvent('pointerup',{button:0,clientY:y+40}));
      n.dispatchEvent(new PointerEvent('pointerleave'));
      return pressed;})()`,
  );
  await check('拖动细条能滚动内容', `${node}.scrollTop>100`, async () => ({
    pressed,
    current: await e(
      `({top:${node}.scrollTop,height:${node}.scrollHeight,viewport:${node}.clientHeight})`,
    ),
  }));
}
