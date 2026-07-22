export const DEFAULT_SANS_FONT = 'Geist';
export const DEFAULT_MONO_FONT = 'Geist Mono';

const GENERIC_FONTS = new Set(['system-ui', 'sans-serif', 'serif', 'monospace', 'ui-monospace']);
const MONO_NAME_PATTERN = /(?:mono|monospace|console|courier|terminal|typewriter|cascadia|consolas|menlo|monaco|iosevka|fira\s*code|source\s*code|jetbrains|hack|inconsolata|fixed)/i;

export function quoteFontFamily(family) {
  const value = String(family || '').trim().replace(/["\\\n\r\f]/g, '');
  if (!value) return 'sans-serif';
  return GENERIC_FONTS.has(value.toLocaleLowerCase('en-US')) ? value : `"${value}"`;
}

export function fontStack(family, role = 'sans') {
  const selected = quoteFontFamily(family || (role === 'mono' ? DEFAULT_MONO_FONT : DEFAULT_SANS_FONT));
  return role === 'mono'
    ? `${selected}, "HarmonyOS Sans SC", ui-monospace, "SFMono-Regular", "Cascadia Mono", Consolas, Menlo, monospace`
    : `${selected}, "HarmonyOS Sans SC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

export function isMonospaceFont(font, measureText) {
  const family = String(font?.family || '').trim();
  if (!family) return false;
  if (font.monospace || MONO_NAME_PATTERN.test(family)) return true;
  if (typeof measureText !== 'function') return false;
  const widths = ['iiiiiiiiii', 'WWWWWWWWWW', '0000000000', 'mmmmmmmmmm'].map((sample) => measureText(family, sample));
  return widths.every(Number.isFinite) && Math.max(...widths) - Math.min(...widths) < 0.75;
}

export function partitionFontFamilies(fonts = [], measureText) {
  const proportional = new Set([DEFAULT_SANS_FONT, 'HarmonyOS Sans SC', 'system-ui']);
  const monospace = new Set([DEFAULT_MONO_FONT, 'monospace']);
  for (const font of fonts) {
    const family = String(font?.family || '').trim();
    if (!family) continue;
    (isMonospaceFont(font, measureText) ? monospace : proportional).add(family);
  }
  const sort = (values, preferred) => [...values].sort((left, right) => {
    const leftIndex = preferred.indexOf(left);
    const rightIndex = preferred.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) return (leftIndex === -1 ? Infinity : leftIndex) - (rightIndex === -1 ? Infinity : rightIndex);
    return left.localeCompare(right, undefined, { sensitivity: 'base' });
  });
  return {
    proportional: sort(proportional, [DEFAULT_SANS_FONT, 'HarmonyOS Sans SC', 'system-ui']),
    monospace: sort(monospace, [DEFAULT_MONO_FONT, 'monospace']),
  };
}
