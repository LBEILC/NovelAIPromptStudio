import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { prepareBaseImage, storeBaseImage } from './baseImage.js';
import { buildGenerationRequest, estimateGeneration } from './generation.js';
import { readNovelAIMetadata } from './metadata.js';

it('copies base images, clears alpha carriers and preserves transparency only for V5', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'base-image-'));
  try {
    const source = path.join(dir, 'synthetic.png');
    await sharp(Buffer.from([10, 20, 30, 0, 50, 60, 70, 254]), {
      raw: { width: 2, height: 1, channels: 4 },
    })
      .png()
      .toFile(source);
    const stored = await storeBaseImage(source, dir);
    await fs.unlink(source);
    expect(stored.path).not.toBe(source);
    const v5 = Buffer.from(
      await prepareBaseImage(stored.path, 2, 1, 'nai-diffusion-5-full'),
      'base64',
    );
    const pixels = await sharp(v5).ensureAlpha().raw().toBuffer();
    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBe(255);
    const v45 = Buffer.from(
      await prepareBaseImage(stored.path, 64, 128, 'nai-diffusion-4-5-full'),
      'base64',
    );
    expect(await sharp(v45).metadata()).toMatchObject({ width: 64, height: 128, hasAlpha: false });
    expect([...(await sharp(v45).raw().toBuffer())].slice(0, 3)).toEqual([255, 255, 255]);
    expect(v5.includes(Buffer.from('tEXt'))).toBe(false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

it('only accepts explicit image edits and uses paired seeds and strength pricing', () => {
  const raw = {
    width: 832,
    height: 1216,
    steps: 23,
    scale: 7,
    image: 'stale',
    strength: 0.1,
    noise: 0.9,
    upscaled_enhance: true,
  };
  const normal = buildGenerationRequest(raw, 'nai-diffusion-5-full');
  expect(normal.parameters).not.toHaveProperty('image');
  expect(normal.parameters).not.toHaveProperty('strength');
  const request = buildGenerationRequest(raw, 'nai-diffusion-5-full', {
    action: 'img2img',
    image: 'managed',
    strength: 0.7,
    noise: 0,
    seed: 0,
  });
  expect(request.parameters).toMatchObject({
    seed: 1,
    extra_noise_seed: 0,
    strength: 0.7,
    noise: 0,
    color_correct: false,
  });
  expect(request.parameters).not.toHaveProperty('upscaled_enhance');
  expect(estimateGeneration(request, null).anlas).toBe(18);
});

it('removes a real stealth payload before resizing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'base-stealth-'));
  try {
    const source = path.join(dir, 'synthetic.png');
    const pixels = Buffer.alloc(128 * 128 * 4, 255);
    const payload = Buffer.from(
      JSON.stringify({ Comment: JSON.stringify({ prompt: 'synthetic hidden shape', seed: 123 }) }),
    );
    const length = Buffer.alloc(4);
    length.writeUInt32BE(payload.length * 8);
    const hidden = Buffer.concat([Buffer.from('stealth_pnginfo'), length, payload]);
    for (let i = 0; i < hidden.length * 8; i++)
      pixels[((i % 128) * 128 + Math.floor(i / 128)) * 4 + 3] =
        254 | ((hidden[Math.floor(i / 8)] >> (7 - (i % 8))) & 1);
    await sharp(pixels, { raw: { width: 128, height: 128, channels: 4 } })
      .png()
      .toFile(source);
    expect((await readNovelAIMetadata(source)).prompt_raw).toBe('synthetic hidden shape');
    const cleaned = path.join(dir, 'cleaned.png');
    await fs.writeFile(
      cleaned,
      Buffer.from(await prepareBaseImage(source, 128, 128, 'nai-diffusion-5-full'), 'base64'),
    );
    expect((await readNovelAIMetadata(cleaned)).prompt_raw).toBe('');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
