// Tag 分类：颜色变量名（--cat-*）和中文名，图片库、工作台、翻译词典共用。
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../lib/prompt.js';
import type { TagCategory } from '../shared/types';

export const CAT_VAR: Record<TagCategory, string> = {
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
export const CAT_NAME = CATEGORY_LABELS as Record<TagCategory, string>;
export const CATEGORIES = CATEGORY_OPTIONS as TagCategory[];
export const catKey = (c?: string | null) =>
  CAT_VAR[(c as TagCategory) || 'Unsorted'] || 'unsorted';
export const catColor = (c?: string | null) => `var(--cat-${catKey(c)})`;
