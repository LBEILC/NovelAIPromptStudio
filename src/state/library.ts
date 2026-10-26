import { useEffect, useState } from 'react';
import type { LibraryCard, Collection, GalleryFilters } from '../shared/types';
import { DEFAULT_GALLERY_FILTERS } from '../lib/galleryFilters.js';
import { readGalleryGrouping } from '../lib/galleryGrouping.js';

let libraryCards: LibraryCard[] = [];
const cardListeners = new Set<() => void>();
export const libraryNsfwState = (id: string) => libraryCards.find((card) => card.id === id)?.nsfw;
export function subscribeLibraryCards(listener: () => void) {
  cardListeners.add(listener);
  return () => {
    cardListeners.delete(listener);
  };
}

export function useLibraryState(initialView = 'all') {
  const [projectsByView, setProjectsByView] = useState<Record<string, LibraryCard[]>>({
    all: [],
    trash: [],
  });
  useEffect(() => {
    libraryCards = projectsByView.all;
    for (const listener of cardListeners) listener();
  }, [projectsByView.all]);
  useEffect(
    () =>
      window.studio?.onCommandEvent((event) => {
        if (event.type !== 'nsfw-changed') return;
        setProjectsByView((current) =>
          Object.fromEntries(
            Object.entries(current).map(([view, cards]) => [
              view,
              cards.map((card) =>
                event.states[card.id] ? { ...card, nsfw: event.states[card.id] } : card,
              ),
            ]),
          ),
        );
      }),
    [],
  );
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
