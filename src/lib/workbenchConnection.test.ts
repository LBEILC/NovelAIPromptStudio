import { afterEach, expect, it, vi } from 'vitest';
import { WorkbenchConnection } from './workbenchConnection';
import type { CommandSession, InvokeCommand } from '../shared/commands';
import { createWorkbenchTab } from './workbenchSession.js';
import { mergeSession } from '../../electron/commands/session.js';

afterEach(() => vi.useRealTimers());
it('does not overwrite an Agent edit arriving after the prepare handshake', async () => {
  vi.useFakeTimers();
  const tab = createWorkbenchTab({
    id: 'synthetic',
    metadata: { prompt_raw: 'original' },
    tags: [],
  });
  const base: CommandSession = { version: 2, tabs: [tab], activeTabId: tab.id };
  const remote = structuredClone(base);
  remote.tabs[0].project!.metadata.prompt_raw = 'agent';
  const invoke = vi.fn(async (_name, input) => {
    try {
      return { ok: true, data: mergeSession(remote, input.base, input.next) };
    } catch {
      return { ok: false, error: { code: 'conflict', message: 'conflict' } };
    }
  });
  const connection = new WorkbenchConnection(invoke as InvokeCommand, vi.fn(), vi.fn());
  connection.hydrate(base);
  const local = structuredClone(base);
  local.tabs[0].project!.metadata.prompt_raw = 'user';
  connection.update(local);
  connection.receive({ source: 'agent', session: remote });
  await expect(connection.flush()).rejects.toThrow('conflict');
  expect(connection.current.tabs[0].project!.metadata.prompt_raw).toBe('user');
  expect(remote.tabs[0].project!.metadata.prompt_raw).toBe('agent');
  connection.dispose();
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
  const first: CommandSession = { version: 2, tabs: [], activeTabId: 'first' };
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
