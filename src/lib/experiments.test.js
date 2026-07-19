import { describe, expect, it } from 'vitest';
import { analyzeExperiment, moveExperimentMember } from './experiments.js';

function result(id, patch = {}) {
  return {
    id,
    ...patch,
    tags: [{ tag: '1girl', weight: 1 }],
    prompt_structure: { base_undesired_tags: [], use_coords: false, use_order: true, characters: [] },
    vibes: [],
    ...(patch.tags ? { tags: patch.tags } : {}),
    metadata: { seed: '42', model: 'nai-v4', sampler: 'k_euler', steps: 28, guidance: 5, width: 832, height: 1216, ...patch.metadata },
  };
}

describe('experiment analysis', () => {
  it('detects a controlled single-variable comparison', () => {
    const analysis = analyzeExperiment(result('base'), [result('base'), result('variant', { metadata: { seed: '99' } })]);
    expect(analysis).toMatchObject({ status: 'single', variableFields: ['Seed'], incompleteFields: [] });
    expect(analysis.fixedFields).toEqual(expect.arrayContaining(['Prompt', 'Vibe', 'Model', 'Sampler', 'Steps', 'CFG']));
  });

  it('reorders non-baseline members while keeping the baseline first', () => {
    expect(moveExperimentMember(['base', 'a', 'b', 'c'], 'c', 'a', 'base')).toEqual(['base', 'c', 'a', 'b']);
    expect(moveExperimentMember(['base', 'a', 'b'], 'a', 'base', 'base')).toEqual(['base', 'a', 'b']);
    expect(moveExperimentMember(['base', 'a', 'b'], 'base', 'b', 'base')).toEqual(['base', 'a', 'b']);
  });

  it('marks mixed variables and does not claim empty metadata is fixed', () => {
    const baseline = result('base', { metadata: { seed: '', model: '' } });
    const variant = result('variant', { tags: [{ tag: '2girls', weight: 1 }], metadata: { seed: '', model: '', guidance: 7 } });
    const analysis = analyzeExperiment(baseline, [variant]);
    expect(analysis.status).toBe('mixed');
    expect(analysis.variableFields).toEqual(expect.arrayContaining(['Prompt', 'CFG']));
    expect(analysis.incompleteFields).toEqual(expect.arrayContaining(['Seed', 'Model']));
    expect(analysis.fixedFields).not.toEqual(expect.arrayContaining(['Seed', 'Model']));
  });
});
