import { afterEach, expect, it, vi } from 'vitest';
import { WorkbenchConnection } from './workbenchConnection';
import type { CommandSession, InvokeCommand } from '../shared/commands';
import { createWorkbenchTab } from './workbenchSession.js';
import { mergeSession } from '../../electron/commands/session.js';

const CONFLICT_NOTICE = 'Agent 同时改了这个标签页，已保留你的修改';
afterEach(() => vi.useRealTimers());
function setupRace() {
  vi.useFakeTimers();
  const tabs = ['a', 'b'].map((id) =>
    createWorkbenchTab({ id, metadata: { prompt_raw: 'original' }, tags: [] }),
  );
  const base: CommandSession = { version: 2, tabs, activeTabId: tabs[0].id };
  let remote = structuredClone(base);
  const rejected = vi.fn();
  const invoke = vi.fn(async (_name, input) => {
    try {
      remote = mergeSession(remote, input.base, input.next);
      return { ok: true, data: structuredClone(remote) };
    } catch (error) {
      rejected(structuredClone(remote));
      return {
        ok: false,
        error: {
          code: 'conflict',
          message: String(error),
          details: { session: structuredClone(remote) },
        },
      };
    }
  });
  const publish = vi.fn(),
    error = vi.fn(),
    info = vi.fn();
  const connection = new WorkbenchConnection(invoke as InvokeCommand, publish, error);
  connection.notify = info;
  connection.hydrate(base);
  const edit = () => {
    const local = structuredClone(connection.current);
    local.tabs[0].project!.metadata.prompt_raw = 'user';
    connection.update(local);
  };
  const receive = () =>
    connection.receive({ type: 'workbench', source: 'agent', session: structuredClone(remote) });
  return {
    base,
    connection,
    invoke,
    rejected,
    publish,
    error,
    info,
    edit,
    receive,
    get remote() {
      return remote;
    },
  };
}
it('rejects the initial race then saves the user draft and permits closing A and renaming B', async () => {
  const f = setupRace();
  f.edit();
  f.remote.tabs[0].project!.metadata.prompt_raw = 'agent';
  f.remote.tabs[0].revision = 1;
  f.remote.tabs[1].project!.metadata.prompt_raw = 'untouched remote';
  f.receive();
  await vi.runAllTimersAsync();
  expect(f.rejected).toHaveBeenCalledTimes(1);
  expect(f.rejected.mock.calls[0][0].tabs[0].project.metadata.prompt_raw).toBe('agent');
  expect(f.remote.tabs[0].project!.metadata.prompt_raw).toBe('user');
  expect(f.remote.tabs[0].revision).toBe(2);
  expect(f.remote.tabs[1].project!.metadata.prompt_raw).toBe('untouched remote');
  f.connection.update((s) => ({ ...s, tabs: s.tabs.slice(1), activeTabId: s.tabs[1].id }));
  await vi.runAllTimersAsync();
  f.connection.update((s) => ({
    ...s,
    tabs: s.tabs.map((t) => ({ ...t, displayName: 'renamed B' })),
  }));
  await vi.runAllTimersAsync();
  expect(f.remote.tabs).toHaveLength(1);
  expect(f.remote.tabs[0].displayName).toBe('renamed B');
  expect(f.info).toHaveBeenCalledTimes(1);
  expect(f.info.mock.calls[0][0]).toBe(CONFLICT_NOTICE);
  expect(f.error).not.toHaveBeenCalled();
  f.connection.dispose();
});
it('restores a remotely closed tab with the user draft', async () => {
  const f = setupRace();
  f.edit();
  f.remote.tabs.shift();
  f.receive();
  await vi.runAllTimersAsync();
  expect(f.remote.tabs.find((t) => t.id === f.base.tabs[0].id)?.project?.metadata.prompt_raw).toBe(
    'user',
  );
  expect(f.rejected).toHaveBeenCalledTimes(1);
  f.connection.dispose();
});
it('keeps a locally closed tab closed without a prompt overwrite notice', async () => {
  const f = setupRace();
  f.connection.update((s) => ({ ...s, tabs: s.tabs.slice(1) }));
  f.remote.tabs[0].project!.metadata.prompt_raw = 'agent';
  f.receive();
  await vi.runAllTimersAsync();
  expect(f.remote.tabs.map((t) => t.id)).toEqual([f.base.tabs[1].id]);
  expect(f.info).not.toHaveBeenCalled();
  expect(f.error).not.toHaveBeenCalled();
  f.connection.dispose();
});
it('does not add requests when there is no conflict', async () => {
  const f = setupRace();
  f.edit();
  await vi.runAllTimersAsync();
  expect(f.invoke).toHaveBeenCalledTimes(1);
  expect(f.info).not.toHaveBeenCalled();
  f.connection.dispose();
});
it('retains local tab ordering and names while receiving an independent remote edit', async () => {
  const f = setupRace();
  f.connection.update((s) => ({
    ...s,
    tabs: [...s.tabs].reverse().map((t) => ({ ...t, displayName: 'local name' })),
  }));
  f.remote.tabs[0].project!.metadata.prompt_raw = 'remote content';
  f.receive();
  await vi.runAllTimersAsync();
  expect(f.remote.tabs.map((t) => t.id)).toEqual([...f.base.tabs].reverse().map((t) => t.id));
  expect(f.remote.tabs[1].project!.metadata.prompt_raw).toBe('remote content');
  expect(f.remote.tabs.every((t) => t.displayName === 'local name')).toBe(true);
  expect(f.info).not.toHaveBeenCalled();
  f.connection.dispose();
});
it('limits retry to one and can save after another conflict', async () => {
  const f = setupRace();
  f.edit();
  f.remote.tabs[0].project!.metadata.prompt_raw = 'agent';
  f.invoke.mockImplementationOnce(async () => ({
    ok: false,
    error: {
      code: 'conflict',
      message: 'conflict',
      details: { session: structuredClone(f.remote) },
    },
  }));
  f.invoke.mockImplementationOnce(async () => {
    f.remote.tabs[0].project!.metadata.prompt_raw = 'agent again';
    return {
      ok: false,
      error: {
        code: 'conflict',
        message: 'conflict',
        details: { session: structuredClone(f.remote) },
      },
    };
  });
  await vi.runAllTimersAsync();
  expect(f.invoke).toHaveBeenCalledTimes(2);
  expect(f.error).toHaveBeenCalledTimes(1);
  expect(f.info).not.toHaveBeenCalled();
  f.connection.update((s) => ({
    ...s,
    tabs: s.tabs.map((t) => ({ ...t, displayName: 'later edit' })),
  }));
  await vi.runAllTimersAsync();
  expect(f.invoke).toHaveBeenCalledTimes(3);
  expect(f.remote.tabs[0].project!.metadata.prompt_raw).toBe('user');
  expect(f.remote.tabs[1].displayName).toBe('later edit');
  f.connection.dispose();
});
it('includes typing and renaming made while the conflict response is pending', async () => {
  const f = setupRace();
  f.edit();
  f.remote.tabs[0].project!.metadata.prompt_raw = 'agent';
  let respond!: (result: any) => void;
  f.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const flushing = f.connection.flush();
  const next = structuredClone(f.connection.current);
  next.tabs[0].project!.metadata.prompt_raw = 'more user typing';
  next.tabs[1].displayName = 'renamed during commit';
  next.activeTabId = next.tabs[1].id;
  f.connection.update(next);
  respond({
    ok: false,
    error: {
      code: 'conflict',
      message: 'conflict',
      details: { session: structuredClone(f.remote) },
    },
  });
  await flushing;
  expect(f.remote.tabs[0].project!.metadata.prompt_raw).toBe('more user typing');
  expect(f.remote.tabs[1].displayName).toBe('renamed during commit');
  expect(f.remote.activeTabId).toBe(next.activeTabId);
  f.connection.dispose();
});
it('retains a file opened before session restoration completes', async () => {
  vi.useFakeTimers();
  const invoke = vi.fn(async (_name, input) => ({ ok: true, data: input.next }));
  const connection = new WorkbenchConnection(invoke as InvokeCommand, vi.fn(), vi.fn());
  const image = { id: 'synthetic', image_path: '/synthetic.png', metadata: {}, tags: [] };
  const early = createWorkbenchTab(image);
  connection.update({ version: 2, tabs: [early], activeTabId: early.id });
  connection.hydrate({ version: 2, tabs: [], activeTabId: '' });
  expect(connection.current.tabs[0].id).toBe(early.id);
  await vi.runAllTimersAsync();
  expect(invoke.mock.calls[0][1].next.tabs[0].id).toBe(early.id);
});
it('publishes optimistic edits immediately and acknowledges without rendering again', async () => {
  vi.useFakeTimers();
  const publish = vi.fn();
  const invoke = vi.fn(async (_name, input) => ({ ok: true, data: input.next }));
  const connection = new WorkbenchConnection(invoke as InvokeCommand, publish, vi.fn());
  connection.hydrate({ version: 2, tabs: [], activeTabId: '' });
  connection.update({ version: 2, tabs: [], activeTabId: 'first' });
  connection.update({ version: 2, tabs: [], activeTabId: 'second' });
  expect(publish).toHaveBeenCalledTimes(3);
  expect(invoke).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(publish).toHaveBeenCalledTimes(3);
  expect(connection.current.activeTabId).toBe('second');
});

it('serializes changes made while a prior commit is awaiting acknowledgement', async () => {
  vi.useFakeTimers();
  let acknowledge!: (value: unknown) => void;
  const invoke = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    )
    .mockImplementation(async (_name, input) => ({ ok: true, data: input.next }));
  const connection = new WorkbenchConnection(invoke as InvokeCommand, vi.fn(), vi.fn());
  connection.hydrate({ version: 2, tabs: [], activeTabId: '' });
  const tabs = ['first', 'second'].map((id) => ({
    ...createWorkbenchTab({ id, metadata: {}, tags: [] }),
    id,
  }));
  const first: CommandSession = { version: 2, tabs, activeTabId: 'first' };
  connection.update(first);
  const flushing = connection.flush();
  connection.update({ ...first, activeTabId: 'second' });
  acknowledge({ ok: true, data: first });
  await flushing;
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke.mock.calls[1][1].base.activeTabId).toBe('first');
  expect(connection.current.activeTabId).toBe('second');
  connection.dispose();
});
