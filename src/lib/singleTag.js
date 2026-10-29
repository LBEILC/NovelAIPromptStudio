// Shared by Text highlighting and dictionary writes. A prompt block is never a tag.
export function singleTagCore(value) {
  const source = String(value || '');
  if (/[,，\r\n]/.test(source)) return '';
  let core = source
    .trim()
    .replace(/^-?[\d.]+::/, '')
    .replace(/::$/, '')
    .trim();
  // Strip outer wrappers, but preserve parentheses belonging to a tag name.
  const closers = { '{': '}', '[': ']', '(': ')' };
  while (closers[core[0]]) {
    const close = closers[core[0]];
    core = core.slice(1);
    if (core.endsWith(close)) core = core.slice(0, -1);
    core = core.trim();
  }
  // The prompt parser does not support A1111 suffix weights; do not cache them as names.
  if (/:[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(core)) return '';
  return core && core.split(/\s+/).length <= 6 && !/[.!?]$/.test(core) ? core : '';
}
