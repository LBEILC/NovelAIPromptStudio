import { describe, expect, it } from 'vitest';
import { tagPresentation } from '../lib/tagManagement.js';

describe('shared Tag presentation', () => {
  const tag = { tag: 'bagpipe (arknights)', translation: '风笛（明日方舟）' };

  it('uses the same original, translated, and bilingual labels across Tag surfaces', () => {
    expect(tagPresentation(tag, 'original')).toMatchObject({
      primary: 'bagpipe (arknights)',
      secondary: '',
      fallback: false,
    });
    expect(tagPresentation(tag, 'translated')).toMatchObject({
      primary: '风笛（明日方舟）',
      secondary: '',
      fallback: false,
    });
    expect(tagPresentation(tag, 'bilingual')).toMatchObject({
      primary: 'bagpipe (arknights)',
      secondary: '风笛（明日方舟）',
      fallback: false,
    });
  });

  it('marks missing translations as fallback content', () => {
    expect(tagPresentation({ tag: 'unknown tag', translation: '' }, 'translated')).toMatchObject({
      primary: 'unknown tag',
      fallback: true,
    });
  });
});
