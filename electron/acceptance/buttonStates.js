export async function buttonStateChecks(h) {
  const cdp = h.window.webContents.debugger;
  await cdp.sendCommand('DOM.enable');
  await cdp.sendCommand('CSS.enable');
  await cdp.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  const { root } = await cdp.sendCommand('DOM.getDocument');
  const variants = {
    default: ['var(--surface)', 'var(--hover)', 'var(--selected)', 'var(--text)', 'var(--border)'],
    ink: ['var(--ink)', 'var(--ink-hover)', 'var(--ink-hover)', 'var(--on-ink)', 'var(--ink)'],
    cinnabar: [
      'var(--cinnabar)',
      'var(--cinnabar-hover)',
      'var(--cinnabar-hover)',
      'var(--on-cinnabar)',
      'var(--cinnabar)',
    ],
    quiet: ['transparent', 'var(--hover)', 'var(--selected)', 'var(--text-2)', 'transparent'],
    danger: [
      'transparent',
      'var(--danger-wash)',
      'var(--danger-wash)',
      'var(--danger)',
      'transparent',
    ],
    'danger-outline': [
      'var(--surface)',
      'var(--danger-wash)',
      'var(--danger-wash)',
      'var(--danger)',
      'color-mix(in srgb, var(--danger) 40%, var(--border))',
    ],
  };
  for (const [variant, [normal, hover, pressed, color, border]] of Object.entries(variants)) {
    const selector = `[data-button-state-probe] [aria-label="状态验收 ${variant}"]`;
    const { nodeId } = await cdp.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    await h.evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'});document.activeElement.blur()`,
    );
    for (const state of ['hover', 'active', 'focus-visible', 'expanded', 'disabled']) {
      let target = selector;
      if (state === 'disabled')
        target = `[data-button-state-probe] [aria-label="不可用验收 ${variant}"]`;
      const id =
        state === 'disabled'
          ? (await cdp.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: target }))
              .nodeId
          : nodeId;
      await cdp.sendCommand('CSS.forcePseudoState', {
        nodeId: id,
        forcedPseudoClasses:
          state === 'expanded' ? [] : state === 'disabled' ? ['hover', 'active'] : [state],
      });
      if (state === 'expanded') {
        await h.click(`状态验收 ${variant}`);
        await h.wait('!!document.querySelector(".nps-menu:popover-open")');
      }
      if (state === 'focus-visible')
        await h.evaluate(`document.querySelector(${JSON.stringify(target)}).focus()`);
      const bg =
        state === 'disabled'
          ? 'var(--hover)'
          : state === 'active' && variant === 'default'
            ? 'var(--selected)'
            : state === 'hover'
              ? hover
              : state === 'focus-visible'
                ? normal
                : pressed;
      const fg =
        state === 'disabled'
          ? 'var(--text-off)'
          : variant === 'quiet' && state !== 'focus-visible'
            ? 'var(--text)'
            : color;
      const edge =
        state === 'disabled'
          ? 'transparent'
          : ['ink', 'cinnabar'].includes(variant) && state !== 'focus-visible'
            ? bg
            : border;
      await h.check(
        `按钮 ${variant} · ${state}：背景、文字、边框与自身样式一致`,
        `(async()=>{
        const n=document.querySelector(${JSON.stringify(target)}); await Promise.allSettled(n.getAnimations().map(a=>a.finished));
        const probe=document.createElement('span');probe.style.background=${JSON.stringify(bg)};probe.style.color=${JSON.stringify(fg)};probe.style.borderColor=${JSON.stringify(edge)};document.body.append(probe);
        const s=getComputedStyle(n),p=getComputedStyle(probe),correct=s.backgroundColor===p.backgroundColor&&s.color===p.color&&s.borderTopColor===p.borderTopColor;
        probe.remove();return correct&&(${JSON.stringify(state)}!=='focus-visible'||s.outlineStyle==='solid')&&s.transform==='none';
      })()`,
        `(()=>{const n=document.querySelector(${JSON.stringify(target)}),s=getComputedStyle(n);return {background:s.backgroundColor,color:s.color,border:s.borderTopColor,outline:s.outlineStyle,transform:s.transform}})()`,
      );
      await cdp.sendCommand('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: [] });
      if (state === 'expanded') await h.nativeKey('Escape');
      await h.evaluate('document.activeElement.blur()');
    }
  }
}
