import { describe, it, expect } from 'vitest';
import { textErrors, textMarks } from './promptText.js';
import { parsePromptSection, serializePromptSection } from './promptDocument';
import { reparseSection } from '../workbench/model';
import { nearestTabSlot } from './tabSlots.js';
describe('text editing rules', () => {
  it('splits blank lines, classifies long prose and retains grouped weights', () => {
    const text =
      '1.3::rain, clouds::\n\nA traveler walks beside the river through the early morning mist';
    const parsed = reparseSection(parsePromptSection(''), text, true);
    expect(parsed.blocks.map((b) => b.type)).toEqual(['tags', 'paragraph']);
    expect(parsed.blocks[0].tags.map((t) => t.weight)).toEqual([1.3, 1.3]);
    expect(serializePromptSection(parsed)).toBe(text);
  });
  it('retains paragraph translations and explicit types through text round trips', () => {
    const old = parsePromptSection(
      'A traveler walks beside the river through the early morning mist',
    );
    old.blocks[0].translation = '合成测试译文';
    old.blocks[0].userType = true;
    old.blocks[0].type = 'paragraph';
    const next = reparseSection(old, serializePromptSection(old), true);
    expect(next.blocks[0]).toMatchObject({
      translation: '合成测试译文',
      type: 'paragraph',
      userType: true,
    });
  });
  it('reports all three syntax errors with their own line numbers', () => {
    expect(textErrors('rain\n{clouds\n1.3::wind')).toEqual([
      { at: 5, msg: '第 2 行：{ 没有配对' },
      { at: 13, msg: '第 3 行：少一个 ::' },
    ]);
    expect(textErrors('rain\n::')).toEqual([{ at: 5, msg: '第 2 行：多余的 ::' }]);
    expect(textErrors('{rain}, [wind], 1.3::clouds, sky::')).toEqual([]);
  });
  it.each([
    [-1.5, 'neg l3'],
    [-1.49, 'neg l2'],
    [-0.8, 'neg l2'],
    [-0.79, 'neg l1'],
    [0, 'down l3'],
    [0.5, 'down l2'],
    [0.8, 'down l1'],
    [1, ''],
    [1.2, 'up l1'],
    [1.21, 'up l2'],
    [1.6, 'up l2'],
    [1.61, 'up l3'],
  ])('weight %s has exact highlight level %s', (weight, level) => {
    const value = `${weight}::rain::`;
    expect(textMarks(value)[value.indexOf('rain')]).toBe(level);
  });
  it('tab slots follow own left edge regardless of dragged width or grab point', () => {
    expect(nearestTabSlot(0, [60], 0, 29)).toBe(0);
    expect(nearestTabSlot(0, [60], 0, 31)).toBe(1);
    expect(nearestTabSlot(0, [240], 0, 119)).toBe(0);
    expect(nearestTabSlot(0, [240], 0, 121)).toBe(1);
  });
});
