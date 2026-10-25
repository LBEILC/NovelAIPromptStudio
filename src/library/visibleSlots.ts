export interface VisibleSlots {
  next: number;
  slots: { id: string; slot: number; recycled: boolean }[];
}

/** Keep visible identities, recycling only slots whose previous item left the viewport. */
export function reconcileVisibleSlots(
  previous: VisibleSlots,
  ids: string[],
  canRecycle: (id: string) => boolean,
): VisibleSlots {
  const live = new Set(ids);
  const existing = new Map(previous.slots.map((entry) => [entry.id, entry]));
  const free = previous.slots.filter((entry) => !live.has(entry.id));
  let cursor = 0;
  let next = previous.next;
  const slots = ids.map((id) => {
    const kept = existing.get(id);
    if (kept) return { id, slot: kept.slot, recycled: false };
    const reused = canRecycle(id) ? free[cursor++] : undefined;
    return { id, slot: reused?.slot ?? next++, recycled: !!reused };
  });
  return { next, slots };
}
