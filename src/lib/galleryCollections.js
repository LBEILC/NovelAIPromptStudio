import { filterGalleryProjects, normalizeGalleryFilters } from './galleryFilters.js';

export const GALLERY_COLLECTION_ACTIVE_KEY = 'novelai-prompt-studio.gallery-collection-active.v1';

const SMART_COLLECTION_DATE_NAMES = {
  today: '今天导入',
  '7d': '最近 7 天',
  '30d': '最近 30 天',
  '90d': '最近 90 天',
  year: '今年导入',
  custom: '指定时间',
};

function shortName(value, length = 24) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function gallerySmartCollectionDefaultName(filtersValue = {}) {
  const filters = normalizeGalleryFilters(filtersValue);
  const parts = [];
  if (filters.query.trim()) parts.push(`搜索 ${shortName(filters.query)}`);
  if (filters.includeTags.length) {
    const tags = filters.includeTags.slice(0, 2).map((tag) => shortName(tag, 18)).join('、');
    parts.push(`${filters.tagMatch === 'any' ? '任含' : '包含'} ${tags}${filters.includeTags.length > 2 ? ' 等' : ''}`);
  }
  if (filters.models.length) parts.push(filters.models.length === 1 ? shortName(filters.models[0]) : `${filters.models.length} 个模型`);
  if (filters.vibes.length) parts.push(filters.vibes.length === 1 ? '指定 Vibe' : `${filters.vibes.length} 个 Vibe`);
  if (filters.datePreset !== 'all') parts.push(SMART_COLLECTION_DATE_NAMES[filters.datePreset] || '指定时间');
  if (!parts.length && filters.excludeTags.length) parts.push(`排除 ${shortName(filters.excludeTags[0], 18)}`);
  return shortName(parts.slice(0, 2).join(' · ') || '智能收藏集', 80);
}

export function normalizeGalleryCollection(value = {}) {
  const kind = value.kind === 'smart' ? 'smart' : 'manual';
  return {
    ...value,
    id: String(value.id || ''),
    name: String(value.name || '').trim(),
    kind,
    filters: kind === 'smart' ? normalizeGalleryFilters(value.filters) : normalizeGalleryFilters(),
    member_ids: kind === 'manual'
      ? [...new Set((Array.isArray(value.member_ids) ? value.member_ids : []).map(String).filter(Boolean))]
      : [],
  };
}

export function galleryCollectionScope(projects = [], collection, nowValue = new Date()) {
  if (!collection) return projects;
  const normalized = normalizeGalleryCollection(collection);
  if (normalized.kind === 'smart') return filterGalleryProjects(projects, normalized.filters, nowValue);
  const members = new Set(normalized.member_ids);
  return projects.filter((project) => members.has(project.id));
}

export function galleryCollectionImageCount(projects = [], collection, nowValue = new Date()) {
  return galleryCollectionScope(projects, collection, nowValue).length;
}

export function readActiveGalleryCollection(storage, collections = []) {
  try {
    const id = String(storage?.getItem(GALLERY_COLLECTION_ACTIVE_KEY) || '');
    return collections.some((collection) => collection.id === id) ? id : '';
  } catch {
    return '';
  }
}

export function writeActiveGalleryCollection(storage, id) {
  const normalized = String(id || '');
  try {
    if (normalized) storage?.setItem(GALLERY_COLLECTION_ACTIVE_KEY, normalized);
    else storage?.removeItem(GALLERY_COLLECTION_ACTIVE_KEY);
  } catch {
    // Keep collection selection usable when local storage is unavailable.
  }
  return normalized;
}
