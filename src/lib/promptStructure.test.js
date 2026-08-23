import { describe, expect, it } from 'vitest';
import {
  addPromptCharacter,
  createPromptStructure,
  extractV4PromptData,
  formatPositivePrompt,
  formatPositivePromptForCopy,
  getPromptScope,
  getPromptScopes,
  MAX_PROMPT_CHARACTERS,
  normalizePromptStructure,
  positivePromptCopyOptions,
  positiveRawPromptScopes,
  syncProjectPromptMetadata,
  updatePromptScope,
  updatePromptScopeAnnotations,
  updatePromptCharacter,
} from './promptStructure.js';
import { parsePrompt } from './prompt.js';

describe('NovelAI V4 prompt structure', () => {
  it('extracts base, character, undesired, order, and position data', () => {
    const raw = {
      v4_prompt: {
        use_coords: true,
        use_order: true,
        caption: {
          base_caption: '2girls, outdoors',
          char_captions: [
            { char_caption: 'girl, red hair', centers: [{ x: 0.3, y: 0.5 }] },
            { char_caption: 'girl, blue hair', centers: [{ x: 0.7, y: 0.5 }] },
          ],
        },
      },
      v4_negative_prompt: {
        caption: {
          base_caption: 'lowres',
          char_captions: [
            { char_caption: 'blue hair', centers: [{ x: 0.3, y: 0.5 }] },
            { char_caption: 'red hair', centers: [{ x: 0.7, y: 0.5 }] },
          ],
        },
      },
    };
    const extracted = extractV4PromptData(raw);
    expect(extracted).toMatchObject({ base_prompt_raw: '2girls, outdoors', base_undesired_raw: 'lowres', use_coords: true, use_order: true });
    expect(extracted.characters).toEqual([
      { prompt_raw: 'girl, red hair', undesired_raw: 'blue hair', center: { x: 0.3, y: 0.5 } },
      { prompt_raw: 'girl, blue hair', undesired_raw: 'red hair', center: { x: 0.7, y: 0.5 } },
    ]);
  });

  it('creates editable prompt scopes and formats positive sections', () => {
    let id = 0;
    const idFactory = () => `id-${id++}`;
    const metadata = {
      prompt_raw: '2girls, outdoors',
      negative_prompt: 'lowres',
      prompt_structure_raw: {
        base_prompt_raw: '2girls, outdoors',
        base_undesired_raw: 'lowres',
        use_coords: true,
        characters: [{ prompt_raw: 'girl, red hair', undesired_raw: 'blue hair', center: { x: 0.3, y: 0.5 } }],
      },
    };
    const project = {
      tags: [{ id: 'base', tag: '2girls', translation: '', category: 'Subject', weight: 1, note: '' }],
      metadata,
      prompt_structure: createPromptStructure(metadata, idFactory),
    };
    expect(getPromptScopes(project).map((scope) => scope.label)).toEqual([
      'Base Prompt',
      'Base Undesired Content',
      'Character 1 Prompt',
      'Character 1 Undesired Content',
    ]);
    const characterScope = getPromptScopes(project)[2];
    const updated = updatePromptScope(project, characterScope.key, [...characterScope.tags].reverse());
    expect(getPromptScopes(updated)[2].tags.map((tag) => tag.tag)).toEqual(['red hair', 'girl']);
    expect(formatPositivePrompt(project)).toContain('|');
    expect(formatPositivePromptForCopy(project)).toBe('2girls, outdoors\n|\ngirl, red hair');
  });

  it('preserves exact raw prompt text until a structured tag is edited', () => {
    let id = 0;
    const raw = '{{{best quality, amazing quality}}}, 1girl,';
    const project = {
      tags: parsePrompt(raw, () => `brace-${id++}`),
      metadata: { prompt_raw: raw, negative_prompt: '' },
    };
    const hydrated = syncProjectPromptMetadata(project);

    expect(hydrated.metadata.prompt_raw).toBe(raw);
    expect(getPromptScope(hydrated, 'base:prompt').raw_prompt).toBe(raw);

    const annotatedTags = hydrated.tags.map((tag) => ({
      ...tag,
      category: 'Body',
      category_source: 'dso',
      translation: `译文：${tag.tag}`,
      translation_source: 'dso',
    }));
    const annotated = syncProjectPromptMetadata(updatePromptScopeAnnotations(hydrated, 'base:prompt', annotatedTags));
    expect(annotated.metadata.prompt_raw).toBe(raw);

    const editedTags = hydrated.tags.map((tag) => tag.tag === 'amazing quality' ? { ...tag, tag: 'very aesthetic' } : tag);
    const edited = syncProjectPromptMetadata(updatePromptScope(hydrated, 'base:prompt', editedTags));
    expect(edited.metadata.prompt_raw).toBe('{{{best quality, very aesthetic}}}, 1girl');

    const rawEdited = syncProjectPromptMetadata(updatePromptScope(edited, 'base:prompt', editedTags, `${raw}\n`));
    expect(rawEdited.metadata.prompt_raw).toBe(`${raw}\n`);
    expect(formatPositivePromptForCopy(rawEdited)).toBe(`${raw}\n`);
  });

  it('copies V5 natural-language and Text blocks from the raw prompt', () => {
    const base = '1girl, a sign reading "Hello, world!", Text: Hello, world!\n\n第二行，保持原样';
    const character = 'girl, She is holding the sign, without changing its punctuation.';
    const metadata = {
      prompt_raw: base,
      prompt_structure_raw: {
        base_prompt_raw: base,
        characters: [{ prompt_raw: character, undesired_raw: '', center: { x: 0.25, y: 0.75 } }],
      },
    };
    const project = { metadata, prompt_structure: createPromptStructure(metadata), tags: parsePrompt(base) };

    expect(formatPositivePromptForCopy(project)).toBe(`${base}\n|\n${character}`);
    expect(positivePromptCopyOptions(project).map((option) => option.text)).toEqual([base, character]);
  });

  it('excludes confirmed NovelAI quality tags by default and can include the generation-ready raw prompt', () => {
    const raw = '1girl, blue hair, very aesthetic, masterpiece, no text, Text: Hello';
    const metadata = {
      model: 'NovelAI Diffusion V5 0ADF9AB7',
      prompt_raw: raw,
      prompt_structure_raw: {
        base_prompt_raw: raw,
        base_undesired_raw: '',
        characters: [],
        novelai_auto: {
          model: 'NovelAI Diffusion V5 0ADF9AB7',
          quality_toggle: true,
          quality_source: 'tag_hint_qt',
          uc_preset: 0,
          uc_preset_source: 'tag_hint_uc_preset',
        },
      },
    };
    const project = { metadata, prompt_structure: createPromptStructure(metadata), tags: parsePrompt(raw) };

    expect(formatPositivePromptForCopy(project)).toBe('1girl, blue hair, Text: Hello');
    expect(formatPositivePromptForCopy(project, { includeAutomatic: true })).toBe(raw);
    expect(positivePromptCopyOptions(project)[0]).toMatchObject({ text: '1girl, blue hair, Text: Hello', count: 3, automaticCount: 3 });
    expect(positivePromptCopyOptions(project, { includeAutomatic: true })[0]).toMatchObject({ text: raw, count: 6, automaticCount: 3 });
  });

  it('excludes an exactly inferred Standard quality suffix from default copy', () => {
    const raw = '1girl, blue hair, very aesthetic, masterpiece, no text';
    const metadata = {
      model: 'NovelAI Diffusion V4.5 4BDE2A90',
      prompt_raw: raw,
      negative_prompt: '',
      prompt_structure_raw: {
        base_prompt_raw: raw,
        base_undesired_raw: '',
        characters: [],
        use_coords: false,
        use_order: true,
      },
    };
    const project = { metadata, prompt_structure: createPromptStructure(metadata), tags: parsePrompt(raw) };

    expect(formatPositivePromptForCopy(project)).toBe('1girl, blue hair');
    expect(positivePromptCopyOptions(project)[0]).toMatchObject({ count: 2, automaticCount: 3 });
    expect(formatPositivePromptForCopy(project, { includeAutomatic: true })).toBe(raw);
  });

  it('renames a character without changing imported positioning metadata', () => {
    const project = {
      metadata: { prompt_raw: '2girls' },
      prompt_structure: {
        base_prompt_raw: '2girls',
        use_coords: true,
        use_order: false,
        characters: [{ id: 'alice', label: 'Character 1', center: { x: 0.2, y: 0.8 }, prompt_tags: [], undesired_tags: [] }],
      },
      tags: parsePrompt('2girls'),
    };
    const renamed = updatePromptCharacter(project, 'alice', { label: 'Alice' });

    expect(renamed.prompt_structure).toMatchObject({ use_coords: true, use_order: false });
    expect(renamed.prompt_structure.characters[0]).toMatchObject({ label: 'Alice', center: { x: 0.2, y: 0.8 } });
  });

  it('preserves imported character prompts beyond the V4.5 six-character limit', () => {
    const characters = Array.from({ length: MAX_PROMPT_CHARACTERS }, (_, index) => ({
      prompt_raw: `character ${index + 1}`,
      undesired_raw: '',
      center: { x: 0.5, y: 0.5 },
    }));
    const metadata = {
      prompt_raw: '22 characters',
      prompt_structure_raw: { base_prompt_raw: '22 characters', characters },
    };
    const structure = normalizePromptStructure(null, metadata, (() => {
      let id = 0;
      return () => `character-${id++}`;
    })());
    const project = { metadata, prompt_structure: structure, tags: parsePrompt(metadata.prompt_raw) };

    expect(structure.characters).toHaveLength(MAX_PROMPT_CHARACTERS);
    expect(addPromptCharacter(project)).toBe(project);
    expect(structure.characters.at(-1).prompt_raw).toBe(`character ${MAX_PROMPT_CHARACTERS}`);
  });

  it('keeps raw base and character prompts separate and omits empty sections', () => {
    const project = {
      tags: parsePrompt('2girls, outdoors'),
      metadata: { prompt_raw: '2girls, outdoors', negative_prompt: '' },
      prompt_structure: {
        base_prompt_raw: '2girls, outdoors',
        base_undesired_raw: '',
        base_undesired_tags: [],
        characters: [
          { id: 'character-1', label: 'Alice', prompt_raw: 'red hair, smile', prompt_tags: parsePrompt('red hair, smile'), undesired_raw: '', undesired_tags: [], center: { x: 0.5, y: 0.5 } },
          { id: 'character-2', label: 'Bob', prompt_raw: '   ', prompt_tags: [], undesired_raw: '', undesired_tags: [], center: { x: 0.5, y: 0.5 } },
        ],
      },
    };

    expect(positiveRawPromptScopes(project).map((scope) => ({ key: scope.key, raw: scope.raw_prompt }))).toEqual([
      { key: 'base:prompt', raw: '2girls, outdoors' },
      { key: 'character:character-1:prompt', raw: 'red hair, smile' },
    ]);
  });
});
