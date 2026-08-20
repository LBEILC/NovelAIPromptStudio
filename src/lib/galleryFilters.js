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

const PROJECT_FILTER_INDEX = new WeakMap();

function projectFilterIndex(project) {
  const cached = PROJECT_FILTER_INDEX.get(project);
  if (cached) return cached;
  const tags = allPromptTags(project);
  const modelValue = String(project.metadata?.model || '').trim() || GALLERY_UNKNOWN_MODEL_VALUE;
  const vibeValue = galleryProjectVibe(project) || GALLERY_NO_VIBE_VALUE;
  const index = {
    importedAt: new Date(project.created_at || 0).getTime(),
    model: normalizeSearch(modelValue),
    modelValue,
    optionTags: tags.map((tag) => ({
      label: String(tag.translation || '').trim() && normalizeSearch(tag.translation) !== normalizeSearch(tag.tag)
        ? `${tag.tag} · ${tag.translation}`
        : String(tag.tag || '').trim(),
      value: String(tag.tag || '').trim(),
    })),
    searchValues: [
      project.name,
      ...tags.flatMap((tag) => [tag.tag, tag.translation]),
    ].map(normalizeSearch).filter(Boolean),
    tagValues: new Set(tags.flatMap((tag) => [tag.tag, tag.translation]).map(normalizeSearch).filter(Boolean)),
    vibe: normalizeSearch(vibeValue),
    vibeValue,
  };
  PROJECT_FILTER_INDEX.set(project, index);
  return index;
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

function compileGalleryFilters(filtersValue, nowValue) {
  const filters = normalizeGalleryFilters(filtersValue);
  const compiled = {
    dateBounds: galleryDateBounds(filters, nowValue),
    excludeTags: filters.excludeTags.map(normalizeSearch),
    filters,
    includeTags: filters.includeTags.map(normalizeSearch),
    models: new Set(filters.models.map(normalizeSearch)),
    needles: expandSearch(filters.query),
    vibes: new Set(filters.vibes.map(normalizeSearch)),
  };
  compiled.active = Boolean(
    compiled.needles.length
    || compiled.includeTags.length
    || compiled.excludeTags.length
    || compiled.models.size
    || compiled.vibes.size
    || compiled.dateBounds.from
    || compiled.dateBounds.to,
  );
  return compiled;
}

function projectMatchesCompiledFilters(project, compiled) {
  if (!compiled.active) return true;
  const index = projectFilterIndex(project);
  if (compiled.needles.length) {
    if (!index.searchValues.some((value) => compiled.needles.some((needle) => value.includes(needle)))) return false;
  }

  if (compiled.includeTags.length) {
    const matches = (tag) => index.tagValues.has(tag);
    if (compiled.filters.tagMatch === 'all'
      ? !compiled.includeTags.every(matches)
      : !compiled.includeTags.some(matches)) return false;
  }
  if (compiled.excludeTags.some((tag) => index.tagValues.has(tag))) return false;

  if (compiled.models.size && !compiled.models.has(index.model)) return false;

  if (compiled.vibes.size && !compiled.vibes.has(index.vibe)) return false;

  const { from, to } = compiled.dateBounds;
  if (from || to) {
    if (Number.isNaN(index.importedAt)) return false;
    if (from && index.importedAt < from.getTime()) return false;
    if (to && index.importedAt >= to.getTime()) return false;
  }
  return true;
}

export function galleryProjectMatchesFilters(project, filtersValue, nowValue = new Date()) {
  return projectMatchesCompiledFilters(project, compileGalleryFilters(filtersValue, nowValue));
}

export function filterGalleryProjects(projects = [], filtersValue, nowValue = new Date()) {
  const compiled = compileGalleryFilters(filtersValue, nowValue);
  if (!compiled.active) return projects;
  return projects.filter((project) => projectMatchesCompiledFilters(project, compiled));
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
  const tags = countedOptions(projects, (project) => projectFilterIndex(project).optionTags);
  const models = countedOptions(projects, (project) => [{
    label: projectFilterIndex(project).modelValue === GALLERY_UNKNOWN_MODEL_VALUE
      ? '未知模型'
      : projectFilterIndex(project).modelValue,
    value: projectFilterIndex(project).modelValue,
  }]);
  const vibes = countedOptions(projects, (project) => {
    const fingerprint = projectFilterIndex(project).vibeValue;
    return [{
      label: fingerprint === GALLERY_NO_VIBE_VALUE ? '无 Vibe' : `Vibe ${fingerprint.slice(0, 8)}`,
      value: fingerprint,
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
