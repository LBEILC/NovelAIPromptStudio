import { useCallback, useEffect, useRef } from 'react';
import { invokeResult, invokeUI } from '../lib/commands';
import {
  normalizeGalleryCollection,
  readActiveGalleryCollection,
  writeActiveGalleryCollection,
} from '../lib/galleryCollections.js';
import { createCoalescedRefresh, createDeferredLibraryRefresh } from '../lib/libraryRefresh';
import type { Collection } from '../shared/types';
import type { useAppState } from './state';
export function useLibraryLoading({
  libraryRequestsRef,
  setLibraryLoadingByView,
  setDetachedRecords,
  setProjectsByView,
  loadedLibraryViewsRef,
  showToast,
  hydrateProject,
  setGalleryCollections,
  setActiveCollectionId,
  page,
}: Pick<
  ReturnType<typeof useAppState>,
  | 'libraryRequestsRef'
  | 'setLibraryLoadingByView'
  | 'setDetachedRecords'
  | 'setProjectsByView'
  | 'loadedLibraryViewsRef'
  | 'showToast'
  | 'hydrateProject'
  | 'setGalleryCollections'
  | 'setActiveCollectionId'
  | 'page'
>) {
  const refreshers = useRef<
    Partial<Record<'all' | 'trash', ReturnType<typeof createCoalescedRefresh>>>
  >({});
  const deferredRefresh = useRef(createDeferredLibraryRefresh());
  const loadLibrary = useCallback(
    async (view = 'all', source: 'user' | 'background' = 'user') => {
      const targetView = view === 'trash' ? 'trash' : 'all';
      const requestId = (libraryRequestsRef.current[targetView] || 0) + 1;
      libraryRequestsRef.current[targetView] = requestId;
      if (source === 'user' || !loadedLibraryViewsRef.current.has(targetView))
        setLibraryLoadingByView((current) => ({ ...current, [targetView]: true }));
      if (targetView === 'trash')
        void invokeUI('trash.detached', {}).then(
          (r) =>
            libraryRequestsRef.current.trash === requestId && setDetachedRecords(r?.items || []),
          () => {},
        );
      try {
        const items = await invokeUI('library.cards', { view: targetView });
        if (libraryRequestsRef.current[targetView] !== requestId) return [];
        const hydrated = items || [];
        setProjectsByView((current) => ({ ...current, [targetView]: hydrated }));
        loadedLibraryViewsRef.current.add(targetView);
        return hydrated;
      } catch (error) {
        if (libraryRequestsRef.current[targetView] === requestId) {
          showToast(error instanceof Error ? error.message : String(error), 'error', source);
        }
        return [];
      } finally {
        if (libraryRequestsRef.current[targetView] === requestId) {
          setLibraryLoadingByView((current) => ({ ...current, [targetView]: false }));
        }
      }
    },
    [hydrateProject, showToast],
  );

  const loadLibraryRef = useRef(loadLibrary);
  loadLibraryRef.current = loadLibrary;
  const reloadLibrary = useCallback((view = 'all', source: 'user' | 'background' = 'user') => {
    const targetView = view === 'trash' ? 'trash' : 'all';
    const refresher = (refreshers.current[targetView] ??= createCoalescedRefresh((nextSource) =>
      loadLibraryRef.current(targetView, nextSource),
    ));
    return refresher(source);
  }, []);

  const reloadCollections = useCallback(
    async (source: 'user' | 'background' = 'user') => {
      const result = await invokeResult('collection.list', {});
      if (!result?.ok) {
        showToast(result?.error || '加载收藏集失败', 'error', source);
        return [];
      }
      const next = (result.items || []).map(
        (item) => normalizeGalleryCollection(item) as Collection,
      );
      setGalleryCollections(next);
      setActiveCollectionId((current) => {
        const restored =
          current && next.some((collection) => collection.id === current)
            ? current
            : readActiveGalleryCollection(globalThis.localStorage, next);
        return writeActiveGalleryCollection(globalThis.localStorage, restored);
      });
      return next;
    },
    [showToast],
  );

  const refreshVisibleLibrary = useCallback(() => {
    deferredRefresh.current.flush(page === 'gallery', () => {
      void reloadLibrary('all', 'background');
      void reloadLibrary('trash', 'background');
      void reloadCollections('background');
    });
  }, [page, reloadLibrary, reloadCollections]);
  const libraryChanged = useCallback(() => {
    deferredRefresh.current.invalidate();
    refreshVisibleLibrary();
  }, [refreshVisibleLibrary]);
  useEffect(() => {
    refreshVisibleLibrary();
  }, [refreshVisibleLibrary]);
  return { reloadLibrary, reloadCollections, libraryChanged };
}
