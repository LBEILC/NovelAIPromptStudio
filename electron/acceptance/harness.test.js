import { afterEach, expect, it, vi } from 'vitest';
import { harness } from './harness.js';

afterEach(() => vi.restoreAllMocks());

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
  expect(checks[0]).toEqual({ category: '启动', label: 'pass', status: 'passed' });
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
  const { h, checks } = setup();
  await h.checkSoon(
    'feedback',
    () => false,
    0,
    '',
    () => ({ actual: 2 }),
  );
  await h.check('legacy', () => false);
  expect(checks[0].details).toEqual({ actual: 2 });
  expect(checks[1].status).toBe('failed');
  expect(checks[1]).not.toHaveProperty('details');
});
