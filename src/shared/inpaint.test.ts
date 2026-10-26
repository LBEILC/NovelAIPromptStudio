import { expect, it } from 'vitest';
import { autoInpaintRect, inpaintSize, INPAINT_PRESETS } from './inpaint';

it('selects maximum free context, expands large masks and clamps at image edges', () => {
  for (const p of INPAINT_PRESETS) {
    const r = autoInpaintRect(
      { x: 1500, y: 1500, width: p.width / 8, height: p.height / 8 },
      { width: 4096, height: 4096 },
    );
    expect([r.width, r.height]).toEqual([p.width, p.height]);
  }
  expect(
    autoInpaintRect({ x: 1000, y: 1000, width: 1500, height: 1500 }, { width: 4096, height: 4096 }),
  ).toEqual({ x: 936, y: 936, width: 1628, height: 1628 });
  expect(
    autoInpaintRect({ x: 0, y: 0, width: 20, height: 20 }, { width: 2048, height: 2048 }),
  ).toEqual({ x: 0, y: 0, width: 1024, height: 1024 });
  expect(
    autoInpaintRect({ x: 400, y: 300, width: 20, height: 20 }, { width: 512, height: 384 }),
  ).toEqual({ x: 0, y: 0, width: 512, height: 384 });
});

it('enlarges, aligns the 80% band, reduces and rounds original dimensions', () => {
  expect(inpaintSize(256, 256)).toEqual({ width: 1024, height: 1024 });
  expect(inpaintSize(832, 1216)).toEqual({ width: 832, height: 1216 });
  expect(inpaintSize(900, 1000)).toEqual({ width: 896, height: 960 });
  expect(inpaintSize(1000, 1000)).toEqual({ width: 960, height: 960 });
  expect(inpaintSize(1024, 1024)).toEqual({ width: 1024, height: 1024 });
  expect(inpaintSize(32, 30000)).toEqual({ width: 64, height: 29952 });
  expect(inpaintSize(1000, 1000, true)).toEqual({ width: 1024, height: 1024 });
  expect(inpaintSize(2048, 2048)).toEqual({ width: 1024, height: 1024 });
  expect(inpaintSize(830, 1200, true)).toEqual({ width: 832, height: 1216 });
  expect(inpaintSize(2100, 2048, true)).toEqual({ width: 2112, height: 2048 });
  expect(() => inpaintSize(0, 10)).toThrow();
});
