import { describe, expect, it } from 'vitest';
import { buildRelationshipGroups, relationshipGroupsForProject } from './relationships.js';

function tag(value) {
  return { tag: value, weight: 1 };
}

function project(id, { prompt = ['1girl'], character = [], seed = '', model = 'nai-diffusion-4-full', sampler = 'k_euler', steps = 28, guidance = 5, width = 832, height = 1216, vibes = [] } = {}) {
  return {
    id,
    name: id,
    tags: prompt.map(tag),
    prompt_structure: { base_undesired_tags: [], characters: character.map((value) => ({ id: value, prompt_tags: [tag(value)], undesired_tags: [] })) },
    metadata: { seed, model, sampler, steps, guidance, width, height },
    vibes,
  };
}

describe('relationship groups', () => {
  it('finds a precise same-prompt different-seed group', () => {
    const groups = buildRelationshipGroups([project('a', { seed: '1' }), project('b', { seed: '2' })]);
    expect(groups[0]).toMatchObject({ exact: true, member_ids: ['a', 'b'] });
    expect(groups[0].conditions).toContain('同 Prompt · Seed 不同');
    expect(groups[0].changed_fields).toEqual(['Seed']);
  });

  it('does not interpret missing seeds as the same seed', () => {
    const groups = buildRelationshipGroups([
      project('a', { seed: '', prompt: ['1girl'] }),
      project('b', { seed: '', prompt: ['landscape'] }),
    ]);
    expect(groups.some((group) => group.conditions.includes('同 Seed · Prompt 不同'))).toBe(false);
  });

  it('finds base and character relationships and only returns groups for the requested image', () => {
    const projects = [
      project('a', { character: ['alice'], seed: '1' }),
      project('b', { character: ['bob'], seed: '2' }),
      project('c', { prompt: ['landscape'], character: ['bob'], seed: '3' }),
    ];
    const forA = relationshipGroupsForProject(projects, 'a');
    expect(forA.some((group) => group.conditions.includes('同 Base Prompt · Character 不同'))).toBe(true);
    expect(forA.every((group) => group.member_ids.includes('a'))).toBe(true);
    expect(buildRelationshipGroups(projects).some((group) => group.conditions.includes('同 Character · Base Prompt 不同'))).toBe(true);
  });

  it('groups matching Vibe sources without conflating different usage settings', () => {
    const source = { source_image_hash: 'abc', enabled: true };
    const groups = buildRelationshipGroups([
      project('a', { seed: '1', vibes: [{ ...source, strength: 0.4, information_extracted: 0.7 }] }),
      project('b', { seed: '2', vibes: [{ ...source, strength: 0.8, information_extracted: 0.7 }] }),
    ]);
    expect(groups.some((group) => group.conditions.includes('同 Vibe 来源 · 使用配置可能不同'))).toBe(true);
    expect(groups.some((group) => group.conditions.includes('同 Vibe 配置 · Prompt / 参数有变化'))).toBe(false);
  });

  it('excludes deleted images and one-member groups', () => {
    const deleted = { ...project('b', { seed: '2' }), deleted_at: new Date().toISOString() };
    expect(buildRelationshipGroups([project('a', { seed: '1' }), deleted])).toEqual([]);
  });
});
