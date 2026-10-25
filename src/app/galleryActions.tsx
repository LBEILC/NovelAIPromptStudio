import { invokeResult, invokeUI } from '../lib/commands';
import { adjacentGallerySelection, galleryGroupMember } from '../lib/gallery.js';
import { writeActiveGalleryCollection } from '../lib/galleryCollections.js';
import {
  DEFAULT_GALLERY_FILTERS,
  hasActiveGalleryFilters,
  normalizeGalleryFilters,
} from '../lib/galleryFilters.js';
import { writeGalleryGrouping } from '../lib/galleryGrouping.js';
import { numberedImageNames } from '../lib/imageNaming.js';
import { trashNotice } from '../lib/trashNotice';
import { workbenchTabHasChanges } from '../lib/workbenchSession.js';
import { workLabel } from '../lib/workNames';
import { deletionDetail } from '../library/presentation';
import type { Grouping, LibraryProps } from '../library/types';
import type { BatchResult } from '../shared/ipc';
import type { Collection, DetachedRecord, GalleryFilters, ImageProject } from '../shared/types';
import type { useLibraryLoading } from './library';
import type { useGallerySelection } from './selection';
import type { useAppState } from './state';
export function useGalleryActions({
  showToast,
  reloadLibrary,
  reloadCollections,
  setSelectedGroupIds,
  workbenchSession,
  selectedProjectIds,
  selectedGroupIds,
  previewGroup,
  preview,
  visibleGroups,
  setPreviewGroupId,
  setPreviewProjectId,
  notify,
  setWorkbenchSession,
  requestConfirmation,
  galleryView,
  lastSelectedGroupRef,
  galleryGrouping,
  setSimilarGroupingState,
  setGalleryGrouping,
  editingSmartCollectionId,
  setSmartDraft,
  setGalleryFilters,
  setEditingSmartCollectionId,
  setActiveCollectionId,
  setGalleryView,
  galleryFilters,
  setRenameCollectionId,
  galleryCollections,
  smartDraft,
  activeCollectionId,
}: Pick<
  ReturnType<typeof useAppState> &
    ReturnType<typeof useLibraryLoading> &
    ReturnType<typeof useGallerySelection>,
  | 'showToast'
  | 'reloadLibrary'
  | 'reloadCollections'
  | 'setSelectedGroupIds'
  | 'workbenchSession'
  | 'selectedProjectIds'
  | 'selectedGroupIds'
  | 'previewGroup'
  | 'preview'
  | 'visibleGroups'
  | 'setPreviewGroupId'
  | 'setPreviewProjectId'
  | 'notify'
  | 'setWorkbenchSession'
  | 'requestConfirmation'
  | 'galleryView'
  | 'lastSelectedGroupRef'
  | 'galleryGrouping'
  | 'setSimilarGroupingState'
  | 'setGalleryGrouping'
  | 'editingSmartCollectionId'
  | 'setSmartDraft'
  | 'setGalleryFilters'
  | 'setEditingSmartCollectionId'
  | 'setActiveCollectionId'
  | 'setGalleryView'
  | 'galleryFilters'
  | 'setRenameCollectionId'
  | 'galleryCollections'
  | 'smartDraft'
  | 'activeCollectionId'
>) {
  const summarizeBatch = (result: BatchResult, action: string, groupCount = 0) => {
    if (!result?.ok) {
      showToast(result?.error || `${action}失败`, 'error');
      return false;
    }
    const summary = result.summary;
    const imageCount = (summary.success || 0) + (summary.skipped || 0) + (summary.failed || 0);
    const scope = groupCount ? `共 ${groupCount} 组、${imageCount} 张图片` : '';
    showToast(
      `已${action} ${summary.success || 0} 张${scope ? `（${scope}）` : ''}，跳过 ${summary.skipped || 0} 张，${action}失败 ${summary.failed || 0} 张`,
      summary.failed ? 'warning' : 'success',
    );
    return true;
  };

  const reloadAfterGalleryAction = async () => {
    await Promise.all([reloadLibrary('all'), reloadLibrary('trash'), reloadCollections()]);
    setSelectedGroupIds([]);
  };

  const tabImpact = (ids: string[]) => {
    const selected = new Set(ids);
    const tabs = workbenchSession.tabs.filter(
      (tab) => tab.source?.type === 'library' && selected.has(tab.source.projectId!),
    );
    return { open: tabs.length, dirty: tabs.filter(workbenchTabHasChanges).length };
  };

  const moveToTrash = async (explicitIds: string[] | null = null, scope = 'selection') => {
    const ids = explicitIds || selectedProjectIds;
    if (!ids.length) return;
    const selectedGroups = scope === 'group' ? 1 : selectedGroupIds.length;
    const isDetail = scope === 'detail';
    const next =
      previewGroup && preview && ids.includes(preview.id)
        ? adjacentGallerySelection(visibleGroups, previewGroup.id, preview.id)
        : null;
    const result = await invokeResult('library.trash', { ids: ids });
    if (!result?.ok) {
      summarizeBatch(result, '移入回收站', isDetail ? 0 : selectedGroups);
      return;
    }
    if (next) {
      setPreviewGroupId(next.groupId);
      setPreviewProjectId(next.projectId);
    }
    await reloadAfterGalleryAction();
    notify({
      tone: 'success',
      text: trashNotice(
        ids.length === 1 ? '已移入回收站' : `已将 ${ids.length} 张移入回收站`,
        result.versions,
        true,
        result.originsOf,
      ),
      action: { label: '撤销', onClick: () => restoreProjects(result.results?.success || ids) },
    });
  };

  const restoreProjects = async (explicitIds: string[] | null = null, scope = 'selection') => {
    const ids = explicitIds || selectedProjectIds;
    if (!ids.length) return;
    const result = await invokeUI('library.restore', { ids: ids });
    const groupCount = scope === 'group' ? 1 : explicitIds ? 0 : selectedGroupIds.length;
    if (!result?.ok || result.summary?.failed) {
      summarizeBatch(result, '恢复', groupCount);
      if (!result?.ok) return;
    }
    setPreviewGroupId('');
    setPreviewProjectId('');
    await reloadAfterGalleryAction();
    const restored = result.results?.success || ids;
    notify({
      tone: 'success',
      text: restored.length === 1 ? '已恢复' : `已恢复 ${restored.length} 张`,
      action: { label: '撤销', onClick: () => moveToTrash(restored) },
    });
  };

  const closeDeletedLibraryTabs = (ids: string[]) => {
    const deleted = new Set(ids);
    setWorkbenchSession((current) => ({
      ...current,
      tabs: current.tabs.filter(
        (tab) => !(tab.source?.type === 'library' && deleted.has(tab.source.projectId!)),
      ),
      activeTabId: current.tabs.some(
        (tab) =>
          tab.id === current.activeTabId &&
          !(tab.source?.type === 'library' && deleted.has(tab.source.projectId!)),
      )
        ? current.activeTabId
        : current.tabs.find(
            (tab) => !(tab.source?.type === 'library' && deleted.has(tab.source.projectId!)),
          )?.id || '',
    }));
  };

  const permanentDelete = async (
    explicitIds: string[] | null = null,
    _knownBytes: number | null = null,
    scope = 'selection',
    records: DetachedRecord[] = [],
  ) => {
    const ids = explicitIds || selectedProjectIds;
    if (!ids.length && !records.length) return;
    const impact = tabImpact(ids);
    const clearing = scope === 'empty';
    // 清空回收站时两种一起清，确认框写各有几条（1.6.0）
    const detachedNote = records.length
      ? `另有 ${records.length} 张只从作品去掉的图，清空后不能再放回，它们在别的作品里还在。`
      : '';
    if (
      !(await requestConfirmation({
        title: clearing
          ? '清空回收站？'
          : ids.length === 1
            ? '永久删除这张图片？'
            : `永久删除这 ${ids.length} 张图片？`,
        message: clearing
          ? ids.length
            ? `将永久删除回收站中的 ${ids.length} 张图片，此操作无法撤销。原文件不受影响。${detachedNote}`
            : `回收站里有 ${records.length} 张只从作品去掉的图，清空后不能再放回。它们在别的作品里还在，不会被删除。`
          : `将删除图片库中保存的${ids.length === 1 ? '副本' : ` ${ids.length} 份副本`}及其记录，此操作无法撤销。原文件不受影响。${detachedNote}`,
        detail: deletionDetail(impact, ''),
        okText: clearing ? '清空回收站' : '永久删除',
        danger: true,
        primaryDanger: true,
      }))
    )
      return;
    if (records.length) {
      try {
        await invokeUI('work.discard-detached', { undos: records.map((r) => r.undo) });
      } catch (error) {
        showToast(`清空回收站失败：${error instanceof Error ? error.message : error}`, 'error');
        return;
      }
      if (!ids.length) {
        showToast('已清空回收站');
        setPreviewGroupId('');
        setPreviewProjectId('');
        await reloadAfterGalleryAction();
        return;
      }
    }
    const result = await invokeUI('trash.delete-permanently', { ids: ids });
    const groupCount = scope === 'group' ? 1 : explicitIds ? 0 : selectedGroupIds.length;
    if (!result?.ok || result.summary?.failed) {
      summarizeBatch(result, '永久删除', groupCount);
      if (!result?.ok) return;
    } else
      showToast(
        clearing ? '已清空回收站' : ids.length === 1 ? '已永久删除' : `已永久删除 ${ids.length} 张`,
      );
    closeDeletedLibraryTabs(result.results?.success || []);
    setPreviewGroupId('');
    setPreviewProjectId('');
    await reloadAfterGalleryAction();
  };

  const emptyTrash = async () => {
    const [summary, detached] = await Promise.all([
      invokeUI('trash.summary', {}),
      invokeUI('trash.detached', {}).catch(() => ({ items: [] })),
    ]);
    if (!summary?.ok) {
      showToast(summary?.error || '读取回收站失败', 'error');
      return;
    }
    const records = detached?.items || [];
    if (!summary.projects?.length && !records.length) return;
    await permanentDelete(
      (summary.projects || []).map((project) => project.id),
      null,
      'empty',
      records,
    );
  };

  // 放回去掉它的那个作品（1.6.0）；撤销就是再去掉一次
  const putBackDetached = async (records: DetachedRecord[]) => {
    const back: DetachedRecord[] = [];
    const failed = [];
    for (const record of records) {
      try {
        const result = await invokeUI('work.restore-detached', { undo: record.undo });
        if (result?.restored) back.push(record);
        else failed.push(`${workLabel(record.workName, '那个作品')}已经不在了`);
      } catch (error) {
        failed.push(error instanceof Error ? error.message : String(error));
      }
    }
    setPreviewGroupId('');
    setPreviewProjectId('');
    await reloadAfterGalleryAction();
    if (failed.length) showToast(`放回失败：${[...new Set(failed)].join('；')}`, 'error');
    if (!back.length) return;
    const works = [...new Set(back.map((r) => r.workId))];
    notify({
      tone: 'success',
      text:
        back.length === 1
          ? `已放回${workLabel(back[0].workName, '作品')}`
          : `已放回 ${back.length} 张${works.length === 1 ? `到${workLabel(back[0].workName, '作品')}` : ''}`,
      action: {
        label: '撤销',
        onClick: async () => {
          const byWork = new Map<string, string[]>();
          for (const r of back) byWork.set(r.workId, [...(byWork.get(r.workId) || []), r.image.id]);
          try {
            for (const [workId, imageIds] of byWork)
              await invokeUI('work.detach-images', { workId, imageIds });
          } catch (error) {
            showToast(`撤销失败：${error instanceof Error ? error.message : error}`, 'error');
          }
          await reloadAfterGalleryAction();
        },
      },
    });
  };

  // 不再恢复：只丢掉记录，图片和文件都不动
  const discardDetached = async (records: DetachedRecord[]) => {
    try {
      await invokeUI('work.discard-detached', { undos: records.map((r) => r.undo) });
    } catch (error) {
      showToast(`操作失败：${error instanceof Error ? error.message : error}`, 'error');
      return;
    }
    setPreviewGroupId('');
    setPreviewProjectId('');
    await reloadAfterGalleryAction();
    showToast(
      records.length === 1
        ? '已不再恢复，这张图在别的作品里还在'
        : `已不再恢复 ${records.length} 张，它们在别的作品里还在`,
    );
  };

  const renameProjects = async (ids: string[], name: string) => {
    const names = numberedImageNames(name, ids.length);
    const result = await invokeResult('library.rename-many', {
      changes: ids.map((id, index) => ({ id, name: names[index] })),
    });
    if (!result?.ok) {
      showToast(result?.error || '修改图片名称失败', 'error');
      return false;
    }
    await reloadLibrary(galleryView);
    notify({
      tone: 'success',
      text: '已给 ' + ids.length + ' 张图片起名',
      action: {
        label: '撤销',
        onClick: async () => {
          const restored = await invokeResult('library.rename-many', { changes: result.previous });
          if (!restored?.ok) {
            showToast(restored?.error || '修改图片名称失败', 'error');
            return;
          }
          await reloadLibrary(galleryView);
        },
      },
    });
    return true;
  };

  const renameProject = async (project: Pick<ImageProject, 'id'>, name: string) => {
    const result = await invokeResult('library.rename', { id: project.id, name: name });
    if (!result?.ok) {
      showToast(result?.error || '修改图片名称失败', 'error');
      return false;
    }
    showToast('已修改图片名称');
    await reloadLibrary(galleryView);
    return true;
  };

  const toggleGroupSelection: LibraryProps['onToggleSelect'] = (group, event) => {
    const index = visibleGroups.findIndex((item) => item.id === group.id);
    setSelectedGroupIds((current) => {
      if (event.shiftKey && lastSelectedGroupRef.current) {
        const anchor = visibleGroups.findIndex((item) => item.id === lastSelectedGroupRef.current);
        if (anchor >= 0) {
          const [start, end] = [anchor, index].sort((a, b) => a - b);
          return [
            ...new Set([...current, ...visibleGroups.slice(start, end + 1).map((item) => item.id)]),
          ];
        }
      }
      if (current.includes(group.id)) return current.filter((id) => id !== group.id);
      if (
        !current.length &&
        (event.ctrlKey || event.metaKey) &&
        previewGroup &&
        previewGroup.id !== group.id
      )
        return [previewGroup.id, group.id];
      return [...current, group.id];
    });
    lastSelectedGroupRef.current = group.id;
  };

  const previewGalleryGroup: LibraryProps['onPreview'] = (group, requestedProject) => {
    const project = galleryGroupMember(group, requestedProject?.id);
    setPreviewGroupId(group.id);
    setPreviewProjectId(project.id);
  };

  const updateGalleryGrouping = (patch: Partial<Grouping>) => {
    if (patch.promptScope === 'similar' && galleryGrouping.promptScope !== 'similar') {
      setSimilarGroupingState((current) => ({ ...current, groups: visibleGroups }));
    }
    setGalleryGrouping((current) =>
      writeGalleryGrouping(globalThis.localStorage, { ...current, ...patch }),
    );
    setSelectedGroupIds([]);
    lastSelectedGroupRef.current = '';
  };

  const updateGalleryFilters = (patch: Partial<GalleryFilters>) => {
    (editingSmartCollectionId ? setSmartDraft : setGalleryFilters)((current) =>
      normalizeGalleryFilters({ ...current, ...patch }),
    );
    setSelectedGroupIds([]);
    lastSelectedGroupRef.current = '';
  };

  const selectGalleryCollection = (collectionId: string) => {
    const id = writeActiveGalleryCollection(globalThis.localStorage, collectionId);
    setEditingSmartCollectionId('');
    setActiveCollectionId(id);
    setGalleryView('all');
    setSelectedGroupIds([]);
    setPreviewGroupId('');
    setPreviewProjectId('');
    lastSelectedGroupRef.current = '';
  };

  const createGalleryCollection: LibraryProps['onCollectionCreate'] = async (
    kind,
    name,
    options = {},
  ) => {
    if (kind === 'smart' && !hasActiveGalleryFilters({ ...galleryFilters, query: '' })) {
      showToast('请先设置筛选条件', 'warning');
      return false;
    }
    const result = await invokeUI('collection.create', {
      collection: {
        name,
        kind: kind as Collection['kind'],
        filters:
          kind === 'smart' ? normalizeGalleryFilters({ ...galleryFilters, query: '' }) : undefined,
      },
    });
    if (!result?.ok) {
      showToast(result?.error || '新建收藏集失败', 'error');
      return false;
    }
    await reloadCollections();
    if (options.select !== false) selectGalleryCollection(result.collection!.id);
    if (kind === 'smart') {
      setGalleryFilters({ ...DEFAULT_GALLERY_FILTERS, query: galleryFilters.query });
      setRenameCollectionId(result.collection!.id);
    }
    showToast(kind === 'smart' ? '已保存智能收藏集' : '已新建收藏集');
    return result.collection;
  };

  const renameGalleryCollection = async (collection: Collection, name: string) => {
    const result = await invokeUI('collection.update', { id: collection.id, patch: { name } });
    if (!result?.ok) {
      showToast(result?.error || '修改收藏集名称失败', 'error');
      return false;
    }
    await reloadCollections();
    showToast('已修改收藏集名称');
    return true;
  };

  const beginSmartCollectionRulesEdit = (collection: Collection) => {
    if (collection?.kind !== 'smart') return;
    writeActiveGalleryCollection(globalThis.localStorage, collection.id);
    setActiveCollectionId(collection.id);
    setEditingSmartCollectionId(collection.id);
    setGalleryView('all');
    setSmartDraft(normalizeGalleryFilters(collection.filters));
    setSelectedGroupIds([]);
    setPreviewGroupId('');
    setPreviewProjectId('');
    lastSelectedGroupRef.current = '';
  };

  const saveSmartCollectionRules = async () => {
    const collection = galleryCollections.find(
      (item) => item.id === editingSmartCollectionId && item.kind === 'smart',
    );
    if (!collection) {
      showToast('要修改的智能收藏集已不存在', 'error');
      setEditingSmartCollectionId('');
      return false;
    }
    if (!hasActiveGalleryFilters(smartDraft)) {
      showToast('智能收藏集至少需要一个搜索或筛选条件', 'warning');
      return false;
    }
    const result = await invokeUI('collection.update', {
      id: collection.id,
      patch: {
        filters: normalizeGalleryFilters(smartDraft),
      },
    });
    if (!result?.ok) {
      showToast(result?.error || '更新智能收藏集规则失败', 'error');
      return false;
    }
    await reloadCollections();
    selectGalleryCollection(collection.id);
    showToast('已保存规则');
    return true;
  };

  const cancelSmartCollectionRulesEdit = () => {
    if (editingSmartCollectionId) selectGalleryCollection(editingSmartCollectionId);
  };

  const deleteGalleryCollection = async (collection: Collection) => {
    if (
      !(await requestConfirmation({
        title: `删除${collection.kind === 'smart' ? '智能收藏集' : '收藏集'}"${collection.name}"？`,
        message:
          collection.kind === 'smart'
            ? '智能收藏集只保存筛选条件，删除后图片不受影响。'
            : `收藏集中的 ${collection.active_member_count ?? collection.member_ids?.length ?? 0} 张图片不会被删除，仍可在"全部图片"中找到。`,
        okText: '删除',
        danger: true,
      }))
    )
      return false;
    const result = await invokeUI('collection.delete', { id: collection.id });
    if (!result?.ok) {
      showToast(result?.error || '删除收藏集失败', 'error');
      return false;
    }
    if (activeCollectionId === collection.id || editingSmartCollectionId === collection.id)
      selectGalleryCollection('');
    await reloadCollections();
    showToast(`已删除${collection.kind === 'smart' ? '智能收藏集' : '收藏集'}"${collection.name}"`);
    return true;
  };

  const updateGalleryCollectionProjects = async (
    collectionId: string,
    ids: string[],
    action = 'add',
  ) => {
    const projectIds = [...new Set((ids || []).map(String).filter(Boolean))];
    if (!projectIds.length) return false;
    const result = await invokeResult(
      action === 'remove' ? 'collection.remove' : 'collection.add',
      { collectionId: collectionId, ids: projectIds },
    );
    if (!result?.ok) {
      showToast(result?.error || '更新收藏集里的图片失败', 'error');
      return false;
    }
    const updated = await reloadCollections();
    if (action === 'remove' && activeCollectionId === collectionId) setSelectedGroupIds([]);
    const success = result.summary?.success || 0;
    const skipped = result.summary?.skipped || 0;
    showToast(
      `已${action === 'remove' ? '移出' : '加入'}收藏集"${(updated || galleryCollections).find((collection) => collection.id === collectionId)?.name || ''}"`,
    );
    return true;
  };
  return {
    createGalleryCollection,
    deleteGalleryCollection,
    updateGalleryCollectionProjects,
    renameGalleryCollection,
    cancelSmartCollectionRulesEdit,
    beginSmartCollectionRulesEdit,
    saveSmartCollectionRules,
    selectGalleryCollection,
    updateGalleryGrouping,
    updateGalleryFilters,
    emptyTrash,
    permanentDelete,
    previewGalleryGroup,
    renameProject,
    renameProjects,
    restoreProjects,
    putBackDetached,
    discardDetached,
    toggleGroupSelection,
    moveToTrash,
  };
}
