import { computeWorkbenchTabHasChanges } from './workbenchSession.js';
import type {
  CommandSession,
  CommandEvent,
  EditingTarget,
  InvokeCommand,
} from '../shared/commands';

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

function changes(base: CommandSession, next: CommandSession) {
  const before = new Map(base.tabs.map((t) => [t.id, t]));
  const after = new Map(next.tabs.map((t) => [t.id, t]));
  return {
    base: {
      ...base,
      order: [...before.keys()],
      tabs: base.tabs.filter((t) => after.get(t.id) !== t),
    },
    next: {
      ...next,
      order: [...after.keys()],
      tabs: next.tabs.filter((t) => before.get(t.id) !== t),
    },
  };
}
function applyChanges(base: CommandSession, patch: CommandSession): CommandSession {
  if (!patch.order) return patch;
  const tabs = new Map(base.tabs.map((t) => [t.id, t]));
  for (const t of patch.tabs) tabs.set(t.id, t);
  return {
    version: patch.version,
    activeTabId: patch.activeTabId,
    tabs: patch.order.flatMap((id) => tabs.get(id) || []),
  };
}

// Reapply only the user's delta. Revision increments belong to the main process.
function rebase(remote: CommandSession, base: CommandSession, local: CommandSession) {
  const before = new Map(base.tabs.map((t) => [t.id, t]));
  const localIds = new Set(local.tabs.map((t) => t.id));
  const byId = new Map(
    remote.tabs.filter((t) => !before.has(t.id) || localIds.has(t.id)).map((t) => [t.id, t]),
  );
  for (const tab of local.tabs) {
    const old = before.get(tab.id);
    if (old === tab) continue;
    const target = byId.get(tab.id);
    if (!target) {
      if (!old || !same(old.project, tab.project)) byId.set(tab.id, tab);
      continue;
    }
    if (!old) continue;
    let amended = target;
    for (const field of [
      'project',
      'displayName',
      'source',
      'originalProject',
      'savedDraft',
      'error',
      'viewState',
      'identity',
    ] as const)
      if (!same(old[field], tab[field]) && !same(target[field], tab[field])) {
        if (amended === target) amended = { ...target };
        Object.assign(amended, { [field]: tab[field] });
      }
    if (amended === target) continue;
    if (!same(old.project, tab.project)) amended.updatedAt = tab.updatedAt;
    if (
      amended.project !== target.project ||
      amended.originalProject !== target.originalProject ||
      amended.savedDraft !== target.savedDraft
    )
      amended.hasChanges = computeWorkbenchTabHasChanges(amended);
    byId.set(tab.id, amended);
  }
  const order = [...localIds];
  const reordered =
    order.length !== base.tabs.length || base.tabs.some((t, i) => t.id !== order[i]);
  const tabs = reordered
    ? [...new Set([...order, ...byId.keys()])].flatMap((id) => byId.get(id) || [])
    : [...byId.values()];
  const selected = local.activeTabId !== base.activeTabId ? local.activeTabId : remote.activeTabId;
  const activeTabId = byId.has(selected) ? selected : tabs[0]?.id || '';
  if (
    activeTabId === remote.activeTabId &&
    tabs.length === remote.tabs.length &&
    tabs.every((t, i) => t === remote.tabs[i])
  )
    return remote;
  return { ...remote, tabs, activeTabId };
}

export function workbenchErrorMessage(message: string) {
  return message.includes('重新读取') ? '工作台保存失败，输入仍保留在界面，请稍后再试' : message;
}

export class WorkbenchConnection {
  private confirmed: CommandSession = { version: 2, tabs: [], activeTabId: '' };
  current: CommandSession = this.confirmed;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  ready = false;
  notify: (message: string) => void = () => {};
  private initialized: Promise<void>;
  private resolveInitialized!: () => void;
  constructor(
    private invoke: InvokeCommand,
    private publish: (session: CommandSession) => void,
    private error: (message: string) => void,
  ) {
    this.initialized = new Promise((resolve) => {
      this.resolveInitialized = resolve;
    });
  }
  hydrate(session: CommandSession) {
    const early = this.current !== this.confirmed ? this.current : null;
    this.confirmed = session;
    this.current = session;
    this.ready = true;
    if (early) {
      const tabs = [...session.tabs];
      for (const tab of early.tabs)
        if (!tabs.some((saved) => saved.identity === tab.identity)) tabs.push(tab);
      const selected = early.tabs.find((tab) => tab.id === early.activeTabId);
      this.current = {
        ...session,
        tabs,
        activeTabId:
          tabs.find((tab) => tab.identity === selected?.identity)?.id || session.activeTabId,
      };
      this.timer = setTimeout(() => void this.flush().catch((e) => this.error(e.message)), 0);
    }
    this.publish(this.current);
    this.resolveInitialized();
  }
  update(action: CommandSession | ((previous: CommandSession) => CommandSession)) {
    const next = typeof action === 'function' ? action(this.current) : action;
    if (next === this.current) return;
    if (next.tabs === this.current.tabs) {
      this.current = next;
    } else {
      const previous = new Map(this.current.tabs.map((t) => [t.id, t]));
      this.current = {
        ...next,
        tabs: next.tabs.map((t) => {
          const old = previous.get(t.id);
          if (
            old === t ||
            (old &&
              old.project === t.project &&
              old.originalProject === t.originalProject &&
              old.savedDraft === t.savedDraft)
          )
            return t;
          return { ...t, hasChanges: computeWorkbenchTabHasChanges(t) };
        }),
      };
    }
    this.publish(this.current);
    if (!this.ready) return;
    clearTimeout(this.timer);
    // Editors keep their unsaved text locally. Direct typing is batched; drag
    // previews never call update, so one commit follows the drop.
    const typing =
      typeof document !== 'undefined' &&
      document.activeElement?.matches('input,textarea,[contenteditable=true]');
    this.timer = setTimeout(
      () => void this.flush().catch((e) => this.error(e.message)),
      typing ? 180 : 0,
    );
  }
  private async conflictBaseline(session?: CommandSession) {
    if (session) return session;
    const result = await this.invoke('workbench.session', {});
    if (!result.ok) throw Error(workbenchErrorMessage(result.error.message));
    return result.data;
  }
  async flush(): Promise<void> {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('nps:flush-text'));
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      return this.flush();
    }
    if (!this.ready || this.current === this.confirmed) return;
    let base = this.confirmed,
      next = this.current;
    this.running = (async () => {
      let result = await this.invoke('workbench.commit', changes(base, next));
      let overwritten = false;
      if (!result.ok && result.error.code === 'conflict') {
        const remote = await this.conflictBaseline(result.error.details?.session);
        // Include edits made while the rejected request was in flight.
        const local = this.current;
        overwritten = local.tabs.some((tab) => {
          const old = base.tabs.find((t) => t.id === tab.id);
          const latest = remote.tabs.find((t) => t.id === tab.id);
          return (
            old &&
            latest &&
            !same(old.project, tab.project) &&
            !same(old.project, latest.project) &&
            !same(tab.project, latest.project)
          );
        });
        next = rebase(remote, base, local);
        base = remote;
        this.confirmed = remote;
        this.current = next;
        this.publish(next);
        result = await this.invoke('workbench.commit', changes(base, next));
      }
      if (!result.ok) {
        // Refresh the baseline even when the bounded retry loses another race.
        // Keep the delta pending for the next user edit, without an automatic loop.
        if (result.error.code === 'conflict') {
          const remote = await this.conflictBaseline(result.error.details?.session);
          this.current = rebase(remote, base, this.current);
          this.confirmed = remote;
          this.publish(this.current);
        }
        throw Error(workbenchErrorMessage(result.error.message));
      }
      this.confirmed = applyChanges(this.confirmed, result.data);
      if (this.current === next) this.current = this.confirmed;
      else this.current = rebase(this.confirmed, next, this.current);
      if (overwritten) this.notify('Agent 同时改了这个标签页，已保留你的修改');
      // No React state update on acknowledgement: only revision bookkeeping.
    })();
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
    if (this.current !== this.confirmed) await this.flush();
  }
  receive(event: CommandEvent) {
    if (event.type !== 'workbench') return;
    const remote = applyChanges(this.confirmed, event.session);
    const pending = this.current !== this.confirmed;
    if (!pending) {
      this.current = remote;
      this.confirmed = remote;
      this.publish(remote);
      return;
    }
    const local = this.current,
      before = this.confirmed;
    const beforeById = new Map(before.tabs.map((t) => [t.id, t]));
    const editedById = new Map(local.tabs.map((t) => [t.id, t]));
    const live = new Set(remote.tabs.map((t) => t.id));
    this.current = rebase(remote, before, local);
    // Retain the true base only for pending fields, including deleted tabs.
    // A simultaneous project edit must still be rejected on the first commit.
    this.confirmed = {
      ...remote,
      activeTabId:
        local.activeTabId !== before.activeTabId ? before.activeTabId : remote.activeTabId,
      tabs: remote.tabs
        .filter((t) => beforeById.has(t.id) || !editedById.has(t.id))
        .map((tab) => {
          const old = beforeById.get(tab.id);
          const edited = editedById.get(tab.id);
          if (!old || old === edited) return tab;
          if (!edited) return old;
          const baseline = { ...tab };
          for (const field of [
            'project',
            'displayName',
            'source',
            'originalProject',
            'savedDraft',
            'error',
            'viewState',
            'identity',
          ] as const)
            if (!same(old[field], edited[field])) Object.assign(baseline, { [field]: old[field] });
          return baseline;
        }),
    };
    for (const old of before.tabs) {
      const edited = editedById.get(old.id);
      if (!live.has(old.id) && edited && !same(old.project, edited.project))
        this.confirmed.tabs.push(old);
    }
    if (
      !same(
        before.tabs.map((t) => t.id),
        local.tabs.map((t) => t.id),
      )
    ) {
      const order = before.tabs.map((t) => t.id);
      this.confirmed.tabs.sort(
        (a, b) =>
          (order.includes(a.id) ? order.indexOf(a.id) : Infinity) -
          (order.includes(b.id) ? order.indexOf(b.id) : Infinity),
      );
    }
    this.publish(this.current);
  }
  async prepare() {
    await this.initialized;
    await this.flush();
    const result = await this.invoke('workbench.editing', {
      targets: editingTargets(this.current.activeTabId),
    });
    if (!result.ok) throw Error(result.error.message);
  }
  dispose() {
    clearTimeout(this.timer);
  }
}

export function editingTargets(tabId: string): EditingTarget[] {
  if (!tabId) return [];
  const targets: EditingTarget[] = [];
  // 正在编辑的地方：按文本编辑的输入框、正在改的段落、Tag 的编辑浮层、正在加的 Tag、正在改的角色名
  for (const node of document.querySelectorAll<HTMLElement>(
    '.tx-wrap:has(textarea:focus),.blk.on[data-block],.tag-pop [data-command-scope],.tag.input:has(input),.char-name:has(input)',
  )) {
    if (!node.checkVisibility()) continue;
    const scope =
      node.dataset.commandScope || node.closest<HTMLElement>('[data-wb-scope]')?.dataset.wbScope;
    const block =
      node.dataset.commandBlock ??
      node.closest<HTMLElement>('[data-block]')?.dataset.block?.split(':')[1];
    targets.push({
      tabId,
      ...(scope ? { scope } : {}),
      ...(block !== undefined ? { block: Number(block) } : {}),
    });
  }
  return targets;
}
