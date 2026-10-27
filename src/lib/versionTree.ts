import type { WorkVersion } from '../shared/generation';

/** Build once per list; preserve the original sibling and depth-first ordering. */
export function createVersionTree(versions: WorkVersion[]) {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const children = new Map<string, WorkVersion[]>();
  const descendants = new Map<string, WorkVersion[]>();
  const last = new Map<string, number>();
  const positions = new Map(versions.map((v, i) => [v.id, i]));
  for (const v of versions) {
    if (!v.parentId) continue;
    const siblings = children.get(v.parentId) || [];
    siblings.push(v);
    children.set(v.parentId, siblings);
  }
  // Iterative postorder avoids overflowing the stack on long version chains.
  const pending = versions.map((v) => ({ v, exit: false }));
  const visiting = new Set<string>();
  while (pending.length) {
    const { v, exit } = pending.pop()!;
    if (descendants.has(v.id)) continue;
    if (!exit) {
      if (visiting.has(v.id)) continue;
      visiting.add(v.id);
      pending.push({ v, exit: true });
      for (const child of children.get(v.id) || []) pending.push({ v: child, exit: false });
    } else {
      const kids = children.get(v.id) || [];
      descendants.set(v.id, [v, ...kids.flatMap((c) => descendants.get(c.id) || [])]);
      last.set(v.id, Math.max(positions.get(v.id)!, ...kids.map((c) => last.get(c.id) ?? -1)));
    }
  }
  return { byId, children, descendants, last };
}
