import { describe, expect, it, vi } from 'vitest';
import {
  artistTranslation,
  danbooruStudioCategory,
  danbooruLookupName,
  isDanbooruArtist,
  isExplicitArtistTag,
  lookupDanbooruTags,
} from './danbooru.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('Danbooru artist tag lookup', () => {
  it('normalizes NovelAI artist spellings and produces deterministic translations', () => {
    expect(isExplicitArtistTag('artist:shion(mirudakemann)')).toBe(true);
    expect(isExplicitArtistTag('yamamoto souichirou')).toBe(false);
    expect(danbooruLookupName('artist:shion(mirudakemann)')).toBe('shion_(mirudakemann)');
    expect(danbooruLookupName('Yamamoto Souichirou')).toBe('yamamoto_souichirou');
    expect(artistTranslation('artist:shion_(mirudakemann)')).toBe('画师:shion(mirudakemann)');
    expect(artistTranslation('yamamoto_souichirou')).toBe('画师:yamamoto souichirou');
  });

  it('queries exact tag names in batches and keeps Danbooru categories', async () => {
    const fetcher = vi.fn(async (url) => {
      const names = new URL(url).searchParams.getAll('search[name][]');
      return jsonResponse(names.map((name) => ({
        name,
        category: name === 'yamamoto_souichirou' ? 1 : 0,
        is_deprecated: false,
        post_count: 10,
      })));
    });
    const values = ['yamamoto souichirou', 'red hair', ...Array.from({ length: 50 }, (_, index) => `tag ${index}`)];
    const found = await lookupDanbooruTags(values, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(found.get('yamamoto_souichirou')).toMatchObject({ category: 1, canonical_tag: 'yamamoto_souichirou' });
    expect(isDanbooruArtist(found.get('yamamoto_souichirou'))).toBe(true);
    expect(isDanbooruArtist(found.get('red_hair'))).toBe(false);
    expect(danbooruStudioCategory(found.get('yamamoto_souichirou'))).toBe('ArtistEra');
    const firstUrl = new URL(fetcher.mock.calls[0][0]);
    expect(firstUrl.hostname).toBe('danbooru.donmai.us');
    expect(firstUrl.searchParams.getAll('search[name][]')).toHaveLength(50);
  });

  it('maps Danbooru character tags into studio identity tags', () => {
    expect(danbooruStudioCategory({ category: 4, is_deprecated: false })).toBe('Identity');
    expect(danbooruStudioCategory({ category: 3, is_deprecated: false })).toBeNull();
    expect(danbooruStudioCategory({ category: 4, is_deprecated: true })).toBeNull();
  });

  it('rejects unsuccessful API responses', async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, { ok: false, status: 429 }));
    await expect(lookupDanbooruTags(['artist name'], fetcher)).rejects.toThrow('HTTP 429');
  });
});
