import { describe, expect, it } from 'vitest';
import {
  adjacentRowIndex,
  fallbackRatio,
  layoutLibraryRows,
  rowHeightFromLegacyWidth,
} from './layout';

describe('library justified rows', () => {
  it('fills mixed rows, preserves ratios and does not stretch the final row', () => {
    const ratios = [fallbackRatio, 1.462, 1, fallbackRatio, 2, 1, 0.8, 1];
    const rows = layoutLibraryRows(ratios, 620, 180, 14, 0.5, 2.5);
    expect(rows.length).toBeGreaterThan(1);
    for (const [index, row] of rows.entries()) {
      const width = row.widths.reduce((sum, item) => sum + item, 0) + (row.widths.length - 1) * 14;
      if (index < rows.length - 1) expect(width).toBeCloseTo(620);
      else {
        expect(width).toBeLessThanOrEqual(620);
        expect(row.height).toBeLessThanOrEqual(180);
      }
      row.widths.forEach((item, offset) =>
        expect(item / row.height).toBeCloseTo(ratios[row.start + offset]),
      );
    }
  });
  it('clamps extremes, substitutes unknown dimensions and handles a narrow viewport', () => {
    const rows = layoutLibraryRows([0, NaN, 100, 0.01], 80, 180, 14, 0.5, 2.5);
    expect(rows.flatMap((row) => row.widths.map((width) => width / row.height))).toEqual([
      fallbackRatio,
      fallbackRatio,
      2.5,
      0.5,
    ]);
    expect(layoutLibraryRows([], 600, 180, 14, 0.5, 2.5)).toEqual([]);
    expect(layoutLibraryRows([1], 0, 180, 14, 0.5, 2.5)).toEqual([]);
  });
  it('moves vertically to the closest horizontal center', () => {
    const rows = [
      { start: 0, top: 0, height: 100, widths: [100, 300] },
      { start: 2, top: 114, height: 100, widths: [200, 100, 86] },
    ];
    expect(adjacentRowIndex(rows, 1, 1, 14)).toBe(3);
    expect(adjacentRowIndex(rows, 0, -1, 14)).toBe(0);
  });
  it('converts saved portrait widths to the closest supported height', () => {
    expect(rowHeightFromLegacyWidth(190)).toBe(280);
    expect(rowHeightFromLegacyWidth(1)).toBe(120);
    expect(rowHeightFromLegacyWidth(260)).toBe(360);
  });
  it('partitions twenty thousand images without losing their order', () => {
    const rows = layoutLibraryRows(
      Array.from({ length: 20000 }, (_, i) => [fallbackRatio, 1, 1.462][i % 3]),
      1000,
      180,
      14,
      0.5,
      2.5,
    );
    expect(rows.reduce((sum, row) => sum + row.widths.length, 0)).toBe(20000);
    for (let i = 1; i < rows.length; i++)
      expect(rows[i].start).toBe(rows[i - 1].start + rows[i - 1].widths.length);
  });
});
