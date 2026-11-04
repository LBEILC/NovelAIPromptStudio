import { expect, it } from 'vitest';
import { fitGenerationSize, MAX_GENERATION_AREA } from './generationSize';

it('keeps aligned sizes and snaps upscaled originals to the closest valid ratio', () => {
  expect(fitGenerationSize(832, 1216)).toEqual({ width: 832, height: 1216 });
  expect(fitGenerationSize(1536, 2048)).toEqual({ width: 1536, height: 2048 });
  // 放大过的原图：高 2144 超过单边 2048，先等比缩小，再取比例最接近的 64 倍数
  expect(fitGenerationSize(1467, 2144)).toEqual({ width: 1408, height: 2048 });
  expect(fitGenerationSize(1001, 1467)).toEqual({ width: 1024, height: 1472 });
  expect(fitGenerationSize(1000, 1000)).toEqual({ width: 1024, height: 1024 });
});

it('scales oversized originals into the area and edge limits', () => {
  for (const [w, h] of [
    [2934, 4288],
    [4096, 4096],
    [5000, 800],
    [10, 100000],
  ]) {
    const r = fitGenerationSize(w, h);
    expect(r.width % 64 || r.height % 64).toBe(0);
    expect(r.width * r.height).toBeLessThanOrEqual(MAX_GENERATION_AREA);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(2048);
    expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(64);
  }
  expect(() => fitGenerationSize(0, 100)).toThrow('尺寸无效');
});
