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
it('creates a tiny transparent PNG asynchronously, reuses it and invalidates changed or missing sources', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-blur-'));
  try {
    const source = path.join(root, 'source.png'),
      cache = path.join(root, 'blurred');
    await sharp({ create: { width: 832, height: 1216, channels: 4, background: '#597c9a80' } })
      .png()
      .toFile(source);
    const original = await fs.readFile(source);
    const start = performance.now();
    const [first, parallel] = await Promise.all([
      blurredMedia(source, cache),
      blurredMedia(source, cache),
    ]);
    console.log(`First blurred image: ${(performance.now() - start).toFixed(2)} ms`);
    expect(first).toBe(parallel);
    const metadata = await sharp(first).metadata();
    expect(Math.max(metadata.width, metadata.height)).toBe(24);
    expect(metadata.format).toBe('png');
    expect(metadata.hasAlpha).toBe(true);
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
