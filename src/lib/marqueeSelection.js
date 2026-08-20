export const MARQUEE_DRAG_THRESHOLD = 4;

export function encodeMarqueeKey(value) {
  return encodeURIComponent(String(value ?? ''));
}

export function decodeMarqueeKey(value) {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch {
    return String(value ?? '');
  }
}

export function marqueeRect(start, end) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const right = Math.max(start.x, end.x);
  const bottom = Math.max(start.y, end.y);
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

export function rectanglesIntersect(first, second) {
  return first.left <= second.right
    && first.right >= second.left
    && first.top <= second.bottom
    && first.bottom >= second.top;
}

export function marqueeSelection(initialKeys = [], hitKeys = [], mode = 'replace') {
  const initial = [...new Set(initialKeys)];
  const hits = [...new Set(hitKeys)];
  if (mode === 'add') return [...new Set([...initial, ...hits])];
  if (mode === 'toggle') {
    const hitSet = new Set(hits);
    const initialSet = new Set(initial);
    return [
      ...initial.filter((key) => !hitSet.has(key)),
      ...hits.filter((key) => !initialSet.has(key)),
    ];
  }
  return hits;
}

export function marqueeMode(event) {
  if (event.ctrlKey || event.metaKey) return 'toggle';
  if (event.shiftKey) return 'add';
  return 'replace';
}
