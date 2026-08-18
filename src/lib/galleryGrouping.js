import { basePromptFingerprint, promptFingerprint } from './promptFingerprint.js';

export const GALLERY_GROUPING_KEY = 'novelai-prompt-studio.gallery-grouping.v1';
export const GALLERY_PROMPT_SCOPES = ['separate', 'full', 'base'];
export const GALLERY_PROMPT_SCOPE_LABELS = {
  separate: '全部分开',
  full: '完整 Prompt',
  base: '基础 Prompt',
};
export const DEFAULT_GALLERY_GROUPING = Object.freeze({ promptScope: 'full', mergeVibes: false });

function normalizedModel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizeGalleryGrouping(value = {}) {
  const promptScope = GALLERY_PROMPT_SCOPES.includes(value?.promptScope)
    ? value.promptScope
    : DEFAULT_GALLERY_GROUPING.promptScope;
  return { promptScope, mergeVibes: Boolean(value?.mergeVibes) };
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

export function galleryPromptScopeIndex(scope) {
  const index = GALLERY_PROMPT_SCOPES.indexOf(scope);
  return index < 0 ? GALLERY_PROMPT_SCOPES.indexOf(DEFAULT_GALLERY_GROUPING.promptScope) : index;
}

export function galleryPromptScopeAt(index) {
  const normalizedIndex = Math.min(
    GALLERY_PROMPT_SCOPES.length - 1,
    Math.max(0, Math.round(Number(index) || 0)),
  );
  return GALLERY_PROMPT_SCOPES[normalizedIndex];
}

export function isExactGalleryGrouping(value = {}) {
  const grouping = normalizeGalleryGrouping(value);
  return grouping.promptScope === 'full' && !grouping.mergeVibes;
}

export function galleryGroupingFingerprint(project = {}, value = DEFAULT_GALLERY_GROUPING) {
  const grouping = normalizeGalleryGrouping(value);
  if (grouping.promptScope === 'separate') return '';

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
