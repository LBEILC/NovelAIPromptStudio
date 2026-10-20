import { it, expect } from 'vitest';
import { versionDiff, diffSummary, oneLine } from './versionDiff';
import { createPromptStructure, addPromptCharacter } from './promptStructure.js';
import { parsePrompt } from './prompt.js';
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
