import { describe, expect, it } from 'vitest';
import { DEFAULT_NSFW_TAGS, judgeNsfw, normalizeNsfwWords } from './nsfw';
import { createPromptStructure } from '../lib/promptStructure.js';

const structure = (prompt: string, negative = '') =>
  createPromptStructure({ prompt_raw: prompt, negative_prompt: negative });
describe('prompt NSFW judgment', () => {
  it.each([
    'nsfw',
    '[nsfw]',
    '{nude}',
    '0.2::nude::',
    'COMPLETELY_NUDE',
    '(nude)',
    'rating: explicit',
  ])('matches complete positive tag %s', (raw) => {
    expect(judgeNsfw(structure(raw), DEFAULT_NSFW_TAGS).value).toBe(true);
  });
  it.each([
    '-1::nsfw::',
    '0::nude::',
    '{-1::nsfw::}',
    'nude color',
    'A nude person stands in a room.',
    '',
  ])('does not match %s', (raw) => {
    expect(judgeNsfw(structure(raw, 'nsfw, nude'), DEFAULT_NSFW_TAGS)).toEqual({ value: false });
  });
  it('checks character positives but ignores every negative scope', () => {
    const value = structure('landscape', 'nsfw');
    value.characters = [{ prompt_raw: 'flowers', undesired_raw: 'nude' }] as any;
    expect(judgeNsfw(value, DEFAULT_NSFW_TAGS).value).toBe(false);
    value.characters[0].prompt_raw = 'nude';
    expect(judgeNsfw(value, DEFAULT_NSFW_TAGS)).toEqual({ value: true, tag: 'nude' });
  });
  it('splits prose by commas, retains weight, and follows prompt order and preserves word-list spelling', () => {
    expect(
      judgeNsfw(structure('A quiet room.\n\nA figure waits, nude'), DEFAULT_NSFW_TAGS).value,
    ).toBe(true);
    expect(judgeNsfw(structure('-1::A figure waits, nude::'), DEFAULT_NSFW_TAGS).value).toBe(false);
    expect(judgeNsfw(structure('nude, nsfw'), ['NSFW', 'nude'])).toEqual({
      value: true,
      tag: 'nude',
    });
  });
  it('uses custom and empty lists and normalizes complete words', () => {
    expect(judgeNsfw(structure('blue_hair'), ['Blue Hair'])).toEqual({
      value: true,
      tag: 'Blue Hair',
    });
    expect(judgeNsfw(structure('nsfw, nude'), [])).toEqual({ value: false });
    expect(
      normalizeNsfwWords([
        ' [NUDE] ',
        'nude',
        'rating: explicit',
        'rating:explicit',
        ' ',
        '{}',
        'pubic_hair',
      ]),
    ).toEqual(['nude', 'rating:explicit', 'pubic hair']);
  });
});
