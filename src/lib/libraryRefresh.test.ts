import { expect, it, vi } from 'vitest';
import { createCoalescedRefresh, createDeferredLibraryRefresh } from './libraryRefresh';
import type { LibraryCard } from '../shared/types';

function deferred() {
  let resolve!: (cards: LibraryCard[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<LibraryCard[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it('coalesces five calls and resolves user awaits only after their trailing read', async () => {
  const first = deferred(),
    last = deferred();
  const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
  const refresh = createCoalescedRefresh(load);
  const initial = refresh('background');
  const calls = [refresh('background'), refresh('user'), refresh('background'), refresh('user')];
  const completed = vi.fn();
  void calls[1].then(completed);
  expect(load).toHaveBeenCalledTimes(1);
  first.resolve([{ id: 'old' } as LibraryCard]);
  await initial;
  expect(load).toHaveBeenCalledTimes(2);
  expect(load).toHaveBeenLastCalledWith('user');
  expect(completed).not.toHaveBeenCalled();
  const cards = [{ id: 'latest' } as LibraryCard];
  last.resolve(cards);
  expect(await Promise.all(calls)).toEqual([cards, cards, cards, cards]);
  expect(load).toHaveBeenCalledTimes(2);
});

it('keeps views independent and continues pending work after a failed read', async () => {
  const first = deferred();
  const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue([]);
  const all = createCoalescedRefresh(load);
  const trashLoad = vi.fn().mockResolvedValue([]);
  const trash = createCoalescedRefresh(trashLoad);
  const failed = all('background');
  const rejection = expect(failed).rejects.toThrow('synthetic failure');
  const pending = all('user');
  await trash('background');
  expect(trashLoad).toHaveBeenCalledTimes(1);
  first.reject(Error('synthetic failure'));
  await rejection;
  expect(await pending).toEqual([]);
  await all('user');
  expect(load).toHaveBeenCalledTimes(3);
});

it('defers three hidden events and refreshes all data once on entering the gallery', () => {
  const gate = createDeferredLibraryRefresh();
  const refresh = vi.fn();
  gate.flush(false, refresh);
  for (let i = 0; i < 3; i++) {
    gate.invalidate();
    gate.flush(false, refresh);
  }
  expect(refresh).not.toHaveBeenCalled();
  gate.flush(true, refresh);
  gate.flush(true, refresh);
  expect(refresh).toHaveBeenCalledTimes(1);
  gate.invalidate();
  gate.flush(true, refresh);
  expect(refresh).toHaveBeenCalledTimes(2);
});
