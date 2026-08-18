import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GALLERY_GROUPING,
  GALLERY_GROUPING_KEY,
  galleryPromptScopeAt,
  galleryPromptScopeIndex,
  isExactGalleryGrouping,
  readGalleryGrouping,
  writeGalleryGrouping,
} from './galleryGrouping.js';

describe('gallery grouping settings', () => {
  it('maps the three slider stops to stable Prompt scopes', () => {
    expect([0, 1, 2].map(galleryPromptScopeAt)).toEqual(['separate', 'full', 'base']);
    expect(galleryPromptScopeIndex('full')).toBe(1);
  });

  it('only treats full Prompt without cross-Vibe merging as exact', () => {
    expect(isExactGalleryGrouping({ promptScope: 'full', mergeVibes: false })).toBe(true);
    expect(isExactGalleryGrouping({ promptScope: 'full', mergeVibes: true })).toBe(false);
    expect(isExactGalleryGrouping({ promptScope: 'base', mergeVibes: false })).toBe(false);
  });

  it('persists both grouping dimensions and falls back safely', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    expect(writeGalleryGrouping(storage, { promptScope: 'base', mergeVibes: true })).toEqual({ promptScope: 'base', mergeVibes: true });
    expect(storage.setItem).toHaveBeenCalledWith(GALLERY_GROUPING_KEY, JSON.stringify({ promptScope: 'base', mergeVibes: true }));
    storage.getItem.mockReturnValue(JSON.stringify({ promptScope: 'separate', mergeVibes: true }));
    expect(readGalleryGrouping(storage)).toEqual({ promptScope: 'separate', mergeVibes: true });
    expect(readGalleryGrouping({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_GALLERY_GROUPING);
  });
});
