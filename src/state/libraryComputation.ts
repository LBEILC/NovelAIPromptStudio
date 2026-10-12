import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { galleryViewGroups } from '../lib/gallery.js';
import { galleryCollectionScope } from '../lib/galleryCollections.js';
import { scheduleGalleryComputation } from '../lib/galleryTransition.js';
import type { Collection, GalleryFilters, LibraryCard } from '../shared/types';
import type { Grouping, LibraryGroup } from '../library/types';
interface Options {
  galleryView: string;
  galleryCollections: Collection[];
  activeCollectionId: string;
  galleryFilters: GalleryFilters;
  galleryGrouping: Grouping;
  projects: LibraryCard[];
  sort: string;
  reduceMotion: boolean;
  projectsByView: Record<string, LibraryCard[]>;
  editingSmartCollectionId: string;
  showToast: (message: string, tone: string) => void;
  libraryLoading: boolean;
  previewGroupId: string;
  previewProjectId: string;
}
export function useLibraryComputation({
  galleryView,
  galleryCollections,
  activeCollectionId,
  galleryFilters,
  galleryGrouping,
  projects,
  sort,
  reduceMotion,
  projectsByView,
  editingSmartCollectionId,
  showToast,
  libraryLoading,
  previewGroupId,
  previewProjectId,
}: Options) {
  const groupingWorkerRef = useRef<Worker | null>(null);
  const groupingRequestRef = useRef(0);
  const activeCollection =
    galleryView === 'all'
      ? galleryCollections.find((collection) => collection.id === activeCollectionId) || null
      : null;
  const galleryComputation = useMemo(
    () => ({
      activeCollection,
      filters: galleryFilters,
      grouping: galleryGrouping,
      projects,
      sort,
      view: galleryView,
    }),
    [activeCollection, galleryFilters, galleryGrouping, galleryView, projects, sort],
  );
  const [gatedGalleryComputation, setGatedGalleryComputation] = useState(galleryComputation);
  useEffect(() => {
    if (gatedGalleryComputation === galleryComputation) return undefined;
    return scheduleGalleryComputation(() => {
      startTransition(() => setGatedGalleryComputation(galleryComputation));
    }, reduceMotion);
  }, [galleryComputation, gatedGalleryComputation, reduceMotion]);
  const deferredGalleryComputation = useDeferredValue(gatedGalleryComputation);
  const collectionScopedProjects = useMemo(
    () =>
      galleryCollectionScope(
        deferredGalleryComputation.projects,
        deferredGalleryComputation.activeCollection,
      ),
    [deferredGalleryComputation.activeCollection, deferredGalleryComputation.projects],
  );
  const galleryCollectionsWithCounts = useMemo(
    () =>
      galleryCollections.map((collection) => ({
        ...collection,
        image_count:
          collection.kind === 'manual'
            ? Number(collection.active_member_count ?? collection.member_ids?.length ?? 0)
            : galleryCollectionScope(projectsByView.all, collection).length,
      })),
    [projectsByView.all, galleryCollections],
  );
  const editingSmartCollection =
    galleryCollectionsWithCounts.find(
      (collection) => collection.id === editingSmartCollectionId && collection.kind === 'smart',
    ) || null;
  const exactVisibleGroups = useMemo(
    () =>
      deferredGalleryComputation.grouping.promptScope === 'similar'
        ? null
        : galleryViewGroups(
            collectionScopedProjects,
            deferredGalleryComputation.filters,
            deferredGalleryComputation.grouping,
            deferredGalleryComputation.sort,
          ),
    [
      collectionScopedProjects,
      deferredGalleryComputation.filters,
      deferredGalleryComputation.grouping,
      deferredGalleryComputation.sort,
    ],
  );
  const [similarGroupingState, setSimilarGroupingState] = useState<{
    groups: LibraryGroup[];
    loading: boolean;
    requestId: number;
  }>({
    groups: [],
    loading: false,
    requestId: 0,
  });

  useEffect(() => {
    if (deferredGalleryComputation.grouping.promptScope !== 'similar') {
      groupingWorkerRef.current?.terminate();
      groupingWorkerRef.current = null;
      setSimilarGroupingState((current) =>
        current.loading ? { ...current, loading: false } : current,
      );
      return undefined;
    }

    const requestId = groupingRequestRef.current + 1;
    groupingRequestRef.current = requestId;
    groupingWorkerRef.current?.terminate();
    setSimilarGroupingState((current) => ({ ...current, loading: true }));

    const acceptGroups = (groups: LibraryGroup[]) => {
      if (groupingRequestRef.current !== requestId) return;
      setSimilarGroupingState({ groups, loading: false, requestId });
    };
    const handleError = (error: unknown) => {
      if (groupingRequestRef.current !== requestId) return;
      setSimilarGroupingState({ groups: [], loading: false, requestId });
      showToast(
        `没能合并相似提示词图片：${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    };
    const payload = {
      filters: deferredGalleryComputation.filters,
      grouping: deferredGalleryComputation.grouping,
      id: requestId,
      projects: collectionScopedProjects,
      sort: deferredGalleryComputation.sort,
    };

    if (typeof Worker === 'undefined') {
      const timer = window.setTimeout(() => {
        try {
          acceptGroups(
            galleryViewGroups(payload.projects, payload.filters, payload.grouping, payload.sort),
          );
        } catch (error) {
          handleError(error);
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const worker = new Worker(new URL('../workers/galleryGrouping.worker.js', import.meta.url), {
      type: 'module',
    });
    groupingWorkerRef.current = worker;
    worker.onmessage = ({ data }) => {
      if (data?.id !== requestId) return;
      if (data.error) handleError(new Error(data.error));
      else acceptGroups(data.groups || []);
    };
    worker.onerror = (event) => handleError(new Error(event.message || '后台计算发生错误'));
    worker.postMessage(payload);
    return () => {
      worker.terminate();
      if (groupingWorkerRef.current === worker) groupingWorkerRef.current = null;
    };
  }, [
    collectionScopedProjects,
    deferredGalleryComputation.filters,
    deferredGalleryComputation.grouping,
    deferredGalleryComputation.sort,
    showToast,
  ]);

  const visibleGroups: LibraryGroup[] =
    deferredGalleryComputation.grouping.promptScope === 'similar'
      ? similarGroupingState.groups
      : exactVisibleGroups || [];
  const galleryUpdating =
    libraryLoading ||
    deferredGalleryComputation !== galleryComputation ||
    (deferredGalleryComputation.grouping.promptScope === 'similar' && similarGroupingState.loading);
  const galleryContentKey = `${deferredGalleryComputation.view}:${deferredGalleryComputation.activeCollection?.id || 'all'}:${deferredGalleryComputation.grouping.promptScope}:${deferredGalleryComputation.grouping.mergeVibes ? 1 : 0}:${deferredGalleryComputation.grouping.similarityThreshold}:${deferredGalleryComputation.sort}:${JSON.stringify(deferredGalleryComputation.filters)}:${similarGroupingState.requestId}:${visibleGroups.length}:${visibleGroups[0]?.id || ''}:${visibleGroups.at(-1)?.id || ''}`;
  const previewGroup =
    visibleGroups.find((group) => group.id === previewGroupId) ||
    visibleGroups.find((group) =>
      group.members.some((project) => project.id === previewProjectId),
    ) ||
    null;
  const preview =
    previewGroup?.members.find((project) => project.id === previewProjectId) ||
    previewGroup?.cover ||
    null;

  return {
    activeCollection,
    deferredGalleryComputation,
    collectionScopedProjects,
    galleryCollectionsWithCounts,
    editingSmartCollection,
    similarGroupingState,
    setSimilarGroupingState,
    visibleGroups,
    galleryUpdating,
    galleryContentKey,
    previewGroup,
    preview,
  };
}
