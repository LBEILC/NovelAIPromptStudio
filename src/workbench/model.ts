import { promptTagRanges, parsePrompt, CATEGORY_LABELS } from '../lib/prompt.js';
import { overviewTagKey } from '../lib/promptOverview.js';
import {
  parsePromptSection,
  serializePromptSection,
  type PromptDocument,
  type PromptDocumentScope,
  type PromptSection,
} from '../lib/promptDocument.ts';
import type { Tag } from '../shared/types';

export const categoryLabel = (category: string) =>
  CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category;
export function scopeLabel(section: PromptDocumentScope) {
  return section.scope.label;
}
export interface DocumentTag {
  key: string;
  section: number;
  block: number;
  index: number;
  tag: Tag;
  automatic: boolean;
}
export function documentTags(document: PromptDocument): DocumentTag[] {
  return document.scopes.flatMap((section, si) => {
    const ranges = promptTagRanges(serializePromptSection(section));
    return section.blocks.flatMap((block, bi) => {
      const local = promptTagRanges(block.content);
      return block.tags.map((tag, index) => {
        const at = block.contentRange.start + local[index].start;
        const position = ranges.findIndex((range) => range.start === at);
        const annotation = section.scope.tags[position];
        // 权重、括号层数以这次解析的原文为准（存下来的注解可能是旧的，比如 1.5.0 以前不认中括号）
        const merged = {
          ...tag,
          ...annotation,
          weight: tag.weight,
          brace_depth: tag.brace_depth,
          tag: tag.tag,
        } as Tag;
        return {
          key: overviewTagKey(section.scope.key, merged.id),
          section: si,
          block: bi,
          index,
          tag: merged,
          automatic:
            ['confirmed', 'inferred'].includes(section.scope.automation?.status || '') &&
            !!section.scope.automation?.tagIds.includes(merged.id),
        };
      });
    });
  });
}
export function replaceSection(
  document: PromptDocument,
  index: number,
  section: PromptSection,
): PromptDocument {
  return {
    ...document,
    scopes: document.scopes.map((current, si) =>
      si === index ? { ...current, ...section } : current,
    ),
  };
}
export function reparseSection(
  previous: PromptSection,
  raw: string,
  textMode = false,
): PromptSection {
  const next = parsePromptSection(raw);
  if (textMode)
    next.blocks = next.blocks.map((block) => {
      if (block.type === 'random') return block;
      const type =
        !block.content.includes(',') && block.content.trim().split(/\s+/).length > 8
          ? 'paragraph'
          : 'tags';
      return {
        ...block,
        type,
        textLayout: true,
        userType: true,
        tags: type === 'tags' ? parsePrompt(block.content) : [],
      };
    });
  const unused = [...previous.blocks];
  next.blocks = next.blocks.map((block) => {
    const at = unused.findIndex((old) => old.raw === block.raw);
    if (at < 0) return block;
    const [old] = unused.splice(at, 1);
    return {
      ...block,
      ...(old.userType ? { type: old.type, userType: true, tags: old.tags } : {}),
      translation: old.translation,
      displayLabel: old.displayLabel,
      textLayout: block.textLayout || old.textLayout,
    };
  });
  return next;
}
