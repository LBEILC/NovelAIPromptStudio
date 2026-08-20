import { describe, expect, it } from 'vitest';
import {
  decodeMarqueeKey,
  encodeMarqueeKey,
  marqueeMode,
  marqueeRect,
  marqueeSelection,
  rectanglesIntersect,
} from './marqueeSelection.js';

describe('marquee selection', () => {
  it('normalizes a rectangle regardless of drag direction', () => {
    expect(marqueeRect({ x: 90, y: 70 }, { x: 20, y: 10 })).toEqual({
      bottom: 70,
      height: 60,
      left: 20,
      right: 90,
      top: 10,
      width: 70,
    });
  });

  it('counts touching item bounds as an intersection', () => {
    const selection = { bottom: 50, left: 10, right: 50, top: 10 };
    expect(rectanglesIntersect(selection, { bottom: 80, left: 50, right: 80, top: 50 })).toBe(true);
    expect(rectanglesIntersect(selection, { bottom: 80, left: 51, right: 80, top: 51 })).toBe(false);
  });

  it('supports replace, additive, and toggle selection gestures', () => {
    expect(marqueeSelection(['one', 'two'], ['two', 'three'])).toEqual(['two', 'three']);
    expect(marqueeSelection(['one', 'two'], ['two', 'three'], 'add')).toEqual(['one', 'two', 'three']);
    expect(marqueeSelection(['one', 'two'], ['two', 'three'], 'toggle')).toEqual(['one', 'three']);
  });

  it('maps platform modifiers and safely transports composite keys through data attributes', () => {
    const key = 'character:1\u0000tag with spaces';
    expect(decodeMarqueeKey(encodeMarqueeKey(key))).toBe(key);
    expect(marqueeMode({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe('toggle');
    expect(marqueeMode({ ctrlKey: false, metaKey: false, shiftKey: true })).toBe('add');
    expect(marqueeMode({ ctrlKey: false, metaKey: false, shiftKey: false })).toBe('replace');
  });
});
