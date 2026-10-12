import { promptTagRanges, CATEGORY_LABELS } from '../lib/prompt.js';
import { overviewTagKey } from '../lib/promptOverview.js';
import {
  parsePromptSection,
  serializePromptSection,
  type PromptDocument,
  type PromptDocumentScope,
  type PromptSection,
} from '../lib/promptDocument';
import type { Tag } from '../shared/types';
import type { TagCategory } from '../ui';

export const categoryColors: Record<string, TagCategory> = {
  ArtistEra: 'artist-era',
  Subject: 'subject',
  Identity: 'identity',
  Body: 'body',
  Clothing: 'clothing',
  Action: 'action',
  Environment: 'environment',
  Composition: 'composition',
  StyleQuality: 'style',
  Unsorted: 'unsorted',
};
export const categoryLabel = (category: string) =>
  CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category;
export function scopeLabel(section: PromptDocumentScope) {
  if (section.scope.kind === 'base')
    return section.scope.polarity === 'prompt' ? '基础 Prompt' : '排除内容';
  return section.scope.polarity === 'prompt'
    ? section.scope.character?.label || section.scope.label
    : `${section.scope.character?.label} 的排除内容`;
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
        const merged = { ...tag, ...annotation, weight: tag.weight, tag: tag.tag } as Tag;
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
export function reparseSection(previous: PromptSection, raw: string): PromptSection {
  const next = parsePromptSection(raw);
  const unused = [...previous.blocks];
  next.blocks = next.blocks.map((block) => {
    const at = unused.findIndex((old) => old.raw === block.raw);
    if (at < 0) return block;
    const [old] = unused.splice(at, 1);
    return {
      ...block,
      ...(old.userType ? { type: old.type, userType: true, tags: old.tags } : {}),
      translation: old.translation,
    };
  });
  return next;
}
