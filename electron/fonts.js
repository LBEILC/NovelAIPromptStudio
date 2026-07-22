import { getFonts2 } from 'font-list';

export function normalizeSystemFonts(fonts = []) {
  const families = new Map();
  for (const font of fonts) {
    const family = String(font?.name || font?.familyName || '').replace(/^(["'])(.*)\1$/, '$2').trim();
    if (!family || family.length > 128 || /[\u0000-\u001f\u007f"\\;{}]/.test(family)) continue;
    const key = family.toLocaleLowerCase('en-US');
    const existing = families.get(key);
    families.set(key, { family, monospace: Boolean(existing?.monospace || font?.monospace) });
  }
  return [...families.values()].sort((left, right) => left.family.localeCompare(right.family, undefined, { sensitivity: 'base' }));
}

export async function listSystemFonts(reader = getFonts2) {
  return normalizeSystemFonts(await reader({ disableQuoting: true }));
}
