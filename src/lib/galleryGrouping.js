import { basePromptFingerprint, promptFingerprint } from './promptFingerprint.js';
import { normalizePromptStructure } from './promptStructure.js';

export const GALLERY_GROUPING_KEY = 'novelai-prompt-studio.gallery-grouping.v1';
export const GALLERY_PROMPT_SCOPES = ['separate', 'full', 'base', 'similar'];
export const GALLERY_PROMPT_SCOPE_LABELS = {
  separate: '全部分开',
  full: '完整 Prompt',
  base: '基础 Prompt',
  similar: '相似 Prompt',
};
export const GALLERY_SIMILARITY_MIN = 70;
export const GALLERY_SIMILARITY_MAX = 95;
export const GALLERY_SIMILARITY_DEFAULT = 85;
export const DEFAULT_GALLERY_GROUPING = Object.freeze({
  promptScope: 'full',
  mergeVibes: false,
  similarityThreshold: GALLERY_SIMILARITY_DEFAULT,
});

const CATEGORY_SIMILARITY_WEIGHTS = {
  ArtistEra: 2.4,
  StyleQuality: 2,
  Composition: 1.7,
  Environment: 1.35,
  Unsorted: 1.2,
  Clothing: 1.05,
  Action: 0.9,
  Body: 0.85,
  Identity: 0.75,
  Subject: 0.45,
};

function normalizedModel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizeGalleryGrouping(value = {}) {
  const promptScope = GALLERY_PROMPT_SCOPES.includes(value?.promptScope)
    ? value.promptScope
    : DEFAULT_GALLERY_GROUPING.promptScope;
  const numericThreshold = Number(value?.similarityThreshold);
  const similarityThreshold = Number.isFinite(numericThreshold)
    ? Math.round(Math.min(GALLERY_SIMILARITY_MAX, Math.max(GALLERY_SIMILARITY_MIN, numericThreshold)))
    : GALLERY_SIMILARITY_DEFAULT;
  return { promptScope, mergeVibes: Boolean(value?.mergeVibes), similarityThreshold };
}

export function readGalleryGrouping(storage) {
  try {
    return normalizeGalleryGrouping(JSON.parse(storage?.getItem(GALLERY_GROUPING_KEY) || '{}'));
  } catch {
    return { ...DEFAULT_GALLERY_GROUPING };
  }
}

export function writeGalleryGrouping(storage, value) {
  const normalized = normalizeGalleryGrouping(value);
  try {
    storage?.setItem(GALLERY_GROUPING_KEY, JSON.stringify(normalized));
  } catch {
    // Keep the in-memory grouping usable when persistence is unavailable.
  }
  return normalized;
}

export function isExactGalleryGrouping(value = {}) {
  const grouping = normalizeGalleryGrouping(value);
  return grouping.promptScope === 'full' && !grouping.mergeVibes;
}

export function galleryGroupingFingerprint(project = {}, value = DEFAULT_GALLERY_GROUPING) {
  const grouping = normalizeGalleryGrouping(value);
  if (grouping.promptScope === 'separate' || grouping.promptScope === 'similar') return '';

  const prompt = grouping.promptScope === 'base'
    ? String(project.base_prompt_fingerprint || basePromptFingerprint(project))
    : String(project.prompt_fingerprint || promptFingerprint(project));
  if (!prompt) return '';

  return JSON.stringify({
    version: 1,
    promptScope: grouping.promptScope,
    prompt,
    model: normalizedModel(project.metadata?.model),
    ...(!grouping.mergeVibes ? { vibe: String(project.vibe_fingerprint || project.metadata?.vibe_fingerprint || '') } : {}),
  });
}

export function galleryGroupingBoundaryFingerprint(project = {}, value = DEFAULT_GALLERY_GROUPING) {
  const grouping = normalizeGalleryGrouping(value);
  return JSON.stringify({
    version: 1,
    model: normalizedModel(project.metadata?.model),
    ...(!grouping.mergeVibes ? { vibe: String(project.vibe_fingerprint || project.metadata?.vibe_fingerprint || '') } : {}),
  });
}

function normalizedSimilarityTag(tag = {}) {
  const key = String(tag.tag || '').trim().replace(/[_\s]+/g, ' ').toLocaleLowerCase('en-US');
  if (!key) return null;
  const promptWeight = Math.min(2, Math.max(0.5, Math.abs(Number(tag.weight) || 1)));
  return {
    key,
    value: (CATEGORY_SIMILARITY_WEIGHTS[tag.category] || CATEGORY_SIMILARITY_WEIGHTS.Unsorted) * promptWeight,
  };
}

function similarityTagMap(tags = []) {
  const map = new Map();
  for (const tag of tags) {
    const normalized = normalizedSimilarityTag(tag);
    if (!normalized) continue;
    map.set(normalized.key, Math.max(map.get(normalized.key) || 0, normalized.value));
  }
  return map;
}

export function galleryBasePromptSimilarityPayload(project = {}) {
  let id = 0;
  const structure = normalizePromptStructure(project.prompt_structure, project.metadata, () => `similarity-${id++}`);
  return {
    prompt: similarityTagMap(project.tags),
    undesired: similarityTagMap(structure.base_undesired_tags),
  };
}

function weightedJaccard(left, right) {
  const keys = new Set([...left.keys(), ...right.keys()]);
  if (!keys.size) return null;
  let shared = 0;
  let total = 0;
  for (const key of keys) {
    const leftValue = left.get(key) || 0;
    const rightValue = right.get(key) || 0;
    shared += Math.min(leftValue, rightValue);
    total += Math.max(leftValue, rightValue);
  }
  return total ? shared / total : null;
}

export function galleryBasePromptPayloadSimilarity(left, right) {
  const promptScore = weightedJaccard(left.prompt, right.prompt);
  if (promptScore === null) return 0;
  const undesiredScore = weightedJaccard(left.undesired, right.undesired);
  if (undesiredScore === null) return promptScore;
  return (promptScore * 0.8) + (undesiredScore * 0.2);
}

export function galleryBasePromptSimilarity(leftProject = {}, rightProject = {}) {
  return galleryBasePromptPayloadSimilarity(
    galleryBasePromptSimilarityPayload(leftProject),
    galleryBasePromptSimilarityPayload(rightProject),
  );
}

export function galleryGroupingStatusLabel(value = DEFAULT_GALLERY_GROUPING) {
  const grouping = normalizeGalleryGrouping(value);
  if (grouping.promptScope === 'separate') return '全部分开';
  if (grouping.promptScope === 'full') return grouping.mergeVibes ? '同 Prompt' : '精确';
  if (grouping.promptScope === 'base') return grouping.mergeVibes ? '基础 · 跨 Vibe' : '基础';
  return `相似 ${grouping.similarityThreshold}%${grouping.mergeVibes ? ' · 跨 Vibe' : ''}`;
}

export function exactGalleryGroupFingerprint(project = {}) {
  return String(project.exact_group_fingerprint || galleryGroupingFingerprint(project, DEFAULT_GALLERY_GROUPING));
}

export function galleryProjectGroupingFingerprints(project = {}) {
  const fullPrompt = promptFingerprint(project);
  const basePrompt = basePromptFingerprint(project);
  const enriched = {
    ...project,
    prompt_fingerprint: fullPrompt,
    base_prompt_fingerprint: basePrompt,
    vibe_fingerprint: String(project.vibe_fingerprint || project.metadata?.vibe_fingerprint || ''),
  };
  return {
    promptFingerprint: fullPrompt,
    basePromptFingerprint: basePrompt,
    exactGroupFingerprint: galleryGroupingFingerprint(enriched, DEFAULT_GALLERY_GROUPING),
  };
}
