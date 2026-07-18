import { describe, expect, it, vi } from 'vitest';
import { listModels, normalizeBaseUrl, testModel, translateTags } from './translation.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('OpenAI-compatible AI translation', () => {
  it('loads and sorts models with bearer authentication', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ data: [{ id: 'qwen-plus' }, { id: 'gpt-4.1-mini' }] }));
    await expect(listModels({ baseUrl: 'https://api.example.com/v1/', apiKey: 'secret' }, fetcher))
      .resolves.toEqual(['gpt-4.1-mini', 'qwen-plus']);
    expect(fetcher).toHaveBeenCalledWith('https://api.example.com/v1/models', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
    }));
  });

  it('tests the selected model through chat completions', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ choices: [{ message: { content: 'OK' } }] }));
    await expect(testModel({ baseUrl: 'http://localhost:1234/v1', model: 'local-model' }, fetcher))
      .resolves.toMatchObject({ model: 'local-model', response: 'OK' });
    expect(fetcher.mock.calls[0][0]).toBe('http://localhost:1234/v1/chat/completions');
  });

  it('translates tags and tolerates fenced JSON model output', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: '```json\n{"translations":["银色头发","电影感光照"]}\n```' } }],
    }));
    await expect(translateTags(['silver hair', 'cinematic lighting'], {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'translator-model',
    }, fetcher)).resolves.toEqual({ model: 'translator-model', translations: ['银色头发', '电影感光照'] });
  });

  it('only permits insecure HTTP for local model servers', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1:11434/v1');
    expect(() => normalizeBaseUrl('http://api.example.com/v1')).toThrow('必须使用 HTTPS');
  });
});
