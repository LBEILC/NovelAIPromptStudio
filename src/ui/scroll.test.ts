import { expect, it } from 'vitest';
import { scrollThumbGeometry } from './useScrollArea';

it('uses the full virtual content extent and lands exactly at the bottom', () => {
  const first = scrollThumbGeometry(600, 60000, 0, 3, 28);
  const last = scrollThumbGeometry(600, 60000, 59400, 3, 28);
  expect(first.size).toBe(28);
  expect(first.offset).toBe(3);
  expect(last.offset + last.size).toBe(597);
  expect(last.range).toBe(59400);
});
it('excludes pinned headers and footers and hides when content fits', () => {
  const end = scrollThumbGeometry(600, 1200, 600, 3, 28, 30, 56);
  expect(end.offset + end.size).toBe(541);
  expect(scrollThumbGeometry(600, 500, 0, 3, 28).visible).toBe(false);
  expect(scrollThumbGeometry(0, 1200, 0, 3, 28).visible).toBe(false);
});
