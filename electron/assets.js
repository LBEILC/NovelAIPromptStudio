import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { readNovelAIMetadata } from './metadata.js';
import { parsePrompt } from '../src/lib/prompt.js';
import { createPromptStructure } from '../src/lib/promptStructure.js';

function safeName(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[^\p{L}\p{N}._-]+/gu, ' ').trim() || 'Untitled';
}

async function copyWithThumbnail(sourcePath, assetsDirectory, kind = 'images') {
  const id = crypto.randomUUID();
  const extension = path.extname(sourcePath).toLowerCase() || '.png';
  const targetDirectory = path.join(assetsDirectory, kind);
  const thumbnailDirectory = path.join(assetsDirectory, 'thumbnails');
  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.mkdirSync(thumbnailDirectory, { recursive: true });
  const targetPath = path.join(targetDirectory, `${id}${extension}`);
  const thumbnailPath = path.join(thumbnailDirectory, `${id}.webp`);
  fs.copyFileSync(sourcePath, targetPath);
  await sharp(sourcePath).rotate().resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(thumbnailPath);
  return { targetPath, thumbnailPath };
}

export async function importImage(sourcePath, assetsDirectory) {
  const id = crypto.randomUUID();
  const { targetPath, thumbnailPath } = await copyWithThumbnail(sourcePath, assetsDirectory);
  const metadata = readNovelAIMetadata(sourcePath);
  const now = new Date().toISOString();
  return {
    id,
    name: safeName(sourcePath),
    image_path: targetPath,
    thumbnail_path: thumbnailPath,
    created_at: now,
    updated_at: now,
    metadata,
    tags: parsePrompt(metadata.prompt_raw, () => crypto.randomUUID()),
    prompt_structure: createPromptStructure(metadata, () => crypto.randomUUID()),
    vibes: [],
    versions: [],
  };
}

export async function importVibeImage(sourcePath, assetsDirectory) {
  const { targetPath, thumbnailPath } = await copyWithThumbnail(sourcePath, assetsDirectory, 'vibes');
  return {
    id: crypto.randomUUID(),
    reference_image: targetPath,
    thumbnail_path: thumbnailPath,
    strength: 0.6,
    information_extracted: 0.7,
    enabled: true,
  };
}
