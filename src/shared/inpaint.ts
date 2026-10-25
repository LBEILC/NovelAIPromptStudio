export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const INPAINT_PRESETS: readonly {
  id: '1:1' | '2:3' | '3:2' | '9:16' | '16:9';
  width: number;
  height: number;
}[] = [
  { id: '1:1', width: 1024, height: 1024 },
  { id: '2:3', width: 832, height: 1216 },
  { id: '3:2', width: 1216, height: 832 },
  { id: '9:16', width: 768, height: 1344 },
  { id: '16:9', width: 1344, height: 768 },
];

export function inpaintSize(width: number, height: number, fullSize = false) {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) throw new Error('尺寸无效');
  if (fullSize)
    return {
      width: Math.max(64, Math.round(width / 64) * 64),
      height: Math.max(64, Math.round(height / 64) * 64),
    };
  const area = width * height;
  // Official largestValidWithinPixelCount retains areas >= 80% of the limit.
  // Larger crops are reduced first to keep focused generation within one MP.
  if (area >= 0.8 * 1048576 && area <= 1048576) return { width, height };
  const scale = Math.sqrt(1048576 / area);
  return {
    width: Math.max(64, Math.floor(Math.floor(width * scale) / 64) * 64),
    height: Math.max(64, Math.floor(Math.floor(height * scale) / 64) * 64),
  };
}

export function autoInpaintRect(mask: Rect, image: { width: number; height: number }): Rect {
  const ratio = mask.width / mask.height;
  const preset = INPAINT_PRESETS.reduce((best, item) =>
    Math.abs(Math.log(item.width / item.height / ratio)) <
    Math.abs(Math.log(best.width / best.height / ratio))
      ? item
      : best,
  );
  const width = Math.min(image.width, Math.max(preset.width, Math.ceil(mask.width + 128)));
  const height = Math.min(image.height, Math.max(preset.height, Math.ceil(mask.height + 128)));
  return {
    x: Math.max(0, Math.min(image.width - width, Math.round(mask.x + mask.width / 2 - width / 2))),
    y: Math.max(
      0,
      Math.min(image.height - height, Math.round(mask.y + mask.height / 2 - height / 2)),
    ),
    width,
    height,
  };
}

export const INPAINT_MODELS = Object.freeze({
  'nai-diffusion-5-full': 'nai-diffusion-5-full-inpainting',
  'nai-diffusion-5-full-medium': 'nai-diffusion-5-full-medium-inpainting',
  'nai-diffusion-5-curated': 'nai-diffusion-4-5-curated-inpainting',
  'nai-diffusion-4-5-full': 'nai-diffusion-4-5-full-inpainting',
  'nai-diffusion-4-5-curated': 'nai-diffusion-4-5-curated-inpainting',
  'nai-diffusion-4-full': 'nai-diffusion-4-full-inpainting',
  'nai-diffusion-4-curated-preview': 'nai-diffusion-4-curated-inpainting',
});
