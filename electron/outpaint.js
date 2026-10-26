import fs from 'node:fs/promises';
import sharp from 'sharp';
import { crc32 } from 'node:zlib';
import { buildInpaint } from './inpaint.js';
import { readNovelAIMetadata } from './metadata.js';
import {
  EMPTY_EDGES,
  outpaintBlocks,
  outpaintCanvas,
  outpaintCenter,
  outpaintDistance,
  outpaintSize,
} from '../src/shared/outpaint.ts';

export function outpaintSteps(source, edges, mode, fullSize = false) {
  const canvas = outpaintCanvas(source, edges);
  if (mode === 'whole') {
    const rect = { x: 0, y: 0, ...canvas };
    return [
      {
        rect,
        ...outpaintSize(canvas.width, canvas.height, fullSize),
        edges,
        applied: edges,
        fullSize,
      },
    ];
  }
  if (mode !== 'edges') throw Object.assign(new Error('扩图画法无效'), { code: 'invalid_input' });
  return outpaintBlocks(source, edges).map((block) => ({
    ...block,
    edges: { ...EMPTY_EDGES, [block.edge]: edges[block.edge] },
    fullSize: false,
  }));
}

const read = (source) => (Buffer.isBuffer(source) ? source : fs.readFile(source));

// Copy rows instead of alpha-compositing, preserving even stealth carrier pixels exactly.
export async function expandOutpaint(source, edges, transparent = true) {
  const original = await sharp(await read(source))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = outpaintCanvas(original.info, edges);
  const data = Buffer.alloc(width * height * 4, transparent ? 0 : 255);
  for (let y = 0; y < original.info.height; y++)
    original.data.copy(
      data,
      ((y + edges.top) * width + edges.left) * 4,
      y * original.info.width * 4,
      (y + 1) * original.info.width * 4,
    );
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

export async function outpaintMask(sourceSize, edges, rect) {
  const data = Buffer.alloc(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++)
    for (let x = 0; x < rect.width; x++)
      if (outpaintDistance(x + rect.x, y + rect.y, sourceSize, edges) < 8)
        data[(y * rect.width + x) * 4 + 3] = 255;
  return (
    await sharp(data, { raw: { width: rect.width, height: rect.height, channels: 4 } })
      .png()
      .toBuffer()
  ).toString('base64');
}

export async function buildOutpaint(
  project,
  source,
  originalSize,
  applied,
  step,
  library,
  options = {},
) {
  const sourceSize = await sharp(await read(source)).metadata();
  const canvas = await expandOutpaint(source, step.edges);
  const mask = await outpaintMask(sourceSize, step.edges, step.rect);
  const prepared = await buildInpaint(
    project,
    canvas,
    { rect: step.rect, fullSize: step.fullSize, strength: 1 },
    library,
    {
      ...options,
      size: { width: step.width, height: step.height },
      mask,
      transformCenter: (center) => outpaintCenter(center, originalSize, applied, step.rect),
    },
  );
  return { ...prepared, canvas, mask };
}

export async function compositeOutpaint(canvas, generated, sourceSize, step) {
  const meta = await sharp(generated).metadata();
  if (meta.format !== 'png' || meta.width !== step.width || meta.height !== step.height)
    throw new Error('扩图结果尺寸或格式不匹配');
  const original = await sharp(canvas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = await sharp(generated)
    .removeAlpha()
    .resize(step.rect.width, step.rect.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  for (let y = 0; y < step.rect.height; y++)
    for (let x = 0; x < step.rect.width; x++) {
      const xx = x + step.rect.x,
        yy = y + step.rect.y;
      const distance = outpaintDistance(xx, yy, sourceSize, step.edges);
      if (distance >= 8) continue;
      const weight = distance < 0 ? 1 : (8 - distance) / 9;
      const target = (yy * original.info.width + xx) * 4,
        from = (y * step.rect.width + x) * 4;
      for (let c = 0; c < 4; c++)
        original.data[target + c] = Math.round(
          original.data[target + c] * (1 - weight) + pixels[from + c] * weight,
        );
      if (distance < 0) original.data[target + 3] = 255;
    }
  return sharp(original.data, { raw: original.info }).png().toBuffer();
}

export async function restoreOutpaintMetadata(source, pixels) {
  const bytes = await read(source);
  const metadata = await readNovelAIMetadata('', bytes);
  const text = JSON.parse(metadata.extra_json).pngText;
  const chunks = Object.entries(text).map(([key, value]) => {
    const content = Buffer.from(`${key}\0\0\0\0\0${value}`, 'utf8');
    const body = Buffer.concat([Buffer.from('iTXt'), content]);
    const length = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    length.writeUInt32BE(content.length);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  });
  return Buffer.concat([pixels.subarray(0, -12), ...chunks, pixels.subarray(-12)]);
}
