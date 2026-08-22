import { describe, expect, it } from 'vitest';
import { parsePrompt } from './prompt.js';
import { getPromptScopes } from './promptStructure.js';

function projectFixture({
  model = 'NovelAI Diffusion V5 0ADF9AB7',
  prompt = '',
  undesired = '',
  qualityToggle = null,
  qualitySource = 'tag_hint_qt',
  ucPreset = null,
  ucPresetSource = 'tag_hint_uc_preset',
} = {}) {
  let id = 0;
  const createId = () => `tag-${id++}`;
  return {
    metadata: { model, prompt_raw: prompt, negative_prompt: undesired },
    tags: parsePrompt(prompt, createId),
    prompt_structure: {
      base_prompt_raw: prompt,
      base_undesired_raw: undesired,
      base_undesired_tags: parsePrompt(undesired, createId),
      characters: [],
      use_coords: false,
      use_order: true,
      novelai_auto: {
        model,
        quality_toggle: qualityToggle,
        quality_source: qualityToggle === null ? '' : qualitySource,
        uc_preset: ucPreset,
        uc_preset_source: ucPreset === null ? '' : ucPresetSource,
        params_version: 1,
      },
    },
  };
}

describe('NovelAI automatic prompt recognition', () => {
  it('confirms V4.5 Full automatic quality tags and removes only their suffix', () => {
    const project = projectFixture({
      model: 'nai-diffusion-4-5-full',
      prompt: '1girl, blue hair, location, very aesthetic, masterpiece, no text',
      qualityToggle: true,
      qualitySource: 'qualityToggle',
    });
    const automation = getPromptScopes(project)[0].automation;

    expect(automation).toMatchObject({ status: 'confirmed', modelLabel: 'V4.5 Full', tagCount: 4, cleanedRaw: '1girl, blue hair' });
    expect(automation.tagIds).toHaveLength(4);
  });

  it('recognizes V5 tag hints before a generated Text block', () => {
    const project = projectFixture({
      prompt: 'A sign beside the girl, very aesthetic, masterpiece, no text, teXt: Hello, world!\n\n第二行',
      qualityToggle: true,
    });
    const automation = getPromptScopes(project)[0].automation;

    expect(automation).toMatchObject({
      status: 'confirmed',
      modelLabel: 'V5',
      tagCount: 3,
      cleanedRaw: 'A sign beside the girl, teXt: Hello, world!\n\n第二行',
    });
  });

  it('does not remove matching user tags when the quality toggle is explicitly disabled', () => {
    const prompt = '1girl, very aesthetic, masterpiece, no text';
    const automation = getPromptScopes(projectFixture({ prompt, qualityToggle: false }))[0].automation;
    expect(automation).toMatchObject({ status: 'disabled', cleanedRaw: '', tagIds: [] });
  });

  it('matches the weighted V4.5 Curated quality template without losing its tag identities', () => {
    const project = projectFixture({
      model: 'nai-diffusion-4-5-curated',
      prompt: '1girl, location, masterpiece, no text, -0.8::feet::, rating:general',
      qualityToggle: true,
      qualitySource: 'qualityToggle',
    });
    const automation = getPromptScopes(project)[0].automation;
    expect(automation).toMatchObject({ status: 'confirmed', modelLabel: 'V4.5 Curated', cleanedRaw: '1girl', tagCount: 5 });
    expect(automation.tagIds).toHaveLength(5);
  });

  it('infers an exact model template without a metadata hint', () => {
    const prompt = '1girl, very aesthetic, masterpiece, no text';
    const automation = getPromptScopes(projectFixture({ prompt }))[0].automation;
    expect(automation).toMatchObject({ status: 'inferred', label: 'Standard', cleanedRaw: '1girl', tagCount: 3 });
  });

  it('matches the V4.5 Standard compatibility suffix and Heavy UC within custom content', () => {
    const heavy = 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
    const project = projectFixture({
      model: 'NovelAI Diffusion V4.5 4BDE2A90',
      prompt: '1girl, {{{custom quality tags}}}, very aesthetic, masterpiece, no text',
      undesired: `nsfw, ${heavy}, custom exclusion`,
    });
    const [quality, undesired] = getPromptScopes(project).slice(0, 2).map((scope) => scope.automation);

    expect(quality).toMatchObject({
      status: 'inferred',
      label: 'Standard',
      modelLabel: 'V4.5 Full',
      cleanedRaw: '1girl, {{{custom quality tags}}}',
    });
    expect(quality.tagIds).toHaveLength(3);
    expect(undesired).toMatchObject({
      status: 'inferred',
      label: 'Heavy',
      cleanedRaw: 'nsfw, custom exclusion',
    });
    expect(undesired.tagIds).toHaveLength(17);
  });

  it('recognizes V5 Heavy, Light, and Human Focus UC hints by their exact prefix', () => {
    const heavy = 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
    const light = 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page';
    const human = `${heavy}, @_@, mismatched pupils, glowing eyes, bad anatomy`;

    for (const [label, preset, template] of [['Heavy', 2, heavy], ['Light', 3, light], ['Human Focus', 4, human]]) {
      const project = projectFixture({ undesired: `${template}, custom exclusion`, ucPreset: preset });
      const automation = getPromptScopes(project)[1].automation;
      expect(automation).toMatchObject({ status: 'confirmed', label, cleanedRaw: 'custom exclusion' });
      expect(automation.tagIds.length).toBeGreaterThan(0);
    }
  });

  it('treats V5 UC hint zero as disabled even when user text resembles a preset', () => {
    const heavy = 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
    const automation = getPromptScopes(projectFixture({ undesired: heavy, ucPreset: 0 }))[1].automation;
    expect(automation.status).toBe('suspected');
  });

  it('reports an enabled V5 hint with a modified template as a mismatch', () => {
    const automation = getPromptScopes(projectFixture({ prompt: '1girl, masterpiece', qualityToggle: true }))[0].automation;
    expect(automation).toMatchObject({ status: 'mismatch', tagIds: [] });
  });
});
