import { describe, expect, it } from 'vitest';
import { generationSnapshot } from './branches.js';
import { compareBranchResult } from './branchMatching.js';

function result(seed = '42') {
  return {
    id: 'result',
    tags: [{ id: 'tag', tag: '1girl', weight: 1 }],
    prompt_structure: { base_undesired_tags: [], use_coords: false, use_order: true, characters: [] },
    vibes: [],
    metadata: { model: 'nai-v4', seed, steps: 28, sampler: 'k_euler', guidance: 5 },
  };
}

describe('branch result matching', () => {
  it('recognizes an exact generation recipe match', () => {
    expect(compareBranchResult(generationSnapshot(result()), result())).toEqual({ status: 'matched', differences: [], actualSeed: '42' });
  });

  it('reports differing generation fields', () => {
    const actual = result('99');
    actual.tags = [{ ...actual.tags[0], weight: 1.2 }];
    expect(compareBranchResult(generationSnapshot(result()), actual)).toMatchObject({ status: 'mismatch', differences: ['Prompt', 'Seed'] });
  });

  it('treats an empty recipe seed as random', () => {
    const recipe = result('');
    expect(compareBranchResult(generationSnapshot(recipe), result('918273'))).toMatchObject({ status: 'matched', actualSeed: '918273' });
  });

  it('matches normalized prompt syntax rather than raw formatting', () => {
    const recipe = result();
    recipe.tags[0].raw_segment = '1girl';
    const actual = result();
    actual.tags[0].raw_segment = '1::1girl::';
    expect(compareBranchResult(generationSnapshot(recipe), actual)).toMatchObject({ status: 'matched', differences: [] });
  });
});
