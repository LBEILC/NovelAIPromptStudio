import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { blurredMedia } from './blurMedia.js';
import { mediaUrl } from '../src/lib/imageStage.js';

it('preserves original media URLs and adds blur only when requested', () => {
  const file = 'C:\\synthetic folder\\image #1.png';
  const original = `novelai-media://file?path=${encodeURIComponent(file)}`;
  expect(mediaUrl(file)).toBe(original);
  expect(mediaUrl(file, { blur: false })).toBe(original);
  expect(mediaUrl(file, { blur: true })).toBe(`${original}&blur=1`);
  expect(mediaUrl('', { blur: true })).toBe('');
});
it('preserves dimensions and transparency in blurred WebP, reuses it and invalidates changed or missing sources', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-blur-'));
  try {
    const source = path.join(root, 'source.png'),
      cache = path.join(root, 'blurred');
    const width = 1664,
      height = 2432;
    const pixels = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const value = ((i % width) + Math.floor(i / width)) % 2 ? 255 : 0;
      pixels.set([value, value, value, 128], i * 4);
    }
    await sharp(pixels, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(source);
    const original = await fs.readFile(source);
    const start = performance.now();
    const [first, parallel] = await Promise.all([
      blurredMedia(source, cache),
      blurredMedia(source, cache),
    ]);
    console.log(
      `First blurred image 1664x2432: ${(performance.now() - start).toFixed(2)} ms, ${(await fs.stat(first)).size} bytes`,
    );
    expect(first).toBe(parallel);
    const output = await fs.readFile(first);
    const metadata = await sharp(output).metadata();
    expect([metadata.width, metadata.height]).toEqual([width, height]);
    expect(metadata.format).toBe('webp');
    expect(metadata.hasAlpha).toBe(true);
    const blurred = await sharp(output).ensureAlpha().raw().toBuffer();
    let difference = 0;
    for (let i = 0; i < pixels.length; i += 4) difference += Math.abs(pixels[i] - blurred[i]);
    expect(difference / (width * height)).toBeGreaterThan(100);
    expect(Math.abs(blurred[3] - 128)).toBeLessThanOrEqual(3);
    expect(await fs.readFile(first)).not.toEqual(original);
    expect(await fs.readFile(source)).toEqual(original);
    expect(await blurredMedia(source, cache)).toBe(first);
    expect(await fs.readdir(cache)).toEqual([path.basename(first)]);
    await sharp({ create: { width: 80, height: 40, channels: 4, background: '#abcdef80' } })
      .png()
      .toFile(source);
    expect(await blurredMedia(source, cache)).not.toBe(first);
    await fs.unlink(source);
    await expect(blurredMedia(source, cache)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
