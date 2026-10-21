import { describe, it, expect } from 'vitest';
import { trayMenuPosition } from './trayPosition.js';
describe('tray menu position in screen DIP', () => {
  const size = { width: 260, height: 180 };
  const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  it.each([
    [
      { x: 1500, y: 1060 },
      { x: 0, y: 0, width: 1920, height: 1040 },
      { x: 1488, y: 860 },
    ],
    [
      { x: 1800, y: 1060 },
      { x: 0, y: 0, width: 1920, height: 1040 },
      { x: 1552, y: 860 },
    ],
    [
      { x: 600, y: 20 },
      { x: 0, y: 40, width: 1920, height: 1040 },
      { x: 588, y: 40 },
    ],
    [
      { x: 20, y: 500 },
      { x: 40, y: 0, width: 1880, height: 1080 },
      { x: 40, y: 488 },
    ],
    [
      { x: 1900, y: 500 },
      { x: 0, y: 0, width: 1880, height: 1080 },
      { x: 1620, y: 488 },
    ],
    [{ x: 400, y: 400 }, bounds, { x: 388, y: 388 }],
  ])('places and clamps at %j', (point, workArea, expected) => {
    expect(trayMenuPosition(point, size, bounds, workArea)).toEqual(expected);
  });
  it.each([1, 1.25, 1.5, 2])(
    'uses DIP unchanged on a negative secondary display at scale %s',
    (scaleFactor) => {
      const display = {
        bounds: { x: -1536, y: -864, width: 1536, height: 864 },
        workArea: { x: -1536, y: -864, width: 1536, height: 824 },
        scaleFactor,
      };
      expect(trayMenuPosition({ x: -300, y: -20 }, size, display.bounds, display.workArea)).toEqual(
        { x: -312, y: -220 },
      );
    },
  );
});
