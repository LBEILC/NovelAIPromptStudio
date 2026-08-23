import {
  artistTranslation,
  danbooruStudioCategory,
  danbooruLookupName,
  isDanbooruArtist,
  isExplicitArtistTag,
} from './danbooru.js';
import { inferCategory } from '../src/lib/prompt.js';

const DANBOORU_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function dictionaryKey(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function freshDanbooruEntry(entry, now) {
  const checkedAt = Date.parse(String(entry?.checked_at || ''));
  return Number.isFinite(checkedAt) && now - checkedAt < DANBOORU_CACHE_MAX_AGE_MS;
}

export async function annotateTags(texts, options) {
  const cleaned = (texts || []).map((tag) => String(tag || '').trim());
  const dictionary = options.dictionary || new Map();
  const dsoDictionary = options.dsoDictionary || new Map();
  const danbooruCache = options.danbooruCache || new Map();
  const now = options.now instanceof Date ? options.now : new Date();
  const nowMs = now.getTime();

  const lookupValues = [];
  for (const tag of cleaned) {
    if (isExplicitArtistTag(tag) || dsoDictionary.has(danbooruLookupName(tag))) continue;
    const lookupName = danbooruLookupName(tag);
    if (!lookupName || freshDanbooruEntry(danbooruCache.get(lookupName), nowMs)) continue;
    lookupValues.push(tag);
  }

  let lookedUp = new Map();
  let lookupCompleted = false;
  if (lookupValues.length) {
    try {
      lookedUp = await options.lookupDanbooru(lookupValues);
      lookupCompleted = true;
    } catch {
      // Danbooru is an optional source. AI classification remains available offline or on API failure.
    }
  }

  const danbooruChecks = [];
  if (lookupCompleted) {
    const uniqueLookups = new Map(lookupValues.map((tag) => [danbooruLookupName(tag), tag]));
    for (const [lookupName, tag] of uniqueLookups) {
      const result = lookedUp.get(lookupName);
      danbooruChecks.push({
        tag,
        canonical_tag: String(result?.canonical_tag || lookupName),
        category: result ? Number(result.category) : -1,
        is_deprecated: result?.is_deprecated ? 1 : 0,
        post_count: Number(result?.post_count || 0),
        checked_at: now.toISOString(),
      });
    }
  }

  const checkedByName = new Map(danbooruChecks.map((entry) => [danbooruLookupName(entry.tag), entry]));
  const danbooruEntry = (tag) => {
    if (isExplicitArtistTag(tag)) return { category: 1, is_deprecated: false };
    const lookupName = danbooruLookupName(tag);
    return checkedByName.get(lookupName) || (freshDanbooruEntry(danbooruCache.get(lookupName), nowMs) ? danbooruCache.get(lookupName) : null);
  };
  const dsoEntry = (tag) => dsoDictionary.get(danbooruLookupName(tag)) || null;

  const missing = cleaned.map((tag, index) => {
    const cached = dictionary.get(dictionaryKey(tag));
    const remoteEntry = danbooruEntry(tag);
    const offlineEntry = dsoEntry(tag);
    const artist = isDanbooruArtist(remoteEntry);
    const remoteCategory = danbooruStudioCategory(remoteEntry);
    const offlineCategory = offlineEntry?.category && offlineEntry.category !== 'Unsorted' ? offlineEntry.category : '';
    const ruleCategory = inferCategory(tag);
    const manualCategory = cached?.has_classification && cached.category_source === 'manual';
    const hasTranslation = artist || Boolean(offlineEntry?.translation) || Boolean(cached?.has_translation);
    const hasClassification = Boolean(remoteCategory) || manualCategory || Boolean(offlineCategory) || ruleCategory !== 'Unsorted'
      || (cached?.has_classification && cached.category !== 'Unsorted');
    return hasTranslation && hasClassification ? null : { tag, index };
  }).filter(Boolean);

  const generated = missing.length && typeof options.translateMissing === 'function'
    ? await options.translateMissing(missing.map((entry) => entry.tag))
    : null;
  const generatedItems = generated?.items || [];
  const generatedByIndex = new Map(missing.map((entry, index) => [entry.index, generatedItems[index] || {}]));
  const items = cleaned.map((tag, index) => {
    const cached = dictionary.get(dictionaryKey(tag));
    const ai = generatedByIndex.get(index) || {};
    const remoteEntry = danbooruEntry(tag);
    const offlineEntry = dsoEntry(tag);
    const artist = isDanbooruArtist(remoteEntry);
    const remoteCategory = danbooruStudioCategory(remoteEntry);
    const offlineTranslation = String(offlineEntry?.translation || '').trim();
    const offlineCategory = offlineEntry?.category && offlineEntry.category !== 'Unsorted' ? offlineEntry.category : '';
    const ruleCategory = inferCategory(tag);
    const manualTranslation = cached?.has_translation && cached.translation_source === 'manual';
    const manualCategory = cached?.has_classification && cached.category_source === 'manual';
    return {
      translation: manualTranslation
        ? cached.translation
        : artist
          ? artistTranslation(tag)
          : offlineTranslation
            ? offlineTranslation
            : cached?.has_translation
              ? cached.translation
              : ai.translation || '',
      category: manualCategory
        ? cached.category
        : remoteCategory
          ? remoteCategory
          : offlineCategory
            ? offlineCategory
            : ruleCategory !== 'Unsorted'
              ? ruleCategory
              : cached?.has_classification && cached.category !== 'Unsorted'
                ? cached.category
                : ai.category || 'Unsorted',
      translation_source: manualTranslation
        ? 'manual'
        : artist
          ? 'danbooru'
          : offlineTranslation
            ? 'dso'
            : cached?.has_translation
              ? 'cache'
              : ai.translation
                ? 'ai'
                : '',
      category_source: manualCategory
        ? 'manual'
        : remoteCategory
          ? 'danbooru'
          : offlineCategory
            ? 'dso'
            : ruleCategory !== 'Unsorted'
              ? 'rule'
              : cached?.has_classification && cached.category !== 'Unsorted'
                ? 'cache'
                : ai.category
                  ? 'ai'
                  : '',
    };
  });

  return {
    items,
    generated,
    danbooruChecks,
    aiCount: generated ? missing.length : 0,
    cacheHits: cleaned.length - missing.length,
    dsoTranslationCount: items.filter((item) => item.translation_source === 'dso').length,
    dsoCategoryCount: items.filter((item) => item.category_source === 'dso').length,
    unresolvedCount: items.filter((item) => !item.translation || item.category === 'Unsorted').length,
  };
}

export { DANBOORU_CACHE_MAX_AGE_MS };
