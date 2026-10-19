import fs from 'node:fs/promises';
import path from 'node:path';

/** Runs inside Chromium. Read actual transition declarations as well as live effects:
 * a slow CI host may miss a short effect, so broad coverage is evidence, not a timing gate.
 */
export function observeStatePaint(host, id, trigger) {
  const nodes = [host, ...host.querySelectorAll('*')];
  const visible = nodes.filter((n) => n.checkVisibility({ checkVisibilityCSS: true }));
  const effects = nodes.flatMap((n) =>
    n.getAnimations().map((a) => ({ node: n, keys: a.effect?.getKeyframes() ?? [] })),
  );
  for (const n of nodes)
    for (const a of n.getAnimations())
      if (a.effect?.getTiming().iterations !== Infinity) a.finish();
  const properties = [
    'backgroundColor',
    'color',
    'boxShadow',
    'opacity',
    'outlineColor',
    'outlineWidth',
    'outlineOffset',
    'borderTopColor',
    'borderTopWidth',
    'borderRightColor',
    'borderRightWidth',
    'borderBottomColor',
    'borderBottomWidth',
    'borderLeftColor',
    'borderLeftWidth',
  ];
  const cssName = (p) => p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  const supported = (node, property) => {
    for (let n = node; n; n = n.parentElement) {
      const s = getComputedStyle(n),
        names = s.transitionProperty.split(',').map((p) => p.trim()),
        times = s.transitionDuration.split(',').map(parseFloat);
      if (
        names.some(
          (name, i) =>
            (name === 'all' ||
              name === cssName(property) ||
              (name === 'border-color' && property.startsWith('border')) ||
              (name === 'outline' && property.startsWith('outline'))) &&
            times[i % times.length] > 0,
        )
      )
        return true;
      if (property !== 'color') break;
    }
    return effects.some(
      (e) => (e.node === node || e.node.contains(node)) && e.keys.some((k) => property in k),
    );
  };
  const current = visible.map((n) => {
    const s = getComputedStyle(n);
    return {
      node: n,
      paint: {
        ...Object.fromEntries(properties.map((p) => [p, s[p]])),
        outlineStyle: s.outlineStyle,
      },
    };
  });
  window.statePaintPrevious ??= new Map();
  window.statePaintRecords ??= [];
  const previous = window.statePaintPrevious.get(id);
  if (previous) {
    for (const { node, paint } of current) {
      const old = previous.find((item) => item.node === node)?.paint;
      if (!old) continue;
      for (const property of properties) {
        if (old[property] === paint[property]) continue;
        if (
          property.startsWith('outline') &&
          (parseFloat(old.outlineWidth) === 0 || old.outlineStyle === 'none') &&
          (parseFloat(paint.outlineWidth) === 0 || paint.outlineStyle === 'none')
        )
          continue;
        if (
          property.startsWith('border') &&
          parseFloat(paint[property.replace('Color', 'Width')]) === 0
        )
          continue;
        window.statePaintRecords.push({
          trigger,
          kind: '状态',
          control: host.getAttribute('aria-label') || host.textContent.trim().slice(0, 60),
          element: node.getAttribute('class') || node.tagName,
          property,
          from: old[property],
          to: paint[property],
          transition: supported(node, property),
          off:
            document.documentElement.dataset.motion === 'off' ||
            (document.documentElement.dataset.motion !== 'full' &&
              matchMedia('(prefers-reduced-motion: reduce)').matches),
        });
      }
    }
  }
  window.statePaintPrevious.set(id, current);
}

export async function persistStateAudit(h, mode, name, theme) {
  const records = await h.evaluate('window.statePaintRecords||[]');
  const review = records.filter((r) => !r.off && !r.transition);
  await fs.writeFile(
    path.join(mode.output, `state-changes-${name}-${theme}.json`),
    JSON.stringify({ name, theme, records, review }, null, 2),
  );
  console.log(
    `状态变化审计 ${name}/${theme}：${records.length} 次绘制变化，${review.length} 次需要核对。`,
  );
}

// Alongside hover probes, capture real select/expand/switch/add/remove operations.
// Node identities distinguish replacement from a resize; geometry is read after settling.
export function beginStateOperation(selector) {
  const read = (n) => {
    const r = n.getBoundingClientRect(),
      s = getComputedStyle(n);
    return {
      node: n,
      ancestors: (() => {
        const result = [];
        for (let p = n; p; p = p.parentElement) result.push({ node: p, className: p.className });
        return result;
      })(),
      element: n.getAttribute('class') || n.tagName,
      text: (n.getAttribute('aria-label') || n.textContent || '').slice(0, 60),
      rect: [r.x, r.y, r.width, r.height],
      opacity: s.opacity,
      color: s.color,
      backgroundColor: s.backgroundColor,
      borderColor: s.borderColor,
      outlineColor: s.outlineColor,
    };
  };
  window.stateOperationRead = read;
  window.stateOperationBefore = [
    ...document.querySelectorAll('.app-content *,dialog[open] *,.nps-layer:popover-open *'),
  ]
    .filter((n) => n.checkVisibility({ checkVisibilityCSS: true }))
    .map(read);
  window.stateOperationSelector = selector;
}

export function endStateOperation() {
  const old = window.stateOperationBefore || [],
    read = window.stateOperationRead;
  if (!read) return;
  const after = [
    ...document.querySelectorAll('.app-content *,dialog[open] *,.nps-layer:popover-open *'),
  ]
    .filter((n) => n.checkVisibility({ checkVisibilityCSS: true }))
    .map(read);
  const samples = window.stateOperationEffects || window.transitionSamples || [];
  const effects = samples.map((a) => ({ target: a.effect.target, keys: a.effect.getKeyframes() }));
  const supports = (record, p) =>
    effects.some(
      (a) =>
        (record.ancestors.some((parent) => parent.node === a.target) ||
          (a.target.matches('.nps-transition-snapshot') &&
            record.ancestors.some(
              (parent) => parent.className === a.target.dataset.transitionSource,
            ))) &&
        a.keys.some((k) => p in k || (p === 'rect' && ('transform' in k || 'height' in k))),
    );
  const changes = [];
  for (const next of after) {
    const before = old.find((p) => p.node === next.node);
    if (!before) {
      changes.push({
        kind: '出现',
        element: next.element,
        text: next.text,
        transition: supports(next, 'opacity'),
      });
      continue;
    }
    for (const property of [
      'rect',
      'opacity',
      'color',
      'backgroundColor',
      'borderColor',
      'outlineColor',
    ])
      if (JSON.stringify(before[property]) !== JSON.stringify(next[property])) {
        const s = getComputedStyle(next.node),
          css = property.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
        changes.push({
          kind: property === 'rect' ? '移动或展开' : '状态',
          element: next.element,
          text: next.text,
          property,
          from: before[property],
          to: next[property],
          transition:
            supports(next, property) ||
            s.transitionProperty
              .split(',')
              .some(
                (p, i) =>
                  (p.trim() === css || p.trim() === 'all') &&
                  parseFloat(
                    s.transitionDuration.split(',')[i % s.transitionDuration.split(',').length],
                  ) > 0,
              ),
        });
      }
  }
  for (const before of old)
    if (!after.some((p) => p.node === before.node))
      changes.push({
        kind: '消失或换内容',
        element: before.element,
        text: before.text,
        transition: supports(before, 'opacity'),
      });
  window.stateOperationRecords ??= [];
  window.stateOperationRecords.push({
    selector: window.stateOperationSelector,
    theme: document.documentElement.dataset.theme,
    motion: document.documentElement.dataset.motion,
    changes,
  });
  window.stateOperationBefore = [];
}

export async function persistOperations(h, mode) {
  const records = await h.evaluate('window.stateOperationRecords||[]');
  await fs.writeFile(
    path.join(mode.output, 'state-operations.json'),
    JSON.stringify(records, null, 2),
  );
}
