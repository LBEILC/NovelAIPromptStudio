import { describe, expect, it } from 'vitest';
import {
  galleryCollectionImageCount,
  galleryCollectionScope,
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
