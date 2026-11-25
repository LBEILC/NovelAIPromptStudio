import { isMod } from '../kit/controls';
import { useCallback, useEffect, useRef } from 'react';
import { invokeResult, invokeUI } from '../lib/commands';
import { isTextEditingTarget } from '../lib/contextMenu.js';
import { installFileDrop } from '../lib/fileDrop.js';
import { DEFAULT_GALLERY_FILTERS } from '../lib/galleryFilters.js';
import { hasImageName } from '../lib/imageNaming.js';
import { assessDroppedFiles, assessWorkbenchDroppedFiles } from '../lib/importDrop.js';
import { isImportActive } from '../lib/importProgress.js';
import {
  addWorkbenchTab,
  cycleWorkbenchTab,
  workbenchTabHasChanges,
} from '../lib/workbenchSession.js';
import type { CommandInput } from '../shared/commands';
import type { DroppedFiles, ImportResult } from '../shared/ipc';
import type { ImageProject, WorkbenchSource } from '../shared/types';
import { assessGalleryDrop } from './folderImport';
import type { useLibraryLoading } from './library';
import { studio } from './shared';
import type { useAppState } from './state';
export function useWorkbenchActions({
  hydrateProject,
  setWorkbenchSession,
  setWorkbenchFocus,
  setWorkbenchError,
  setPage,
  setWorkbenchLoading,
  workbenchConnection,
  showToast,
  setImportProgress,
  reloadLibrary,
  notify,
  setGalleryView,
  setActiveCollectionId,
  setEditingSmartCollectionId,
  setGalleryFilters,
  setSelectedGroupIds,
  setPreviewGroupId,
  setPreviewProjectId,
  archiveImport,
  importProgress,
  setArchiveImport,
  appShellRef,
  page,
  setDragState,
  dropHandlerRef,
  workbenchSession,
  requestConfirmation,
  activeTab,
}: Pick<
  ReturnType<typeof useAppState> & ReturnType<typeof useLibraryLoading>,
  | 'hydrateProject'
  | 'setWorkbenchSession'
  | 'setWorkbenchFocus'
  | 'setWorkbenchError'
  | 'setPage'
  | 'setWorkbenchLoading'
  | 'workbenchConnection'
  | 'showToast'
  | 'setImportProgress'
  | 'reloadLibrary'
  | 'notify'
  | 'setGalleryView'
  | 'setActiveCollectionId'
  | 'setEditingSmartCollectionId'
  | 'setGalleryFilters'
  | 'setSelectedGroupIds'
  | 'setPreviewGroupId'
  | 'setPreviewProjectId'
  | 'archiveImport'
  | 'importProgress'
  | 'setArchiveImport'
  | 'appShellRef'
  | 'page'
  | 'setDragState'
  | 'dropHandlerRef'
  | 'workbenchSession'
  | 'requestConfirmation'
  | 'activeTab'
>) {
  const acceptWorkbenchProject = useCallback(
    (project: ImageProject, source?: WorkbenchSource) => {
      const hydrated = hydrateProject(project);
      setWorkbenchSession((current) =>
        addWorkbenchTab(current, hydrated, {
          source: source || { type: 'file', path: hydrated.image_path },
          displayName: hydrated.name,
        }),
      );
      setWorkbenchFocus({ scopeKey: 'base:prompt', tagId: null });
      setWorkbenchError('');
      setPage('workbench');
    },
    [hydrateProject],
  );

  const openWorkbenchPath = useCallback(
    async (
      filePath = '',
      source: WorkbenchSource | null = null,
      extra: Partial<CommandInput<'workbench.open'>> = {},
    ) => {
      setWorkbenchLoading(true);
      setWorkbenchError('');
      try {
        await workbenchConnection?.prepare();
        const result = await invokeResult('workbench.open', {
          ...(filePath ? { path: filePath } : {}),
          ...(source ? { source } : {}),
          ...extra,
        });
        if ('canceled' in result && result.canceled) return false;
        if (!result?.ok || !('tab' in result) || !result.tab?.project)
          throw new Error(('error' in result && result.error) || '打开图片失败');
        setWorkbenchFocus({ scopeKey: 'base:prompt', tagId: null });
        setPage('workbench');
        showToast('已在工作台打开');
        return true;
      } catch (error) {
        setWorkbenchError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setWorkbenchLoading(false);
      }
    },
    [acceptWorkbenchProject, showToast],
  );

  // 空白作品（doc/design.md 2.26a）：参数按设置里的起点，提示词是空的；标签页由命令事件加进来
  const newBlankWork = useCallback(async () => {
    setWorkbenchError('');
    try {
      await workbenchConnection?.prepare();
      const result = await invokeResult('workbench.new', {});
      if (!result?.ok) throw new Error(result?.error || '新建失败');
      setWorkbenchFocus({ scopeKey: 'base:prompt', tagId: null });
      setPage('workbench');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    }
  }, [showToast, workbenchConnection]);

  const openClipboardWorkbenchImage = useCallback(async () => {
    setWorkbenchLoading(true);
    setWorkbenchError('');
    try {
      const result = await invokeUI('workbench.open-clipboard', {});
      if (!result?.ok || !result.project) throw new Error(result?.error || '打开剪贴板图片失败');
      acceptWorkbenchProject(result.project, result.source);
      showToast(
        result.metadataMissing
          ? '剪贴板里的图片没有提示词信息。截图或转存过的图片通常会丢掉这些信息。'
          : '已在工作台打开',
        result.metadataMissing ? 'warning' : 'success',
      );
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkbenchLoading(false);
    }
  }, [acceptWorkbenchProject, showToast]);

  const openDroppedWorkbenchImages = useCallback(
    async (files: DroppedFiles) => {
      if (!assessWorkbenchDroppedFiles(files).valid) {
        setWorkbenchError('工作台只支持 PNG、JPG 或 WEBP 图片');
        return;
      }
      setWorkbenchLoading(true);
      try {
        const result = await invokeUI('workbench.open-many', {
          paths: studio.pathsForFiles(files),
        });
        if (!result?.ok) throw new Error(result?.error || '打开图片失败');
        for (const item of result.items || []) {
          if (item.ok && item.project) acceptWorkbenchProject(item.project, item.source);
        }
        const failures = (result.items || []).filter((item) => !item.ok);
        if (failures.length)
          setWorkbenchError(`${failures.length} 张图片打开失败：${failures[0].error}`);
        if (result.items?.some((item) => item.ok))
          showToast(`已打开 ${result.items.filter((item) => item.ok).length} 个工作台标签页`);
      } catch (error) {
        setWorkbenchError(error instanceof Error ? error.message : String(error));
      } finally {
        setWorkbenchLoading(false);
      }
    },
    [acceptWorkbenchProject, showToast],
  );

  const acceptLibraryImportResult = useCallback(
    async (result: ImportResult) => {
      if (!result?.ok && result?.error) showToast(result.error, 'error');
      setImportProgress(null);
      await reloadLibrary('all');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const animations =
        document.querySelector('.library-import-progress')?.getAnimations({ subtree: true }) || [];
      await Promise.all(
        animations
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      );
      if (result?.summary) {
        const count = result.summary.imported;
        const cancelled = result.summary.cancelled;
        notify({
          tone: result.summary.failed > 0 && !count ? 'error' : 'success',
          text: cancelled
            ? count
              ? `已导入 ${count} 张，其余已取消`
              : '已取消导入'
            : `已导入 ${count} 张`,
          ...(count
            ? {
                action: {
                  label: '查看',
                  onClick: () => {
                    setPage('gallery');
                    setGalleryView('all');
                    setActiveCollectionId('');
                    setEditingSmartCollectionId('');
                    setGalleryFilters({ ...DEFAULT_GALLERY_FILTERS });
                    setSelectedGroupIds([]);
                    setPreviewGroupId('');
                    setPreviewProjectId(result.imported[0].id);
                    const grid = document.querySelector('.lib-grid-col > .scroll');
                    if (grid) grid.scrollTop = 0;
                  },
                },
              }
            : {}),
        });
      }
      if (result?.metadataMissing)
        showToast(
          '剪贴板里的图片没有提示词信息。截图或转存过的图片通常会丢掉这些信息。',
          'warning',
        );
    },
    [reloadLibrary, showToast],
  );

  const importImages = useCallback(
    async (files: DroppedFiles = null, fromClipboard = false) => {
      if (archiveImport || isImportActive(importProgress)) return;
      if (files && !assessDroppedFiles(files).valid) {
        showToast('只能导入 PNG、JPG、WEBP 图片和 ZIP', 'warning');
        return;
      }
      setPage('gallery');
      setGalleryView('all');
      setImportProgress({ phase: 'preparing', processed: 0, total: 0, current: '准备中' });
      let preparedSessionId = '';
      try {
        if (fromClipboard) {
          const result = await invokeUI('import.files', { fromClipboard: true });
          if (!('canceled' in result && result.canceled)) await acceptLibraryImportResult(result);
          return;
        }
        const preparation = files
          ? await invokeUI('import.prepare', { paths: studio.pathsForFiles(files) })
          : await invokeUI('import.prepare', {});
        if ('canceled' in preparation && preparation.canceled) return;
        if (!preparation?.ok) throw new Error(preparation?.error || '准备文件失败');
        if (!('sessionId' in preparation)) return;
        preparedSessionId = preparation.sessionId;
        if (preparation.requiresSelection) {
          setArchiveImport({
            ...preparation,
            previewComplete: false,
            previewCompleted: 0,
            previewError: '',
          });
          return;
        }
        const result = await invokeUI('import.commit', {
          sessionId: preparation.sessionId,
          entryIds: [],
        });
        if (result?.canceled) return;
        preparedSessionId = '';
        await acceptLibraryImportResult(result);
      } catch (error) {
        if (preparedSessionId) invokeUI('import.cancel', { id: preparedSessionId });
        showToast(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        setImportProgress(null);
      }
    },
    [acceptLibraryImportResult, archiveImport, importProgress, showToast],
  );

  const cancelArchiveImport = useCallback(() => {
    const sessionId = archiveImport?.sessionId;
    setArchiveImport(null);
    if (sessionId) invokeUI('import.cancel', { id: sessionId });
  }, [archiveImport]);

  const commitArchiveImport = useCallback(
    async (entryIds: string[]) => {
      const sessionId = archiveImport?.sessionId;
      if (!sessionId) return;
      setArchiveImport(null);
      setImportProgress({ phase: 'preparing', processed: 0, total: 0, current: '准备所选图片' });
      try {
        const result = await invokeUI('import.commit', {
          sessionId: sessionId,
          entryIds: entryIds,
        });
        await acceptLibraryImportResult(result);
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        setImportProgress(null);
      }
    },
    [acceptLibraryImportResult, archiveImport, showToast],
  );

  useEffect(() => {
    if (!appShellRef.current || !['workbench', 'gallery'].includes(page)) return undefined;
    return installFileDrop(appShellRef.current, {
      assess: page === 'workbench' ? assessWorkbenchDroppedFiles : assessGalleryDrop,
      onChange: setDragState,
      onDrop: (files: DroppedFiles) => dropHandlerRef.current?.(files),
    });
  }, [page]);

  dropHandlerRef.current = page === 'workbench' ? openDroppedWorkbenchImages : importImages;

  const reopen = useCallback(
    async (undoId?: string) => {
      try {
        await workbenchConnection?.flush();
        const result = await invokeUI('workbench.reopen', { undoId });
        if (result.reopened) setPage('workbench');
      } catch (error) {
        showToast((error as Error).message, 'error');
      }
    },
    [workbenchConnection, setPage, showToast],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isMod(event) || !event.shiftKey || event.altKey || event.key.toLowerCase() !== 't')
        return;
      event.preventDefault();
      event.stopPropagation();
      void reopen();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [reopen]);

  const closing = useRef(false);
  const closeTab = useCallback(
    async (ids: string | string[]) => {
      if (closing.current) return;
      closing.current = true;
      try {
        await workbenchConnection?.flush();
        const selected = new Set(typeof ids === 'string' ? [ids] : ids);
        const tabs = (workbenchConnection?.current || workbenchSession).tabs.filter((t) =>
          selected.has(t.id),
        );
        if (!tabs.length) return;
        const changed = tabs.filter(workbenchTabHasChanges).length;
        const multiple = tabs.length > 1;
        const project = tabs[0].project;
        const name = project && hasImageName(project) ? project.name : '';
        if (changed && (await invokeUI('settings.productivity.get', {})).confirmCloseChangedTabs) {
          let remember = false;
          if (
            !(await requestConfirmation({
              title: multiple ? `关闭 ${tabs.length} 个标签页？` : '关闭已修改的标签页？',
              message: multiple
                ? `其中 ${changed} 个有未生成的改动。`
                : name
                  ? `「${name}」的提示词改过了。`
                  : '这个标签页的提示词改过了。',
              detail: `关闭后可以在通知里撤销，或按 ${document.documentElement.dataset.platform === 'macos' ? 'Cmd' : 'Ctrl'} Shift T 重新打开。`,
              okText: '关闭',
              checkbox: (checked) => {
                remember = checked;
              },
            }))
          )
            return;
          if (remember)
            await invokeUI('settings.productivity.save', {
              settings: { confirmCloseChangedTabs: false },
            });
        }
        const { closed, undoId } = await invokeUI('workbench.close-tabs', {
          tabIds: tabs.map((t) => t.id),
        });
        if (closed && (multiple || changed))
          notify({
            text: multiple
              ? `已关闭 ${closed} 个标签页`
              : name
                ? `已关闭「${name}」`
                : '已关闭标签页',
            action: { label: '撤销', onClick: () => void reopen(undoId) },
          });
      } catch (error) {
        showToast((error as Error).message, 'error');
      } finally {
        closing.current = false;
      }
    },
    [workbenchConnection, workbenchSession, requestConfirmation, notify, reopen, showToast],
  );
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'w' && page === 'workbench' && activeTab) {
        event.preventDefault();
        closeTab(activeTab.id);
      }
      if (event.key === 'Tab' && page === 'workbench' && workbenchSession.tabs.length > 1) {
        event.preventDefault();
        setWorkbenchSession((current) => cycleWorkbenchTab(current, event.shiftKey ? -1 : 1));
      }
      if (key === 'i' && !event.shiftKey) {
        event.preventDefault();
        if (page === 'workbench') openWorkbenchPath();
        if (page === 'gallery') importImages();
      }
      if (key === 'k' && page === 'gallery') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.gallery-search input')?.focus();
      }
      if (
        key === 'v' &&
        !isTextEditingTarget(event.target) &&
        ['workbench', 'gallery'].includes(page)
      ) {
        event.preventDefault();
        if (page === 'workbench') openClipboardWorkbenchImage();
        else importImages(null, true);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [
    activeTab,
    closeTab,
    importImages,
    openClipboardWorkbenchImage,
    openWorkbenchPath,
    page,
    workbenchSession.tabs.length,
  ]);
  return {
    closeTab,
    openWorkbenchPath,
    newBlankWork,
    openClipboardWorkbenchImage,
    importImages,
    cancelArchiveImport,
    commitArchiveImport,
  };
}
