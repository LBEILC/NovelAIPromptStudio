import { it, expect, vi } from 'vitest';
import { createGenerationQueue } from './generationQueue.js';
import { validateCommand } from './commands/registry.js';

const input = (count = 1) => ({ count, request: { parameters: { seed: 1 } }, fixedSeed: true });
function fixture() {
  const sends = [];
  const queue = createGenerationQueue({
    balance: async () => 100,
    generate: () => new Promise((resolve, reject) => sends.push({ resolve, reject })),
    accept: async () => 'synthetic-image',
  });
  const sent = (count) => vi.waitFor(() => expect(sends).toHaveLength(count));
  const state = (id, state) => vi.waitFor(() => expect(queue.status(id).state).toBe(state));
  return { queue, sends, sent, state };
}
it('pauses after the in-flight image, preserves all pending work on close and resumes explicitly', async () => {
  const { queue: q, sends, sent, state } = fixture();
  const first = q.start(input(3));
  await sent(1);
  const second = q.start(input());
  q.pause();
  sends[0].resolve('png');
  await state(first.id, 'queued');
  expect(q.paused).toBe(true);
  expect(sends).toHaveLength(1);
  await q.close();
  expect(q.status(second.id).state).toBe('queued');
  const next = fixture();
  next.queue.restore(q.status().map((job) => ({ ...job, request: input().request })));
  expect(next.queue.paused).toBe(true);
  expect(next.sends).toHaveLength(0);
  next.queue.resume();
  await next.sent(1);
  next.queue.setCount(first.id, 1);
  expect(next.queue.status(first.id).count).toBe(2);
  expect(() => next.queue.setCount(first.id, 0)).toThrow();
  next.sends[0].resolve('png');
  await next.sent(2);
  next.sends[1].resolve('png');
  await next.state(second.id, 'completed');
  await next.queue.close();
});
it('defers in place, orders queued work, restores removals and appends confirmed agent work', async () => {
  const { queue: q, sends, sent, state } = fixture();
  q.pause();
  const a = q.start(input(2)),
    b = q.start(input()),
    c = q.start(input());
  const agent = q.start({ ...input(), pending: true });
  q.defer(a.id, true);
  q.setCount(a.id, 4);
  q.move(c.id, b.id);
  expect(q.cancel([c.id])).toEqual([{ id: c.id, index: 1, count: 1, state: 'queued' }]);
  expect(q.status().some((j) => j.id === c.id)).toBe(false);
  q.restoreRemoved(c.id);
  q.confirm([agent.id]);
  expect(q.status().map((j) => j.id)).toEqual([a.id, c.id, b.id, agent.id]);
  q.resume();
  await sent(1);
  expect(q.status(c.id).state).toBe('generating');
  expect(() => q.move(c.id)).toThrow();
  expect(() => q.move(b.id, c.id)).toThrow();
  sends[0].reject(new Error('synthetic failure'));
  await sent(2);
  expect(q.status(c.id).state).toBe('failed');
  q.pause();
  sends[1].resolve('png');
  await state(b.id, 'completed');
  q.defer(a.id, false);
  expect(q.status()[0].id).toBe(a.id);
  q.resume();
  await sent(3);
  q.skip(a.id);
  sends[2].resolve('png');
  await sent(4);
  sends[3].resolve('png');
  await state(agent.id, 'completed');
  expect(q.status(a.id)).toMatchObject({ state: 'skipped', skipped: true, completed: 1, count: 4 });
  await q.close();
});
it('clamps an in-flight count to completed plus one and disallows editing continuous work', async () => {
  const { queue: q, sends, sent, state } = fixture();
  const a = q.start(input(4));
  await sent(1);
  q.setCount(a.id, 0);
  expect(q.status(a.id).count).toBe(1);
  sends[0].resolve('png');
  await state(a.id, 'completed');
  q.pause();
  const continuous = q.start({ ...input(), continuous: true });
  expect(() => q.setCount(continuous.id, 2)).toThrow();
  await q.close();
});
it('restricts every queue mutation to UI callers', () => {
  for (const [name, input] of Object.entries({
    pause: {},
    resume: {},
    'set-count': { id: 'a', count: 2 },
    skip: { id: 'a' },
    defer: { id: 'a', deferred: true },
    move: { id: 'a' },
    restore: { id: 'a' },
    cancel: { ids: ['a'] },
    retry: { id: 'a' },
  })) {
    expect(() => validateCommand(`generate.${name}`, input, 'agent')).toThrow();
    expect(validateCommand(`generate.${name}`, input, 'ui')).toBe(`generate.${name}`);
  }
  expect(validateCommand('generate.status', {}, 'agent')).toBe('generate.status');
});
