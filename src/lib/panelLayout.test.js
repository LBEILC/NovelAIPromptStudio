import { describe, expect, it } from 'vitest';
import {
  normalizePanelWidth,
  panelWidthForViewport,
  readPanelBoolean,
  readPanelWidth,
  writePanelBoolean,
  writePanelWidth,
} from './panelLayout.js';

describe('panel layout sizing', () => {
  it('converts the preferred viewport ratio to a stable pixel width', () => {
    expect(panelWidthForViewport(1280, .34, 280, 560)).toBe(435);
    expect(panelWidthForViewport(1280, .28, 340, 560)).toBe(358);
  });

  it('respects the panel minimum and maximum widths', () => {
    expect(panelWidthForViewport(800, .28, 340, 560)).toBe(340);
    expect(panelWidthForViewport(1704, .34, 280, 560)).toBe(560);
  });

  it('normalizes persisted pixel widths and rejects missing values', () => {
    expect(normalizePanelWidth('427px', 280, 560)).toBe(427);
    expect(normalizePanelWidth('900px', 280, 560)).toBe(560);
    expect(normalizePanelWidth(null, 280, 560)).toBeUndefined();
    expect(normalizePanelWidth('invalid', 280, 560)).toBeUndefined();
  });

  it('reads and writes a remembered width with safe fallbacks', () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };

    expect(readPanelWidth(storage, 'panel', 420, 280, 560)).toBe(420);
    expect(writePanelWidth(storage, 'panel', '488px', 280, 560)).toBe(488);
    expect(readPanelWidth(storage, 'panel', 420, 280, 560)).toBe(488);
  });

  it('keeps widths usable when storage access fails', () => {
    const unavailableStorage = {
      getItem: () => { throw new Error('unavailable'); },
      setItem: () => { throw new Error('unavailable'); },
    };

    expect(readPanelWidth(unavailableStorage, 'panel', 420, 280, 560)).toBe(420);
    expect(writePanelWidth(unavailableStorage, 'panel', 450, 280, 560)).toBe(450);
  });

  it('persists explicit expanded and pinned boolean values', () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };

    expect(readPanelBoolean(storage, 'expanded', true)).toBe(true);
    expect(writePanelBoolean(storage, 'expanded', false)).toBe(false);
    expect(readPanelBoolean(storage, 'expanded', true)).toBe(false);
    expect(writePanelBoolean(storage, 'pinned', true)).toBe(true);
    expect(readPanelBoolean(storage, 'pinned', false)).toBe(true);
  });

  it('falls back safely for missing, invalid, or unavailable boolean state', () => {
    const unavailableStorage = {
      getItem: () => { throw new Error('unavailable'); },
      setItem: () => { throw new Error('unavailable'); },
    };

    expect(readPanelBoolean({ getItem: () => 'invalid' }, 'panel', false)).toBe(false);
    expect(readPanelBoolean(unavailableStorage, 'panel', true)).toBe(true);
    expect(writePanelBoolean(unavailableStorage, 'panel', false)).toBe(false);
  });
});
