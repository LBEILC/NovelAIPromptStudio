const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number']);

export function isTextEditingTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  const editable = target.closest('textarea, input, [contenteditable="true"]');
  if (!editable) return false;
  if (editable.matches('textarea, [contenteditable="true"]')) return true;
  return TEXT_INPUT_TYPES.has(String(editable.type || '').toLowerCase());
}
