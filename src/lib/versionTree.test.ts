import { expect, it } from 'vitest';
import { createVersionTree } from './versionTree';
import type { WorkVersion } from '../shared/generation';

it('preserves depth-first sibling order and last positions after reparenting', () => {
  const rows = [
    { id: 'a', parentId: null },
    { id: 'b', parentId: 'a' },
    { id: 'c', parentId: 'a' },
    { id: 'd', parentId: 'b' },
  ] as WorkVersion[];
  const tree = createVersionTree(rows);
  expect(tree.children.get('a')?.map((v) => v.id)).toEqual(['b', 'c']);
  expect(tree.descendants.get('a')?.map((v) => v.id)).toEqual(['a', 'b', 'd', 'c']);
  expect(tree.last.get('b')).toBe(3);
  expect(tree.last.get('c')).toBe(2);
  const next = createVersionTree(
    rows.filter((v) => v.id !== 'b').map((v) => (v.id === 'd' ? { ...v, parentId: 'a' } : v)),
  );
  expect(next.descendants.get('a')?.map((v) => v.id)).toEqual(['a', 'c', 'd']);
});
