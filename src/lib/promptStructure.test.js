import { describe, expect, it } from 'vitest';
import {
  createPromptStructure,
  extractV4PromptData,
  formatPositivePrompt,
  formatPositivePromptForCopy,
  getPromptScope,
  getPromptScopes,
  syncProjectPromptMetadata,
  updatePromptScope,
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
    expect(formatPositivePromptForCopy(project)).toBe('2girls\n|\ngirl, red hair');
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

    const editedTags = hydrated.tags.map((tag) => tag.tag === 'amazing quality' ? { ...tag, tag: 'very aesthetic' } : tag);
    const edited = syncProjectPromptMetadata(updatePromptScope(hydrated, 'base:prompt', editedTags));
    expect(edited.metadata.prompt_raw).toBe('{{{best quality, very aesthetic}}}, 1girl');

    const rawEdited = syncProjectPromptMetadata(updatePromptScope(edited, 'base:prompt', editedTags, `${raw}\n`));
    expect(rawEdited.metadata.prompt_raw).toBe(`${raw}\n`);
  });
});
