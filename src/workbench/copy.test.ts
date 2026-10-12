import { describe, it, expect } from 'vitest';
import {
  createPromptDocument,
  copyVisiblePromptDocument,
  setPromptBlockType,
  promptDocumentProject,
} from '../lib/promptDocument';
import { createPromptStructure } from '../lib/promptStructure.js';
import { parsePrompt } from '../lib/prompt.js';
const fixture = () => {
  const raw =
    '  sky,  river\n\nA quiet traveler is waiting beside the lake, and the moon shines on the water.';
  const metadata = { prompt_raw: raw, negative_prompt: ' noise , blurry ' };
  return createPromptDocument({
    metadata,
    tags: parsePrompt(raw),
    prompt_structure: createPromptStructure(metadata),
  });
};
describe('block-aware filtered copy', () => {
  it('copies a matching paragraph from raw text without comma normalization', () => {
    const doc = fixture();
    doc.scopes[0] = { ...doc.scopes[0], ...setPromptBlockType(doc.scopes[0], 1, 'paragraph') };
    const result = copyVisiblePromptDocument(doc, {
      filters: { query: 'traveler', category: 'All', polarity: 'all', domain: 'all' },
    });
    expect(result.text).toBe(doc.scopes[0].blocks[1].raw);
    expect(result.count).toBe(0);
  });
  it('preserves complete visible negative block whitespace', () => {
    const doc = fixture();
    expect(
      copyVisiblePromptDocument(doc, {
        filters: { query: '', category: 'All', polarity: 'undesired', domain: 'all' },
      }).text,
    ).toBe(' noise , blurry ');
  });
  it('persists manually chosen types and translation without changing original bytes', () => {
    const doc = fixture();
    doc.scopes[0] = { ...doc.scopes[0], ...setPromptBlockType(doc.scopes[0], 0, 'paragraph') };
    doc.scopes[0].blocks[0].translation = '合成译文';
    const restored = createPromptDocument(promptDocumentProject(doc));
    expect(restored.scopes[0].blocks[0]).toMatchObject({
      type: 'paragraph',
      translation: '合成译文',
      raw: '  sky,  river',
    });
  });
});
