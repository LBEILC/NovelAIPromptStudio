import http from 'node:http';
import crypto from 'node:crypto';
import { fixtureServerClose } from './httpLifecycle.js';

export async function startFakeChatGPT() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'fixture-key',
    alg: 'RS256',
    use: 'sig',
  };
  const codes = new Map();
  const state = {
    requests: [],
    registrations: 0,
    refreshes: 0,
    plan: 'plus',
    error: null,
    refreshError: null,
    revokeFail: false,
    stream: 'completed',
    tokenFault: null,
    tokens: 0,
    refreshDelay: 0,
  };
  let origin;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString();
      res.setHeader('x-request-id', 'fixture-request');
      const json = (body, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === '/.well-known/openid-configuration')
        return json({
          issuer: origin,
          jwks_uri: `${origin}/jwks`,
          revocation_endpoint: `${origin}/revoke`,
        });
      if (url.pathname === '/jwks') return json({ keys: [jwk] });
      if (url.pathname.endsWith('/authorize')) {
        const params = url.searchParams;
        const registered = params.get('client_id') === 'dynamic_agent_client';
        if (registered) state.registrations++;
        const client = registered ? 'oaiapp_fixture' : params.get('client_id');
        const code = crypto.randomUUID();
        codes.set(code, { params, client });
        state.requests.push({
          kind: 'authorize',
          client: params.get('client_id'),
          host: params.get('ext_agent_host_id'),
          hint: params.get('agent_name_hint'),
          challenge: params.get('code_challenge'),
          state: params.get('state'),
          nonce: params.get('nonce'),
        });
        const callback = new URL(params.get('redirect_uri'));
        callback.searchParams.set('state', params.get('state'));
        callback.searchParams.set('code', code);
        callback.searchParams.set('client_id', client);
        res.writeHead(302, { Location: callback.href }).end();
        return;
      }
      if (url.pathname.endsWith('/token')) {
        const p = new URLSearchParams(raw),
          refresh = p.get('grant_type') === 'refresh_token';
        if (refresh) {
          state.refreshes++;
          if (state.refreshGate) await state.refreshGate;
          if (state.refreshDelay) await new Promise((r) => setTimeout(r, state.refreshDelay));
          if (state.refreshError) return json({ error: state.refreshError }, 400);
        }
        const saved = codes.get(p.get('code'));
        if (!refresh) {
          codes.delete(p.get('code'));
          if (
            !saved ||
            p.get('client_id') !== saved.client ||
            p.get('redirect_uri') !== saved.params.get('redirect_uri') ||
            crypto.createHash('sha256').update(p.get('code_verifier')).digest('base64url') !==
              saved.params.get('code_challenge')
          )
            return json({ error: 'invalid_grant' }, 400);
        }
        const claims = {
          iss: origin,
          sub: 'synthetic-account',
          aud: p.get('client_id'),
          exp: Math.floor(Date.now() / 1000) + 3600,
          nonce: saved?.params.get('nonce'),
          email: 'synthetic@example.invalid',
          'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-account' },
        };
        if (state.tokenFault === 'nonce') claims.nonce = 'wrong';
        if (state.tokenFault === 'issuer') claims.iss = 'https://wrong.invalid';
        if (state.tokenFault === 'expired') claims.exp = 1;
        if (state.tokenFault === 'audience') claims.aud = 'wrong-client';
        const encoded = [
          Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url'),
          Buffer.from(JSON.stringify(claims)).toString('base64url'),
        ].join('.');
        let sig = crypto.sign('RSA-SHA256', Buffer.from(encoded), privateKey);
        if (state.tokenFault === 'signature') sig[0] ^= 1;
        const n = ++state.tokens;
        return json({
          access_token: `fixture-access-${n}`,
          refresh_token: `fixture-refresh-${n}`,
          expires_in: 3600,
          scope:
            state.plan === 'free'
              ? 'openid email'
              : 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
          earliest_refresh_at: Math.floor(Date.now() / 1000),
          id_token: `${encoded}.${sig.toString('base64url')}`,
        });
      }
      if (url.pathname === '/revoke') {
        state.requests.push({ kind: 'revoke' });
        res.writeHead(state.revokeFail ? 503 : 200).end();
        return;
      }
      if (!req.headers.authorization?.startsWith('Bearer fixture-access-'))
        return json({ error: { code: 'invalid_token' } }, 401);
      const codex = url.pathname.startsWith('/codex');
      if (codex) {
        for (const [key, value] of Object.entries(
          state.plan === 'pro'
            ? { secondary: [20, 10080] }
            : { primary: [25, 300], secondary: [40, 10080] },
        )) {
          res.setHeader(`x-codex-${key}-used-percent`, value[0]);
          res.setHeader(`x-codex-${key}-window-minutes`, value[1]);
          res.setHeader(`x-codex-${key}-reset-at`, Math.floor(Date.now() / 1000) + value[1] * 60);
        }
      }
      if (url.pathname === '/usage')
        return json({
          rate_limit: {
            primary_window:
              state.plan === 'pro'
                ? null
                : { used_percent: 25, limit_window_seconds: 18000, reset_at: 2000000000 },
            secondary_window: {
              used_percent: 40,
              limit_window_seconds: 604800,
              reset_at: 2000500000,
            },
          },
        });
      if (url.pathname.endsWith('/models'))
        return json({
          models: [
            { slug: 'fixture-text', display_name: 'Fixture Text', visibility: 'list' },
            { slug: 'hidden', visibility: 'hide' },
          ],
        });
      if (url.pathname.endsWith('/responses')) {
        const body = JSON.parse(raw);
        state.requests.push({
          kind: 'responses',
          codex,
          body,
          account: req.headers['chatgpt-account-id'],
          originator: req.headers.originator,
        });
        if (state.error)
          return json(
            { error: { code: state.error } },
            state.error.includes('not_eligible')
              ? 403
              : state.error.includes('unavailable')
                ? 503
                : 429,
          );
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
        let input;
        const text = body.input?.at(-1)?.content;
        try {
          input = JSON.parse(text);
        } catch {
          input = text;
        }
        let output = 'OK';
        if (body.instructions.includes('names:'))
          output = JSON.stringify({ names: input.map((_, i) => `合成画面${i + 1}`) });
        else if (input?.tags)
          output = JSON.stringify({
            items: input.tags.map(() => ({ translation: '合成元素', category: 'Subject' })),
          });
        else if (body.instructions.includes('Organize image prompts'))
          output = JSON.stringify({ changes: [] });
        else if (body.instructions.includes('paragraph')) output = '合成段落';
        send({ type: 'response.output_text.delta', delta: output });
        if (state.stream === 'failed')
          send({
            type: 'response.failed',
            response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } },
          });
        else if (state.stream === 'incomplete')
          send({
            type: 'response.incomplete',
            response: { incomplete_details: { reason: 'max_output_tokens' } },
          });
        else if (state.stream === 'completed')
          send({
            type: 'response.completed',
            response: { output: [{ content: [{ type: 'output_text', text: output }] }] },
          });
        else if (state.stream === 'hold') return;
        res.end();
        return;
      }
      json({}, 404);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  const closeServer = fixtureServerClose(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const browserRequests = new Set();
  const blocked = [];
  return {
    blocked,
    fetcher: (url, options) => {
      if (new URL(url).origin !== origin) {
        blocked.push(new URL(url).origin);
        throw Error('Fixture refuses external network');
      }
      return globalThis.fetch(url, options);
    },
    state,
    origin,
    endpoints: {
      issuer: origin,
      api: `${origin}/v1`,
      codex: `${origin}/codex`,
      usage: `${origin}/usage`,
      randomCodexPort: true,
    },
    async openExternal(url, allowPort = () => {}) {
      if (new URL(url).origin !== origin) throw Error('Fixture browser refuses external URLs');
      allowPort(Number(new URL(new URL(url).searchParams.get('redirect_uri')).port));
      const request = fetch(url)
        .then((r) => r.text())
        .catch(() => {})
        .finally(() => browserRequests.delete(request));
      browserRequests.add(request);
    },
    async close() {
      await closeServer();
      await Promise.allSettled(browserRequests);
    },
  };
}
