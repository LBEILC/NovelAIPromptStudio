import { describe, expect, it } from 'vitest';
import { adjacentGallerySelection, galleryEmptyState, galleryGroupMember, galleryGroupMenuLabels, galleryScrubMemberIndex, gallerySelectionProjectIds, galleryViewGroups, groupGalleryProjects, isGalleryBlankClickTarget, reconcileGallerySelection, shouldCollapseGalleryPreview } from './gallery.js';

const item = (id, fingerprint, createdAt, cover = '') => ({
  base_prompt_fingerprint: fingerprint === 'same-character-a' || fingerprint === 'same-character-b' ? 'same-base' : fingerprint,
  id,
  name: id,
  prompt_fingerprint: fingerprint,
  vibe_fingerprint: 'vibe-a',
  created_at: createdAt,
  group_cover_id: cover,
  tags: [],
  metadata: { model: 'nai-v4.5' },
  prompt_structure: { base_undesired_tags: [], characters: [] },
});

const similarItem = (id, tags, { model = 'nai-v4.5', vibe = 'vibe-a', undesired = [] } = {}) => ({
  ...item(id, id, `2026-01-${String(id.length).padStart(2, '0')}`),
  tags: tags.map((tag) => ({ tag, category: 'Unsorted', weight: 1 })),
  vibe_fingerprint: vibe,
  metadata: { model },
  prompt_structure: {
    base_undesired_tags: undesired.map((tag) => ({ tag, category: 'StyleQuality', weight: 1 })),
    characters: [],
  },
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
    expect(groups.find((group) => group.count === 2)).toMatchObject({ canSetCover: true, cover: { id: 'older' } });
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
    const same = groups.find((group) => group.count === 2);
    expect(adjacentGallerySelection(groups, same.id, 'b')).toEqual({ groupId: same.id, projectId: 'a' });
  });

  it('uses single-image wording unless the card represents a real group', () => {
    expect(galleryGroupMenuLabels({ count: 1 })).toEqual({ rename: '重命名' });
    expect(galleryGroupMenuLabels({ canSetCover: true, count: 2 })).toEqual({ rename: '重命名头图' });
  });

  it('expands grouping monotonically across Prompt scope and the Vibe option while keeping model as a boundary', () => {
    const projects = [
      item('a', 'same-character-a', '2026-01-01'),
      { ...item('b', 'same-character-a', '2026-01-02'), vibe_fingerprint: 'vibe-b' },
      item('c', 'same-character-b', '2026-01-03'),
      { ...item('d', 'same-character-b', '2026-01-04'), metadata: { model: 'different-model' } },
    ];

    expect(groupGalleryProjects(projects, { promptScope: 'separate', mergeVibes: false })).toHaveLength(4);
    expect(groupGalleryProjects(projects, { promptScope: 'full', mergeVibes: false })).toHaveLength(4);
    expect(groupGalleryProjects(projects, { promptScope: 'full', mergeVibes: true })).toHaveLength(3);
    expect(groupGalleryProjects(projects, { promptScope: 'base', mergeVibes: false })).toHaveLength(3);
    expect(groupGalleryProjects(projects, { promptScope: 'base', mergeVibes: true })).toHaveLength(2);
  });

  it('filters individual images before dynamic grouping instead of retaining hidden group members', () => {
    const groups = galleryViewGroups([
      item('older match', 'same', '2026-01-01', 'older match'),
      item('newer', 'same', '2026-02-01', 'older match'),
    ], { query: 'older match' }, { promptScope: 'full', mergeVibes: true });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ canSetCover: false, count: 1, cover: { id: 'older match' } });
    expect(groups[0].members.map((project) => project.id)).toEqual(['older match']);
  });

  it('removes non-matching members before similar-Prompt grouping and selection expansion', () => {
    const shared = ['style', 'lighting', 'portrait', 'blue sky', 'outdoors', 'day', 'solo'];
    const projects = [
      similarItem('bagpipe', [...shared, 'bagpipe']),
      similarItem('other', [...shared, 'texas']),
    ];
    expect(groupGalleryProjects(projects, { promptScope: 'similar', similarityThreshold: 75 })).toMatchObject([{ count: 2 }]);

    const groups = galleryViewGroups(projects, { query: 'bagpipe' }, { promptScope: 'similar', similarityThreshold: 75 });
    expect(groups).toMatchObject([{ count: 1, members: [{ id: 'bagpipe' }] }]);
    expect(gallerySelectionProjectIds(groups, [groups[0].id])).toEqual(['bagpipe']);
  });

  it('forms similar-Prompt groups without transitive chain expansion', () => {
    const projects = [
      similarItem('a', ['a', 'b', 'c', 'd']),
      similarItem('bb', ['a', 'b', 'c', 'd', 'e']),
      similarItem('ccc', ['b', 'c', 'd', 'e']),
    ];
    const groups = groupGalleryProjects(projects, { promptScope: 'similar', mergeVibes: false, similarityThreshold: 75 });

    expect(groups.map((group) => group.members.map((project) => project.id).sort())).toEqual([
      ['a', 'bb'],
      ['ccc'],
    ]);
    expect(groups.every((group) => !group.canSetCover)).toBe(true);
  });

  it('keeps Vibe and model as independent hard boundaries in similar mode', () => {
    const projects = [
      similarItem('a', ['style', 'lighting']),
      similarItem('bb', ['style', 'lighting'], { vibe: 'vibe-b' }),
      similarItem('ccc', ['style', 'lighting'], { model: 'different-model' }),
    ];
    expect(groupGalleryProjects(projects, { promptScope: 'similar', mergeVibes: false, similarityThreshold: 70 })).toHaveLength(3);
    expect(groupGalleryProjects(projects, { promptScope: 'similar', mergeVibes: true, similarityThreshold: 70 })).toHaveLength(2);
  });

  it('uses the selected percentage as the minimum Base Prompt similarity', () => {
    const projects = [
      similarItem('a', ['style', 'lighting'], { undesired: ['lowres'] }),
      similarItem('bb', ['style', 'lighting'], { undesired: ['blurry'] }),
    ];
    expect(groupGalleryProjects(projects, { promptScope: 'similar', mergeVibes: false, similarityThreshold: 85 })).toHaveLength(2);
    expect(groupGalleryProjects(projects, { promptScope: 'similar', mergeVibes: false, similarityThreshold: 80 })).toHaveLength(1);
  });

  it('maps the initial pointer position and subsequent movement directly to group members', () => {
    expect(galleryScrubMemberIndex(100, 100, 200, 4)).toBe(0);
    expect(galleryScrubMemberIndex(149, 100, 200, 4)).toBe(0);
    expect(galleryScrubMemberIndex(150, 100, 200, 4)).toBe(1);
    expect(galleryScrubMemberIndex(200, 100, 200, 4)).toBe(2);
    expect(galleryScrubMemberIndex(299, 100, 200, 4)).toBe(3);
    expect(galleryScrubMemberIndex(300, 100, 200, 4)).toBe(3);
    expect(galleryScrubMemberIndex(200, 100, 0, 4)).toBe(0);
    expect(galleryScrubMemberIndex(200, 100, 200, 1)).toBe(0);
  });

  it('resolves a scrubbed member and safely falls back to the group cover', () => {
    const cover = item('cover', 'same', '2026-01-01');
    const variant = item('variant', 'same', '2026-01-02');
    const group = { cover, members: [cover, variant] };

    expect(galleryGroupMember(group, 'variant')).toBe(variant);
    expect(galleryGroupMember(group, 'missing')).toBe(cover);
    expect(galleryGroupMember(undefined, 'variant')).toBeUndefined();
  });

  it('only treats clicks outside image cards as Gallery blank-space clicks', () => {
    expect(isGalleryBlankClickTarget({ closest: () => null })).toBe(true);
    expect(isGalleryBlankClickTarget({ closest: (selector) => selector === '.gallery-card' ? {} : null })).toBe(false);
    expect(isGalleryBlankClickTarget(null)).toBe(true);
  });

  it('only collapses a floating Gallery preview from a blank-space click', () => {
    const blank = { closest: () => null };
    const card = { closest: (selector) => selector === '.gallery-card' ? {} : null };

    expect(shouldCollapseGalleryPreview(blank, false)).toBe(true);
    expect(shouldCollapseGalleryPreview(blank, true)).toBe(false);
    expect(shouldCollapseGalleryPreview(card, false)).toBe(false);
  });

  it('gives every empty gallery view an accurate next step', () => {
    expect(galleryEmptyState('trash')).toMatchObject({ title: '回收站为空', icon: 'trash' });
    expect(galleryEmptyState('all', true)).toMatchObject({ title: '没有匹配的图片', icon: 'search' });
    expect(galleryEmptyState('all').description).toContain('导入图片');
  });
});
