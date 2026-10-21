import { it, expect } from 'vitest';
import { versionDiff, diffSummary, oneLine } from './versionDiff';
import { createPromptStructure, addPromptCharacter } from './promptStructure.js';
import { parsePrompt } from './prompt.js';
import {
  createPromptDocument,
  editPromptBlockText,
  promptDocumentProject,
  setPromptBlockType,
} from './promptDocument';
import type { ImageProject } from '../shared/types';
const project = (prompt: string, negative = 'lowres') => {
  const metadata = {
    prompt_raw: prompt,
    negative_prompt: negative,
    model: 'nai-diffusion-5-full',
    width: 832,
    height: 1216,
  };
  return {
    metadata,
    tags: parsePrompt(prompt),
    prompt_structure: createPromptStructure(metadata),
  } as ImageProject;
};
it('puts dimensions first and keeps a bounded change summary', () => {
  const a = project('rain'),
    b = project('rain, blue sky, yellow clouds, bright sunshine, soft light, mountain, river');
  b.metadata.width = 1216;
  b.metadata.height = 832;
  const d = versionDiff(a, b);
  expect(diffSummary(d).split('\n')[0]).toBe('尺寸 832×1216→1216×832');
  expect(diffSummary(d)).toContain('等 6 处');
  expect(oneLine(d)).toBe('尺寸 832×1216→1216×832');
});
it('describes weights, negative tags and order without treating them as additions', () => {
  expect(diffSummary(versionDiff(project('rain'), project('1.3::rain::')))).toBe('rain 1.0→1.3');
  expect(oneLine(versionDiff(project('rain'), project('rain', 'lowres, blurry')))).toBe(
    '负面 +blurry',
  );
  expect(diffSummary(versionDiff(project('rain, cloud'), project('cloud, rain')))).toBe(
    '调整了顺序',
  );
});
it('summarizes a paragraph in one sentence and keeps its full comparison', () => {
  const a = project(
      'Scene: The traveler stands beside the window while the evening light fills the quiet room.',
    ),
    b = project(
      'Scene: The traveler sits beside the window while the evening light fills the quiet room.',
    );
  const d = versionDiff(a, b);
  expect(d.paras).toHaveLength(1);
  expect(oneLine(d)).toBe('改写了“Scene”段落');
  expect(d.paras[0].old).toContain('stands');
  expect(d.paras[0].now).toContain('sits');
});

it('uses character and negative prefixes from the approved summary rules', () => {
  const a = addPromptCharacter(project('rain')) as ImageProject;
  const b = structuredClone(a);
  b.prompt_structure.characters[0].undesired_raw = 'blurry';
  b.prompt_structure.characters[0].undesired_tags = parsePrompt('blurry');
  expect(oneLine(versionDiff(a, b))).toBe('角色 1 负面 +blurry');
});
it('pairs a repeated tag by occurrence instead of merging it by name', () => {
  const same = '0.8::artist:kushima yu::, rain, 1.1::artist:kushima yu::';
  expect(versionDiff(project(same), project(same)).empty).toBe(true);
  expect(
    diffSummary(
      versionDiff(
        project(same),
        project('0.8::artist:kushima yu::, rain, 1.3::artist:kushima yu::'),
      ),
    ),
  ).toBe('artist:kushima yu 1.1→1.3');
});
it('lists second-layer parameter and reference changes beside the size', () => {
  const params = {
    model: 'nai-diffusion-4-5-full',
    effort: 'High',
    steps: 28,
    scale: 5,
    rescale: 0,
    sampler: 'k_euler_ancestral',
    noise: 'karras',
    quality: 'On',
    uc: 'Heavy',
    aiPositions: true,
    positions: [],
  } as unknown as NonNullable<ImageProject['params']>;
  const vibe = {
    id: 'v1',
    name: 'a',
    thumbnail: null,
    file: null,
    strength: 0.6,
    information: 1,
    encode: null,
  };
  const a = {
      ...project('rain'),
      params,
      references: { vibes: [vibe], precise: [] },
    } as ImageProject,
    b = {
      ...project('rain'),
      params: { ...params, steps: 29, rescale: 0.2 },
      references: { vibes: [vibe, { ...vibe, id: 'v2' }], precise: [] },
    } as ImageProject;
  const d = versionDiff(a, b);
  expect(d.params).toEqual(['步数 28→29', 'Rescale 0.00→0.20', 'Vibe 1→2']);
  expect(d.empty).toBe(false);
  expect(oneLine(d)).toBe('步数 28→29 · Rescale 0.00→0.20 · Vibe 1→2');
  expect(versionDiff(a, { ...a }).empty).toBe(true);
  const tuned = {
    ...a,
    references: { vibes: [{ ...vibe, strength: 0.8 }], precise: [] },
  } as ImageProject;
  expect(versionDiff(a, tuned).params).toEqual(['调整了参考图']);
});
it('ignores block conversions, which do not change the prompt that is sent', () => {
  const a = project('rain, umbrella, bus stop\n\nsoft light, film grain');
  const doc = createPromptDocument(a);
  const converted = (text?: string) =>
    promptDocumentProject({
      ...doc,
      scopes: doc.scopes.map((s, i) =>
        i === 0
          ? {
              ...s,
              ...(text
                ? editPromptBlockText(setPromptBlockType(s, 0, 'paragraph'), 1, text)
                : setPromptBlockType(s, 0, 'paragraph')),
            }
          : s,
      ),
    }) as ImageProject;
  expect(versionDiff(a, converted()).empty).toBe(true);
  expect(oneLine(versionDiff(a, converted('soft light, film grain, fog')))).toBe('+fog');
});
