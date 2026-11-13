import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import {
  mirrorFailure,
  parseMirrorResponse,
  requestMirrorUpdate,
  mirrorReleaseNotes,
  MirrorChyanProvider,
  sanitizeUpdateText,
  createUpdateLogger,
} from './mirrorchyan.js';

const payload = (data = {}) => ({
  code: 0,
  data: {
    version_name: 'v2.1.0',
    release_note: 'x'.repeat(4100),
    url: 'https://example.com/update.exe?signature=synthetic#fragment',
    sha256: 'a'.repeat(64),
    filesize: 123,
    ...data,
  },
});
const options = { currentVersion: '2.0.7', platform: 'win32', cdk: 'synthetic-cdk' };

describe('Mirror metadata and transport', () => {
  it.each([7001, 7002, 7003, 7004, 7005, 8009])('does not fall back for CDK code %s', (code) => {
    expect(mirrorFailure(code)).toMatchObject({ mirrorCode: code, mirrorFallback: false });
    expect(
      parseMirrorResponse({ code, msg: 'untrusted secret' }, options).failure.error,
    ).not.toContain('untrusted');
  });
  it.each([-1, 8001, 8002, 8003, 8004, 1001, 1, 9999])('falls back for %s', (code) => {
    expect(mirrorFailure(code)).toMatchObject({ mirrorCode: code, mirrorFallback: true });
  });
  it.each([undefined, {}, { code: '0' }, { code: 0 }, payload({ version_name: '../../invalid' })])(
    'rejects malformed metadata',
    (value) => {
      expect(parseMirrorResponse(value, options).failure.mirrorCode).toBe(-1);
    },
  );
  it.each([1800000000, 1800000000000])(
    'normalizes expiry %s even for current versions',
    (timestamp) => {
      for (const currentVersion of ['2.0.7', '2.1.0', '3.0.0']) {
        const { state, download } = parseMirrorResponse(payload({ cdk_expired_time: timestamp }), {
          ...options,
          currentVersion,
        });
        expect(state.cdkExpiresAt).toBe(new Date(1800000000000).toISOString());
        expect(state.latestVersion).toBe('2.1.0');
        expect(state.hasUpdate).toBe(currentVersion === '2.0.7');
        expect(state.notes).toHaveLength(4000);
        expect(JSON.stringify(state)).not.toMatch(/signature|synthetic-cdk|sha256/);
        expect(download.sha256).toBe('a'.repeat(64));
      }
    },
  );
  it.each([
    ['win32', '', '', true, 'github'],
    ['win32', 'key', '', true, 'mirrorchyan'],
    ['win32', 'key', '', false, 'github'],
    ['darwin', 'key', '', true, 'github'],
    ['darwin', 'key', 'ZipRID', true, 'mirrorchyan'],
    ['linux', 'key', '', true, 'github'],
  ])('chooses download for %s cdk=%s zip=%s url=%s', (platform, cdk, macZipRid, url, source) => {
    expect(
      parseMirrorResponse(payload(url ? {} : { url: undefined }), {
        ...options,
        platform,
        cdk,
        macZipRid,
      }).state.downloadSource,
    ).toBe(source);
  });
  it('reads non-2xx business JSON and sends a bounded request with no current_version', async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ code: 7003 }),
    }));
    expect(
      (await requestMirrorUpdate(fetcher, { ...options, arch: 'x64' })).failure.mirrorCode,
    ).toBe(7003);
    const [address, init] = fetcher.mock.calls[0];
    const url = new URL(address);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      os: 'win',
      arch: 'x64',
      channel: 'stable',
      user_agent: 'NovelAIPromptStudio',
      cdk: 'synthetic-cdk',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('uses the zip RID for both mac architectures and omits empty CDKs', async () => {
    for (const arch of ['arm64', 'x64']) {
      const fetcher = vi.fn(async () => ({ json: async () => payload() }));
      await requestMirrorUpdate(fetcher, {
        ...options,
        platform: 'darwin',
        arch,
        cdk: '',
        macZipRid: 'ZipRID',
      });
      const url = new URL(fetcher.mock.calls[0][0]);
      expect(url.pathname).toContain('/ZipRID/');
      expect(url.searchParams.get('os')).toBe('macos');
      expect(url.searchParams.get('arch')).toBe(arch);
      expect(url.searchParams.has('cdk')).toBe(false);
    }
  });
  it.each(['network', 'json', 'timeout'])(
    'converts %s to a safe fallback without retrying',
    async (failure) => {
      const fetcher = vi.fn(async (_url, init) => {
        if (failure === 'json')
          return {
            json: async () => {
              throw Error('invalid JSON');
            },
          };
        if (failure === 'timeout')
          return new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () => reject(init.signal.reason)),
          );
        throw Error('https://example.com/?cdk=synthetic-cdk');
      });
      vi.useFakeTimers();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
      });
      try {
        const result = requestMirrorUpdate(fetcher, options);
        await vi.advanceTimersByTimeAsync(10000);
        expect((await result).failure).toMatchObject({ mirrorCode: -1, mirrorFallback: true });
      } finally {
        timeout.mockRestore();
        vi.useRealTimers();
      }
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it('fetches optional structured notes directly, verifies version and tolerates failures', async () => {
    const notes = {
      schema: 'nps-release-notes/1',
      version: '2.1.0',
      date: '2026-11-13',
      items: [],
    };
    for (const data of [notes, { ...notes, version: '1.0.0' }, {}]) {
      const fetcher = vi.fn(async () => ({ ok: true, json: async () => data }));
      expect(await mirrorReleaseNotes(fetcher, '2.1.0')).toEqual(data === notes ? notes : null);
      expect(fetcher.mock.calls[0][0]).toBe(
        'https://github.com/LBEILC/NovelAIPromptStudio/releases/download/v2.1.0/release-notes.json',
      );
    }
    expect(
      await mirrorReleaseNotes(async () => {
        throw Error('offline');
      }, '2.1.0'),
    ).toBeNull();
  });
});

it('provides SHA-256 hex and size without SHA-512 through the installed custom provider factory', async () => {
  const require = createRequire(import.meta.url);
  const { createClient } = require('electron-updater/out/providerFactory.js');
  const { download } = parseMirrorResponse(payload(), options);
  const provider = createClient(
    { provider: 'custom', updateProvider: MirrorChyanProvider, mirrorDownload: download },
    {},
    {},
  );
  const info = await provider.getLatestVersion();
  expect(info.files).toEqual([{ url: download.url, sha2: download.sha256, size: 123 }]);
  expect(info.files[0]).not.toHaveProperty('sha512');
  expect(provider.resolveFiles(info)).toEqual([
    { url: new URL(download.url), info: info.files[0] },
  ]);
  expect(
    () => new MirrorChyanProvider({ mirrorDownload: { ...download, sha256: '' } }, {}, {}),
  ).toThrow('校验信息');
});

it('the installed runtime accepts SHA-256 hex and rejects corrupt download bytes', async () => {
  const require = createRequire(import.meta.url);
  const { DigestTransform } = require('builder-util-runtime');
  const bytes = Buffer.from('synthetic installer bytes');
  const sha = createHash('sha256').update(bytes).digest('hex');
  for (const actual of [bytes, Buffer.from('corrupt')]) {
    const digest = new DigestTransform(sha, 'sha256', 'hex');
    const result = new Promise((resolve) => {
      digest.on('error', () => resolve(false));
      digest.on('finish', () => resolve(true));
    });
    digest.resume();
    digest.end(actual);
    expect(await result).toBe(actual === bytes);
  }
});

it('unsigned Windows updates are allowed only when publisherName is absent', async () => {
  const require = createRequire(import.meta.url);
  const { NsisUpdater } = require('electron-updater/out/NsisUpdater.js');
  const verify = vi.fn(async () => 'synthetic signature rejection');
  const target = {
    configOnDisk: { value: Promise.resolve({}) },
    _verifyUpdateCodeSignature: verify,
  };
  expect(await NsisUpdater.prototype.verifySignature.call(target, 'synthetic.exe')).toBeNull();
  expect(verify).not.toHaveBeenCalled();
  target.configOnDisk.value = Promise.resolve({ publisherName: 'Synthetic Publisher' });
  expect(await NsisUpdater.prototype.verifySignature.call(target, 'synthetic.exe')).toBe(
    'synthetic signature rejection',
  );
  expect(verify).toHaveBeenCalledWith(['Synthetic Publisher'], 'synthetic.exe');
});

it('redacts every URL query/fragment, nested logger values and literal CDKs', () => {
  const message =
    'failed https://mirrorchyan.com/api?cdk=synthetic-secret#frag and https://cdn.example.com/file.exe?sig=signed-secret#part synthetic-secret';
  const cleaned = sanitizeUpdateText(message, ['synthetic-secret']);
  expect(cleaned).not.toMatch(/cdk=|sig=|frag|signed-secret|synthetic-secret/);
  expect(cleaned).toContain('https://cdn.example.com/file.exe');
  const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const logger = createUpdateLogger(sink, () => ['synthetic-secret']);
  for (const level of Object.keys(sink)) {
    logger[level](message, Error(message), { nested: [message] });
    expect(JSON.stringify(sink[level].mock.calls)).not.toMatch(
      /cdk=|sig=|signed-secret|synthetic-secret/,
    );
  }
});
