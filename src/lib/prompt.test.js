import { describe, expect, it } from 'vitest';
import { expandSearch, formatPrompt, formatPromptInline, inferCategory, parsePrompt, repairLegacyPromptTags } from './prompt.js';

describe('NovelAI prompt codec', () => {
  it('parses numeric weights and exports the same NovelAI syntax', () => {
    let id = 0;
    const tags = parsePrompt('1girl, 1.3::silver hair ::, futuristic city', () => `tag-${id++}`);
    expect(tags).toHaveLength(3);
    expect(tags[1]).toMatchObject({ tag: 'silver hair', weight: 1.3, translation: '银色头发', category: 'Character' });
    expect(formatPrompt(tags)).toBe('1girl,\n1.3::silver hair ::,\nfuturistic city');
    expect(formatPromptInline(tags)).toBe('1girl, 1.3::silver hair ::, futuristic city');
  });

  it('expands comma-separated weighted groups and preserves negative weights', () => {
    let id = 0;
    const tags = parsePrompt('1girl, 1.3::chibi, chibi only, thick lineart ::, -2::censored ::', () => `group-${id++}`);
    expect(tags.map(({ tag, weight }) => ({ tag, weight }))).toEqual([
      { tag: '1girl', weight: 1 },
      { tag: 'chibi', weight: 1.3 },
      { tag: 'chibi only', weight: 1.3 },
      { tag: 'thick lineart', weight: 1.3 },
      { tag: 'censored', weight: -2 },
    ]);
    expect(tags[1]).toMatchObject({ translation: 'Q版', category: 'Style' });
    expect(tags[0].category).toBe('Character');
  });

  it('repairs tags created by the legacy comma splitter without losing edits', () => {
    let id = 0;
    const legacy = [
      { id: 'girl', tag: '1girl', translation: '自定义女孩', category: 'Unsorted', weight: 1, note: '保留备注' },
      { id: 'broken', tag: '1.3::chibi', translation: '', category: 'Unsorted', weight: 1, note: '' },
      { id: 'tail', tag: 'thick lineart ::', translation: '', category: 'Unsorted', weight: 1, note: '' },
    ];
    const repaired = repairLegacyPromptTags(legacy, '1girl, 1.3::chibi, chibi only, thick lineart ::', () => `new-${id++}`);
    expect(repaired.map(({ tag, weight }) => ({ tag, weight }))).toEqual([
      { tag: '1girl', weight: 1 },
      { tag: 'chibi', weight: 1.3 },
      { tag: 'chibi only', weight: 1.3 },
      { tag: 'thick lineart', weight: 1.3 },
    ]);
    expect(repaired[0]).toMatchObject({ id: 'girl', translation: '自定义女孩', note: '保留备注', category: 'Character' });
  });

  it('keeps emphasis closers visible as diagnostics without treating them as numeric weight', () => {
    let id = 0;
    const tags = parsePrompt('masterpiece, ::year2025 ::, ::', () => `syntax-${id++}`);
    expect(tags).toHaveLength(3);
    expect(tags[1]).toMatchObject({ tag: 'year2025', weight: 1, raw_segment: '::year2025 ::', syntax_issue: 'emphasis_closer' });
    expect(tags[2]).toMatchObject({ tag: '::', syntax_issue: 'control_only' });
    expect(formatPrompt(tags)).toBe('masterpiece,\n::year2025 ::,\n::');
  });

  it('classifies common prompt concepts', () => {
    expect(inferCategory('artist:ciloranko')).toBe('Artist');
    expect(inferCategory('artist_shion')).toBe('Artist');
    expect(inferCategory('black military uniform')).toBe('Clothing');
    expect(inferCategory('cinematic lighting')).toBe('Style');
    expect(inferCategory('rainy city street')).toBe('Scene');
  });

  it('expands common Chinese search aliases', () => {
    expect(expandSearch('银发')).toContain('white hair');
    expect(expandSearch('银发')).toContain('银色头发');
  });
});
