import { useEffect, useMemo } from 'react';
import {
  gallerySelectionProjectIds,
  reconcileGallerySelection,
  trashedGroups,
} from '../lib/gallery.js';
import { useLibraryComputation } from '../state/libraryComputation';
import type { useAppState } from './state';
export function useGallerySelection({
  galleryView,
  galleryCollections,
  activeCollectionId,
  effectiveGalleryFilters,
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
  detachedRecords,
  workbenchSessionReady,
  setPreviewGroupId,
  setPreviewProjectId,
  selectedGroupIds,
  setSelectedGroupIds,
}: Pick<
  ReturnType<typeof useAppState>,
  | 'galleryView'
  | 'galleryCollections'
  | 'activeCollectionId'
  | 'effectiveGalleryFilters'
  | 'galleryGrouping'
  | 'projects'
  | 'sort'
  | 'reduceMotion'
  | 'projectsByView'
  | 'editingSmartCollectionId'
  | 'showToast'
  | 'libraryLoading'
  | 'previewGroupId'
  | 'previewProjectId'
  | 'detachedRecords'
  | 'workbenchSessionReady'
  | 'setPreviewGroupId'
  | 'setPreviewProjectId'
  | 'selectedGroupIds'
  | 'setSelectedGroupIds'
>) {
  const {
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
  } = useLibraryComputation({
    galleryView,
    galleryCollections,
    activeCollectionId,
    galleryFilters: effectiveGalleryFilters,
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
    detached: detachedRecords,
  });
  useEffect(() => {
    const capture = window.studioScreenshot;
    if (!capture || !workbenchSessionReady || galleryUpdating) return;
    if (capture.selectedProjectId) {
      const group = visibleGroups.find((item) =>
        item.members.some((project) => project.id === capture.selectedProjectId),
      );
      if (!group) return;
      setPreviewGroupId(group.id);
      setPreviewProjectId(capture.selectedProjectId);
    }
    document.documentElement.dataset.screenshotReady = capture.name;
  }, [workbenchSessionReady, galleryUpdating, visibleGroups]);

  const selectedProjectIds = useMemo(
    // 去掉的记录不是回收站里的图，恢复、永久删除不算它们
    () => gallerySelectionProjectIds(trashedGroups(visibleGroups), selectedGroupIds),
    [selectedGroupIds, visibleGroups],
  );

  useEffect(() => {
    setSelectedGroupIds((current) => reconcileGallerySelection(visibleGroups, current));
  }, [visibleGroups]);

  useEffect(() => {
    if (!previewGroup && previewProjectId) {
      setPreviewGroupId('');
      setPreviewProjectId('');
    } else if (previewGroup && previewGroup.id !== previewGroupId) {
      setPreviewGroupId(previewGroup.id);
    } else if (
      previewGroup &&
      !previewGroup.members.some((project) => project.id === previewProjectId)
    ) {
      setPreviewProjectId(previewGroup.cover?.id || '');
    }
  }, [previewGroup, previewGroupId, previewProjectId]);
  return {
    selectedProjectIds,
    previewGroup,
    preview,
    visibleGroups,
    setSimilarGroupingState,
    activeCollection,
    galleryCollectionsWithCounts,
    galleryContentKey,
    editingSmartCollection,
    deferredGalleryComputation,
    collectionScopedProjects,
    similarGroupingState,
    galleryUpdating,
  };
}
