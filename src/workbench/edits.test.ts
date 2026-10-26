import { describe, expect, it } from 'vitest';
import {
  createPromptDocument,
  editPromptTag,
  promptDocumentProject,
  serializePromptSection,
} from '../lib/promptDocument';
import { createPromptStructure } from '../lib/promptStructure.js';
import { parsePrompt } from '../lib/prompt.js';
import { documentTags } from './model';
import { closeWeightBefore, deleteTags, insertTags, moveTags } from './edits';
function fixture(raw: string) {
  const metadata = { prompt_raw: raw, negative_prompt: 'noise' };
  return createPromptDocument({
    metadata,
    tags: parsePrompt(raw),
    prompt_structure: createPromptStructure(metadata),
  });
}
describe('minimal workbench tag edits', () => {
  it('closes a weight group that ran into the next numeric opener', () => {
    const doc = fixture('0.8::artist:yajuu,artist:ask (askzy),0.8::artists:ningen mame::, rain');
    const tags = documentTags(doc).filter((t) => t.section === 0);
    expect(tags.map((t) => t.tag.syntax_issue || '')).toEqual(['', '', 'unclosed_weight', '']);
    const next = closeWeightBefore(doc, tags[2]);
    const raw = serializePromptSection(next.scopes[0]);
    expect(raw).toBe('0.8::artist:yajuu,artist:ask (askzy)::,0.8::artists:ningen mame::, rain');
    expect(parsePrompt(raw).map((t) => [t.tag, t.weight, t.syntax_issue])).toEqual([
      ['artist:yajuu', 0.8, ''],
      ['artist:ask (askzy)', 0.8, ''],
      ['artists:ningen mame', 0.8, ''],
      ['rain', 1, ''],
    ]);
  });
  it('changes one leaf without rewriting unrelated spacing or weight syntax', () => {
    const doc = fixture('  1.5::sky,  river::, {clouds}\r\n\r\nsoft light');
    const next = editPromptTag(doc.scopes[0], 0, 1, { tag: 'lake' });
    expect(serializePromptSection(next)).toBe('  1.5::sky,  lake::, {clouds}\r\n\r\nsoft light');
    expect(serializePromptSection(doc.scopes[0])).toContain('river');
  });
  it('moves from a shared weight group across blocks and keeps untouched leaf weights', () => {
    const doc = fixture('1.5::sky,  river::, {clouds}\n\nsoft light, fog');
    const next = moveTags(doc, [documentTags(doc)[1]], { section: 0, block: 1, index: 1 });
    const raw = serializePromptSection(next.scopes[0]);
    // 移走组里的一个以后不留空项（用户 10-21：拖动后留下 ", ,"）
    expect(raw.startsWith('1.5::sky::, {clouds}\n\n')).toBe(true);
    expect(parsePrompt(raw).map((tag) => [tag.tag, tag.weight, tag.brace_depth])).toEqual([
      ['sky', 1.5, 0],
      ['clouds', 1, 1],
      ['soft light', 1, 0],
      ['river', 1.5, 0],
      ['fog', 1, 0],
    ]);
  });
  it('deletes several leaves in descending order and adds to an empty tag block', () => {
    const doc = fixture('sky, river, clouds');
    const deleted = deleteTags(doc, documentTags(doc));
    expect(parsePrompt(serializePromptSection(deleted.scopes[0]))).toEqual([]);
    const inserted = insertTags(deleted, 0, 0, 'fog, mist');
    expect(promptDocumentProject(inserted).tags?.map((tag) => tag.tag)).toEqual(['fog', 'mist']);
  });
  it('rejects cross-polarity moves atomically', () => {
    const doc = fixture('sky, river');
    expect(() => moveTags(doc, [documentTags(doc)[0]], { section: 1, block: 0 })).toThrow(
      RangeError,
    );
    expect(serializePromptSection(doc.scopes[0])).toBe('sky, river');
  });
  it('keeps translation and category attached to the moved leaf', () => {
    const doc = fixture('sky, river\n\nsoft light, fog');
    doc.scopes[0].scope.tags[1].translation = '河流';
    doc.scopes[0].scope.tags[1].category = 'Environment';
    const next = moveTags(doc, [documentTags(doc)[1]], { section: 0, block: 1 });
    const moved = promptDocumentProject(next).tags?.find((tag) => tag.tag === 'river');
    expect(moved).toMatchObject({ translation: '河流', category: 'Environment' });
    expect(serializePromptSection(next.scopes[0])).toBe('sky\n\nsoft light, fog, river');
  });
});
