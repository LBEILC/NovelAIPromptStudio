import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ZipImport } from '../gallery/ZipImport';
import { useWin } from '../kit/layer';
import type { MenuEntry } from '../kit/menu';
import { useSwap } from '../kit/motion';
import { useNotifications } from '../kit/toast';
import { invokeResult } from '../lib/commands';
import { DEFAULT_GALLERY_FILTERS } from '../lib/galleryFilters.js';
import { useStudioReducedMotion } from '../lib/motion.js';
import { repairLegacyPromptTags } from '../lib/prompt.js';
import { normalizePromptStructure, syncProjectPromptMetadata } from '../lib/promptStructure.js';
import { activeWorkbenchTab } from '../lib/workbenchSession.js';
import type { DroppedFiles } from '../shared/ipc';
import type { DetachedRecord, GalleryFilters, ImageProject } from '../shared/types';
import { AFTER_RESTORE } from '../settings/Backup';
import { ONBOARDING_REPLAY, replayOnboarding } from '../shell/Onboarding';
import { newsSince } from './changelog';
import { openChangelog } from '../settings/About';
import { useAppearance } from '../state/appearance';
import { useLibraryState } from '../state/library';
import { useLibraryCacheProgress } from '../state/libraryCacheProgress';
import { onNetworkChange } from '../state/network';
import { useWorkbenchState } from '../state/workbench';
import { Confirmation, LegacyMenuItem, LocalImportProgress, studio } from './shared';

export function useAppState() {
  const { appearance } = useAppearance();
  const [menuDestination, setMenuDestination] = useState<{ section: string } | null>(null);
  useEffect(
    () =>
      studio.onCommandEvent?.((event) => {
        if (event.type !== 'navigate') return;
        const destination = event.destination;
        // macOS 的"帮助"菜单（1.8.2）：功能一览、查看引导、更新日志
        if (destination === 'onboarding') return replayOnboarding();
        if (destination === 'changelog') openChangelog();
        setMenuDestination({
          section:
            destination === 'help'
              ? 'help'
              : destination === 'about' || destination === 'changelog'
                ? 'updates'
                : 'appearance',
        });
        setPage('settings');
      }),
    [],
  );
  const [page, setPage] = useState(window.studioScreenshot?.page || 'workbench');
  // 恢复备份或撤回以后窗口会重新载入：回到"备份与恢复"这一页（settings/Backup.tsx）
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(AFTER_RESTORE)) return;
      sessionStorage.removeItem(AFTER_RESTORE);
    } catch {
      return;
    }
    setMenuDestination({ section: 'backup' });
    setPage('settings');
  }, []);
  // 完整引导（doc/design.md 2.36）：新安装第一次打开时显示；"帮助"页里可以重新查看。
  // 老用户更新以后弹新功能：上次看过之后每一版的重点，没有重点的版本不弹
  const [onboarding, setOnboarding] = useState(false);
  const [news, setNews] = useState<ReturnType<typeof newsSince> | null>(null);
  useEffect(() => {
    if (window.studioScreenshot) return;
    void invokeResult('onboarding.get', {}).then((r) => {
      if (!r.ok) return;
      if (r.show) return setOnboarding(true);
      if (!r.current) return;
      const n = newsSince(r.seen ?? null, r.current);
      if (n.pages.length) setNews(n);
    });
    const replay = () => setOnboarding(true);
    addEventListener(ONBOARDING_REPLAY, replay);
    return () => removeEventListener(ONBOARDING_REPLAY, replay);
  }, []);
  const finishOnboarding = useCallback(() => {
    setOnboarding(false);
    setNews(null);
    void invokeResult('onboarding.done', {});
  }, []);
  const [materialTarget, setMaterialTarget] = useState<{ kind: string; id?: string; n: number }>({
    kind: 'block',
    n: 0,
  });
  const notify = useNotifications();
  const notificationTarget = useRef({ page, notify });
  notificationTarget.current = { page, notify };
  // 网络设置切换的结果（doc/design.md 2.11）：保存后可能要等任务做完才切换，用户已经去了别的页，所以在这里通知
  useEffect(() => {
    let previous = '';
    return onNetworkChange((state) => {
      const was = previous;
      previous = state.phase;
      if (was !== 'applying' || state.phase === 'applying') return;
      const target = notificationTarget.current;
      if (state.phase === 'ready')
        target.notify({ text: '网络设置已生效', tone: 'success', source: 'background' });
      else if (state.phase === 'error')
        target.notify({
          text: '网络设置切换失败，仍在使用原来的设置',
          tone: 'error',
          source: 'background',
        });
      else if (state.phase === 'blocked')
        target.notify({
          text: '网络设置切换失败，已暂停联网',
          tone: 'error',
          action: {
            label: '查看',
            onClick: () => {
              setMenuDestination({ section: 'network' });
              setPage('settings');
            },
          },
        });
    });
  }, []);
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
  const [smartDraft, setSmartDraft] = useState<GalleryFilters>(DEFAULT_GALLERY_FILTERS);
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
  const [importProgress, setImportProgress] = useState<LocalImportProgress | null>(null);
  const [archiveImport, setArchiveImport] =
    useState<ComponentProps<typeof ZipImport>['importSession']>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    at: [number, number];
    items: MenuEntry[];
  } | null>(null);
  const openContextMenu = (event: MouseEvent, items: LegacyMenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      at: [event.clientX, event.clientY],
      items: items.map((item) =>
        item.type === 'divider'
          ? 'sep'
          : { label: item.label, disabled: item.disabled, onSelect: item.onClick },
      ),
    });
  };
  const appShellRef = useWin();
  const pageSwap = useSwap(page, (value) => value);
  const pageShown = (key: string) =>
    pageSwap.some((item) => item.key === key) ? 'visible' : 'hidden';
  const pageClass = (key: string) =>
    `app-page-surface ${pageSwap.some((item) => item.key === key && item.leaving) ? 'leaving' : ''}`;
  const dropHandlerRef = useRef<((files: DroppedFiles) => void) | null>(null);
  const annotationTimer = useRef<number | undefined>(undefined);
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const lastSelectedGroupRef = useRef('');
  const libraryRequestsRef = useRef({ all: 0, trash: 0 });
  const loadedLibraryViewsRef = useRef(new Set());
  // 回收站里"只从某个作品去掉"的记录（1.6.0）：和回收站的图一起刷新
  const [detachedRecords, setDetachedRecords] = useState<DetachedRecord[]>([]);
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

  const showToast = useCallback(
    (message: string, tone: string = 'success', source: 'user' | 'background' = 'user') => {
      notificationTarget.current.notify({
        text: message,
        tone: (tone === 'warning' ? 'info' : tone) as 'info' | 'error' | 'success',
        source,
      });
    },
    [],
  );

  const requestConfirmation = useCallback(
    (options: Confirmation) =>
      new Promise<boolean>((resolve) => {
        confirmationResolverRef.current = resolve;
        setConfirmation(options);
      }),
    [],
  );

  const resolveConfirmation = (confirmed: boolean) => {
    const resolve = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmation(null);
    resolve?.(confirmed);
  };

  const hydrateProject = useCallback(
    (project: ImageProject) =>
      syncProjectPromptMetadata({
        ...project,
        tags: repairLegacyPromptTags(project.tags, project.metadata?.prompt_raw),
        prompt_structure: normalizePromptStructure(project.prompt_structure, project.metadata),
      }),
    [],
  );
  return {
    libraryRequestsRef,
    setLibraryLoadingByView,
    setDetachedRecords,
    setProjectsByView,
    loadedLibraryViewsRef,
    showToast,
    hydrateProject,
    setGalleryCollections,
    setActiveCollectionId,
    galleryView,
    workbenchConnection,
    notificationTarget,
    setWorkbenchSession,
    setWorkbenchSessionReady,
    setWorkbenchLoading,
    setWorkbenchError,
    workbenchSessionReady,
    workbenchSession,
    setImportProgress,
    setArchiveImport,
    archiveImport,
    openContextMenu,
    setWorkbenchFocus,
    setPage,
    notify,
    setGalleryView,
    setEditingSmartCollectionId,
    setGalleryFilters,
    setSelectedGroupIds,
    setPreviewGroupId,
    setPreviewProjectId,
    importProgress,
    appShellRef,
    page,
    setDragState,
    dropHandlerRef,
    requestConfirmation,
    activeTab,
    galleryCollections,
    activeCollectionId,
    effectiveGalleryFilters,
    galleryGrouping,
    projects,
    sort,
    reduceMotion,
    projectsByView,
    editingSmartCollectionId,
    libraryLoading,
    previewGroupId,
    previewProjectId,
    detachedRecords,
    selectedGroupIds,
    annotationTimer,
    lastSelectedGroupRef,
    setGalleryGrouping,
    setSmartDraft,
    galleryFilters,
    setRenameCollectionId,
    smartDraft,
    pageShown,
    pageClass,
    setMaterialTarget,
    setMenuDestination,
    workbenchError,
    workbenchFocus,
    workbenchLoading,
    cacheProgress,
    dragState,
    renameCollectionId,
    setSort,
    materialTarget,
    menuDestination,
    onboarding,
    news,
    finishOnboarding,
    confirmation,
    resolveConfirmation,
    contextMenu,
    setContextMenu,
  };
}
