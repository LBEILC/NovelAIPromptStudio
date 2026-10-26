import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const pending = new Map();
const waiting = [];
let active = 0;
async function limited(operation) {
  if (active >= 4) await new Promise((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await operation();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

/** Callers retain their existing media path authorization before entering this helper. */
export async function blurredMedia(filePath, cacheDirectory) {
  const resolved = path.resolve(filePath);
  // Check the source even on a cache hit: removed originals must not remain readable.
  const stat = await fs.stat(resolved, { bigint: true });
  if (!stat.isFile()) throw Object.assign(Error('Media is not a file'), { code: 'ENOENT' });
  const key = crypto
    .createHash('sha256')
    .update(`blur-v2:${resolved}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`)
    .digest('hex');
  const target = path.join(cacheDirectory, `${key}.webp`);
  try {
    await fs.access(target);
    return target;
  } catch {
    /* Cold cache. */
  }
  if (!pending.has(target)) {
    const build = limited(async () => {
      await fs.mkdir(cacheDirectory, { recursive: true });
      const temporary = `${target}.${crypto.randomUUID()}.tmp`;
      try {
        const source = await fs.readFile(resolved);
        const metadata = await sharp(source).metadata();
        const small = await sharp(source)
          .rotate()
          .resize({ width: 24, height: 24, fit: 'inside', withoutEnlargement: true })
          .blur(3)
          .png()
          .toBuffer();
        await sharp(small)
          .resize(metadata.width, metadata.height, { fit: 'fill', kernel: 'linear' })
          .webp({ quality: 60 })
          .toFile(temporary);
        await fs.rename(temporary, target);
        return target;
      } finally {
        await fs.rm(temporary, { force: true });
      }
    }).finally(() => pending.delete(target));
    pending.set(target, build);
  }
  return pending.get(target);
}
