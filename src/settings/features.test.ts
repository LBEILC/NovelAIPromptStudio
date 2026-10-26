import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FEATURES } from './features';
import { RELEASE_TARGETS } from '../lib/releaseNotes.js';

const items = FEATURES.flatMap((group) => group.items);
it('has unique names, locations, targets and destinations', () => {
  expect(new Set(items.map((item) => item.name)).size).toBe(items.length);
  for (const item of items) {
    expect(item.where.trim(), item.name).not.toBe('');
    expect(item.point.id.trim(), item.name).not.toBe('');
    expect(RELEASE_TARGETS, item.name).toContain(item.go);
  }
});

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory()
      ? sources(file)
      : /(?<!\.test)\.tsx$/.test(file)
        ? [fs.readFileSync(file, 'utf8')]
        : [];
  });
}
it('finds every spotlight target and prerequisite in product controls', () => {
  const source = sources(path.resolve('src')).join('\n');
  const ids = new Set<string>();
  for (const match of source.matchAll(/(?:data-feature|feature)\s*=\s*["']([^"']+)["']/g))
    match[1].split(/\s+/).forEach((id) => ids.add(id));
  for (const match of source.matchAll(/acts\([\s\S]*?\n\s*\)}/g))
    for (const literal of match[0].matchAll(/['"]([^'"\n]+)['"]/g)) ids.add(literal[1]);
  // Conditional controls can omit the feature while leaving the page.
  for (const match of source.matchAll(/data-feature=\{[^}\n]*['"]([^'"]+)['"][^}\n]*\}/g))
    ids.add(match[1]);
  if (source.includes('data-feature={`tab-${k}`}'))
    ['prompt', 'params', 'refs'].forEach((k) => ids.add(`tab-${k}`));
  if (source.includes('data-feature={`op-${op}`}'))
    ['upscale', 'enhance'].forEach((op) => ids.add(`op-${op}`));
  for (const item of items)
    for (const id of [item.point.id, item.point.before, item.point.need?.id].filter(Boolean))
      expect(ids.has(id!), `${item.name}: missing data-feature ${id}`).toBe(true);
});
