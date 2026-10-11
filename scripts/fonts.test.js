import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { checkFont, requireFont, prepareFont, request, downloadPage } from './fonts.mjs';

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue() }));
import { setTimeout as delay } from 'node:timers/promises';

const roots = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it('retries connection failures and interrupted response bodies with bounded backoff', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => {
        throw new TypeError('terminated');
      },
    })
    .mockResolvedValueOnce(new Response('complete'));
  vi.stubGlobal('fetch', fetch);
  const headers = { Range: 'bytes=10-19' };
  expect((await request(downloadPage, headers)).bytes.toString()).toBe('complete');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls.every(([, options]) => options.headers === headers)).toBe(true);
  expect(delay.mock.calls).toEqual([[1000], [2000]]);
});

it('stops after four network attempts', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
  vi.stubGlobal('fetch', fetch);
  await expect(request(downloadPage)).rejects.toThrow('fetch failed');
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(delay.mock.calls).toEqual([[1000], [2000], [4000]]);
});

it('cancels an ignored required range without downloading or retrying the full archive', async () => {
  const cancel = vi.fn();
  const arrayBuffer = vi.fn();
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: { cancel }, arrayBuffer });
  vi.stubGlobal('fetch', fetch);
  await expect(request(downloadPage, { Range: 'bytes=0-29' }, 206)).rejects.toThrow('范围读取');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(arrayBuffer).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(delay).not.toHaveBeenCalled();
});

it('fails downloaded hash mismatches without retrying or writing the font', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nai-fonts-'));
  roots.push(root);
  const file = path.join(root, 'font.ttf');
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('<a href="/MiSans VF.ttf">font</a>'))
    .mockResolvedValueOnce(new Response('wrong font'));
  vi.stubGlobal('fetch', fetch);
  await expect(prepareFont(file)).rejects.toThrow('SHA-256');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(delay).not.toHaveBeenCalled();
  await expect(checkFont(file)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects a corrupt cache without requesting the website', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nai-fonts-'));
  roots.push(root);
  const file = path.join(root, 'font.ttf');
  await writeFile(file, 'corrupt cache');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(prepareFont(file)).rejects.toThrow('SHA-256');
  expect(fetch).not.toHaveBeenCalled();
  expect(delay).not.toHaveBeenCalled();
});
it('rejects missing or corrupt MiSans before release packaging', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nai-fonts-'));
  roots.push(root);
  const file = path.join(root, 'font.ttf');
  await expect(requireFont(file)).rejects.toThrow('npm run fonts');
  await writeFile(file, 'not a font');
  await expect(checkFont(file)).rejects.toThrow('SHA-256');
  await expect(requireFont(file)).rejects.toThrow('禁止无字体打包');
});
