import { describe, expect, it, vi } from 'vitest';
import { isStaplerNetworkFailure, retryDelays, runStapler } from './macos-stapler.mjs';
import { notarizeApp } from './notarize-macos.mjs';

describe('stapler retries', () => {
  it.each(['Error 68', 'Code=-1005', 'NSURLErrorDomain', "CloudKit's response is inconsistent"])(
    'recognizes %s',
    (output) => expect(isStaplerNetworkFailure(output)).toBe(true),
  );
  it.each([
    'invalid signature',
    'ticket not found',
    'CloudKit: record not found',
    'status: Rejected',
    'unknown error',
  ])('does not retry %s', (output) => expect(isStaplerNetworkFailure(output)).toBe(false));
  it.each(['staple', 'validate'])('retries %s up to five attempts with backoff', async (action) => {
    const error = new Error('Error 68');
    const run = vi.fn().mockRejectedValue(error);
    const wait = vi.fn();
    const log = vi.fn();
    await expect(runStapler(action, 'fixture.app', { run, wait, log })).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(5);
    expect(wait.mock.calls.flat()).toEqual([15000, 30000, 60000, 120000]);
    expect(retryDelays).toHaveLength(4);
    expect(log.mock.calls[3][0]).toContain('retry 5/5 in 120s: Error 68');
  });
  it('stops immediately on a permanent failure', async () => {
    const run = vi.fn().mockRejectedValue(new Error('invalid signature'));
    const wait = vi.fn();
    await expect(runStapler('validate', 'fixture.app', { run, wait })).rejects.toThrow(
      'invalid signature',
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
  it('submits once and retries only staple after acceptance', async () => {
    const run = vi.fn().mockReturnValue('{"status":"Accepted"}');
    const staplerRun = vi
      .fn()
      .mockRejectedValueOnce(new Error('NSURLErrorDomain -1005'))
      .mockResolvedValue('ok');
    await notarizeApp(
      'fixture.app',
      {},
      {
        run,
        staple: (action, app) =>
          runStapler(action, app, { run: staplerRun, wait: vi.fn(), log: vi.fn() }),
      },
    );
    expect(run.mock.calls.filter(([, args]) => args[0] === 'notarytool')).toHaveLength(1);
    expect(staplerRun.mock.calls.map(([, args]) => args[1])).toEqual([
      'staple',
      'staple',
      'validate',
    ]);
  });
  it('does not staple rejected submissions', async () => {
    const staple = vi.fn();
    await expect(
      notarizeApp('fixture.app', {}, { run: () => '{"status":"Invalid"}', staple }),
    ).rejects.toThrow('Notarization rejected');
    expect(staple).not.toHaveBeenCalled();
  });
});
