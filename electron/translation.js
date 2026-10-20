import { CATEGORY_OPTIONS, normalizeCategory } from '../src/lib/prompt.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TRANSLATION_PROMPT =
  'Translate every NovelAI Diffusion prompt tag into concise Simplified Chinese. Preserve anatomy, clothing, camera terminology, character names, and artist names. Do not add explanations.';
const DEFAULT_CLASSIFICATION_PROMPT =
  'Classify every tag as exactly one of ArtistEra, Subject, Identity, Body, Clothing, Action, Environment, Composition, StyleQuality, or Unsorted. ArtistEra covers artist attribution and year or era tags. Subject covers character count and gender. Identity covers character identity, species, role, and archetype. Body covers appearance, anatomy, hair, eyes, and physical traits. Clothing covers apparel and accessories. Action covers pose, movement, gaze, and expression. Environment covers locations, background, weather, and scene objects. Composition covers framing, camera angle, perspective, focus, and lighting. StyleQuality covers visual style, medium, rendering, quality, and artifact terms. Use Unsorted only when none applies.';

function normalizeBaseUrl(value) {
  const candidate = String(value || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, '');
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Base URL 格式无效');
  }
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) {
    throw new Error('Base URL 必须使用 HTTPS；本地 localhost 可使用 HTTP');
  }
  return candidate;
}

function requestHeaders(apiKey) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

async function requestJson(url, options, fetcher, timeoutMs = 30000) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetcher(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('API 请求超时');
    throw new Error(`无法连接 API：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`API 返回了无法识别的响应（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || `HTTP ${response.status}`;
    throw new Error(`API 请求失败：${detail}`);
  }
  return body;
}

function requireModel(settings) {
  const model = String(settings.model || '').trim();
  if (!model) throw new Error('请先选择模型');
  return model;
}

function chatContent(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content))
    return content
      .map((item) => item?.text || '')
      .join('')
      .trim();
  throw new Error('模型没有返回文本内容');
}

function chatBody(model, messages) {
  return { model, messages };
}

export async function requestStructuredAI(instruction, input, settings, signal) {
  const body = await requestJson(
    `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`,
    {
      method: 'POST',
      headers: requestHeaders(settings.apiKey),
      signal,
      body: JSON.stringify(
        chatBody(requireModel(settings), [
          { role: 'system', content: instruction },
          { role: 'user', content: JSON.stringify(input) },
        ]),
      ),
    },
    globalThis.fetch,
  );
  return JSON.parse(
    chatContent(body)
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, ''),
  );
}

export async function transformParagraph(
  text,
  direction,
  settings,
  fetcher = globalThis.fetch,
  signal,
) {
  if (!['translate', 'rewrite'].includes(direction)) throw new Error('Invalid paragraph direction');
  const model = requireModel(settings);
  const body = await requestJson(
    `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`,
    {
      method: 'POST',
      headers: requestHeaders(settings.apiKey),
      signal,
      body: JSON.stringify(
        chatBody(model, [
          {
            role: 'system',
            content:
              direction === 'translate'
                ? 'Translate the supplied image prompt paragraph into Simplified Chinese. Preserve its meaning and details. Return only the translated paragraph.'
                : 'Rewrite the supplied Chinese image prompt as an English image prompt paragraph. Preserve all details and intent. Return only the English paragraph.',
          },
          { role: 'user', content: String(text) },
        ]),
      ),
    },
    fetcher,
  );
  return chatContent(body);
}

export async function listModels(settings, fetcher = globalThis.fetch) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const body = await requestJson(
    `${baseUrl}/models`,
    {
      method: 'GET',
      headers: requestHeaders(settings.apiKey),
    },
    fetcher,
    20000,
  );
  const models = (body?.data || [])
    .map((item) => (typeof item === 'string' ? item : item?.id))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  if (!models.length) throw new Error('API 已连接，但没有返回可用模型');
  return models;
}

export async function testModel(settings, fetcher = globalThis.fetch) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const model = requireModel(settings);
  const startedAt = Date.now();
  const body = await requestJson(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: requestHeaders(settings.apiKey),
      body: JSON.stringify(
        chatBody(model, [
          {
            role: 'system',
            content: 'You are a connection test. Follow the user instruction exactly.',
          },
          { role: 'user', content: 'Reply with exactly: OK' },
        ]),
      ),
    },
    fetcher,
    45000,
  );
  return { model, latencyMs: Date.now() - startedAt, response: chatContent(body) };
}

export const TAG_TRANSLATION_BATCH_SIZE = 50;

function parseTranslationJson(content, expectedLength) {
  const withoutFence = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) throw new Error('模型没有按要求返回 JSON 译文');
  let parsed;
  try {
    parsed = JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
  } catch {
    throw new Error('模型返回的译文 JSON 无法解析');
  }
  const rawItems = Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed?.translations)
      ? parsed.translations.map((translation) => ({ translation, category: 'Unsorted' }))
      : null;
  if (!rawItems || rawItems.length !== expectedLength) {
    throw new Error('模型返回的译文数量与 Tag 数量不一致');
  }
  const cleaned = rawItems.map((item) => ({
    translation: String(item?.translation || '').trim(),
    category: CATEGORY_OPTIONS.includes(item?.category)
      ? item.category
      : normalizeCategory(item?.category),
  }));
  if (cleaned.some((item) => !item.translation)) throw new Error('模型返回了空译文');
  return cleaned;
}

async function translateTagBatch(cleaned, baseUrl, model, settings, fetcher, signal) {
  const translationPrompt = DEFAULT_TRANSLATION_PROMPT;
  const classificationPrompt = DEFAULT_CLASSIFICATION_PROMPT;
  const body = await requestJson(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: requestHeaders(settings.apiKey),
      signal,
      body: JSON.stringify(
        chatBody(model, [
          {
            role: 'system',
            content: [
              'You translate and classify NovelAI Diffusion prompt tags.',
              translationPrompt,
              classificationPrompt,
              'Do not add explanations. Return only valid JSON in this exact shape: {"items":[{"translation":"译文","category":"Subject"}]}.',
              'Keep the array length and order identical to the input tags.',
            ].join(' '),
          },
          { role: 'user', content: JSON.stringify({ tags: cleaned }) },
        ]),
      ),
    },
    fetcher,
    60000,
  );
  return parseTranslationJson(chatContent(body), cleaned.length);
}

export async function translateTags(texts, settings, fetcher = globalThis.fetch, signal) {
  if (!Array.isArray(texts)) throw new Error('翻译内容格式无效');
  const cleaned = texts.map((text) => String(text || '').trim());
  if (!cleaned.length || cleaned.some((text) => !text)) throw new Error('没有可翻译的 Tag');

  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const model = requireModel(settings);
  const items = [];
  for (let offset = 0; offset < cleaned.length; offset += TAG_TRANSLATION_BATCH_SIZE) {
    const batch = cleaned.slice(offset, offset + TAG_TRANSLATION_BATCH_SIZE);
    if (signal?.aborted) throw new Error('翻译已取消');
    items.push(...(await translateTagBatch(batch, baseUrl, model, settings, fetcher, signal)));
  }
  return {
    model,
    items,
    translations: items.map((item) => item.translation),
    categories: items.map((item) => item.category),
  };
}

export {
  DEFAULT_BASE_URL,
  DEFAULT_CLASSIFICATION_PROMPT,
  DEFAULT_TRANSLATION_PROMPT,
  normalizeBaseUrl,
};
