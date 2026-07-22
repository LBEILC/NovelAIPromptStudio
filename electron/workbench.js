import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readNovelAIMetadata } from './metadata.js';
import { fingerprintVibe } from './vibes.js';
import { parsePrompt } from '../src/lib/prompt.js';
import { createPromptStructure } from '../src/lib/promptStructure.js';

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;

function safeName(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[^\p{L}\p{N}._-]+/gu, ' ').trim() || 'Untitled';
}

export async function readWorkbenchImage(filePath, { enrichProjectTags = (project) => project } = {}) {
  const resolvedPath = path.resolve(String(filePath || ''));
  if (!resolvedPath || !fs.existsSync(resolvedPath)) throw new Error('图片不存在或已被移动');
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) throw new Error('工作台只支持本地图片文件');
  if (!SUPPORTED_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) throw new Error('工作台仅支持 PNG、JPG 和 WEBP 图片');
  if (stat.size > MAX_IMAGE_BYTES) throw new Error('单张图片不能超过 100 MB');

  const metadata = readNovelAIMetadata(resolvedPath);
  if (!metadata.width || !metadata.height) {
    const dimensions = await sharp(resolvedPath).metadata();
    metadata.width = Number(dimensions.width || 0);
    metadata.height = Number(dimensions.height || 0);
  }
  const embeddedVibes = metadata.embedded_vibes || [];
  delete metadata.embedded_vibes;
  delete metadata.extra_json;
  const now = new Date().toISOString();
  const project = {
    id: `workbench-${crypto.randomUUID()}`,
    name: safeName(resolvedPath),
    image_path: resolvedPath,
    thumbnail_path: '',
    created_at: now,
    updated_at: now,
    metadata,
    tags: parsePrompt(metadata.prompt_raw, () => crypto.randomUUID()),
    prompt_structure: createPromptStructure(metadata, () => crypto.randomUUID()),
    vibes: embeddedVibes.map((vibe, index) => ({
      id: fingerprintVibe(vibe.encoding),
      name: `Vibe ${index + 1}`,
      encoding: vibe.encoding,
      model: vibe.model,
      strength: vibe.strength,
      information_extracted: vibe.information_extracted,
    })),
  };
  return enrichProjectTags(project);
}
