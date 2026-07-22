import { describe, expect, it } from 'vitest';
import { isTextEditingTarget } from './contextMenu.js';

describe('renderer context menu helpers', () => {
  it('only treats editable text controls as text menu targets', () => {
    const input = { closest: () => ({ type: 'text', matches: (selector) => selector.startsWith('textarea') ? false : false }) };
    expect(isTextEditingTarget(input)).toBe(true);
    const range = { closest: () => ({ type: 'range', matches: () => false }) };
    expect(isTextEditingTarget(range)).toBe(false);
  });
});
