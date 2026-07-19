const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number']);

export function isTextEditingTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  const editable = target.closest('textarea, input, [contenteditable="true"]');
  if (!editable) return false;
  if (editable.matches('textarea, [contenteditable="true"]')) return true;
  return TEXT_INPUT_TYPES.has(String(editable.type || '').toLowerCase());
}

export function contextMenuPosition(event) {
  if (Number(event?.clientX) || Number(event?.clientY)) return { x: Math.round(Number(event.clientX)), y: Math.round(Number(event.clientY)) };
  const bounds = event?.currentTarget?.getBoundingClientRect?.() || event?.target?.getBoundingClientRect?.();
  if (!bounds) return {};
  return { x: Math.round(bounds.left + Math.min(24, bounds.width / 2)), y: Math.round(bounds.top + Math.min(bounds.height, 28)) };
}
