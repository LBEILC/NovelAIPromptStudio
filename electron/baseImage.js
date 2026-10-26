import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

export async function cleanBaseImage(source) {
  const input = Buffer.isBuffer(source) ? source : await fs.readFile(source);
  if (input.length > 100 * 1024 * 1024) throw new Error('参考图过大');
  const { data, info } = await sharp(input)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Clear the alpha LSB channel before resampling. Preserve transparent pixels;
  // restoring odd alpha makes opaque stealth carriers fully opaque again.
  for (let i = 3; i < data.length; i += 4) if (data[i]) data[i] |= 1;
  return sharp(data, { raw: info }).png().toBuffer();
}

export async function prepareBaseImage(source, width, height, model) {
  let image = sharp(await cleanBaseImage(source));
  if (!model.startsWith('nai-diffusion-5-')) image = image.flatten({ background: '#ffffff' });
  return (
    await image.resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer()
  ).toString('base64');
}

export async function storeBaseImage(source, directory, name) {
  const bytes = await cleanBaseImage(source);
  const id = crypto.createHash('sha256').update(bytes).digest('hex');
  const target = path.join(directory, 'references', `${id}.png`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  const { width, height } = await sharp(bytes).metadata();
  const thumbnail = (
    await sharp(bytes)
      .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
  ).toString('base64');
  return {
    id,
    name: name || path.basename(source),
    path: target,
    thumbnail: `data:image/png;base64,${thumbnail}`,
    width,
    height,
  };
}
