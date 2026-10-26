import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { inpaintSize, INPAINT_MODELS } from '../src/shared/inpaint.ts';
import { cleanBaseImage } from './baseImage.js';
import { buildProjectRequest } from './parameterRequest.js';
import { CommandError } from './commands/registry.js';

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const invalid = (message) => {
  throw new CommandError('invalid_input', message);
};
export function validateRect(rect, image) {
  if (
    !rect ||
    !['x', 'y', 'width', 'height'].every((k) => Number.isSafeInteger(rect[k])) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width < 64 ||
    rect.height < 64 ||
    rect.x + rect.width > image.width ||
    rect.y + rect.height > image.height
  )
    invalid('重绘范围无效');
}

export async function prepareInpaintMask(mask, rect, size) {
  if (
    typeof mask !== 'string' ||
    mask.length > 140 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(mask)
  )
    invalid('遮罩必须是 PNG');
  const bytes = Buffer.from(mask, 'base64');
  if (!bytes.subarray(0, 8).equals(PNG)) invalid('遮罩必须是 PNG');
  const image = sharp(bytes);
  const meta = await image.metadata();
  if (meta.width !== rect.width || meta.height !== rect.height) invalid('遮罩尺寸与重绘范围不一致');
  const rgba = await image.ensureAlpha().raw().toBuffer();
  if (!rgba.some((v, i) => i % 4 === 3 && v > 127)) invalid('先涂上要重画的地方');
  const width = Math.max(1, Math.floor(size.width / 8));
  const height = Math.max(1, Math.floor(size.height / 8));
  const small = await sharp(rgba, { raw: { width: rect.width, height: rect.height, channels: 4 } })
    .resize(width, height, { fit: 'fill', kernel: 'nearest' })
    .raw()
    .toBuffer();
  const low = Buffer.alloc(width * height);
  for (let i = 0; i < low.length; i++) low[i] = small[i * 4 + 3] > 127 ? 255 : 0;
  if (!low.some(Boolean)) invalid('先涂上要重画的地方');
  const request = await sharp(low, { raw: { width, height, channels: 1 } })
    .resize(size.width, size.height, { fit: 'fill', kernel: 'nearest' })
    .toColourspace('srgb')
    .ensureAlpha()
    .png()
    .toBuffer();
  return { bytes, low, width, height, request };
}

export async function buildInpaint(project, sourcePath, operation, library, options = {}) {
  const source = await sharp(sourcePath).metadata();
  validateRect(operation.rect, source);
  const strength = operation.strength ?? 1;
  if (!Number.isFinite(strength) || strength < 0.01 || strength > 1) invalid('重绘强度无效');
  const size =
    options.size ?? inpaintSize(operation.rect.width, operation.rect.height, operation.fullSize);
  if (size.width > 2048 || size.height > 2048 || size.width * size.height > 1536 * 2048)
    throw new Error('重绘尺寸超过上限');
  const draft = structuredClone(project);
  const ignored = [];
  if (draft.references?.vibes?.length) ignored.push('vibe');
  if (draft.references?.precise?.length) ignored.push('precise');
  if (draft.references?.base) ignored.push('base');
  draft.references = { vibes: [], precise: [], base: null };
  Object.assign(draft.metadata, size);
  const prepared = await buildProjectRequest(draft, library, options);
  const request = prepared.request;
  request.model = INPAINT_MODELS[request.model];
  if (!request.model) throw new Error('这个模型不能局部重绘');
  request.action = 'infill';
  const p = request.parameters;
  p.image_format = 'png';
  p.add_original_image = false;
  if (!request.model.startsWith('nai-diffusion-5-')) {
    delete p.straight_alpha;
    delete p.tag_hint_transparent_background;
  }
  if (strength !== 1) p.img2img = { strength, color_correct: true };
  for (const key of ['v4_prompt', 'v4_negative_prompt'])
    for (const character of p[key]?.caption?.char_captions || [])
      character.centers = character.centers.map((c) =>
        options.transformCenter
          ? options.transformCenter(c)
          : {
              x: Math.max(
                0,
                Math.min(1, (c.x * source.width - operation.rect.x) / operation.rect.width),
              ),
              y: Math.max(
                0,
                Math.min(1, (c.y * source.height - operation.rect.y) / operation.rect.height),
              ),
            },
      );
  let crop = sharp(await cleanBaseImage(sourcePath)).extract({
    left: operation.rect.x,
    top: operation.rect.y,
    width: operation.rect.width,
    height: operation.rect.height,
  });
  if (!request.model.startsWith('nai-diffusion-5-')) crop = crop.flatten({ background: '#ffffff' });
  p.image = (
    await crop.resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer()
  ).toString('base64');
  if (options.mask !== undefined)
    p.mask = (await prepareInpaintMask(options.mask, operation.rect, size)).request.toString(
      'base64',
    );
  return { ...prepared, ...size, ignored, scale: size.width / operation.rect.width };
}

export async function storeInpaintMask(mask, directory) {
  const bytes = Buffer.from(mask, 'base64');
  const id = crypto.createHash('sha256').update(bytes).digest('hex');
  const file = path.join(directory, 'inpaint-masks', `${id}.png`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return id;
}

// A finite box blur preserves exact zeros outside the feathered selection.
function blur(input, width, height, radius) {
  let data = Float64Array.from(input);
  for (const horizontal of [true, false]) {
    const output = new Float64Array(data.length);
    const length = horizontal ? width : height,
      lines = horizontal ? height : width;
    const at = (line, i) => (horizontal ? line * width + i : i * width + line);
    for (let line = 0; line < lines; line++) {
      let sum = 0;
      for (let i = -radius; i <= radius; i++)
        sum += data[at(line, Math.max(0, Math.min(length - 1, i)))];
      for (let i = 0; i < length; i++) {
        output[at(line, i)] = sum / (2 * radius + 1);
        sum +=
          data[at(line, Math.min(length - 1, i + radius + 1))] -
          data[at(line, Math.max(0, i - radius))];
      }
    }
    data = output;
  }
  return data;
}

export async function compositeInpaint(sourcePath, generated, operation, mask) {
  if (!generated.subarray(0, 8).equals(PNG)) throw new Error('重绘结果不是 PNG');
  const size = operation.generated;
  const metadata = await sharp(generated).metadata();
  if (metadata.width !== size.width || metadata.height !== size.height)
    throw new Error('重绘结果尺寸不匹配');
  const prepared = await prepareInpaintMask(mask, operation.rect, size);
  const expanded = Buffer.alloc(prepared.low.length);
  for (let y = 0; y < prepared.height; y++)
    for (let x = 0; x < prepared.width; x++) {
      let selected = false;
      for (let dy = -4; dy <= 4 && !selected; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (
            xx >= 0 &&
            yy >= 0 &&
            xx < prepared.width &&
            yy < prepared.height &&
            prepared.low[yy * prepared.width + xx]
          ) {
            selected = true;
            break;
          }
        }
      expanded[y * prepared.width + x] = selected ? 255 : 0;
    }
  const large = await sharp(expanded, {
    raw: { width: prepared.width, height: prepared.height, channels: 1 },
  })
    .resize(size.width, size.height, { fit: 'fill', kernel: 'nearest' })
    .greyscale()
    .raw()
    .toBuffer();
  const feather = blur(blur(large, size.width, size.height, 20), size.width, size.height, 20);
  const rect = operation.rect;
  const weights = await sharp(Buffer.from(feather.map((v) => Math.round(v))), {
    raw: { width: size.width, height: size.height, channels: 1 },
  })
    .resize(rect.width, rect.height, { fit: 'fill', kernel: 'linear' })
    .greyscale()
    .raw()
    .toBuffer();
  const originalBytes = await fs.readFile(sourcePath);
  const original = await sharp(originalBytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const patch = await sharp(generated)
    .ensureAlpha()
    .resize(rect.width, rect.height, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer();
  for (let y = 0; y < rect.height; y++)
    for (let x = 0; x < rect.width; x++) {
      const pixel = y * rect.width + x,
        weight = weights[pixel] / 255;
      if (!weight) continue;
      const offset = ((y + rect.y) * original.info.width + x + rect.x) * 4;
      for (let c = 0; c < 4; c++)
        original.data[offset + c] = Math.round(
          original.data[offset + c] * (1 - weight) + patch[pixel * 4 + c] * weight,
        );
    }
  const pixels = await sharp(original.data, { raw: original.info }).png().toBuffer();
  const texts = [];
  if (originalBytes.subarray(0, 8).equals(PNG))
    for (let offset = 8; offset + 12 <= originalBytes.length; ) {
      const length = originalBytes.readUInt32BE(offset);
      if (offset + length + 12 > originalBytes.length) throw new Error('源图 PNG 数据损坏');
      if (
        ['tEXt', 'zTXt', 'iTXt'].includes(originalBytes.toString('ascii', offset + 4, offset + 8))
      )
        texts.push(originalBytes.subarray(offset, offset + length + 12));
      offset += length + 12;
    }
  return Buffer.concat([pixels.subarray(0, -12), ...texts, pixels.subarray(-12)]);
}
