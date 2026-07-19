import { applyGenerationSnapshot, branchChangeFields } from './branches.js';

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

export function compareBranchResult(snapshot, resultProject) {
  const expected = applyGenerationSnapshot(resultProject, snapshot);
  if (isRandomSeed(snapshot?.metadata?.seed)) {
    expected.metadata = { ...expected.metadata, seed: resultProject.metadata?.seed ?? '' };
  }
  const differences = branchChangeFields(withoutRawSyntax(expected), withoutRawSyntax(resultProject));
  return {
    status: differences.length ? 'mismatch' : 'matched',
    differences,
    actualSeed: String(resultProject.metadata?.seed ?? ''),
  };
}
