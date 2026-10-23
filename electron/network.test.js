import { expect, it, vi } from 'vitest';
import {
  createNetworkManager,
  normalizeNetworkSettings,
  proxyConfig,
  networkCommands,
} from './network.js';
import { validateCommand } from './commands/registry.js';
import { createGenerationQueue } from './generationQueue.js';

const manual = { mode: 'manual', protocol: 'http', host: '127.0.0.1', port: 7890 };
const deferred = () => Promise.withResolvers();
function fixture(initial = { mode: 'system' }) {
  const makeSession = () => ({
    setProxy: vi.fn(async () => {}),
    closeAllConnections: vi.fn(async () => {}),
    clearStorageData: vi.fn(async () => {}),
    fetch: vi.fn(async () => new Response('synthetic')),
  });
  const session = makeSession(),
    updaterSession = makeSession(),
    testSession = makeSession();
  const preferences = { networkSettings: () => initial, saveNetworkSettings: vi.fn() };
  const events = [];
  const network = createNetworkManager({
    session,
    updaterSession,
    createTestSession: () => testSession,
    preferences,
    emit: (event) => events.push(event),
  });
  return { network, session, updaterSession, testSession, preferences, events };
}

it('validates local proxy configuration without accepting rule, credential or URL injection', () => {
  expect(normalizeNetworkSettings()).toEqual({ mode: 'system' });
  for (const mode of ['direct', 'system']) expect(proxyConfig({ mode })).toEqual({ mode });
  expect(proxyConfig(manual)).toEqual({
    mode: 'fixed_servers',
    proxyRules: 'http://127.0.0.1:7890',
  });
  expect(proxyConfig({ ...manual, protocol: 'socks5', host: '[::1]' }).proxyRules).toBe(
    'socks5://[::1]:7890',
  );
  for (const patch of [
    { host: 'example.com' },
    { host: 'user:pass@localhost' },
    { host: 'localhost/path' },
    { host: 'localhost;direct://' },
    { host: 'localhost\n' },
    { host: 'http://localhost' },
    { protocol: 'socks5h' },
    { port: '7890' },
    { port: 0 },
    { port: 65536 },
    { port: 1.2 },
    { username: 'synthetic' },
    { pacScript: 'https://example.com' },
  ])
    expect(() => normalizeNetworkSettings({ ...manual, ...patch })).toThrow();
});

it('initializes both sessions before allowing traffic; invalid startup remains blocked', async () => {
  const f = fixture();
  await expect(f.network.fetch('https://example.com')).rejects.toMatchObject({ code: 'network' });
  await f.network.initialize();
  for (const session of [f.session, f.updaterSession]) {
    expect(session.setProxy).toHaveBeenCalledWith({ mode: 'system' });
    expect(session.closeAllConnections).toHaveBeenCalledTimes(1);
  }
  const bad = fixture({ mode: 'manual', host: 'remote' });
  expect((await bad.network.initialize()).phase).toBe('blocked');
  expect(bad.session.setProxy).not.toHaveBeenCalled();
  await expect(bad.network.run(() => 1)).rejects.toMatchObject({ code: 'network' });
  expect((await bad.network.save({ mode: 'system' })).phase).toBe('ready');
});

it('defers switching until the complete operation ends and gates the next operation', async () => {
  const f = fixture();
  await f.network.initialize();
  const started = deferred(),
    finish = deferred();
  const operation = f.network.run(async () => {
    started.resolve();
    await finish.promise;
    // A pending save must not deadlock the current image's balance refresh or OAuth exchange.
    return f.network.run(async () => (await f.network.fetch('https://example.com')).text());
  });
  await started.promise;
  expect((await f.network.save(manual)).phase).toBe('pending');
  await expect(f.network.save({ mode: 'direct' })).rejects.toMatchObject({ code: 'app_busy' });
  const next = vi.fn(async () => 'next');
  const queued = f.network.run(next);
  await Promise.resolve();
  expect(next).not.toHaveBeenCalled();
  expect(f.preferences.saveNetworkSettings).not.toHaveBeenCalled();
  finish.resolve();
  expect(await operation).toBe('synthetic');
  expect(await queued).toBe('next');
  expect(f.network.get()).toMatchObject({ settings: manual, phase: 'ready', pending: null });
  for (const session of [f.session, f.updaterSession])
    expect(session.setProxy).toHaveBeenLastCalledWith(proxyConfig(manual));
});

it('holds a standalone streaming response through EOF, cancellation and transport failure', async () => {
  const f = fixture();
  await f.network.initialize();
  let controller;
  f.session.fetch.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        start(c) {
          controller = c;
        },
      }),
    ),
  );
  const response = await f.network.fetch('https://example.com');
  expect((await f.network.save(manual)).phase).toBe('pending');
  const body = response.text();
  controller.enqueue(new TextEncoder().encode('chunk'));
  controller.close();
  expect(await body).toBe('chunk');
  await f.network.run(async () => {});
  expect(f.network.get().phase).toBe('ready');
  f.session.fetch.mockResolvedValueOnce(new Response(new ReadableStream()));
  const canceled = await f.network.fetch('https://example.com');
  await canceled.body.cancel();
  expect(f.network.get().active).toBe(0);
  f.session.fetch.mockRejectedValueOnce(new Error('net::ERR_PROXY_CONNECTION_FAILED'));
  await expect(f.network.fetch('https://example.com')).rejects.toThrow('PROXY');
  expect(f.network.get().active).toBe(0);
});

it('rolls both sessions back and preserves saved settings after a partial apply or disk failure', async () => {
  for (const failure of ['session', 'disk']) {
    const f = fixture();
    await f.network.initialize();
    if (failure === 'session') f.updaterSession.setProxy.mockRejectedValueOnce(new Error('fail'));
    else
      f.preferences.saveNetworkSettings.mockImplementationOnce(() => {
        throw Error('disk full');
      });
    expect(await f.network.save(manual)).toMatchObject({
      phase: 'error',
      error: 'apply_failed',
      settings: { mode: 'system' },
    });
    for (const session of [f.session, f.updaterSession])
      expect(session.setProxy).toHaveBeenLastCalledWith({ mode: 'system' });
    expect(await f.network.run(() => 'old config')).toBe('old config');
  }
});

it('blocks dispatch after rollback failure until a successful explicit configuration save', async () => {
  const f = fixture();
  await f.network.initialize();
  f.updaterSession.setProxy
    .mockRejectedValueOnce(Error('apply'))
    .mockRejectedValueOnce(Error('rollback'));
  expect((await f.network.save(manual)).phase).toBe('blocked');
  await expect(f.network.fetch('https://example.com')).rejects.toMatchObject({ code: 'network' });
  expect(f.session.fetch).not.toHaveBeenCalled();
  expect((await f.network.save({ mode: 'system' })).phase).toBe('ready');
});

it('tests only a fixed unauthenticated HEAD in an isolated session and cleans up', async () => {
  const f = fixture();
  await f.network.initialize();
  f.testSession.fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
  expect(await f.network.test(manual)).toMatchObject({
    reachable: true,
    status: 404,
    failure: null,
  });
  expect(f.testSession.fetch).toHaveBeenCalledWith(
    'https://image.novelai.net/',
    expect.objectContaining({ method: 'HEAD', redirect: 'error', credentials: 'omit' }),
  );
  expect(f.preferences.saveNetworkSettings).not.toHaveBeenCalled();
  expect(f.session.setProxy).toHaveBeenCalledTimes(1);
  expect(f.testSession.clearStorageData).toHaveBeenCalledTimes(1);
  f.testSession.fetch.mockRejectedValueOnce(Error('net::ERR_PROXY_CONNECTION_FAILED secret URL'));
  expect(await f.network.test(manual)).toMatchObject({ reachable: false, failure: 'proxy' });
  f.testSession.fetch.mockResolvedValueOnce(new Response(null, { status: 407 }));
  expect(await f.network.test(manual)).toMatchObject({ reachable: false, failure: 'proxy_auth' });
});

it('keeps all three commands UI-only with no arbitrary URL or credential fields', async () => {
  for (const name of Object.keys(networkCommands(fixture().network))) {
    expect(() => validateCommand(name, name.endsWith('.get') ? {} : manual, 'agent')).toThrow();
    expect(() => validateCommand(name, { ...manual, url: 'http://example.com' }, 'ui')).toThrow();
  }
});

it('switches between continuous images without resubmitting the paid request', async () => {
  const f = fixture();
  await f.network.initialize();
  const done = deferred(),
    second = deferred();
  let count = 0;
  const seen = [];
  const queue = createGenerationQueue({
    run: f.network.run,
    balance: async () => 100,
    generate: async () => {
      seen.push(f.network.get().settings);
      if (++count === 1) expect((await f.network.save(manual)).phase).toBe('pending');
      if (count === 2) {
        second.resolve();
        await done.promise;
      }
      return Buffer.from('synthetic');
    },
    accept: async () => `image-${count}`,
  });
  const job = queue.start({ count: 1, continuous: true, request: { parameters: { seed: 0 } } });
  await second.promise;
  queue.stop(job.id);
  done.resolve();
  await queue.close();
  expect(count).toBe(2);
  expect(seen).toEqual([{ mode: 'system' }, manual]);
  expect(queue.status(job.id).completed).toBe(2);
});

it('does not dispatch a queued image stopped while waiting for a network switch', async () => {
  const f = fixture();
  await f.network.initialize();
  const started = deferred(),
    finish = deferred();
  const login = f.network.run(async () => {
    started.resolve();
    await finish.promise;
  });
  await started.promise;
  await f.network.save(manual);
  const generate = vi.fn();
  const queue = createGenerationQueue({
    run: f.network.run,
    balance: async () => 100,
    generate,
    accept: async () => 'image',
  });
  const job = queue.start({ count: 1, request: { parameters: {} } });
  queue.stop(job.id);
  finish.resolve();
  await login;
  await queue.close();
  expect(generate).not.toHaveBeenCalled();
  expect(queue.status(job.id).completed).toBe(0);
});
