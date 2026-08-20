import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GALLERY_FILTERS,
  GALLERY_NO_VIBE_VALUE,
  filterGalleryProjects,
  galleryActiveFilterCount,
  galleryDateBounds,
  galleryFilterOptions,
  galleryProjectMatchesFilters,
  normalizeGalleryFilters,
} from './galleryFilters.js';

const tag = (value, translation = '') => ({ tag: value, translation });
const project = (id, {
  createdAt = '2026-08-18T08:00:00.000Z',
  model = 'nai-v4.5',
  tags = [],
  vibe = '',
} = {}) => ({
  id,
  name: `${id}.png`,
  created_at: createdAt,
  metadata: { model },
  tags,
  vibe_fingerprint: vibe,
  prompt_structure: { base_undesired_tags: [], characters: [] },
});

describe('gallery filters', () => {
  it('normalizes imported filter values without retaining duplicates or invalid dates', () => {
    expect(normalizeGalleryFilters({
      includeTags: [' bagpipe ', 'BAGPIPE', ''],
      models: ['nai-v4.5', 'NAI-V4.5'],
      tagMatch: 'unknown',
      datePreset: 'future',
      dateFrom: '2026/08/01',
    })).toMatchObject({
      includeTags: ['bagpipe'],
      models: ['nai-v4.5'],
      tagMatch: 'all',
      datePreset: 'all',
      dateFrom: '',
    });
  });

  it('combines search, Tag, model, Vibe, and time at the individual-image level', () => {
    const item = project('portrait', {
      createdAt: '2026-08-18T08:00:00.000Z',
      model: 'nai-v4.5',
      tags: [tag('bagpipe', '风笛'), tag('military uniform', '军装')],
      vibe: 'vibe-a',
    });
    const filters = {
      query: '风笛',
      includeTags: ['bagpipe', 'military uniform'],
      excludeTags: ['night'],
      tagMatch: 'all',
      models: ['nai-v4.5'],
      vibes: ['vibe-a'],
      datePreset: 'custom',
      dateFrom: '2026-08-18',
      dateTo: '2026-08-18',
    };
    expect(galleryProjectMatchesFilters(item, filters, new Date('2026-08-20T12:00:00+08:00'))).toBe(true);
    expect(galleryProjectMatchesFilters(item, { ...filters, excludeTags: ['bagpipe'] })).toBe(false);
    expect(galleryProjectMatchesFilters(item, { ...filters, models: ['different'] })).toBe(false);
    expect(galleryProjectMatchesFilters(item, { ...filters, vibes: [GALLERY_NO_VIBE_VALUE] })).toBe(false);
  });

  it('supports all or any matching for included Tags while exact exclusions always win', () => {
    const items = [
      project('both', { tags: [tag('bagpipe'), tag('uniform')] }),
      project('one', { tags: [tag('bagpipe')] }),
      project('excluded', { tags: [tag('bagpipe'), tag('male')] }),
    ];
    expect(filterGalleryProjects(items, { includeTags: ['bagpipe', 'uniform'], tagMatch: 'all' }).map((item) => item.id)).toEqual(['both']);
    expect(filterGalleryProjects(items, { includeTags: ['bagpipe', 'uniform'], excludeTags: ['male'], tagMatch: 'any' }).map((item) => item.id)).toEqual(['both', 'one']);
  });

  it('returns the original project list when no filters are active', () => {
    const items = [project('one'), project('two')];
    expect(filterGalleryProjects(items, DEFAULT_GALLERY_FILTERS)).toBe(items);
  });

  it('uses local inclusive calendar days for relative and custom import ranges', () => {
    const now = new Date(2026, 7, 20, 18, 0, 0);
    const recent = galleryDateBounds({ datePreset: '7d' }, now);
    expect(recent.from).toEqual(new Date(2026, 7, 14));
    expect(recent.to).toEqual(new Date(2026, 7, 21));
    const custom = galleryDateBounds({ datePreset: 'custom', dateFrom: '2026-08-01', dateTo: '2026-08-03' }, now);
    expect(custom.from).toEqual(new Date(2026, 7, 1));
    expect(custom.to).toEqual(new Date(2026, 7, 4));
  });

  it('builds counted Tag, model, and stable Vibe options from the current library scope', () => {
    const options = galleryFilterOptions([
      project('a', { tags: [tag('bagpipe', '风笛')], vibe: 'abcdef123456' }),
      project('b', { tags: [tag('bagpipe', '风笛')], vibe: 'abcdef123456' }),
      project('c', { model: 'nai-v4', tags: [tag('texas')], vibe: '' }),
    ]);
    expect(options.tags[0]).toMatchObject({ value: 'bagpipe', label: 'bagpipe · 风笛', count: 2 });
    expect(options.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'nai-v4.5', count: 2 }),
      expect.objectContaining({ value: 'nai-v4', count: 1 }),
    ]));
    expect(options.vibes).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'abcdef123456', label: 'Vibe abcdef12', count: 2 }),
      expect.objectContaining({ value: GALLERY_NO_VIBE_VALUE, label: '无 Vibe', count: 1 }),
    ]));
  });

  it('counts active advanced filter dimensions without counting the visible search field', () => {
    expect(galleryActiveFilterCount(DEFAULT_GALLERY_FILTERS)).toBe(0);
    expect(galleryActiveFilterCount({ query: 'bagpipe', includeTags: ['bagpipe'], models: ['nai-v4.5'], datePreset: '30d' })).toBe(3);
  });
});
