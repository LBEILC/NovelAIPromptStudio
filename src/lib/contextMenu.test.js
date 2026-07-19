import { describe, expect, it } from 'vitest';
import { contextMenuPosition, isTextEditingTarget } from './contextMenu.js';

describe('renderer context menu helpers', () => {
  it('only treats editable text controls as text menu targets', () => {
    const input = { closest: () => ({ type: 'text', matches: (selector) => selector.startsWith('textarea') ? false : false }) };
    expect(isTextEditingTarget(input)).toBe(true);
    const range = { closest: () => ({ type: 'range', matches: () => false }) };
    expect(isTextEditingTarget(range)).toBe(false);
  });

  it('uses element bounds for keyboard-triggered menus', () => {
    const currentTarget = { getBoundingClientRect: () => ({ left: 100, top: 40, width: 200, height: 30 }) };
    expect(contextMenuPosition({ clientX: 0, clientY: 0, currentTarget })).toEqual({ x: 124, y: 68 });
  });
});
