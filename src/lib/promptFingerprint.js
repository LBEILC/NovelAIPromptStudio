import { normalizePromptStructure } from './promptStructure.js';

function normalizedTag(tag = {}) {
  return {
    tag: String(tag.tag || '').trim().replace(/\s+/g, ' '),
    weight: Number.isFinite(Number(tag.weight)) ? Number(tag.weight) : 1,
    raw: String(tag.raw_segment || '').trim().replace(/\s+/g, ' '),
    braceDepth: Math.max(0, Math.trunc(Number(tag.brace_depth) || 0)),
    braceGroup: String(tag.brace_group || ''),
    trailingComma: Boolean(tag.brace_trailing_comma),
  };
}

export function promptSemanticPayload(project = {}) {
  let id = 0;
  const structure = normalizePromptStructure(project.prompt_structure, project.metadata, () => `fingerprint-${id++}`);
  return {
    base: {
      prompt: (project.tags || []).map(normalizedTag),
      undesired: (structure.base_undesired_tags || []).map(normalizedTag),
    },
    useCoords: Boolean(structure.use_coords),
    useOrder: Boolean(structure.use_order),
    characters: structure.characters.map((character) => ({
      center: {
        x: Number(Number(character.center?.x ?? 0.5).toFixed(6)),
        y: Number(Number(character.center?.y ?? 0.5).toFixed(6)),
      },
      prompt: (character.prompt_tags || []).map(normalizedTag),
      undesired: (character.undesired_tags || []).map(normalizedTag),
    })),
  };
}

export function promptFingerprint(project = {}) {
  const payload = promptSemanticPayload(project);
  const hasPrompt = payload.base.prompt.length
    || payload.base.undesired.length
    || payload.characters.some((character) => character.prompt.length || character.undesired.length);
  return hasPrompt ? JSON.stringify(payload) : '';
}
