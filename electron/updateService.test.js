import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createUpdateService, updateSourceCommands, resolveGithubFeed } from './updateService.js';
import { validateCommand } from './commands/registry.js';

it('resolves the original GitHub configuration after packaging strips build metadata', async () => {
  const feed = { provider: 'github', owner: 'Synthetic', repo: 'Synthetic' };
  expect(await resolveGithubFeed({ build: { publish: [feed] } }, {})).toEqual(feed);
  expect(await resolveGithubFeed({}, { configOnDisk: { value: Promise.resolve(feed) } })).toEqual(
    feed,
  );
  await expect(
    resolveGithubFeed({}, { configOnDisk: { value: Promise.resolve({ provider: 'custom' }) } }),
  ).rejects.toThrow('configuration');
});

function setup({ source = 'mirrorchyan', phase = 'idle', automatic = true, doubles = null } = {}) {
  let state = {
    phase,
    source: 'github',
    downloadSource: 'github',
    latestVersion: '2.1.0',
    hasUpdate: phase !== 'idle',
    progress: phase === 'downloaded' ? 100 : 0,
  };
  const settings = { source, cdk: 'synthetic-cdk', secretStore: 'ok' };
  const updater = new EventEmitter();
  updater.logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  updater.setFeedURL = vi.fn();
  updater.checkForUpdates = vi.fn(async () => {
    updater.emit('checking-for-update');
    updater.emit('update-available', { version: '2.1.0' });
    return { updateInfo: { version: '2.1.0' } };
  });
  updater.downloadUpdate = vi.fn(async () => {
    updater.emit('download-progress', { percent: 50 });
    updater.emit('update-downloaded', { version: '2.1.0' });
  });
  const response = {
    code: 0,
    data: {
      version_name: 'v2.1.0',
      url: 'https://example.com/setup.exe?sig=first',
      sha256: 'a'.repeat(64),
      filesize: 123,
    },
  };
  const fetcher = vi.fn(async (url) => {
    if (url.startsWith('https://mirrorchyan.com/'))
      return { json: async () => structuredClone(response) };
    if (url.startsWith('https://api.github.com/'))
      return { ok: true, json: async () => ({ tag_name: 'v2.1.0' }) };
    return { ok: false };
  });
  const events = [];
  const githubFeed = { provider: 'github', owner: 'LBEILC', repo: 'NovelAIPromptStudio' };
  const preferences = {
    updateSourceSettings: () => ({ ...settings }),
    saveUpdateSource: vi.fn((input) => Object.assign(settings, input)),
  };
  const service = createUpdateService({
    updater,
    preferences,
    network: { fetch: fetcher, run: (fn) => fn() },
    githubFeed,
    currentVersion: '2.0.7',
    capabilities: { canDownloadUpdate: automatic },
    getState: () => state,
    notify: (patch) => {
      state = { ...state, ...patch };
      events.push(state);
    },
    platform: 'win32',
    arch: 'x64',
    doubles,
  });
  return {
    service,
    updater,
    settings,
    response,
    fetcher,
    events,
    preferences,
    githubFeed,
    state: () => state,
  };
}

describe('update source coordination', () => {
  it('checks Mirror without invoking the updater and ignores stale updater events', async () => {
    const env = setup();
    expect(await env.service.check()).toMatchObject({
      ok: true,
      phase: 'available',
      source: 'mirrorchyan',
      downloadSource: 'mirrorchyan',
    });
    expect(env.updater.checkForUpdates).not.toHaveBeenCalled();
    env.updater.emit('update-not-available', { version: '2.0.7' });
    env.updater.emit('update-available', { version: '8.0.0' });
    env.updater.emit('error', Error('stale'));
    expect(env.state()).toMatchObject({ phase: 'available', latestVersion: '2.1.0', error: '' });
    expect(JSON.stringify(env.events)).not.toMatch(/sig=|synthetic-cdk|sha256/);
  });
  it.each([7001, 7002, 7003, 7004, 7005, 8009])(
    'preserves available/downloaded on %s without retry or GitHub',
    async (code) => {
      for (const phase of ['available', 'downloaded']) {
        const env = setup({ phase });
        env.response.code = code;
        expect(await env.service.check()).toMatchObject({
          ok: false,
          phase,
          latestVersion: '2.1.0',
          mirrorCode: code,
          source: 'mirrorchyan',
          mirrorFallback: false,
        });
        expect(env.fetcher).toHaveBeenCalledOnce();
        expect(env.updater.checkForUpdates).not.toHaveBeenCalled();
      }
    },
  );
  it.each([true, false])(
    'falls back through the existing GitHub path (automatic=%s)',
    async (automatic) => {
      const env = setup({ automatic });
      env.response.code = 8001;
      expect(await env.service.check()).toMatchObject({
        ok: true,
        source: 'github',
        downloadSource: 'github',
        mirrorFallback: true,
        mirrorCode: 8001,
        phase: 'available',
      });
      expect(env.updater.checkForUpdates).toHaveBeenCalledTimes(automatic ? 1 : 0);
    },
  );
  it('reports error when both sources fail and resets fallback metadata after recovery', async () => {
    const env = setup();
    env.response.code = 8001;
    env.updater.checkForUpdates.mockRejectedValueOnce(
      Error('offline https://example.com/?sig=secret'),
    );
    expect(await env.service.check()).toMatchObject({
      ok: false,
      phase: 'error',
      mirrorFallback: true,
      mirrorCode: 8001,
    });
    expect(env.state().error).not.toContain('sig=');
    env.settings.source = 'github';
    expect(await env.service.check()).toMatchObject({
      ok: true,
      phase: 'available',
      source: 'github',
      mirrorFallback: undefined,
      mirrorCode: undefined,
    });
  });
  it('refreshes signed URLs before each download attempt and restores the GitHub feed', async () => {
    const env = setup();
    await env.service.check();
    env.response.data.url = 'https://example.com/setup.exe?sig=second';
    env.updater.downloadUpdate.mockRejectedValueOnce(
      Error('download https://example.com/setup.exe?sig=second#frag synthetic-cdk'),
    );
    expect(await env.service.download()).toMatchObject({ ok: false });
    expect(env.state()).toMatchObject({ phase: 'error' });
    expect(env.updater.setFeedURL.mock.calls[0][0].mirrorDownload.url).toContain('sig=second');
    expect(env.updater.disableDifferentialDownload).toBe(true);
    expect(
      env.fetcher.mock.calls.filter(([url]) => url.startsWith('https://mirrorchyan.com/')),
    ).toHaveLength(2);
    expect(JSON.stringify(env.events)).not.toMatch(/sig=|synthetic-cdk/);
    env.response.data.url = 'https://example.com/setup.exe?sig=third';
    expect(await env.service.download()).toEqual({ ok: true });
    expect(env.updater.setFeedURL.mock.calls[1][0].mirrorDownload.url).toContain('sig=third');
    expect(env.state().phase).toBe('downloaded');
    env.settings.source = 'github';
    await env.service.check();
    expect(env.updater.setFeedURL).toHaveBeenLastCalledWith(env.githubFeed);
    expect(env.updater.disableDifferentialDownload).toBe(false);
  });
  it('uses GitHub download after a source change and checks before downloading', async () => {
    const env = setup();
    await env.service.check();
    env.settings.source = 'github';
    expect(await env.service.download()).toEqual({ ok: true });
    expect(env.updater.setFeedURL).toHaveBeenLastCalledWith(env.githubFeed);
    expect(env.updater.checkForUpdates).toHaveBeenCalledOnce();
    expect(env.updater.downloadUpdate).toHaveBeenCalledOnce();
  });
  it('does not download or retry when refreshing returns a CDK error', async () => {
    const env = setup();
    await env.service.check();
    env.response.code = 7003;
    expect(await env.service.download()).toMatchObject({
      ok: false,
      phase: 'available',
      mirrorCode: 7003,
    });
    expect(env.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(env.updater.downloadUpdate).not.toHaveBeenCalled();
    expect(env.updater.setFeedURL).not.toHaveBeenCalled();
    await env.service.download();
    expect(env.updater.downloadUpdate).not.toHaveBeenCalled();
    expect(env.updater.checkForUpdates).not.toHaveBeenCalled();
  });
  it('serializes checks and downloads across asynchronous requests', async () => {
    const env = setup();
    let release;
    env.fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ json: async () => env.response });
        }),
    );
    const first = env.service.check();
    await Promise.resolve();
    expect(await env.service.download()).toMatchObject({ ok: false });
    expect(await env.service.check()).toMatchObject({ ok: true, phase: 'checking' });
    release();
    await first;
    expect(env.updater.checkForUpdates).not.toHaveBeenCalled();
  });
  it('acceptance doubles control version, expiry, code and URL without network access', async () => {
    const doubles = {
      mirrorUpdate: { version: 'v2.1.0', cdk_expired_time: 1800000000, url: true },
    };
    const env = setup({ doubles });
    expect(await env.service.check()).toMatchObject({
      latestVersion: '2.1.0',
      downloadSource: 'mirrorchyan',
      cdkExpiresAt: new Date(1800000000000).toISOString(),
    });
    doubles.mirrorUpdate = { code: 8001 };
    doubles.updateVersion = '3.0.0';
    expect(await env.service.check()).toMatchObject({
      latestVersion: '3.0.0',
      mirrorFallback: true,
    });
    doubles.mirrorError = true;
    doubles.updateError = 'synthetic offline';
    expect(await env.service.check()).toMatchObject({ ok: false, mirrorCode: -1 });
    expect(env.fetcher).not.toHaveBeenCalled();
    expect(env.updater.checkForUpdates).not.toHaveBeenCalled();
  });
});

it('keeps source commands UI-only, saves without checking and opens only a fixed URL', async () => {
  const env = setup();
  const openExternal = vi.fn();
  const commands = updateSourceCommands(env.preferences, openExternal);
  for (const name of Object.keys(commands)) {
    expect(() => validateCommand(name, {}, 'agent')).toThrow('只供');
    expect(validateCommand(name, {}, 'ui')).toBe(name);
  }
  expect(() =>
    validateCommand('updates.open-mirrorchyan', { url: 'https://example.com' }, 'ui'),
  ).toThrow();
  expect(() => validateCommand('updates.source.save', { source: 'unknown' }, 'ui')).toThrow();
  commands['updates.source.save']({ source: 'github' });
  expect(env.fetcher).not.toHaveBeenCalled();
  expect(commands['updates.source.get']().source).toBe('github');
  await commands['updates.open-mirrorchyan']({});
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    'https://mirrorchyan.com/zh/get-start?source=NovelAIPromptStudio',
  );
});
