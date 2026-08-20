import { expandSearch, normalizeSearch } from './prompt.js';
import { allPromptTags } from './promptStructure.js';

export const GALLERY_DATE_PRESETS = [
  { label: '不限时间', value: 'all' },
  { label: '今天', value: 'today' },
  { label: '最近 7 天', value: '7d' },
  { label: '最近 30 天', value: '30d' },
  { label: '最近 90 天', value: '90d' },
  { label: '今年', value: 'year' },
  { label: '自定义范围', value: 'custom' },
];

const DATE_PRESET_VALUES = new Set(GALLERY_DATE_PRESETS.map((item) => item.value));
export const GALLERY_NO_VIBE_VALUE = '__no_vibe__';
export const GALLERY_UNKNOWN_MODEL_VALUE = '__unknown_model__';

export const DEFAULT_GALLERY_FILTERS = Object.freeze({
  query: '',
  includeTags: [],
  excludeTags: [],
  tagMatch: 'all',
  models: [],
  vibes: [],
  datePreset: 'all',
  dateFrom: '',
  dateTo: '',
});

function uniqueStrings(values = []) {
  const output = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const cleaned = String(value || '').trim();
    const key = normalizeSearch(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
  }
  return output;
}

export function normalizeGalleryFilters(value = {}) {
  return {
    query: String(value.query || ''),
    includeTags: uniqueStrings(value.includeTags),
    excludeTags: uniqueStrings(value.excludeTags),
    tagMatch: value.tagMatch === 'any' ? 'any' : 'all',
    models: uniqueStrings(value.models),
    vibes: uniqueStrings(value.vibes),
    datePreset: DATE_PRESET_VALUES.has(value.datePreset) ? value.datePreset : 'all',
    dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(String(value.dateFrom || '')) ? String(value.dateFrom) : '',
    dateTo: /^\d{4}-\d{2}-\d{2}$/.test(String(value.dateTo || '')) ? String(value.dateTo) : '',
  };
}

export function galleryProjectVibe(project) {
  return String(project?.vibe_fingerprint || project?.metadata?.vibe_fingerprint || '').trim();
}

function projectSearchValues(project) {
  return [
    project.name,
    ...allPromptTags(project).flatMap((tag) => [tag.tag, tag.translation]),
  ].map(normalizeSearch).filter(Boolean);
}

function projectTagValues(project) {
  return new Set(allPromptTags(project).flatMap((tag) => [tag.tag, tag.translation]).map(normalizeSearch).filter(Boolean));
}

function startOfLocalDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseLocalDate(value, end = false) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (end) date.setDate(date.getDate() + 1);
  return date;
}

export function galleryDateBounds(filtersValue, nowValue = new Date()) {
  const filters = normalizeGalleryFilters(filtersValue);
  const now = new Date(nowValue);
  if (filters.datePreset === 'all' || Number.isNaN(now.getTime())) return { from: null, to: null };
  if (filters.datePreset === 'custom') {
    return {
      from: parseLocalDate(filters.dateFrom),
      to: parseLocalDate(filters.dateTo, true),
    };
  }
  const from = startOfLocalDay(now);
  if (filters.datePreset === '7d') from.setDate(from.getDate() - 6);
  if (filters.datePreset === '30d') from.setDate(from.getDate() - 29);
  if (filters.datePreset === '90d') from.setDate(from.getDate() - 89);
  if (filters.datePreset === 'year') from.setMonth(0, 1);
  const to = startOfLocalDay(now);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

function projectMatchesNormalizedFilters(project, filters, needles, dateBounds) {
  if (needles.length) {
    const values = projectSearchValues(project);
    if (!values.some((value) => needles.some((needle) => value.includes(needle)))) return false;
  }

  const tags = projectTagValues(project);
  const includes = filters.includeTags.map(normalizeSearch);
  if (includes.length) {
    const matches = (tag) => tags.has(tag);
    if (filters.tagMatch === 'all' ? !includes.every(matches) : !includes.some(matches)) return false;
  }
  if (filters.excludeTags.map(normalizeSearch).some((tag) => tags.has(tag))) return false;

  const model = normalizeSearch(project.metadata?.model) || GALLERY_UNKNOWN_MODEL_VALUE;
  if (filters.models.length && !filters.models.map(normalizeSearch).includes(model)) return false;

  const vibe = galleryProjectVibe(project) || GALLERY_NO_VIBE_VALUE;
  if (filters.vibes.length && !filters.vibes.map(normalizeSearch).includes(normalizeSearch(vibe))) return false;

  const { from, to } = dateBounds;
  if (from || to) {
    const importedAt = new Date(project.created_at || 0);
    if (Number.isNaN(importedAt.getTime())) return false;
    if (from && importedAt < from) return false;
    if (to && importedAt >= to) return false;
  }
  return true;
}

export function galleryProjectMatchesFilters(project, filtersValue, nowValue = new Date()) {
  const filters = normalizeGalleryFilters(filtersValue);
  return projectMatchesNormalizedFilters(project, filters, expandSearch(filters.query), galleryDateBounds(filters, nowValue));
}

export function filterGalleryProjects(projects = [], filtersValue, nowValue = new Date()) {
  const filters = normalizeGalleryFilters(filtersValue);
  const needles = expandSearch(filters.query);
  const dateBounds = galleryDateBounds(filters, nowValue);
  return projects.filter((project) => projectMatchesNormalizedFilters(project, filters, needles, dateBounds));
}

function countedOptions(projects, valuesForProject) {
  const entries = new Map();
  for (const project of projects) {
    const projectValues = new Map(valuesForProject(project).map((item) => [normalizeSearch(item.value), item]));
    for (const [key, item] of projectValues) {
      if (!key) continue;
      const current = entries.get(key) || { ...item, count: 0 };
      current.count += 1;
      entries.set(key, current);
    }
  }
  return [...entries.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN', { numeric: true }));
}

export function galleryFilterOptions(projects = []) {
  const tags = countedOptions(projects, (project) => allPromptTags(project).map((tag) => ({
    label: String(tag.translation || '').trim() && normalizeSearch(tag.translation) !== normalizeSearch(tag.tag)
      ? `${tag.tag} · ${tag.translation}`
      : String(tag.tag || '').trim(),
    value: String(tag.tag || '').trim(),
  })));
  const models = countedOptions(projects, (project) => [{
    label: String(project.metadata?.model || '').trim() || '未知模型',
    value: String(project.metadata?.model || '').trim() || GALLERY_UNKNOWN_MODEL_VALUE,
  }]);
  const vibes = countedOptions(projects, (project) => {
    const fingerprint = galleryProjectVibe(project);
    return [{
      label: fingerprint ? `Vibe ${fingerprint.slice(0, 8)}` : '无 Vibe',
      value: fingerprint || GALLERY_NO_VIBE_VALUE,
    }];
  });
  return { tags, models, vibes };
}

export function galleryActiveFilterCount(filtersValue) {
  const filters = normalizeGalleryFilters(filtersValue);
  return [
    filters.includeTags.length > 0,
    filters.excludeTags.length > 0,
    filters.models.length > 0,
    filters.vibes.length > 0,
    filters.datePreset !== 'all',
  ].filter(Boolean).length;
}

export function hasActiveGalleryFilters(filtersValue, includeQuery = true) {
  const filters = normalizeGalleryFilters(filtersValue);
  return galleryActiveFilterCount(filters) > 0 || (includeQuery && Boolean(filters.query.trim()));
}
