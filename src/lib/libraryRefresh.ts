import type { LibraryCard } from '../shared/types';

type Source = 'user' | 'background';
type Waiter = { resolve: (cards: LibraryCard[]) => void; reject: (error: unknown) => void };

// Calls arriving during a read belong to the next batch, including user awaits.
export function createCoalescedRefresh(load: (source: Source) => Promise<LibraryCard[]>) {
  let running = false;
  let pending: { source: Source; waiters: Waiter[] } | undefined;
  async function drain() {
    running = true;
    while (pending) {
      const batch = pending;
      pending = undefined;
      try {
        const cards = await load(batch.source);
        batch.waiters.forEach(({ resolve }) => resolve(cards));
      } catch (error) {
        batch.waiters.forEach(({ reject }) => reject(error));
      }
    }
    running = false;
  }
  return (source: Source) =>
    new Promise<LibraryCard[]>((resolve, reject) => {
      pending ??= { source, waiters: [] };
      if (source === 'user') pending.source = 'user';
      pending.waiters.push({ resolve, reject });
      if (!running) void drain();
    });
}

// All cards, trash and collections are one invalidation group.
export function createDeferredLibraryRefresh() {
  let dirty = true;
  return {
    invalidate() {
      dirty = true;
    },
    flush(visible: boolean, refresh: () => void) {
      if (!visible || !dirty) return;
      dirty = false;
      refresh();
    },
  };
}
