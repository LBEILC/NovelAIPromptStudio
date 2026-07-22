import { describe, expect, it } from 'vitest';
import { analyzePromptBatch, expandSearch, formatPrompt, formatPromptInline, inferCategory, parsePrompt, parsePromptPreservingEdits, repairLegacyPromptTags } from './prompt.js';

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

  it('reparses raw prompt text while preserving metadata for unchanged tags', () => {
    let id = 0;
    const existing = [
      { id: 'silver', tag: 'silver hair', translation: '自定义银发', translation_source: 'manual', category: 'Clothing', category_source: 'manual', weight: 1, note: '保留备注' },
      { id: 'removed', tag: 'old tag', translation: '旧标签', category: 'Unsorted', weight: 1, note: '' },
    ];
    const replaced = parsePromptPreservingEdits('1.5::silver hair ::, new tag', existing, () => `raw-${id++}`);

    expect(replaced).toHaveLength(2);
    expect(replaced[0]).toMatchObject({
      id: 'silver',
      tag: 'silver hair',
      weight: 1.5,
      translation: '自定义银发',
      translation_source: 'manual',
      category: 'Clothing',
      category_source: 'manual',
      note: '保留备注',
    });
    expect(replaced[1]).toMatchObject({ id: 'raw-1', tag: 'new tag' });
    expect(replaced.some((tag) => tag.id === 'removed')).toBe(false);
  });

  it('keeps emphasis closers visible as diagnostics without treating them as numeric weight', () => {
    let id = 0;
    const tags = parsePrompt('masterpiece, ::year2025 ::, ::', () => `syntax-${id++}`);
    expect(tags).toHaveLength(3);
    expect(tags[1]).toMatchObject({ tag: 'year2025', weight: 1, raw_segment: '::year2025 ::', syntax_issue: 'emphasis_closer' });
    expect(tags[2]).toMatchObject({ tag: '::', syntax_issue: 'control_only' });
    expect(formatPrompt(tags)).toBe('masterpiece,\n::year2025 ::,\n::');
  });

  it('parses batch input with fullwidth commas, newlines, and empty segments', () => {
    let id = 0;
    const batch = analyzePromptBatch(',akakura,ciloranko，white background\n\n', [], () => `batch-${id++}`);
    expect(batch.tags.map((tag) => tag.tag)).toEqual(['akakura', 'ciloranko', 'white background']);
    expect(batch).toMatchObject({ duplicateCount: 0, syntaxIssueCount: 0 });
  });

  it('flattens legacy brace groups without changing double-brace emphasis tags', () => {
    let id = 0;
    const prompt = '{artist:terasu mc, artist:shirabe shiki, artist:meme50, year 2024, year 2025, } {uncensored, no watermark, best quality, amazing quality, very aesthetic, absurdres, highres, masterpiece, } {3d, 3d background, realistic, beach, wave, splashing, } {from forward, }';
    const tags = parsePrompt(prompt, () => `brace-${id++}`);

    expect(tags).toHaveLength(20);
    expect(tags.map((tag) => tag.tag)).toEqual([
      'artist:terasu mc', 'artist:shirabe shiki', 'artist:meme50', 'year 2024', 'year 2025',
      'uncensored', 'no watermark', 'best quality', 'amazing quality', 'very aesthetic', 'absurdres', 'highres', 'masterpiece',
      '3d', '3d background', 'realistic', 'beach', 'wave', 'splashing', 'from forward',
    ]);
    expect(parsePrompt('{{bad hands}}, {artist:a, artist:b, }', () => `emphasis-${id++}`).map((tag) => tag.tag))
      .toEqual(['{{bad hands}}', 'artist:a', 'artist:b']);
  });

  it('repairs previously imported tags that were split before legacy brace groups were supported', () => {
    let id = 0;
    const prompt = '{artist:terasu mc, artist:meme50, } {best quality, masterpiece, }';
    const repaired = repairLegacyPromptTags([
      { id: 'old-1', tag: '{artist:terasu mc', translation: '', category: 'Unsorted', weight: 1, note: '' },
      { id: 'old-2', tag: 'artist:meme50', translation: '', category: 'Artist', weight: 1, note: '' },
      { id: 'old-3', tag: '} {best quality', translation: '', category: 'Style', weight: 1, note: '' },
      { id: 'old-4', tag: 'masterpiece', translation: '', category: 'Style', weight: 1, note: '' },
    ], prompt, () => `repaired-${id++}`);

    expect(repaired.map((tag) => tag.tag)).toEqual(['artist:terasu mc', 'artist:meme50', 'best quality', 'masterpiece']);
    expect(repaired.every((tag) => !/[{}]/.test(tag.tag))).toBe(true);
  });

  it('preserves weighted groups and reports duplicates without removing them', () => {
    let id = 0;
    const batch = analyzePromptBatch('1.3::shirt dress，button up ::, solo, SOLO', [{ tag: 'solo' }], () => `batch-${id++}`);
    expect(batch.tags.map(({ tag, weight }) => ({ tag, weight }))).toEqual([
      { tag: 'shirt dress', weight: 1.3 },
      { tag: 'button up', weight: 1.3 },
      { tag: 'solo', weight: 1 },
      { tag: 'SOLO', weight: 1 },
    ]);
    expect(batch.duplicateCount).toBe(2);
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
