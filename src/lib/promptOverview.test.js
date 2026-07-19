import { describe, expect, it } from 'vitest';
import { deleteOverviewTags, filterOverviewScopes, overviewCopyContext, overviewEntries } from './promptOverview.js';

function projectFixture() {
  const tag = (id, value, category, translation = '') => ({ id, tag: value, category, translation, weight: 1, note: '' });
  return {
    tags: [tag('artist', 'artist:foo', 'Artist', '画师 Foo'), tag('scene', 'night', 'Scene', '夜晚')],
    metadata: {},
    prompt_structure: {
      base_undesired_tags: [tag('lowres', 'lowres', 'Style', '低分辨率')],
      use_coords: false,
      use_order: true,
      characters: [{ id: 'character', label: 'Character 1', center: { x: 0.5, y: 0.5 }, prompt_tags: [tag('hair', 'blue hair', 'Character', '蓝发')], undesired_tags: [] }],
    },
  };
}

describe('Prompt overview operations', () => {
  it('filters by category, polarity, domain, and translated search text', () => {
    const scopes = filterOverviewScopes(projectFixture(), { category: 'Character', polarity: 'prompt', domain: 'character', query: '蓝发' });
    expect(overviewEntries(scopes).map((entry) => entry.tag.tag)).toEqual(['blue hair']);
  });

  it('copies selected tags before visible filtered tags', () => {
    const project = projectFixture();
    const visible = filterOverviewScopes(project, { category: 'Artist', polarity: 'all', domain: 'all', query: '' });
    expect(overviewCopyContext(project, visible, []).text).toBe('artist:foo');
    const selectedKey = overviewEntries(filterOverviewScopes(project))[1].key;
    expect(overviewCopyContext(project, visible, [selectedKey])).toMatchObject({ text: 'night', count: 1, selected: true });
  });

  it('deletes selected tags across prompt scopes without touching others', () => {
    const project = projectFixture();
    const entries = overviewEntries(filterOverviewScopes(project));
    const next = deleteOverviewTags(project, [entries[0].key, entries[3].key]);
    expect(next.tags.map((tag) => tag.tag)).toEqual(['night']);
    expect(next.prompt_structure.characters[0].prompt_tags).toEqual([]);
    expect(next.prompt_structure.base_undesired_tags).toHaveLength(1);
  });
});
