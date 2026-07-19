import { applyGenerationSnapshot, branchChangeFields } from './branches.js';
import { getPromptScopes } from './promptStructure.js';

function isRandomSeed(value) {
  return ['', '-1', 'random', '随机'].includes(String(value ?? '').trim().toLocaleLowerCase('en-US'));
}

function withoutRawSyntax(project) {
  const cleanTags = (tags = []) => tags.map((tag) => ({ ...tag, raw_segment: '', syntax_issue: '' }));
  const structure = project.prompt_structure || {};
  return {
    ...project,
    tags: cleanTags(project.tags),
    prompt_structure: {
      ...structure,
      base_undesired_tags: cleanTags(structure.base_undesired_tags),
      characters: (structure.characters || []).map((character) => ({
        ...character,
        prompt_tags: cleanTags(character.prompt_tags),
        undesired_tags: cleanTags(character.undesired_tags),
      })),
    },
  };
}

function promptSummary(project) {
  const tags = getPromptScopes(project).flatMap((scope) => scope.tags);
  const sample = tags.slice(0, 3).map((tag) => `${Number(tag.weight ?? 1).toFixed(2)}× ${tag.tag}`).join(', ');
  return `${tags.length} Tags${sample ? ` · ${sample}${tags.length > 3 ? '…' : ''}` : ''}`;
}

function vibeSummary(project) {
  const vibes = (project.vibes || []).filter((vibe) => vibe.enabled);
  const sample = vibes.slice(0, 2).map((vibe) => vibe.name || vibe.library_id || 'Vibe').join(', ');
  return `${vibes.length} Vibe${sample ? ` · ${sample}${vibes.length > 2 ? '…' : ''}` : ''}`;
}

function differenceDetails(differences, expected, actual) {
  const metadataFields = { Seed: 'seed', Model: 'model', Sampler: 'sampler', Steps: 'steps', CFG: 'guidance' };
  return differences.map((field) => {
    if (field === 'Prompt') return { field, expected: promptSummary(expected), actual: promptSummary(actual) };
    if (field === 'Vibe') return { field, expected: vibeSummary(expected), actual: vibeSummary(actual) };
    if (field === 'Size') return { field, expected: `${expected.metadata?.width || '—'} × ${expected.metadata?.height || '—'}`, actual: `${actual.metadata?.width || '—'} × ${actual.metadata?.height || '—'}` };
    const metadataField = metadataFields[field];
    return { field, expected: String(expected.metadata?.[metadataField] ?? '—'), actual: String(actual.metadata?.[metadataField] ?? '—') };
  });
}

export function compareBranchResult(snapshot, resultProject) {
  const expected = applyGenerationSnapshot(resultProject, snapshot);
  if (isRandomSeed(snapshot?.metadata?.seed)) {
    expected.metadata = { ...expected.metadata, seed: resultProject.metadata?.seed ?? '' };
  }
  const differences = branchChangeFields(withoutRawSyntax(expected), withoutRawSyntax(resultProject));
  return {
    status: differences.length ? 'mismatch' : 'matched',
    differences,
    details: differenceDetails(differences, expected, resultProject),
    actualSeed: String(resultProject.metadata?.seed ?? ''),
  };
}
