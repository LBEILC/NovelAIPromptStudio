import { describe, expect, it } from 'vitest';
import { hiddenWorkbenchTabSeparatorIds, projectedWorkbenchTabOrder } from './workbenchTabLayout.js';

describe('projectedWorkbenchTabOrder', () => {
  it('matches the visual order used while sorting tabs', () => {
    expect(projectedWorkbenchTabOrder(['a', 'b', 'c', 'd'], 'b', 'd')).toEqual(['a', 'c', 'd', 'b']);
  });
});

describe('hiddenWorkbenchTabSeparatorIds', () => {
  it('hides both sides of the active tab and the trailing separator', () => {
    expect([...hiddenWorkbenchTabSeparatorIds(['a', 'b', 'c', 'd'], 'c')]).toEqual(['c', 'b', 'd']);
  });

  it('hides both sides of the projected drag slot', () => {
    const hidden = hiddenWorkbenchTabSeparatorIds(['a', 'b', 'c', 'd', 'e'], 'a', 'c', 'e');
    expect(hidden.has('e')).toBe(true);
    expect(hidden.has('c')).toBe(true);
  });

  it('uses visual rather than DOM adjacency when a tab moves before the active tab', () => {
    const hidden = hiddenWorkbenchTabSeparatorIds(['a', 'b', 'c', 'd', 'e'], 'e', 'c', 'e');
    expect(hidden.has('d')).toBe(true);
    expect(hidden.has('e')).toBe(true);
  });
});
