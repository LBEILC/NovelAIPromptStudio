import { afterEach, expect, it, vi } from 'vitest';
import { harness } from './harness.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup() {
  const checks = [];
  const evaluate = vi.fn(async (code) =>
    code === 'progress' ? [{ completed: 25, total: 60 }] : 'context',
  );
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  return {
    checks,
    evaluate,
    log,
    error,
    h: harness({ webContents: { executeJavaScript: evaluate } }, {}, checks),
  };
}

it('records and logs renderer failure details only for a failed assertion', async () => {
  const { h, checks, error } = setup();
  await h.check('progress', () => false, 'progress');
  expect(checks[0]).toMatchObject({
    status: 'failed',
    error: 'Error: 断言值：false',
    details: [{ completed: 25, total: 60 }],
  });
  expect(error.mock.calls[0][0]).toContain('失败说明：[{"completed":25,"total":60}]');
});

it('does not evaluate or record details when the assertion passes', async () => {
  const { h, checks, evaluate, error } = setup();
  const details = vi.fn();
  await h.check('pass', () => true, details);
  expect(details).not.toHaveBeenCalled();
  expect(evaluate).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  expect(checks[0]).toMatchObject({ category: '启动', label: 'pass', status: 'passed' });
});

it('preserves the original failure when collecting details also throws', async () => {
  const { h, checks } = setup();
  await h.check(
    'error',
    () => {
      throw Error('original');
    },
    () => {
      throw Error('details');
    },
  );
  expect(checks[0]).toMatchObject({
    error: 'Error: original',
    details: { error: 'Error: details' },
  });
});

it('forwards deferred details from feedback checks and keeps two-argument checks compatible', async () => {
  vi.useFakeTimers();
  const { h, checks } = setup();
  const pending = h.checkSoon(
    'feedback',
    () => false,
    0,
    '',
    () => ({ actual: 2 }),
  );
  await vi.advanceTimersByTimeAsync(12010);
  await pending;
  await h.check('legacy', () => false);
  expect(checks[0].details).toEqual({ actual: 2 });
  expect(checks.at(-1).status).toBe('failed');
  expect(checks.at(-1)).not.toHaveProperty('details');
});

it('identifies renderer timeouts and clears their timers after successful evaluations', async () => {
  vi.useFakeTimers();
  const { h, evaluate } = setup();
  h.category('图片库·复制');
  await h.check('图片加载完成', () => true);
  await h.evaluate('ready');
  expect(vi.getTimerCount()).toBe(0);
  evaluate.mockImplementation(() => new Promise(() => {}));
  const pending = h.evaluate('never', '打开复制菜单');
  const rejected = expect(pending).rejects.toThrow(
    /Renderer evaluation timeout.*图片库·复制.*图片加载完成.*打开复制菜单.*15000 ms/,
  );
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps slow waits bounded and reports the elapsed budget', async () => {
  vi.useFakeTimers();
  const h = harness({ webContents: { executeJavaScript: async () => false } }, { slow: 6 }, []);
  h.category('慢机器');
  const pending = h.wait('false', '等待目标图片');
  const rejected = expect(pending).rejects.toThrow(/等待目标图片.*60000 ms（上限 60000 ms）/);
  await vi.advanceTimersByTimeAsync(60000);
  await rejected;
});

it('waits for final state without timing records and never repeats an action', async () => {
  const calls = [];
  const checks = [];
  let theme = 'light';
  const h = harness(
    {
      webContents: {
        executeJavaScript: async (code) => {
          calls.push(code);
          return code.includes('performAction()') ? 850 : true;
        },
      },
    },
    {
      slow: 4,
      themeDriver: {
        get: () => theme,
        set: (value) => {
          theme = value;
        },
      },
    },
    checks,
  );
  h.dualThemes(true);
  await h.checkSoon('布局', 'true', 200, 'performAction()', undefined, 'both');
  expect(calls.filter((code) => code.includes('performAction()'))).toHaveLength(1);
  expect(checks.map((check) => check.theme)).toEqual(['light', 'dark']);
  expect(checks.every((check) => check.status === 'passed' && !('timing' in check))).toBe(true);
  expect(theme).toBe('light');
  checks.length = 0;
  await h.check('数据', () => true, undefined, 'once');
  expect(checks).toHaveLength(1);
});
