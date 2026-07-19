import { describe, expect, it } from 'vitest';
import { buildTagLibrary, projectTagOccurrences, vibeGroupUsages } from './resourceIndexes.js';

describe('resource library indexes', () => {
  it('indexes every prompt scope without changing the original tag', () => {
    const project = {
      id: 'p1', created_at: '2026-01-01', updated_at: '2026-01-02',
      tags: [{ tag: 'year2025', syntax_issue: 'emphasis_closer', raw_segment: '::year2025 ::', category: 'Style', category_source: 'ai' }],
      prompt_structure: {
        base_undesired_tags: [{ tag: 'lowres' }],
        characters: [{ id: 'c1', label: '角色 1', prompt_tags: [{ tag: 'girl' }], undesired_tags: [{ tag: 'blue hair' }] }],
      },
    };
    expect(projectTagOccurrences(project)).toHaveLength(4);
    const library = buildTagLibrary([project], [{ tag: 'year2025', display_tag: 'year2025', translation: '2025 年风格', has_translation: 1, translation_source: 'manual', category: 'Style', has_classification: 1, category_source: 'manual', visibility: 'visible' }]);
    expect(library.find((tag) => tag.key === 'year2025')).toMatchObject({ tag: 'year2025', translation: '2025 年风格', usage_count: 1, image_count: 1, problematic: true, effective_visibility: 'visible' });
    expect(project.tags[0].tag).toBe('year2025');
  });

  it('matches Vibe usages by library id or source hash', () => {
    const group = { key: 'png-hash', source: { source_image_hash: 'png-hash' }, entries: [{ id: 'v1' }] };
    const usages = vibeGroupUsages(group, [
      { id: 'p1', vibes: [{ library_id: 'v1' }] },
      { id: 'p2', vibes: [{ source_image_hash: 'png-hash' }] },
      { id: 'p3', vibes: [{ library_id: 'other' }] },
    ]);
    expect(usages.map((item) => item.project.id)).toEqual(['p1', 'p2']);
  });
});
