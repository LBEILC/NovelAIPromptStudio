import { describe, it, expect } from 'vitest';
import { normalizeRelayUrl, checkRelayRequest } from './relay.js';
import { createNovelAIClient, buildGenerationRequest } from './generation.js';
import { startFakeNovelAI } from './fixtures/novelAIService.js';

describe('relay boundary', () => {
  it.each(['https://example.com', 'https://example.com/', 'https://example.com/v1/'])(
    'normalizes %s',
    (url) => expect(normalizeRelayUrl(url)).toBe('https://example.com'),
  );
  it.each([
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com/path',
    'https://example.com?q=1',
    'https://example.com/#x',
  ])('rejects %s', (url) => expect(() => normalizeRelayUrl(url)).toThrow('地址要写成'));
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
