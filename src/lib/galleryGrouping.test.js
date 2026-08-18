import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GALLERY_GROUPING,
  GALLERY_GROUPING_KEY,
  GALLERY_PROMPT_SCOPES,
  galleryBasePromptSimilarity,
  galleryGroupingStatusLabel,
  isExactGalleryGrouping,
  readGalleryGrouping,
  writeGalleryGrouping,
} from './galleryGrouping.js';

describe('gallery grouping settings', () => {
  it('keeps the four grouping modes in their stable progressive order', () => {
    expect(GALLERY_PROMPT_SCOPES).toEqual(['separate', 'full', 'base', 'similar']);
  });

  it('only treats full Prompt without cross-Vibe merging as exact', () => {
    expect(isExactGalleryGrouping({ promptScope: 'full', mergeVibes: false })).toBe(true);
    expect(isExactGalleryGrouping({ promptScope: 'full', mergeVibes: true })).toBe(false);
    expect(isExactGalleryGrouping({ promptScope: 'base', mergeVibes: false })).toBe(false);
  });

  it('persists both grouping dimensions and falls back safely', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    const expected = { promptScope: 'base', mergeVibes: true, similarityThreshold: 85 };
    expect(writeGalleryGrouping(storage, { promptScope: 'base', mergeVibes: true })).toEqual(expected);
    expect(storage.setItem).toHaveBeenCalledWith(GALLERY_GROUPING_KEY, JSON.stringify(expected));
    storage.getItem.mockReturnValue(JSON.stringify({ promptScope: 'separate', mergeVibes: true }));
    expect(readGalleryGrouping(storage)).toEqual({ promptScope: 'separate', mergeVibes: true, similarityThreshold: 85 });
    expect(readGalleryGrouping({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_GALLERY_GROUPING);
  });

  it('compares Base Prompt and Base Undesired while ignoring character semantics', () => {
    const project = (undesired, character) => ({
      tags: [{ tag: 'cinematic lighting', category: 'Composition', weight: 1 }],
      metadata: {},
      prompt_structure: {
        base_undesired_tags: [{ tag: undesired, category: 'StyleQuality', weight: 1 }],
        characters: [{ prompt_tags: [{ tag: character, category: 'Body', weight: 1 }], undesired_tags: [] }],
      },
    });
    expect(galleryBasePromptSimilarity(project('lowres', 'red hair'), project('lowres', 'blue hair'))).toBe(1);
    expect(galleryBasePromptSimilarity(project('lowres', 'red hair'), project('blurry', 'red hair'))).toBeCloseTo(0.8);
  });

  it('summarizes combined settings without making users decode them', () => {
    expect(galleryGroupingStatusLabel({ promptScope: 'full', mergeVibes: false })).toBe('精确');
    expect(galleryGroupingStatusLabel({ promptScope: 'full', mergeVibes: true })).toBe('同 Prompt');
    expect(galleryGroupingStatusLabel({ promptScope: 'similar', mergeVibes: true, similarityThreshold: 80 })).toBe('相似 80% · 跨 Vibe');
  });
});
