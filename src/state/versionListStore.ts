import type { CommandEvent, CommandOutput, CommandTab } from '../shared/commands';
import type { GenerationJob } from '../shared/generation';

export type VersionList = CommandOutput<'version.list'>;
type Tab = Pick<CommandTab, 'id' | 'revision' | 'versionId' | 'workId'>;
type Entry = {
  tab?: Tab;
  key?: string;
  data: VersionList | null;
  dirty: boolean;
  epoch: number;
  due: number;
  timer?: ReturnType<typeof setTimeout>;
  running: boolean;
  listeners: Set<() => void>;
  waiters: { resolve: (data: VersionList) => void; reject: (error: unknown) => void }[];
};

export function generationVersionKeys(jobs: readonly GenerationJob[]) {
  const keys = new Map<string, string>();
  for (const job of jobs)
    keys.set(
      job.tabId,
      (keys.get(job.tabId) || '') + `${job.id}:${job.state}:${job.images.length}|`,
    );
  return keys;
}

/** One request per tab, including invalidations arriving while that request runs. */
export class VersionListStore {
  private entries = new Map<string, Entry>();
  private jobKeys = new Map<string, string>();
  private listeners = new Set<() => void>();
  private counts: Record<string, number> = {};
  constructor(
    private load: (tabId: string) => Promise<VersionList>,
    private delay = 150,
  ) {}

  private entry(id: string) {
    let e = this.entries.get(id);
    if (!e) {
      e = {
        data: null,
        dirty: true,
        epoch: 0,
        due: 0,
        running: false,
        listeners: new Set(),
        waiters: [],
      };
      this.entries.set(id, e);
    }
    return e;
  }
  snapshot = (id: string) => this.entries.get(id)?.data || null;
  countSnapshot = () => this.counts;
  subscribe(id: string, listener: () => void) {
    const e = this.entry(id);
    e.listeners.add(listener);
    return () => {
      e.listeners.delete(listener);
    };
  }
  subscribeCounts = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  observe(tab: Tab) {
    const e = this.entry(tab.id),
      key = `${tab.revision || 0}:${tab.versionId || ''}`;
    e.tab = tab;
    if (e.key !== undefined && e.key !== key) this.invalidate(tab.id);
    e.key = key;
  }
  read(id: string): Promise<VersionList> {
    const e = this.entry(id);
    if (!e.dirty && e.data) return Promise.resolve(e.data);
    const result = new Promise<VersionList>((resolve, reject) =>
      e.waiters.push({ resolve, reject }),
    );
    this.schedule(id, e);
    return result;
  }
  invalidate(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    e.epoch++;
    e.dirty = true;
    e.due = Date.now() + this.delay;
    clearTimeout(e.timer);
    e.timer = undefined;
    this.schedule(id, e);
  }
  private schedule(id: string, e: Entry) {
    if (e.running || e.timer) return;
    const wait = e.due - Date.now();
    if (wait > 0)
      e.timer = setTimeout(() => {
        e.timer = undefined;
        void this.fetch(id, e);
      }, wait);
    else void this.fetch(id, e);
  }
  private async fetch(id: string, e: Entry) {
    if (this.entries.get(id) !== e || e.running) return;
    e.running = true;
    const epoch = e.epoch;
    try {
      const incoming = await this.load(id);
      if (this.entries.get(id) !== e || epoch !== e.epoch) return;
      // Keep unchanged version/project references stable for image and diff consumers.
      const old = new Map(e.data?.versions.map((v) => [v.id, v]));
      const versions = incoming.versions.map((v) => {
        const previous = old.get(v.id);
        return previous && JSON.stringify(previous) === JSON.stringify(v) ? previous : v;
      });
      e.data = { ...incoming, versions };
      e.dirty = false;
      const count = versions.filter((v) => !v.isStart).length;
      if (this.counts[id] !== count) {
        this.counts = { ...this.counts, [id]: count };
        for (const listener of this.listeners) listener();
      }
      for (const listener of e.listeners) listener();
      for (const waiter of e.waiters.splice(0)) waiter.resolve(e.data);
    } catch (error) {
      if (epoch === e.epoch) for (const waiter of e.waiters.splice(0)) waiter.reject(error);
    } finally {
      e.running = false;
      if (this.entries.get(id) === e && epoch !== e.epoch) this.schedule(id, e);
    }
  }
  remove(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    clearTimeout(e.timer);
    this.entries.delete(id);
    for (const waiter of e.waiters) waiter.reject(Error('Tab closed'));
    const { [id]: removed, ...counts } = this.counts;
    this.counts = counts;
    for (const listener of this.listeners) listener();
  }
  receive(event: CommandEvent) {
    if (event.type === 'generation') {
      const keys = generationVersionKeys(event.data.jobs);
      for (const id of this.entries.keys())
        if ((keys.get(id) || '') !== (this.jobKeys.get(id) || '')) this.invalidate(id);
      this.jobKeys = keys;
    }
    if (event.type === 'workbench') {
      const tabs = new Map(event.session.tabs.map((t) => [t.id, t]));
      for (const [id, e] of this.entries) {
        const tab = tabs.get(id);
        if (!tab) {
          this.remove(id);
          continue;
        }
        this.observe(tab);
        if (
          event.libraryChanged &&
          (!event.tabId ||
            event.tabId === id ||
            (e.tab?.workId && e.tab.workId === tabs.get(event.tabId)?.workId))
        )
          this.invalidate(id);
      }
    }
  }
}
