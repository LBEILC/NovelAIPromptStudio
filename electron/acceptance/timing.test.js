import { afterEach, expect, it, vi } from 'vitest';
import { harness } from './harness.js';
import { measureFeedback } from './feedback.js';
import { logTimings, timingMode, timingSummary } from './timing.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('uses CI recording by default and permits explicit strict overrides', () => {
  expect(timingMode(undefined, 'true')).toBe('record');
  expect(timingMode('strict', 'true')).toBe('strict');
  for (const ci of ['', 'false', '0']) expect(timingMode(undefined, ci)).toBe('strict');
  expect(() => timingMode('skip')).toThrow('--timing');
});

it.each(['record', 'strict'])(
  'keeps behavior hard and evaluates late feedback under %s policy',
  async (timing) => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const checks = [];
    const h = harness(
      { webContents: { executeJavaScript: async () => 'context' } },
      { timing },
      checks,
    );
    const start = performance.now();
    const run = h.checkSoon(
      'late',
      () => performance.now() - start >= 110,
      100,
      '',
      undefined,
      'once',
    );
    await vi.advanceTimersByTimeAsync(120);
    await run;
    expect(checks[0].status).toBe('passed');
    expect(checks[1]).toMatchObject({
      status: timing === 'record' ? 'passed' : 'failed',
      timing: { exceeded: true, elapsedMs: 110, result: '计时：超过期限' },
    });
    const missing = h.checkSoon('missing', () => false, 100, '', undefined, 'once');
    await vi.advanceTimersByTimeAsync(12010);
    await missing;
    expect(checks[2].status).toBe('failed');
    expect(checks[3]).toMatchObject({ status: 'failed', timing: { elapsedMs: null } });
  },
);

it('measures synchronous action time and accepts only exact true feedback', async () => {
  vi.useFakeTimers();
  expect(
    await measureFeedback(
      () => true,
      12000,
      () => vi.advanceTimersByTime(201),
    ),
  ).toBe(201);
  const result = measureFeedback(() => 1, 20);
  await vi.advanceTimersByTimeAsync(25);
  expect(await result).toBe(null);
});

it('puts measurements above twice the deadline before ordinary overruns and preserves all entries', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const table = vi.spyOn(console, 'table').mockImplementation(() => {});
  const checks = [100, 201, 150, null].map((elapsedMs) => ({
    label: String(elapsedMs),
    timing: {
      elapsedMs,
      deadlineMs: 100,
      overDouble: elapsedMs > 200,
      exceeded: elapsedMs > 100,
      result:
        elapsedMs === null ? '行为未完成' : elapsedMs > 100 ? '计时：超过期限' : '计时：期限内',
    },
  }));
  const summary = timingSummary(checks);
  expect(summary.map((row) => row.elapsedMs)).toEqual([201, 100, 150, null]);
  logTimings(summary);
  expect(table.mock.calls[0][0][0]).toMatchObject({
    '期限 ms': 100,
    '实际 ms': 201,
    结果: '计时：超过期限',
    超过两倍: true,
  });
});
