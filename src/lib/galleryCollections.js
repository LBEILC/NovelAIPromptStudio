import { dateRangeLabel } from './dateRange.js';
import { filterGalleryProjects, normalizeGalleryFilters } from './galleryFilters.js';

export const GALLERY_COLLECTION_ACTIVE_KEY = 'novelai-prompt-studio.gallery-collection-active.v1';

export function gallerySmartCollectionDefaultName(filtersValue = {}) {
  const filters = normalizeGalleryFilters(filtersValue);
  const parts = [
    ...filters.includeTags,
    ...filters.excludeTags,
    ...filters.models,
    ...filters.vibes,
  ];
  if (filters.datePreset !== 'all') parts.push(dateRangeLabel(filters));
  return parts.slice(0, 3).join(' · ') || '\u65b0\u7684\u667a\u80fd\u6536\u85cf\u96c6';
}

export function normalizeGalleryCollection(value = {}) {
  const kind = value.kind === 'smart' ? 'smart' : 'manual';
  return {
    ...value,
    id: String(value.id || ''),
    name: String(value.name || '').trim(),
    kind,
    filters: kind === 'smart' ? normalizeGalleryFilters(value.filters) : normalizeGalleryFilters(),
    member_ids:
      kind === 'manual'
        ? [
            ...new Set(
              (Array.isArray(value.member_ids) ? value.member_ids : []).map(String).filter(Boolean),
            ),
          ]
        : [],
  };
}

export function galleryCollectionScope(projects = [], collection, nowValue = new Date()) {
  if (!collection) return projects;
  const normalized = normalizeGalleryCollection(collection);
  if (normalized.kind === 'smart')
    return filterGalleryProjects(projects, normalized.filters, nowValue);
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
