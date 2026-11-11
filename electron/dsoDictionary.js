import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { danbooruLookupName } from './danbooru.js';

const DICTIONARY_PATH = fileURLToPath(new URL('./data/dso-dictionary.json', import.meta.url));
const EXPECTED_CATEGORIES = [
  'Unsorted',
  'ArtistEra',
  'Subject',
  'Identity',
  'Body',
  'Clothing',
  'Action',
  'Environment',
  'Composition',
  'StyleQuality',
];

let cachedDictionary;

function dictionary() {
  if (cachedDictionary) return cachedDictionary;
  const parsed = JSON.parse(fs.readFileSync(DICTIONARY_PATH, 'utf8'));
  if (
    parsed?.schema_version !== 1 ||
    JSON.stringify(parsed.categories) !== JSON.stringify(EXPECTED_CATEGORIES) ||
    !parsed.entries
  ) {
    throw new Error('内置 DSO Tag 词典格式无效');
  }
  cachedDictionary = parsed;
  return cachedDictionary;
}

export function lookupDsoTags(values = []) {
  const data = dictionary();
  const found = new Map();
  for (const value of values) {
    const name = danbooruLookupName(value);
    const entry = data.entries[name];
    if (!name || !entry) continue;
    found.set(name, {
      canonical_tag: name,
      translation: String(entry[0] || ''),
      category: data.categories[Number(entry[1])] || 'Unsorted',
    });
  }
  return found;
}

export function dsoDictionaryMetadata() {
  const data = dictionary();
  return { source: data.source, stats: data.stats };
}

export { DICTIONARY_PATH };

export function searchDsoTags(query, limit = 30) {
  const search = String(query || '')
    .trim()
    .toLowerCase()
    .replaceAll(' ', '_');
  if (!search) return [];
  const data = dictionary();
  const results = [];
  for (const [tag, entry] of Object.entries(data.entries)) {
    if (!tag.toLowerCase().includes(search) && !String(entry[0]).toLowerCase().includes(search))
      continue;
    results.push({
      tag,
      translation: String(entry[0] || ''),
      category: data.categories[Number(entry[1])] || 'Unsorted',
    });
  }
  return sortTagMatches(results, search).slice(0, Math.min(50, Math.max(1, limit)));
}

/**
 * 补全候选的顺序：和输入完全一样的排最前（英文 Tag 或译文），然后是开头一样的、整词出现的，其余在后；同档短的在前。
 * @template {{ tag: string, translation?: string }} T
 * @param {T[]} items
 * @param {string} query
 * @returns {T[]}
 */
export function sortTagMatches(items, query) {
  const search = String(query || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ');
  const rank = (/** @type {T} */ item) => {
    const tag = item.tag.toLowerCase().replaceAll('_', ' ');
    const zh = String(item.translation || '').toLowerCase();
    if (tag === search || zh === search) return 0;
    if (tag.startsWith(search) || zh.startsWith(search)) return 1;
    if (tag.split(' ').includes(search)) return 2;
    return 3;
  };
  return items
    .map((item) => ({ item, rank: rank(item) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.item.tag.length - b.item.tag.length ||
        a.item.tag.localeCompare(b.item.tag),
    )
    .map(({ item }) => item);
}
