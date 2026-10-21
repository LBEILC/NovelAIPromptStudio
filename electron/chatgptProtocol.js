import crypto from 'node:crypto';
import { CommandError } from './commands/registry.js';

export const terminalRefreshCodes = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
]);
export function authError(code, message, details) {
  const error = new CommandError(code, message);
  error.details = details;
  return error;
}
export function protocolError(body, status, headers, fallback = 'request_failed') {
  const raw = typeof body?.error === 'string' ? body.error : body?.error?.code || body?.code;
  const code =
    raw === 'subscription_sharing_user_not_eligible'
      ? 'not_eligible'
      : ['subscription_sharing_usage_limit_exceeded', 'usage_limit_reached'].includes(raw)
        ? 'usage_limit'
        : terminalRefreshCodes.has(raw)
          ? 'reauth'
          : status === 503 ||
              [
                'subscription_sharing_usage_unavailable',
                'subscription_sharing_user_unavailable',
              ].includes(raw)
            ? 'unavailable'
            : raw === 'access_denied'
              ? 'denied'
              : fallback;
  return authError(code, `ChatGPT 请求失败：${raw || code}${status ? `（HTTP ${status}）` : ''}`, {
    status,
    machineCode: raw || null,
    requestId: headers?.get('x-request-id') || null,
    param: typeof body?.error?.param === 'string' ? body.error.param : null,
  });
}
export function createPKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return {
    verifier,
    challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    state: crypto.randomBytes(32).toString('base64url'),
    nonce: crypto.randomBytes(32).toString('base64url'),
  };
}
export function validateIDToken(token, jwks, { issuer, audience, nonce, now = Date.now() }) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    if (header.alg !== 'RS256') throw Error();
    const keys = jwks.keys.filter(
      (k) =>
        k.kid === header.kid &&
        k.kty === 'RSA' &&
        (!k.use || k.use === 'sig') &&
        (!k.alg || k.alg === 'RS256'),
    );
    if (
      keys.length !== 1 ||
      !crypto.verify(
        'RSA-SHA256',
        Buffer.from(parts.slice(0, 2).join('.')),
        crypto.createPublicKey({ key: keys[0], format: 'jwk' }),
        Buffer.from(parts[2], 'base64url'),
      )
    )
      throw Error();
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      claims.iss !== issuer ||
      !aud.includes(audience) ||
      (aud.length > 1 && claims.azp !== audience) ||
      (claims.azp && claims.azp !== audience) ||
      !Number.isFinite(claims.exp) ||
      claims.exp * 1000 <= now ||
      (claims.nbf && claims.nbf * 1000 > now) ||
      claims.nonce !== nonce ||
      typeof claims.sub !== 'string' ||
      !claims.sub
    )
      throw Error();
    return claims;
  } catch {
    throw authError('invalid_token', 'ChatGPT 身份令牌校验失败');
  }
}
export function parseModels(body) {
  return (Array.isArray(body?.models) ? body.models : [])
    .filter((m) => m.visibility === 'list' && typeof m.slug === 'string' && m.slug)
    .map((m) => ({ slug: m.slug, name: m.display_name || m.slug }));
}
function quotaWindow(used, minutes, reset) {
  if (
    used === null ||
    minutes === null ||
    !Number.isFinite(Number(used)) ||
    !(Number(minutes) > 0) ||
    !Number.isFinite(Number(minutes))
  )
    return null;
  const duration = Number(minutes);
  return {
    label:
      duration === 10080
        ? '本周'
        : duration % 60 === 0
          ? `${duration / 60} 小时内`
          : `${duration} 分钟内`,
    remainingPercent: Math.max(0, Math.min(100, 100 - Number(used))),
    resetsAt:
      Number(reset) > 0 && Number.isFinite(new Date(Number(reset) * 1000).getTime())
        ? new Date(Number(reset) * 1000).toISOString()
        : null,
  };
}
export function quotaFromHeaders(headers) {
  const windows = ['primary', 'secondary']
    .map((name) =>
      quotaWindow(
        headers.get(`x-codex-${name}-used-percent`),
        headers.get(`x-codex-${name}-window-minutes`),
        headers.get(`x-codex-${name}-reset-at`),
      ),
    )
    .filter(Boolean);
  return windows.length ? { windows, updatedAt: new Date().toISOString() } : null;
}
export function quotaFromUsage(body) {
  const windows = ['primary_window', 'secondary_window']
    .map((key) => body?.rate_limit?.[key])
    .filter(Boolean)
    .map((w) => quotaWindow(w.used_percent, w.limit_window_seconds / 60, w.reset_at))
    .filter(Boolean);
  if (!windows.length) throw authError('unavailable', '未返回可用的额度窗口');
  return { windows, updatedAt: new Date().toISOString() };
}
export async function readResponses(response) {
  let buffer = '',
    text = '';
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();
  if (!reader) throw authError('stream_disconnected', 'ChatGPT 响应流为空');
  function event(frame) {
    const data = frame
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') return;
    let value;
    try {
      value = JSON.parse(data);
    } catch {
      throw authError('request_failed', 'ChatGPT 响应流格式无效');
    }
    if (value.type === 'response.output_text.delta') text += value.delta || '';
    if (value.type === 'response.failed' || value.type === 'error')
      throw protocolError(
        value.response || value,
        response.status,
        response.headers,
        'response_failed',
      );
    if (value.type === 'response.incomplete')
      throw authError('response_incomplete', 'ChatGPT 响应未完成', {
        status: response.status,
        machineCode: value.response?.incomplete_details?.reason || null,
        requestId: response.headers.get('x-request-id'),
      });
    if (value.type === 'response.completed')
      return (
        (value.response?.output || [])
          .flatMap((o) => o.content || [])
          .filter((c) => c.type === 'output_text')
          .map((c) => c.text)
          .join('') || text
      );
  }
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');
      if (buffer.length > 4 * 1024 * 1024 || text.length > 4 * 1024 * 1024)
        throw authError('request_failed', 'ChatGPT 响应过大');
      let index;
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const result = event(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
        if (result !== undefined) return result;
      }
      if (done) break;
    }
    throw authError('stream_disconnected', 'ChatGPT 响应流在完成前断开');
  } catch (error) {
    if (error instanceof CommandError) throw error;
    if (error.name === 'AbortError') throw authError('canceled', '操作已取消');
    throw authError('stream_disconnected', 'ChatGPT 响应流在完成前断开', {
      status: response.status,
      requestId: response.headers.get('x-request-id'),
    });
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
