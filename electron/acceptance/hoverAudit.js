import fs from 'node:fs/promises';
import path from 'node:path';
import { observeStatePaint, persistStateAudit } from './stateAudit.js';

// Focus containers and delegated gesture surfaces are not activatable controls.
// Keep these explicit and in the inventory, rather than silently ignoring listeners.
const passive = {
  '.nps-tip,[role="tooltip"]': '非交互提示层',
  '.wb-paragraph-editor': 'React 复用节点保留的空点击监听；编辑操作由子控件提供',
  '#root': 'React 事件委托根节点',
  body: '全局事件委托和浮层关闭范围',
  '.nps-demo-hover,.nps-demo-focus,.nps-demo-active':
    '展示页预设静态状态样例；动态状态由普通实例验证',
  '[data-showcase]': '组件展示页事件委托容器',
  '.library-scroll': '空白区取消选择和框选，不是可激活的行',
  '.library-viewer': '查看器键盘事件范围',
  '[role="tabpanel"]': '键盘可到达的内容区域',
  '[role="dialog"],dialog': '对话框焦点范围',
  '.wb-document-scroll': '提示词框选与空白区取消选择',
};
const kindExpression = `(n)=>{
  if(n.matches('.nps-tag,.wb-sortable-tag'))return 'tag';
  if(n.matches('.nps-button'))return 'button-'+([...n.classList].find(c=>/^nps-button-(default|quiet|ink|cinnabar|danger|danger-outline)$/.test(c))||'default');
  if(n.matches('input'))return n.type==='range'?'slider':n.closest('.nps-stepper')?'stepper-input':'input';
  if(n.matches('textarea'))return 'textarea';
  if(n.matches('.nps-surface-image'))return 'thumbnail';
  if(n.matches('.library-pick'))return 'image-checkbox';
  if(n.matches('.library-card'))return 'image-card';
  if(n.matches('.nps-surface-chip'))return 'filter-chip';
  if(n.matches('.nps-surface-row'))return 'navigation-row';
  if(n.matches('.wb-tab'))return 'workbench-tab';
  if(n.matches('[role="tab"]'))return 'tab';
  if(n.matches('.nps-select'))return 'select';
  if(n.matches('.nps-option'))return 'option';
  if(n.matches('.nps-switch'))return 'switch';
  if(n.matches('.nps-checkbox'))return 'checkbox';
  if(n.matches('.nps-menu-item'))return 'menu-item';
  if(n.matches('.nps-resizer'))return 'resizer';
  if(n.matches('summary'))return 'disclosure';
  if(n.matches('img[role="button"]'))return 'image-preview';
  if(n.matches('[aria-label="编辑段落"]'))return 'paragraph';
  if(n.closest('.nps-stepper'))return 'stepper-button';
  if(n.closest('.nps-toast'))return 'toast-action';
  if(n.matches('a'))return 'external-link';
  return n.classList[0]||n.tagName.toLowerCase();
}`;

export async function hoverAudit(h, mode, name) {
  h.category('悬停态覆盖');
  const cdp = h.window.webContents.debugger;
  const send = (method, params) => cdp.sendCommand(method, params);
  await send('DOM.enable');
  await send('CSS.enable');
  let failures = [];
  await h.check(
    name + '：所有可点击元素有悬停和按下反馈，禁用元素保持不变',
    async () => {
      failures = [];
      const theme = mode.themeDriver.get();
      await h.evaluate('window.statePaintPrevious=new Map();window.statePaintRecords=[]');
      // A closing popover can restore focus when its exit finishes. Settle it
      // before clearing focus, otherwise that restoration can reopen a tooltip.
      await h.wait(
        '[...document.querySelectorAll(".nps-layer[aria-hidden=true]")].every(n=>!n.checkVisibility({checkVisibilityCSS:true}))',
        '关闭浮层退出后扫描',
      );
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
      await h.evaluate('document.activeElement?.blur(); window.dispatchEvent(new Event("blur"))');
      await h.wait(
        '!document.querySelector(".nps-tip:popover-open")',
        '悬停提示关闭后审计稳定节点',
      );
      await h.evaluate(
        `(()=>{document.querySelectorAll('[data-hover-audit]').forEach(n=>n.removeAttribute('data-hover-audit'));let i=0;for(const n of document.querySelectorAll('button,a[href],input,textarea,select,summary,[tabindex],[role="button"],[role="tab"],[role="option"],[role="radio"],[role="checkbox"],[role="switch"],[role="menuitem"],[role="slider"],[role="spinbutton"]'))n.dataset.hoverAudit=String(++i);for(const n of document.querySelectorAll('.library-count,.library-fan img,.library-block-label,.wb-block header > span:first-child,.settings-page-head h1,.nps-tag:not([data-interactive])')){if(n.closest('.nps-menu-trigger'))continue;n.dataset.hoverAudit=String(++i);n.dataset.hoverStatic='true'}window.__hoverAuditNext=i;})()`,
      );
      const { result: body } = await send('Runtime.evaluate', { expression: 'document.body' });
      const { listeners } = await send('DOMDebugger.getEventListeners', {
        objectId: body.objectId,
        depth: -1,
        pierce: true,
      });
      for (const listener of listeners) {
        if (
          !['click', 'dblclick', 'contextmenu'].includes(listener.type) ||
          !listener.backendNodeId
        )
          continue;
        const { object } = await send('DOM.resolveNode', { backendNodeId: listener.backendNodeId });
        await send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration:
            'function(){if(this instanceof Element&&!this.dataset.hoverAudit)this.dataset.hoverAudit=String(++window.__hoverAuditNext)}',
        });
        await send('Runtime.releaseObject', { objectId: object.objectId });
      }
      await send('Runtime.releaseObject', { objectId: body.objectId });
      const items = await h.evaluate(`(()=>{
      const passive=${JSON.stringify(passive)}, kind=${kindExpression};
      return [...document.querySelectorAll('[data-hover-audit]')].filter(n=>n.checkVisibility({checkVisibilityCSS:true})&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0).map(n=>({
        id:n.dataset.hoverAudit,kind:kind(n),tag:n.tagName,classes:n.className?.baseVal??n.className,
        label:(n.getAttribute('aria-label')||n.getAttribute('data-tip')||n.textContent||'').trim().slice(0,100),
        passive:Object.entries(passive).find(([s])=>n.matches(s))?.[1],
        static:n.dataset.hoverStatic==='true',
        disabled:n.matches(':disabled,[aria-disabled="true"]')||!!n.closest('[inert]')
      }));
    })()`);
      const inventory = [];
      const examples = (mode.hoverExamples ||= {});
      const capture = async (item, state) => {
        if (item.static || item.kind === 'nps-menu-trigger' || item.kind === 'tr') return;
        const key = theme + '-' + item.kind + '-' + state;
        if (examples[key]) return;
        const clip = await h.evaluate(`(()=>{
          const n=document.querySelector('[data-hover-audit="${item.id}"]');if(!n)return null;
          const host=n.matches('input:not([type="range"])')?n.closest('.nps-field')||n:n;
          host.scrollIntoView({block:'nearest',inline:'nearest'});
          const r=host.getBoundingClientRect(),pad=parseFloat(getComputedStyle(host).getPropertyValue('--sp-2'))||8;
          const x=Math.max(0,Math.floor(r.x-pad)),y=Math.max(0,Math.floor(r.y-pad));
          return {x,y,width:Math.min(innerWidth-x,Math.ceil(r.width+2*pad)),height:Math.min(innerHeight-y,Math.ceil(r.height+2*pad))};
        })()`);
        if (!clip || clip.width <= 0 || clip.height <= 0) return;
        await h.evaluate(
          'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
        );
        const image = await h.window.webContents.capturePage(clip);
        const file = 'state-' + key + '.png';
        await fs.writeFile(path.join(mode.output, file), image.toPNG());
        examples[key] = {
          file,
          name,
          kind: item.kind,
          state,
          theme,
          label: item.label,
          disabledProbe: state === 'disabled' && !item.disabled,
        };
      };
      const read = (id, state = 'baseline') =>
        h.evaluate(`(()=>{
      const n=document.querySelector('[data-hover-audit="${id}"]');if(!n)return null;
      const host=n.matches('input:not([type="range"])')?n.closest('.nps-field')||n:n;
      (${observeStatePaint.toString()})(host,${JSON.stringify(id)},${JSON.stringify(state)});
      const nodes=[host,...host.querySelectorAll('*')];
      for(const x of nodes)for(const a of x.getAnimations())if(a.effect?.getTiming().iterations!==Infinity)a.finish();
      const paint=s=>({backgroundColor:s.backgroundColor,color:s.color,boxShadow:s.boxShadow,opacity:s.opacity,
        border:['Top','Right','Bottom','Left'].map(side=>s['border'+side+'Style']!=='none'&&parseFloat(s['border'+side+'Width'])>0?[s['border'+side+'Color'],s['border'+side+'Width']]:null),
        outline:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0?[s.outlineColor,s.outlineWidth,s.outlineOffset]:null});
      return nodes.filter(x=>x.checkVisibility({checkVisibilityCSS:true})).flatMap(x=>[paint(getComputedStyle(x)),...['::before','::after'].map(p=>getComputedStyle(x,p)).filter(s=>s.content!=='none'&&s.content!=='normal').map(paint)]);
    })()`);
      for (const item of items) {
        if (item.passive) {
          inventory.push(item);
          continue;
        }
        // Scroll/capture can update React nodes; resolve the current tree for each control.
        const { root } = await send('DOM.getDocument', { depth: 0 });
        const found = await send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: '[data-hover-audit="' + item.id + '"]',
        });
        let node = found;
        if (item.kind === 'slider' && found.nodeId) {
          const tree = await send('DOM.getDocument', { depth: -1, pierce: true });
          const locate = (n) =>
            n.attributes?.[n.attributes.indexOf('data-hover-audit') + 1] === item.id
              ? n
              : [...(n.children || []), ...(n.shadowRoots || [])].map(locate).find(Boolean);
          node = locate(tree.root);
        }
        if (!node?.nodeId) {
          failures.push({ ...item, error: 'DOM 节点丢失' });
          continue;
        }
        // Real pointer hover also hovers the ancestor that reveals an overlay control.
        const revealId = await h.evaluate(`(()=>{
          const n=document.querySelector('[data-hover-audit="${item.id}"]');
          const host=n.matches('.library-pick')?n.closest('.library-card'):n.closest('.wb-add-block-gap');
          if(!host)return null;
          if(!host.dataset.hoverAudit)host.dataset.hoverAudit=String(++window.__hoverAuditNext);
          return host.dataset.hoverAudit;
        })()`);
        const reveal = revealId
          ? (
              await send('DOM.querySelector', {
                nodeId: root.nodeId,
                selector: '[data-hover-audit="' + revealId + '"]',
              })
            ).nodeId
          : null;
        if (reveal)
          await send('CSS.forcePseudoState', { nodeId: reveal, forcedPseudoClasses: ['hover'] });
        const extraId = await h.evaluate(`(()=>{
  const n=document.querySelector('[data-hover-audit="${item.id}"]');
  const e=n?.matches('input:not([type="range"])')?n.closest('.nps-field'):n?.matches('.nps-menu-trigger')?n.querySelector('.library-card,button,[role="tab"]'):null;
  if(!e)return null;
  if(!e.dataset.hoverAudit)e.dataset.hoverAudit=String(++window.__hoverAuditNext);
  return e.dataset.hoverAudit;
})()`);
        const extra = extraId
          ? (
              await send('DOM.querySelector', {
                nodeId: root.nodeId,
                selector: '[data-hover-audit="' + extraId + '"]',
              })
            ).nodeId
          : null;
        const pseudo = async (states) => {
          for (const id of new Set([node.nodeId, extra].filter(Boolean)))
            await send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: states });
        };
        // Native range paint lives in the UA shadow tree; include it in comparisons.
        const shadowIds = [];
        const gather = (n) => {
          if (n.nodeId && n.nodeType === 1) shadowIds.push(n.nodeId);
          for (const x of n.children || []) gather(x);
        };
        if (item.kind === 'slider') for (const shadow of node.shadowRoots || []) gather(shadow);
        const snapshot = async (state = 'baseline') => {
          const normal = await read(item.id, state);
          const shadow = [];
          for (const nodeId of shadowIds) {
            const result = await send('CSS.getComputedStyleForNode', { nodeId });
            shadow.push(
              result.computedStyle.filter((p) =>
                ['background-color', 'border-top-color', 'box-shadow', 'opacity'].includes(p.name),
              ),
            );
          }
          return JSON.stringify([normal, shadow]);
        };
        await pseudo([]);
        const baseline = await snapshot();
        if (item.disabled) await capture(item, 'disabled');
        const result = { ...item, states: {} };
        for (const state of item.disabled || item.static
          ? ['hover', 'active']
          : ['hover', 'active', 'focus-visible']) {
          await pseudo([state]);
          const painted = await snapshot(state);
          const changed = painted !== baseline;
          const movingCurrent = await h.evaluate(
            `(()=>{const n=document.querySelector('[data-hover-audit="${item.id}"]'),s='.library-side-item.on,.settings-sidebar button[aria-current="page"],.settings-dictionary-views button[aria-selected="true"],.nps-option[aria-checked="true"],.nps-tablist button[aria-selected="true"],.wb-tab[aria-selected="true"]';return n.matches(s)||!!n.querySelector(s)})()`,
          );
          const feedback =
            state === 'focus-visible'
              ? JSON.parse(painted)[0]?.some((s) => s.outline !== null)
              : movingCurrent || changed;
          result.states[state] = feedback;
          if (!item.disabled) await capture(item, state);
          if (item.disabled || item.static ? changed : !feedback)
            failures.push({
              ...item,
              state,
              error: item.static
                ? '纯展示内容发生变化'
                : item.disabled
                  ? '禁用控件发生变化'
                  : '没有可见反馈',
            });
        }
        await pseudo([]);
        await snapshot('leave');
        if (
          !item.disabled &&
          !item.static &&
          !examples[theme + '-' + item.kind + '-disabled'] &&
          !['nps-menu-trigger', 'tr'].includes(item.kind)
        ) {
          // Paint-only probe. Restore attributes immediately; no business action or React state is replaced.
          const saved = await h.evaluate(
            `(()=>{const n=document.querySelector('[data-hover-audit="${item.id}"]');const saved={disabled:n.getAttribute('disabled'),aria:n.getAttribute('aria-disabled')};n.setAttribute('disabled','');n.setAttribute('aria-disabled','true');return saved})()`,
          );
          try {
            await snapshot();
            await capture(item, 'disabled');
          } finally {
            await h.evaluate(
              `(()=>{const n=document.querySelector('[data-hover-audit="${item.id}"]');for(const [key,value] of [['disabled',${JSON.stringify(saved.disabled)}],['aria-disabled',${JSON.stringify(saved.aria)}]])value===null?n.removeAttribute(key):n.setAttribute(key,value)})()`,
            );
          }
        }
        if (reveal) await send('CSS.forcePseudoState', { nodeId: reveal, forcedPseudoClasses: [] });
        inventory.push(result);
      }
      await fs.writeFile(
        path.join(mode.output, `hover-${name}-${theme}.json`),
        JSON.stringify({ name, theme, listeners: listeners.length, inventory, failures }, null, 2),
      );
      await fs.writeFile(
        path.join(mode.output, 'hover-state-images.json'),
        JSON.stringify(Object.values(examples), null, 2),
      );
      await persistStateAudit(h, mode, name, theme);
      return failures.length === 0;
    },
    () => failures,
  );
}
