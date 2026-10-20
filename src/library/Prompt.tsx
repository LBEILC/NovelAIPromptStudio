import { createPromptDocument } from '../lib/promptDocument';
import { formatPositivePromptForCopy } from '../lib/promptStructure.js';
import type { ImageRecord } from '../shared/types';

/** 图片库"复制提示词"复制的内容（doc/design.md 2.4a）：只有一节时原样复制，有角色时照工作台的拼法。 */
export function libraryPositivePrompt(project: ImageRecord) {
  const document = createPromptDocument(project);
  const positive = document.scopes.filter((section) => section.scope.polarity === 'prompt');
  // A single base scope is copied byte-for-byte, including its surrounding whitespace.
  return positive.length === 1
    ? positive[0].scope.raw_prompt
    : formatPositivePromptForCopy(project);
}
