import { describe, expect, it } from 'vitest';
import { reconcileVisibleSlots, type VisibleSlots } from './visibleSlots';

describe('visible card slots', () => {
  it('preserves output order and surviving identities while bounding scrolling allocations', () => {
    let state: VisibleSlots = { next: 0, slots: [] };
    for (let start = 0; start < 50000; start += 10) {
      const ids = Array.from({ length: 30 }, (_, i) => String(start + i));
      const previous = new Map(state.slots.map((entry) => [entry.id, entry.slot]));
      state = reconcileVisibleSlots(state, ids, () => true);
      expect(state.slots.map((entry) => entry.id)).toEqual(ids);
      expect(new Set(state.slots.map((entry) => entry.slot)).size).toBe(ids.length);
      for (const entry of state.slots)
        if (previous.has(entry.id)) expect(entry.slot).toBe(previous.get(entry.id));
      expect(state.next).toBe(30);
    }
  });

  it('gives newly inserted items fresh nodes and retains exiting items until actually removed', () => {
    const first = reconcileVisibleSlots({ next: 0, slots: [] }, ['a', 'b', 'c'], () => true);
    const next = reconcileVisibleSlots(first, ['a', 'new', 'b'], (id) => id !== 'new');
    expect(next.slots).toEqual([
      { id: 'a', slot: 0, recycled: false },
      { id: 'new', slot: 3, recycled: false },
      { id: 'b', slot: 1, recycled: false },
    ]);
    expect(reconcileVisibleSlots(next, [], () => true).slots).toEqual([]);
  });
});
