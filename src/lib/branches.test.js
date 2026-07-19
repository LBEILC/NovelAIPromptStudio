import { describe, expect, it } from 'vitest';
import { applyGenerationSnapshot, branchChangeFields, generationSnapshot, hasGenerationChanges, mergeResultAnnotations } from './branches.js';

function project() {
  return {
    id: 'result-1',
    name: 'Result',
    tags: [{ id: 'tag-1', tag: '1girl', weight: 1, translation: '一名女孩', category: 'Character', note: '' }],
    prompt_structure: { base_undesired_tags: [], use_coords: false, use_order: true, characters: [] },
    vibes: [],
    metadata: { model: 'nai-v4', seed: '12', steps: 28, sampler: 'k_euler', guidance: 5, width: 832, height: 1216 },
  };
}

describe('immutable result and branch helpers', () => {
  it('does not treat translations, categories, notes, or names as generation changes', () => {
    const source = project();
    const annotated = { ...source, name: '展示名称', tags: [{ ...source.tags[0], translation: '角色', category: 'Style', note: '保留' }] };
    expect(hasGenerationChanges(source, annotated)).toBe(false);
    expect(mergeResultAnnotations(source, annotated)).toMatchObject({ name: '展示名称', tags: [{ tag: '1girl', weight: 1, translation: '角色', category: 'Style', note: '保留' }] });
  });

  it('normalizes numeric metadata from form strings', () => {
    const source = project();
    const formValue = { ...source, metadata: { ...source.metadata, steps: '28', guidance: '5' } };
    expect(hasGenerationChanges(source, formValue)).toBe(false);
  });

  it('detects prompt and seed changes and can apply a branch snapshot without changing result identity', () => {
    const source = project();
    const edited = { ...source, tags: [{ ...source.tags[0], weight: 1.2 }], metadata: { ...source.metadata, seed: '99' } };
    expect(hasGenerationChanges(source, edited)).toBe(true);
    expect(branchChangeFields(source, edited)).toEqual(['Prompt', 'Seed']);
    const branchView = applyGenerationSnapshot(source, generationSnapshot(edited));
    expect(branchView).toMatchObject({ id: 'result-1', tags: [{ weight: 1.2 }], metadata: { seed: '99' } });
  });

  it('treats character position changes as generation changes', () => {
    const source = project();
    source.prompt_structure.characters = [{ id: 'character-1', label: '角色 1', center: { x: 0.3, y: 0.5 }, prompt_tags: [], undesired_tags: [] }];
    const moved = structuredClone(source);
    moved.prompt_structure.characters[0].center = { x: 0.7, y: 0.5 };
    expect(hasGenerationChanges(source, moved)).toBe(true);
    expect(branchChangeFields(source, moved)).toContain('Prompt');
  });

  it('treats output dimensions as one generation field', () => {
    const source = project();
    const resized = { ...source, metadata: { ...source.metadata, width: 1216, height: 832 } };
    expect(branchChangeFields(source, resized)).toEqual(['Size']);
    expect(hasGenerationChanges(source, resized)).toBe(true);
  });
});
