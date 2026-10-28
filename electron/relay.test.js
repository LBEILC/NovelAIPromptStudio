import { describe, it, expect } from 'vitest';
import { normalizeRelayUrl, checkRelayRequest } from './relay.js';
import { createNovelAIClient, buildGenerationRequest } from './generation.js';
import { startFakeNovelAI } from './fixtures/novelAIService.js';

describe('relay boundary', () => {
  const request = () =>
    buildGenerationRequest(
      { width: 832, height: 1216, steps: 28, scale: 5, sampler: 'k_euler_ancestral' },
      'nai-diffusion-5-full',
    );
  it.each([
    ['/novelai', '/novelai'],
    ['/novelai/', '/novelai'],
    ['/novelai/v1/', '/novelai'],
    ['/v1', ''],
    ['/a/b', '/a/b'],
    ['/path', '/path'],
    ['/a///v1///', '/a'],
    ['/a/v1/v1/', '/a/v1'],
  ])('normalizes path %s', (path, expected) => {
    expect(normalizeRelayUrl(`https://example.com${path}`)).toBe(`https://example.com${expected}`);
  });
  it.each(['https://example.com', 'https://example.com/', 'https://example.com/v1/'])(
    'normalizes %s',
    (url) => expect(normalizeRelayUrl(url)).toBe('https://example.com'),
  );
  it.each([
    'http://example.com',
    'https://user:pass@example.com',
    'https://user@example.com',
    'invalid url',
    'https://example.com/?',
    'https://example.com/#',
    'https://example.com?q=1',
    'https://example.com/#x',
  ])('rejects %s', (url) =>
    expect(() => normalizeRelayUrl(url)).toThrow(
      '中转站地址无效，要以 https:// 开头，不能带 ? 或 #',
    ),
  );
  it.each([
    ['relay', 'https://example.com/novelai/v1/', 'https://example.com/novelai'],
    ['relay', 'https://example.com', 'https://example.com'],
    ['official', 'https://image.novelai.net', 'https://image.novelai.net'],
    ['official', 'http://127.0.0.1:123', 'http://127.0.0.1:123'],
  ])('preserves endpoint URLs for %s %s', async (connection, baseUrl, base) => {
    const urls = [];
    const client = createNovelAIClient({
      connection,
      baseUrl,
      token: () => 'synthetic-key',
      fetchImpl: async (url) => {
        urls.push(url.href);
        return new Response('{}');
      },
    });
    await client.models();
    await expect(client.generate(request())).rejects.toThrow();
    await expect(client.upscale({ image: 'synthetic-image' })).rejects.toThrow();
    await client.encodeVibe({});
    expect(urls).toEqual(
      ['/v1/models', '/ai/generate-image-stream', '/ai/upscale', '/ai/encode-vibe'].map(
        (endpoint) => base + endpoint,
      ),
    );
  });
  it.each(['generate', 'upscale'])(
    '%s explains non-image responses without changing error metadata',
    async (method) => {
      const secret = 'synthetic-relay-secret';
      const run = (connection, body) =>
        createNovelAIClient({
          connection,
          baseUrl:
            connection === 'relay' ? 'https://example.com/novelai' : 'https://image.novelai.net',
          token: () => secret,
          fetchImpl: async () =>
            new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
        })[method](method === 'generate' ? request() : { image: 'synthetic-image' });
      await expect(run('relay', '{"error":"File not found"}')).rejects.toThrow(
        '中转站没有返回图片：File not found。请检查中转站地址是否完整',
      );
      const error = await run('relay', JSON.stringify({ error: `wrong ${secret}` })).catch(
        (error) => error,
      );
      expect(error.constructor).toBe(Error);
      expect(error.message).toBe('中转站没有返回图片：wrong [redacted]。请检查中转站地址是否完整');
      expect(Object.keys(error)).toEqual([]);
      await expect(run('relay', '<html>missing</html>')).rejects.toThrow(
        '中转站没有返回图片，请检查中转站地址是否完整',
      );
      await expect(run('official', '{"error":"File not found"}')).rejects.toThrow(
        'NovelAI 没有返回图片：File not found',
      );
      await expect(run('official', '{}')).rejects.toThrow('生成结果不是有效的 ZIP');
      await expect(run('relay', 'PKbroken')).rejects.toThrow('生成结果不是有效的 ZIP');
    },
  );
  it.each(['localhost', '127.0.0.1', '[::1]'])('allows local HTTP %s', (host) =>
    expect(normalizeRelayUrl(`http://${host}:123/v1`)).toBe(`http://${host}:123`),
  );
  it('maps models from a local service and preserves unknown IDs', async () => {
    const server = await startFakeNovelAI();
    try {
      const client = createNovelAIClient({
        connection: 'relay',
        baseUrl: server.url,
        token: () => 'acceptance-token',
      });
      expect(await client.models()).toEqual({
        models: [
          'nai-diffusion-5-full',
          'nai-diffusion-4-5-full',
          'nai-diffusion-5-full-inpainting',
        ],
        other: [],
      });
    } finally {
      await server.close();
    }
  });
  it('blocks unavailable models and new Vibe encodes, allowing cached encodes', () => {
    const settings = { connection: 'relay', relay: { models: ['nai-diffusion-5-full'] } };
    expect(() => checkRelayRequest(settings, { model: 'nai-diffusion-4-full' })).toThrow(
      '中转站没有这个模型',
    );
    expect(() => checkRelayRequest(settings, { model: 'nai-diffusion-5-full' }, 1)).toThrow(
      '新的 Vibe',
    );
    expect(() =>
      checkRelayRequest(settings, { model: 'nai-diffusion-5-full-medium' }, 0),
    ).not.toThrow();
  });
  it('redacts keys and maps model errors; unavailable model listing is optional', async () => {
    const secret = 'synthetic-relay-secret';
    const client = (status, body) =>
      createNovelAIClient({
        connection: 'relay',
        baseUrl: 'https://example.com',
        token: () => secret,
        fetchImpl: async () => new Response(body, { status }),
      });
    await expect(
      client(
        403,
        JSON.stringify({ error: { message: `The requested model does not exist ${secret}` } }),
      ).generate(
        buildGenerationRequest(
          { width: 832, height: 1216, steps: 28, scale: 5, sampler: 'k_euler_ancestral' },
          'nai-diffusion-5-full',
        ),
      ),
    ).rejects.toThrow('中转站没有这个模型');
    await expect(
      client(401, JSON.stringify({ error: { message: `wrong ${secret}` } })).models(),
    ).rejects.toThrow('wrong [redacted]');
    expect(await client(404, '').models()).toBeNull();
    expect(await client(200, '<html>').models()).toBeNull();
  });
});
