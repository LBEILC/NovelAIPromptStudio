import { describe, expect, it } from 'vitest';
import { panelWidthForViewport } from './panelLayout.js';

describe('panel layout sizing', () => {
  it('converts the preferred viewport ratio to a stable pixel width', () => {
    expect(panelWidthForViewport(1280, .34, 280, 560)).toBe(435);
    expect(panelWidthForViewport(1280, .28, 340, 560)).toBe(358);
  });

  it('respects the panel minimum and maximum widths', () => {
    expect(panelWidthForViewport(800, .28, 340, 560)).toBe(340);
    expect(panelWidthForViewport(1704, .34, 280, 560)).toBe(560);
  });
});
