import { describe, expect, it } from 'vitest';
import { dsoDictionaryMetadata, lookupDsoTags } from './dsoDictionary.js';

describe('bundled DSO dictionary', () => {
  it('looks up space and parenthesis variants without changing input order', () => {
    const found = lookupDsoTags(['blue hair', 'school_uniform', 'bagpipe (arknights)', 'not-a-real-dso-tag']);
    expect(found.get('blue_hair')).toMatchObject({ translation: '蓝发', category: 'Body' });
    expect(found.get('school_uniform')).toMatchObject({ translation: '校服', category: 'Clothing' });
    expect(found.get('bagpipe_(arknights)')).toMatchObject({ translation: '风笛（明日方舟）', category: 'Identity' });
    expect(found.has('not-a-real-dso-tag')).toBe(false);
  });

  it('exposes pinned source metadata and generated coverage', () => {
    const metadata = dsoDictionaryMetadata();
    expect(metadata.source).toMatchObject({
      repository: 'https://github.com/SuzumiyaAkizuki/DanbooruSearchOnline',
      commit: '0636f762694fc436b4ac472cf59b85d172eaaac4',
    });
    expect(metadata.stats).toMatchObject({ entries: 52475, duplicate_rows: 1, grouped_tags: 14985, groups: 93 });
  });
});
