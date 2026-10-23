import { AsyncLocalStorage } from 'node:async_hooks';
import { CommandError } from './commands/registry.js';

export function normalizeNetworkSettings(value = { mode: 'system' }) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['mode', 'protocol', 'host', 'port'].includes(key)) ||
    !['system', 'direct', 'manual'].includes(value.mode)
  )
    throw new CommandError('invalid_input', '网络设置无效');
  if (value.mode !== 'manual') return { mode: value.mode };
  // TODO(design): first version intentionally supports only local, unauthenticated proxies.
  if (
    !['http', 'socks5'].includes(value.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(value.host) ||
    !Number.isInteger(value.port) ||
    value.port < 1 ||
    value.port > 65535
  )
    throw new CommandError('invalid_input', '代理地址或端口无效');
  return { mode: 'manual', protocol: value.protocol, host: value.host, port: value.port };
}

export function proxyConfig(value) {
  const settings = normalizeNetworkSettings(value);
  return settings.mode === 'manual'
    ? {
        mode: 'fixed_servers',
        proxyRules: `${settings.protocol}://${settings.host}:${settings.port}`,
        // Preserve Chromium's implicit loopback bypass. Never add a DIRECT fallback.
      }
    : { mode: settings.mode };
}

export function networkFailure(error) {
  const text = String(error?.message || '');
  return /proxy|tunnel|socks/i.test(text)
    ? 'proxy'
    : /abort|timeout|timed.out/i.test(text)
      ? 'timeout'
      : /name.not.resolved|dns/i.test(text)
        ? 'dns'
        : /cert|ssl|tls/i.test(text)
          ? 'tls'
          : 'network';
}

// A lease covers a complete logical operation (including its response body). Nested
// requests can finish on the old configuration while new operations wait at the gate.
export function createNetworkManager({
  session,
  updaterSession,
  createTestSession,
  preferences,
  emit = () => {},
}) {
  const sessions = [...new Set([session, updaterSession].filter(Boolean))];
  const context = new AsyncLocalStorage();
  let active = 0,
    current = null,
    pending = null,
    phase = 'blocked',
    error = null;
  let applying = null,
    testing = false;
  const waiters = new Set();
  const get = () => structuredClone({ settings: current, pending, phase, error, active });
  const notify = () => emit({ type: 'network', data: get() });
  const wake = () => {
    for (const resolve of waiters) resolve();
    waiters.clear();
  };
  const configure = async (settings) => {
    for (const target of sessions) await target.setProxy(proxyConfig(settings));
    for (const target of sessions) await target.closeAllConnections();
  };
  async function apply() {
    if (!pending || active || applying) return applying;
    const next = pending;
    phase = 'applying';
    applying = (async () => {
      try {
        await configure(next);
        await preferences.saveNetworkSettings(next);
        current = next;
        phase = 'ready';
        error = null;
      } catch {
        error = 'apply_failed';
        try {
          if (!current) throw new Error('No previous configuration');
          await configure(current);
          phase = 'error';
        } catch {
          phase = 'blocked';
          error = 'rollback_failed';
        }
      } finally {
        pending = null;
      }
    })();
    notify();
    await applying;
    applying = null;
    wake();
    notify();
  }
  async function acquire() {
    while (pending || applying) await new Promise((resolve) => waiters.add(resolve));
    if (phase === 'blocked')
      throw new CommandError('network', '网络配置不可用', { machineCode: error });
    active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
      void apply();
    };
  }
  async function run(operation) {
    if (context.getStore()?.active) return operation();
    const release = await acquire();
    const lease = { active: true };
    try {
      return await context.run(lease, operation);
    } finally {
      lease.active = false;
      release();
    }
  }
  async function fetcher(url, options = {}) {
    if (context.getStore()?.active) return session.fetch(url, options);
    const release = await acquire();
    const signal = AbortSignal.any([
      ...(options.signal ? [options.signal] : []),
      AbortSignal.timeout(180000),
    ]);
    const finish = () => {
      signal?.removeEventListener('abort', finish);
      release();
    };
    try {
      signal?.throwIfAborted();
      signal?.addEventListener('abort', finish, { once: true });
      const response = await session.fetch(url, { ...options, signal });
      if (!response.body) {
        finish();
        return response;
      }
      const reader = response.body.getReader();
      const body = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              finish();
            } else controller.enqueue(value);
          } catch (error) {
            controller.error(error);
            finish();
          }
        },
        async cancel(reason) {
          try {
            await reader.cancel(reason);
          } finally {
            finish();
          }
        },
      });
      const tracked = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      Object.defineProperties(tracked, {
        url: { value: response.url },
        redirected: { value: response.redirected },
        type: { value: response.type },
      });
      return tracked;
    } catch (error) {
      finish();
      throw error;
    }
  }
  return {
    get,
    run,
    fetch: fetcher,
    async initialize() {
      try {
        const settings = normalizeNetworkSettings(preferences.networkSettings());
        await configure(settings);
        current = settings;
        phase = 'ready';
      } catch {
        phase = 'blocked';
        error = 'initialization_failed';
      }
      notify();
      return get();
    },
    async save(value) {
      const settings = normalizeNetworkSettings(value);
      if (pending || applying) throw new CommandError('app_busy', '网络设置正在等待生效');
      pending = settings;
      phase = active ? 'pending' : 'applying';
      error = null;
      notify();
      if (!active) await apply();
      return get();
    },
    async test(value) {
      const settings = normalizeNetworkSettings(value);
      if (testing) throw new CommandError('app_busy', '连接测试正在进行');
      testing = true;
      let testSession;
      const start = Date.now();
      try {
        testSession = createTestSession();
        await testSession.setProxy(proxyConfig(settings));
        await testSession.closeAllConnections();
        // Fixed, unauthenticated HEAD: no AI inference, credentials, or arbitrary URL IPC.
        const response = await testSession.fetch('https://image.novelai.net/', {
          method: 'HEAD',
          redirect: 'error',
          credentials: 'omit',
          signal: AbortSignal.timeout(10000),
        });
        await response.body?.cancel();
        return {
          reachable: response.status !== 407,
          status: response.status,
          failure: response.status === 407 ? 'proxy_auth' : null,
          elapsedMs: Date.now() - start,
        };
      } catch (error) {
        return {
          reachable: false,
          status: null,
          failure: networkFailure(error),
          elapsedMs: Date.now() - start,
        };
      } finally {
        try {
          await testSession?.closeAllConnections();
          await testSession?.clearStorageData();
        } finally {
          testing = false;
        }
      }
    },
  };
}

export function networkCommands(network) {
  return {
    'settings.network.get': () => network.get(),
    'settings.network.save': (settings) => network.save(settings),
    'settings.network.test': (settings) => network.test(settings),
  };
}
