import { expect, it } from 'vitest';
import sharp from 'sharp';
import { crc32 } from 'node:zlib';
import {
  EMPTY_EDGES,
  outpaintCanvas,
  outpaintBlocks,
  outpaintCenter,
  outpaintSize,
  recommendOutpaint,
} from '../src/shared/outpaint.ts';
import {
  buildOutpaint,
  expandOutpaint,
  outpaintMask,
  outpaintSteps,
  compositeOutpaint,
  restoreOutpaintMetadata,
} from './outpaint.js';
import { createBlankProject } from './workbench.js';
import { readNovelAIMetadata } from './metadata.js';
import { validateGenerationRequest } from './generation.js';
const size = { width: 512, height: 512 };
const edges = { left: 64, right: 128, top: 64, bottom: 128 };
const png = (width, height, background = '#334455') =>
  sharp({ create: { width, height, channels: 4, background } })
    .png()
    .toBuffer();

it('validates all edge values, doubled dimensions and the absolute canvas limit', () => {
  expect(outpaintCanvas(size, edges)).toEqual({ width: 704, height: 704 });
  for (const invalid of [
    null,
    {},
    EMPTY_EDGES,
    { ...edges, left: -64 },
    { ...edges, top: 1 },
    { ...edges, left: Infinity },
    { ...edges, left: 512 },
  ])
    expect(() => outpaintCanvas(size, invalid)).toThrow();
  expect(outpaintCanvas(size, { ...EMPTY_EDGES, left: 512 })).toEqual({ width: 1024, height: 512 });
  expect(() =>
    outpaintCanvas({ width: 4096, height: 512 }, { ...EMPTY_EDGES, right: 64 }),
  ).toThrow();
});
it('orders strips and retains bounded context across the current canvas', () => {
  expect(outpaintSize(192, 1216)).toEqual({ width: 320, height: 2048 });
  expect(outpaintSize(2560, 1536, true)).toEqual({ width: 2560, height: 1536 });
  const blocks = outpaintBlocks(size, edges);
  expect(blocks.map((b) => b.edge)).toEqual(['left', 'right', 'top', 'bottom']);
  expect(blocks.map((b) => b.rect)).toEqual([
    { x: 0, y: 0, width: 192, height: 512 },
    { x: 448, y: 0, width: 256, height: 512 },
    { x: 0, y: 0, width: 704, height: 192 },
    { x: 0, y: 448, width: 704, height: 256 },
  ]);
  expect(outpaintBlocks(size, { ...EMPTY_EDGES, left: 512 })[0].rect.width).toBe(1024);
  expect(
    outpaintBlocks({ width: 64, height: 64 }, { ...EMPTY_EDGES, top: 64 })[0].rect.height,
  ).toBe(128);
  expect(
    outpaintCenter({ x: 0.5, y: 0.5 }, size, edges, { x: 0, y: 0, width: 704, height: 704 }),
  ).toEqual({ x: 320 / 704, y: 320 / 704 });
  expect(outpaintCenter({ x: 1, y: 0 }, size, edges, blocks[0].rect)).toEqual({ x: 1, y: 0.125 });
  expect(recommendOutpaint(edges, false)).toBe('whole');
  expect(recommendOutpaint(edges, true)).toBe('edges');
  expect(recommendOutpaint({ ...EMPTY_EDGES, left: 64 }, false)).toBe('edges');
});
it('creates alpha selections covering new corners and exactly eight old pixels', async () => {
  const canvas = outpaintCanvas(size, edges);
  const mask = await outpaintMask(size, edges, { x: 0, y: 0, ...canvas });
  const data = await sharp(Buffer.from(mask, 'base64')).raw().toBuffer();
  const alpha = (x, y) => data[(y * canvas.width + x) * 4 + 3];
  for (const point of [
    [0, 0],
    [703, 0],
    [0, 703],
    [703, 703],
    [71, 300],
    [568, 300],
  ])
    expect(alpha(...point)).toBe(255);
  expect(alpha(72, 300)).toBe(0);
  expect(alpha(567, 300)).toBe(0);
});
it('builds mapped inpainting requests with translated centers, ignored references and model transparency', async () => {
  const source = await png(512, 512);
  const project = createBlankProject({ params: { model: 'nai-diffusion-5-full', steps: 23 } });
  project.prompt_structure.characters = [
    { id: 'c', prompt_raw: 'synthetic shape', undesired_raw: '' },
  ];
  project.params.positions = { c: 'C3' };
  project.params.aiPositions = false;
  project.references = { vibes: [{ id: 'unused' }], precise: [], base: null };
  for (const model of ['nai-diffusion-5-full', 'nai-diffusion-5-curated']) {
    project.params.model = model;
    const step = outpaintSteps(size, edges, 'whole')[0];
    const built = await buildOutpaint(project, source, size, edges, step, {});
    expect(() => validateGenerationRequest(built.request)).not.toThrow();
    expect(built.ignored).toEqual(['vibe']);
    expect(built.request.parameters.v4_prompt.caption.char_captions[0].centers[0]).toEqual({
      x: 320 / 704,
      y: 320 / 704,
    });
    const raw = await sharp(Buffer.from(built.request.parameters.image, 'base64'))
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(raw[3]).toBe(model.includes('curated') ? 255 : 0);
  }
});
it.each(['whole', 'edges'])(
  'composites %s without diluting new pixels or resampling old pixels',
  async (mode) => {
    const source = await png(512, 512);
    let result = source;
    for (const step of outpaintSteps(size, edges, mode)) {
      const previous = await sharp(result).metadata();
      const canvas = await expandOutpaint(result, step.edges);
      result = await compositeOutpaint(
        canvas,
        await png(step.width, step.height, '#ee5533'),
        previous,
        step,
      );
    }
    const raw = await sharp(result).raw().toBuffer();
    expect(await sharp(result).metadata()).toMatchObject({ width: 704, height: 704 });
    for (let y = 0; y < 704; y++)
      for (let x = 0; x < 704; x++) {
        const pixel = raw.subarray((y * 704 + x) * 4, (y * 704 + x) * 4 + 4);
        if (x < 64 || x >= 576 || y < 64 || y >= 576) {
          if (pixel[3] !== 255) throw Error('new alpha');
        }
        if (
          x >= 128 &&
          x < 512 &&
          y >= 128 &&
          y < 512 &&
          !pixel.equals(Buffer.from([51, 68, 85, 255]))
        )
          throw Error('old pixels changed');
      }
  },
);
it('keeps generated RGB fully opaque in new regions even for translucent model output', async () => {
  const source = await png(512, 512);
  const step = outpaintSteps(size, { ...EMPTY_EDGES, left: 64 }, 'whole')[0];
  const canvas = await expandOutpaint(source, step.edges);
  const generated = await png(step.width, step.height, { r: 200, g: 100, b: 50, alpha: 0.5 });
  const output = await compositeOutpaint(canvas, generated, size, step);
  const data = await sharp(output).ensureAlpha().raw().toBuffer();
  // Resampling premultiplied channels may round a channel by one, but must not blend with the blank canvas.
  [200, 100, 50].forEach((value, channel) =>
    expect(Math.abs(data[channel] - value)).toBeLessThanOrEqual(1),
  );
  expect(data[3]).toBe(255);
});

it('restores standard and stealth-only metadata after moving the source', async () => {
  const text = {
    Comment: JSON.stringify({ prompt: 'synthetic original', seed: 12, width: 512, height: 512 }),
  };
  const hidden = Buffer.from(JSON.stringify(text));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(hidden.length * 8);
  const payload = Buffer.concat([Buffer.from('stealth_pnginfo'), length, hidden]);
  const data = Buffer.alloc(512 * 512 * 4, 255);
  for (let i = 0; i < payload.length * 8; i++)
    data[((i % 512) * 512 + Math.floor(i / 512)) * 4 + 3] =
      254 | ((payload[Math.floor(i / 8)] >> (7 - (i % 8))) & 1);
  const stealth = await sharp(data, { raw: { ...size, channels: 4 } })
    .png()
    .toBuffer();
  const body = Buffer.concat([Buffer.from('tEXt'), Buffer.from('Comment\0' + text.Comment)]);
  const len = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  len.writeUInt32BE(body.length - 4);
  crc.writeUInt32BE(crc32(body));
  const standard = Buffer.concat([stealth.subarray(0, -12), len, body, crc, stealth.subarray(-12)]);
  for (const source of [stealth, standard]) {
    const result = await restoreOutpaintMetadata(source, await expandOutpaint(source, edges));
    expect(await readNovelAIMetadata('', result)).toMatchObject({
      prompt_raw: 'synthetic original',
      seed: '12',
      width: 704,
      height: 704,
    });
  }
});
