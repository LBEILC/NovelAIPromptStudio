import http from 'node:http';
import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  authError,
  protocolError,
  createPKCE,
  validateIDToken,
  parseModels,
  quotaFromHeaders,
  quotaFromUsage,
  readResponses,
} from './chatgptProtocol.js';

const RESOURCE = 'https://api.openai.com/v1';
const CODEX_CLIENT = 'app_EMoamEEZ73f0CkXaXp7hrann';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
// Protocol implementation; no third-party login source is bundled.
export function createChatGPT({
  preferences,
  openExternal,
  emit = () => {},
  fetcher = (...args) => globalThis.fetch(...args),
  endpoints = {},
  loginTimeout = 600000,
  clientVersion = '1.4.0',
}) {
  const config = {
    issuer: 'https://auth.openai.com',
    api: RESOURCE,
    codex: 'https://chatgpt.com/backend-api/codex',
    usage: 'https://chatgpt.com/backend-api/wham/usage',
    ...endpoints,
  };
  let pending, metadata;
  const refreshing = new Map(),
    epochs = { official: 0, codex: 0 },
    operations = { official: new Set(), codex: new Set() };
  const notify = () => emit({ type: 'ai-settings' });
  const mode = () => preferences.publicSettings().chatgpt.mode;
  const get = (m) => preferences.chatGPTRecord(m);
  const save = (m, value) => {
    preferences.saveChatGPTRecord(m, value);
    notify();
  };
  const assertEpoch = (m, epoch) => {
    if (epochs[m] !== epoch) throw authError('canceled', '操作已取消');
  };
  function clear(m) {
    epochs[m]++;
    for (const controller of operations[m]) controller.abort();
    preferences.clearChatGPTRecord(m);
    notify();
  }
  async function request(url, options = {}) {
    try {
      return await fetcher(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.any([
          ...(options.signal ? [options.signal] : []),
          AbortSignal.timeout(60000),
        ]),
      });
    } catch (error) {
      if (options.signal?.aborted) throw authError('canceled', '操作已取消');
      throw authError('network', '无法连接 ChatGPT 服务');
    }
  }
  async function json(url, options) {
    const response = await request(url, options);
    let body;
    try {
      body = await response.json();
    } catch {
      if (options?.signal?.aborted) throw authError('canceled', '操作已取消');
      throw authError('network', 'ChatGPT 返回格式无效');
    }
    if (!response.ok) throw protocolError(body, response.status, response.headers);
    return body;
  }
  async function discovery(signal) {
    if (!metadata) {
      const data = await json(`${config.issuer}/.well-known/openid-configuration`, { signal });
      if (data.issuer !== config.issuer) throw authError('invalid_token', '授权服务 issuer 不匹配');
      for (const key of ['jwks_uri', 'revocation_endpoint']) {
        const url = new URL(data[key]);
        if (url.origin !== new URL(config.issuer).origin)
          throw authError('invalid_token', '授权服务地址无效');
      }
      metadata = data;
    }
    return metadata;
  }
  const tokenURL = (m) => `${config.issuer}${m === 'official' ? '/api/accounts' : ''}/oauth/token`;
  const form = (values) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });
  function tokenRecord(body, old) {
    if (
      typeof body.access_token !== 'string' ||
      !body.access_token ||
      typeof body.refresh_token !== 'string' ||
      !body.refresh_token ||
      !(body.expires_in > 0) ||
      !Number.isFinite(Number(body.expires_in))
    )
      throw authError('invalid_token', 'ChatGPT 令牌响应不完整');
    return {
      ...old,
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + body.expires_in * 1000,
      scope: body.scope ?? old.scope,
      earliestRefreshAt: body.earliest_refresh_at ?? old.earliestRefreshAt,
    };
  }
  async function signIn() {
    if (pending) throw authError('conflict', '已有登录正在等待');
    if (!preferences.publicSettings().encryptionAvailable)
      throw authError('unavailable', '当前系统无法安全加密登录令牌');
    const m = mode(),
      epoch = epochs[m],
      controller = new AbortController();
    const attempt = { controller };
    pending = attempt;
    const timeout = setTimeout(() => controller.abort(), loginTimeout);
    let server;
    try {
      let old = get(m);
      if (!old.hostId) {
        old = { ...old, hostId: `urn:uuid:${crypto.randomUUID()}` };
        save(m, old);
      }
      const oidc = await discovery(controller.signal),
        pkce = createPKCE();
      let receive, rejectCallback;
      const callback = new Promise((resolve, reject) => {
        receive = resolve;
        rejectCallback = reject;
      });
      // Attach before opening the browser: cancellation cannot create an unhandled rejection.
      callback.catch(() => {});
      controller.signal.addEventListener(
        'abort',
        () => rejectCallback(authError('canceled', '登录已取消')),
        { once: true },
      );
      let received = false;
      server = http.createServer((req, res) => {
        let url;
        try {
          url = new URL(req.url, 'http://127.0.0.1');
        } catch {
          return res.writeHead(400).end();
        }
        if (req.headers.host !== `127.0.0.1:${server.address().port}`)
          return res.writeHead(400).end();
        if (req.method !== 'GET' || url.pathname !== '/auth/callback')
          return res.writeHead(404).end();
        if (url.searchParams.get('state') !== pkce.state)
          return res
            .writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            .end('登录状态校验失败，请返回软件重新登录');
        if (received) return res.writeHead(409).end();
        received = true;
        receive({ url, res });
      });
      const listen = (port) =>
        new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve();
          });
        });
      if (m === 'codex' && !config.randomCodexPort) {
        try {
          await listen(1455);
        } catch {
          try {
            await listen(1457);
          } catch {
            throw authError('conflict', '端口被占用，请先关掉正在登录的 Codex');
          }
        }
      } else await listen(0);
      const redirect = `http://127.0.0.1:${server.address().port}/auth/callback`;
      const clientId = m === 'codex' ? CODEX_CLIENT : old.clientId || 'dynamic_agent_client';
      const url = new URL(
        `${config.issuer}${m === 'official' ? '/api/accounts' : '/oauth'}/authorize`,
      );
      Object.entries({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: 'code',
        scope: m === 'official' ? SCOPES : 'openid profile email offline_access',
        state: pkce.state,
        nonce: pkce.nonce,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        ...(m === 'official'
          ? {
              resource: RESOURCE,
              ext_agent_host_id: old.hostId,
              ...(!old.clientId ? { agent_name_hint: 'NovelAI Prompt Studio' } : {}),
            }
          : {
              id_token_add_organizations: 'true',
              codex_cli_simplified_flow: 'true',
              originator: 'nai-prompt-studio',
            }),
      }).forEach(([key, value]) => url.searchParams.set(key, value));
      if (controller.signal.aborted) throw authError('canceled', '登录已取消');
      try {
        await openExternal(url.href);
      } catch {
        throw authError('network', '无法打开系统浏览器');
      }
      const returned = await callback;
      const respond = (message) =>
        new Promise((resolve) => {
          if (returned.res.destroyed) {
            resolve();
            return;
          }
          returned.res.once('finish', resolve);
          returned.res.once('close', resolve);
          returned.res
            .writeHead(200, {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
            })
            .end(message);
        });
      try {
        const params = returned.url.searchParams;
        if (params.has('error')) throw protocolError({ error: params.get('error') }, null, null);
        const issued = m === 'codex' ? CODEX_CLIENT : params.get('client_id') || old.clientId;
        if (
          !issued ||
          issued === 'dynamic_agent_client' ||
          (old.clientId && old.clientId !== issued) ||
          !params.get('code')
        )
          throw authError('invalid_token', '登录回调不完整或客户端不匹配');
        // Retain the issued registration even when exchange fails; never re-register it.
        assertEpoch(m, epoch);
        old = { ...old, clientId: issued };
        save(m, old);
        const body = await json(tokenURL(m), {
          ...form({
            grant_type: 'authorization_code',
            client_id: issued,
            code: params.get('code'),
            code_verifier: pkce.verifier,
            redirect_uri: redirect,
            ...(m === 'official' ? { resource: RESOURCE } : {}),
          }),
          signal: controller.signal,
        });
        const keys = await json(oidc.jwks_uri, { signal: controller.signal });
        const claims = validateIDToken(body.id_token, keys, {
          issuer: oidc.issuer,
          audience: issued,
          nonce: pkce.nonce,
        });
        if (old.sub && (old.sub !== claims.sub || old.issuer !== claims.iss))
          throw authError('invalid_token', '登录账号与原注册不匹配');
        if (
          m === 'official' &&
          !String(body.scope || '')
            .split(' ')
            .includes('chatgpt.tokens.use.direct')
        )
          throw authError('not_eligible', '账号没有授权使用 ChatGPT 套餐额度');
        const record = tokenRecord(body, {
          ...old,
          sub: claims.sub,
          issuer: claims.iss,
          email: claims.email || null,
          accountId: claims['https://api.openai.com/auth']?.chatgpt_account_id,
        });
        assertEpoch(m, epoch);
        if (controller.signal.aborted) throw authError('canceled', '登录已取消');
        epochs[m]++;
        for (const active of operations[m]) active.abort();
        save(m, record);
        await respond('已登录，可以回到 NovelAI Prompt Studio');
        return preferences.publicSettings();
      } catch (error) {
        await respond(error.message);
        throw error;
      }
    } finally {
      clearTimeout(timeout);
      server?.closeAllConnections();
      server?.close();
      if (pending === attempt) pending = null;
    }
  }
  async function access(m, force = false) {
    const old = get(m);
    if (!old.accessToken) throw authError('reauth', '请先在设置中登录 ChatGPT');
    if (!force && old.expiresAt > Date.now() + 30000) return old;
    const earliest =
      typeof old.earliestRefreshAt === 'number'
        ? old.earliestRefreshAt * 1000
        : Date.parse(old.earliestRefreshAt);
    if (earliest > Date.now()) {
      if (!force && old.expiresAt > Date.now()) return old;
      throw authError('unavailable', '尚未到服务器允许的刷新时间');
    }
    if (!refreshing.has(m)) {
      const epoch = epochs[m];
      const promise = (async () => {
        try {
          const body = await json(
            tokenURL(m),
            form({
              grant_type: 'refresh_token',
              client_id: old.clientId,
              refresh_token: old.refreshToken,
              ...(m === 'official' ? { resource: RESOURCE } : {}),
            }),
          );
          const next = tokenRecord(body, old);
          assertEpoch(m, epoch);
          if (
            m === 'official' &&
            !String(next.scope || '')
              .split(' ')
              .includes('chatgpt.tokens.use.direct')
          ) {
            clear(m);
            throw authError('reauth', 'ChatGPT 套餐授权已失效');
          }
          save(m, next);
          return next;
        } catch (error) {
          if (error.code === 'reauth' && epochs[m] === epoch) clear(m);
          throw error;
        }
      })().finally(() => {
        if (refreshing.get(m) === promise) refreshing.delete(m);
      });
      refreshing.set(m, promise);
    }
    return refreshing.get(m);
  }
  function headers(m, token) {
    return {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
      ...(m === 'codex'
        ? {
            originator: 'nai-prompt-studio',
            'User-Agent': 'nai-prompt-studio',
            ...(token.accountId ? { 'ChatGPT-Account-Id': token.accountId } : {}),
          }
        : {}),
    };
  }
  async function authorized(m, url, options, consume) {
    const epoch = epochs[m],
      controller = new AbortController();
    operations[m].add(controller);
    const signal = AbortSignal.any([
      controller.signal,
      ...(options.signal ? [options.signal] : []),
    ]);
    try {
      let refreshed = false;
      for (let attempt = 0; ; attempt++) {
        const token = await access(m);
        assertEpoch(m, epoch);
        signal.throwIfAborted();
        const response = await request(url, {
          ...options,
          signal,
          headers: { ...headers(m, token), ...options.headers },
        });
        const quota = quotaFromHeaders(response.headers);
        assertEpoch(m, epoch);
        if (quota) save(m, { ...get(m), quota });
        try {
          if (!response.ok)
            throw protocolError(
              await response.json().catch(() => ({})),
              response.status,
              response.headers,
            );
          const result = await consume(response);
          assertEpoch(m, epoch);
          return result;
        } catch (error) {
          assertEpoch(m, epoch);
          if (error.details?.status === 401 && !refreshed) {
            await access(m, true);
            refreshed = true;
            continue;
          }
          if (error.code === 'usage_limit')
            save(m, {
              ...get(m),
              limited: {
                resetsAt:
                  m === 'codex'
                    ? get(m).quota?.windows.find((w) => w.remainingPercent === 0)?.resetsAt || null
                    : null,
              },
            });
          if (error.code === 'unavailable' && attempt < 2) {
            await delay(250 * 2 ** attempt, undefined, { signal });
            continue;
          }
          throw error;
        }
      }
    } finally {
      operations[m].delete(controller);
    }
  }
  async function models(m = mode(), signal) {
    const body = await authorized(
      m,
      m === 'official'
        ? `${config.api}/models`
        : `${config.codex}/models?client_version=${encodeURIComponent(clientVersion)}`,
      { signal },
      (r) => r.json(),
    );
    const models = parseModels(body);
    if (!models.length) throw authError('unavailable', '账号没有可用的 ChatGPT 模型');
    if (!get(m).model) save(m, { ...get(m), model: models[0].slug });
    return { models };
  }
  async function complete(messages, signal) {
    const m = mode(),
      epoch = epochs[m];
    if (!get(m).model) await models(m, signal);
    assertEpoch(m, epoch);
    const result = await authorized(
      m,
      `${m === 'official' ? config.api : config.codex}/responses`,
      {
        method: 'POST',
        signal,
        headers: { Accept: 'text/event-stream' },
        body: JSON.stringify({
          model: get(m).model,
          store: false,
          stream: true,
          instructions: messages
            .filter((v) => ['system', 'developer'].includes(v.role))
            .map((v) => v.content)
            .join('\n'),
          input: messages
            .filter((v) => !['system', 'developer'].includes(v.role))
            .map((v) => ({ role: v.role, content: v.content })),
        }),
      },
      readResponses,
    );
    if (get(m).limited) save(m, { ...get(m), limited: null });
    return result;
  }
  async function signOut() {
    pending?.controller.abort();
    const m = mode(),
      old = get(m);
    clear(m);
    let remoteRevoked = false;
    try {
      if (old.refreshToken) {
        const oidc = await discovery();
        const response = await request(
          oidc.revocation_endpoint,
          form({
            token: old.refreshToken,
            token_type_hint: 'refresh_token',
            client_id: old.clientId,
          }),
        );
        remoteRevoked = response.ok;
      }
    } catch {
      /* Local logout is unconditional. */
    }
    return { ...preferences.publicSettings(), remoteRevoked };
  }
  async function quota() {
    const m = mode();
    if (m !== 'codex') return get(m).quota || null;
    const epoch = epochs[m];
    try {
      const value = await authorized(m, config.usage, {}, async (r) =>
        quotaFromUsage(await r.json()),
      );
      save(m, { ...get(m), quota: value });
    } catch (error) {
      if (epochs[m] === epoch)
        save(m, {
          ...get(m),
          quota: {
            ...(get(m).quota || { windows: [], updatedAt: new Date().toISOString() }),
            error: error.message,
          },
        });
    }
    return get(m).quota || null;
  }
  const service = {
    complete,
    models,
    signIn,
    signOut,
    quota,
    cancel: () => {
      pending?.controller.abort();
      return {};
    },
    close: () => {
      pending?.controller.abort();
      for (const controllers of Object.values(operations)) for (const c of controllers) c.abort();
    },
    settingsChanged: (next) => {
      if (next.codexMode !== undefined) {
        pending?.controller.abort();
        for (const m of ['official', 'codex']) {
          epochs[m]++;
          for (const c of operations[m]) c.abort();
        }
        if (!next.codexMode) clear('codex');
      }
      notify();
    },
  };
  preferences.attachChatGPT(service);
  return service;
}

export function chatGPTCommands(service, preferences, openExternal) {
  return {
    'ai.chatgpt.sign-in': () => service.signIn(),
    'ai.chatgpt.cancel-sign-in': () => service.cancel(),
    'ai.chatgpt.sign-out': () => service.signOut(),
    'ai.chatgpt.models': () => service.models(),
    'ai.chatgpt.quota': () => service.quota(),
    'ai.chatgpt.manage-usage': async () => {
      await openExternal('https://chatgpt.com/settings/usage');
      return { ok: true };
    },
  };
}
