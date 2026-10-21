import crypto from 'node:crypto';
import { normalizeSettings, hydrateParameters } from './params.js';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readNovelAIMetadata } from './metadata.js';
import { fingerprintVibe } from './vibes.js';
import { parsePrompt } from '../src/lib/prompt.js';
import { createPromptStructure, normalizePromptStructure } from '../src/lib/promptStructure.js';

export function applyWorkbenchStructure(project, remembered) {
  if (!remembered || !project?.prompt_structure) return project;
  const current = normalizePromptStructure(project.prompt_structure, project.metadata);
  const stored = normalizePromptStructure(remembered);
  const annotations = { ...stored.block_annotations };
  current.characters.forEach((character, index) => {
    const previous = stored.characters[index];
    if (!previous) return;
    for (const polarity of ['prompt', 'undesired']) {
      const oldKey = `character:${previous.id}:${polarity}`;
      const newKey = `character:${character.id}:${polarity}`;
      if (oldKey !== newKey && annotations[oldKey]) {
        annotations[newKey] = annotations[oldKey];
        delete annotations[oldKey];
      }
    }
  });
  return { ...project, prompt_structure: { ...current, block_annotations: annotations } };
}

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;

function safeName(filePath) {
  return (
    path
      .basename(filePath, path.extname(filePath))
      .replace(/[^\p{L}\p{N}._-]+/gu, ' ')
      .trim() || 'Untitled'
  );
}

export function applyWorkbenchLibraryDetails(project, libraryProject) {
  if (!project || !libraryProject) return project;
  return {
    ...applyWorkbenchStructure(project, libraryProject.prompt_structure),
    name: String(libraryProject.name || '').trim() || project.name,
    created_at: libraryProject.created_at || project.created_at,
    has_custom_name: libraryProject.has_custom_name,
    thumbnail_path: String(libraryProject.thumbnail_path || '').trim(),
    tags: libraryProject.tags ?? project.tags,
    prompt_structure: libraryProject.prompt_structure ?? project.prompt_structure,
    params: libraryProject.params ?? project.params,
    references: libraryProject.references ?? project.references,
    keptParameters: libraryProject.keptParameters ?? project.keptParameters,
    metadata: {
      ...project.metadata,
      prompt_raw: libraryProject.metadata?.prompt_raw ?? project.metadata?.prompt_raw,
      negative_prompt:
        libraryProject.metadata?.negative_prompt ?? project.metadata?.negative_prompt,
    },
  };
}

export async function readWorkbenchImage(
  filePath,
  { enrichProjectTags = (project) => project } = {},
) {
  const resolvedPath = path.resolve(String(filePath || ''));
  if (!resolvedPath || !fs.existsSync(resolvedPath)) throw new Error('图片不存在或已被移动');
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) throw new Error('工作台只支持本地图片文件');
  if (!SUPPORTED_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase()))
    throw new Error('工作台仅支持 PNG、JPG 和 WEBP 图片');
  if (stat.size > MAX_IMAGE_BYTES) throw new Error('单张图片不能超过 100 MB');

  const metadata = await readNovelAIMetadata(resolvedPath);
  if (!metadata.width || !metadata.height) {
    const dimensions = await sharp(resolvedPath).metadata();
    metadata.width = Number(dimensions.width || 0);
    metadata.height = Number(dimensions.height || 0);
  }
  const embeddedVibes = metadata.embedded_vibes || [];
  delete metadata.embedded_vibes;
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
  return hydrateParameters(enrichProjectTags(project));
}

export function createBlankProject(input = {}, { model = 'last', latest = null } = {}) {
  const inherited = model === 'last' ? latest : null;
  const params = normalizeSettings({
    model: model === 'last' ? 'nai-diffusion-5-full' : model,
    effort: 'High',
    steps: 28,
    scale: 5,
    rescale: 0,
    sampler: 'k_euler_ancestral',
    noise: 'karras',
    quality: 'Standard',
    uc: 'Heavy',
    ...(inherited?.params || {}),
    aiPositions: true,
    positions: {},
    ...input.params,
  });
  const dimension = (value) => {
    if (!Number.isFinite(value) || value <= 0) throw new Error('尺寸无效');
    return Math.min(2048, Math.max(64, Math.round(value / 64) * 64));
  };
  const metadata = {
    model: params.model,
    width: dimension(input.width ?? (inherited?.metadata.width || 832)),
    height: dimension(input.height ?? (inherited?.metadata.height || 1216)),
    prompt_raw: '',
    negative_prompt: '',
    seed: '',
    steps: params.steps,
    guidance: params.scale,
    sampler: params.sampler,
    extra_json: '',
  };
  const now = new Date().toISOString();
  return {
    id: `blank-${crypto.randomUUID()}`,
    name: input.name || '空白作品',
    blank: true,
    paramsSource: inherited ? 'last' : 'defaults',
    image_path: '',
    thumbnail_path: '',
    created_at: now,
    updated_at: now,
    metadata,
    params,
    tags: [],
    prompt_structure: createPromptStructure(metadata),
    references: { vibes: [], precise: [] },
    keptParameters: [],
  };
}
