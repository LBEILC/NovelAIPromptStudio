import { describe, expect, it } from 'vitest';
import { clampCompareScale, panCompareViewport, zoomCompareViewport } from './compareViewport.js';

describe('synchronized comparison viewport', () => {
  it('clamps zoom and resets pan when returning to fit', () => {
    expect(clampCompareScale(9)).toBe(4);
    expect(clampCompareScale(-2)).toBe(1);
    expect(zoomCompareViewport({ scale: 1.25, x: 30, y: -10 }, -0.25)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('applies the same pointer delta to a shared viewport', () => {
    expect(panCompareViewport({ scale: 2, x: 10, y: 20, pointerX: 100, pointerY: 80 }, { x: 135, y: 60 })).toEqual({ scale: 2, x: 45, y: 0 });
  });
});
