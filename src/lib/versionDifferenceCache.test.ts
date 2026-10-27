import { describe, expect, it, vi } from 'vitest';
import { createVersionDifferenceCache } from './versionDifferenceCache';
import { diffSummary, versionDiff } from './versionDiff';
import { createPromptStructure } from './promptStructure.js';
import type { ImageProject } from '../shared/types';

const project = (text: string) => {
  const metadata = { prompt_raw: text, negative_prompt: '', width: 832, height: 1216 };
  return { metadata, prompt_structure: createPromptStructure(metadata) } as ImageProject;
};
const version = (id: string, parentId: string | null, text: string) => ({
  id,
  parentId,
  project: project(text),
});
describe('version differences', () => {
  it('reuses parsed differences across cloned reads and unrelated additions', () => {
    const compute = vi.fn(versionDiff),
      cache = createVersionDifferenceCache(compute);
    const rows = [version('root', null, 'rain'), version('one', 'root', 'rain, cloud')];
    const first = cache.update(rows);
    expect(diffSummary(first.get('one')!)).toContain('+cloud');
    const second = cache.update(structuredClone(rows));
    expect(second.get('one')).toBe(first.get('one'));
    expect(compute).toHaveBeenCalledTimes(2);
    cache.update([...rows, version('two', 'one', 'rain, cloud, sky')]);
    expect(compute).toHaveBeenCalledTimes(3);
  });
  it('invalidates a child when deletion changes its visible parent, and drops removed entries', () => {
    const compute = vi.fn(versionDiff),
      cache = createVersionDifferenceCache(compute);
    const root = version('root', null, 'rain'),
      one = version('one', 'root', 'rain, cloud'),
      two = version('two', 'one', 'rain, cloud, sky');
    cache.update([root, one, two]);
    const deleted = cache.update([root, { ...two, parentId: root.id }]);
    expect(deleted.has('one')).toBe(false);
    expect(deleted.get('two')!.items.map((x) => x.en)).toEqual(['cloud', 'sky']);
    expect(compute).toHaveBeenCalledTimes(4);
    cache.update([root, one, two]);
    expect(compute).toHaveBeenCalledTimes(6);
  });
  it('invalidates a branch moved to another parent and children of a replaced snapshot', () => {
    const compute = vi.fn(versionDiff),
      cache = createVersionDifferenceCache(compute);
    const rows = [
      version('root', null, 'rain'),
      version('one', 'root', 'rain, cloud'),
      version('branch', 'root', 'rain, sky'),
    ];
    cache.update(rows);
    rows[2].parentId = 'one';
    const moved = cache.update(rows);
    expect(moved.get('branch')!.items).toContainEqual(
      expect.objectContaining({ kind: 'rem', en: 'cloud' }),
    );
    rows[1].project = project('rain, tree');
    const replaced = cache.update(rows);
    expect(replaced.get('branch')!.items).toContainEqual(
      expect.objectContaining({ kind: 'rem', en: 'tree' }),
    );
    expect(compute).toHaveBeenCalledTimes(6);
  });
  it('invalidates inpaint prompt changes even when the version snapshot is unchanged', () => {
    const compute = vi.fn(versionDiff),
      cache = createVersionDifferenceCache(compute);
    const rows = [
      { ...version('root', null, 'rain'), prompt: undefined as ImageProject | undefined },
      { ...version('paint', 'root', 'rain'), prompt: project('rain, cloud') },
    ];
    const promptOf = (v: (typeof rows)[number]) =>
      v.prompt ? { ...v.project, ...v.prompt } : v.project;
    const first = cache.update(rows, promptOf);
    expect(diffSummary(first.get('paint')!)).toContain('+cloud');
    cache.update(structuredClone(rows), promptOf);
    expect(compute).toHaveBeenCalledTimes(2);
    rows[1].prompt = project('rain, sky');
    expect(diffSummary(cache.update(rows, promptOf).get('paint')!)).toContain('+sky');
    expect(compute).toHaveBeenCalledTimes(3);
  });
});
