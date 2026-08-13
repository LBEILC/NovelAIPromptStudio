const DANBOORU_TAGS_URL = 'https://danbooru.donmai.us/tags.json';
const DANBOORU_ARTIST_CATEGORY = 1;
const DANBOORU_CHARACTER_CATEGORY = 4;
const DANBOORU_LOOKUP_BATCH_SIZE = 50;
const DANBOORU_LOOKUP_TIMEOUT_MS = 12000;

export function isExplicitArtistTag(value) {
  return /^\s*(?:artist|art)\s*:/i.test(String(value || ''));
}

export function danbooruLookupName(value) {
  return String(value || '')
    .trim()
    .replace(/^\s*(?:artist|art)\s*:\s*/i, '')
    .replace(/\s+/g, '_')
    .replace(/([^_(])\(/g, '$1_(')
    .replace(/_+/g, '_')
    .toLocaleLowerCase('en-US');
}

export function artistDisplayName(value) {
  return String(value || '')
    .trim()
    .replace(/^\s*(?:artist|art)\s*:\s*/i, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\(/g, '(')
    .trim();
}

export function artistTranslation(value) {
  const name = artistDisplayName(value);
  return name ? `画师:${name}` : '';
}

function responseItems(body) {
  if (Array.isArray(body)) return body;
  return body && typeof body === 'object' ? [body] : [];
}

async function fetchTagBatch(names, fetcher) {
  const url = new URL(DANBOORU_TAGS_URL);
  url.searchParams.set('limit', String(names.length));
  for (const name of names) url.searchParams.append('search[name][]', name);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DANBOORU_LOOKUP_TIMEOUT_MS);
  let response;
  try {
    response = await fetcher(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NovelAIPromptStudio/0.2 (Danbooru tag category lookup)',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Danbooru Tag 查询失败（HTTP ${response.status}）`);
  return responseItems(await response.json());
}

export async function lookupDanbooruTags(values, fetcher = globalThis.fetch) {
  const names = [...new Set((values || []).map(danbooruLookupName).filter(Boolean))];
  const found = new Map();
  for (let offset = 0; offset < names.length; offset += DANBOORU_LOOKUP_BATCH_SIZE) {
    const batch = names.slice(offset, offset + DANBOORU_LOOKUP_BATCH_SIZE);
    const items = await fetchTagBatch(batch, fetcher);
    for (const item of items) {
      const name = danbooruLookupName(item?.name);
      if (!name || !batch.includes(name)) continue;
      found.set(name, {
        canonical_tag: String(item.name || name),
        category: Number(item.category),
        is_deprecated: Boolean(item.is_deprecated),
        post_count: Number(item.post_count || 0),
      });
    }
  }
  return found;
}

export function isDanbooruArtist(entry) {
  return Number(entry?.category) === DANBOORU_ARTIST_CATEGORY && !Boolean(entry?.is_deprecated);
}

export function danbooruStudioCategory(entry) {
  if (Boolean(entry?.is_deprecated)) return null;
  if (Number(entry?.category) === DANBOORU_ARTIST_CATEGORY) return 'ArtistEra';
  if (Number(entry?.category) === DANBOORU_CHARACTER_CATEGORY) return 'Identity';
  return null;
}

export { DANBOORU_ARTIST_CATEGORY, DANBOORU_CHARACTER_CATEGORY, DANBOORU_TAGS_URL };
