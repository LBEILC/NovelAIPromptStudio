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

  it('translates and classifies tags while tolerating fenced JSON model output', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: '```json\n{"items":[{"translation":"银色头发","category":"Character"},{"translation":"电影感光照","category":"Style"}]}\n```' } }],
    }));
    await expect(translateTags(['silver hair', 'cinematic lighting'], {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'translator-model',
      translationPrompt: 'Use the studio translation glossary.',
      classificationPrompt: 'Use the studio classification rules.',
    }, fetcher)).resolves.toEqual({
      model: 'translator-model',
      items: [
        { translation: '银色头发', category: 'Character' },
        { translation: '电影感光照', category: 'Style' },
      ],
      translations: ['银色头发', '电影感光照'],
      categories: ['Character', 'Style'],
    });
    const systemPrompt = JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content;
    expect(systemPrompt).toContain('Use the studio translation glossary.');
    expect(systemPrompt).toContain('Use the studio classification rules.');
    expect(systemPrompt).toContain('Return only valid JSON');
  });

  it('automatically translates more than 50 tags in ordered batches', async () => {
    const fetcher = vi.fn(async (_url, options) => {
      const tags = JSON.parse(JSON.parse(options.body).messages[1].content).tags;
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ items: tags.map((tag) => ({ translation: `译-${tag}`, category: 'Unsorted' })) }) } }],
      });
    });
    const tags = Array.from({ length: 121 }, (_, index) => `tag-${index}`);
    const result = await translateTags(tags, {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'translator-model',
    }, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.map(([, options]) => JSON.parse(JSON.parse(options.body).messages[1].content).tags.length)).toEqual([50, 50, 21]);
    expect(result.items).toHaveLength(121);
    expect(result.items[0].translation).toBe('译-tag-0');
    expect(result.items[120].translation).toBe('译-tag-120');
  });

  it('only permits insecure HTTP for local model servers', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1:11434/v1');
    expect(() => normalizeBaseUrl('http://api.example.com/v1')).toThrow('必须使用 HTTPS');
  });
});
