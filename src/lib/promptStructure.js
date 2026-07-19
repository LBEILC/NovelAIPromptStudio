import { formatPrompt, formatPromptInline, parsePrompt } from './prompt.js';

const createId = () => crypto.randomUUID();

function safeObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function promptCaption(source) {
  return safeObject(source).caption || {};
}

function firstCenter(...candidates) {
  for (const candidate of candidates) {
    const center = Array.isArray(candidate) ? candidate[0] : candidate;
    if (center && Number.isFinite(Number(center.x)) && Number.isFinite(Number(center.y))) {
      return {
        x: Math.max(0, Math.min(1, Number(center.x))),
        y: Math.max(0, Math.min(1, Number(center.y))),
      };
    }
  }
  return { x: 0.5, y: 0.5 };
}

export function extractV4PromptData(raw = {}, fallbackPrompt = '', fallbackUndesired = '') {
  const positive = safeObject(raw.v4_prompt);
  const negative = safeObject(raw.v4_negative_prompt);
  const positiveCaption = promptCaption(positive);
  const negativeCaption = promptCaption(negative);
  const positiveCharacters = Array.isArray(positiveCaption.char_captions) ? positiveCaption.char_captions : [];
  const negativeCharacters = Array.isArray(negativeCaption.char_captions) ? negativeCaption.char_captions : [];
  const characterCount = Math.max(positiveCharacters.length, negativeCharacters.length);

  return {
    base_prompt_raw: typeof positiveCaption.base_caption === 'string' ? positiveCaption.base_caption : String(fallbackPrompt || ''),
    base_undesired_raw: typeof negativeCaption.base_caption === 'string' ? negativeCaption.base_caption : String(fallbackUndesired || ''),
    use_coords: Boolean(positive.use_coords),
    use_order: positive.use_order !== false,
    characters: Array.from({ length: characterCount }, (_, index) => {
      const prompt = safeObject(positiveCharacters[index]);
      const undesired = safeObject(negativeCharacters[index]);
      return {
        prompt_raw: String(prompt.char_caption || ''),
        undesired_raw: String(undesired.char_caption || ''),
        center: firstCenter(prompt.centers, undesired.centers),
      };
    }),
  };
}

function rawStructureFromMetadata(metadata = {}) {
  if (metadata.prompt_structure_raw) return metadata.prompt_structure_raw;
  const extra = safeObject(metadata.extra_json);
  const parsed = safeObject(extra.parsed);
  return extractV4PromptData(parsed, metadata.prompt_raw, metadata.negative_prompt);
}

function normalizeTag(tag, idFactory) {
  return {
    ...tag,
    id: tag?.id || idFactory(),
    tag: String(tag?.tag || ''),
    translation: String(tag?.translation || ''),
    category: tag?.category || 'Unsorted',
    weight: Number.isFinite(Number(tag?.weight)) ? Number(tag.weight) : 1,
    note: String(tag?.note || ''),
  };
}

function normalizeTags(tags, rawPrompt, idFactory) {
  const source = Array.isArray(tags) ? tags : parsePrompt(rawPrompt || '', idFactory);
  return source.map((tag) => normalizeTag(tag, idFactory));
}

export function normalizePromptStructure(structure, metadata = {}, idFactory = createId) {
  const parsedStructure = safeObject(structure);
  const metadataStructure = rawStructureFromMetadata(metadata);
  const hasStoredCharacters = Object.prototype.hasOwnProperty.call(parsedStructure, 'characters');
  const sourceCharacters = hasStoredCharacters && Array.isArray(parsedStructure.characters)
    ? parsedStructure.characters
    : metadataStructure.characters;

  return {
    base_undesired_tags: normalizeTags(
      parsedStructure.base_undesired_tags,
      metadataStructure.base_undesired_raw || metadata.negative_prompt,
      idFactory,
    ),
    use_coords: Object.prototype.hasOwnProperty.call(parsedStructure, 'use_coords')
      ? Boolean(parsedStructure.use_coords)
      : Boolean(metadataStructure.use_coords),
    use_order: Object.prototype.hasOwnProperty.call(parsedStructure, 'use_order')
      ? Boolean(parsedStructure.use_order)
      : metadataStructure.use_order !== false,
    characters: (sourceCharacters || []).slice(0, 6).map((character, index) => ({
      id: character.id || idFactory(),
      label: String(character.label || `Character ${index + 1}`),
      prompt_tags: normalizeTags(character.prompt_tags, character.prompt_raw, idFactory),
      undesired_tags: normalizeTags(character.undesired_tags, character.undesired_raw, idFactory),
      center: firstCenter(character.center, character.centers),
    })),
  };
}

export function createPromptStructure(metadata = {}, idFactory = createId) {
  return normalizePromptStructure(null, metadata, idFactory);
}

export function getPromptScopes(project) {
  const structure = project.prompt_structure || normalizePromptStructure(null, project.metadata);
  return [
    { key: 'base:prompt', kind: 'base', polarity: 'prompt', label: 'Base Prompt', tags: project.tags || [] },
    { key: 'base:undesired', kind: 'base', polarity: 'undesired', label: 'Base Undesired Content', tags: structure.base_undesired_tags || [] },
    ...structure.characters.flatMap((character, index) => [
      { key: `character:${character.id}:prompt`, kind: 'character', polarity: 'prompt', characterId: character.id, characterIndex: index, character, label: `${character.label} Prompt`, tags: character.prompt_tags },
      { key: `character:${character.id}:undesired`, kind: 'character', polarity: 'undesired', characterId: character.id, characterIndex: index, character, label: `${character.label} Undesired Content`, tags: character.undesired_tags },
    ]),
  ];
}

export function getPromptScope(project, scopeKey = 'base:prompt') {
  return getPromptScopes(project).find((scope) => scope.key === scopeKey) || getPromptScopes(project)[0];
}

export function updatePromptScope(project, scopeKey, tags) {
  if (scopeKey === 'base:prompt') return { ...project, tags };
  const structure = normalizePromptStructure(project.prompt_structure, project.metadata);
  if (scopeKey === 'base:undesired') {
    return { ...project, prompt_structure: { ...structure, base_undesired_tags: tags } };
  }
  const [, characterId, polarity] = scopeKey.split(':');
  const field = polarity === 'undesired' ? 'undesired_tags' : 'prompt_tags';
  return {
    ...project,
    prompt_structure: {
      ...structure,
      characters: structure.characters.map((character) => character.id === characterId ? { ...character, [field]: tags } : character),
    },
  };
}

export function updatePromptCharacter(project, characterId, patch) {
  const structure = normalizePromptStructure(project.prompt_structure, project.metadata);
  return {
    ...project,
    prompt_structure: {
      ...structure,
      characters: structure.characters.map((character) => character.id === characterId ? { ...character, ...patch } : character),
    },
  };
}

export function addPromptCharacter(project, idFactory = createId) {
  const structure = normalizePromptStructure(project.prompt_structure, project.metadata, idFactory);
  if (structure.characters.length >= 6) return project;
  const character = {
    id: idFactory(),
    label: `Character ${structure.characters.length + 1}`,
    prompt_tags: [],
    undesired_tags: [],
    center: { x: 0.5, y: 0.5 },
  };
  return { ...project, prompt_structure: { ...structure, characters: [...structure.characters, character] } };
}

export function removePromptCharacter(project, characterId) {
  const structure = normalizePromptStructure(project.prompt_structure, project.metadata);
  return { ...project, prompt_structure: { ...structure, characters: structure.characters.filter((character) => character.id !== characterId) } };
}

export function allPromptTags(project) {
  return getPromptScopes(project).flatMap((scope) => scope.tags);
}

export function countPromptTags(project) {
  return allPromptTags(project).length;
}

export function formatPositivePrompt(project) {
  const scopes = getPromptScopes(project).filter((scope) => scope.polarity === 'prompt');
  return scopes.map((scope) => formatPrompt(scope.tags)).filter(Boolean).join('\n|\n');
}

export function formatPositivePromptForCopy(project) {
  const scopes = getPromptScopes(project).filter((scope) => scope.polarity === 'prompt');
  return scopes.map((scope) => formatPromptInline(scope.tags)).filter(Boolean).join('\n|\n');
}

export function syncProjectPromptMetadata(project) {
  const structure = normalizePromptStructure(project.prompt_structure, project.metadata);
  return {
    ...project,
    prompt_structure: structure,
    metadata: {
      ...project.metadata,
      prompt_raw: formatPrompt(project.tags || []),
      negative_prompt: formatPrompt(structure.base_undesired_tags),
    },
  };
}

export function promptSnapshot(project) {
  return { tags: project.tags || [], prompt_structure: normalizePromptStructure(project.prompt_structure, project.metadata) };
}

export function restorePromptSnapshot(project, snapshot) {
  if (Array.isArray(snapshot)) return { ...project, tags: snapshot };
  return {
    ...project,
    tags: Array.isArray(snapshot?.tags) ? snapshot.tags : project.tags,
    prompt_structure: normalizePromptStructure(snapshot?.prompt_structure, project.metadata),
  };
}
