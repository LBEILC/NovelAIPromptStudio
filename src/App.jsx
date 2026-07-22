import { useEffect, useMemo, useRef, useState } from 'react';
import { dropTargetForExternal, monitorForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { containsFiles, getFiles } from '@atlaskit/pragmatic-drag-and-drop/external/file';
import { preventUnhandled } from '@atlaskit/pragmatic-drag-and-drop/prevent-unhandled';
import LobeActionIcon from '@lobehub/ui/es/ActionIcon/index';
import LobeButton from '@lobehub/ui/es/Button/index';
import LobeSideNav from '@lobehub/ui/es/SideNav/index';
import { toast as lobeToast } from '@lobehub/ui/es/Toast/index';
import GalleryPage from './GalleryPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import WorkbenchPage from './WorkbenchPage.jsx';
import Icon from './components/Icon.jsx';
import { allPromptTags, formatPositivePromptForCopy, getPromptScope, normalizePromptStructure, syncProjectPromptMetadata, updatePromptScope } from './lib/promptStructure.js';
import { expandSearch, normalizeSearch, repairLegacyPromptTags } from './lib/prompt.js';
import { assessDroppedFiles, assessWorkbenchDroppedFiles } from './lib/importDrop.js';
import { contextMenuPosition, isTextEditingTarget } from './lib/contextMenu.js';
import { createWorkbenchSession, parseWorkbenchSession, serializeWorkbenchSession, WORKBENCH_SESSION_KEY, workbenchHasChanges } from './lib/workbenchSession.js';

const studio = window.studio || {
  loadLibrary: async () => [],
  openWorkbenchImage: async () => ({ ok: false, error: '请在桌面应用中打开图片' }),
  openDroppedWorkbenchImage: async () => ({ ok: false, error: '请在桌面应用中打开图片' }),
  showContextMenu: async () => null,
  importImages: async () => ({ ok: true, canceled: true, imported: [], duplicates: [], errors: [], summary: null }),
  importDroppedFiles: async () => ({ ok: false, imported: [], duplicates: [], errors: [{ error: '请在桌面应用中导入' }] }),
  cancelImport: async () => ({ ok: false }),
  onImportProgress: () => {},
  offImportProgress: () => {},
  deleteProject: async () => ({ ok: true }),
  saveTagAnnotations: async () => ({ ok: true }),
  revealFile: async () => {},
  getAISettings: async () => ({ baseUrl: 'https://api.openai.com/v1', model: '', hasApiKey: false, encryptionAvailable: true }),
  saveAISettings: async (settings) => settings,
  getAppearanceSettings: async () => ({ themeMode: 'dark', fontScale: 'large', density: 'comfortable', motion: 'full' }),
  saveAppearanceSettings: async (settings) => settings,
  listAIModels: async () => ({ ok: false, error: '请在桌面应用中配置 API' }),
  testAIModel: async () => ({ ok: false, error: '请在桌面应用中配置 API' }),
  translateTags: async () => ({ ok: false, error: '请在桌面应用中配置 API' }),
};

function showNativeContextMenu(event, request) {
  if (isTextEditingTarget(event.target)) return null;
  event.preventDefault();
  event.stopPropagation();
  return studio.showContextMenu({ ...request, ...contextMenuPosition(event) });
}

function SideNav({ page, onNavigate }) {
  const items = [{ key: 'workbench', icon: 'edit', label: '工作台' }, { key: 'gallery', icon: 'library', label: '图片库' }];
  return <LobeSideNav
    className="studio-side-nav"
    avatar={<button className="studio-brand" onClick={() => onNavigate('workbench')} title="NovelAI Prompt Studio">N<span>4</span></button>}
    topActions={<>{items.map((item) => <LobeActionIcon active={page === item.key} icon={<Icon name={item.icon} size={19}/>} key={item.key} onClick={() => onNavigate(item.key)} placement="right" size="large" title={item.label} variant="borderless"/>)}</>}
    bottomActions={<LobeActionIcon active={page === 'settings'} icon={<Icon name="settings" size={19}/>} onClick={() => onNavigate('settings')} placement="right" size="large" title="设置" variant="borderless"/>}
  />;
}

function ImportExperience({ dragState, progress, result, target, onCancel, onDismiss }) {
  const importing = progress && ['preparing', 'importing'].includes(progress.phase);
  const percent = progress?.total ? Math.min(100, Math.round((progress.processed || 0) / progress.total * 100)) : 0;
  const workbench = target === 'workbench';
  return <>
    {dragState.active && <div className={`file-drop-overlay ${dragState.valid ? 'accept' : 'reject'}`}><div className="file-drop-target"><Icon name={dragState.valid ? 'upload' : 'close'} size={30}/><strong>{dragState.valid ? (workbench ? '松开以解析并编辑' : '松开以保存到图片库') : '这些文件暂不支持'}</strong><span>{workbench ? '单张 PNG / JPG / WEBP，不会保存' : 'PNG / JPG / WEBP / ZIP，可批量导入'}</span></div></div>}
    {importing && <div className="import-status"><div><strong>{progress.phase === 'preparing' ? '正在检查文件' : '正在导入图片'}</strong><span>{progress.current || '准备中'} · {percent}%</span></div><progress max="100" value={percent}/><LobeButton onClick={onCancel} size="small">取消</LobeButton></div>}
    {result && <div className="import-result"><Icon name={result.errors?.length ? 'warning' : 'check'} size={17}/><span>导入 {result.imported?.length || 0} 张 · 跳过重复 {result.duplicates?.length || 0} 张{result.errors?.length ? ` · 失败 ${result.errors.length} 张` : ''}</span><LobeButton onClick={onDismiss} size="small" type="text">关闭</LobeButton></div>}
  </>;
}

export default function App({ appearance, setAppearance }) {
  const [page, setPage] = useState('workbench');
  const [settingsReturnPage, setSettingsReturnPage] = useState('workbench');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [previewId, setPreviewId] = useState('');
  const [workbenchSession, setWorkbenchSession] = useState(null);
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbenchError, setWorkbenchError] = useState('');
  const [workbenchFocus, setWorkbenchFocus] = useState({ scopeKey: 'base:prompt', tagId: null });
  const [dragState, setDragState] = useState({ active: false, valid: false });
  const [importProgress, setImportProgress] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const appShellRef = useRef(null);
  const dropHandlerRef = useRef(null);
  const annotationTimer = useRef(null);

  const showToast = (message) => lobeToast.success({ description: message, duration: 2200, placement: 'bottom' });

  const hydrateProject = (project) => syncProjectPromptMetadata({
    ...project,
    tags: repairLegacyPromptTags(project.tags, project.metadata?.prompt_raw),
    prompt_structure: normalizePromptStructure(project.prompt_structure, project.metadata),
  });

  const reloadLibrary = async () => {
    const items = await studio.loadLibrary();
    setProjects((items || []).map(hydrateProject));
  };

  useEffect(() => { reloadLibrary().finally(() => setLoading(false)); }, []);

  useEffect(() => {
    const saved = parseWorkbenchSession(window.localStorage.getItem(WORKBENCH_SESSION_KEY));
    if (!saved?.sourcePath) return;
    setWorkbenchLoading(true);
    studio.openWorkbenchImage(saved.sourcePath).then((result) => {
      if (!result?.ok || !result.project) {
        window.localStorage.removeItem(WORKBENCH_SESSION_KEY);
        setWorkbenchError(result?.error || '上次工作台图片已不可用');
        return;
      }
      setWorkbenchSession(createWorkbenchSession(result.project, saved));
    }).finally(() => setWorkbenchLoading(false));
  }, []);

  useEffect(() => {
    if (workbenchSession) window.localStorage.setItem(WORKBENCH_SESSION_KEY, serializeWorkbenchSession(workbenchSession));
    else window.localStorage.removeItem(WORKBENCH_SESSION_KEY);
  }, [workbenchSession]);

  useEffect(() => {
    document.documentElement.dataset.fontScale = appearance.fontScale;
    document.documentElement.dataset.density = appearance.density;
    document.documentElement.dataset.motion = appearance.motion;
  }, [appearance]);

  useEffect(() => {
    studio.onImportProgress(setImportProgress);
    return () => studio.offImportProgress();
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (event.defaultPrevented || !isTextEditingTarget(event.target)) return;
      event.preventDefault();
      studio.showContextMenu({ kind: 'text', ...contextMenuPosition(event) });
    };
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  useEffect(() => {
    if (!appShellRef.current || !['workbench', 'gallery'].includes(page)) return undefined;
    const cleanupMonitor = monitorForExternal({ canMonitor: containsFiles, onDragStart: () => preventUnhandled.start(), onDrop: () => setDragState((current) => ({ ...current, active: false })) });
    const cleanupTarget = dropTargetForExternal({
      element: appShellRef.current,
      canDrop: containsFiles,
      onDragEnter: ({ source }) => setDragState({ active: true, ...(page === 'workbench' ? assessWorkbenchDroppedFiles(getFiles({ source })) : assessDroppedFiles(getFiles({ source }))) }),
      onDrag: ({ source }) => setDragState({ active: true, ...(page === 'workbench' ? assessWorkbenchDroppedFiles(getFiles({ source })) : assessDroppedFiles(getFiles({ source }))) }),
      onDragLeave: () => setDragState((current) => ({ ...current, active: false })),
      onDrop: ({ source }) => { const files = getFiles({ source }); setDragState((current) => ({ ...current, active: false })); if (files.length) dropHandlerRef.current?.(files); },
    });
    return () => { cleanupTarget(); cleanupMonitor(); };
  }, [page]);

  const canReplaceWorkbench = () => !workbenchHasChanges(workbenchSession) || window.confirm('当前工作台包含尚未复制的修改。仍要更换图片吗？');
  const acceptWorkbenchProject = (project, saved = null) => {
    setWorkbenchSession(createWorkbenchSession(project, saved));
    setWorkbenchFocus({ scopeKey: 'base:prompt', tagId: null });
    setWorkbenchError('');
    setPage('workbench');
  };

  const openWorkbenchPath = async (filePath = '') => {
    if (!canReplaceWorkbench()) return false;
    setWorkbenchLoading(true);
    setWorkbenchError('');
    try {
      const result = await studio.openWorkbenchImage(filePath);
      if (result?.canceled) return false;
      if (!result?.ok || !result.project) throw new Error(result?.error || '图片没有打开');
      acceptWorkbenchProject(result.project);
      showToast('图片已在工作台中打开');
      return true;
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setWorkbenchLoading(false);
    }
  };

  const openDroppedWorkbenchImage = async (files) => {
    if (!assessWorkbenchDroppedFiles(files).valid) { setWorkbenchError('工作台一次只支持一张 PNG、JPG 或 WEBP 图片'); return; }
    if (!canReplaceWorkbench()) return;
    setWorkbenchLoading(true);
    try {
      const result = await studio.openDroppedWorkbenchImage(files);
      if (!result?.ok || !result.project) throw new Error(result?.error || '图片没有打开');
      acceptWorkbenchProject(result.project);
      showToast('图片已解析，可以直接编辑 Tag');
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkbenchLoading(false);
    }
  };

  const importImages = async (files = null) => {
    if (files && !assessDroppedFiles(files).valid) { showToast('图片库只支持图片或 ZIP'); return; }
    setPage('gallery');
    setImportResult(null);
    setImportProgress({ phase: 'preparing', processed: 0, total: 0, current: '准备中' });
    const result = files ? await studio.importDroppedFiles(files) : await studio.importImages();
    setImportProgress(null);
    if (result?.canceled) return;
    setImportResult(result);
    await reloadLibrary();
    if (result?.imported?.length) setPreviewId(result.imported.at(-1).id);
  };

  dropHandlerRef.current = page === 'workbench' ? openDroppedWorkbenchImage : importImages;

  useEffect(() => {
    const keydown = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 'i') { event.preventDefault(); page === 'workbench' ? openWorkbenchPath() : page === 'gallery' && importImages(); }
      if (event.key.toLowerCase() === 'k' && page === 'gallery') { event.preventDefault(); document.querySelector('.gallery-search input')?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const visibleProjects = useMemo(() => {
    const needles = expandSearch(query);
    const matched = needles.length ? projects.filter((project) => [project.name, ...allPromptTags(project).flatMap((tag) => [tag.tag, tag.translation])].some((value) => needles.some((needle) => normalizeSearch(value).includes(needle)))) : projects;
    return [...matched].sort((left, right) => {
      if (sort === 'oldest') return new Date(left.created_at || 0) - new Date(right.created_at || 0);
      if (sort === 'name') return String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN', { numeric: true });
      return new Date(right.created_at || 0) - new Date(left.created_at || 0);
    });
  }, [projects, query, sort]);
  const preview = projects.find((project) => project.id === previewId) || null;

  const scheduleAnnotations = (project) => {
    window.clearTimeout(annotationTimer.current);
    const entries = allPromptTags(project).filter((tag) => tag.translation_source === 'manual' || tag.category_source === 'manual');
    if (!entries.length) return;
    annotationTimer.current = window.setTimeout(async () => {
      const result = await studio.saveTagAnnotations(entries);
      if (!result?.ok) showToast(result?.error || 'Tag 翻译与分类没有保存');
    }, 500);
  };

  const updateWorkbenchProject = (nextProject) => {
    const updated = { ...syncProjectPromptMetadata(nextProject), updated_at: new Date().toISOString() };
    setWorkbenchSession((current) => current ? { ...current, project: updated, updatedAt: updated.updated_at } : current);
    scheduleAnnotations(updated);
  };

  const translateWorkbenchTags = async (entries) => {
    const result = await studio.translateTags(entries.map((entry) => entry.tag.tag));
    if (!result?.ok) { showToast(result?.error || 'AI 翻译没有完成'); return; }
    setWorkbenchSession((current) => {
      if (!current?.project) return current;
      let nextProject = current.project;
      entries.forEach((entry, index) => {
        const scope = getPromptScope(nextProject, entry.scopeKey);
        const item = result.items?.[index] || {};
        nextProject = updatePromptScope(nextProject, scope.key, scope.tags.map((tag) => tag.id === entry.tag.id ? { ...tag, ...item, translation_source: item.translation_source || 'ai', category_source: item.category_source || 'ai' } : tag));
      });
      const updated = { ...syncProjectPromptMetadata(nextProject), updated_at: new Date().toISOString() };
      scheduleAnnotations(updated);
      return { ...current, project: updated, updatedAt: updated.updated_at };
    });
    showToast(result.ai_count ? `已翻译并分类 ${entries.length} 个 Tag` : '已复用本地翻译与分类');
  };

  const tagContextMenu = async (event, scopeKey, tag) => {
    const action = await showNativeContextMenu(event, { kind: 'tag', hasTranslation: Boolean(tag.translation?.trim()), category: tag.category || 'Unsorted' });
    if (!action || !workbenchSession?.project) return;
    if (action === 'tag:copy') { await navigator.clipboard.writeText(tag.tag); showToast('Tag 已复制'); return; }
    if (action === 'tag:copy-translation') { await navigator.clipboard.writeText(tag.translation || ''); showToast('翻译已复制'); return; }
    if (action === 'tag:edit') { setWorkbenchFocus({ scopeKey, tagId: null }); requestAnimationFrame(() => setWorkbenchFocus({ scopeKey, tagId: tag.id })); return; }
    const scope = getPromptScope(workbenchSession.project, scopeKey);
    if (action === 'tag:delete') { updateWorkbenchProject(updatePromptScope(workbenchSession.project, scope.key, scope.tags.filter((item) => item.id !== tag.id))); return; }
    if (action.startsWith('tag:category:')) { updateWorkbenchProject(updatePromptScope(workbenchSession.project, scope.key, scope.tags.map((item) => item.id === tag.id ? { ...item, category: action.slice(13), category_source: 'manual' } : item))); return; }
    if (action === 'tag:translate') await translateWorkbenchTags([{ scopeKey, tag }]);
  };

  const projectContextMenu = async (event, project) => {
    const action = await showNativeContextMenu(event, { kind: 'project-simple' });
    if (action === 'project:open-workbench') await openWorkbenchPath(project.image_path);
    if (action === 'project:copy-prompt') { await navigator.clipboard.writeText(formatPositivePromptForCopy(project)); showToast('原始 Prompt 已复制'); }
    if (action === 'project:reveal') await studio.revealFile(project.image_path);
    if (action === 'project:delete') await removeProject(project);
  };

  const removeProject = async (project) => {
    if (!window.confirm(`从图片库移除“${project.name}”？\n\n应用保存的图片与缩略图会被删除，此操作无法撤销。`)) return;
    const result = await studio.deleteProject(project.id);
    if (!result?.ok) { showToast(result?.error || '图片没有移除'); return; }
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setPreviewId((current) => current === project.id ? '' : current);
    if (workbenchSession?.sourcePath === project.image_path) setWorkbenchSession(null);
    showToast(result.cleanupWarning ? '图片记录已移除；部分资产文件稍后可手动清理' : '图片已从图片库移除');
  };

  const changePage = (next) => {
    if (next === 'settings') setSettingsReturnPage(page === 'settings' ? settingsReturnPage : page);
    setPage(next);
  };

  const changeAppearance = async (patch) => {
    const saved = await studio.saveAppearanceSettings({ ...appearance, ...patch });
    setAppearance(saved);
  };

  const resetWorkbench = () => {
    if (!workbenchSession) return;
    if (workbenchHasChanges(workbenchSession) && !window.confirm('恢复图片中的原始 Prompt？当前工作台修改会被清除。')) return;
    setWorkbenchSession((current) => current ? { ...current, project: structuredClone(current.originalProject), updatedAt: new Date().toISOString() } : current);
    showToast('已恢复图片中的原始 Prompt');
  };

  return <div className="app-shell" ref={appShellRef}>
    <SideNav onNavigate={changePage} page={page}/>
    <div className="app-content">
      {loading ? <div className="app-loading"><Icon name="refresh" size={24}/><span>正在读取图片库…</span></div> : page === 'workbench' ? <WorkbenchPage
        error={workbenchError}
        focusScopeKey={workbenchFocus.scopeKey}
        focusTagId={workbenchFocus.tagId}
        loading={workbenchLoading}
        onChooseImage={() => openWorkbenchPath()}
        onCopyPrompt={async () => { await navigator.clipboard.writeText(formatPositivePromptForCopy(workbenchSession.project)); showToast('Prompt 已复制，可直接粘贴到 NovelAI'); }}
        onCopyText={async (text, count, selected) => { if (!text) return; await navigator.clipboard.writeText(text); showToast(selected ? `已复制 ${count} 个已选 Tag` : `已复制 ${count} 个可见 Tag`); }}
        onCopyVibe={async (vibe) => { if (!vibe.encoding) return; await navigator.clipboard.writeText(vibe.encoding); showToast('Vibe 编码已复制'); }}
        onNotify={showToast}
        onReset={resetWorkbench}
        onTagContextMenu={tagContextMenu}
        onTranslateTags={translateWorkbenchTags}
        onUpdateProject={updateWorkbenchProject}
        session={workbenchSession}
      /> : page === 'gallery' ? <GalleryPage
        importing={Boolean(importProgress)}
        onClosePreview={() => setPreviewId('')}
        onImport={() => importImages()}
        onOpenWorkbench={(project) => openWorkbenchPath(project.image_path)}
        onPreview={(project) => setPreviewId(project.id)}
        onProjectContextMenu={projectContextMenu}
        onQueryChange={setQuery}
        onRemove={removeProject}
        onReveal={(project) => studio.revealFile(project.image_path)}
        onSortChange={setSort}
        preview={preview}
        projects={visibleProjects}
        query={query}
        sort={sort}
      /> : <SettingsPage appearance={appearance} onAppearanceChange={changeAppearance} onClose={() => setPage(settingsReturnPage)} showToast={showToast} studio={studio}/>}
    </div>
    <ImportExperience dragState={dragState} onCancel={() => importProgress?.batchId && studio.cancelImport(importProgress.batchId)} onDismiss={() => setImportResult(null)} progress={importProgress} result={importResult} target={page}/>
  </div>;
}
