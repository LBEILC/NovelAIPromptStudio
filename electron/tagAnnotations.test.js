import { describe, expect, it, vi } from 'vitest';
import { annotateTags } from './tagAnnotations.js';

const now = new Date('2026-08-13T00:00:00.000Z');

function dictionary(entries = []) {
  return new Map(entries.map((entry) => [entry.tag.toLowerCase(), entry]));
}

describe('tag annotation orchestration', () => {
  it('classifies prefixed and bare Danbooru artist tags without sending them to AI', async () => {
    const lookupDanbooru = vi.fn(async () => new Map([
      ['yamamoto_souichirou', { canonical_tag: 'yamamoto_souichirou', category: 1, is_deprecated: false, post_count: 2028 }],
      ['red_hair', { canonical_tag: 'red_hair', category: 0, is_deprecated: false, post_count: 100 }],
    ]));
    const translateMissing = vi.fn(async (tags) => ({
      model: 'test-model',
      items: tags.map(() => ({ translation: '红发', category: 'Body' })),
    }));
    const result = await annotateTags([
      'artist:shion(mirudakemann)',
      'yamamoto souichirou',
      'red hair',
    ], {
      dictionary: new Map(),
      danbooruCache: new Map(),
      lookupDanbooru,
      translateMissing,
      now,
    });

    expect(lookupDanbooru).toHaveBeenCalledWith(['yamamoto souichirou', 'red hair']);
    expect(translateMissing).toHaveBeenCalledWith(['red hair']);
    expect(result.items).toEqual([
      { translation: '画师:shion(mirudakemann)', category: 'ArtistEra', translation_source: 'danbooru', category_source: 'danbooru' },
      { translation: '画师:yamamoto souichirou', category: 'ArtistEra', translation_source: 'danbooru', category_source: 'danbooru' },
      { translation: '红发', category: 'Body', translation_source: 'ai', category_source: 'rule' },
    ]);
    expect(result.danbooruChecks).toHaveLength(2);
  });

  it('replaces an old AI Unsorted result when Danbooru confirms an artist', async () => {
    const result = await annotateTags(['yamamoto souichirou'], {
      dictionary: dictionary([{
        tag: 'yamamoto souichirou',
        translation: '山本宗一郎',
        category: 'Unsorted',
        has_translation: 1,
        has_classification: 1,
        translation_source: 'ai',
        category_source: 'ai',
      }]),
      danbooruCache: new Map(),
      lookupDanbooru: async () => new Map([
        ['yamamoto_souichirou', { canonical_tag: 'yamamoto_souichirou', category: 1, is_deprecated: false }],
      ]),
      translateMissing: vi.fn(),
      now,
    });

    expect(result.items[0]).toEqual({
      translation: '画师:yamamoto souichirou',
      category: 'ArtistEra',
      translation_source: 'danbooru',
      category_source: 'danbooru',
    });
  });

  it('repairs an old AI Unsorted clothing result with the deterministic rule', async () => {
    const translateMissing = vi.fn();
    const result = await annotateTags(['light gray ribbed knit sleeveless turtleneck top'], {
      dictionary: dictionary([{
        tag: 'light gray ribbed knit sleeveless turtleneck top',
        translation: '浅灰色罗纹针织无袖高领上衣',
        category: 'Unsorted',
        has_translation: 1,
        has_classification: 1,
        translation_source: 'ai',
        category_source: 'ai',
      }]),
      danbooruCache: new Map([['light_gray_ribbed_knit_sleeveless_turtleneck_top', {
        category: 0,
        checked_at: '2026-08-12T00:00:00.000Z',
      }]]),
      lookupDanbooru: vi.fn(),
      translateMissing,
      now,
    });

    expect(translateMissing).not.toHaveBeenCalled();
    expect(result.items[0]).toEqual({
      translation: '浅灰色罗纹针织无袖高领上衣',
      category: 'Clothing',
      translation_source: 'cache',
      category_source: 'rule',
    });
  });

  it('reuses a fresh Danbooru cache and preserves manual edits', async () => {
    const lookupDanbooru = vi.fn();
    const translateMissing = vi.fn();
    const result = await annotateTags(['yamamoto souichirou'], {
      dictionary: dictionary([{
        tag: 'yamamoto souichirou',
        translation: '我常用的画师名',
        category: 'Identity',
        has_translation: 1,
        has_classification: 1,
        translation_source: 'manual',
        category_source: 'manual',
      }]),
      danbooruCache: new Map([['yamamoto_souichirou', {
        tag: 'yamamoto_souichirou',
        category: 1,
        is_deprecated: 0,
        checked_at: '2026-08-12T00:00:00.000Z',
      }]]),
      lookupDanbooru,
      translateMissing,
      now,
    });

    expect(lookupDanbooru).not.toHaveBeenCalled();
    expect(translateMissing).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({
      translation: '我常用的画师名',
      category: 'Identity',
      translation_source: 'manual',
      category_source: 'manual',
    });
  });

  it('falls back to AI without caching a failed Danbooru request', async () => {
    const result = await annotateTags(['unknown name'], {
      dictionary: new Map(),
      danbooruCache: new Map(),
      lookupDanbooru: async () => { throw new Error('offline'); },
      translateMissing: async () => ({ items: [{ translation: '未知名称', category: 'Unsorted' }] }),
      now,
    });

    expect(result.items[0]).toMatchObject({ translation: '未知名称', category: 'Unsorted' });
    expect(result.danbooruChecks).toEqual([]);
  });
});
