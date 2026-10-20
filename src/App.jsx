import { MaterialsPage } from './materials/Materials';
import { invokeUI, onProgress, invokeResult } from './lib/commands';
import { writeClipboardText, readClipboardText } from './lib/clipboard';
import { numberedImageNames } from './lib/imageNaming.js';
import { deletionDetail } from './library/presentation';
import { useLibraryComputation } from './state/libraryComputation';
import { useLibraryState } from './state/library';
import {
  Activity,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { installFileDrop } from './lib/fileDrop.js';
import {
  Check,
  ClipboardPaste,
  Copy,
  FolderOpen,
  MoveRight,
  Pencil,
  Redo2,
  Scissors,
  Sparkles,
  Tags,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Collapse, Presence, TransitionSurface } from './ui/transitions';
import LibraryPage from './library/LibraryPage';
import { useLibraryCacheProgress } from './state/libraryCacheProgress';
import SettingsPage from './settings/SettingsPage';
import { Titlebar } from './shell/Titlebar';
import { useAppearance } from './state/appearance';
import { Dialog, Button, Progress, Layer, MenuItems, useNotifications } from './ui';
import WorkbenchPage from './workbench/WorkbenchPage';
import { GenerationTitle } from './workbench/GenerationTitle';
import { WorkbenchTabs } from './workbench/Tabs';
import { useWorkbenchState } from './state/workbench';
import { ZipImport } from './library/ZipImport';
import {
  allPromptTags,
  getPromptScope,
  normalizePromptStructure,
  syncProjectPromptMetadata,
  updatePromptScope,
  updatePromptScopeAnnotations,
} from './lib/promptStructure.js';
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  expandSearch,
  formatTag,
  normalizeSearch,
  repairLegacyPromptTags,
} from './lib/prompt.js';
import { previewInvoke } from './lib/previewCommands.js';
import { assessDroppedFiles, assessWorkbenchDroppedFiles } from './lib/importDrop.js';
import { isImportActive } from './lib/importProgress.js';
import { isTextEditingTarget } from './lib/contextMenu.js';
import {
  activeWorkbenchTab,
  addWorkbenchTab,
  closeWorkbenchTab,
  createWorkbenchTab,
  cycleWorkbenchTab,
  LEGACY_WORKBENCH_SESSION_KEY,
  normalizeWorkbenchViewState,
  parseWorkbenchSession,
  reorderWorkbenchTabs,
  serializeWorkbenchSession,
  updateWorkbenchTab,
  WORKBENCH_SESSION_KEY,
  workbenchTabHasChanges,
} from './lib/workbenchSession.js';
import {
  adjacentGallerySelection,
  galleryGroupMember,
  gallerySelectionProjectIds,
  reconcileGallerySelection,
} from './lib/gallery.js';
import {
  DEFAULT_GALLERY_FILTERS,
  hasActiveGalleryFilters,
  normalizeGalleryFilters,
} from './lib/galleryFilters.js';
import {
  normalizeGalleryCollection,
  readActiveGalleryCollection,
  writeActiveGalleryCollection,
} from './lib/galleryCollections.js';
import { writeGalleryGrouping } from './lib/galleryGrouping.js';
import { useStudioReducedMotion } from './lib/motion.js';
import {
  moveOverviewTags,
  overviewMoveContext,
  overviewSelectionMenuItems,
  overviewTagKey,
} from './lib/promptOverview.js';

const studio = window.studio || {
  invoke: previewInvoke,
  onCommandEvent: () => () => {},
  onCommandPrepare: () => () => {},
  pathsForFiles: () => [],
};

const TAG_CONTEXT_CATEGORIES = CATEGORY_OPTIONS.map((category) => [
  category,
  CATEGORY_LABELS[category],
]);

function dispatchInput(editable, inputType, data = null) {
  const event =
    typeof InputEvent === 'function'
      ? new InputEvent('input', { bubbles: true, data, inputType })
      : new Event('input', { bubbles: true });
  editable.dispatchEvent(event);
}

function captureTextSelection(editable) {
  const start = typeof editable.selectionStart === 'number' ? editable.selectionStart : null;
  const end = typeof editable.selectionEnd === 'number' ? editable.selectionEnd : null;
  return {
    editable,
    start,
    end,
    hasSelection: start == null || end == null ? true : start !== end,
  };
}

async function runTextEditAction(selection, action) {
  const { editable, start, end } = selection;
  editable.focus({ preventScroll: true });
  if (start != null && end != null && typeof editable.setSelectionRange === 'function')
    editable.setSelectionRange(start, end);
  if (start != null && end != null && typeof editable.setRangeText === 'function') {
    if (action === 'copy' || action === 'cut') {
      await writeClipboardText(String(editable.value || '').slice(start, end));
      if (action === 'cut') {
        editable.setRangeText('', start, end, 'end');
        dispatchInput(editable, 'deleteByCut');
      }
      return;
    }
    if (action === 'paste') {
      const text = await readClipboardText();
      editable.setRangeText(text, start, end, 'end');
      dispatchInput(editable, 'insertFromPaste', text);
      return;
    }
    if (action === 'select-all') {
      editable.setSelectionRange(0, String(editable.value || '').length);
      return;
    }
  }
  const command = {
    undo: 'undo',
    redo: 'redo',
    cut: 'cut',
    copy: 'copy',
    paste: 'paste',
    'select-all': 'selectAll',
  }[action];
  if (command) document.execCommand(command);
}

function ImportExperience({ dragState, progress, result, target, onCancel, onDismiss }) {
  const importing = isImportActive(progress);
  const percent = progress?.total
    ? Math.min(100, Math.round(((progress.processed || 0) / progress.total) * 100))
    : 0;
  const workbench = target === 'workbench';
  return (
    <>
      {dragState.active && (
        <div className={`file-drop-overlay ${dragState.valid ? 'accept' : 'reject'}`}>
          <div className="file-drop-target">
            <i className={dragState.valid ? 'ri-upload-line' : 'ri-close-line'} />
            <strong>
              {dragState.valid
                ? workbench
                  ? '松开，在工作台打开'
                  : '松开以保存到图片库'
                : '这些文件暂不支持'}
            </strong>
            <span>
              {workbench
                ? 'PNG / JPG / WEBP，每张图片一个标签页'
                : 'PNG / JPG / WEBP / ZIP，可批量导入'}
            </span>
          </div>
        </div>
      )}
      <Collapse open={importing} className="import-transition">
        {importing && (
          <div className="import-status">
            <div>
              <strong>{progress.phase === 'preparing' ? '正在检查文件' : '正在导入图片'}</strong>
              <span>
                {progress.current || '准备中'} · {percent}%
              </span>
            </div>
            <Progress value={percent} label="导入进度" />
            <Button onClick={onCancel} size="small">
              取消
            </Button>
          </div>
        )}
      </Collapse>
      <Presence show={!!result} className="import-transition">
        {result && (
          <div className="import-result">
            <i className={result.errors?.length ? 'ri-alert-line' : 'ri-check-line'} />
            <span>
              已导入 {result.imported?.length || 0} 张 · 跳过重复 {result.duplicates?.length || 0}{' '}
              张{result.errors?.length ? ` · 没能导入 ${result.errors.length} 张` : ''}
            </span>
            <Button onClick={onDismiss} size="small" variant="quiet">
              关闭
            </Button>
          </div>
        )}
      </Presence>
    </>
  );
}

export default function App() {
  const { appearance } = useAppearance();
  const [menuDestination, setMenuDestination] = useState(null);
  useEffect(
    () =>
      studio.onCommandEvent?.((event) => {
        if (event.type !== 'navigate') return;
        const destination = event.destination;
        setMenuDestination({ section: destination === 'about' ? 'updates' : 'appearance' });
        setPage('settings');
      }),
    [],
  );
  const [page, setPage] = useState(window.studioScreenshot?.page || 'workbench');
  const [materialKind, setMaterialKind] = useState('block');
  const notify = useNotifications();
  const notificationTarget = useRef({ page, notify });
  notificationTarget.current = { page, notify };
  const {
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
  } = useLibraryState(window.studioScreenshot?.view);
  const [smartDraft, setSmartDraft] = useState(DEFAULT_GALLERY_FILTERS);
  const [renameCollectionId, setRenameCollectionId] = useState('');
  const isSmartView =
    galleryView === 'all' &&
    galleryCollections.some((c) => c.id === activeCollectionId && c.kind === 'smart');
  const effectiveGalleryFilters = useMemo(
    () =>
      editingSmartCollectionId
        ? smartDraft
        : isSmartView
          ? { ...DEFAULT_GALLERY_FILTERS, query: galleryFilters.query }
          : galleryFilters,
    [editingSmartCollectionId, smartDraft, isSmartView, galleryFilters],
  );
  useEffect(() => {
    if (page !== 'gallery') setEditingSmartCollectionId('');
  }, [page]);
  const {
    workbenchSession,
    setWorkbenchSession,
    workbenchConnection,
    workbenchSessionReady,
    setWorkbenchSessionReady,
    workbenchLoading,
    setWorkbenchLoading,
    workbenchError,
    setWorkbenchError,
    workbenchFocus,
    setWorkbenchFocus,
  } = useWorkbenchState();
  const [dragState, setDragState] = useState({ active: false, valid: false });
  const [importProgress, setImportProgress] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [archiveImport, setArchiveImport] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const openContextMenu = (event, items) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      point: { x: event.clientX, y: event.clientY },
      items: items.map((item) =>
        item.type === 'divider'
          ? { id: item.key, separator: true }
          : { id: item.key, label: item.label, disabled: item.disabled, onSelect: item.onClick },
      ),
    });
  };
  const appShellRef = useRef(null);
  const dropHandlerRef = useRef(null);
  const annotationTimer = useRef(null);
  const confirmationResolverRef = useRef(null);
  const lastSelectedGroupRef = useRef('');
  const libraryRequestsRef = useRef({ all: 0, trash: 0 });
  const loadedLibraryViewsRef = useRef(new Set());
  const activeTab = activeWorkbenchTab(workbenchSession);
  const projects = projectsByView[galleryView] || [];
  const libraryLoading = Boolean(libraryLoadingByView[galleryView]);
  const cacheProgress = useLibraryCacheProgress(libraryLoading);
  const cacheWasVisible = useRef(false);
  useEffect(() => {
    if (cacheProgress) cacheWasVisible.current = true;
    else if (!libraryLoading && cacheWasVisible.current) {
      cacheWasVisible.current = false;
      notificationTarget.current.notify({
        text: '图片库已整理好',
        tone: 'success',
        source: 'background',
      });
    }
  }, [cacheProgress, libraryLoading]);
  const reduceMotion = useStudioReducedMotion(appearance.motion);

  const showToast = useCallback((message, tone = 'success', source = 'user') => {
    notificationTarget.current.notify({
      text: message,
      tone: tone === 'warning' ? 'info' : tone,
      source,
    });
  }, []);

  const requestConfirmation = useCallback(
    (options) =>
      new Promise((resolve) => {
        confirmationResolverRef.current = resolve;
        setConfirmation(options);
      }),
    [],
  );

  const resolveConfirmation = (confirmed) => {
    const resolve = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmation(null);
    resolve?.(confirmed);
  };

  const hydrateProject = useCallback(
    (project) =>
      syncProjectPromptMetadata({
        ...project,
        tags: repairLegacyPromptTags(project.tags, project.metadata?.prompt_raw),
        prompt_structure: normalizePromptStructure(project.prompt_structure, project.metadata),
      }),
    [],
  );

  const reloadLibrary = useCallback(
    async (view = 'all', source = 'user') => {
      const targetView = view === 'trash' ? 'trash' : 'all';
      const requestId = (libraryRequestsRef.current[targetView] || 0) + 1;
      libraryRequestsRef.current[targetView] = requestId;
      setLibraryLoadingByView((current) => ({ ...current, [targetView]: true }));
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

  const reloadCollections = useCallback(
    async (source = 'user') => {
      const result = await invokeResult('collection.list', {});
      if (!result?.ok) {
        showToast(result?.error || '没能加载收藏集', 'error', source);
        return [];
      }
      const next = (result.items || []).map(normalizeGalleryCollection);
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

  useEffect(() => {
    if (!loadedLibraryViewsRef.current.has(galleryView)) reloadLibrary(galleryView, 'background');
    if (!loadedLibraryViewsRef.current.has('trash')) reloadLibrary('trash', 'background');
  }, [galleryView, reloadLibrary]);

  useEffect(() => {
    reloadCollections('background');
  }, [reloadCollections]);

  useEffect(() => {
    if (!workbenchConnection) return;
    const prepare = studio.onCommandPrepare(() => workbenchConnection.prepare());
    const events = studio.onCommandEvent((event) => {
      if (event.type !== 'workbench') return;
      const wasCurrent = event.tabId === workbenchConnection.current.activeTabId;
      workbenchConnection.receive(event);
      if (event.libraryChanged) {
        void reloadLibrary('all', 'background');
        void reloadLibrary('trash', 'background');
        void reloadCollections('background');
      }
      if (event.source === 'agent' && event.undoId && wasCurrent) {
        notificationTarget.current.notify({
          text: 'Agent 修改了提示词',
          tone: 'info',
          action: {
            label: '撤销',
            onClick: () => {
              void workbenchConnection
                .flush()
                .then(async () => {
                  const result = await studio.invoke('workbench.undo', { undoId: event.undoId });
                  if (!result.ok) showToast(result.error.message, 'error');
                })
                .catch((error) => showToast(error.message, 'error'));
            },
          },
        });
      }
    });
    return () => {
      prepare();
      events();
    };
  }, [workbenchConnection, reloadLibrary, reloadCollections, showToast]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (window.studioScreenshot) {
        const tabs = await Promise.all(
          (window.studioScreenshot.workbenchPaths || []).map(async (filePath) => {
            const result = await invokeResult('image.read', { path: filePath });
            if (!result.ok) throw new Error(result.error);
            return createWorkbenchTab(hydrateProject(result.project), {
              source: { type: 'file', path: filePath },
            });
          }),
        );
        if (!active) return;
        if (workbenchConnection) {
          const initial = await studio.invoke('workbench.session', {});
          if (!initial.ok) throw new Error(initial.error.message);
          workbenchConnection.hydrate(initial.data);
        }
        setWorkbenchSession({ version: 2, tabs, activeTabId: tabs[0]?.id || '' });
        await workbenchConnection?.flush();
        setWorkbenchSessionReady(true);
        return;
      }
      if (!workbenchConnection) {
        setWorkbenchSessionReady(true);
        return;
      }
      const result = await studio.invoke('workbench.session', {
        legacyV2: window.localStorage.getItem(WORKBENCH_SESSION_KEY) || '',
        legacyV1: window.localStorage.getItem(LEGACY_WORKBENCH_SESSION_KEY) || '',
      });
      if (!result.ok) throw new Error(result.error.message);
      if (!active) return;
      workbenchConnection.hydrate(result.data);
      setWorkbenchLoading(false);
      setWorkbenchSessionReady(true);
    };
    restore().catch((error) => {
      if (active) {
        setWorkbenchError(error instanceof Error ? error.message : String(error));
        setWorkbenchLoading(false);
        setWorkbenchSessionReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [hydrateProject]);

  useEffect(() => {
    if (!workbenchSessionReady) return;
    const temporaryPaths = workbenchSession.tabs
      .filter((tab) => tab.source?.type === 'clipboard' && tab.source.path)
      .map((tab) => tab.source.path);
    invokeUI('workbench.temp-sync', { paths: temporaryPaths });
  }, [workbenchSession, workbenchSessionReady]);

  useEffect(() => {
    const unsubscribe = onProgress('library:import-progress', (progress) =>
      setImportProgress(isImportActive(progress) ? progress : null),
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onProgress('library:import-preview', (update) => {
      setArchiveImport((current) => {
        if (!current || current.sessionId !== update?.sessionId) return current;
        if (update.phase === 'preview') {
          return {
            ...current,
            previewCompleted: update.completed || 0,
            entries: current.entries.map((entry) =>
              entry.id === update.entryId
                ? {
                    ...entry,
                    previewHeight: update.previewHeight || 0,
                    previewPath: update.previewPath || '',
                    previewWidth: update.previewWidth || 0,
                    previewError: update.error || '',
                    duplicate: Boolean(update.duplicate),
                  }
                : entry,
            ),
          };
        }
        if (update.phase === 'complete') {
          return {
            ...current,
            previewComplete: true,
            previewCompleted: update.completed || 0,
            previewError: update.error || '',
          };
        }
        return current;
      });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!archiveImport?.sessionId) return;
    invokeUI('import.previews', { sessionId: archiveImport.sessionId })
      .then((result) => {
        if (result?.ok) return;
        setArchiveImport((current) =>
          current?.sessionId === archiveImport.sessionId
            ? {
                ...current,
                previewComplete: true,
                previewError: result?.error || '没能打开压缩包预览',
              }
            : current,
        );
      })
      .catch((error) => {
        setArchiveImport((current) =>
          current?.sessionId === archiveImport.sessionId
            ? {
                ...current,
                previewComplete: true,
                previewError: error instanceof Error ? error.message : String(error),
              }
            : current,
        );
      });
  }, [archiveImport?.sessionId]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const settings = await invokeUI('settings.productivity.get', {}).catch(() => null);
      if (!settings?.autoCheckUpdates) return;
      const result = await invokeUI('updates.check', {}).catch(() => null);
      if (result?.ok && result.hasUpdate)
        notificationTarget.current.notify({
          text: `发现新版本 v${result.latestVersion}，可在“关于与更新”中查看`,
          source: 'background',
        });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  useEffect(() => {
    const handler = (event) => {
      if (event.defaultPrevented || !isTextEditingTarget(event.target)) return;
      const editable = event.target.closest('textarea, input, [contenteditable="true"]');
      const selection = captureTextSelection(editable);
      const invoke = (action) =>
        runTextEditAction(selection, action).catch(() => showToast('没能完成文本操作', 'error'));
      openContextMenu(event, [
        { key: 'undo', label: '撤销', icon: Undo2, onClick: () => invoke('undo') },
        { key: 'redo', label: '重做', icon: Redo2, onClick: () => invoke('redo') },
        { key: 'edit-divider', type: 'divider' },
        {
          key: 'cut',
          label: '剪切',
          icon: Scissors,
          disabled: !selection.hasSelection,
          onClick: () => invoke('cut'),
        },
        {
          key: 'copy',
          label: '复制',
          icon: Copy,
          disabled: !selection.hasSelection,
          onClick: () => invoke('copy'),
        },
        { key: 'paste', label: '粘贴', icon: ClipboardPaste, onClick: () => invoke('paste') },
        { key: 'selection-divider', type: 'divider' },
        { key: 'select-all', label: '全选', onClick: () => invoke('select-all') },
      ]);
    };
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, [showToast]);

  const acceptWorkbenchProject = useCallback(
    (project, source) => {
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
    async (filePath = '', source = null) => {
      setWorkbenchLoading(true);
      setWorkbenchError('');
      try {
        await workbenchConnection?.prepare();
        const result = await invokeResult('workbench.open', {
          ...(filePath ? { path: filePath } : {}),
          ...(source ? { source } : {}),
        });
        if (result?.canceled) return false;
        if (!result?.ok || !result.tab?.project) throw new Error(result?.error || '没能打开图片');
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

  const openClipboardWorkbenchImage = useCallback(async () => {
    setWorkbenchLoading(true);
    setWorkbenchError('');
    try {
      const result = await invokeUI('workbench.open-clipboard', {});
      if (!result?.ok || !result.project) throw new Error(result?.error || '没能打开剪贴板图片');
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
    async (files) => {
      if (!assessWorkbenchDroppedFiles(files).valid) {
        setWorkbenchError('工作台只支持 PNG、JPG 或 WEBP 图片');
        return;
      }
      setWorkbenchLoading(true);
      try {
        const result = await invokeUI('workbench.open-many', {
          paths: studio.pathsForFiles(files),
        });
        if (!result?.ok) throw new Error(result?.error || '没能打开图片');
        for (const item of result.items || []) {
          if (item.ok && item.project) acceptWorkbenchProject(item.project, item.source);
        }
        const failures = (result.items || []).filter((item) => !item.ok);
        if (failures.length)
          setWorkbenchError(`没能打开 ${failures.length} 张图片：${failures[0].error}`);
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
    async (result) => {
      setImportResult(result);
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
                    const grid = document.querySelector('.library-scroll');
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
    async (files = null, fromClipboard = false) => {
      if (archiveImport || isImportActive(importProgress)) return;
      if (files && !assessDroppedFiles(files).valid) {
        showToast('只能导入 PNG、JPG、WEBP 图片和 ZIP', 'warning');
        return;
      }
      setPage('gallery');
      setGalleryView('all');
      setImportResult(null);
      setImportProgress({ phase: 'preparing', processed: 0, total: 0, current: '准备中' });
      let preparedSessionId = '';
      try {
        if (fromClipboard) {
          const result = await invokeUI('import.files', { fromClipboard: true });
          if (!result?.canceled) await acceptLibraryImportResult(result);
          return;
        }
        const preparation = files
          ? await invokeUI('import.prepare', { paths: studio.pathsForFiles(files) })
          : await invokeUI('import.prepare', {});
        if (preparation?.canceled) return;
        if (!preparation?.ok) throw new Error(preparation?.error || '没能准备文件');
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
    async (entryIds) => {
      const sessionId = archiveImport?.sessionId;
      if (!sessionId) return;
      setArchiveImport(null);
      setImportResult(null);
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
      assess: page === 'workbench' ? assessWorkbenchDroppedFiles : assessDroppedFiles,
      onChange: setDragState,
      onDrop: (files) => dropHandlerRef.current?.(files),
    });
  }, [page]);

  dropHandlerRef.current = page === 'workbench' ? openDroppedWorkbenchImages : importImages;

  const closeTab = useCallback(
    async (tabId) => {
      const tab = workbenchSession.tabs.find((item) => item.id === tabId);
      if (!tab) return;
      if (
        workbenchTabHasChanges(tab) &&
        !(await requestConfirmation({
          title: '关闭已修改的标签页？',
          message: `“${tab.displayName}”的提示词改过了。`,
          detail: '关闭后这些修改会丢失，其他标签页不受影响。',
          okText: '丢弃并关闭',
          danger: true,
        }))
      )
        return;
      setWorkbenchSession((current) => closeWorkbenchTab(current, tabId));
    },
    [requestConfirmation, workbenchSession.tabs],
  );

  useEffect(() => {
    const keydown = (event) => {
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
      if (key === 'i') {
        event.preventDefault();
        if (page === 'workbench') openWorkbenchPath();
        if (page === 'gallery') importImages();
      }
      if (key === 'k' && page === 'gallery') {
        event.preventDefault();
        document.querySelector('.gallery-search input')?.focus();
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
    () => gallerySelectionProjectIds(visibleGroups, selectedGroupIds),
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

  const scheduleAnnotations = (project) => {
    window.clearTimeout(annotationTimer.current);
    const entries = allPromptTags(project).filter(
      (tag) => tag.translation_source === 'manual' || tag.category_source === 'manual',
    );
    if (!entries.length) return;
    annotationTimer.current = window.setTimeout(async () => {
      const result = await invokeResult('dictionary.set-many', {
        entries: entries
          .filter(
            (entry) => entry.translation_source === 'manual' || entry.category_source === 'manual',
          )
          .map((entry) => ({
            tag: entry.tag,
            ...(entry.translation_source === 'manual'
              ? { translation: entry.translation || '' }
              : {}),
            ...(entry.category_source === 'manual'
              ? { category: entry.category || 'Unsorted' }
              : {}),
          })),
      });
      if (!result?.ok) showToast(result?.error || '没能保存 Tag 译文和分类', 'error');
    }, 500);
  };

  const updateWorkbenchProject = (nextProject) => {
    if (!activeTab) return;
    const updated = {
      ...syncProjectPromptMetadata(nextProject),
      updated_at: new Date().toISOString(),
    };
    setWorkbenchSession((current) =>
      updateWorkbenchTab(current, activeTab.id, (tab) => ({
        ...tab,
        project: updated,
        updatedAt: updated.updated_at,
      })),
    );
    scheduleAnnotations(updated);
    void invokeUI('workbench.save-structure', {
      filePath: activeTab.source.path,
      structure: updated.prompt_structure,
      projectId: activeTab.source.projectId,
    }).then((result) => {
      if (!result.ok) showToast(result.error || '没能保存块类型和译文', 'error');
    });
  };

  const translateWorkbenchTags = async (entries) => {
    if (!activeTab?.project) return;
    const tabId = activeTab.id;
    const result = await invokeUI('dictionary.translate', {
      tags: entries.map((entry) => entry.tag.tag),
    });
    if (!result?.ok) {
      showToast(result?.error || '没能完成翻译和分类', 'error');
      return;
    }
    setWorkbenchSession((current) =>
      updateWorkbenchTab(current, tabId, (tab) => {
        if (!tab.project) return tab;
        let nextProject = tab.project;
        entries.forEach((entry, index) => {
          const scope = getPromptScope(nextProject, entry.scopeKey);
          const item = result.items?.[index] || {};
          nextProject = updatePromptScopeAnnotations(
            nextProject,
            scope.key,
            scope.tags.map((tag) =>
              tag.id === entry.tag.id
                ? {
                    ...tag,
                    ...item,
                    translation_source: item.translation_source || '',
                    category_source: item.category_source || '',
                  }
                : tag,
            ),
          );
        });
        const updated = {
          ...syncProjectPromptMetadata(nextProject),
          updated_at: new Date().toISOString(),
        };
        scheduleAnnotations(updated);
        return { ...tab, project: updated, updatedAt: updated.updated_at };
      }),
    );
    if (result.ai_count)
      showToast(`已整理 ${entries.length} 个 Tag，其中 ${result.ai_count} 个由 AI 补全`);
    else if (result.unresolved_count)
      showToast(`已用内置词典整理，还有 ${result.unresolved_count} 个 Tag 没有译文或分类`);
    else showToast(`已用内置词典整理 ${entries.length} 个 Tag`);
  };

  const summarizeBatch = (result, action, groupCount = 0) => {
    if (!result?.ok) {
      showToast(result?.error || `没能${action}`, 'error');
      return false;
    }
    const summary = result.summary || {};
    const imageCount = (summary.success || 0) + (summary.skipped || 0) + (summary.failed || 0);
    const scope = groupCount ? `共 ${groupCount} 组、${imageCount} 张图片` : '';
    showToast(
      `已${action} ${summary.success || 0} 张${scope ? `（${scope}）` : ''}，跳过 ${summary.skipped || 0} 张，没能${action} ${summary.failed || 0} 张`,
      summary.failed ? 'warning' : 'success',
    );
    return true;
  };

  const reloadAfterGalleryAction = async () => {
    await Promise.all([reloadLibrary('all'), reloadLibrary('trash'), reloadCollections()]);
    setSelectedGroupIds([]);
  };

  const tabImpact = (ids) => {
    const selected = new Set(ids);
    const tabs = workbenchSession.tabs.filter(
      (tab) => tab.source?.type === 'library' && selected.has(tab.source.projectId),
    );
    return { open: tabs.length, dirty: tabs.filter(workbenchTabHasChanges).length };
  };

  const moveToTrash = async (explicitIds = null, scope = 'selection') => {
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
      text: ids.length === 1 ? '已移入回收站' : `已将 ${ids.length} 张移入回收站`,
      action: { label: '撤销', onClick: () => restoreProjects(result.results?.success || ids) },
    });
  };

  const restoreProjects = async (explicitIds = null, scope = 'selection') => {
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

  const closeDeletedLibraryTabs = (ids) => {
    const deleted = new Set(ids);
    setWorkbenchSession((current) => ({
      ...current,
      tabs: current.tabs.filter(
        (tab) => !(tab.source?.type === 'library' && deleted.has(tab.source.projectId)),
      ),
      activeTabId: current.tabs.some(
        (tab) =>
          tab.id === current.activeTabId &&
          !(tab.source?.type === 'library' && deleted.has(tab.source.projectId)),
      )
        ? current.activeTabId
        : current.tabs.find(
            (tab) => !(tab.source?.type === 'library' && deleted.has(tab.source.projectId)),
          )?.id || '',
    }));
  };

  const permanentDelete = async (explicitIds = null, _knownBytes = null, scope = 'selection') => {
    const ids = explicitIds || selectedProjectIds;
    if (!ids.length) return;
    const impact = tabImpact(ids);
    const clearing = scope === 'empty';
    if (
      !(await requestConfirmation({
        title: clearing
          ? '清空回收站？'
          : ids.length === 1
            ? '永久删除这张图片？'
            : `永久删除这 ${ids.length} 张图片？`,
        message: clearing
          ? `将永久删除回收站中的 ${ids.length} 张图片，此操作无法撤销。原文件不受影响。`
          : `将删除图片库中保存的${ids.length === 1 ? '副本' : ` ${ids.length} 份副本`}及其记录，此操作无法撤销。原文件不受影响。`,
        detail: deletionDetail(impact, ''),
        okText: clearing ? '清空回收站' : '永久删除',
        danger: true,
        primaryDanger: true,
      }))
    )
      return;
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
    const summary = await invokeUI('trash.summary', {});
    if (!summary?.ok) {
      showToast(summary?.error || '没能读取回收站', 'error');
      return;
    }
    if (!summary.projects?.length) return;
    await permanentDelete(
      summary.projects.map((project) => project.id),
      null,
      'empty',
    );
  };

  const renameProjects = async (ids, name) => {
    const names = numberedImageNames(name, ids.length);
    const result = await invokeResult('library.rename-many', {
      changes: ids.map((id, index) => ({ id, name: names[index] })),
    });
    if (!result?.ok) {
      showToast(result?.error || '没能修改图片名称', 'error');
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
            showToast(restored?.error || '没能修改图片名称', 'error');
            return;
          }
          await reloadLibrary(galleryView);
        },
      },
    });
    return true;
  };

  const renameProject = async (project, name) => {
    const result = await invokeResult('library.rename', { id: project.id, name: name });
    if (!result?.ok) {
      showToast(result?.error || '没能修改图片名称', 'error');
      return false;
    }
    showToast('已修改图片名称');
    await reloadLibrary(galleryView);
    return true;
  };

  const toggleGroupSelection = (group, event) => {
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

  const previewGalleryGroup = (group, requestedProject) => {
    const project = galleryGroupMember(group, requestedProject?.id);
    setPreviewGroupId(group.id);
    setPreviewProjectId(project.id);
  };

  const updateGalleryGrouping = (patch) => {
    if (patch.promptScope === 'similar' && galleryGrouping.promptScope !== 'similar') {
      setSimilarGroupingState((current) => ({ ...current, groups: visibleGroups }));
    }
    setGalleryGrouping((current) =>
      writeGalleryGrouping(globalThis.localStorage, { ...current, ...patch }),
    );
    setSelectedGroupIds([]);
    lastSelectedGroupRef.current = '';
  };

  const updateGalleryFilters = (patch) => {
    (editingSmartCollectionId ? setSmartDraft : setGalleryFilters)((current) =>
      normalizeGalleryFilters({ ...current, ...patch }),
    );
    setSelectedGroupIds([]);
    lastSelectedGroupRef.current = '';
  };

  const selectGalleryCollection = (collectionId) => {
    const id = writeActiveGalleryCollection(globalThis.localStorage, collectionId);
    setEditingSmartCollectionId('');
    setActiveCollectionId(id);
    setGalleryView('all');
    setSelectedGroupIds([]);
    setPreviewGroupId('');
    setPreviewProjectId('');
    lastSelectedGroupRef.current = '';
  };

  const createGalleryCollection = async (kind, name, options = {}) => {
    if (kind === 'smart' && !hasActiveGalleryFilters({ ...galleryFilters, query: '' })) {
      showToast('请先设置筛选条件', 'warning');
      return false;
    }
    const result = await invokeUI('collection.create', {
      collection: {
        name,
        kind,
        filters:
          kind === 'smart' ? normalizeGalleryFilters({ ...galleryFilters, query: '' }) : undefined,
      },
    });
    if (!result?.ok) {
      showToast(result?.error || '没能新建收藏集', 'error');
      return false;
    }
    await reloadCollections();
    if (options.select !== false) selectGalleryCollection(result.collection.id);
    if (kind === 'smart') {
      setGalleryFilters({ ...DEFAULT_GALLERY_FILTERS, query: galleryFilters.query });
      setRenameCollectionId(result.collection.id);
    }
    showToast(kind === 'smart' ? '已保存智能收藏集' : '已新建收藏集');
    return result.collection;
  };

  const renameGalleryCollection = async (collection, name) => {
    const result = await invokeUI('collection.update', { id: collection.id, patch: { name } });
    if (!result?.ok) {
      showToast(result?.error || '没能修改收藏集名称', 'error');
      return false;
    }
    await reloadCollections();
    showToast('已修改收藏集名称');
    return true;
  };

  const beginSmartCollectionRulesEdit = (collection) => {
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
      showToast(result?.error || '没能更新智能收藏集规则', 'error');
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

  const deleteGalleryCollection = async (collection) => {
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
      showToast(result?.error || '没能删除收藏集', 'error');
      return false;
    }
    if (activeCollectionId === collection.id || editingSmartCollectionId === collection.id)
      selectGalleryCollection('');
    await reloadCollections();
    showToast(`已删除${collection.kind === 'smart' ? '智能收藏集' : '收藏集'}"${collection.name}"`);
    return true;
  };

  const updateGalleryCollectionProjects = async (collectionId, ids, action = 'add') => {
    const projectIds = [...new Set((ids || []).map(String).filter(Boolean))];
    if (!projectIds.length) return false;
    const result = await invokeResult(
      action === 'remove' ? 'collection.remove' : 'collection.add',
      { collectionId: collectionId, ids: projectIds },
    );
    if (!result?.ok) {
      showToast(result?.error || '没能更新收藏集里的图片', 'error');
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

  const resetWorkbench = async () => {
    if (!activeTab?.project) return;
    setWorkbenchSession((current) =>
      updateWorkbenchTab(current, activeTab.id, (tab) => ({
        ...tab,
        project: structuredClone(tab.originalProject),
        updatedAt: new Date().toISOString(),
      })),
    );
    showToast('已恢复图片中的原始提示词');
  };

  const installDownloadedUpdate = async () => {
    try {
      await workbenchConnection?.flush();
      const result = await invokeUI('updates.install', {});
      if (!result?.ok) throw new Error(result?.error || '没能开始安装更新');
      return true;
    } catch (error) {
      showToast(`没能重启安装：${error instanceof Error ? error.message : String(error)}`, 'error');
      return false;
    }
  };

  return (
    <div className="app-shell" ref={appShellRef}>
      <Titlebar
        onNavigate={setPage}
        page={page}
        status={
          <GenerationTitle
            onOpen={(id) => {
              setWorkbenchSession((current) => ({ ...current, activeTabId: id }));
              setPage('workbench');
            }}
          />
        }
      >
        {page === 'workbench' && (
          <WorkbenchTabs
            session={workbenchSession}
            onActivateTab={(id) =>
              setWorkbenchSession((current) => ({ ...current, activeTabId: id }))
            }
            onCloseTab={closeTab}
            onReorderTab={(id, target) =>
              setWorkbenchSession((current) => reorderWorkbenchTabs(current, id, target))
            }
            onChooseImage={() => openWorkbenchPath()}
            onOpenClipboard={() => openClipboardWorkbenchImage()}
            onBrowseLibrary={() => setPage('gallery')}
            onShowLibrary={(tab) => {
              setGalleryView('all');
              setGalleryFilters({ ...DEFAULT_GALLERY_FILTERS, query: tab.project?.name || '' });
              setPreviewProjectId(tab.source.projectId);
              setPage('gallery');
            }}
          />
        )}
      </Titlebar>
      <TransitionSurface className="app-content" change={page}>
        <Activity mode={page === 'workbench' ? 'visible' : 'hidden'}>
          <div className="app-page-surface">
            <WorkbenchPage
              onShowMaterials={(kind = 'block') => {
                setMaterialKind(kind);
                setPage('materials');
              }}
              onConfigureGeneration={() => {
                setMenuDestination({ section: 'novelai' });
                setPage('settings');
              }}
              beforeGeneration={() => workbenchConnection?.flush() || Promise.resolve()}
              error={workbenchError}
              focusScopeKey={workbenchFocus.scopeKey}
              focusTagId={workbenchFocus.tagId}
              loading={workbenchLoading}
              onActivateTab={(id) =>
                setWorkbenchSession((current) => ({ ...current, activeTabId: id }))
              }
              onChooseImage={() => openWorkbenchPath()}
              onClipboardImage={openClipboardWorkbenchImage}
              onCloseTab={closeTab}
              onCopyImage={async (project) => {
                const result = await invokeUI('image.copy', { path: project.image_path });
                showToast(
                  result?.ok ? '已复制图片' : result?.error || '没能复制图片',
                  result?.ok ? 'success' : 'error',
                );
              }}
              onCopyText={async (
                text,
                count,
                selected,
                ignored = 0,
                label = '',
                automaticIgnored = 0,
              ) => {
                if (!text) return;
                await writeClipboardText(text);
                const ignoredLabels = [
                  ignored ? `${ignored} 个负面 Tag` : '',
                  automaticIgnored ? `${automaticIgnored} 个 NovelAI 自动 Tag` : '',
                ].filter(Boolean);
                const copiedLabel = label ? ` ${label}` : selected ? '选中的 Tag' : '可见的 Tag';
                showToast(
                  `${count ? `已复制 ${count} 个${copiedLabel}` : `已复制${label || '提示词'}`}${ignoredLabels.length ? `，忽略 ${ignoredLabels.join('、')}` : ''}`,
                );
              }}
              onConfirm={requestConfirmation}
              onDownloadImage={async (project) => {
                const result = await invokeUI('image.save-as', {
                  path: project.image_path,
                  name: project.name,
                });
                if (!result?.canceled)
                  showToast(
                    result?.ok ? '已下载原图' : result?.error || '没能下载原图',
                    result?.ok ? 'success' : 'error',
                  );
              }}
              onNotify={showToast}
              onReset={resetWorkbench}
              onReveal={() =>
                activeTab?.project &&
                invokeUI('file.reveal', { path: activeTab.project.image_path })
              }
              onSaveLibrary={async () => {
                if (!activeTab?.project) return;
                const tabId = activeTab.id;
                await workbenchConnection?.flush();
                const commandResult = await studio.invoke('workbench.save-to-library', { tabId });
                const result = commandResult.ok
                  ? { ok: true, project: commandResult.data.project }
                  : { ok: false, error: commandResult.error.message };
                if (!result.ok) {
                  showToast(result.error, 'error');
                  return;
                }
                setWorkbenchSession((current) =>
                  updateWorkbenchTab(current, tabId, (tab) => ({
                    ...tab,
                    source: {
                      ...tab.source,
                      type: 'library',
                      projectId: result.project.id,
                      path: result.project.image_path,
                    },
                    project: {
                      ...tab.project,
                      id: result.project.id,
                      image_path: result.project.image_path,
                      thumbnail_path: result.project.thumbnail_path,
                    },
                  })),
                );
                await reloadLibrary('all');
                showToast('已存入图片库');
              }}
              onReorderTab={(tabId, targetTabId) =>
                setWorkbenchSession((current) => reorderWorkbenchTabs(current, tabId, targetTabId))
              }
              onRevealVibe={async (vibe) => {
                const result = await invokeUI('file.reveal', { vibe: vibe });
                showToast(
                  result?.ok ? '已在文件夹中显示 Vibe 文件' : result?.error || '没能生成 Vibe 文件',
                  result?.ok ? 'success' : 'error',
                );
              }}
              onTranslateTags={translateWorkbenchTags}
              onUpdateProject={updateWorkbenchProject}
              onUpdateViewState={(tabId, viewState) =>
                setWorkbenchSession((current) =>
                  updateWorkbenchTab(current, tabId, (tab) => ({
                    ...tab,
                    viewState: normalizeWorkbenchViewState(viewState),
                  })),
                )
              }
              session={workbenchSession}
            />
          </div>
        </Activity>
        <Activity mode={page === 'gallery' ? 'visible' : 'hidden'}>
          <div className="app-page-surface">
            <LibraryPage
              cacheProgress={cacheProgress}
              allCount={projectsByView.all.length}
              trashCount={projectsByView.trash.length}
              importProgress={importProgress}
              onCancelImport={() =>
                importProgress?.batchId && invokeUI('import.cancel', { id: importProgress.batchId })
              }
              dragState={dragState}
              activeCollection={activeCollection}
              collections={galleryCollectionsWithCounts}
              contentKey={galleryContentKey}
              editingSmartCollection={editingSmartCollection}
              filterCacheSource={deferredGalleryComputation.projects}
              filterProjects={collectionScopedProjects}
              filterScopeKey={`${deferredGalleryComputation.view}:${deferredGalleryComputation.activeCollection?.id || 'all'}:${deferredGalleryComputation.activeCollection?.updated_at || ''}`}
              filters={effectiveGalleryFilters}
              renameCollectionId={renameCollectionId}
              grouping={galleryGrouping}
              groups={visibleGroups}
              importing={isImportActive(importProgress)}
              loading={
                (libraryLoading && !projects.length) ||
                (deferredGalleryComputation.grouping.promptScope === 'similar' &&
                  similarGroupingState.loading &&
                  !similarGroupingState.groups.length)
              }
              onClearSelection={() => setSelectedGroupIds([])}
              onCollectionCreate={createGalleryCollection}
              onCollectionDelete={deleteGalleryCollection}
              onCollectionProjectsChange={updateGalleryCollectionProjects}
              onCollectionRename={renameGalleryCollection}
              onCollectionRulesCancel={cancelSmartCollectionRulesEdit}
              onCollectionRulesEdit={beginSmartCollectionRulesEdit}
              onCollectionRulesSave={saveSmartCollectionRules}
              onCollectionSelect={selectGalleryCollection}
              onCopyImage={async (project) => {
                const result = await invokeUI('image.copy', { id: project.id });
                showToast(
                  result?.ok ? '已复制图片' : result?.error || '没能复制图片',
                  result?.ok ? 'success' : 'error',
                );
              }}
              onDownloadImage={async (project) => {
                const result = await invokeUI('image.save-as', { id: project.id });
                if (!result?.canceled)
                  showToast(
                    result?.ok ? '已下载原图' : result?.error || '没能下载原图',
                    result?.ok ? 'success' : 'error',
                  );
              }}
              onGroupingChange={updateGalleryGrouping}
              onFiltersChange={updateGalleryFilters}
              onEmptyTrash={emptyTrash}
              onImport={() => importImages()}
              onImportClipboard={() => importImages(null, true)}
              onOpenWorkbench={(project) =>
                openWorkbenchPath(project.image_path, {
                  type: 'library',
                  projectId: project.id,
                  path: project.image_path,
                })
              }
              onPermanentDelete={permanentDelete}
              onPreview={previewGalleryGroup}
              onQueryChange={(query) => updateGalleryFilters({ query })}
              onRename={renameProject}
              onRenameMany={renameProjects}
              onRestore={restoreProjects}
              onReveal={(project) => invokeUI('file.reveal', { path: project.image_path })}
              onSelectionChange={(groupIds) => {
                setSelectedGroupIds(groupIds);
                lastSelectedGroupRef.current = groupIds.at(-1) || '';
              }}
              onSelectAll={() => setSelectedGroupIds(visibleGroups.map((group) => group.id))}
              onSortChange={setSort}
              onToggleSelect={toggleGroupSelection}
              onTrash={moveToTrash}
              onViewChange={(view) => {
                writeActiveGalleryCollection(globalThis.localStorage, '');
                setActiveCollectionId('');
                setEditingSmartCollectionId('');
                setGalleryView(view);
                setSelectedGroupIds([]);
                setPreviewGroupId('');
                setPreviewProjectId('');
              }}
              preview={preview}
              previewGroup={previewGroup}
              query={galleryFilters.query}
              selectedGroupIds={selectedGroupIds}
              selectedImageCount={selectedProjectIds.length}
              sort={sort}
              updating={galleryUpdating}
              view={galleryView}
            />
          </div>
        </Activity>
        <Activity mode={page === 'materials' ? 'visible' : 'hidden'}>
          <MaterialsPage initialKind={materialKind} />
        </Activity>
        <Activity mode={page === 'settings' ? 'visible' : 'hidden'}>
          <div className="app-page-surface">
            <SettingsPage
              onAccountSaved={() => setPage('workbench')}
              menuDestination={menuDestination}
              onFindTag={(tag) => {
                selectGalleryCollection('');
                setGalleryFilters({ ...DEFAULT_GALLERY_FILTERS, query: tag });
                setPage('gallery');
              }}
              onEmptyTrash={emptyTrash}
              onInstallUpdate={installDownloadedUpdate}
              onLibraryChange={async () => {
                const [images, trash] = await Promise.all([
                  reloadLibrary('all'),
                  reloadLibrary('trash'),
                ]);
                const paths = new Map([...images, ...trash].map((image) => [image.id, image]));
                setWorkbenchSession((session) => ({
                  ...session,
                  tabs: session.tabs.map((tab) => {
                    const image = tab.source.type === 'library' && paths.get(tab.source.projectId);
                    if (!image) return tab;
                    const update = (project) =>
                      project && {
                        ...project,
                        image_path: image.image_path,
                        thumbnail_path: image.thumbnail_path,
                      };
                    return {
                      ...tab,
                      source: { ...tab.source, path: image.image_path },
                      project: update(tab.project),
                      originalProject: update(tab.originalProject),
                    };
                  }),
                }));
              }}
            />
          </div>
        </Activity>
      </TransitionSurface>
      {page !== 'gallery' && (
        <ImportExperience
          dragState={dragState}
          onCancel={() =>
            importProgress?.batchId && invokeUI('import.cancel', { id: importProgress.batchId })
          }
          onDismiss={() => setImportResult(null)}
          progress={importProgress}
          result={importResult}
          target={page}
        />
      )}
      <ZipImport
        importSession={archiveImport}
        key={archiveImport?.sessionId || 'archive-import'}
        onCancel={cancelArchiveImport}
        onImport={commitArchiveImport}
      />

      <Dialog
        open={Boolean(confirmation)}
        title={confirmation?.title || ''}
        cancelLabel="取消"
        confirmLabel={confirmation?.okText || '确定'}
        destructive={Boolean(confirmation?.danger)}
        onCancel={() => resolveConfirmation(false)}
        onConfirm={() => resolveConfirmation(true)}
      >
        <p>{confirmation?.message}</p>
        {confirmation?.detail && <p>{confirmation.detail}</p>}
      </Dialog>
      <Layer
        open={!!contextMenu}
        onClose={() => setContextMenu(null)}
        anchor={appShellRef}
        point={contextMenu?.point}
        focus
        className="nps-menu"
      >
        <MenuItems
          items={contextMenu?.items || []}
          label="文本操作"
          closeAll={() => setContextMenu(null)}
          closeLevel={() => setContextMenu(null)}
        />
      </Layer>
    </div>
  );
}
