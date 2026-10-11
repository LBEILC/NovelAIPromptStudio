import { useEffect, useState } from 'react';
import type { LibraryCard, Collection, GalleryFilters } from '../shared/types';
import { DEFAULT_GALLERY_FILTERS } from '../lib/galleryFilters.js';
import { readGalleryGrouping } from '../lib/galleryGrouping.js';

export function useLibraryState(initialView = 'all') {
  const [projectsByView, setProjectsByView] = useState<Record<string, LibraryCard[]>>({
    all: [],
    trash: [],
  });
  const [galleryCollections, setGalleryCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState('');
  const [editingSmartCollectionId, setEditingSmartCollectionId] = useState('');
  const [galleryView, setGalleryView] = useState(initialView);
  const [libraryLoadingByView, setLibraryLoadingByView] = useState<Record<string, boolean>>({
    all: true,
    trash: false,
  });
  const [galleryFilters, setGalleryFilters] = useState<GalleryFilters>(DEFAULT_GALLERY_FILTERS);
  const [sort, setSort] = useState(() => {
    try {
      const value = localStorage.getItem('novelai-prompt-studio.gallery-sort.v1');
      return ['recent', 'oldest', 'name'].includes(value || '') ? value! : 'recent';
    } catch {
      return 'recent';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('novelai-prompt-studio.gallery-sort.v1', sort);
    } catch {
      /* Session preference remains usable. */
    }
  }, [sort]);
  const [galleryGrouping, setGalleryGrouping] = useState(() =>
    readGalleryGrouping(globalThis.localStorage),
  );
  const [previewGroupId, setPreviewGroupId] = useState('');
  const [previewProjectId, setPreviewProjectId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  return {
    projectsByView,
    setProjectsByView,
    galleryCollections,
    setGalleryCollections,
    activeCollectionId,
    setActiveCollectionId,
    editingSmartCollectionId,
    setEditingSmartCollectionId,
    galleryView,
    setGalleryView,
    libraryLoadingByView,
    setLibraryLoadingByView,
    galleryFilters,
    setGalleryFilters,
    sort,
    setSort,
    galleryGrouping,
    setGalleryGrouping,
    previewGroupId,
    setPreviewGroupId,
    previewProjectId,
    setPreviewProjectId,
    selectedGroupIds,
    setSelectedGroupIds,
  };
}
