import type {
  CommandSession,
  CommandEvent,
  EditingTarget,
  InvokeCommand,
} from '../shared/commands';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class WorkbenchConnection {
  private confirmed: CommandSession = { version: 2, tabs: [], activeTabId: '' };
  current: CommandSession = this.confirmed;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  ready = false;
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
    this.current = next;
    this.publish(next);
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
  async flush(): Promise<void> {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('nps:flush-text'));
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      return this.flush();
    }
    if (!this.ready || this.current === this.confirmed) return;
    const base = this.confirmed,
      next = this.current;
    this.running = (async () => {
      const result = await this.invoke('workbench.commit', { base, next });
      if (!result.ok) throw Error(result.error.message);
      this.confirmed = result.data;
      if (this.current === next) this.current = this.confirmed;
      else
        this.current = {
          ...this.current,
          tabs: this.current.tabs.map((t) => ({
            ...t,
            revision: result.data.tabs.find((r) => r.id === t.id)?.revision ?? t.revision,
          })),
        };
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
    const remote = event.session;
    const pending = this.current !== this.confirmed;
    if (!pending) {
      this.current = remote;
      this.confirmed = remote;
      this.publish(remote);
      return;
    }
    // Preserve an edit made after the prepare handshake. A conflicting later
    // commit is rejected by the main process; it must not erase local input.
    const local = this.current,
      before = this.confirmed;
    const tabs = remote.tabs.map((t) => {
      const old = before.tabs.find((b) => b.id === t.id),
        changed = local.tabs.find((b) => b.id === t.id);
      return changed && old && !same(changed.project, old.project) ? changed : t;
    });
    for (const t of local.tabs)
      if (!before.tabs.some((b) => b.id === t.id) && !tabs.some((b) => b.id === t.id)) tabs.push(t);
    this.confirmed = {
      ...remote,
      tabs: remote.tabs.map((tab) => {
        const old = before.tabs.find((t) => t.id === tab.id);
        const edited = local.tabs.find((t) => t.id === tab.id);
        // Retain the actual edit base when both sides changed after prepare.
        // The main process must reject that race, never accept the local draft
        // as if it had been edited against the newer Agent version.
        return old &&
          edited &&
          !same(edited.project, old.project) &&
          !same(tab.project, old.project)
          ? old
          : tab;
      }),
    };
    this.current = {
      ...remote,
      tabs,
      activeTabId:
        local.activeTabId !== before.activeTabId ? local.activeTabId : remote.activeTabId,
    };
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
  for (const node of document.querySelectorAll<HTMLElement>(
    '.wb-text-section:has(textarea:focus),.wb-raw-editor,.wb-paragraph-editor,.wb-tag-editor,.wb-add-tags:has(input),.wb-character-name:has(input)',
  )) {
    if (!node.checkVisibility()) continue;
    const scope =
      node.dataset.commandScope || node.closest<HTMLElement>('[data-wb-scope]')?.dataset.wbScope;
    const block =
      node.dataset.commandBlock ??
      node.closest<HTMLElement>('[data-wb-block]')?.dataset.wbBlock?.split(':')[1];
    targets.push({
      tabId,
      ...(scope ? { scope } : {}),
      ...(block !== undefined ? { block: Number(block) } : {}),
    });
  }
  return targets;
}
