import { describe, expect, it, vi } from 'vitest';
import { tagHoverPreviewFields, tagPresentation } from '../lib/tagManagement.js';
import { TagChip } from './TagManagement.jsx';

vi.mock('@lobehub/ui', () => {
  const Component = () => null;
  return { Popover: Component, Tooltip: Component };
});

vi.mock('@lobehub/ui/base-ui', () => {
  const Component = () => null;
  return {
    Button: Component,
    Input: Component,
    Select: Component,
    SliderWithInput: Component,
  };
});

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

  it('only previews content missing from the active language mode', () => {
    expect(tagHoverPreviewFields('original')).toEqual({ original: false, translation: true });
    expect(tagHoverPreviewFields('translated')).toEqual({ original: true, translation: false });
    expect(tagHoverPreviewFields('bilingual')).toEqual({ original: false, translation: false });
  });

  it('keeps Tag hover previews transparent to pointer hit testing', () => {
    const element = TagChip({
      display: { fallback: false, primary: '1girl', secondary: '' },
      tag: { category: 'Character', tag: '1girl', weight: 1 },
      tooltip: 'preview',
    });

    expect(element.props.styles).toEqual({
      content: { padding: 0 },
      root: { pointerEvents: 'none' },
    });
    expect(element.props.positionerProps).toEqual({ style: { pointerEvents: 'none' } });
  });
});
