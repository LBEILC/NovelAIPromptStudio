import { it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createUsageStore, recordUsageRequest, usageRange, localDay } from './usage.js';
import { validateCommand } from './commands/registry.js';

const record = {
  jobId: 'synthetic-job',
  workId: 'synthetic-work',
  operation: 'generate',
  model: 'synthetic-model',
  width: 64,
  height: 64,
  images: 1,
  requestedImages: 1,
  anlas: 3,
  estimated: false,
  free: false,
  source: 'user',
  connection: 'official',
  status: 'completed',
};
it('groups local calendar days, Monday-based weeks and months without mixing relay Anlas', () => {
  const connection = new DatabaseSync(':memory:');
  try {
    const usage = createUsageStore(connection),
      now = new Date(2026, 9, 26, 12);
    for (const [date, changes] of [
      [new Date(2026, 8, 30, 23, 59), {}],
      [new Date(2026, 9, 25, 23, 59), { operation: 'upscale' }],
      [new Date(2026, 9, 26, 0, 0), { source: 'agent' }],
      [new Date(2026, 9, 26, 10), { connection: 'relay', anlas: null }],
    ])
      usage.add({ ...record, ...changes, createdAt: date.toISOString() });
    expect(localDay(usageRange('week', now))).toBe('2026-10-26');
    expect(usage.summary('week', 'official', now)).toMatchObject({
      images: 1,
      anlas: 3,
      agent: { images: 1 },
      byModel: { 'synthetic-model': { images: 1 } },
    });
    expect(usage.summary('month', 'official', now)).toMatchObject({
      images: 2,
      anlas: 6,
      byOperation: { upscale: { images: 1 } },
    });
    expect(usage.summary('today', 'relay', now)).toMatchObject({
      images: 1,
      anlas: null,
      agent: { anlas: null },
    });
    expect(usage.daily(3, 'official', now).items.map((r) => [r.date, r.images, r.anlas])).toEqual([
      ['2026-10-24', 0, 0],
      ['2026-10-25', 1, 3],
      ['2026-10-26', 1, 3],
    ]);
    expect(() => usage.daily(0)).toThrow();
    expect(() => usage.daily(367)).toThrow();
    expect(validateCommand('usage.summary', { range: 'week' }, 'agent')).toBe('usage.summary');
    expect(validateCommand('usage.daily', { days: 30 }, 'agent')).toBe('usage.daily');
  } finally {
    connection.close();
  }
});
it('durably records actual requests, measured costs, fallback estimates, failed requests and relay images', async () => {
  const connection = new DatabaseSync(':memory:');
  try {
    const usage = createUsageStore(connection);
    const job = {
      id: 'synthetic-job',
      workId: 'synthetic-work',
      source: 'user',
      spent: 0,
      spentKnown: true,
    };
    const args = {
      usage,
      job,
      request: { model: 'synthetic-model', parameters: { width: 64, height: 128 } },
      connection: 'official',
      price: { anlas: 8, free: false },
    };
    const balance = vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(95);
    await recordUsageRequest({
      ...args,
      balance,
      send: async () => {
        expect(usage.list()[0]).toMatchObject({
          status: 'sending',
          estimated: true,
          anlas: 8,
          images: 0,
        });
        return 'png';
      },
    });
    expect(usage.list()[0]).toMatchObject({
      status: 'completed',
      estimated: false,
      anlas: 5,
      images: 1,
    });
    const missing = async () => {
      throw Error('synthetic missing balance');
    };
    await recordUsageRequest({ ...args, balance: missing, send: async () => 'png' });
    expect(usage.list()[1]).toMatchObject({ estimated: true, anlas: 8, images: 1 });
    await expect(
      recordUsageRequest({
        ...args,
        balance: async () => 90,
        send: async () => {
          throw Error('synthetic rejected');
        },
      }),
    ).rejects.toThrow('synthetic rejected');
    expect(usage.list()[2]).toMatchObject({ status: 'failed', anlas: 0, images: 0 });
    const never = vi.fn();
    await recordUsageRequest({
      ...args,
      connection: 'relay',
      balance: never,
      send: async () => 'png',
    });
    expect(never).not.toHaveBeenCalled();
    expect(usage.list()[3]).toMatchObject({ anlas: null, estimated: false, images: 1 });
    usage.attachVersion(job.id, 'synthetic-version');
    expect(usage.list().every((r) => r.versionId === 'synthetic-version')).toBe(true);
    expect(job.spent).toBe(13);
    expect(job.spentKnown).toBe(false);
  } finally {
    connection.close();
  }
});
