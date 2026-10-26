import { expect, it } from 'vitest';
import { parseRandomMarker, formatRandomMarker, randomSyntaxNote } from './randomPrompt';
import {
  parsePromptSection,
  serializePromptSection,
  createPromptDocument,
  copyPromptDocument,
  promptDocumentProject,
} from './promptDocument';
import { createPromptStructure } from './promptStructure.js';
import { reparseSection } from '../workbench/model';

it.each([
  ['__画师池__', { pool: '画师池', count: 1, repeat: false }],
  ['__Artist Pool*2__', { pool: 'Artist Pool', count: 2, repeat: false }],
  ['__画师池*2r__', { pool: '画师池', count: 2, repeat: true }],
  [
    '__画师池*2~0.8-1.2__',
    { pool: '画师池', count: 2, repeat: false, weight: { min: 0.8, max: 1.2, step: 0.05 } },
  ],
  [
    '__画师池*2~0.8-1.2/0.1__',
    { pool: '画师池', count: 2, repeat: false, weight: { min: 0.8, max: 1.2, step: 0.1 } },
  ],
] as const)('parses and roundtrips %s', (text, options) => {
  expect(parseRandomMarker(text)).toEqual(options);
  expect(parseRandomMarker(formatRandomMarker(options))).toEqual(options);
});
it.each([
  '__bad_name__',
  '__a*0__',
  '__a*17__',
  '__a*1.2__',
  '__a~2-1__',
  '__a~0-1__',
  '__a~1-4__',
  '__a~1-2/0__',
  '__a~1-2/2__',
  '__a',
  '____',
])('rejects malformed %s', (text) => {
  expect(() => parseRandomMarker(text)).toThrow();
  const section = parsePromptSection(text);
  expect(section.blocks.some((block) => block.syntaxNote)).toBe(true);
});
it('preserves adjacent weights, parentheses and multiple markers byte for byte', () => {
  const text = '1.2::rain::, (__Action*2r__), {cloud}, __Scene~0.8-1.2/0.1__\r\n\r\nsoft light';
  const section = parsePromptSection(text);
  expect(section.blocks.filter((block) => block.type === 'random')).toHaveLength(2);
  expect(serializePromptSection(section)).toBe(text);
  expect(
    section.blocks.filter((block) => block.type === 'random').every((block) => !block.syntaxNote),
  ).toBe(true);
  expect(serializePromptSection(parsePromptSection(serializePromptSection(section)))).toBe(text);
  const textMode = reparseSection(section, text, true);
  expect(
    textMode.blocks.filter((block) => block.type === 'random').map((block) => block.random),
  ).toEqual(section.blocks.filter((block) => block.type === 'random').map((block) => block.random));
});
it('annotates missing pools, oversized draws and negative markers', () => {
  expect(randomSyntaxNote('__missing__', [])).toContain('找不到随机池');
  expect(
    randomSyntaxNote('__A*2__', [
      { name: 'A', entries: [{ id: 'x', text: 'standing', chance: 1 }] },
    ]),
  ).toContain('条目数');
  const section = parsePromptSection('__A__', { negative: true });
  expect(section.blocks[0]).toMatchObject({
    type: 'paragraph',
    syntaxNote: '负面提示词不能使用随机块',
  });
});
it('keeps templates intact across documents and copy', () => {
  const metadata = { prompt_raw: '__Action*2r~0.8-1.2/0.1__', negative_prompt: '' };
  const project = { metadata, prompt_structure: createPromptStructure(metadata), tags: [] };
  const doc = createPromptDocument(project);
  expect(copyPromptDocument(doc)).toBe(metadata.prompt_raw);
  expect(promptDocumentProject(doc).prompt_structure.base_prompt_raw).toBe(metadata.prompt_raw);
});
