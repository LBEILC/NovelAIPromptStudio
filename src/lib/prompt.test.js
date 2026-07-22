import { describe, expect, it } from 'vitest';
import { analyzePromptBatch, expandSearch, formatPrompt, formatPromptGroupedInline, formatPromptInline, formatTag, inferCategory, normalizeCategory, parsePrompt, parsePromptPreservingEdits, repairLegacyPromptTags } from './prompt.js';

describe('NovelAI prompt codec', () => {
  it('parses numeric weights and exports the same NovelAI syntax', () => {
    let id = 0;
    const tags = parsePrompt('1girl, 1.3::silver hair ::, futuristic city', () => `tag-${id++}`);
    expect(tags).toHaveLength(3);
    expect(tags[1]).toMatchObject({ tag: 'silver hair', weight: 1.3, translation: '银色头发', category: 'Body' });
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
    expect(tags[1]).toMatchObject({ translation: 'Q版', category: 'StyleQuality' });
    expect(tags[0].category).toBe('Subject');
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
    expect(repaired[0]).toMatchObject({ id: 'girl', translation: '自定义女孩', note: '保留备注', category: 'Subject' });
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

  it('normalizes a closer-only tag after the user assigns a numeric weight', () => {
    let id = 0;
    const [tag] = parsePrompt('::artist:imamura ryoi::', () => `closer-${id++}`);
    const weighted = { ...tag, weight: 1.25 };

    expect(tag).toMatchObject({ tag: 'artist:imamura ryoi', weight: 1, syntax_issue: 'emphasis_closer' });
    expect(formatTag(weighted)).toBe('1.25::artist:imamura ryoi ::');
  });

  it('parses batch input with fullwidth commas, newlines, and empty segments', () => {
    let id = 0;
    const batch = analyzePromptBatch(',akakura,ciloranko，white background\n\n', [], () => `batch-${id++}`);
    expect(batch.tags.map((tag) => tag.tag)).toEqual(['akakura', 'ciloranko', 'white background']);
    expect(batch).toMatchObject({ duplicateCount: 0, syntaxIssueCount: 0 });
  });

  it('splits brace groups into editable inner tags while retaining their emphasis structure', () => {
    let id = 0;
    const prompt = '{artist:terasu mc, artist:shirabe shiki, artist:meme50, year 2024, year 2025, } {uncensored, no watermark, best quality, amazing quality, very aesthetic, absurdres, highres, masterpiece, } {3d, 3d background, realistic, beach, wave, splashing, } {from forward, }';
    const tags = parsePrompt(prompt, () => `brace-${id++}`);

    expect(tags).toHaveLength(20);
    expect(tags.map((tag) => tag.tag)).toEqual([
      'artist:terasu mc', 'artist:shirabe shiki', 'artist:meme50', 'year 2024', 'year 2025',
      'uncensored', 'no watermark', 'best quality', 'amazing quality', 'very aesthetic', 'absurdres', 'highres', 'masterpiece',
      '3d', '3d background', 'realistic', 'beach', 'wave', 'splashing', 'from forward',
    ]);
    expect(tags.slice(0, 5).every((tag) => tag.brace_depth === 1 && tag.brace_group === tags[0].brace_group)).toBe(true);
    expect(tags[5].brace_group).not.toBe(tags[0].brace_group);
    expect(formatTag(tags[0])).toBe('{artist:terasu mc}');
    expect(formatPromptGroupedInline(tags).split('}, {')).toHaveLength(4);

    const emphasized = parsePrompt('{{bad hands}}, {artist:a, artist:b, }', () => `emphasis-${id++}`);
    expect(emphasized.map((tag) => tag.tag)).toEqual(['bad hands', 'artist:a', 'artist:b']);
    expect(emphasized.map(formatTag)).toEqual(['{{bad hands}}', '{artist:a}', '{artist:b}']);
  });

  it('keeps triple-brace source text groupable while showing each member with the same braces', () => {
    let id = 0;
    const prompt = '{{{best quality, amazing quality, very aesthetic, highres, incredibly absurdres}}},';
    const tags = parsePrompt(prompt, () => `triple-${id++}`);

    expect(tags.map((tag) => tag.tag)).toEqual(['best quality', 'amazing quality', 'very aesthetic', 'highres', 'incredibly absurdres']);
    expect(tags.every((tag) => tag.brace_depth === 3 && tag.brace_group === tags[0].brace_group)).toBe(true);
    expect(tags.map(formatTag)).toEqual([
      '{{{best quality}}}',
      '{{{amazing quality}}}',
      '{{{very aesthetic}}}',
      '{{{highres}}}',
      '{{{incredibly absurdres}}}',
    ]);
    expect(formatPromptGroupedInline(tags)).toBe('{{{best quality, amazing quality, very aesthetic, highres, incredibly absurdres}}}');
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
    expect(inferCategory('artist:ciloranko')).toBe('ArtistEra');
    expect(inferCategory('artist_shion')).toBe('ArtistEra');
    expect(inferCategory('year 2025')).toBe('ArtistEra');
    expect(inferCategory('2girls')).toBe('Subject');
    expect(inferCategory('elf')).toBe('Identity');
    expect(inferCategory('silver hair')).toBe('Body');
    expect(inferCategory('black military uniform')).toBe('Clothing');
    expect(inferCategory('smile')).toBe('Action');
    expect(inferCategory('hand up')).toBe('Action');
    expect(inferCategory('upper body')).toBe('Composition');
    expect(inferCategory('cinematic lighting')).toBe('Composition');
    expect(inferCategory('rainy city street')).toBe('Environment');
    expect(inferCategory('best quality')).toBe('StyleQuality');
  });

  it('maps legacy categories into the expanded taxonomy', () => {
    expect(normalizeCategory('Artist', 'artist:foo')).toBe('ArtistEra');
    expect(normalizeCategory('Character', '2girls')).toBe('Subject');
    expect(normalizeCategory('Character', 'silver hair')).toBe('Body');
    expect(normalizeCategory('Character', 'gawr gura')).toBe('Identity');
    expect(normalizeCategory('Scene', 'beach')).toBe('Environment');
    expect(normalizeCategory('Style', 'cinematic lighting')).toBe('Composition');
    expect(normalizeCategory('Style', 'best quality')).toBe('StyleQuality');
  });

  it('expands common Chinese search aliases', () => {
    expect(expandSearch('银发')).toContain('white hair');
    expect(expandSearch('银发')).toContain('银色头发');
  });
});
