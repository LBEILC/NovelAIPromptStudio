import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { openPreferences } from './preferences.js';
import { createChatGPT } from './chatgpt.js';
import {
  createPKCE,
  protocolError,
  quotaFromHeaders,
  quotaFromUsage,
  parseModels,
} from './chatgptProtocol.js';
import { startFakeChatGPT } from './fixtures/chatGPTService.js';
import {
  requestStructuredAI,
  transformParagraph,
  translateTags,
  testModel,
} from './translation.js';
import { validateCommand } from './commands/registry.js';

// Reversible fixture encryption, restricted to disposable test profiles.
const safe = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(text).map((v) => v ^ 93),
  decryptString: (bytes) =>
    Buffer.from(bytes)
      .map((v) => v ^ 93)
      .toString(),
};
let directory, preferences, fixture, service, events;
beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-chatgpt-test-'));
  preferences = openPreferences(directory, safe);
  fixture = await startFakeChatGPT();
  events = [];
  service = createChatGPT({
    preferences,
    endpoints: fixture.endpoints,
    openExternal: (url) => fixture.openExternal(url),
    emit: (e) => events.push(e),
  });
});
afterEach(async () => {
  service.close();
  await fixture.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
const login = async () => {
  await service.signIn();
  await service.models();
};
const expire = () =>
  preferences.saveChatGPTRecord('official', {
    ...preferences.chatGPTRecord('official'),
    expiresAt: 0,
  });

describe('ChatGPT authorization and credentials', () => {
  it('uses fresh PKCE/state/nonce and registers once, preserving encrypted host/client across logout', async () => {
    const a = createPKCE(),
      b = createPKCE();
    expect(a.challenge).toBe(crypto.createHash('sha256').update(a.verifier).digest('base64url'));
    for (const key of ['verifier', 'state', 'nonce']) expect(a[key]).not.toBe(b[key]);
    await login();
    expect(preferences.publicSettings()).toMatchObject({
      provider: 'chatgpt',
      chatgpt: { signedIn: true, email: 'synthetic@example.invalid', model: 'fixture-text' },
    });
    const onDisk = fs.readFileSync(preferences.filePath, 'utf8');
    expect(onDisk).not.toMatch(/fixture-access|fixture-refresh|synthetic@example/);
    expect(JSON.stringify(preferences.publicSettings())).not.toMatch(
      /accessToken|refreshToken|hostId|clientId/,
    );
    const old = preferences.chatGPTRecord('official');
    fixture.state.revokeFail = true;
    expect(await service.signOut()).toMatchObject({
      remoteRevoked: false,
      chatgpt: { signedIn: false },
    });
    expect(preferences.chatGPTRecord('official')).toMatchObject({
      clientId: old.clientId,
      hostId: old.hostId,
    });
    await login();
    expect(fixture.state.registrations).toBe(1);
    const attempts = fixture.state.requests.filter((r) => r.kind === 'authorize');
    expect(attempts[1]).toMatchObject({
      client: 'oaiapp_fixture',
      host: attempts[0].host,
      hint: null,
    });
    expect(attempts[1].state).not.toBe(attempts[0].state);
    expect(events.some((e) => e.type === 'ai-settings')).toBe(true);
  });
  it.each(['nonce', 'issuer', 'expired', 'signature', 'audience'])(
    'rejects invalid ID token: %s',
    async (fault) => {
      fixture.state.tokenFault = fault;
      await expect(service.signIn()).rejects.toMatchObject({ code: 'invalid_token' });
      expect(preferences.publicSettings().chatgpt.signedIn).toBe(false);
    },
  );
  it('requires plan scope and system encryption', async () => {
    fixture.state.plan = 'free';
    await expect(service.signIn()).rejects.toMatchObject({ code: 'not_eligible' });
    const unavailable = openPreferences(directory, { ...safe, isEncryptionAvailable: () => false });
    const blocked = createChatGPT({
      preferences: unavailable,
      openExternal: () => {
        throw Error('must not open');
      },
    });
    await expect(blocked.signIn()).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('ignores forged state, supports explicit cancel and prevents concurrent login', async () => {
    let opened;
    service = createChatGPT({
      preferences,
      endpoints: fixture.endpoints,
      openExternal: async (url) => {
        opened = new URL(url);
      },
    });
    const waiting = service.signIn();
    const result = waiting.catch((e) => e);
    while (!opened) await new Promise((r) => setTimeout(r, 5));
    await expect(service.signIn()).rejects.toMatchObject({ code: 'conflict' });
    const forged = new URL(opened.searchParams.get('redirect_uri'));
    forged.searchParams.set('state', 'forged');
    expect((await fetch(forged)).status).toBe(400);
    service.cancel();
    expect(await result).toMatchObject({ code: 'canceled' });
    expect(preferences.publicSettings().chatgpt.signedIn).toBe(false);
  });
  it('times out as canceled', async () => {
    service = createChatGPT({
      preferences,
      endpoints: fixture.endpoints,
      openExternal: async () => {},
      loginTimeout: 30,
    });
    await expect(service.signIn()).rejects.toMatchObject({ code: 'canceled' });
  });
  it('serializes refresh and atomically rotates complete token sets', async () => {
    await login();
    const old = preferences.chatGPTRecord('official');
    expire();
    fixture.state.refreshDelay = 30;
    await Promise.all([service.models(), service.models(), service.models()]);
    expect(fixture.state.refreshes).toBe(1);
    const next = preferences.chatGPTRecord('official');
    expect(next.accessToken).not.toBe(old.accessToken);
    expect(next.refreshToken).not.toBe(old.refreshToken);
    expect(next.earliestRefreshAt).toBeTypeOf('number');
    expect(openPreferences(directory, safe).chatGPTRecord('official')).toEqual(next);
  });
  it.each([
    'invalid_grant',
    'invalid_refresh_token',
    'token_expired',
    'refresh_token_expired',
    'refresh_token_invalidated',
    'refresh_token_reused',
  ])('clears terminal refresh error %s', async (code) => {
    await login();
    expire();
    fixture.state.refreshError = code;
    await expect(service.models()).rejects.toMatchObject({
      code: 'reauth',
      details: { machineCode: code, status: 400, requestId: 'fixture-request' },
    });
    expect(preferences.publicSettings().chatgpt.signedIn).toBe(false);
    expect(preferences.chatGPTRecord('official').clientId).toBe('oaiapp_fixture');
  });
  it('keeps credentials on temporary/configuration failure and respects earliest refresh', async () => {
    await login();
    expire();
    const old = preferences.chatGPTRecord('official');
    fixture.state.refreshError = 'invalid_client';
    await expect(service.models()).rejects.toMatchObject({ code: 'request_failed' });
    expect(preferences.chatGPTRecord('official')).toEqual(old);
    preferences.saveChatGPTRecord('official', {
      ...old,
      earliestRefreshAt: Math.floor(Date.now() / 1000) + 120,
    });
    await expect(service.models()).rejects.toMatchObject({ code: 'unavailable' });
    expect(fixture.state.refreshes).toBe(1);
  });
  it('cannot resurrect credentials when logout races refresh', async () => {
    await login();
    expire();
    fixture.state.refreshDelay = 60;
    const request = service.models().catch((e) => e);
    while (!fixture.state.refreshes) await new Promise((r) => setTimeout(r, 5));
    await service.signOut();
    await request;
    expect(preferences.publicSettings().chatgpt.signedIn).toBe(false);
  });
  it('keeps the previous complete encrypted record if persisting rotated credentials fails', async () => {
    await login();
    expire();
    const previous = preferences.chatGPTRecord('official');
    const original = preferences.saveChatGPTRecord;
    preferences.saveChatGPTRecord = () => {
      throw Error('synthetic disk failure');
    };
    await expect(service.models()).rejects.toThrow('synthetic disk failure');
    preferences.saveChatGPTRecord = original;
    expect(openPreferences(directory, safe).chatGPTRecord('official')).toEqual(previous);
  });
  it('does not clear a session on a transport failure during refresh', async () => {
    await login();
    expire();
    const previous = preferences.chatGPTRecord('official');
    service = createChatGPT({
      preferences,
      endpoints: fixture.endpoints,
      openExternal: fixture.openExternal,
      fetcher: async () => {
        throw TypeError('synthetic offline');
      },
    });
    await expect(service.models()).rejects.toMatchObject({ code: 'network' });
    expect(preferences.chatGPTRecord('official')).toEqual(previous);
  });
  it('denies every account command to Agent callers', () => {
    for (const command of [
      'sign-in',
      'cancel-sign-in',
      'sign-out',
      'models',
      'quota',
      'manage-usage',
    ]) {
      expect(() => validateCommand(`ai.chatgpt.${command}`, {}, 'agent')).toThrow('只供软件界面');
    }
  });
  it('migrates legacy API keys and ignores read-only settings without resetting partial saves', () => {
    expect(preferences.publicSettings().provider).toBe('chatgpt');
    fs.writeFileSync(
      preferences.filePath,
      JSON.stringify({
        aiApiKeyEncrypted: safe.encryptString('synthetic-key').toString('base64'),
        aiModel: 'legacy-model',
        aiBaseUrl: 'https://example.invalid/v1',
      }),
    );
    expect(preferences.publicSettings().provider).toBe('apiKey');
    preferences.saveAISettings({ introShown: true, chatgpt: { signedIn: true }, hasApiKey: false });
    expect(preferences.publicSettings()).toMatchObject({
      provider: 'apiKey',
      model: 'legacy-model',
      hasApiKey: true,
      chatgpt: { signedIn: false },
    });
    expect(() =>
      validateCommand(
        'settings.ai.save',
        { settings: { ...preferences.publicSettings(), chatgptModel: 'fixture-text' } },
        'ui',
      ),
    ).not.toThrow();
  });
});
describe('ChatGPT inference and quota', () => {
  it('routes every text action to Responses and sends only supported fields', async () => {
    await login();
    const settings = preferences.credentials();
    expect(await requestStructuredAI('Return JSON {names:[]}', [{}], settings)).toEqual({
      names: ['合成画面1'],
    });
    expect(await transformParagraph('synthetic', 'translate', settings)).toBe('合成段落');
    expect((await translateTags(['synthetic'], settings)).translations).toEqual(['合成元素']);
    expect((await testModel(settings)).response).toBe('OK');
    const requests = fixture.state.requests.filter((r) => r.kind === 'responses');
    expect(requests).toHaveLength(4);
    for (const { body } of requests)
      expect(Object.keys(body).sort()).toEqual([
        'input',
        'instructions',
        'model',
        'store',
        'stream',
      ]);
  });
  it.each([
    ['failed', 'usage_limit'],
    ['incomplete', 'response_incomplete'],
    ['disconnected', 'stream_disconnected'],
  ])('rejects SSE %s', async (stream, code) => {
    await login();
    fixture.state.stream = stream;
    await expect(service.complete([{ role: 'user', content: 'OK' }])).rejects.toMatchObject({
      code,
    });
    if (stream === 'failed')
      expect(preferences.publicSettings().chatgpt.limited).toEqual({ resetsAt: null });
    fixture.state.stream = 'completed';
    await service.complete([{ role: 'user', content: 'OK' }]);
    expect(preferences.publicSettings().chatgpt.limited).toBeNull();
  });
  it('cancels an active response stream', async () => {
    await login();
    fixture.state.stream = 'hold';
    const controller = new AbortController();
    const result = service
      .complete([{ role: 'user', content: 'OK' }], controller.signal)
      .catch((e) => e);
    while (!fixture.state.requests.some((r) => r.kind === 'responses'))
      await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    expect(await result).toBeInstanceOf(Error);
  });
  it('bounded retry for unavailable, structured errors and no API key fallback', async () => {
    await login();
    preferences.saveAISettings({ apiKey: 'synthetic-fallback-key' });
    fixture.state.error = 'subscription_sharing_usage_unavailable';
    await expect(service.complete([{ role: 'user', content: 'OK' }])).rejects.toMatchObject({
      code: 'unavailable',
      details: { status: 503, requestId: 'fixture-request' },
    });
    expect(fixture.state.requests.filter((r) => r.kind === 'responses')).toHaveLength(3);
    expect(preferences.publicSettings()).toMatchObject({
      provider: 'chatgpt',
      chatgpt: { signedIn: true },
    });
    expect(
      protocolError({ error: { code: 'subscription_sharing_user_not_eligible' } }, 403).code,
    ).toBe('not_eligible');
    expect(protocolError({ detail: 'anything' }, 403).code).toBe('request_failed');
  });
  it('keeps model server order and uses actual quota durations', () => {
    expect(
      parseModels({
        models: [
          { slug: 'z', visibility: 'list', display_name: 'Z' },
          { slug: 'a', visibility: 'list' },
          { slug: 'b', visibility: 'hidden' },
        ],
      }).map((m) => m.slug),
    ).toEqual(['z', 'a']);
    expect(
      quotaFromHeaders(
        new Headers({
          'x-codex-secondary-used-percent': '25',
          'x-codex-secondary-window-minutes': '60',
        }),
      ).windows[0],
    ).toMatchObject({ label: '1 小时内', remainingPercent: 75 });
    expect(
      quotaFromUsage({
        rate_limit: { secondary_window: { used_percent: 20, limit_window_seconds: 604800 } },
      }).windows,
    ).toHaveLength(1);
    expect(quotaFromHeaders(new Headers())).toBeNull();
  });
  it('isolates Codex credentials, parses one/two windows and erases Codex on disable', async () => {
    await login();
    const official = preferences.chatGPTRecord('official');
    preferences.saveAISettings({ codexMode: true });
    expect(preferences.publicSettings().chatgpt.signedIn).toBe(false);
    await login();
    expect((await service.quota()).windows).toHaveLength(2);
    await service.complete([{ role: 'user', content: 'OK' }]);
    expect(fixture.state.requests.find((r) => r.kind === 'responses')).toMatchObject({
      codex: true,
      account: 'fixture-account',
      originator: 'nai-prompt-studio',
    });
    fixture.state.plan = 'pro';
    expect((await service.quota()).windows).toHaveLength(1);
    preferences.saveAISettings({ codexMode: false });
    expect(preferences.chatGPTRecord('official')).toEqual(official);
    expect(preferences.chatGPTRecord('codex').accessToken).toBeUndefined();
    expect(preferences.publicSettings().chatgpt).toMatchObject({
      mode: 'official',
      signedIn: true,
    });
  });
});
