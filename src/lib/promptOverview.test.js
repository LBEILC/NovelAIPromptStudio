import { describe, expect, it, vi } from 'vitest';
import { deleteOverviewTags, filterOverviewScopes, isOverviewTagVisible, overviewCategoryGroups, overviewCopyContext, overviewEntries, overviewSelectionMenuItems, overviewTagInteractionState, reorderOverviewTags, selectedOverviewEntries, shouldReorderOverviewTags, toggleOverviewSelectionGroup, updateOverviewTags } from './promptOverview.js';

function projectFixture() {
  const tag = (id, value, category, translation = '', weight = 1) => ({ id, tag: value, category, translation, weight, note: '' });
  return {
    tags: [tag('artist', 'artist:foo', 'ArtistEra', '画师 Foo'), tag('scene', 'night', 'Environment', '夜晚')],
    metadata: {},
    prompt_structure: {
      base_undesired_tags: [tag('lowres', 'lowres', 'StyleQuality', '低分辨率')],
      use_coords: false,
      use_order: true,
      characters: [{ id: 'character', label: 'Character 1', center: { x: 0.5, y: 0.5 }, prompt_tags: [tag('shirt', 'shirt dress', 'Clothing', '衬衫裙', 1.3), tag('button', 'button up', 'Clothing', '系扣', 1.2), tag('hair', 'blue hair', 'Body', '蓝发')], undesired_tags: [] }],
    },
  };
}

describe('Prompt overview operations', () => {
  it('keeps Tag reorder active until a marquee selection exists', () => {
    expect(overviewTagInteractionState(0, false)).toEqual({
      reorderDisabled: false,
      selectionActive: false,
      selectionModeActive: false,
      startMarqueeOnItems: false,
    });
    expect(overviewTagInteractionState(2, false)).toEqual({
      reorderDisabled: true,
      selectionActive: true,
      selectionModeActive: true,
      startMarqueeOnItems: true,
    });
    expect(overviewTagInteractionState(0, true).reorderDisabled).toBe(true);
    expect(overviewTagInteractionState(0, false, true)).toMatchObject({
      reorderDisabled: true,
      selectionActive: false,
      selectionModeActive: true,
      startMarqueeOnItems: true,
    });
  });

  it('reorders the real tag array used by wrapped drag previews', () => {
    const tags = projectFixture().prompt_structure.characters[0].prompt_tags;
    const reordered = reorderOverviewTags(tags, 'shirt', 'hair');
    expect(reordered.map((tag) => tag.id)).toEqual(['button', 'hair', 'shirt']);
    expect(tags.map((tag) => tag.id)).toEqual(['shirt', 'button', 'hair']);
    expect(reorderOverviewTags(tags, 'missing', 'hair')).toBe(tags);
  });

  it('only previews a reorder after the pointer crosses the target midpoint', () => {
    const tags = projectFixture().prompt_structure.characters[0].prompt_tags;
    const targetRect = { left: 100, width: 80 };
    expect(shouldReorderOverviewTags(tags, 'shirt', 'button', 120, targetRect)).toBe(false);
    expect(shouldReorderOverviewTags(tags, 'shirt', 'button', 141, targetRect)).toBe(true);

    const reordered = reorderOverviewTags(tags, 'shirt', 'button');
    expect(shouldReorderOverviewTags(reordered, 'shirt', 'button', 141, { left: 80, width: 80 })).toBe(false);
    expect(shouldReorderOverviewTags(tags, 'shirt', 'missing', 141, targetRect)).toBe(false);
  });

  it('filters by category, polarity, domain, and translated search text', () => {
    const scopes = filterOverviewScopes(projectFixture(), { category: 'Body', polarity: 'prompt', domain: 'character', query: '蓝发' });
    expect(overviewEntries(scopes).map((entry) => entry.tag.tag)).toEqual(['blue hair']);
  });

  it('only focuses a context-menu edit target while it remains visible', () => {
    const visibleEntries = overviewEntries(filterOverviewScopes(projectFixture(), {
      category: 'Body',
      polarity: 'prompt',
      domain: 'character',
      query: '',
    }));
    const visible = visibleEntries[0];
    expect(isOverviewTagVisible(visibleEntries, visible.scopeKey, visible.tag.id)).toBe(true);
    expect(isOverviewTagVisible(visibleEntries, 'base:prompt', 'artist')).toBe(false);
  });

  it('copies selected tags before visible filtered tags', () => {
    const project = projectFixture();
    const visible = filterOverviewScopes(project, { category: 'ArtistEra', polarity: 'all', domain: 'all', query: '' });
    expect(overviewCopyContext(project, visible, []).text).toBe('artist:foo');
    const selectedKey = overviewEntries(filterOverviewScopes(project))[1].key;
    expect(overviewCopyContext(project, visible, [selectedKey])).toMatchObject({ text: 'night', count: 1, selected: true });
  });

  it('never copies selected or visible Undesired tags and reports ignored selection', () => {
    const project = projectFixture();
    const visible = filterOverviewScopes(project, { category: 'All', polarity: 'undesired', domain: 'all', query: '' });
    expect(overviewCopyContext(project, visible, [])).toMatchObject({ text: '', count: 0, ignored: 1 });
    const undesired = overviewEntries(visible)[0];
    expect(overviewCopyContext(project, visible, [undesired.key])).toMatchObject({ text: '', count: 0, ignored: 1, selected: true });
  });

  it('copies visible tags on one line and separates selected categories with newlines', () => {
    const project = projectFixture();
    const visible = filterOverviewScopes(project, { category: 'All', polarity: 'prompt', domain: 'character', query: '' });
    expect(overviewCopyContext(project, visible, []).text).toBe('1.3::shirt dress ::, 1.2::button up ::, blue hair');

    const entries = overviewEntries(filterOverviewScopes(project));
    const selectedKeys = entries
      .filter((entry) => ['scene', 'shirt', 'button', 'hair'].includes(entry.tag.id))
      .map((entry) => entry.key);
    expect(overviewCopyContext(project, visible, selectedKeys)).toMatchObject({
      text: 'blue hair\n1.3::shirt dress ::, 1.2::button up ::\nnight',
      count: 4,
      categoryCount: 3,
      selected: true,
    });
  });

  it('groups visible entries by category in the category display order', () => {
    const groups = overviewCategoryGroups(overviewEntries(filterOverviewScopes(projectFixture())));
    expect(groups.map((group) => [group.category, group.entries.length])).toEqual([
      ['ArtistEra', 1],
      ['Body', 1],
      ['Clothing', 2],
      ['Environment', 1],
      ['StyleQuality', 1],
    ]);
  });

  it('toggles one prompt scope without changing another scope selection', () => {
    const entries = overviewEntries(filterOverviewScopes(projectFixture()));
    const unrelated = entries.find((entry) => entry.tag.id === 'lowres');
    const characterPrompt = entries.find((entry) => entry.tag.id === 'shirt');
    const scopeEntries = entries.filter((entry) => entry.scopeKey === characterPrompt.scopeKey);
    const selected = toggleOverviewSelectionGroup([unrelated.key], scopeEntries);

    expect(scopeEntries.every((entry) => entry.scopePolarity === 'prompt')).toBe(true);
    expect(selected).toEqual([unrelated.key, ...scopeEntries.map((entry) => entry.key)]);
    expect(toggleOverviewSelectionGroup(selected, scopeEntries)).toEqual([unrelated.key]);
  });

  it('deletes selected tags across prompt scopes without touching others', () => {
    const project = projectFixture();
    const entries = overviewEntries(filterOverviewScopes(project));
    const next = deleteOverviewTags(project, [entries[0].key, entries[3].key, entries[4].key, entries[5].key]);
    expect(next.tags.map((tag) => tag.tag)).toEqual(['night']);
    expect(next.prompt_structure.characters[0].prompt_tags).toEqual([]);
    expect(next.prompt_structure.base_undesired_tags).toHaveLength(1);
  });

  it('updates selected tags across prompt scopes without changing unselected tags', () => {
    const project = projectFixture();
    const entries = overviewEntries(filterOverviewScopes(project));
    const selectedKeys = entries.filter((entry) => ['artist', 'hair', 'lowres'].includes(entry.tag.id)).map((entry) => entry.key);
    const next = updateOverviewTags(project, selectedKeys, { category: 'Body', category_source: 'manual' });

    expect(selectedOverviewEntries(next, selectedKeys).every((entry) => entry.tag.category === 'Body')).toBe(true);
    expect(next.tags.find((tag) => tag.id === 'scene').category).toBe('Environment');
    expect(next.prompt_structure.characters[0].prompt_tags.find((tag) => tag.id === 'shirt').category).toBe('Clothing');
  });

  it('builds a Tag batch context menu whose actions target the active selection', () => {
    const onCopy = vi.fn();
    const onTranslate = vi.fn();
    const onCategoryChange = vi.fn();
    const onDelete = vi.fn();
    const items = overviewSelectionMenuItems({
      categories: [['Body', '身体'], ['Clothing', '服装']],
      count: 3,
      copyCount: 2,
      ignored: 1,
      onCategoryChange,
      onCopy,
      onDelete,
      onTranslate,
    });
    const categoryMenu = items.find((item) => item.key === 'set-selected-tags-category');

    expect(items.find((item) => item.key === 'copy-selected-tags').label).toContain('忽略 1 个排除 Tag');
    expect(categoryMenu.label).toContain('已选 3 个');
    expect(items.find((item) => item.key === 'delete-selected-tags').danger).toBe(true);
    items.find((item) => item.key === 'copy-selected-tags').onClick();
    items.find((item) => item.key === 'translate-selected-tags').onClick();
    categoryMenu.children[1].onClick();
    items.find((item) => item.key === 'delete-selected-tags').onClick();

    expect(onCopy).toHaveBeenCalledOnce();
    expect(onTranslate).toHaveBeenCalledOnce();
    expect(onCategoryChange).toHaveBeenCalledWith('Clothing');
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
