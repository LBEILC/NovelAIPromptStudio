import { describe, expect, it } from 'vitest';
import { adjacentGallerySelection, galleryEmptyState, galleryGroupMenuLabels, galleryScrubMemberIndex, gallerySelectionProjectIds, groupGalleryProjects, hasGalleryScrubIntent, isGalleryBlankClickTarget, reconcileGallerySelection } from './gallery.js';

const item = (id, fingerprint, createdAt, cover = '') => ({
  id,
  name: id,
  prompt_fingerprint: fingerprint,
  created_at: createdAt,
  group_cover_id: cover,
  tags: [],
  metadata: {},
  prompt_structure: { base_undesired_tags: [], characters: [] },
});

describe('gallery grouping and selection', () => {
  it('groups only non-empty matching fingerprints and honors a valid persisted cover', () => {
    const groups = groupGalleryProjects([
      item('older', 'same', '2026-01-01', 'older'),
      item('newer', 'same', '2026-02-01', 'older'),
      item('plain-a', '', '2026-03-01'),
      item('plain-b', '', '2026-03-02'),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.fingerprint === 'same')).toMatchObject({ count: 2, cover: { id: 'older' } });
  });

  it('falls back to the newest remaining member when a persisted cover is invalid', () => {
    const [group] = groupGalleryProjects([
      item('older', 'same', '2026-01-01', 'deleted-cover'),
      item('newer', 'same', '2026-02-01', 'deleted-cover'),
    ]);
    expect(group.cover.id).toBe('newer');
  });

  it('expands selected groups to current-view project ids and drops hidden selection', () => {
    const groups = groupGalleryProjects([item('a', 'same', '2026-01-01'), item('b', 'same', '2026-02-01'), item('c', 'other', '2026-03-01')]);
    expect(gallerySelectionProjectIds(groups, [groups[0].id])).toEqual(['b', 'a']);
    expect(reconcileGallerySelection(groups.slice(1), groups.map((group) => group.id))).toEqual([groups[1].id]);
  });

  it('chooses the next member after detail deletion and then an adjacent group', () => {
    const groups = groupGalleryProjects([item('a', 'same', '2026-01-01'), item('b', 'same', '2026-02-01'), item('c', 'other', '2026-03-01')]);
    const same = groups.find((group) => group.fingerprint === 'same');
    expect(adjacentGallerySelection(groups, same.id, 'b')).toEqual({ groupId: same.id, projectId: 'a' });
  });

  it('uses single-image wording unless the card represents a real group', () => {
    expect(galleryGroupMenuLabels({ count: 1, members: [{ is_favorite: 0 }] })).toEqual({
      favorite: '收藏图片',
      rename: '重命名',
    });
    expect(galleryGroupMenuLabels({ count: 2, members: [{ is_favorite: 1 }, { is_favorite: 1 }] })).toEqual({
      favorite: '取消收藏整个图片组',
      rename: '重命名头图',
    });
  });

  it('maps horizontal pointer movement across a card to stable group members', () => {
    expect(galleryScrubMemberIndex(100, 100, 200, 4)).toBe(0);
    expect(galleryScrubMemberIndex(149, 100, 200, 4)).toBe(0);
    expect(galleryScrubMemberIndex(150, 100, 200, 4)).toBe(1);
    expect(galleryScrubMemberIndex(299, 100, 200, 4)).toBe(3);
    expect(galleryScrubMemberIndex(300, 100, 200, 4)).toBe(3);
    expect(galleryScrubMemberIndex(200, 100, 0, 4)).toBe(0);
    expect(galleryScrubMemberIndex(200, 100, 200, 1)).toBe(0);
  });

  it('recognizes deliberate horizontal scrubbing without depending on popup state', () => {
    expect(hasGalleryScrubIntent(107, 100)).toBe(false);
    expect(hasGalleryScrubIntent(108, 100)).toBe(true);
    expect(hasGalleryScrubIntent(92, 100)).toBe(true);
    expect(hasGalleryScrubIntent(undefined, 100)).toBe(false);
    expect(hasGalleryScrubIntent(100, null)).toBe(false);
  });

  it('only treats clicks outside image cards as Gallery blank-space clicks', () => {
    expect(isGalleryBlankClickTarget({ closest: () => null })).toBe(true);
    expect(isGalleryBlankClickTarget({ closest: (selector) => selector === '.gallery-card' ? {} : null })).toBe(false);
    expect(isGalleryBlankClickTarget(null)).toBe(true);
  });

  it('gives every empty gallery view an accurate next step', () => {
    expect(galleryEmptyState('favorites')).toMatchObject({ title: '暂无收藏', icon: 'star' });
    expect(galleryEmptyState('trash')).toMatchObject({ title: '回收站为空', icon: 'trash' });
    expect(galleryEmptyState('all', 'artist')).toMatchObject({ title: '没有匹配的图片', icon: 'search' });
    expect(galleryEmptyState('all').description).toContain('导入图片');
  });
});
