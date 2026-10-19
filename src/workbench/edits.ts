import {
  editPromptBlockText,
  editPromptTag,
  serializePromptSection,
  createPromptDocument,
  promptDocumentProject,
  type PromptDocument,
} from '../lib/promptDocument.ts';
import { formatTag, promptTagRanges } from '../lib/prompt.js';
import { replaceSection, reparseSection, type DocumentTag } from './model.ts';

export function insertTags(
  document: PromptDocument,
  sectionIndex: number,
  blockIndex: number,
  text: string,
  before?: number,
): PromptDocument {
  const section = document.scopes[sectionIndex];
  if (blockIndex < 0)
    return replaceSection(
      document,
      sectionIndex,
      reparseSection(
        section,
        serializePromptSection(section) + (section.blocks.length ? '\n\n' : '') + text,
      ),
    );
  const block = section.blocks[blockIndex];
  const ranges = promptTagRanges(block.content);
  const range = before == null ? undefined : ranges[before];
  let content: string;
  if (!range) content = block.content + (block.content.trim() ? ', ' : '') + text;
  else {
    const close = [...range.wrappers]
      .reverse()
      .map((wrapper) => wrapper.close)
      .join('');
    const open = range.wrappers.map((wrapper) => wrapper.open).join('');
    content =
      block.content.slice(0, range.start) +
      (close ? `${close}, ` : '') +
      text +
      ', ' +
      open +
      block.content.slice(range.start);
  }
  return replaceSection(document, sectionIndex, editPromptBlockText(section, blockIndex, content));
}
export function deleteTags(document: PromptDocument, entries: DocumentTag[]): PromptDocument {
  return [...entries]
    .sort((a, b) => b.section - a.section || b.block - a.block || b.index - a.index)
    .reduce(
      (next, entry) =>
        replaceSection(
          next,
          entry.section,
          editPromptTag(next.scopes[entry.section], entry.block, entry.index, { delete: true }),
        ),
      document,
    );
}
export function moveTags(
  document: PromptDocument,
  entries: DocumentTag[],
  target: { section: number; block: number; index?: number },
): PromptDocument {
  if (!entries.length) return document;
  const polarity = document.scopes[target.section].scope.polarity;
  if (entries.some((entry) => document.scopes[entry.section].scope.polarity !== polarity))
    throw new RangeError('正面与负面 Tag 不能混合移动');
  if (
    entries.some(
      (entry) =>
        entry.section === target.section &&
        entry.block === target.block &&
        entry.index === target.index,
    )
  )
    return document;
  const before =
    target.index == null
      ? undefined
      : target.index -
        entries.filter(
          (entry) =>
            entry.section === target.section &&
            entry.block === target.block &&
            entry.index < target.index!,
        ).length;
  const text = entries.map((entry) => formatTag(entry.tag)).join(', ');
  const deleted = deleteTags(document, entries);
  const insertionIndex =
    before ??
    (target.block < 0
      ? 0
      : promptTagRanges(deleted.scopes[target.section].blocks[target.block].content).length);
  const next = insertTags(deleted, target.section, target.block, text, before);
  const section = next.scopes[target.section];
  const block = section.blocks[target.block < 0 ? section.blocks.length - 1 : target.block];
  const position = block.contentRange.start + promptTagRanges(block.content)[insertionIndex].start;
  const offset = promptTagRanges(serializePromptSection(section)).findIndex(
    (range) => range.start === position,
  );
  const result = createPromptDocument(promptDocumentProject(next));
  result.scopes[target.section].scope.tags = result.scopes[target.section].scope.tags.map(
    (tag, index) => {
      const moved = entries[index - offset]?.tag;
      return moved
        ? {
            ...tag,
            translation: moved.translation,
            translation_source: moved.translation_source,
            category: moved.category,
            category_source: moved.category_source,
            note: moved.note,
          }
        : tag;
    },
  );
  return result;
}
