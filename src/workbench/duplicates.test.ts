import { describe, expect, it } from 'vitest';
import { createPromptDocument, serializePromptSection } from '../lib/promptDocument';
import type { ImageProject } from '../shared/types';
import { blockDuplicates, removeTextDuplicates, textDuplicates } from './duplicates';
import { documentTags } from './model';
import { deleteTags } from './edits';

const project = (base: string, negative = '') =>
  ({
    prompt_structure: { base_prompt_raw: base, characters: [], undesired_raw: negative },
    tags: [],
  }) as unknown as ImageProject;

describe('块方式的重复 Tag', () => {
  it('同一节里后出现的算重复，忽略大小写、下划线和括号', () => {
    const doc = createPromptDocument(
      project('rain, long_hair, street\n\nRain, long hair, {street}'),
    );
    const entries = documentTags(doc);
    const dups = blockDuplicates(doc, entries);
    const tags = [...dups.keys()].map((k) => entries.find((e) => e.key === k)!.tag.tag);
    expect(tags).toEqual(['Rain', 'long hair', 'street']);
    const street = entries.find((e) => e.tag.tag === 'street' && e.block === 1)!;
    expect(dups.get(street.key)!.removable).toBe(false);
    expect(dups.get(street.key)!.note).toContain('权重不同');
    const rain = entries.find((e) => e.tag.tag === 'Rain')!;
    expect(dups.get(rain.key)!.removable).toBe(true);
    expect(dups.get(rain.key)!.note).toBe('和第 1 块重复');
  });
  it('同一块里写"这一块前面已经有"，跨节不算', () => {
    const doc = createPromptDocument(project('rain, street, rain', 'rain, lowres'));
    const entries = documentTags(doc);
    const dups = blockDuplicates(doc, entries);
    expect(dups.size).toBe(1);
    expect([...dups.values()][0].note).toBe('这一块前面已经有');
  });
  it('去掉能去掉的，保留第一个和权重不同的', () => {
    const doc = createPromptDocument(project('rain, street, 1.2::rain::, rain, street'));
    const entries = documentTags(doc);
    const dups = blockDuplicates(doc, entries);
    const removable = entries.filter((e) => dups.get(e.key)?.removable);
    const next = deleteTags(doc, removable);
    expect(serializePromptSection(next.scopes[0])).toBe('rain, street, 1.2::rain::');
  });
});

describe('文本方式的重复 Tag', () => {
  it('找到重复的位置和行号', () => {
    const list = textDuplicates('rain, street\n\nRAIN, 1.2::street::');
    expect(list.map((d) => [d.tag, d.line, d.removable])).toEqual([
      ['RAIN', 3, true],
      ['street', 3, false],
    ]);
  });
  it('段落和随机块不参与', () => {
    const paragraph = 'a girl is standing in the rain at the old bus stop';
    expect(textDuplicates(`rain\n\n${paragraph}\n\n${paragraph}`)).toEqual([]);
    expect(textDuplicates('__画师池__, __画师池__')).toEqual([]);
  });
  it('去掉重复的，逗号和空格跟着收拾好', () => {
    expect(removeTextDuplicates('a, rain, b, rain')).toBe('a, rain, b');
    expect(removeTextDuplicates('rain, x, rain, y')).toBe('rain, x, y');
    expect(removeTextDuplicates('a, b\nrain, c\nrain, d')).toBe('a, b\nrain, c\nd');
    expect(removeTextDuplicates('rain, {rain}, rain')).toBe('rain, {rain}');
  });
});
