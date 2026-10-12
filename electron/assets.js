import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { readNovelAIMetadata } from './metadata.js';
import { fingerprintVibes } from './vibes.js';
import { parsePrompt } from '../src/lib/prompt.js';
import { createPromptStructure } from '../src/lib/promptStructure.js';

export async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function copyWithThumbnail(sourcePath, assetsDirectory) {
  const id = crypto.randomUUID();
  const extension = path.extname(sourcePath).toLowerCase() || '.png';
  const targetDirectory = path.join(assetsDirectory, 'images');
  const thumbnailDirectory = path.join(assetsDirectory, 'thumbnails');
  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.mkdirSync(thumbnailDirectory, { recursive: true });
  const targetPath = path.join(targetDirectory, `${id}${extension}`);
  const thumbnailPath = path.join(thumbnailDirectory, `${id}.webp`);
  try {
    fs.copyFileSync(sourcePath, targetPath);
    await sharp(sourcePath)
      .rotate()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(thumbnailPath);
    return { targetPath, thumbnailPath };
  } catch (error) {
    fs.rmSync(targetPath, { force: true });
    fs.rmSync(thumbnailPath, { force: true });
    throw error;
  }
}
export async function importImage(sourcePath, assetsDirectory, options = {}) {
  const id = crypto.randomUUID();
  const { targetPath, thumbnailPath } = await copyWithThumbnail(sourcePath, assetsDirectory);
  try {
    const metadata = await readNovelAIMetadata(sourcePath);
    metadata.extra_json = JSON.stringify({
      ...JSON.parse(metadata.extra_json || '{}'),
      studio_naming: {
        original_filename: path.basename(options.name || sourcePath),
        has_custom_name: false,
      },
    });
    if (!metadata.width || !metadata.height) {
      const imageMetadata = await sharp(sourcePath).metadata();
      metadata.width = Number(imageMetadata.width || 0);
      metadata.height = Number(imageMetadata.height || 0);
    }
    metadata.vibe_fingerprint = fingerprintVibes(metadata.embedded_vibes);
    delete metadata.embedded_vibes;
    const now = new Date().toISOString();
    return {
      id,
      name: path.basename(options.name || sourcePath, path.extname(options.name || sourcePath)),
      image_path: targetPath,
      thumbnail_path: thumbnailPath,
      content_hash: options.contentHash || (await hashFile(sourcePath)),
      created_at: now,
      updated_at: now,
      metadata,
      tags: parsePrompt(metadata.prompt_raw, () => crypto.randomUUID()),
      prompt_structure: createPromptStructure(metadata, () => crypto.randomUUID()),
    };
  } catch (error) {
    fs.rmSync(targetPath, { force: true });
    fs.rmSync(thumbnailPath, { force: true });
    throw error;
  }
}
