import { describe, expect, it } from 'vitest';
import {
  createPromptDocument,
  setPromptBlockType,
  promptDocumentProject,
  serializePromptSection,
} from '../lib/promptDocument';
import { createPromptStructure, syncProjectPromptMetadata } from '../lib/promptStructure.js';
import { parsePrompt } from '../lib/prompt.js';
import { documentTags, replaceSection, reparseSection } from './document';

describe('workbench block persistence', () => {
  it('preserves a chosen type and paragraph translation across normalization and JSON round trips', () => {
    const raw =
      'sky, river\r\n\r\nThe small boat floats across the calm water under the evening sky.';
    const metadata = { prompt_raw: raw };
    const initial = {
      metadata,
      tags: parsePrompt(raw),
      prompt_structure: createPromptStructure(metadata),
    };
    let doc = createPromptDocument(initial);
    doc = replaceSection(doc, 0, setPromptBlockType(doc.scopes[0], 0, 'paragraph'));
    doc.scopes[0].blocks[0].translation = '天空，河流';
    const project = syncProjectPromptMetadata(promptDocumentProject(doc));
    const restored = createPromptDocument(JSON.parse(JSON.stringify(project)));
    expect(restored.scopes[0].blocks[0]).toMatchObject({
      type: 'paragraph',
      userType: true,
      translation: '天空，河流',
    });
    expect(serializePromptSection(restored.scopes[0])).toBe(raw);
    const reparsed = reparseSection(restored.scopes[0], `clouds\n\n${raw}`);
    expect(reparsed.blocks[1]).toMatchObject({ type: 'paragraph', translation: '天空，河流' });
    expect(initial.prompt_structure).not.toHaveProperty('block_annotations');
  });
  it('maps duplicate tag annotations by their raw positions rather than tag text', () => {
    const raw = 'sky, sky\n\nriver, sky';
    const metadata = { prompt_raw: raw };
    const tags = parsePrompt(raw).map((tag, index) => ({
      ...tag,
      translation: `合成译文 ${index}`,
    }));
    const doc = createPromptDocument({
      metadata,
      tags,
      prompt_structure: createPromptStructure(metadata),
    });
    expect(documentTags(doc).map((entry) => entry.tag.translation)).toEqual(
      tags.map((tag) => tag.translation),
    );
    expect(new Set(documentTags(doc).map((entry) => entry.key)).size).toBe(4);
  });
});
