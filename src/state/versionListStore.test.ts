import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionListStore, type VersionList } from './versionListStore';
import type { CommandEvent, CommandTab } from '../shared/commands';
import type { GenerationJob, GenerationStatus, WorkVersion } from '../shared/generation';

const result = (id = 'v'): VersionList => ({
  versions: [{ id, parentId: null, project: {}, images: [] } as unknown as WorkVersion],
  origin: null,
  derived: [],
});
const tab = (id: string, revision = 1, versionId = 'v') =>
  ({ id, revision, versionId, workId: id }) as CommandTab;
const generation = (jobs: Partial<GenerationJob>[]): CommandEvent => ({
  type: 'generation',
  data: {
    jobs: jobs.map((j) => ({ id: 'job', tabId: 'a', state: 'generating', images: [], ...j })),
  } as GenerationStatus,
});
const workbench = (tabs: CommandTab[], extra = {}): CommandEvent => ({
  type: 'workbench',
  source: 'ui',
  session: { version: 2, tabs, activeTabId: tabs[0]?.id || '' },
  ...extra,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('shared version lists', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('shares a single initial request and cached result between consumers', async () => {
    const pending = deferred<VersionList>(),
      load = vi.fn(() => pending.promise),
      store = new VersionListStore(load);
    const one = store.read('a'),
      two = store.read('a');
    expect(load).toHaveBeenCalledTimes(1);
    pending.resolve(result());
    expect(await one).toBe(await two);
    expect(await store.read('a')).toBe(await one);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('coalesces invalidations at the last deadline without overlapping an in-flight request', async () => {
    const first = deferred<VersionList>(),
      second = deferred<VersionList>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = new VersionListStore(load),
      read = store.read('a');
    store.invalidate('a');
    await vi.advanceTimersByTimeAsync(100);
    store.invalidate('a');
    first.resolve(result('stale'));
    await vi.advanceTimersByTimeAsync(149);
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.snapshot('a')).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    second.resolve(result('current'));
    expect((await read).versions[0].id).toBe('current');
  });
  it('does not refresh on progress and refreshes only the changed job tab', async () => {
    const load = vi.fn(async (_id: string) => result()),
      store = new VersionListStore(load);
    await Promise.all([store.read('a'), store.read('b')]);
    store.receive(generation([{ progress: 0 }]));
    await vi.advanceTimersByTimeAsync(150);
    expect(load.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'a']);
    store.receive(generation([{ progress: 0.5, index: 1 }]));
    await vi.advanceTimersByTimeAsync(300);
    expect(load).toHaveBeenCalledTimes(3);
    store.receive(generation([{ state: 'completed', images: ['image'] }]));
    await vi.advanceTimersByTimeAsync(150);
    expect(load.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'a', 'a']);
  });
  it('coalesces revision, version, job and scoped library events for the same tab', async () => {
    const load = vi.fn(async (_id: string) => result()),
      store = new VersionListStore(load);
    store.observe(tab('a'));
    store.observe(tab('b'));
    await Promise.all([store.read('a'), store.read('b')]);
    store.receive(workbench([tab('a', 2, 'next'), tab('b')], { libraryChanged: true, tabId: 'a' }));
    store.receive(generation([{ state: 'completed', images: ['image'] }]));
    await vi.advanceTimersByTimeAsync(150);
    expect(load.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'a']);
    store.receive(workbench([tab('a', 2, 'next'), tab('b')], { libraryChanged: true }));
    await vi.advanceTimersByTimeAsync(150);
    expect(load.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'a', 'a', 'b']);
  });
  it('also invalidates another tab displaying the same work', async () => {
    const load = vi.fn(async (_id: string) => result()),
      store = new VersionListStore(load);
    const tabs = [tab('a'), { ...tab('b'), workId: 'a' }, tab('c')];
    tabs.forEach((t) => store.observe(t));
    await Promise.all(tabs.map((t) => store.read(t.id)));
    store.receive(workbench(tabs, { libraryChanged: true, tabId: 'a' }));
    await vi.advanceTimersByTimeAsync(150);
    expect(load.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c', 'a', 'b']);
  });
  it('keeps unchanged version references and publishes counts excluding the start', async () => {
    const fixture = result();
    fixture.versions.unshift({ ...fixture.versions[0], id: 'start', isStart: true });
    const load = vi.fn(async () => structuredClone(fixture)),
      store = new VersionListStore(load),
      listener = vi.fn();
    store.subscribeCounts(listener);
    const first = await store.read('a');
    store.invalidate('a');
    await vi.advanceTimersByTimeAsync(150);
    expect(store.snapshot('a')!.versions[1]).toBe(first.versions[1]);
    expect(store.countSnapshot()).toEqual({ a: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('discards a closed tab response and allows the tab to be read again', async () => {
    const pending = deferred<VersionList>(),
      load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(result('new'));
    const store = new VersionListStore(load);
    const closed = store.read('a').catch((error) => error.message);
    store.remove('a');
    expect(await closed).toBe('Tab closed');
    const reopened = store.read('a');
    pending.resolve(result('old'));
    expect((await reopened).versions[0].id).toBe('new');
    expect(store.snapshot('a')!.versions[0].id).toBe('new');
  });
  it('rejects failed reads without caching the error and permits a later retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(result());
    const store = new VersionListStore(load);
    await expect(store.read('a')).rejects.toThrow('offline');
    expect(store.snapshot('a')).toBeNull();
    expect((await store.read('a')).versions).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
