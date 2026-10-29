import { describe, expect, it } from 'vitest';
import { singleTagCore } from './singleTag.js';

describe('single tag core shared by highlighting and dictionary writes', () => {
  it.each([
    ['1.85::blue coat::', 'blue coat'],
    ['-1.5::{{blue coat}}::', 'blue coat'],
    ['[blue coat]', 'blue coat'],
    ['traveler (synthetic)', 'traveler (synthetic)'],
    ['artist:synthetic', 'artist:synthetic'],
    ['(blue coat:1.45)', ''],
    ['blue coat, red scarf', ''],
    ['blue coat，red scarf', ''],
    ['blue coat\nred scarf', ''],
    ['blue coat\rred scarf', ''],
    ['A traveler is waiting beside the quiet window', ''],
    ['A traveler waits.', ''],
    ['', ''],
  ])('normalizes %j to %j', (value, expected) => {
    expect(singleTagCore(value)).toBe(expected);
  });
});
