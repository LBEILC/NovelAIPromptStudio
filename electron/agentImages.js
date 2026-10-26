import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { defaultInpaintRect } from '../src/shared/inpaint.ts';
import { validateRect } from './inpaint.js';
import { CommandError } from './commands/registry.js';

const invalid = (message) => {
  throw new CommandError('invalid_input', message);
};
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const svg = (width, height, body) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`,
  );
const extract = (r) => ({ left: r.x, top: r.y, width: r.width, height: r.height });

export function maskStats(data, width, height, offset = { x: 0, y: 0 }) {
  let left = width,
    top = height,
    right = -1,
    bottom = -1,
    count = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] <= 127) continue;
      count++;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  return {
    maskBounds: count
      ? { x: left + offset.x, y: top + offset.y, width: right - left + 1, height: bottom - top + 1 }
      : null,
    count,
  };
}

export async function croppedMaskInfo(mask, rect) {
  if (!mask) return { maskBounds: null, maskRatio: 0 };
  try {
    const bytes = Buffer.from(mask, 'base64');
    const meta = await sharp(bytes).metadata();
    if (
      !bytes.subarray(0, 8).equals(png) ||
      meta.width !== rect.width ||
      meta.height !== rect.height
    )
      invalid('遮罩尺寸或 PNG 格式无效');
    const alpha = await sharp(bytes).ensureAlpha().extractChannel(3).raw().toBuffer();
    const { maskBounds, count } = maskStats(alpha, rect.width, rect.height, rect);
    return { maskBounds, maskRatio: count / (rect.width * rect.height) };
  } catch (error) {
    if (error.code === 'invalid_input') throw error;
    invalid('遮罩 PNG 无效');
  }
}

export async function currentMaskInput(input, state, sourcePath) {
  const image = await sharp(sourcePath).metadata();
  const rect = input.rect ?? state.rect;
  validateRect(rect, image);
  const { maskBounds, maskRatio } = await croppedMaskInfo(state.mask, state.rect);
  if (!maskBounds) invalid('先涂上要重画的地方');
  if (
    rect.x > maskBounds.x ||
    rect.y > maskBounds.y ||
    rect.x + rect.width < maskBounds.x + maskBounds.width ||
    rect.y + rect.height < maskBounds.y + maskBounds.height
  )
    invalid(`重绘范围必须包含全部遮罩：${JSON.stringify(maskBounds)}`);
  let mask = state.mask;
  if (['x', 'y', 'width', 'height'].some((key) => rect[key] !== state.rect[key])) {
    const selected = await sharp(Buffer.from(mask, 'base64'))
      .extract({
        left: maskBounds.x - state.rect.x,
        top: maskBounds.y - state.rect.y,
        width: maskBounds.width,
        height: maskBounds.height,
      })
      .png()
      .toBuffer();
    mask = (
      await sharp({
        create: {
          width: rect.width,
          height: rect.height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([{ input: selected, left: maskBounds.x - rect.x, top: maskBounds.y - rect.y }])
        .png()
        .toBuffer()
    ).toString('base64');
  }
  return {
    ...state,
    ...input,
    imageId: state.imageId,
    rect,
    mask,
    maskBounds,
    maskRatio: (maskRatio * state.rect.width * state.rect.height) / (rect.width * rect.height),
  };
}

export async function resolveAgentMask(input, sourcePath) {
  const image = await sharp(sourcePath).metadata();
  const { width, height } = image;
  let alpha;
  if (input.shapes !== undefined) {
    if (!Array.isArray(input.shapes) || !input.shapes.length)
      invalid('shapes 必须包含至少一个形状');
    const grow = input.grow ?? 0;
    if (!Number.isFinite(grow) || grow < 0 || grow > 128) invalid('grow 必须在 0–128 之间');
    const finite = (s, keys) => keys.every((k) => Number.isFinite(s[k]));
    const shapes = input.shapes
      .map((s) => {
        if (!s || typeof s !== 'object') invalid('形状无效');
        if (
          s.type === 'rect' &&
          finite(s, ['x', 'y', 'width', 'height']) &&
          s.width > 0 &&
          s.height > 0
        )
          return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"/>`;
        if (s.type === 'ellipse' && finite(s, ['cx', 'cy', 'rx', 'ry']) && s.rx > 0 && s.ry > 0)
          return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"/>`;
        if (
          s.type === 'polygon' &&
          Array.isArray(s.points) &&
          s.points.length >= 3 &&
          s.points.length <= 64 &&
          s.points.every(
            (p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v)),
          )
        )
          return `<polygon points="${s.points.map((p) => p.join(',')).join(' ')}"/>`;
        invalid('形状坐标、尺寸或多边形点数无效');
      })
      .join('');
    alpha = await sharp(
      svg(
        width,
        height,
        `<g fill="white" stroke="white" stroke-width="${grow * 2}" stroke-linejoin="round">${shapes}</g>`,
      ),
    )
      .ensureAlpha()
      .extractChannel(3)
      .raw()
      .toBuffer();
  } else {
    try {
      const stat = await fs.stat(input.maskPath);
      if (!stat.isFile() || stat.size > 50 * 1024 * 1024)
        invalid('遮罩文件必须是小于 50 MB 的 PNG');
      const bytes = await fs.readFile(input.maskPath);
      if (bytes.length > 50 * 1024 * 1024 || !bytes.subarray(0, 8).equals(png))
        invalid('遮罩必须是 PNG');
      const meta = await sharp(bytes).metadata();
      if (meta.width !== width || meta.height !== height) invalid('遮罩尺寸必须和原图相同');
      alpha = await sharp(bytes).flatten({ background: '#000000' }).greyscale().raw().toBuffer();
    } catch (error) {
      if (error.code === 'invalid_input') throw error;
      invalid('无法读取遮罩 PNG');
    }
  }
  for (let i = 0; i < alpha.length; i++) alpha[i] = alpha[i] > 127 ? 255 : 0;
  const { maskBounds, count } = maskStats(alpha, width, height);
  if (!count) invalid('遮罩裁剪后为空');
  const rect = input.rect ?? defaultInpaintRect(maskBounds, image);
  validateRect(rect, image);
  if (
    rect.x > maskBounds.x ||
    rect.y > maskBounds.y ||
    rect.x + rect.width < maskBounds.x + maskBounds.width ||
    rect.y + rect.height < maskBounds.y + maskBounds.height
  )
    invalid(`重绘范围必须包含全部遮罩：${JSON.stringify(maskBounds)}`);
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < alpha.length; i++) rgba[i * 4 + 3] = alpha[i];
  const mask = (
    await sharp(rgba, { raw: { width, height, channels: 4 } })
      .extract(extract(rect))
      .png()
      .toBuffer()
  ).toString('base64');
  return { ...input, rect, mask, maskBounds, maskRatio: count / (rect.width * rect.height) };
}

export function createAgentImages(directory) {
  const temporary = path.join(directory, 'agent-image-previews');
  const jobs = path.join(directory, 'generation-assets');
  const reserved = new Set();
  async function write(bytes, job = false) {
    const folder = job ? jobs : temporary;
    await fs.mkdir(folder, { recursive: true });
    const file = path.join(folder, `${crypto.randomUUID()}.png`);
    if (job) reserved.add(file);
    await fs.writeFile(file, bytes);
    return file;
  }
  async function preview(source, input, { limit = 1568, crop = false, job = false } = {}) {
    const { data, info } = await sharp(source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const r = input.rect;
    const alpha = input.mask
      ? await sharp(Buffer.from(input.mask, 'base64'))
          .ensureAlpha()
          .extractChannel(3)
          .raw()
          .toBuffer()
      : null;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        const inside = r && x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
        const painted = inside && alpha && alpha[(y - r.y) * r.width + x - r.x] > 127;
        if (painted) {
          data[i] = Math.round(data[i] * 0.5 + 127.5);
          data[i + 1] = Math.round(data[i + 1] * 0.5);
          data[i + 2] = Math.round(data[i + 2] * 0.5);
        } else if (r && !inside)
          for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * 0.4);
      }
    let result = sharp(data, { raw: info });
    if (r)
      result = result.composite([
        {
          input: svg(
            info.width,
            info.height,
            `<rect x="${r.x + 1}" y="${r.y + 1}" width="${r.width - 2}" height="${r.height - 2}" fill="none" stroke="white" stroke-width="3"/>`,
          ),
        },
      ]);
    result = sharp(await result.png().toBuffer());
    if (crop && r) result = result.extract(extract(r));
    return write(
      await result
        .resize({ width: limit, height: limit, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer(),
      job,
    );
  }
  return {
    preview,
    async outpaint(source, edges, canvas) {
      const meta = await sharp(source).metadata();
      const scale = Math.min(1, 512 / Math.max(canvas.width, canvas.height));
      const width = Math.max(1, Math.round(canvas.width * scale)),
        height = Math.max(1, Math.round(canvas.height * scale));
      const background = svg(
        width,
        height,
        '<defs><pattern id="c" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#cccccc"/><path d="M0 0h8v8H0zM8 8h8v8H8z" fill="#777777"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/>',
      );
      const left = Math.round((edges.left || 0) * scale),
        top = Math.round((edges.top || 0) * scale);
      const image = await sharp(source)
        .resize(
          Math.max(1, Math.round(((edges.left || 0) + meta.width) * scale) - left),
          Math.max(1, Math.round(((edges.top || 0) + meta.height) * scale) - top),
          { fit: 'fill' },
        )
        .png()
        .toBuffer();
      return write(
        await sharp(background)
          .composite([
            {
              input: image,
              left,
              top,
            },
          ])
          .png()
          .toBuffer(),
        true,
      );
    },
    async grid(source, step) {
      const meta = await sharp(source).metadata();
      const longest = Math.max(meta.width, meta.height);
      step ??= Math.max(64, Math.round(longest / 10 / 64) * 64);
      if (!Number.isSafeInteger(step) || step < 1) invalid('网格步长必须是正整数');
      const scale = Math.min(1, 1568 / longest);
      const width = Math.max(1, Math.round(meta.width * scale)),
        height = Math.max(1, Math.round(meta.height * scale));
      const text = (x, y, n, anchor = 'middle') =>
        `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="sans-serif" font-size="12" fill="white" stroke="#111" stroke-width="3" paint-order="stroke">${n}</text>`;
      let body = '';
      for (let x = 0; x <= meta.width; x += step) {
        const p = x * scale;
        body += `<path d="M${p} 0V${height}"/>${text(Math.max(15, Math.min(width - 15, p)), 13, x)}${text(Math.max(15, Math.min(width - 15, p)), height - 4, x)}`;
      }
      for (let y = 0; y <= meta.height; y += step) {
        const p = y * scale;
        body += `<path d="M0 ${p}H${width}"/>${text(3, Math.max(27, Math.min(height - 18, p)), y, 'start')}${text(width - 3, Math.max(27, Math.min(height - 18, p)), y, 'end')}`;
      }
      const lines = `<g stroke="#111" stroke-width="3">${body}</g><g stroke="white" stroke-width="1">${body}</g>`;
      const bytes = await sharp(source)
        .resize(width, height)
        .composite([{ input: svg(width, height, lines) }])
        .png()
        .toBuffer();
      return { path: await write(bytes), width, height, step, scale };
    },
    async cleanupTemporary() {
      await fs.mkdir(temporary, { recursive: true });
      for (const name of await fs.readdir(temporary)) {
        const file = path.join(temporary, name);
        if (/^[\w-]+\.png$/.test(name) && Date.now() - (await fs.stat(file)).mtimeMs > 86400000)
          await fs.unlink(file);
      }
    },
    async cleanupJobs(retained) {
      await fs.mkdir(jobs, { recursive: true });
      for (const item of retained) reserved.delete(item.previewPath);
      const keep = new Set(
        retained
          .filter(
            (j) =>
              ['pending', 'queued', 'generating', 'failed', 'skipped'].includes(j.state) &&
              !j.removed,
          )
          .map((j) => j.previewPath),
      );
      for (const name of await fs.readdir(jobs)) {
        const file = path.join(jobs, name);
        if (/^[\w-]+\.png$/.test(name) && !keep.has(file) && !reserved.has(file))
          await fs.unlink(file).catch((e) => {
            if (e.code !== 'ENOENT') throw e;
          });
      }
    },
  };
}
