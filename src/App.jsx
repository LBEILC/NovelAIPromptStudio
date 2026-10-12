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
import { motion, useAnimationControls } from 'motion/react';
import LibraryPage from './library/LibraryPage';
import { useLibraryCacheProgress } from './state/libraryCacheProgress';
import SettingsPage from './settings/SettingsPage';
import { Titlebar } from './shell/Titlebar';
import { useAppearance } from './state/appearance';
import { Dialog, Button, Layer, MenuItems, useNotifications } from './ui';
import WorkbenchPage from './workbench/WorkbenchPage';
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
import { DEFAULT_MONO_FONT, DEFAULT_SANS_FONT } from './lib/fonts.js';
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
import {
  MOTION_BLUR_MEDIUM_PX,
  MOTION_DISTANCE_BASE_PX,
  MOTION_DURATION_FAST_SECONDS,
  MOTION_EASE_SMOOTH_OUT,
  useStudioReducedMotion,
} from './lib/motion.js';
import {
  moveOverviewTags,
  overviewMoveContext,
  overviewSelectionMenuItems,
  overviewTagKey,
} from './lib/promptOverview.js';

const unavailable = (error) => async () => ({ ok: false, error });
const studio = window.studio || {
  loadLibrary: async () => [],
  loadCollections: async () => ({ ok: true, collections: [] }),
  createCollection: unavailable('请在桌面应用中创建收藏集'),
  updateCollection: unavailable('请在桌面应用中修改收藏集'),
  deleteCollection: unavailable('请在桌面应用中删除收藏集'),
  updateCollectionProjects: unavailable('请在桌面应用中管理收藏集图片'),
  getLibraryStorage: async () => ({
    ok: true,
    assetsDirectory: '',
    fileCount: 0,
    totalBytes: 0,
    isDefault: true,
  }),
  changeLibraryStorage: unavailable('请在桌面应用中更改资源库位置'),
  revealLibraryStorage: unavailable('请在桌面应用中打开资源库文件夹'),
  onLibraryStorageProgress: () => {},
  offLibraryStorageProgress: () => {},
  openWorkbenchImage: unavailable('请在桌面应用中打开图片'),
  openDroppedWorkbenchImages: unavailable('请在桌面应用中打开图片'),
  openClipboardWorkbenchImage: unavailable('请在桌面应用中读取剪贴板'),
  syncWorkbenchTemporaryImages: async () => ({ ok: true }),
  revealEmbeddedVibe: unavailable('请在桌面应用中导出 Vibe'),
  importImages: async () => ({
    ok: true,
    canceled: true,
    imported: [],
    duplicates: [],
    errors: [],
    summary: null,
  }),
  importClipboardImage: unavailable('请在桌面应用中读取剪贴板'),
  importDroppedFiles: unavailable('请在桌面应用中导入'),
  prepareImport: async () => ({ ok: true, canceled: true }),
  prepareDroppedImport: unavailable('请在桌面应用中导入'),
  startPreparedImportPreviews: unavailable('请在桌面应用中预览压缩包'),
  cancelPreparedImport: async () => ({ ok: true }),
  commitPreparedImport: unavailable('请在桌面应用中导入'),
  onPreparedImportPreview: () => {},
  offPreparedImportPreview: () => {},
  cancelImport: unavailable('没有进行中的导入'),
  onImportProgress: () => {},
  offImportProgress: () => {},
  updateProjectName: unavailable('请在桌面应用中修改名称'),
  moveProjectsToTrash: unavailable('请在桌面应用中管理回收站'),
  restoreProjects: unavailable('请在桌面应用中管理回收站'),
  permanentlyDeleteProjects: unavailable('请在桌面应用中管理回收站'),
  getTrashSummary: async () => ({ ok: true, projects: [], count: 0, totalBytes: 0 }),
  setGroupCover: unavailable('请在桌面应用中设置头图'),
  copyProjectImage: unavailable('请在桌面应用中复制图片'),
  downloadProjectImage: unavailable('请在桌面应用中下载图片'),
  copyWorkbenchImage: unavailable('请在桌面应用中复制图片'),
  downloadWorkbenchImage: unavailable('请在桌面应用中下载图片'),
  saveTagAnnotations: async () => ({ ok: true }),
  listTagCache: async () => ({ ok: true, items: [], limit: 40, offset: 0, total: 0 }),
  updateTagCache: unavailable('请在桌面应用中修改 Tag 缓存'),
  updateTagCacheMany: unavailable('请在桌面应用中批量修改 Tag 缓存'),
  deleteTagCache: unavailable('请在桌面应用中删除 Tag 缓存'),
  deleteTagCacheMany: unavailable('请在桌面应用中批量删除 Tag 缓存'),
  revealFile: async () => {},
  getAISettings: async () => ({
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    hasApiKey: false,
    encryptionAvailable: true,
  }),
  saveAISettings: async (settings) => settings,
  getAppearanceSettings: async () => ({
    themeMode: 'dark',
    primaryColor: 'blue',
    sansFont: DEFAULT_SANS_FONT,
    monoFont: DEFAULT_MONO_FONT,
    motion: 'full',
  }),
  saveAppearanceSettings: async (settings) => settings,
  getProductivitySettings: async () => ({ recentImageDirectory: '', autoCheckUpdates: true }),
  saveProductivitySettings: async (settings) => settings,
  getUpdateStatus: async () => ({
    ok: true,
    currentVersion: '0.0.0',
    packaged: false,
    platform: 'web',
    updateMode: 'manual',
    canDownloadUpdate: false,
    canInstallUpdate: false,
    manualUpdateReason: 'development',
  }),
  checkForUpdates: unavailable('请在桌面应用中检查更新'),
  downloadUpdate: unavailable('请在桌面应用中下载更新'),
  installUpdate: unavailable('请在桌面应用中安装更新'),
  onUpdateState: () => {},
  offUpdateState: () => {},
  openReleasePage: async () => ({ ok: true }),
  listSystemFonts: async () => ({ ok: true, fonts: [] }),
  listAIModels: unavailable('请在桌面应用中配置 API'),
  testAIModel: unavailable('请在桌面应用中配置 API'),
  translateTags: unavailable('请在桌面应用中配置 API'),
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
      await navigator.clipboard.writeText(String(editable.value || '').slice(start, end));
      if (action === 'cut') {
        editable.setRangeText('', start, end, 'end');
        dispatchInput(editable, 'deleteByCut');
      }
      return;
    }
    if (action === 'paste') {
      const text = await navigator.clipboard.readText();
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

function PageSurface({ active, motionMode, children }) {
  const controls = useAnimationControls();
  const reduceMotion = useStudioReducedMotion(motionMode);

  useLayoutEffect(() => {
    if (!active) return undefined;
    if (reduceMotion) {
      controls.set({ filter: 'blur(0px)', opacity: 1, y: 0 });
      return undefined;
    }
    controls.set({
      filter: `blur(${MOTION_BLUR_MEDIUM_PX}px)`,
      opacity: 0.72,
      y: MOTION_DISTANCE_BASE_PX,
    });
    controls.start({
      filter: 'blur(0px)',
      opacity: 1,
      transition: { duration: MOTION_DURATION_FAST_SECONDS, ease: MOTION_EASE_SMOOTH_OUT },
      y: 0,
    });
    return () => {
      controls.stop();
      controls.set({
        filter: `blur(${MOTION_BLUR_MEDIUM_PX}px)`,
        opacity: 0,
        y: MOTION_DISTANCE_BASE_PX,
      });
    };
  }, [active, controls, reduceMotion]);

  return (
    <motion.div animate={controls} className="app-page-surface" initial={false}>
      {children}
    </motion.div>
  );
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
                  ? '松开以打开为工作台标签'
                  : '松开以保存到图片库'
                : '这些文件暂不支持'}
            </strong>
            <span>
              {workbench
                ? 'PNG / JPG / WEBP，每张图片创建一个标签'
                : 'PNG / JPG / WEBP / ZIP，可批量导入'}
            </span>
          </div>
        </div>
      )}
      {importing && (
        <div className="import-status">
          <div>
            <strong>{progress.phase === 'preparing' ? '正在检查文件' : '正在导入图片'}</strong>
            <span>
              {progress.current || '准备中'} · {percent}%
            </span>
          </div>
          <progress max="100" value={percent} />
          <Button onClick={onCancel} size="small">
            取消
          </Button>
        </div>
      )}
      {result && (
        <div className="import-result">
          <i className={result.errors?.length ? 'ri-alert-line' : 'ri-check-line'} />
          <span>
            导入 {result.imported?.length || 0} 张 · 跳过重复 {result.duplicates?.length || 0} 张
            {result.errors?.length ? ` · 失败 ${result.errors.length} 张` : ''}
          </span>
          <Button onClick={onDismiss} size="small" variant="quiet">
            关闭
          </Button>
        </div>
      )}
    </>
  );
}

function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(0.1, bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const { appearance } = useAppearance();
  const [page, setPage] = useState(window.studioScreenshot?.page || 'workbench');
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
  const {
    workbenchSession,
    setWorkbenchSession,
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
  const reduceMotion = useStudioReducedMotion(appearance.motion);

  const showToast = useCallback((message) => {
    notificationTarget.current.notify({ text: message });
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
    async (view = 'all') => {
      const targetView = view === 'trash' ? 'trash' : 'all';
      const requestId = (libraryRequestsRef.current[targetView] || 0) + 1;
      libraryRequestsRef.current[targetView] = requestId;
      setLibraryLoadingByView((current) => ({ ...current, [targetView]: true }));
      try {
        const items = await studio.loadLibraryCards(targetView);
        if (libraryRequestsRef.current[targetView] !== requestId) return [];
        const hydrated = items || [];
        setProjectsByView((current) => ({ ...current, [targetView]: hydrated }));
        loadedLibraryViewsRef.current.add(targetView);
        return hydrated;
      } catch (error) {
        if (libraryRequestsRef.current[targetView] === requestId) {
          showToast(error instanceof Error ? error.message : String(error), 'error');
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

  const reloadCollections = useCallback(async () => {
    const result = await studio.loadCollections();
    if (!result?.ok) {
      showToast(result?.error || '收藏集没有加载', 'error');
      return [];
    }
    const next = (result.collections || []).map(normalizeGalleryCollection);
    setGalleryCollections(next);
    setActiveCollectionId((current) => {
      const restored =
        current && next.some((collection) => collection.id === current)
          ? current
          : readActiveGalleryCollection(globalThis.localStorage, next);
      return writeActiveGalleryCollection(globalThis.localStorage, restored);
    });
    return next;
  }, [showToast]);

  useEffect(() => {
    if (!loadedLibraryViewsRef.current.has(galleryView)) reloadLibrary(galleryView);
    if (!loadedLibraryViewsRef.current.has('trash')) reloadLibrary('trash');
  }, [galleryView, reloadLibrary]);

  useEffect(() => {
    reloadCollections();
  }, [reloadCollections]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (window.studioScreenshot) {
        const tabs = await Promise.all(
          (window.studioScreenshot.workbenchPaths || []).map(async (filePath) => {
            const result = await studio.openWorkbenchImage(filePath);
            if (!result.ok) throw new Error(result.error);
            return createWorkbenchTab(hydrateProject(result.project), { source: result.source });
          }),
        );
        if (!active) return;
        setWorkbenchSession({ version: 2, tabs, activeTabId: tabs[0]?.id || '' });
        setWorkbenchSessionReady(true);
        return;
      }
      const saved = parseWorkbenchSession(
        window.localStorage.getItem(WORKBENCH_SESSION_KEY) ||
          window.localStorage.getItem(LEGACY_WORKBENCH_SESSION_KEY),
      );
      if (!saved?.tabs?.length) {
        setWorkbenchSessionReady(true);
        return;
      }
      setWorkbenchLoading(true);
      const tabs = await Promise.all(
        saved.tabs.map(async (stored) => {
          const result = await studio.openWorkbenchImage(stored.source.path, stored.source);
          if (!result?.ok || !result.project) {
            return {
              id: stored.id,
              identity: `${stored.source.type}:${stored.source.projectId || stored.source.path || stored.source.temporaryId}`,
              displayName: stored.displayName || '不可用图片',
              source: stored.source,
              originalProject: null,
              project: syncProjectPromptMetadata({
                id: stored.id,
                name: stored.displayName || '',
                image_path: stored.source.path || '',
                thumbnail_path: '',
                created_at: stored.updatedAt,
                updated_at: stored.updatedAt,
                metadata: {},
                tags: stored.draft.tags || [],
                prompt_structure: stored.draft.prompt_structure,
              }),
              savedDraft: stored.draft,
              viewState: normalizeWorkbenchViewState(stored.viewState),
              updatedAt: stored.updatedAt,
              error: result?.error || '图片源已不可用',
            };
          }
          const restoredSource = result.source || stored.source;
          return createWorkbenchTab(hydrateProject(result.project), {
            ...stored,
            displayName:
              restoredSource.type === 'library' ? result.project.name : stored.displayName,
            draft: stored.draft,
            source: restoredSource,
          });
        }),
      );
      if (!active) return;
      setWorkbenchSession({
        version: 2,
        tabs,
        activeTabId: tabs.some((tab) => tab.id === saved.activeTabId)
          ? saved.activeTabId
          : tabs[0]?.id || '',
      });
      window.localStorage.removeItem(LEGACY_WORKBENCH_SESSION_KEY);
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
    if (workbenchSession.tabs.length)
      window.localStorage.setItem(
        WORKBENCH_SESSION_KEY,
        serializeWorkbenchSession(workbenchSession),
      );
    else window.localStorage.removeItem(WORKBENCH_SESSION_KEY);
    const temporaryPaths = workbenchSession.tabs
      .filter((tab) => tab.source?.type === 'clipboard' && tab.source.path)
      .map((tab) => tab.source.path);
    studio.syncWorkbenchTemporaryImages(temporaryPaths);
  }, [workbenchSession, workbenchSessionReady]);

  useEffect(() => {
    studio.onImportProgress((progress) =>
      setImportProgress(isImportActive(progress) ? progress : null),
    );
    return () => studio.offImportProgress();
  }, []);

  useEffect(() => {
    studio.onPreparedImportPreview((update) => {
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
    return () => studio.offPreparedImportPreview();
  }, []);

  useEffect(() => {
    if (!archiveImport?.sessionId) return;
    studio
      .startPreparedImportPreviews(archiveImport.sessionId)
      .then((result) => {
        if (result?.ok) return;
        setArchiveImport((current) =>
          current?.sessionId === archiveImport.sessionId
            ? {
                ...current,
                previewComplete: true,
                previewError: result?.error || '压缩包预览没有启动',
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
      const settings = await studio.getProductivitySettings().catch(() => null);
      if (!settings?.autoCheckUpdates) return;
      const result = await studio.checkForUpdates().catch(() => null);
      if (result?.ok && result.hasUpdate)
        showToast(`发现新版本 v${result.latestVersion}，可在“关于与更新”中查看`);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  useEffect(() => {
    const handler = (event) => {
      if (event.defaultPrevented || !isTextEditingTarget(event.target)) return;
      const editable = event.target.closest('textarea, input, [contenteditable="true"]');
      const selection = captureTextSelection(editable);
      const invoke = (action) =>
        runTextEditAction(selection, action).catch(() => showToast('文本操作没有完成', 'error'));
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
        const result = await studio.openWorkbenchImage(filePath, source);
        if (result?.canceled) return false;
        if (!result?.ok || !result.project) throw new Error(result?.error || '图片没有打开');
        acceptWorkbenchProject(result.project, result.source || source);
        showToast('图片已在新工作台标签中打开');
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
      const result = await studio.openClipboardWorkbenchImage();
      if (!result?.ok || !result.project) throw new Error(result?.error || '剪贴板图片没有打开');
      acceptWorkbenchProject(result.project, result.source);
      showToast(
        result.metadataMissing
          ? '已读取剪贴板图片，但只包含像素，未检测到 NovelAI Prompt 元数据'
          : '剪贴板图片已在工作台中打开',
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
        const result = await studio.openDroppedWorkbenchImages(files);
        if (!result?.ok) throw new Error(result?.error || '图片没有打开');
        for (const item of result.items || []) {
          if (item.ok && item.project) acceptWorkbenchProject(item.project, item.source);
        }
        const failures = (result.items || []).filter((item) => !item.ok);
        if (failures.length)
          setWorkbenchError(`${failures.length} 张图片没有打开：${failures[0].error}`);
        if (result.items?.some((item) => item.ok))
          showToast(`已打开 ${result.items.filter((item) => item.ok).length} 个工作台标签`);
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
      if (result?.summary)
        showToast(
          `导入 ${result.summary.imported} 张 · 跳过重复 ${result.summary.duplicates} 张 · 失败 ${result.summary.failed} 张`,
        );
      await reloadLibrary('all');
      if (result?.imported?.length) setPreviewProjectId(result.imported.at(-1).id);
      if (result?.metadataMissing)
        showToast('已读取剪贴板图片，但只包含像素，未检测到 NovelAI Prompt 元数据', 'warning');
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
          const result = await studio.importClipboardImage();
          if (!result?.canceled) await acceptLibraryImportResult(result);
          return;
        }
        const preparation = files
          ? await studio.prepareDroppedImport(files)
          : await studio.prepareImport();
        if (preparation?.canceled) return;
        if (!preparation?.ok) throw new Error(preparation?.error || '文件没有准备完成');
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
        const result = await studio.commitPreparedImport(preparation.sessionId, []);
        if (result?.canceled) return;
        preparedSessionId = '';
        await acceptLibraryImportResult(result);
      } catch (error) {
        if (preparedSessionId) studio.cancelPreparedImport(preparedSessionId);
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
    if (sessionId) studio.cancelPreparedImport(sessionId);
  }, [archiveImport]);

  const commitArchiveImport = useCallback(
    async (entryIds) => {
      const sessionId = archiveImport?.sessionId;
      if (!sessionId) return;
      setArchiveImport(null);
      setImportResult(null);
      setImportProgress({ phase: 'preparing', processed: 0, total: 0, current: '准备所选图片' });
      try {
        const result = await studio.commitPreparedImport(sessionId, entryIds);
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
          title: '关闭已修改的标签？',
          message: `“${tab.displayName}”的 Prompt 已相对原图修改。`,
          detail: '关闭后会丢弃这个标签的草稿，其他标签不受影响。',
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
    visibleGroups,
    galleryUpdating,
    galleryContentKey,
    previewGroup,
    preview,
  } = useLibraryComputation({
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
      const result = await studio.saveTagAnnotations(entries);
      if (!result?.ok) showToast(result?.error || 'Tag 翻译与分类没有保存', 'error');
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
    void studio
      .saveWorkbenchStructure(
        activeTab.source.path,
        updated.prompt_structure,
        activeTab.source.projectId,
      )
      .then((result) => {
        if (!result.ok) showToast(result.error || '块类型与译文没有保存', 'error');
      });
  };

  const translateWorkbenchTags = async (entries) => {
    if (!activeTab?.project) return;
    const tabId = activeTab.id;
    const result = await studio.translateTags(entries.map((entry) => entry.tag.tag));
    if (!result?.ok) {
      showToast(result?.error || '翻译与分类没有完成', 'error');
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
      showToast(`已应用离线结果，${result.unresolved_count} 个 Tag 仍缺少译文或分类`);
    else showToast(`已通过离线词典整理 ${entries.length} 个 Tag`);
  };

  const summarizeBatch = (result, action, groupCount = 0) => {
    if (!result?.ok) {
      showToast(result?.error || `${action}没有完成`, 'error');
      return false;
    }
    const summary = result.summary || {};
    const imageCount = (summary.success || 0) + (summary.skipped || 0) + (summary.failed || 0);
    const scope = groupCount ? `${groupCount} 组、${imageCount} 张图片；` : '';
    showToast(
      `${action}：${scope}成功 ${summary.success || 0}，跳过 ${summary.skipped || 0}，失败 ${summary.failed || 0}`,
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
    const result = await studio.moveProjectsToTrash(ids);
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
      text: ids.length === 1 ? '已移入回收站' : `已将 ${ids.length} 张图片移入回收站`,
      action: { label: '撤销', onClick: () => restoreProjects(result.results?.success || ids) },
    });
  };

  const restoreProjects = async (explicitIds = null, scope = 'selection') => {
    const ids = explicitIds || selectedProjectIds;
    if (!ids.length) return;
    const result = await studio.restoreProjects(ids);
    const groupCount = scope === 'group' ? 1 : explicitIds ? 0 : selectedGroupIds.length;
    if (summarizeBatch(result, '恢复', groupCount)) {
      setPreviewGroupId('');
      setPreviewProjectId('');
      await reloadAfterGalleryAction();
    }
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

  const permanentDelete = async (explicitIds = null, knownBytes = null, scope = 'selection') => {
    const ids = explicitIds || selectedProjectIds;
    if (!ids.length) return;
    const impact = tabImpact(ids);
    if (
      !(await requestConfirmation({
        title: `永久删除这 ${ids.length} 张图片？`,
        message: `会删除图片库里保存的这 ${ids.length} 份副本和它们的记录，删除后无法恢复。你导入时用的原文件不受影响。`,
        detail:
          page === 'gallery'
            ? deletionDetail(impact, formatBytes(knownBytes))
            : `${impact.open ? `${impact.open} 张仍在工作台打开。` : ''}${impact.dirty ? `其中 ${impact.dirty} 个标签包含工作区草稿，继续会丢弃。` : ''} 此操作不可撤销。`,
        okText: '永久删除',
        danger: true,
        primaryDanger: true,
      }))
    )
      return;
    const result = await studio.permanentlyDeleteProjects(ids);
    const groupCount = scope === 'group' ? 1 : explicitIds ? 0 : selectedGroupIds.length;
    if (!summarizeBatch(result, '永久删除', groupCount)) return;
    closeDeletedLibraryTabs(result.results?.success || []);
    setPreviewGroupId('');
    setPreviewProjectId('');
    await reloadAfterGalleryAction();
  };

  const emptyTrash = async () => {
    const summary = await studio.getTrashSummary();
    if (!summary?.ok) {
      showToast(summary?.error || '无法读取回收站', 'error');
      return;
    }
    if (!summary.projects?.length) return;
    await permanentDelete(
      summary.projects.map((project) => project.id),
      summary.totalBytes,
    );
  };

  const renameProjects = async (ids, name) => {
    const names = numberedImageNames(name, ids.length);
    const result = await studio.updateProjectNames(
      ids.map((id, index) => ({ id, name: names[index] })),
    );
    if (!result?.ok) {
      showToast(result?.error || '图片名称没有修改', 'error');
      return false;
    }
    await reloadLibrary(galleryView);
    notify({
      text: '已给 ' + ids.length + ' 张图片起名',
      action: {
        label: '撤销',
        onClick: async () => {
          const restored = await studio.updateProjectNames(result.previous);
          if (!restored?.ok) {
            showToast(restored?.error || '图片名称没有修改', 'error');
            return;
          }
          await reloadLibrary(galleryView);
        },
      },
    });
    return true;
  };

  const renameProject = async (project, name) => {
    const result = await studio.updateProjectName(project.id, name);
    if (!result?.ok) {
      showToast(result?.error || '图片名称没有修改', 'error');
      return false;
    }
    showToast('图片名称已修改');
    await reloadLibrary(galleryView);
    return true;
  };

  const setGroupCover = async (group, project) => {
    const result = await studio.setGroupCover(group.fingerprint, project.id);
    if (!result?.ok) {
      showToast(result?.error || '头图没有更新', 'error');
      return;
    }
    showToast('已设为图片组头图');
    await reloadLibrary(galleryView);
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
    setGalleryFilters((current) => normalizeGalleryFilters({ ...current, ...patch }));
    setSelectedGroupIds([]);
    lastSelectedGroupRef.current = '';
  };

  const selectGalleryCollection = (collectionId) => {
    const id = writeActiveGalleryCollection(globalThis.localStorage, collectionId);
    setEditingSmartCollectionId('');
    setActiveCollectionId(id);
    setGalleryView('all');
    setGalleryFilters(DEFAULT_GALLERY_FILTERS);
    setSelectedGroupIds([]);
    setPreviewGroupId('');
    setPreviewProjectId('');
    lastSelectedGroupRef.current = '';
  };

  const createGalleryCollection = async (kind, name) => {
    if (kind === 'smart' && (activeCollectionId || !hasActiveGalleryFilters(galleryFilters))) {
      showToast(
        activeCollectionId ? '请先返回全部图片，再设置要保存的筛选条件' : '请先设置搜索或筛选条件',
        'warning',
      );
      return false;
    }
    const result = await studio.createCollection({
      name,
      kind,
      filters: kind === 'smart' ? normalizeGalleryFilters(galleryFilters) : undefined,
    });
    if (!result?.ok) {
      showToast(result?.error || '收藏集没有创建', 'error');
      return false;
    }
    await reloadCollections();
    selectGalleryCollection(result.collection.id);
    showToast(kind === 'smart' ? '智能收藏集已保存' : '普通收藏集已创建');
    return result.collection;
  };

  const renameGalleryCollection = async (collection, name) => {
    const result = await studio.updateCollection(collection.id, { name });
    if (!result?.ok) {
      showToast(result?.error || '收藏集名称没有修改', 'error');
      return false;
    }
    await reloadCollections();
    showToast('收藏集名称已修改');
    return true;
  };

  const beginSmartCollectionRulesEdit = (collection) => {
    if (collection?.kind !== 'smart') return;
    writeActiveGalleryCollection(globalThis.localStorage, '');
    setActiveCollectionId('');
    setEditingSmartCollectionId(collection.id);
    setGalleryView('all');
    setGalleryFilters(normalizeGalleryFilters(collection.filters));
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
    if (!hasActiveGalleryFilters(galleryFilters)) {
      showToast('智能收藏集至少需要一个搜索或筛选条件', 'warning');
      return false;
    }
    const result = await studio.updateCollection(collection.id, {
      filters: normalizeGalleryFilters(galleryFilters),
    });
    if (!result?.ok) {
      showToast(result?.error || '智能收藏集规则没有更新', 'error');
      return false;
    }
    await reloadCollections();
    selectGalleryCollection(collection.id);
    showToast('智能收藏集规则已更新');
    return true;
  };

  const cancelSmartCollectionRulesEdit = () => {
    if (editingSmartCollectionId) selectGalleryCollection(editingSmartCollectionId);
  };

  const deleteGalleryCollection = async (collection) => {
    if (
      !(await requestConfirmation({
        title: `删除“${collection.name}”？`,
        message:
          collection.kind === 'smart'
            ? '将删除这组自动筛选规则。'
            : '将删除收藏集及其中的成员关系。',
        detail: '图片文件与图库中的图片不会被删除。',
        okText: '删除收藏集',
        danger: true,
      }))
    )
      return false;
    const result = await studio.deleteCollection(collection.id);
    if (!result?.ok) {
      showToast(result?.error || '收藏集没有删除', 'error');
      return false;
    }
    if (activeCollectionId === collection.id || editingSmartCollectionId === collection.id)
      selectGalleryCollection('');
    await reloadCollections();
    showToast('收藏集已删除');
    return true;
  };

  const updateGalleryCollectionProjects = async (collectionId, ids, action = 'add') => {
    const projectIds = [...new Set((ids || []).map(String).filter(Boolean))];
    if (!projectIds.length) return false;
    const result = await studio.updateCollectionProjects(collectionId, projectIds, action);
    if (!result?.ok) {
      showToast(result?.error || '收藏集成员没有更新', 'error');
      return false;
    }
    await reloadCollections();
    if (action === 'remove' && activeCollectionId === collectionId) setSelectedGroupIds([]);
    const success = result.summary?.success || 0;
    const skipped = result.summary?.skipped || 0;
    showToast(
      `${action === 'remove' ? '已移出' : '已加入'} ${success} 张图片${skipped ? `，跳过 ${skipped} 张` : ''}`,
    );
    return true;
  };

  const resetWorkbench = async () => {
    if (!activeTab?.project) return;
    if (
      workbenchTabHasChanges(activeTab) &&
      !(await requestConfirmation({
        title: '恢复图片中的 Prompt？',
        message: '当前标签中的修改将被清除。',
        detail: '图片文件本身不会被修改，其他标签不受影响。',
        okText: '恢复',
        danger: true,
      }))
    )
      return;
    setWorkbenchSession((current) =>
      updateWorkbenchTab(current, activeTab.id, (tab) => ({
        ...tab,
        project: structuredClone(tab.originalProject),
        updatedAt: new Date().toISOString(),
      })),
    );
    showToast('已恢复图片中的原始 Prompt');
  };

  const installDownloadedUpdate = async () => {
    try {
      const serialized = serializeWorkbenchSession(workbenchSession);
      if (serialized) {
        window.localStorage.setItem(WORKBENCH_SESSION_KEY, serialized);
        if (window.localStorage.getItem(WORKBENCH_SESSION_KEY) !== serialized)
          throw new Error('工作台会话校验失败');
      } else {
        window.localStorage.removeItem(WORKBENCH_SESSION_KEY);
      }
      const result = await studio.installUpdate();
      if (!result?.ok) throw new Error(result?.error || '更新没有开始安装');
      return true;
    } catch (error) {
      showToast(`无法重启安装：${error instanceof Error ? error.message : String(error)}`, 'error');
      return false;
    }
  };

  return (
    <div className="app-shell" ref={appShellRef}>
      <Titlebar onNavigate={setPage} page={page}>
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
            onShowLibrary={(tab) => {
              setGalleryView('all');
              setGalleryFilters({ ...DEFAULT_GALLERY_FILTERS, query: tab.project?.name || '' });
              setPreviewProjectId(tab.source.projectId);
              setPage('gallery');
            }}
          />
        )}
      </Titlebar>
      <div className="app-content">
        <Activity mode={page === 'workbench' ? 'visible' : 'hidden'}>
          <PageSurface active={page === 'workbench'} motionMode={appearance.motion}>
            <WorkbenchPage
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
                const result = await studio.copyWorkbenchImage(project.image_path);
                showToast(
                  result?.ok ? '图片已复制到系统剪贴板' : result?.error || '图片复制失败',
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
                await navigator.clipboard.writeText(text);
                const ignoredLabels = [
                  ignored ? `${ignored} 个排除 Tag` : '',
                  automaticIgnored ? `${automaticIgnored} 个 NovelAI 自动 Tag` : '',
                ].filter(Boolean);
                const copiedLabel = label
                  ? ` ${label}`
                  : selected
                    ? '已选 Prompt Tag'
                    : '可见 Prompt Tag';
                showToast(
                  `${count ? `已复制 ${count} 个${copiedLabel}` : `已复制${label || 'Prompt'}`}${ignoredLabels.length ? `，忽略 ${ignoredLabels.join('、')}` : ''}`,
                );
              }}
              onConfirm={requestConfirmation}
              onDownloadImage={async (project) => {
                const result = await studio.downloadWorkbenchImage(
                  project.image_path,
                  project.name,
                );
                if (!result?.canceled)
                  showToast(
                    result?.ok
                      ? '图片已下载，原始格式与元数据已保留'
                      : result?.error || '图片下载失败',
                    result?.ok ? 'success' : 'error',
                  );
              }}
              onNotify={showToast}
              onReset={resetWorkbench}
              onReveal={() => activeTab?.project && studio.revealFile(activeTab.project.image_path)}
              onSaveLibrary={async () => {
                if (!activeTab?.project) return;
                const tabId = activeTab.id;
                const result = await studio.saveWorkbenchToLibrary(
                  activeTab.project.image_path,
                  activeTab.project.prompt_structure.block_annotations,
                );
                if (!result.ok) {
                  showToast(result.error);
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
                const result = await studio.revealEmbeddedVibe(vibe);
                showToast(
                  result?.ok ? '已在文件夹中显示 Vibe 文件' : result?.error || 'Vibe 文件没有生成',
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
          </PageSurface>
        </Activity>
        <Activity mode={page === 'gallery' ? 'visible' : 'hidden'}>
          <PageSurface active={page === 'gallery'} motionMode={appearance.motion}>
            <LibraryPage
              cacheProgress={cacheProgress}
              allCount={projectsByView.all.length}
              trashCount={projectsByView.trash.length}
              importProgress={importProgress}
              onCancelImport={() =>
                importProgress?.batchId && studio.cancelImport(importProgress.batchId)
              }
              dragState={dragState}
              activeCollection={activeCollection}
              collections={galleryCollectionsWithCounts}
              contentKey={galleryContentKey}
              editingSmartCollection={editingSmartCollection}
              filterCacheSource={deferredGalleryComputation.projects}
              filterProjects={collectionScopedProjects}
              filterScopeKey={`${deferredGalleryComputation.view}:${deferredGalleryComputation.activeCollection?.id || 'all'}:${deferredGalleryComputation.activeCollection?.updated_at || ''}`}
              filters={galleryFilters}
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
                const result = await studio.copyProjectImage(project.id);
                showToast(
                  result?.ok ? '图片已复制到系统剪贴板' : result?.error || '图片复制失败',
                  result?.ok ? 'success' : 'error',
                );
              }}
              onDownloadImage={async (project) => {
                const result = await studio.downloadProjectImage(project.id);
                if (!result?.canceled)
                  showToast(
                    result?.ok
                      ? '图片已下载，原始格式与元数据已保留'
                      : result?.error || '图片下载失败',
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
              onReveal={(project) => studio.revealFile(project.image_path)}
              onSelectionChange={(groupIds) => {
                setSelectedGroupIds(groupIds);
                lastSelectedGroupRef.current = groupIds.at(-1) || '';
              }}
              onSetCover={setGroupCover}
              onSelectAll={() => setSelectedGroupIds(visibleGroups.map((group) => group.id))}
              onSortChange={setSort}
              onToggleSelect={toggleGroupSelection}
              onTrash={moveToTrash}
              onViewChange={(view) => {
                writeActiveGalleryCollection(globalThis.localStorage, '');
                setActiveCollectionId('');
                setEditingSmartCollectionId('');
                setGalleryView(view);
                setGalleryFilters(DEFAULT_GALLERY_FILTERS);
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
          </PageSurface>
        </Activity>
        <Activity mode={page === 'settings' ? 'visible' : 'hidden'}>
          <div className="app-page-surface">
            <SettingsPage
              onFindTag={(tag) => {
                selectGalleryCollection('');
                setGalleryFilters({ ...DEFAULT_GALLERY_FILTERS, query: tag });
                setPage('gallery');
              }}
              onEmptyTrash={emptyTrash}
              onInstallUpdate={installDownloadedUpdate}
              onLibraryChange={() => Promise.all([reloadLibrary('all'), reloadLibrary('trash')])}
            />
          </div>
        </Activity>
      </div>
      {page !== 'gallery' && (
        <ImportExperience
          dragState={dragState}
          onCancel={() => importProgress?.batchId && studio.cancelImport(importProgress.batchId)}
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
