import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { openPreferences } from './preferences.js';
import { createRelayUsage } from './relayUsage.js';
import { createNovelAIClient, generationError } from './generation.js';
const dirs = [];
const storage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s),
  decryptString: (b) => b.toString(),
};
afterEach(() => {
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function prefs(old) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-slots-'));
  dirs.push(dir);
  if (old) fs.writeFileSync(path.join(dir, 'preferences.json'), JSON.stringify(old));
  return openPreferences(dir, storage);
}
it.each([
  ['https://api.chr1.com', 'chr1'],
  ['https://example.com/service', 'custom'],
])('migrates legacy relay %s once without decrypting or losing other settings', (baseUrl, slot) => {
  const p = prefs({
    relayBaseUrl: baseUrl,
    relayKeyEncrypted: Buffer.from('synthetic').toString('base64'),
    relayModels: ['model'],
    generationConnection: 'relay',
    appearance: { themeMode: 'dark' },
  });
  expect(p.generationSettings().relay).toMatchObject({
    slot,
    baseUrl,
    hasKey: true,
    models: ['model'],
  });
  expect(p.relayKey()).toBe('synthetic');
  const before = fs.readFileSync(p.filePath, 'utf8');
  expect(JSON.parse(before).relayKeyEncrypted).toBeUndefined();
  openPreferences(path.dirname(p.filePath), storage).generationSettings();
  expect(fs.readFileSync(p.filePath, 'utf8')).toBe(before);
  expect(JSON.parse(before).appearance.themeMode).toBe('dark');
});
it('leaves preferences without relays untouched and keeps slot secrets, caches and backups independent', () => {
  const p = prefs({ appearance: { themeMode: 'dark' } });
  const before = fs.readFileSync(p.filePath, 'utf8');
  p.generationSettings();
  expect(fs.readFileSync(p.filePath, 'utf8')).toBe(before);
  p.saveRelay({ baseUrl: 'https://api.chr1.com', key: 'synthetic-one', models: ['one'] });
  p.saveRelay({ baseUrl: 'https://example.com', key: 'synthetic-two', models: ['two'] });
  expect(p.relayKey()).toBe('synthetic-two');
  p.switchRelay('chr1');
  expect(p.relayKey()).toBe('synthetic-one');
  p.saveRelay({ baseUrl: 'https://api.chr1.com', models: ['updated'] });
  expect(p.relayKey()).toBe('synthetic-one');
  expect(() => p.switchRelay('hamubox')).toThrow('还没有保存 Key');
  expect(JSON.stringify(p.backup())).not.toMatch(/synthetic|keyEncrypted|relaySlots/);
  p.setRelayQuota('chr1', 0.8);
  expect(
    openPreferences(path.dirname(p.filePath), storage).generationSettings().relay.lastQuota,
  ).toBeNull();
});
it('converts quota, caches per origin, and never puts keys in URLs', async () => {
  const fetchImpl = vi.fn(async (url, options) => {
    expect(url).not.toContain('synthetic');
    if (url.endsWith('/api/status')) {
      expect(options.headers.Authorization).toBeUndefined();
      return Response.json({ data: { quota_per_unit: 500000 } });
    }
    expect(url).toBe('https://example.com/api/usage/token/');
    expect(options.headers.Authorization).toBe('Bearer synthetic');
    return Response.json({
      data: { total_used: 400000, total_available: 1000000, unlimited_quota: false },
    });
  });
  const api = createRelayUsage({ fetchImpl });
  expect(await api.usage('https://example.com/v1/service', 'synthetic')).toEqual({
    ok: true,
    used: 0.8,
    available: 2,
  });
  await api.usage('https://example.com/other', 'synthetic');
  expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/api/status'))).toHaveLength(1);
});
it.each(['missing', 'invalid', 'timeout'])('returns null accounting for %s', async (kind) => {
  vi.useFakeTimers();
  const api = createRelayUsage({
    fetchImpl: async (url, options) => {
      if (kind === 'missing') return new Response('', { status: 404 });
      if (kind === 'invalid') return Response.json({ data: 'broken' });
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    },
  });
  expect(await api.usage('https://example.com', 'synthetic')).toEqual({
    ok: true,
    used: null,
    available: null,
  });
});
it('unlimited quota has no available amount and request matching retries without selecting another charge', async () => {
  let logs = 0;
  const wait = vi.fn(async () => {});
  const api = createRelayUsage({
    wait,
    fetchImpl: async (url) =>
      Response.json({
        data: url.endsWith('/status')
          ? { quota_per_unit: 500000 }
          : url.endsWith('/token/')
            ? { total_used: 0, unlimited_quota: true }
            : {
                items:
                  ++logs === 1
                    ? [{ request_id: 'other', quota: 1 }]
                    : [{ request_id: 'wanted', quota: 400000 }],
              },
      }),
  });
  expect(await api.usage('https://example.com', 'synthetic')).toEqual({
    ok: true,
    used: 0,
    available: null,
  });
  expect(await api.requestQuota('https://example.com', 'synthetic', 'wanted')).toBe(0.8);
  expect(wait).toHaveBeenCalledWith(3000);
  expect(await api.requestQuota('https://example.com', 'synthetic', null)).toBeNull();
});
it('relay 402 preserves the sanitized server reason while official keeps Anlas', async () => {
  expect(generationError(402)).toBe('Anlas 不足');
  expect(generationError(402, '', '中转站')).toBe('中转站返回 402（通常是余额不足）');
  const api = createNovelAIClient({
    connection: 'relay',
    baseUrl: 'https://example.com',
    token: () => 'synthetic',
    fetchImpl: async () => Response.json({ message: 'NovelAI returned HTTP 402' }, { status: 402 }),
  });
  await expect(api.models()).rejects.toThrow(
    '中转站返回 402（通常是余额不足）：NovelAI returned HTTP 402',
  );
});
it('bounds unavailable accounting to ten seconds', async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  try {
    const api = createRelayUsage({
      fetchImpl: (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('timeout'))),
        ),
    });
    const result = api.usage('https://example.com', 'synthetic');
    await vi.advanceTimersByTimeAsync(10000);
    expect(await result).toEqual({ ok: true, used: null, available: null });
    expect(timeout).toHaveBeenCalledWith(10000);
  } finally {
    timeout.mockRestore();
  }
});
it('stops after the immediate, three-second and fifteen-second quota lookups', async () => {
  const wait = vi.fn(async () => {}),
    fetchImpl = vi.fn(async (url) =>
      Response.json({ data: url.endsWith('/status') ? { quota_per_unit: 1 } : [] }),
    );
  expect(
    await createRelayUsage({ wait, fetchImpl }).requestQuota(
      'https://example.com',
      'synthetic',
      'missing',
    ),
  ).toBeNull();
  expect(wait.mock.calls).toEqual([[3000], [12000]]);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});
