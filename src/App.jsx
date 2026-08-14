import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dropTargetForExternal, monitorForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { containsFiles, getFiles } from '@atlaskit/pragmatic-drag-and-drop/external/file';
import { preventUnhandled } from '@atlaskit/pragmatic-drag-and-drop/prevent-unhandled';
import { ActionIcon as LobeActionIcon, SideNav as LobeSideNav } from '@lobehub/ui';
import { Button as LobeButton, Modal as LobeModal, showContextMenu as showLobeContextMenu, toast as lobeToast } from '@lobehub/ui/base-ui';
import { Check, ClipboardPaste, Copy, FolderOpen, Pencil, Redo2, Scissors, Sparkles, Star, Tags, Trash2, Undo2 } from 'lucide-react';
import GalleryPage from './GalleryPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import WorkbenchPage from './WorkbenchPage.jsx';
import Icon from './components/Icon.jsx';
import { allPromptTags, getPromptScope, normalizePromptStructure, syncProjectPromptMetadata, updatePromptScope } from './lib/promptStructure.js';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, expandSearch, formatTag, normalizeSearch, repairLegacyPromptTags } from './lib/prompt.js';
import { DEFAULT_MONO_FONT, DEFAULT_SANS_FONT, fontStack } from './lib/fonts.js';
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
  filterAndSortGalleryGroups,
  galleryGroupMenuLabels,
  gallerySelectionProjectIds,
  groupGalleryProjects,
  reconcileGallerySelection,
} from './lib/gallery.js';

const unavailable = (error) => async () => ({ ok: false, error });
const studio = window.studio || {
  loadLibrary: async () => [],
  getLibraryStorage: async () => ({ ok: true, assetsDirectory: '', fileCount: 0, totalBytes: 0, isDefault: true }),
  changeLibraryStorage: unavailable('请在桌面应用中更改资源库位置'),
  revealLibraryStorage: unavailable('请在桌面应用中打开资源库文件夹'),
  onLibraryStorageProgress: () => {},
  offLibraryStorageProgress: () => {},
  openWorkbenchImage: unavailable('请在桌面应用中打开图片'),
  openDroppedWorkbenchImages: unavailable('请在桌面应用中打开图片'),
  openClipboardWorkbenchImage: unavailable('请在桌面应用中读取剪贴板'),
  syncWorkbenchTemporaryImages: async () => ({ ok: true }),
  revealEmbeddedVibe: unavailable('请在桌面应用中导出 Vibe'),
  importImages: async () => ({ ok: true, canceled: true, imported: [], duplicates: [], errors: [], summary: null }),
  importClipboardImage: unavailable('请在桌面应用中读取剪贴板'),
  importDroppedFiles: unavailable('请在桌面应用中导入'),
  cancelImport: unavailable('没有进行中的导入'),
  onImportProgress: () => {},
  offImportProgress: () => {},
  updateProjectName: unavailable('请在桌面应用中修改名称'),
  setProjectsFavorite: unavailable('请在桌面应用中管理收藏'),
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
  getAISettings: async () => ({ baseUrl: 'https://api.openai.com/v1', model: '', hasApiKey: false, encryptionAvailable: true }),
  saveAISettings: async (settings) => settings,
  getAppearanceSettings: async () => ({ themeMode: 'dark', primaryColor: 'blue', sansFont: DEFAULT_SANS_FONT, monoFont: DEFAULT_MONO_FONT, motion: 'full' }),
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

const TAG_CONTEXT_CATEGORIES = CATEGORY_OPTIONS.map((category) => [category, CATEGORY_LABELS[category]]);

function openContextMenu(event, items) {
  event.preventDefault();
  event.stopPropagation();
  showLobeContextMenu(items, { iconSpaceMode: 'global' });
}

function dispatchInput(editable, inputType, data = null) {
  const event = typeof InputEvent === 'function'
    ? new InputEvent('input', { bubbles: true, data, inputType })
    : new Event('input', { bubbles: true });
  editable.dispatchEvent(event);
}

function captureTextSelection(editable) {
  const start = typeof editable.selectionStart === 'number' ? editable.selectionStart : null;
  const end = typeof editable.selectionEnd === 'number' ? editable.selectionEnd : null;
  return { editable, start, end, hasSelection: start == null || end == null ? true : start !== end };
}

async function runTextEditAction(selection, action) {
  const { editable, start, end } = selection;
  editable.focus({ preventScroll: true });
  if (start != null && end != null && typeof editable.setSelectionRange === 'function') editable.setSelectionRange(start, end);
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
  const command = { undo: 'undo', redo: 'redo', cut: 'cut', copy: 'copy', paste: 'paste', 'select-all': 'selectAll' }[action];
  if (command) document.execCommand(command);
}

function SideNav({ page, onNavigate }) {
  const items = [{ key: 'workbench', icon: 'edit', label: '工作台' }, { key: 'gallery', icon: 'library', label: '图片库' }];
  return <LobeSideNav
    className="studio-side-nav"
    avatar={<button aria-label="NovelAI Prompt Studio · 返回工作台" className="studio-brand" onClick={() => onNavigate('workbench')} title="NovelAI Prompt Studio"><img alt="" className="studio-brand-logo-dark" src="./app-icon.svg"/><img alt="" className="studio-brand-logo-light" src="./app-icon-light.svg"/></button>}
    bottomActions={<LobeActionIcon active={page === 'settings'} icon={<Icon name="settings" size={19}/>} onClick={() => onNavigate('settings')} placement="right" size="large" title="设置" variant="borderless"/>}
    topActions={<>{items.map((item) => <LobeActionIcon active={page === item.key} icon={<Icon name={item.icon} size={19}/>} key={item.key} onClick={() => onNavigate(item.key)} placement="right" size="large" title={item.label} variant="borderless"/>)}</>}
  />;
}

function ImportExperience({ dragState, progress, result, target, onCancel, onDismiss }) {
  const importing = isImportActive(progress);
  const percent = progress?.total ? Math.min(100, Math.round((progress.processed || 0) / progress.total * 100)) : 0;
  const workbench = target === 'workbench';
  return <>
    {dragState.active && <div className={`file-drop-overlay ${dragState.valid ? 'accept' : 'reject'}`}><div className="file-drop-target"><Icon name={dragState.valid ? 'upload' : 'close'} size={30}/><strong>{dragState.valid ? (workbench ? '松开以打开为工作台标签' : '松开以保存到图片库') : '这些文件暂不支持'}</strong><span>{workbench ? 'PNG / JPG / WEBP，每张图片创建一个标签' : 'PNG / JPG / WEBP / ZIP，可批量导入'}</span></div></div>}
    {importing && <div className="import-status"><div><strong>{progress.phase === 'preparing' ? '正在检查文件' : '正在导入图片'}</strong><span>{progress.current || '准备中'} · {percent}%</span></div><progress max="100" value={percent}/><LobeButton onClick={onCancel} size="small">取消</LobeButton></div>}
    {result && <div className="import-result"><Icon name={result.errors?.length ? 'warning' : 'check'} size={17}/><span>导入 {result.imported?.length || 0} 张 · 跳过重复 {result.duplicates?.length || 0} 张{result.errors?.length ? ` · 失败 ${result.errors.length} 张` : ''}</span><LobeButton onClick={onDismiss} size="small" type="text">关闭</LobeButton></div>}
  </>;
}

function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(0.1, bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App({ appearance, setAppearance }) {
  const [page, setPage] = useState('workbench');
  const [projects, setProjects] = useState([]);
  const [galleryView, setGalleryView] = useState('all');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [previewGroupId, setPreviewGroupId] = useState('');
  const [previewProjectId, setPreviewProjectId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [workbenchSession, setWorkbenchSession] = useState({ version: 2, tabs: [], activeTabId: '' });
  const [workbenchSessionReady, setWorkbenchSessionReady] = useState(false);
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbenchError, setWorkbenchError] = useState('');
  const [workbenchFocus, setWorkbenchFocus] = useState({ scopeKey: 'base:prompt', tagId: null });
  const [dragState, setDragState] = useState({ active: false, valid: false });
  const [importProgress, setImportProgress] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const appShellRef = useRef(null);
  const dropHandlerRef = useRef(null);
  const annotationTimer = useRef(null);
  const confirmationResolverRef = useRef(null);
  const lastSelectedGroupRef = useRef('');
  const activeTab = activeWorkbenchTab(workbenchSession);

  const showToast = useCallback((message, type = 'success') => {
    const method = lobeToast[type] || lobeToast.success;
    method({ description: message, duration: 2600, placement: 'bottom' });
  }, []);

  const requestConfirmation = useCallback((options) => new Promise((resolve) => {
    confirmationResolverRef.current = resolve;
    setConfirmation(options);
  }), []);

  const resolveConfirmation = (confirmed) => {
    const resolve = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmation(null);
    resolve?.(confirmed);
  };

  const hydrateProject = useCallback((project) => syncProjectPromptMetadata({
    ...project,
    tags: repairLegacyPromptTags(project.tags, project.metadata?.prompt_raw),
    prompt_structure: normalizePromptStructure(project.prompt_structure, project.metadata),
  }), []);

  const reloadLibrary = useCallback(async (view = galleryView) => {
    const items = await studio.loadLibrary(view);
    setProjects((items || []).map(hydrateProject));
  }, [galleryView, hydrateProject]);

  useEffect(() => {
    reloadLibrary(galleryView).finally(() => setLoading(false));
  }, [galleryView, reloadLibrary]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const saved = parseWorkbenchSession(
        window.localStorage.getItem(WORKBENCH_SESSION_KEY)
        || window.localStorage.getItem(LEGACY_WORKBENCH_SESSION_KEY),
      );
      if (!saved?.tabs?.length) {
        setWorkbenchSessionReady(true);
        return;
      }
      setWorkbenchLoading(true);
      const tabs = await Promise.all(saved.tabs.map(async (stored) => {
        const result = await studio.openWorkbenchImage(stored.source.path, stored.source);
        if (!result?.ok || !result.project) {
          return {
            id: stored.id,
            identity: `${stored.source.type}:${stored.source.projectId || stored.source.path || stored.source.temporaryId}`,
            displayName: stored.displayName || '不可用图片',
            source: stored.source,
            originalProject: null,
            project: null,
            savedDraft: stored.draft,
            viewState: normalizeWorkbenchViewState(stored.viewState),
            updatedAt: stored.updatedAt,
            error: result?.error || '图片源已不可用',
          };
        }
        return createWorkbenchTab(hydrateProject(result.project), { ...stored, draft: stored.draft, source: stored.source });
      }));
      if (!active) return;
      setWorkbenchSession({
        version: 2,
        tabs,
        activeTabId: tabs.some((tab) => tab.id === saved.activeTabId) ? saved.activeTabId : tabs[0]?.id || '',
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
    return () => { active = false; };
  }, [hydrateProject]);

  useEffect(() => {
    if (!workbenchSessionReady) return;
    if (workbenchSession.tabs.length) window.localStorage.setItem(WORKBENCH_SESSION_KEY, serializeWorkbenchSession(workbenchSession));
    else window.localStorage.removeItem(WORKBENCH_SESSION_KEY);
    const temporaryPaths = workbenchSession.tabs
      .filter((tab) => tab.source?.type === 'clipboard' && tab.source.path)
      .map((tab) => tab.source.path);
    studio.syncWorkbenchTemporaryImages(temporaryPaths);
  }, [workbenchSession, workbenchSessionReady]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-ui', fontStack(appearance.sansFont, 'sans'));
    document.documentElement.style.setProperty('--font-mono', fontStack(appearance.monoFont, 'mono'));
    document.documentElement.dataset.motion = appearance.motion;
  }, [appearance]);

  useEffect(() => {
    studio.onImportProgress((progress) => setImportProgress(isImportActive(progress) ? progress : null));
    return () => studio.offImportProgress();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const settings = await studio.getProductivitySettings().catch(() => null);
      if (!settings?.autoCheckUpdates) return;
      const result = await studio.checkForUpdates().catch(() => null);
      if (result?.ok && result.hasUpdate) showToast(`发现新版本 v${result.latestVersion}，可在“关于与更新”中查看`);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  useEffect(() => {
    const handler = (event) => {
      if (event.defaultPrevented || !isTextEditingTarget(event.target)) return;
      const editable = event.target.closest('textarea, input, [contenteditable="true"]');
      const selection = captureTextSelection(editable);
      const invoke = (action) => runTextEditAction(selection, action).catch(() => showToast('文本操作没有完成', 'error'));
      openContextMenu(event, [
        { key: 'undo', label: '撤销', icon: Undo2, onClick: () => invoke('undo') },
        { key: 'redo', label: '重做', icon: Redo2, onClick: () => invoke('redo') },
        { key: 'edit-divider', type: 'divider' },
        { key: 'cut', label: '剪切', icon: Scissors, disabled: !selection.hasSelection, onClick: () => invoke('cut') },
        { key: 'copy', label: '复制', icon: Copy, disabled: !selection.hasSelection, onClick: () => invoke('copy') },
        { key: 'paste', label: '粘贴', icon: ClipboardPaste, onClick: () => invoke('paste') },
        { key: 'selection-divider', type: 'divider' },
        { key: 'select-all', label: '全选', onClick: () => invoke('select-all') },
      ]);
    };
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, [showToast]);

  const acceptWorkbenchProject = useCallback((project, source) => {
    const hydrated = hydrateProject(project);
    setWorkbenchSession((current) => addWorkbenchTab(current, hydrated, {
      source: source || { type: 'file', path: hydrated.image_path },
      displayName: hydrated.name,
    }));
    setWorkbenchFocus({ scopeKey: 'base:prompt', tagId: null });
    setWorkbenchError('');
    setPage('workbench');
  }, [hydrateProject]);

  const openWorkbenchPath = useCallback(async (filePath = '', source = null) => {
    setWorkbenchLoading(true);
    setWorkbenchError('');
    try {
      const result = await studio.openWorkbenchImage(filePath, source);
      if (result?.canceled) return false;
      if (!result?.ok || !result.project) throw new Error(result?.error || '图片没有打开');
      acceptWorkbenchProject(result.project, source || result.source);
      showToast('图片已在新工作台标签中打开');
      return true;
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setWorkbenchLoading(false);
    }
  }, [acceptWorkbenchProject, showToast]);

  const openClipboardWorkbenchImage = useCallback(async () => {
    setWorkbenchLoading(true);
    setWorkbenchError('');
    try {
      const result = await studio.openClipboardWorkbenchImage();
      if (!result?.ok || !result.project) throw new Error(result?.error || '剪贴板图片没有打开');
      acceptWorkbenchProject(result.project, result.source);
      showToast(result.metadataMissing
        ? '已读取剪贴板图片，但只包含像素，未检测到 NovelAI Prompt 元数据'
        : '剪贴板图片已在工作台中打开', result.metadataMissing ? 'warning' : 'success');
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkbenchLoading(false);
    }
  }, [acceptWorkbenchProject, showToast]);

  const openDroppedWorkbenchImages = useCallback(async (files) => {
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
      if (failures.length) setWorkbenchError(`${failures.length} 张图片没有打开：${failures[0].error}`);
      if (result.items?.some((item) => item.ok)) showToast(`已打开 ${result.items.filter((item) => item.ok).length} 个工作台标签`);
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkbenchLoading(false);
    }
  }, [acceptWorkbenchProject, showToast]);

  const importImages = useCallback(async (files = null, fromClipboard = false) => {
    if (files && !assessDroppedFiles(files).valid) {
      showToast('图片库只支持图片或 ZIP', 'warning');
      return;
    }
    setPage('gallery');
    setImportResult(null);
    setImportProgress({ phase: 'preparing', processed: 0, total: 0, current: '准备中' });
    try {
      const result = fromClipboard
        ? await studio.importClipboardImage()
        : files ? await studio.importDroppedFiles(files) : await studio.importImages();
      if (result?.canceled) return;
      setImportResult(result);
      if (!result?.ok && result?.error) showToast(result.error, 'error');
      await reloadLibrary(galleryView);
      if (result?.imported?.length) {
        const id = result.imported.at(-1).id;
        setPreviewProjectId(id);
      }
      if (result?.metadataMissing) showToast('已读取剪贴板图片，但只包含像素，未检测到 NovelAI Prompt 元数据', 'warning');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setImportProgress(null);
    }
  }, [galleryView, reloadLibrary, showToast]);

  useEffect(() => {
    if (!appShellRef.current || !['workbench', 'gallery'].includes(page)) return undefined;
    const cleanupMonitor = monitorForExternal({ canMonitor: containsFiles, onDragStart: () => preventUnhandled.start(), onDrop: () => setDragState((current) => ({ ...current, active: false })) });
    const cleanupTarget = dropTargetForExternal({
      element: appShellRef.current,
      canDrop: containsFiles,
      onDragEnter: ({ source }) => setDragState({ active: true, ...(page === 'workbench' ? assessWorkbenchDroppedFiles(getFiles({ source })) : assessDroppedFiles(getFiles({ source }))) }),
      onDrag: ({ source }) => setDragState({ active: true, ...(page === 'workbench' ? assessWorkbenchDroppedFiles(getFiles({ source })) : assessDroppedFiles(getFiles({ source }))) }),
      onDragLeave: () => setDragState((current) => ({ ...current, active: false })),
      onDrop: ({ source }) => {
        const files = getFiles({ source });
        setDragState((current) => ({ ...current, active: false }));
        if (files.length) dropHandlerRef.current?.(files);
      },
    });
    return () => { cleanupTarget(); cleanupMonitor(); };
  }, [page]);

  dropHandlerRef.current = page === 'workbench' ? openDroppedWorkbenchImages : importImages;

  const closeTab = useCallback(async (tabId) => {
    const tab = workbenchSession.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (workbenchTabHasChanges(tab) && !(await requestConfirmation({
      title: '关闭已修改的标签？',
      message: `“${tab.displayName}”的 Prompt 已相对原图修改。`,
      detail: '关闭后会丢弃这个标签的草稿，其他标签不受影响。',
      okText: '丢弃并关闭',
      danger: true,
    }))) return;
    setWorkbenchSession((current) => closeWorkbenchTab(current, tabId));
  }, [requestConfirmation, workbenchSession.tabs]);

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
      if (key === 'v' && !isTextEditingTarget(event.target) && ['workbench', 'gallery'].includes(page)) {
        event.preventDefault();
        if (page === 'workbench') openClipboardWorkbenchImage();
        else importImages(null, true);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [activeTab, closeTab, importImages, openClipboardWorkbenchImage, openWorkbenchPath, page, workbenchSession.tabs.length]);

  const galleryGroups = useMemo(() => groupGalleryProjects(projects), [projects]);
  const visibleGroups = useMemo(() => filterAndSortGalleryGroups(galleryGroups, query, sort), [galleryGroups, query, sort]);
  const previewGroup = galleryGroups.find((group) => group.id === previewGroupId)
    || galleryGroups.find((group) => group.members.some((project) => project.id === previewProjectId))
    || null;
  const preview = previewGroup?.members.find((project) => project.id === previewProjectId) || previewGroup?.cover || null;
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
    } else if (previewGroup && !previewGroupId) {
      setPreviewGroupId(previewGroup.id);
    }
  }, [previewGroup, previewGroupId, previewProjectId]);

  const scheduleAnnotations = (project) => {
    window.clearTimeout(annotationTimer.current);
    const entries = allPromptTags(project).filter((tag) => tag.translation_source === 'manual' || tag.category_source === 'manual');
    if (!entries.length) return;
    annotationTimer.current = window.setTimeout(async () => {
      const result = await studio.saveTagAnnotations(entries);
      if (!result?.ok) showToast(result?.error || 'Tag 翻译与分类没有保存', 'error');
    }, 500);
  };

  const updateWorkbenchProject = (nextProject) => {
    if (!activeTab) return;
    const updated = { ...syncProjectPromptMetadata(nextProject), updated_at: new Date().toISOString() };
    setWorkbenchSession((current) => updateWorkbenchTab(current, activeTab.id, (tab) => ({ ...tab, project: updated, updatedAt: updated.updated_at })));
    scheduleAnnotations(updated);
  };

  const translateWorkbenchTags = async (entries) => {
    if (!activeTab?.project) return;
    const tabId = activeTab.id;
    const result = await studio.translateTags(entries.map((entry) => entry.tag.tag));
    if (!result?.ok) {
      showToast(result?.error || 'AI 翻译没有完成', 'error');
      return;
    }
    setWorkbenchSession((current) => updateWorkbenchTab(current, tabId, (tab) => {
      if (!tab.project) return tab;
      let nextProject = tab.project;
      entries.forEach((entry, index) => {
        const scope = getPromptScope(nextProject, entry.scopeKey);
        const item = result.items?.[index] || {};
        nextProject = updatePromptScope(nextProject, scope.key, scope.tags.map((tag) => tag.id === entry.tag.id ? { ...tag, ...item, translation_source: item.translation_source || 'ai', category_source: item.category_source || 'ai' } : tag));
      });
      const updated = { ...syncProjectPromptMetadata(nextProject), updated_at: new Date().toISOString() };
      scheduleAnnotations(updated);
      return { ...tab, project: updated, updatedAt: updated.updated_at };
    }));
    showToast(result.ai_count ? `已翻译并分类 ${entries.length} 个 Tag` : '已复用本地翻译与分类');
  };

  const tagContextMenu = (event, scopeKey, tag) => {
    if (!activeTab?.project) return;
    const project = activeTab.project;
    const scope = getPromptScope(project, scopeKey);
    const setCategory = (category) => updateWorkbenchProject(updatePromptScope(project, scope.key, scope.tags.map((item) => item.id === tag.id ? { ...item, category, category_source: 'manual' } : item)));
    openContextMenu(event, [
      { key: 'copy-tag', label: '复制 Tag', icon: Copy, onClick: async () => { await navigator.clipboard.writeText(tag.tag); showToast('Tag 已复制'); } },
      { key: 'copy-weighted-tag', label: '复制 Tag（含权重）', icon: Copy, onClick: async () => { await navigator.clipboard.writeText(formatTag(tag)); showToast('Tag 已复制（含权重）'); } },
      { key: 'copy-translation', label: '复制翻译', icon: Copy, disabled: !tag.translation?.trim(), onClick: async () => { await navigator.clipboard.writeText(tag.translation || ''); showToast('翻译已复制'); } },
      { key: 'edit-tag', label: '编辑', icon: Pencil, onClick: () => { setWorkbenchFocus({ scopeKey, tagId: null }); requestAnimationFrame(() => setWorkbenchFocus({ scopeKey, tagId: tag.id })); } },
      { key: 'translate-tag', label: 'AI 翻译与分类', icon: Sparkles, onClick: () => translateWorkbenchTags([{ scopeKey, tag }]) },
      {
        key: 'set-category',
        label: '设置分类',
        icon: Tags,
        type: 'submenu',
        openOnHover: true,
        children: TAG_CONTEXT_CATEGORIES.map(([category, label]) => ({
          key: `category-${category}`,
          label,
          icon: (tag.category || 'Unsorted') === category ? Check : undefined,
          onClick: () => setCategory(category),
        })),
      },
      { key: 'tag-divider', type: 'divider' },
      { key: 'delete-tag', label: '删除 Tag', icon: Trash2, danger: true, onClick: () => updateWorkbenchProject(updatePromptScope(project, scope.key, scope.tags.filter((item) => item.id !== tag.id))) },
    ]);
  };

  const summarizeBatch = (result, action, groupCount = 0) => {
    if (!result?.ok) {
      showToast(result?.error || `${action}没有完成`, 'error');
      return false;
    }
    const summary = result.summary || {};
    const imageCount = (summary.success || 0) + (summary.skipped || 0) + (summary.failed || 0);
    const scope = groupCount ? `${groupCount} 组、${imageCount} 张图片；` : '';
    showToast(`${action}：${scope}成功 ${summary.success || 0}，跳过 ${summary.skipped || 0}，失败 ${summary.failed || 0}`, summary.failed ? 'warning' : 'success');
    return true;
  };

  const reloadAfterGalleryAction = async () => {
    await reloadLibrary(galleryView);
    setSelectedGroupIds([]);
  };

  const setFavorite = async (isFavorite, explicitIds = null, scope = 'selection') => {
    const ids = explicitIds || selectedProjectIds;
    if (!ids.length) return;
    const result = await studio.setProjectsFavorite(ids, isFavorite);
    const groupCount = scope === 'group' ? 1 : explicitIds ? 0 : selectedGroupIds.length;
    if (summarizeBatch(result, isFavorite ? '收藏' : '取消收藏', groupCount)) await reloadAfterGalleryAction();
  };

  const tabImpact = (ids) => {
    const selected = new Set(ids);
    const tabs = workbenchSession.tabs.filter((tab) => tab.source?.type === 'library' && selected.has(tab.source.projectId));
    return { open: tabs.length, dirty: tabs.filter(workbenchTabHasChanges).length };
  };

  const moveToTrash = async (explicitIds = null, scope = 'selection') => {
    const ids = explicitIds || selectedProjectIds;
    if (!ids.length) return;
    const selectedGroups = scope === 'group' ? 1 : selectedGroupIds.length;
    const favoriteCount = projects.filter((project) => ids.includes(project.id) && project.is_favorite).length;
    const impact = tabImpact(ids);
    const isDetail = scope === 'detail';
    if (!(await requestConfirmation({
      title: isDetail ? '删除当前图片？' : '删除整个图片组？',
      message: isDetail ? '将当前图片移入回收站。' : `将 ${selectedGroups} 组共 ${ids.length} 张图片移入回收站。`,
      detail: `${favoriteCount ? `包含 ${favoriteCount} 张收藏图片。` : ''}${impact.open ? ` ${impact.open} 张仍在工作台打开，标签会继续可用。` : ''}`,
      okText: '移入回收站',
      danger: true,
    }))) return;
    const next = previewGroup && preview && ids.includes(preview.id)
      ? adjacentGallerySelection(galleryGroups, previewGroup.id, preview.id)
      : null;
    const result = await studio.moveProjectsToTrash(ids);
    if (!summarizeBatch(result, '移入回收站', isDetail ? 0 : selectedGroups)) return;
    if (next) {
      setPreviewGroupId(next.groupId);
      setPreviewProjectId(next.projectId);
    }
    await reloadAfterGalleryAction();
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
      tabs: current.tabs.filter((tab) => !(tab.source?.type === 'library' && deleted.has(tab.source.projectId))),
      activeTabId: current.tabs.some((tab) => tab.id === current.activeTabId && !(tab.source?.type === 'library' && deleted.has(tab.source.projectId)))
        ? current.activeTabId
        : current.tabs.find((tab) => !(tab.source?.type === 'library' && deleted.has(tab.source.projectId)))?.id || '',
    }));
  };

  const permanentDelete = async (explicitIds = null, knownBytes = null, scope = 'selection') => {
    const ids = explicitIds || selectedProjectIds;
    if (!ids.length) return;
    const impact = tabImpact(ids);
    if (!(await requestConfirmation({
      title: ids.length > 1 ? '永久删除这些图片？' : '永久删除当前图片？',
      message: `将永久删除 ${ids.length} 张图片${knownBytes == null ? '' : `，预计释放 ${formatBytes(knownBytes)}`}。`,
      detail: `${impact.open ? `${impact.open} 张仍在工作台打开。` : ''}${impact.dirty ? `其中 ${impact.dirty} 个标签包含工作区草稿，继续会丢弃。` : ''} 此操作不可撤销。`,
      okText: '永久删除',
      danger: true,
      primaryDanger: true,
    }))) return;
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
    await permanentDelete(summary.projects.map((project) => project.id), summary.totalBytes);
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
          return [...new Set([...current, ...visibleGroups.slice(start, end + 1).map((item) => item.id)])];
        }
      }
      if (current.includes(group.id)) return current.filter((id) => id !== group.id);
      return [...current, group.id];
    });
    lastSelectedGroupRef.current = group.id;
  };

  const previewGalleryGroup = (group) => {
    setPreviewGroupId(group.id);
    setPreviewProjectId(group.cover.id);
  };

  const navigatePreview = useCallback((direction) => {
    if (!previewGroup?.members.length || !preview) return;
    const index = previewGroup.members.findIndex((project) => project.id === preview.id);
    const next = (index + direction + previewGroup.members.length) % previewGroup.members.length;
    setPreviewProjectId(previewGroup.members[next].id);
  }, [preview, previewGroup]);

  const galleryContextMenu = (event, group, onRenameRequest) => {
    const project = group.cover;
    const ids = group.members.map((item) => item.id);
    const labels = galleryGroupMenuLabels(group);
    openContextMenu(event, [
      ...(galleryView === 'trash' ? [
        { key: 'restore-group', label: group.count > 1 ? '恢复整个图片组' : '恢复图片', onClick: () => restoreProjects(ids, 'group') },
        { key: 'permanent-group', label: group.count > 1 ? '永久删除整个图片组' : '永久删除图片', icon: Trash2, danger: true, onClick: () => permanentDelete(ids, null, 'group') },
      ] : [
        { key: 'open-workbench', label: '在工作台中打开', icon: Pencil, onClick: () => openWorkbenchPath(project.image_path, { type: 'library', projectId: project.id, path: project.image_path }) },
        { key: 'favorite-group', label: labels.favorite, icon: Star, onClick: () => setFavorite(!group.members.every((item) => item.is_favorite), ids, 'group') },
        { key: 'rename-project', label: labels.rename, icon: Pencil, onClick: onRenameRequest },
        { key: 'reveal-project', label: '在文件夹中显示', icon: FolderOpen, onClick: () => studio.revealFile(project.image_path) },
        { key: 'project-divider', type: 'divider' },
        { key: 'delete-project', label: group.count > 1 ? '删除整个图片组' : '删除图片', icon: Trash2, danger: true, onClick: () => moveToTrash(ids, 'group') },
      ]),
    ]);
  };

  const galleryWorkspaceContextMenu = (event) => {
    openContextMenu(event, [
      { key: 'import-clipboard', label: '从剪贴板导入', icon: ClipboardPaste, onClick: () => importImages(null, true) },
    ]);
  };

  const resetWorkbench = async () => {
    if (!activeTab?.project) return;
    if (workbenchTabHasChanges(activeTab) && !(await requestConfirmation({
      title: '恢复图片中的 Prompt？',
      message: '当前标签中的修改将被清除。',
      detail: '图片文件本身不会被修改，其他标签不受影响。',
      okText: '恢复',
      danger: true,
    }))) return;
    setWorkbenchSession((current) => updateWorkbenchTab(current, activeTab.id, (tab) => ({
      ...tab,
      project: structuredClone(tab.originalProject),
      updatedAt: new Date().toISOString(),
    })));
    showToast('已恢复图片中的原始 Prompt');
  };

  const changeAppearance = async (patch) => {
    const saved = await studio.saveAppearanceSettings({ ...appearance, ...patch });
    setAppearance(saved);
  };

  const installDownloadedUpdate = async () => {
    try {
      const serialized = serializeWorkbenchSession(workbenchSession);
      if (serialized) {
        window.localStorage.setItem(WORKBENCH_SESSION_KEY, serialized);
        if (window.localStorage.getItem(WORKBENCH_SESSION_KEY) !== serialized) throw new Error('工作台会话校验失败');
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

  return <div className="app-shell" ref={appShellRef}>
    <SideNav onNavigate={setPage} page={page}/>
    <div className="app-content">
      {loading ? <div className="app-loading"><Icon name="refresh" size={24}/><span>正在读取图片库…</span></div> : page === 'workbench' ? <WorkbenchPage
        error={workbenchError}
        focusScopeKey={workbenchFocus.scopeKey}
        focusTagId={workbenchFocus.tagId}
        loading={workbenchLoading}
        onActivateTab={(id) => setWorkbenchSession((current) => ({ ...current, activeTabId: id }))}
        onChooseImage={() => openWorkbenchPath()}
        onClipboardImage={openClipboardWorkbenchImage}
        onCloseTab={closeTab}
        onCopyImage={async (project) => {
          const result = await studio.copyWorkbenchImage(project.image_path);
          showToast(result?.ok ? '图片已复制到系统剪贴板' : result?.error || '图片复制失败', result?.ok ? 'success' : 'error');
        }}
        onCopyText={async (text, count, selected, ignored = 0, label = '') => {
          if (!text) return;
          await navigator.clipboard.writeText(text);
          if (selected && ignored) showToast(`已复制 ${count} 个 Prompt Tag，忽略 ${ignored} 个排除 Tag`);
          else showToast(`已复制 ${count} 个${label ? ` ${label}` : selected ? '已选 Prompt Tag' : '可见 Prompt Tag'}`);
        }}
        onDownloadImage={async (project) => {
          const result = await studio.downloadWorkbenchImage(project.image_path, project.name);
          if (!result?.canceled) showToast(result?.ok ? '图片已下载，原始格式与元数据已保留' : result?.error || '图片下载失败', result?.ok ? 'success' : 'error');
        }}
        onNotify={showToast}
        onReset={resetWorkbench}
        onReorderTab={(tabId, targetTabId) => setWorkbenchSession((current) => reorderWorkbenchTabs(current, tabId, targetTabId))}
        onRevealVibe={async (vibe) => {
          const result = await studio.revealEmbeddedVibe(vibe);
          showToast(result?.ok ? '已在文件夹中显示 Vibe 文件' : result?.error || 'Vibe 文件没有生成', result?.ok ? 'success' : 'error');
        }}
        onTagContextMenu={tagContextMenu}
        onTranslateTags={translateWorkbenchTags}
        onUpdateProject={updateWorkbenchProject}
        onUpdateViewState={(tabId, viewState) => setWorkbenchSession((current) => updateWorkbenchTab(current, tabId, (tab) => ({
          ...tab,
          viewState: normalizeWorkbenchViewState(viewState),
        })))}
        session={workbenchSession}
      /> : page === 'gallery' ? <GalleryPage
        groups={visibleGroups}
        importing={isImportActive(importProgress)}
        onClearSelection={() => setSelectedGroupIds([])}
        onCopyImage={async (project) => {
          const result = await studio.copyProjectImage(project.id);
          showToast(result?.ok ? '图片已复制到系统剪贴板' : result?.error || '图片复制失败', result?.ok ? 'success' : 'error');
        }}
        onDownloadImage={async (project) => {
          const result = await studio.downloadProjectImage(project.id);
          if (!result?.canceled) showToast(result?.ok ? '图片已下载，原始格式与元数据已保留' : result?.error || '图片下载失败', result?.ok ? 'success' : 'error');
        }}
        onEmptyTrash={emptyTrash}
        onFavorite={setFavorite}
        onImport={() => importImages()}
        onImportClipboard={() => importImages(null, true)}
        onNavigatePreview={navigatePreview}
        onOpenWorkbench={(project) => openWorkbenchPath(project.image_path, { type: 'library', projectId: project.id, path: project.image_path })}
        onPermanentDelete={permanentDelete}
        onPreview={previewGalleryGroup}
        onProjectContextMenu={galleryContextMenu}
        onWorkspaceContextMenu={galleryWorkspaceContextMenu}
        onQueryChange={setQuery}
        onRename={renameProject}
        onRestore={restoreProjects}
        onReveal={(project) => studio.revealFile(project.image_path)}
        onSetCover={setGroupCover}
        onSelectAll={() => setSelectedGroupIds(visibleGroups.map((group) => group.id))}
        onSortChange={setSort}
        onToggleSelect={toggleGroupSelection}
        onTrash={moveToTrash}
        onViewChange={(view) => { setGalleryView(view); setQuery(''); setSelectedGroupIds([]); setPreviewGroupId(''); setPreviewProjectId(''); }}
        preview={preview}
        previewGroup={previewGroup}
        query={query}
        selectedGroupIds={selectedGroupIds}
        selectedImageCount={selectedProjectIds.length}
        sort={sort}
        view={galleryView}
      /> : <SettingsPage appearance={appearance} onAppearanceChange={changeAppearance} onConfirm={requestConfirmation} onInstallUpdate={installDownloadedUpdate} onLibraryChange={() => reloadLibrary(galleryView)} showToast={showToast} studio={studio}/>}
    </div>
    <ImportExperience dragState={dragState} onCancel={() => importProgress?.batchId && studio.cancelImport(importProgress.batchId)} onDismiss={() => setImportResult(null)} progress={importProgress} result={importResult} target={page}/>
    <LobeModal
      cancelText="取消"
      destroyOnHidden
      okButtonProps={{ danger: Boolean(confirmation?.danger), type: confirmation?.primaryDanger ? 'primary' : 'default' }}
      okText={confirmation?.okText || '确定'}
      onCancel={() => resolveConfirmation(false)}
      onOk={() => resolveConfirmation(true)}
      open={Boolean(confirmation)}
      title={confirmation?.title}
      width={440}
    >
      <div className="confirmation-copy">
        <p>{confirmation?.message}</p>
        {confirmation?.detail && <span>{confirmation.detail}</span>}
      </div>
    </LobeModal>
  </div>;
}
