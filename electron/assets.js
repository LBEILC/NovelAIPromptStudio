import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { readNovelAIMetadata } from './metadata.js';
import { parsePrompt } from '../src/lib/prompt.js';
import { createPromptStructure } from '../src/lib/promptStructure.js';
import { extractEmbeddedVibes, importEmbeddedVibe, toProjectVibe } from './vibes.js';

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
  try {
    fs.copyFileSync(sourcePath, targetPath);
    await sharp(sourcePath).rotate().resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(thumbnailPath);
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
    const metadata = readNovelAIMetadata(sourcePath);
    delete metadata.embedded_vibes;
    const now = new Date().toISOString();
    return {
      id,
      name: safeName(options.name || sourcePath),
      image_path: targetPath,
      thumbnail_path: thumbnailPath,
      content_hash: options.contentHash || await hashFile(sourcePath),
      created_at: now,
      updated_at: now,
      is_favorite: 0,
      deleted_at: '',
      collection_ids: [],
      series_ids: [],
      metadata,
      tags: parsePrompt(metadata.prompt_raw, () => crypto.randomUUID()),
      prompt_structure: createPromptStructure(metadata, () => crypto.randomUUID()),
      vibes: [],
      versions: [],
      branches: [],
    };
  } catch (error) {
    fs.rmSync(targetPath, { force: true });
    fs.rmSync(thumbnailPath, { force: true });
    throw error;
  }
}

export async function importVibeImage(sourcePath, assetsDirectory) {
  const { targetPath, thumbnailPath } = await copyWithThumbnail(sourcePath, assetsDirectory, 'vibes');
  const sourceBytes = fs.readFileSync(sourcePath);
  return {
    id: crypto.createHash('sha256').update(sourceBytes).digest('hex'),
    name: safeName(sourcePath),
    source_kind: 'image',
    original_vibe_id: '',
    reference_image: targetPath,
    vibe_file: '',
    thumbnail_path: thumbnailPath,
    model: '',
    strength: 0.6,
    information_extracted: 0.7,
    information_extracted_known: 1,
    encoded_values_json: '[]',
    encoding_variants_json: '[]',
    encoding_count: 0,
    has_source_image: 1,
    source_image_hash: crypto.createHash('sha256').update(sourceBytes).digest('hex'),
    created_at: new Date().toISOString(),
  };
}

export function projectEmbeddedVibes(project) {
  let raw = {};
  try {
    raw = JSON.parse(project.metadata?.extra_json || '{}').parsed || {};
  } catch {
    return [];
  }
  return extractEmbeddedVibes(raw, project.metadata?.model || '');
}

export async function recoverEmbeddedVibes(project, assetsDirectory) {
  const items = projectEmbeddedVibes(project);
  const libraryEntries = [];
  for (const [index, item] of items.entries()) {
    libraryEntries.push(await importEmbeddedVibe(item, assetsDirectory, project.name || project.image_path, index));
  }
  const existingIds = new Set((project.vibes || []).map((vibe) => vibe.library_id).filter(Boolean));
  const additions = libraryEntries.filter((entry) => !existingIds.has(entry.id)).map((entry) => toProjectVibe(entry));
  return { project: additions.length ? { ...project, vibes: [...(project.vibes || []), ...additions] } : project, libraryEntries };
}
