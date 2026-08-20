import { describe, expect, it } from 'vitest';
import {
  galleryCollectionImageCount,
  galleryCollectionScope,
  gallerySmartCollectionDefaultName,
  normalizeGalleryCollection,
  readActiveGalleryCollection,
  writeActiveGalleryCollection,
} from './galleryCollections.js';

const projects = [
  { id: 'one', name: 'Bagpipe', created_at: '2026-08-20T00:00:00.000Z', metadata: { model: 'nai-v4.5' }, tags: [{ tag: 'bagpipe' }] },
  { id: 'two', name: 'Surtr', created_at: '2026-08-19T00:00:00.000Z', metadata: { model: 'nai-v4.5' }, tags: [{ tag: 'surtr' }] },
];

describe('gallery collections', () => {
  it('scopes manual collections by explicit image membership', () => {
    const collection = normalizeGalleryCollection({ id: 'manual', kind: 'manual', member_ids: ['two', 'missing', 'two'] });
    expect(galleryCollectionScope(projects, collection).map((project) => project.id)).toEqual(['two']);
    expect(galleryCollectionImageCount(projects, collection)).toBe(1);
  });

  it('evaluates smart collection rules against individual images', () => {
    const collection = normalizeGalleryCollection({ id: 'smart', kind: 'smart', filters: { includeTags: ['bagpipe'] } });
    expect(galleryCollectionScope(projects, collection).map((project) => project.id)).toEqual(['one']);
  });

  it('generates a concise smart collection name from the current filters', () => {
    expect(gallerySmartCollectionDefaultName({ query: 'portrait lighting', datePreset: '30d' })).toBe('搜索 portrait lighting · 最近 30 天');
    expect(gallerySmartCollectionDefaultName({ includeTags: ['1girl', 'outdoors', 'day'], tagMatch: 'all' })).toBe('包含 1girl、outdoors 等');
    expect(gallerySmartCollectionDefaultName({ models: ['nai-v4.5'], vibes: ['vibe-a'] })).toBe('nai-v4.5 · 指定 Vibe');
    expect(gallerySmartCollectionDefaultName()).toBe('智能收藏集');
  });

  it('persists only a collection id that still exists', () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    writeActiveGalleryCollection(storage, 'manual');
    expect(readActiveGalleryCollection(storage, [{ id: 'manual' }])).toBe('manual');
    expect(readActiveGalleryCollection(storage, [{ id: 'other' }])).toBe('');
    writeActiveGalleryCollection(storage, '');
    expect(readActiveGalleryCollection(storage, [{ id: 'manual' }])).toBe('');
  });
});
