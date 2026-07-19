import { getPromptScopes, normalizePromptStructure } from './promptStructure.js';

const ANNOTATION_FIELDS = ['translation', 'translation_source', 'category', 'category_source', 'note'];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function generationTag(tag) {
  return {
    tag: String(tag?.tag || ''),
    weight: Number(tag?.weight ?? 1),
    raw_segment: String(tag?.raw_segment || ''),
    syntax_issue: String(tag?.syntax_issue || ''),
  };
}

function generationMetadata(project) {
  const metadata = project.metadata || {};
  return {
    model: String(metadata.model || '').trim(),
    seed: String(metadata.seed ?? '').trim(),
    steps: metadata.steps === '' || metadata.steps == null ? '' : Number(metadata.steps),
    sampler: String(metadata.sampler || '').trim(),
    guidance: metadata.guidance === '' || metadata.guidance == null ? '' : Number(metadata.guidance),
    generation_mode: String(metadata.generation_mode || '').trim(),
  };
}

function generationStructure(project) {
  const structure = normalizePromptStructure(project.prompt_structure, project.metadata);
  return {
    use_coords: Boolean(structure.use_coords),
    use_order: Boolean(structure.use_order),
    base_undesired_tags: structure.base_undesired_tags.map(generationTag),
    characters: structure.characters.map((character) => ({
      prompt_tags: character.prompt_tags.map(generationTag),
      undesired_tags: character.undesired_tags.map(generationTag),
      center: clone(character.center ?? character.position ?? null),
    })),
  };
}

export function generationSnapshot(project) {
  return {
    tags: clone(project.tags || []),
    prompt_structure: clone(normalizePromptStructure(project.prompt_structure, project.metadata)),
    vibes: clone(project.vibes || []),
    metadata: generationMetadata(project),
  };
}

export function generationSignature(project) {
  return JSON.stringify({
    tags: (project.tags || []).map(generationTag),
    prompt_structure: generationStructure(project),
    vibes: (project.vibes || []).map((vibe) => ({
      library_id: String(vibe.library_id || vibe.id || ''),
      source_kind: String(vibe.source_kind || ''),
      source_image_hash: String(vibe.source_image_hash || ''),
      strength: Number(vibe.strength ?? 0.6),
      information_extracted: Number(vibe.information_extracted ?? 0.7),
      enabled: Boolean(vibe.enabled),
    })),
    metadata: generationMetadata(project),
  });
}

export function hasGenerationChanges(source, candidate) {
  return generationSignature(source) !== generationSignature(candidate);
}

export function applyGenerationSnapshot(project, snapshot) {
  if (!snapshot) return project;
  return {
    ...project,
    tags: clone(snapshot.tags || project.tags),
    prompt_structure: clone(snapshot.prompt_structure || project.prompt_structure),
    vibes: clone(snapshot.vibes || project.vibes),
    metadata: { ...project.metadata, ...(snapshot.metadata || {}) },
  };
}

export function branchChangeFields(source, candidate) {
  const fields = [];
  const sourcePrompt = JSON.stringify({ tags: (source.tags || []).map(generationTag), structure: generationStructure(source) });
  const candidatePrompt = JSON.stringify({ tags: (candidate.tags || []).map(generationTag), structure: generationStructure(candidate) });
  if (sourcePrompt !== candidatePrompt) fields.push('Prompt');
  const sourceVibes = generationSignature({ ...source, tags: [], prompt_structure: {}, metadata: {} });
  const candidateVibes = generationSignature({ ...candidate, tags: [], prompt_structure: {}, metadata: {} });
  if (sourceVibes !== candidateVibes) fields.push('Vibe');
  const sourceMetadata = generationMetadata(source);
  const candidateMetadata = generationMetadata(candidate);
  for (const [field, label] of [['seed', 'Seed'], ['model', 'Model'], ['sampler', 'Sampler'], ['steps', 'Steps'], ['guidance', 'CFG']]) {
    if (sourceMetadata[field] !== candidateMetadata[field]) fields.push(label);
  }
  return [...new Set(fields)];
}

export function branchChangeSummary(source, candidate) {
  const fields = branchChangeFields(source, candidate);
  if (!fields.length) return '仅注释变化';
  return fields.length <= 3 ? fields.join(' · ') : `${fields.slice(0, 2).join(' · ')} · 共 ${fields.length} 项`;
}

export function mergeResultAnnotations(source, candidate) {
  const incomingTags = new Map(getPromptScopes(candidate).flatMap((scope) => scope.tags).map((tag) => [tag.id, tag]));
  const annotate = (tag) => {
    const incoming = incomingTags.get(tag.id);
    if (!incoming) return tag;
    return { ...tag, ...Object.fromEntries(ANNOTATION_FIELDS.map((field) => [field, incoming[field] ?? tag[field] ?? ''])) };
  };
  const incomingCharacters = new Map((candidate.prompt_structure?.characters || []).map((character) => [character.id, character]));
  const structure = clone(normalizePromptStructure(source.prompt_structure, source.metadata));
  structure.base_undesired_tags = structure.base_undesired_tags.map(annotate);
  structure.characters = structure.characters.map((character) => ({
    ...character,
    label: incomingCharacters.get(character.id)?.label ?? character.label,
    prompt_tags: character.prompt_tags.map(annotate),
    undesired_tags: character.undesired_tags.map(annotate),
  }));
  return {
    ...source,
    name: String(candidate.name || source.name),
    updated_at: candidate.updated_at || source.updated_at,
    tags: (source.tags || []).map(annotate),
    prompt_structure: structure,
  };
}
