import { describe, expect, it } from 'vitest';
import {
  contentRectInViewport,
  decodeMarqueeKey,
  encodeMarqueeKey,
  marqueeMode,
  marqueeRect,
  marqueeSelection,
  pointInScrollableContent,
  rectInScrollableContent,
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

  it('keeps selection geometry anchored to scrollable content', () => {
    const viewport = { bottom: 500, height: 400, left: 40, right: 640, top: 100, width: 600 };
    const scroll = { left: 20, top: 300 };
    expect(pointInScrollableContent({ x: 140, y: 250 }, viewport, scroll)).toEqual({ x: 120, y: 450 });
    expect(rectInScrollableContent(
      { bottom: 260, height: 60, left: 120, right: 220, top: 200, width: 100 },
      viewport,
      scroll,
    )).toEqual({ bottom: 460, height: 60, left: 100, right: 200, top: 400, width: 100 });
  });

  it('clips a content-space marquee to the current scroll viewport', () => {
    const viewport = { bottom: 500, height: 400, left: 40, right: 640, top: 100, width: 600 };
    expect(contentRectInViewport(
      { bottom: 780, height: 480, left: 60, right: 320, top: 300, width: 260 },
      viewport,
      { left: 0, top: 420 },
    )).toEqual({ bottom: 460, height: 360, left: 100, right: 360, top: 100, width: 260 });
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
