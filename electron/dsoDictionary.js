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
  return results
    .sort(
      (a, b) =>
        Number(b.tag.startsWith(search)) - Number(a.tag.startsWith(search)) ||
        a.tag.localeCompare(b.tag),
    )
    .slice(0, Math.min(50, Math.max(1, limit)));
}
