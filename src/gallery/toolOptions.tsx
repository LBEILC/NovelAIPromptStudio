import { dateRangeLabel } from '../lib/dateRange.js';
import { GALLERY_UNKNOWN_MODEL_VALUE } from '../lib/galleryFilters.js';
import { groupModelOptions } from '../library/presentation';
import type { GalleryFilters } from '../shared/types';

export const ROW = { min: 120, max: 360, step: 20 };

export const SIM = { min: 70, max: 95, step: 5 };

export const SORTS = [
  ['recent', '最近导入的在前'],
  ['oldest', '最早导入的在前'],
  ['name', '按名称'],
] as const;

export const GROUPS = [
  ['work', '按作品'],
  ['prompt', '按提示词'],
  ['separate', '不分组'],
] as const;

export const PROMPT_SCOPES = [
  ['full', '完全相同'],
  ['base', '基础相同'],
  ['similar', '相似'],
] as const;

export const COVERS = [
  ['origin', '原图'],
  ['earliest', '最早生成'],
  ['latest', '最新生成'],
] as const;

export const MERGE_HELP: Record<string, string> = {
  separate: '每张图片单独显示。',
  work: '同一个作品生成的图合并为一组；其他图片提示词完全相同的合并为一组。',
  full: '提示词完全相同的图片合并为一组。',
  base: '基础提示词的 Tag 足够接近的图片合并为一组，不考虑角色提示词和位置。',
  similar: '提示词相似度达到下方数值的图片合并为一组。',
};

export type Chip = {
  key: string;
  label: string;
  value: string;
  mono: boolean;
  tip?: string;
  clear: () => void;
};

export function filterCount(f: GalleryFilters) {
  return (
    f.includeTags.length +
    f.excludeTags.length +
    groupModelOptions(f.models.map((value) => ({ label: value, value }))).length +
    f.vibes.length +
    Number(f.datePreset !== 'all') +
    Number(f.nsfw !== 'any')
  );
}

export function chipList(
  f: GalleryFilters,
  onChange: (patch: Partial<GalleryFilters>) => void,
): Chip[] {
  const out: Chip[] = [];
  const inc = f.tagMatch === 'any' && f.includeTags.length > 1 ? '包含任意' : '包含';
  for (const t of f.includeTags)
    out.push({
      key: `inc-${t}`,
      label: inc,
      value: t,
      mono: true,
      clear: () => onChange({ includeTags: f.includeTags.filter((x) => x !== t) }),
    });
  for (const t of f.excludeTags)
    out.push({
      key: `exc-${t}`,
      label: '排除',
      value: t,
      mono: true,
      clear: () => onChange({ excludeTags: f.excludeTags.filter((x) => x !== t) }),
    });
  for (const m of groupModelOptions(
    f.models.map((value) => ({
      label: value === GALLERY_UNKNOWN_MODEL_VALUE ? '未知模型' : value,
      value,
    })),
  ))
    out.push({
      key: `m-${m.label}`,
      label: '模型',
      value: m.label,
      mono: false,
      tip: m.values.length > 1 ? m.values.join('\n') : undefined,
      clear: () => onChange({ models: f.models.filter((v) => !m.values.includes(v)) }),
    });
  for (const v of f.vibes)
    out.push({
      key: `v-${v}`,
      label: 'Vibe',
      value: v === '__no_vibe__' ? '无' : v,
      mono: v !== '__no_vibe__',
      clear: () => onChange({ vibes: f.vibes.filter((x) => x !== v) }),
    });
  if (f.datePreset !== 'all')
    out.push({
      key: 'time',
      label: '时间',
      value: dateRangeLabel(f),
      mono: f.datePreset === 'custom',
      clear: () => onChange({ datePreset: 'all', dateFrom: '', dateTo: '' }),
    });
  // 图片模糊（1.8.3，2.37）：一次挑出来检查和修正标记
  if (f.nsfw !== 'any')
    out.push({
      key: 'nsfw',
      label: 'NSFW',
      value: f.nsfw === 'nsfw' ? '是' : '不是',
      mono: false,
      clear: () => onChange({ nsfw: 'any' }),
    });
  return out;
}
