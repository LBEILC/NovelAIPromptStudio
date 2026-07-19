import { useEffect, useMemo, useRef, useState } from 'react';
import { dropTargetForExternal, monitorForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { containsFiles, getFiles } from '@atlaskit/pragmatic-drag-and-drop/external/file';
import { preventUnhandled } from '@atlaskit/pragmatic-drag-and-drop/prevent-unhandled';
import { analyzePromptBatch, CATEGORY_LABELS, CATEGORY_OPTIONS, expandSearch, formatPrompt, inferCategory, normalizeSearch, repairLegacyPromptTags } from './lib/prompt.js';
import {
  addPromptCharacter,
  allPromptTags,
  countPromptTags,
  formatPositivePromptForCopy,
  getPromptScope,
  getPromptScopes,
  normalizePromptStructure,
  removePromptCharacter,
  restorePromptSnapshot,
  syncProjectPromptMetadata,
  updatePromptCharacter,
  updatePromptScope,
} from './lib/promptStructure.js';
import PromptOverview from './PromptOverview.jsx';
import { groupVibeLibraryBySource } from './lib/vibeLibrary.js';
import { informationExtractedPatch, informationExtractedState, restoreOriginalInformationPatch } from './lib/vibes.js';
import { hasLimitedReproduction } from './lib/generationMetadata.js';
import { assessDroppedFiles } from './lib/importDrop.js';
import { applyGenerationSnapshot, branchChangeSummary, generationSnapshot, hasGenerationChanges } from './lib/branches.js';

const studio = window.studio || {
  loadLibrary: async () => [],
  loadLibraryOrganization: async () => ({ collections: [], projects: [] }),
  createCollection: async () => ({ ok: true, collections: [], projects: [] }),
  renameCollection: async () => ({ ok: true, collections: [], projects: [] }),
  deleteCollection: async () => ({ ok: true, collections: [], projects: [] }),
  addProjectsToCollection: async () => ({ ok: true, collections: [], projects: [] }),
  removeProjectsFromCollection: async () => ({ ok: true, collections: [], projects: [] }),
  setProjectsFavorite: async () => ({ ok: true, collections: [], projects: [] }),
  setProjectsDeleted: async () => ({ ok: true, collections: [], projects: [] }),
  importImages: async () => ({ ok: true, canceled: true, imported: [], duplicates: [], errors: [], summary: null }),
  importDroppedFiles: async () => ({ ok: false, imported: [], duplicates: [], errors: [{ file: '拖拽文件', error: '请在桌面应用中导入' }], summary: { total: 0, processed: 0, imported: 0, duplicates: 0, failed: 1, skipped: 0, remaining: 0, cancelled: false } }),
  cancelImport: async () => ({ ok: false }),
  onImportProgress: () => {},
  offImportProgress: () => {},
  updateProject: async () => ({ ok: true }),
  createBranch: async (branch) => ({ ok: true, branch }),
  updateBranch: async (branch) => ({ ok: true, branch }),
  deleteBranch: async () => ({ ok: true }),
  deleteProject: async () => ({ ok: true }),
  loadVibeLibrary: async () => [],
  importVibeLibrary: async () => ({ ok: true, library: [], imported: [], errors: [] }),
  useVibeFromLibrary: async (entry) => ({ ...entry, id: crypto.randomUUID(), library_id: entry.id, enabled: true }),
  inspectEmbeddedVibes: async () => ({ total: 0, linked: 0, available: 0, missing: [] }),
  resolveEmbeddedVibes: async (project) => ({ ok: true, project, status: { total: 0, linked: 0, available: 0, missing: [] }, library: [], linked: 0, extracted: 0 }),
  revealFile: async () => {},
  getAISettings: async () => ({ baseUrl: 'https://api.openai.com/v1', model: '', hasApiKey: false, encryptionAvailable: true }),
  saveAISettings: async (settings) => ({ ...settings, hasApiKey: Boolean(settings.apiKey) }),
  listAIModels: async () => ({ ok: false, error: '请在桌面应用中配置 API' }),
  testAIModel: async () => ({ ok: false, error: '请在桌面应用中配置 API' }),
  translateTags: async () => ({ ok: false, error: '请在桌面应用中配置 API' }),
};

function Icon({ name, size = 17 }) {
  const paths = {
    library: <><rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m3 17 5-4 4 3 3-2 6 5"/></>,
    layers: <><path d="m12 3-9 5 9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
    dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    grip: <><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    folder: <><path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    spark: <><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z"/><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.7-2.1L20 8M4 16l2.2 2.1A7 7 0 0 0 17.9 16"/></>,
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>,
    edit: <><path d="m4 20 4.2-1 10.6-10.6-3.2-3.2L5 15.8 4 20Z"/><path d="m13.8 7 3.2 3.2"/></>,
    archive: <><path d="M4 7h16v13H4z"/><path d="M3 3h18v4H3zM9 11h6"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function mediaUrl(filePath) {
  return filePath ? `novelai-media://file?path=${encodeURIComponent(filePath)}` : '';
}

function relativeTime(value) {
  if (!value) return '刚刚';
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function EmptyState({ onImport, hasProjects = false }) {
  return <main className="empty-state">
    <div className="empty-mark"><Icon name="image" size={32}/><span>NAI / 01</span></div>
    <h1>{hasProjects ? <>当前视图<br/>还没有作品</> : <>把生成图变成<br/>可继续创作的资产</>}</h1>
    <p>{hasProjects ? '可以切换到“全部作品”查看现有资产，或继续导入新的 NovelAI 图片。' : '导入 NovelAI 图片，自动恢复 Prompt 与生成参数。Vibe 参考图和权重会独立保存，不再随页面关闭而丢失。'}</p>
    <button className="primary large" onClick={onImport}><Icon name="plus"/>{hasProjects ? '继续导入作品' : '导入第一批作品'}</button>
    <div className="empty-hint">PNG · JPG · WEBP　支持批量导入</div>
  </main>;
}

function parseBranchSnapshot(branch) {
  if (!branch?.snapshot_json) return null;
  try {
    const snapshot = JSON.parse(branch.snapshot_json);
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  } catch {
    return null;
  }
}

function ImportExperience({ dragState, progress, result, onCancel, onDismiss }) {
  const summary = result?.summary;
  const importing = progress && ['preparing', 'importing'].includes(progress.phase);
  const percent = progress?.total ? Math.min(100, Math.round((progress.processed || 0) / progress.total * 100)) : 0;
  return <>
    {dragState?.active && <div className={`file-drop-overlay ${dragState.valid ? 'accept' : 'reject'}`} aria-live="assertive">
      <div className="file-drop-target">
        <div className="drop-glyph"><Icon name={dragState.valid ? 'upload' : 'close'} size={28}/></div>
        <strong>{dragState.valid ? `松手导入 ${dragState.label}` : '这些文件暂不支持'}</strong>
        <span>{dragState.valid ? `${dragState.count == null ? '正在读取文件信息' : `${dragState.count} 个文件`} · PNG / JPG / WEBP / ZIP` : '请拖入图片或 NovelAI 导出的标准 ZIP'}</span>
        <small>ZIP 会先安全检查，再逐张读取 PNG</small>
      </div>
    </div>}
    {(importing || summary) && <aside className={`import-status ${summary ? 'complete' : ''}`} role="status" aria-live="polite">
      <header>
        <span className="import-status-icon"><Icon name={summary ? (summary.failed ? 'info' : 'check') : 'archive'} size={15}/></span>
        <div><strong>{summary ? (summary.cancelled ? '导入已停止' : '导入完成') : progress.phase === 'preparing' ? '正在检查文件' : '正在导入作品'}</strong><small>{summary ? `处理 ${summary.processed} / ${summary.total}` : progress.current || '准备导入…'}</small></div>
        {summary ? <button onClick={onDismiss} aria-label="关闭导入摘要"><Icon name="close" size={14}/></button> : <button className="cancel-import" onClick={onCancel} disabled={!progress.batchId}>停止</button>}
      </header>
      {!summary && <><div className="import-progress-track"><i style={{ transform: `scaleX(${progress.total ? percent / 100 : .08})` }}/></div><div className="import-counters"><span>已导入 <b>{progress.imported || 0}</b></span><span>重复 <b>{progress.duplicates || 0}</b></span><span>异常 <b>{progress.failed || 0}</b></span><em>{progress.total ? `${percent}%` : `${progress.prepared || 0} / ${progress.sourceCount || '—'}`}</em></div></>}
      {summary && <>
        <div className="import-summary-grid"><span><b>{summary.imported}</b>新增</span><span><b>{summary.duplicates}</b>重复</span><span><b>{summary.failed}</b>失败</span><span><b>{summary.skipped}</b>忽略</span></div>
        {result.errors?.length > 0 && <div className="import-errors">{result.errors.slice(0, 3).map((item, index) => <div key={`${item.file}-${index}`}><strong>{item.file}</strong><span>{item.error}</span></div>)}{result.errors.length > 3 && <small>另有 {result.errors.length - 3} 项异常</small>}</div>}
        {result.duplicates?.length > 0 && !result.errors?.length && <div className="import-note">相同图片已存在，已按内容指纹跳过，不会创建重复作品。</div>}
      </>}
    </aside>}
  </>;
}

function LibraryPanel({
  projects,
  allProjects,
  collections,
  activeId,
  setActiveId,
  query,
  setQuery,
  onImport,
  onOpenPromptOverview,
  shortcutModifier,
  libraryView,
  onViewChange,
  selectionMode,
  setSelectionMode,
  selectedIds,
  onToggleSelected,
  onSelectAll,
  onClearSelection,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onAddToCollection,
  onRemoveFromCollection,
  onSetFavorite,
  onSetDeleted,
}) {
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [editingCollectionId, setEditingCollectionId] = useState('');
  const [editingCollectionName, setEditingCollectionName] = useState('');
  const [deleteArmedId, setDeleteArmedId] = useState('');
  const [batchCollectionId, setBatchCollectionId] = useState('');
  const activeProjects = allProjects.filter((project) => !project.deleted_at);
  const counts = {
    all: activeProjects.length,
    favorites: activeProjects.filter((project) => project.is_favorite).length,
    ungrouped: activeProjects.filter((project) => !(project.collection_ids || []).length).length,
    trash: allProjects.filter((project) => project.deleted_at).length,
  };
  const viewItems = [
    { id: 'all', label: '全部作品', icon: 'library', count: counts.all },
    { id: 'favorites', label: '收藏', icon: 'star', count: counts.favorites },
    { id: 'ungrouped', label: '未分组', icon: 'layers', count: counts.ungrouped },
    { id: 'trash', label: '回收站', icon: 'trash', count: counts.trash },
  ];
  const currentCollection = libraryView.startsWith('collection:') ? collections.find((collection) => `collection:${collection.id}` === libraryView) : null;
  const currentLabel = currentCollection?.name || viewItems.find((item) => item.id === libraryView)?.label || '作品库';
  const selectedProjects = allProjects.filter((project) => selectedIds.has(project.id));
  const allSelectedAreFavorite = selectedProjects.length > 0 && selectedProjects.every((project) => project.is_favorite);

  const submitCollection = async () => {
    if (!(await onCreateCollection(collectionName))) return;
    setCollectionName('');
    setCreatingCollection(false);
  };
  const submitRename = async (id) => {
    if (!(await onRenameCollection(id, editingCollectionName))) return;
    setEditingCollectionId('');
    setEditingCollectionName('');
  };

  return <aside className="library-panel">
    <div className="brand-row">
      <div className="brand-symbol">N<span>4</span></div>
      <div><strong>Prompt Studio</strong><small>NovelAI asset desk</small></div>
    </div>
    <button className="primary import-button" onClick={onImport}><Icon name="plus"/>导入图片 <kbd>{shortcutModifier} I</kbd></button>
    <label className="search-box"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前视图…"/><span>{shortcutModifier} K</span></label>
    <nav className="library-views" aria-label="作品库视图">
      {viewItems.map((item) => <button key={item.id} className={libraryView === item.id ? 'active' : ''} onClick={() => onViewChange(item.id)}><Icon name={item.icon} size={14}/><span>{item.label}</span><b>{item.count}</b></button>)}
    </nav>
    <div className="collection-heading"><span>收藏集</span><button onClick={() => { setCreatingCollection(true); setDeleteArmedId(''); }} aria-label="新建收藏集"><Icon name="plus" size={14}/></button></div>
    <div className="collection-list">
      {creatingCollection && <div className="collection-editor"><input autoFocus maxLength={80} value={collectionName} onChange={(event) => setCollectionName(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) submitCollection();
        if (event.key === 'Escape') { setCreatingCollection(false); setCollectionName(''); }
      }} placeholder="收藏集名称"/><button onClick={submitCollection} disabled={!collectionName.trim()}><Icon name="check" size={13}/></button><button onClick={() => { setCreatingCollection(false); setCollectionName(''); }}><Icon name="close" size={13}/></button></div>}
      {collections.map((collection) => <div className={`collection-row ${libraryView === `collection:${collection.id}` ? 'active' : ''}`} key={collection.id}>
        {editingCollectionId === collection.id
          ? <div className="collection-editor"><input autoFocus maxLength={80} value={editingCollectionName} onChange={(event) => setEditingCollectionName(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) submitRename(collection.id);
            if (event.key === 'Escape') setEditingCollectionId('');
          }}/><button onClick={() => submitRename(collection.id)} disabled={!editingCollectionName.trim()}><Icon name="check" size={13}/></button><button onClick={() => setEditingCollectionId('')}><Icon name="close" size={13}/></button></div>
          : <><button className="collection-open" onClick={() => onViewChange(`collection:${collection.id}`)}><Icon name="folder" size={13}/><span>{collection.name}</span><b>{collection.project_count}</b></button><button className="collection-action" onClick={() => { setEditingCollectionId(collection.id); setEditingCollectionName(collection.name); setDeleteArmedId(''); }} aria-label={`重命名 ${collection.name}`}><Icon name="edit" size={12}/></button><button className={`collection-action delete ${deleteArmedId === collection.id ? 'armed' : ''}`} onClick={async () => {
            if (deleteArmedId !== collection.id) { setDeleteArmedId(collection.id); return; }
            if (await onDeleteCollection(collection.id)) setDeleteArmedId('');
          }} aria-label={deleteArmedId === collection.id ? `确认删除 ${collection.name}` : `删除 ${collection.name}`}>{deleteArmedId === collection.id ? '确认' : <Icon name="close" size={12}/>}</button></>}
      </div>)}
      {!collections.length && !creatingCollection && <div className="collection-empty">创建收藏集来手动整理作品</div>}
    </div>
    <div className="section-heading library-result-heading"><span>{currentLabel}</span><b>{projects.length}</b><button className={selectionMode ? 'active' : ''} onClick={() => { setSelectionMode(!selectionMode); onClearSelection(); }}>{selectionMode ? '完成' : '多选'}</button></div>
    {selectionMode && <div className="library-batch-toolbar">
      <div><button onClick={onSelectAll}>{selectedIds.size === projects.length && projects.length ? '取消全选' : '全选'}</button><span>已选 <b>{selectedIds.size}</b></span><button onClick={onClearSelection} disabled={!selectedIds.size}>清除</button></div>
      {libraryView !== 'trash' && <div><select value={batchCollectionId} onChange={(event) => setBatchCollectionId(event.target.value)} aria-label="目标收藏集"><option value="">加入收藏集…</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select><button onClick={() => onAddToCollection(batchCollectionId)} disabled={!selectedIds.size || !batchCollectionId}>加入</button></div>}
      <div className="batch-actions">
        {currentCollection && <button onClick={() => onRemoveFromCollection(currentCollection.id)} disabled={!selectedIds.size}>移出当前组</button>}
        {libraryView !== 'trash' && <button onClick={() => onSetFavorite(!allSelectedAreFavorite)} disabled={!selectedIds.size}><Icon name="star" size={13}/>{allSelectedAreFavorite ? '取消收藏' : '收藏'}</button>}
        <button className={libraryView === 'trash' ? 'restore' : 'danger'} onClick={() => onSetDeleted(libraryView !== 'trash')} disabled={!selectedIds.size}><Icon name={libraryView === 'trash' ? 'refresh' : 'trash'} size={13}/>{libraryView === 'trash' ? '恢复' : '回收站'}</button>
      </div>
    </div>}
    <div className="asset-list">
      {projects.map((project) => <div key={project.id} className={`asset-row ${project.id === activeId ? 'active' : ''} ${selectedIds.has(project.id) ? 'selected' : ''}`}>
        {selectionMode && <button className={`asset-check ${selectedIds.has(project.id) ? 'selected' : ''}`} onClick={() => onToggleSelected(project.id)} aria-pressed={selectedIds.has(project.id)} aria-label={`${selectedIds.has(project.id) ? '取消选择' : '选择'} ${project.name}`}>{selectedIds.has(project.id) ? '✓' : ''}</button>}
        <button className="asset-thumbnail" onClick={() => selectionMode ? onToggleSelected(project.id) : onOpenPromptOverview(project.id)} title={selectionMode ? '选择作品' : '打开 Prompt 总览'}><img src={mediaUrl(project.thumbnail_path)} alt=""/><span><Icon name="layers" size={13}/></span></button>
        <button className="asset-select" onClick={() => selectionMode ? onToggleSelected(project.id) : setActiveId(project.id)}><span className="asset-copy"><strong>{project.name}</strong><small>{countPromptTags(project)} tags · {(project.collection_ids || []).length} 组 · {relativeTime(project.updated_at)}</small></span></button>
        {libraryView !== 'trash' && <button className={`asset-favorite ${project.is_favorite ? 'active' : ''}`} onClick={() => onSetFavorite(!project.is_favorite, [project.id])} aria-label={`${project.is_favorite ? '取消收藏' : '收藏'} ${project.name}`}><Icon name="star" size={13}/></button>}
      </div>)}
      {!projects.length && <div className="list-empty">{query ? '没有匹配的作品' : `「${currentLabel}」还是空的`}</div>}
    </div>
    <div className="library-footer"><Icon name="folder"/><span>本地资料库</span><i>SQLite</i></div>
  </aside>;
}

const BRANCH_STATUS_LABELS = {
  draft: '草稿',
  waiting: '待生成',
  result: '已有结果',
  mismatch: '结果待确认',
};

function PreviewStage({ project, sourceProject, mode, setMode, onCopy, onReveal, onEditTag, updateProject, activeBranchId, onSelectBranch, onDiscardBranch, onMarkBranchWaiting, onUseLegacyVersion, overviewCopy, onOverviewCopyChange, onCopyText, onNotify }) {
  const limitedReproduction = hasLimitedReproduction(project.metadata);
  const activeBranch = (sourceProject.branches || []).find((branch) => branch.id === activeBranchId);
  const copyLabel = mode === 'prompt'
    ? overviewCopy.selected ? `复制已选 ${overviewCopy.count}` : `复制可见 ${overviewCopy.count}`
    : '复制 Prompt';
  return <section className="preview-column">
    <header className="topbar">
      <div className="breadcrumb branch-breadcrumb"><span>作品库</span><b>/</b><strong>{sourceProject.name}</strong>{activeBranch && <em>{activeBranch.name}</em>}</div>
      <div className="top-actions">
        <div className="workspace-switch" aria-label="工作区视图">
          <button className={mode === 'image' ? 'active' : ''} onClick={() => setMode('image')}><Icon name="image"/>图像</button>
          <button className={mode === 'prompt' ? 'active' : ''} onClick={() => setMode('prompt')}><Icon name="layers"/>Prompt</button>
        </div>
        <button className="ghost" onClick={() => onReveal(sourceProject.image_path)} title="在文件夹中显示原图"><Icon name="folder"/></button>
        <button className="copy-button" onClick={onCopy} disabled={mode === 'prompt' && !overviewCopy.count}><Icon name="copy"/>{copyLabel}</button>
      </div>
    </header>
    {mode === 'image' ? <div className="stage">
      <div className="image-mat">
        <img src={mediaUrl(sourceProject.image_path)} alt={sourceProject.name}/>
        <div className="image-index">ASSET<br/><b>{String(countPromptTags(project)).padStart(2, '0')}</b></div>
      </div>
      <div className="stage-meta">
        <span>{project.metadata.model || 'MODEL UNKNOWN'}</span>
        <i/>
        <span>SEED {project.metadata.seed || '—'}</span>
        <i/>
        <span>{project.metadata.steps || '—'} STEPS</span>
        {limitedReproduction && <><i/><span className="reproduction-status" title="局部重绘 metadata 不包含完整底图与蒙版">INPAINT · 无法精确复现</span></>}
      </div>
    </div> : <PromptOverview project={project} updateProject={updateProject} onEditTag={onEditTag} onCopyContextChange={onOverviewCopyChange} onCopyText={onCopyText} onNotify={onNotify}/>}
    <footer className="version-rail branch-rail">
      <div className="rail-title"><span><Icon name="history"/>生成分支</span><div className="rail-actions">{activeBranch?.status === 'draft' && <><button className="restore-action danger" onClick={() => onDiscardBranch(activeBranch.id)}>放弃草稿</button><button onClick={() => onMarkBranchWaiting(activeBranch.id)}><Icon name="check"/>标记待生成</button></>}</div></div>
      <div className="version-strip">
        <button className={`version-card current result-card ${!activeBranchId ? 'selected' : ''}`} onClick={() => onSelectBranch('')}>
          <img src={mediaUrl(sourceProject.thumbnail_path)} alt=""/><span><b>原图结果</b><small>生成信息只读 · {relativeTime(sourceProject.updated_at)}</small></span><em><Icon name="lock" size={11}/>RESULT</em>
        </button>
        {(sourceProject.branches || []).map((branch, index) => <button key={branch.id} className={`version-card branch-card ${activeBranchId === branch.id ? 'selected' : ''}`} onClick={() => onSelectBranch(branch.id)}>
          <div className="version-number">B{(sourceProject.branches || []).length - index}</div><span><b>{branch.name}</b><small>{branch.change_summary || relativeTime(branch.updated_at)}</small></span><em className={`branch-status ${branch.status}`}>{BRANCH_STATUS_LABELS[branch.status] || branch.status}</em>
        </button>)}
        {(sourceProject.versions || []).map((version, index) => <button key={version.id} className="version-card legacy-version" onClick={() => onUseLegacyVersion(version)} title="把旧版 Prompt 作为新的分支草稿打开">
          <div className="version-number">V{(sourceProject.versions || []).length - index}</div><span><b>{version.label}</b><small>旧版本 · 点击转为分支</small></span>
        </button>)}
        {!(sourceProject.branches || []).length && !(sourceProject.versions || []).length && <div className="version-empty">修改 Prompt、Vibe 或生成参数时，会自动创建分支草稿</div>}
      </div>
    </footer>
  </section>;
}

function WeightControl({ value, onChange }) {
  return <div className="weight-control">
    <input type="range" min="-3" max="3" step="0.05" value={Math.max(-3, Math.min(3, Number(value)))} onChange={(event) => onChange(Number(event.target.value))}/>
    <input className="weight-number" type="number" min="-10" max="10" step="0.05" value={value} onChange={(event) => onChange(Math.max(-10, Math.min(10, Number(event.target.value))))}/>
  </div>;
}

function TagCard({ tag, index, translating, dragging, dropTarget, onTranslate, onChange, onDelete, onPointerStart, onPointerMove, onPointerEnd, onKeyboardMove }) {
  return <article data-tag-index={index} data-tag-id={tag.id} className={`tag-card ${dragging ? 'dragging' : ''} ${dropTarget ? 'drop-target' : ''}`}>
    <div className="tag-line">
      <button className="drag-handle" onPointerDown={(event) => onPointerStart(index, event)} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={(event) => onKeyboardMove(index, event)} title="按住拖动排序；Option + 方向键微调" aria-label={`拖动 ${tag.tag} 排序`}><Icon name="grip"/></button>
      <div className="tag-fields">
        <input className="tag-name" value={tag.tag} onChange={(event) => onChange({ tag: event.target.value, translation: '', translation_source: '', category: inferCategory(event.target.value), category_source: 'heuristic', raw_segment: '', syntax_issue: '' })} aria-label="Tag"/>
        <input className="translation" value={tag.translation || ''} onChange={(event) => onChange({ translation: event.target.value, translation_source: 'manual' })} placeholder="添加中文翻译" aria-label="中文翻译"/>
      </div>
      <button className={`translate-tag ${translating ? 'working' : ''}`} onClick={onTranslate} disabled={translating} aria-label={`翻译 ${tag.tag}`}>{translating ? '···' : '译'}</button>
      <button className="icon-button danger" onClick={onDelete} aria-label="删除标签"><Icon name="close" size={14}/></button>
    </div>
    <div className="tag-options">
      <select value={tag.category} onChange={(event) => onChange({ category: event.target.value, category_source: 'manual' })}>{CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{CATEGORY_LABELS[option]}</option>)}</select>
      <WeightControl value={tag.weight} onChange={(weight) => onChange({ weight })}/>
    </div>
    {tag.syntax_issue && <div className={`tag-syntax-warning ${tag.syntax_issue}`}><Icon name="info" size={13}/><span>{tag.syntax_issue === 'control_only' ? '单独的 :: 是结束控制符，不是 Tag。建议删除。' : '这里包含可能多余的 :: 结束符；编辑 Tag 后会规范化。'}</span></div>}
    <input className="tag-note" value={tag.note || ''} onChange={(event) => onChange({ note: event.target.value })} placeholder="备注（可选）"/>
  </article>;
}

function InformationExtractedControl({ vibe, onChange }) {
  const state = informationExtractedState(vibe);
  const value = Number(vibe.information_extracted ?? 0.7);
  const status = {
    source: { icon: 'info', text: '待编码；在 NovelAI 计算会消耗 Anlas' },
    cached: { icon: 'check', text: '已命中缓存；当前 .naiv4vibe 可用' },
    unknown: { icon: 'check', text: '原编码位置未知；未改动时文件仍可用' },
    uncached: { icon: 'info', text: '这个位置尚未计算，需要重新提取 Vibe' },
  }[state.kind];
  return <div className={`information-control ${state.kind}`}>
    <div className="information-heading"><span>Information Extracted</span><b>{value.toFixed(2)}</b></div>
    <div className="information-range">
      <input type="range" min="0" max="1" step="0.01" value={value} aria-label="Information Extracted" onChange={(event) => onChange(informationExtractedPatch(vibe, event.target.value))}/>
      <div className="information-marks" aria-label="已计算位置">
        {state.cachedValues.map((cached) => <button key={cached} style={{ insetInlineStart: `${cached * 100}%`, transform: cached <= 0.05 ? 'translateX(0)' : cached >= 0.95 ? 'translateX(-100%)' : 'translateX(-50%)' }} onClick={() => onChange(informationExtractedPatch(vibe, cached))} title={`使用已缓存位置 ${cached.toFixed(2)}`} aria-label={`使用已缓存位置 ${cached.toFixed(2)}`}><i/><span>{cached.toFixed(2)}</span></button>)}
      </div>
    </div>
    <small><Icon name={status.icon} size={12}/><span>{status.text}</span>{state.kind === 'uncached' && !state.cachedValues.length && <button onClick={() => onChange(restoreOriginalInformationPatch(vibe))}>恢复原编码</button>}</small>
  </div>;
}

function PositionEditor({ project, character, updateProject }) {
  const structure = project.prompt_structure;
  const activeColumn = Math.max(0, Math.min(4, Math.round(Number(character.center?.x ?? 0.5) * 5 - 0.5)));
  const activeRow = Math.max(0, Math.min(4, Math.round(Number(character.center?.y ?? 0.5) * 5 - 0.5)));
  const updateStructure = (patch) => updateProject({ ...project, prompt_structure: { ...structure, ...patch } });
  const choosePosition = (column, row) => updateProject(updatePromptCharacter(project, character.id, {
    center: { x: (column + 0.5) / 5, y: (row + 0.5) / 5 },
  }));

  return <section className="position-editor">
    <div className="position-heading">
      <div><strong>Character Position</strong><small>5 × 5 粗略位置引导</small></div>
      <label><input type="checkbox" checked={Boolean(structure.use_coords)} onChange={(event) => updateStructure({ use_coords: event.target.checked })}/><span>{structure.use_coords ? '自定义位置' : 'AI 选择'}</span></label>
    </div>
    <div className={`position-grid ${structure.use_coords ? '' : 'disabled'}`} aria-label={`${character.label} 位置`}>
      {Array.from({ length: 25 }, (_, index) => {
        const column = index % 5;
        const row = Math.floor(index / 5);
        return <button key={index} className={activeColumn === column && activeRow === row ? 'active' : ''} disabled={!structure.use_coords} onClick={() => choosePosition(column, row)} aria-label={`第 ${row + 1} 行，第 ${column + 1} 列`}><i/></button>;
      })}
    </div>
    <div className="position-coordinates"><span>X {Number(character.center?.x ?? 0.5).toFixed(2)}</span><span>Y {Number(character.center?.y ?? 0.5).toFixed(2)}</span><label><input type="checkbox" checked={Boolean(structure.use_order)} onChange={(event) => updateStructure({ use_order: event.target.checked })}/><em>遵循角色顺序</em></label></div>
  </section>;
}

function TagsPanel({ project, updateProject, showToast, scopeKey, setScopeKey, focusTagId }) {
  const [newTag, setNewTag] = useState('');
  const [lastBatch, setLastBatch] = useState(null);
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiSettings, setAISettings] = useState({ baseUrl: 'https://api.openai.com/v1', model: '', apiKey: '', hasApiKey: false, encryptionAvailable: true });
  const [models, setModels] = useState([]);
  const [aiStatus, setAIStatus] = useState(null);
  const [aiBusy, setAIBusy] = useState('');
  const [translatingIds, setTranslatingIds] = useState(new Set());
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const dragIndex = useRef(null);
  const dropIndexRef = useRef(null);
  const scopes = useMemo(() => getPromptScopes(project), [project]);
  const scope = useMemo(() => getPromptScope(project, scopeKey), [project, scopeKey]);
  const tags = scope.tags;
  const structure = project.prompt_structure;
  const pendingBatch = useMemo(() => analyzePromptBatch(newTag, tags), [newTag, tags]);

  useEffect(() => {
    if (!scopes.some((item) => item.key === scopeKey)) setScopeKey('base:prompt');
  }, [scopeKey, scopes, setScopeKey]);

  useEffect(() => {
    setNewTag('');
    setLastBatch(null);
  }, [project.id, scope.key]);

  useEffect(() => {
    if (!focusTagId) return;
    const frame = requestAnimationFrame(() => {
      const card = [...document.querySelectorAll('[data-tag-id]')].find((element) => element.dataset.tagId === focusTagId);
      card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      card?.querySelector('.tag-name')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusTagId, scope.key]);

  useEffect(() => {
    studio.getAISettings().then((settings) => setAISettings((current) => ({ ...current, ...settings, apiKey: '' })));
  }, []);

  const saveAISettings = async () => {
    try {
      const saved = await studio.saveAISettings({
        baseUrl: aiSettings.baseUrl,
        model: aiSettings.model,
        apiKey: aiSettings.apiKey,
      });
      setAISettings((current) => ({ ...current, ...saved, apiKey: '' }));
      setAIStatus({ type: 'success', text: 'API 配置已安全保存' });
      return true;
    } catch (error) {
      setAIStatus({ type: 'error', text: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };

  const loadModels = async () => {
    setAIBusy('models');
    setAIStatus({ type: 'progress', text: '正在读取模型列表…' });
    if (!(await saveAISettings())) { setAIBusy(''); return; }
    const result = await studio.listAIModels();
    setAIBusy('');
    if (!result.ok) { setAIStatus({ type: 'error', text: result.error }); return; }
    setModels(result.models);
    setAIStatus({ type: 'success', text: `已读取 ${result.models.length} 个模型` });
  };

  const testAIModel = async () => {
    setAIBusy('test');
    setAIStatus({ type: 'progress', text: '正在发送最小测试请求…' });
    if (!(await saveAISettings())) { setAIBusy(''); return; }
    const result = await studio.testAIModel();
    setAIBusy('');
    setAIStatus(result.ok
      ? { type: 'success', text: `${result.model} 可用 · ${result.latencyMs} ms · ${result.response}` }
      : { type: 'error', text: result.error });
  };

  const translateTagIds = async (ids) => {
    const targets = tags.filter((tag) => ids.includes(tag.id)).slice(0, 50);
    if (!targets.length) return;
    setTranslatingIds((current) => new Set([...current, ...targets.map((tag) => tag.id)]));
    setAIStatus({ type: 'progress', text: `正在整理 ${targets.length} 个 Tag：先查本地词典，再补翻译与分类…` });
    const result = await studio.translateTags(targets.map((tag) => tag.tag));
    setTranslatingIds((current) => {
      const next = new Set(current);
      targets.forEach((tag) => next.delete(tag.id));
      return next;
    });
    if (!result.ok) { setAIStatus({ type: 'error', text: result.error }); return; }
    const organized = new Map(targets.map((tag, index) => [tag.id, result.items?.[index] || { translation: result.translations[index], category: result.categories?.[index] || tag.category }]));
    updateProject(updatePromptScope(project, scope.key, tags.map((tag) => organized.has(tag.id) ? { ...tag, ...organized.get(tag.id) } : tag)));
    const cacheText = result.cache_hits ? `，${result.cache_hits} 个命中本地词典` : '';
    setAIStatus({ type: 'success', text: `${result.model} 已完成翻译与分类${cacheText}` });
    showToast(`已整理 ${targets.length} 个 Tag${cacheText}`);
  };

  const missingTranslationIds = tags.filter((tag) => !tag.translation?.trim() || !['ai', 'manual', 'cache'].includes(tag.category_source)).map((tag) => tag.id);
  const addTags = () => {
    const created = pendingBatch.tags;
    if (!created.length) return;
    updateProject(updatePromptScope(project, scope.key, [...tags, ...created]));
    setLastBatch({ projectId: project.id, scopeKey: scope.key, ids: created.map((tag) => tag.id) });
    setNewTag('');
    const notes = [pendingBatch.duplicateCount && `${pendingBatch.duplicateCount} 个重复`, pendingBatch.syntaxIssueCount && `${pendingBatch.syntaxIssueCount} 个语法提示`].filter(Boolean);
    showToast(`已添加 ${created.length} 个 Tag${notes.length ? ` · ${notes.join(' · ')}` : ''}`);
  };
  const undoLastBatch = () => {
    if (!lastBatch || lastBatch.projectId !== project.id || lastBatch.scopeKey !== scope.key) return;
    const ids = new Set(lastBatch.ids);
    const remaining = tags.filter((tag) => !ids.has(tag.id));
    const removed = tags.length - remaining.length;
    if (!removed) { setLastBatch(null); return; }
    updateProject(updatePromptScope(project, scope.key, remaining));
    setLastBatch(null);
    showToast(`已撤销添加 ${removed} 个 Tag`);
  };
  const updateTag = (index, patch) => updateProject(updatePromptScope(project, scope.key, tags.map((tag, itemIndex) => itemIndex === index ? { ...tag, ...patch } : tag)));
  const moveTag = (sourceIndex, targetIndex) => {
    if (sourceIndex == null || sourceIndex === targetIndex || targetIndex < 0 || targetIndex >= tags.length) return;
    const reordered = [...tags];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    updateProject(updatePromptScope(project, scope.key, reordered));
  };
  const reorder = (targetIndex) => {
    moveTag(dragIndex.current, targetIndex);
    dragIndex.current = null;
    setDraggingIndex(null);
    setDropIndex(null);
  };
  const beginPointerDrag = (index, event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragIndex.current = index;
    dropIndexRef.current = index;
    setDraggingIndex(index);
  };
  const movePointerDrag = (event) => {
    if (dragIndex.current == null) return;
    const targetCard = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-tag-index]');
    if (targetCard) {
      const nextIndex = Number(targetCard.dataset.tagIndex);
      dropIndexRef.current = nextIndex;
      setDropIndex(nextIndex);
    }
    const scrollPanel = event.currentTarget.closest('.panel-scroll');
    const bounds = scrollPanel?.getBoundingClientRect();
    if (bounds && event.clientY < bounds.top + 48) scrollPanel.scrollBy({ top: -18 });
    if (bounds && event.clientY > bounds.bottom - 48) scrollPanel.scrollBy({ top: 18 });
  };
  const endPointerDrag = (event) => {
    if (dragIndex.current == null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    reorder(dropIndexRef.current);
    dropIndexRef.current = null;
  };
  const keyboardMove = (index, event) => {
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    moveTag(index, index + (event.key === 'ArrowUp' ? -1 : 1));
  };
  const addCharacter = () => {
    const next = addPromptCharacter(project);
    if (next === project) { showToast('最多支持 6 个 Character Prompt'); return; }
    const character = next.prompt_structure.characters.at(-1);
    updateProject(next);
    setScopeKey(`character:${character.id}:prompt`);
    showToast(`${character.label} 已添加`);
  };
  const deleteCharacter = () => {
    if (!scope.characterId) return;
    setScopeKey('base:prompt');
    updateProject(removePromptCharacter(project, scope.characterId));
    showToast(`${scope.character.label} 已移除`);
  };
  return <div className="panel-scroll">
    <div className="panel-intro"><div><strong>{scope.label}</strong><small>{tags.length} 个结构化标签</small></div><span className="saved-dot"><Icon name="check"/>自动保存</span></div>
    <div className="prompt-scope-toolbar">
      <select value={scope.key} onChange={(event) => setScopeKey(event.target.value)} aria-label="Prompt 区域">
        {scopes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
      </select>
      <button onClick={addCharacter} disabled={structure.characters.length >= 6}><Icon name="plus"/>角色</button>
    </div>
    {scope.kind === 'character' && <>
      <div className="character-scope-heading"><input value={scope.character.label} onChange={(event) => updateProject(updatePromptCharacter(project, scope.characterId, { label: event.target.value }))} aria-label="角色名称"/><button onClick={deleteCharacter}><Icon name="trash" size={13}/>移除角色</button></div>
      <PositionEditor project={project} character={scope.character} updateProject={updateProject}/>
    </>}
    <div className="tag-entry">
      <div className="add-tag">
        <textarea rows="1" value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          addTags();
        }} placeholder="输入多个 Tag，用中英文逗号分隔" aria-label="添加一个或多个 Tag" aria-describedby={newTag || lastBatch ? 'tag-entry-status' : undefined}/>
        <button onClick={addTags} disabled={!pendingBatch.tags.length} aria-label={`添加 ${pendingBatch.tags.length || 0} 个 Tag`}><Icon name="plus"/><span>{pendingBatch.tags.length > 1 ? pendingBatch.tags.length : ''}</span></button>
      </div>
      {(newTag || lastBatch) && <div className="tag-entry-status" id="tag-entry-status" aria-live="polite">
        {newTag && <span>{pendingBatch.tags.length ? `将添加 ${pendingBatch.tags.length} 个到「${scope.label}」` : '没有可添加的 Tag'}{pendingBatch.duplicateCount ? ` · ${pendingBatch.duplicateCount} 个重复` : ''}{pendingBatch.syntaxIssueCount ? ` · ${pendingBatch.syntaxIssueCount} 个语法提示` : ''}</span>}
        {lastBatch && lastBatch.projectId === project.id && lastBatch.scopeKey === scope.key && <button onClick={undoLastBatch}>撤销上次添加</button>}
      </div>}
    </div>
    <section className={`ai-channel ${showAISettings ? 'expanded' : ''}`}>
      <div className="ai-channel-bar">
        <span className="ai-signal"><Icon name="spark"/><i/></span>
        <span className="ai-channel-copy"><b>{aiSettings.model || 'AI 整理未配置'}</b><small>{aiSettings.model ? '翻译 · 分类 · 本地复用' : '配置 API 后可翻译并分类'}</small></span>
        <button className="translate-missing" disabled={!missingTranslationIds.length || translatingIds.size > 0} onClick={() => translateTagIds(missingTranslationIds)}>{translatingIds.size ? '整理中' : `AI 整理 ${missingTranslationIds.length}`}</button>
        <button className="ai-settings-toggle" onClick={() => setShowAISettings((value) => !value)} aria-label="AI 整理设置"><Icon name="settings"/></button>
      </div>
      {showAISettings && <div className="ai-config">
        <label><span>API Base URL</span><input value={aiSettings.baseUrl} onChange={(event) => setAISettings((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.openai.com/v1"/></label>
        <label><span>API Key <em>{aiSettings.hasApiKey ? '已加密保存' : '未保存'}</em></span><div className="secret-input"><input type="password" value={aiSettings.apiKey} onChange={(event) => setAISettings((current) => ({ ...current, apiKey: event.target.value }))} placeholder={aiSettings.hasApiKey ? '留空则保留现有 Key' : 'sk-…'}/><button onClick={saveAISettings}>保存</button></div></label>
        <label><span>Model</span><div className="model-input"><input list="ai-model-list" value={aiSettings.model} onChange={(event) => setAISettings((current) => ({ ...current, model: event.target.value }))} placeholder="读取或输入模型 ID"/><datalist id="ai-model-list">{models.map((model) => <option key={model} value={model}/>)}</datalist><button onClick={loadModels} disabled={aiBusy === 'models'} title="读取模型列表"><Icon name="refresh"/></button></div></label>
        <div className="ai-config-actions"><button className="outline" onClick={testAIModel} disabled={Boolean(aiBusy)}>{aiBusy === 'test' ? '测试中…' : '测试模型'}</button><small>仅未缓存的 Tag 会发送到此 Base URL</small></div>
      </div>}
      {aiStatus && <div className={`ai-status ${aiStatus.type}`}>{aiStatus.text}</div>}
    </section>
    <div className="category-legend">{CATEGORY_OPTIONS.filter((category) => category !== 'Unsorted').map((category) => <span key={category} className={`cat-${category.toLowerCase()}`}>{CATEGORY_LABELS[category]}<b>{tags.filter((tag) => tag.category === category).length}</b></span>)}</div>
    <div className="tag-stack">
      {tags.map((tag, index) => <TagCard key={tag.id} tag={tag} index={index} translating={translatingIds.has(tag.id)} dragging={draggingIndex === index} dropTarget={dropIndex === index && draggingIndex !== index} onTranslate={() => translateTagIds([tag.id])} onChange={(patch) => updateTag(index, patch)} onDelete={() => updateProject(updatePromptScope(project, scope.key, tags.filter((_, itemIndex) => itemIndex !== index)))} onPointerStart={beginPointerDrag} onPointerMove={movePointerDrag} onPointerEnd={endPointerDrag} onKeyboardMove={keyboardMove}/>)}
      {!tags.length && <div className="panel-empty"><Icon name="layers"/><strong>这里还没有 Tag</strong><span>从含 NovelAI V4 metadata 的图片自动恢复，或在上方逐个添加。</span></div>}
    </div>
  </div>;
}

function VibePanel({ project, updateProject, showToast }) {
  const [library, setLibrary] = useState([]);
  const [importing, setImporting] = useState(false);
  const [embeddedStatus, setEmbeddedStatus] = useState(null);
  const [resolving, setResolving] = useState('');
  useEffect(() => { studio.loadVibeLibrary().then(setLibrary); }, []);
  useEffect(() => {
    let active = true;
    studio.inspectEmbeddedVibes(project).then((status) => { if (active) setEmbeddedStatus(status); });
    return () => { active = false; };
  }, [project.id]);
  const libraryGroups = useMemo(() => groupVibeLibraryBySource(library), [library]);

  const importVibes = async (retryEmbedded = false) => {
    setImporting(true);
    try {
      const result = await studio.importVibeLibrary();
      if (result.canceled) return;
      setLibrary(result.library || []);
      const importedLibrary = new Map((result.library || []).map((entry) => [entry.id, entry]));
      const enrichedVibes = project.vibes.map((vibe) => {
        const entry = importedLibrary.get(vibe.library_id);
        return entry ? {
          ...vibe,
          ...entry,
          id: vibe.id,
          library_id: vibe.library_id,
          strength: vibe.strength,
          information_extracted: vibe.information_extracted,
          information_extracted_known: vibe.information_extracted_known,
          information_extracted_dirty: vibe.information_extracted_dirty,
          information_extracted_origin: vibe.information_extracted_origin,
          enabled: vibe.enabled,
        } : vibe;
      });
      let nextProject = { ...project, vibes: enrichedVibes };
      const resolved = await studio.resolveEmbeddedVibes(nextProject, 'retry');
      if (!resolved.ok) throw new Error(resolved.error || '无法重新匹配 PNG 中的 Vibe');
      if (resolved.ok) {
        nextProject = resolved.project;
        setEmbeddedStatus(resolved.status);
        setLibrary(resolved.library || result.library || []);
      }
      if (enrichedVibes.some((vibe, index) => vibe.information_extracted_known !== project.vibes[index].information_extracted_known
        || vibe.name !== project.vibes[index].name || vibe.source_kind !== project.vibes[index].source_kind
        || vibe.vibe_file !== project.vibes[index].vibe_file || vibe.reference_image !== project.vibes[index].reference_image
        || vibe.encoded_values_json !== project.vibes[index].encoded_values_json)
        || resolved.linked) {
        updateProject(nextProject);
      }
      if (result.imported?.length) showToast(`已导入 ${result.imported.length} 个 Vibe`);
      if (result.errors?.length) showToast(`${result.errors.length} 个文件未能导入`);
      if (retryEmbedded && resolved.ok && !resolved.linked && resolved.status?.missing?.length) showToast('仍未找到对应 Vibe；可以从 PNG metadata 提取');
    } catch (error) {
      showToast(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setImporting(false);
    }
  };

  const resolveEmbedded = async (mode) => {
    setResolving(mode);
    try {
      const result = await studio.resolveEmbeddedVibes(project, mode);
      if (!result.ok) { showToast(result.error || 'Vibe 处理失败'); return; }
      setLibrary(result.library || []);
      setEmbeddedStatus(result.status);
      if (result.linked || result.extracted) updateProject(result.project);
      showToast(mode === 'extract'
        ? `已从 PNG metadata 提取 ${result.extracted} 个 Vibe`
        : result.linked ? `已匹配 ${result.linked} 个 Vibe` : '库中仍没有对应 Vibe');
    } catch (error) {
      showToast(`Vibe 处理失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setResolving('');
    }
  };

  const useLibraryVibe = async (entry) => {
    if (project.vibes.some((vibe) => vibe.library_id === entry.id)) {
      showToast('这个 Vibe 已在当前作品中');
      return;
    }
    const vibe = await studio.useVibeFromLibrary(entry);
    updateProject({ ...project, vibes: [...project.vibes, vibe] });
    showToast(`${entry.name} 已加入当前作品`);
  };
  const updateVibe = (index, patch) => updateProject({ ...project, vibes: project.vibes.map((vibe, itemIndex) => itemIndex === index ? { ...vibe, ...patch } : vibe) });
  return <div className="panel-scroll vibe-panel">
    <div className="panel-intro"><div><strong>Vibe Library</strong><small>跨作品复用已编码的 NovelAI Vibe</small></div><button className="small-primary" onClick={() => importVibes(false)} disabled={importing}><Icon name="plus"/>{importing ? '导入中' : '导入'}</button></div>
    <div className="vibe-note safe"><span>ENCODING SAFE</span>滑杆可自由预览参数；只有标记过的缓存位置能继续使用当前 `.naiv4vibe`。</div>
    {embeddedStatus?.missing?.length > 0 && <section className="embedded-vibe-recovery">
      <div className="recovery-heading"><Icon name="spark"/><span><strong>PNG 中发现 {embeddedStatus.missing.length} 个未匹配 Vibe</strong><small>库中没有对应编码，是否提取由你决定。</small></span></div>
      <p>优先上传 NovelAI 保存的原始 `.naiv4vibe`；也可以从当前 PNG metadata 提取 encoding-only 文件。提取不会联网或消耗 Anlas，但通常不含源参考图。</p>
      <div><button className="outline" onClick={() => importVibes(true)} disabled={importing || Boolean(resolving)}><Icon name="plus"/>上传后重试</button><button className="extract-action" onClick={() => resolveEmbedded('extract')} disabled={importing || Boolean(resolving)}><Icon name="spark"/>{resolving === 'extract' ? '提取中…' : '从 PNG 提取'}</button></div>
    </section>}
    <div className="vibe-section-heading"><span>当前作品</span><b>{project.vibes.length}</b></div>
    <div className="vibe-stack">
      {project.vibes.map((vibe, index) => {
        const informationState = informationExtractedState(vibe);
        return <article className={`vibe-card ${!vibe.enabled ? 'disabled' : ''}`} key={vibe.id}>
        <div className="vibe-image"><img src={mediaUrl(vibe.thumbnail_path)} alt="Vibe reference"/><label><input type="checkbox" checked={Boolean(vibe.enabled)} onChange={(event) => updateVibe(index, { enabled: event.target.checked })}/><span>{vibe.enabled ? '启用' : '停用'}</span></label></div>
        <div className="vibe-controls">
          <div className="vibe-card-title"><strong>{vibe.name || 'Vibe reference'}</strong><span className={`vibe-source ${vibe.source_kind}`}>{vibe.source_kind === 'image' ? '待编码' : '已编码'}</span></div>
          <label><span>Reference Strength <b>{Number(vibe.strength).toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" value={vibe.strength} onChange={(event) => updateVibe(index, { strength: Number(event.target.value) })}/></label>
          <InformationExtractedControl vibe={vibe} onChange={(patch) => updateVibe(index, patch)}/>
          {vibe.reference_image
            ? <button className="vibe-file-action source-image" onClick={() => studio.revealFile(vibe.reference_image)}><Icon name="image" size={13}/>打开源图所在文件夹</button>
            : <div className="vibe-source-warning"><Icon name="info" size={13}/><span>缺少源 PNG；编码仍可复用，但无法查看图源</span></div>}
          {vibe.vibe_file && <button className={`vibe-file-action ${informationState.fileUsable ? '' : 'unavailable'}`} disabled={!informationState.fileUsable} title={informationState.fileUsable ? '在文件夹中显示当前 Vibe 文件' : '当前 Information Extracted 尚未计算，此文件与所选参数不匹配'} onClick={() => studio.revealFile(vibe.vibe_file)}><Icon name="folder" size={13}/>{informationState.fileUsable ? '显示 .naiv4vibe 文件' : '.naiv4vibe 当前参数不可用'}</button>}
          <button className="text-danger" onClick={() => updateProject({ ...project, vibes: project.vibes.filter((_, itemIndex) => itemIndex !== index) })}><Icon name="trash"/>移除参考图</button>
        </div>
      </article>;})}
      {!project.vibes.length && <div className="panel-empty"><Icon name="image"/><strong>当前作品还没有 Vibe</strong><span>从下面的 Vibe 库加入，或导入 `.naiv4vibe` 与参考图。</span></div>}
    </div>
    <div className="vibe-section-heading library-heading"><span>Vibe 库</span><b>{library.length}</b><small>{libraryGroups.length} 个图源组</small></div>
    <div className="vibe-library-list">
      {libraryGroups.map((group) => <section className={`vibe-source-group ${group.source.reference_image ? '' : 'missing-source'}`} key={group.key}>
        <header>
          <img src={mediaUrl(group.source.thumbnail_path)} alt="Vibe 源图"/>
          <div><strong>{group.source.name}</strong><small>{group.entries.length} 个参数版本 · {group.source.reference_image ? '已绑定源图' : '缺少源 PNG'}</small></div>
          {group.source.reference_image && <button onClick={() => studio.revealFile(group.source.reference_image)} title="打开源图所在文件夹"><Icon name="folder" size={14}/></button>}
        </header>
        {!group.source.reference_image && <div className="vibe-group-warning"><Icon name="info" size={13}/>导入原始 PNG 或带内嵌图片的 `.naiv4vibe` 后可建立可视绑定</div>}
        <div className="vibe-variant-list">
          {group.entries.map((entry) => <article className="vibe-library-card" key={entry.id}>
            <div><strong>{entry.source_kind === 'image' ? '原始参考图' : entry.name}</strong><small>{entry.source_kind === 'image' ? '尚未编码' : `${entry.encoding_count || 1} 个缓存编码 · ${entry.model || 'NovelAI V4'}`}</small><span>{entry.information_extracted_known ? `Information ${Number(entry.information_extracted).toFixed(2)} · Strength ${Number(entry.strength).toFixed(2)}` : '来自 PNG metadata · 固定编码'}</span></div>
            <button onClick={() => useLibraryVibe(entry)} disabled={project.vibes.some((vibe) => vibe.library_id === entry.id)}>{project.vibes.some((vibe) => vibe.library_id === entry.id) ? '已用' : '使用'}</button>
          </article>)}
        </div>
      </section>)}
      {!library.length && <button className="vibe-library-empty" onClick={() => importVibes(false)}><Icon name="plus"/><span><strong>建立 Vibe 库</strong><small>导入 `.naiv4vibe` 可直接复用缓存编码，不必重新计算。</small></span></button>}
    </div>
  </div>;
}

function MetadataPanel({ project, updateProject }) {
  const metadata = project.metadata;
  const limitedReproduction = hasLimitedReproduction(metadata);
  const update = (patch) => updateProject({ ...project, metadata: { ...metadata, ...patch } });
  return <div className="panel-scroll metadata-panel">
    <div className="panel-intro"><div><strong>Generation Metadata</strong><small>从原图读取；修改后会自动创建分支</small></div><span className={`metadata-badge ${limitedReproduction ? 'limited' : ''}`}>{limitedReproduction ? 'INPAINT' : 'PNG'}</span></div>
    {limitedReproduction && <div className="reproduction-notice" role="status">
      <Icon name="info" size={15}/>
      <div><strong>局部重绘 · 无法精确复现</strong><p>Metadata 包含最终 Prompt 和部分生成参数，但不包含完整的原始底图与蒙版。你仍然可以复制 Prompt，或基于现有参数创建近似方案。</p></div>
    </div>}
    <div className="metadata-grid">
      <label className="wide"><span>Model</span><input value={metadata.model || ''} onChange={(event) => update({ model: event.target.value })} placeholder="NovelAI Diffusion V4.5"/></label>
      <label><span>Seed</span><input value={metadata.seed || ''} onChange={(event) => update({ seed: event.target.value })} placeholder="—"/></label>
      <label><span>Steps</span><input type="number" value={metadata.steps ?? ''} onChange={(event) => update({ steps: event.target.value })} placeholder="—"/></label>
      <label><span>Sampler</span><input value={metadata.sampler || ''} onChange={(event) => update({ sampler: event.target.value })} placeholder="—"/></label>
      <label><span>Guidance / CFG</span><input type="number" step="0.1" value={metadata.guidance ?? ''} onChange={(event) => update({ guidance: event.target.value })} placeholder="—"/></label>
    </div>
    <label className="textarea-label"><span>Base Undesired Content · 在 Prompt 面板编辑</span><textarea value={formatPrompt(project.prompt_structure.base_undesired_tags)} readOnly placeholder="未检测到 Undesired Content"/></label>
    <details className="raw-metadata"><summary>查看原始 metadata</summary><pre>{metadata.extra_json || '{}'}</pre></details>
  </div>;
}

function Inspector({ tab, setTab, project, branch, updateProject, showToast, promptScopeKey, setPromptScopeKey, focusTagId }) {
  return <aside className="inspector">
    <nav className="inspector-tabs">
      <button className={tab === 'tags' ? 'active' : ''} onClick={() => setTab('tags')}><Icon name="layers"/>Prompt</button>
      <button className={tab === 'vibe' ? 'active' : ''} onClick={() => setTab('vibe')}><Icon name="image"/>Vibe <i>{project.vibes.length || ''}</i></button>
      <button className={tab === 'metadata' ? 'active' : ''} onClick={() => setTab('metadata')}><Icon name="info"/>参数</button>
    </nav>
    <div className={`generation-context ${branch ? 'branch' : 'result'}`}>
      <Icon name={branch ? 'spark' : 'lock'} size={14}/>
      <div><strong>{branch ? branch.name : '原图生成结果'}</strong><small>{branch ? `${BRANCH_STATUS_LABELS[branch.status] || branch.status} · 改动保存在这个分支中` : '生成事实已锁定；修改 Prompt、Vibe 或参数会新建分支'}</small></div>
    </div>
    {tab === 'tags' && <TagsPanel project={project} updateProject={updateProject} showToast={showToast} scopeKey={promptScopeKey} setScopeKey={setPromptScopeKey} focusTagId={focusTagId}/>}
    {tab === 'vibe' && <VibePanel project={project} updateProject={updateProject} showToast={showToast}/>}
    {tab === 'metadata' && <MetadataPanel project={project} updateProject={updateProject}/>}
  </aside>;
}

export default function App() {
  const [projects, setProjects] = useState([]);
  const [collections, setCollections] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState('');
  const [libraryView, setLibraryView] = useState('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dragState, setDragState] = useState({ active: false, valid: false, count: 0, label: '图片' });
  const [importProgress, setImportProgress] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [tab, setTab] = useState('tags');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeBranchId, setActiveBranchId] = useState('');
  const [workspaceMode, setWorkspaceMode] = useState('image');
  const [overviewCopy, setOverviewCopy] = useState({ text: '', count: 0, selected: false, categoryCount: 0 });
  const [promptScopeKey, setPromptScopeKey] = useState('base:prompt');
  const [focusTagId, setFocusTagId] = useState(null);
  const saveTimers = useRef(new Map());
  const branchSaveTimers = useRef(new Map());
  const branchCreatePromises = useRef(new Map());
  const appShellRef = useRef(null);
  const dropFilesHandlerRef = useRef(null);
  const shortcutModifier = useMemo(() => navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl', []);

  useEffect(() => {
    Promise.all([studio.loadLibrary(), studio.loadLibraryOrganization()]).then(([items, organization]) => {
      const organizationByProject = new Map((organization.projects || []).map((project) => [project.id, project]));
      const repairedItems = items.map((project) => {
        const tags = repairLegacyPromptTags(project.tags, project.metadata.prompt_raw);
        const promptStructure = normalizePromptStructure(project.prompt_structure, project.metadata);
        const repaired = syncProjectPromptMetadata({ ...project, ...organizationByProject.get(project.id), tags, prompt_structure: promptStructure });
        return repaired;
      });
      setProjects(repairedItems);
      setCollections(organization.collections || []);
      setActiveId(repairedItems.find((project) => !project.deleted_at)?.id || null);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    studio.onImportProgress((progress) => setImportProgress(progress));
    return () => studio.offImportProgress();
  }, []);

  useEffect(() => {
    if (loading || !appShellRef.current) return undefined;
    const element = appShellRef.current;
    const cleanupMonitor = monitorForExternal({
      canMonitor: containsFiles,
      onDragStart: () => preventUnhandled.start(),
      onDrop: () => setDragState((current) => ({ ...current, active: false })),
    });
    const cleanupTarget = dropTargetForExternal({
      element,
      canDrop: containsFiles,
      onDragEnter: ({ source }) => setDragState({ active: true, ...assessDroppedFiles(getFiles({ source })) }),
      onDrag: ({ source }) => setDragState({ active: true, ...assessDroppedFiles(getFiles({ source })) }),
      onDragLeave: () => setDragState((current) => ({ ...current, active: false })),
      onDrop: ({ source }) => {
        const files = getFiles({ source });
        setDragState((current) => ({ ...current, active: false }));
        if (files.length) dropFilesHandlerRef.current?.(files);
      },
    });
    return () => { cleanupTarget(); cleanupMonitor(); };
  }, [loading]);

  useEffect(() => {
    const keydown = (event) => {
      const commandKey = event.metaKey || event.ctrlKey;
      if (commandKey && event.key.toLowerCase() === 'i') { event.preventDefault(); importImages(); }
      if (commandKey && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('.search-box input')?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const sourceProject = projects.find((project) => project.id === activeId) || null;
  const activeBranch = sourceProject?.branches?.find((branch) => branch.id === activeBranchId) || null;
  const activeProject = sourceProject && activeBranch
    ? applyGenerationSnapshot(sourceProject, parseBranchSnapshot(activeBranch))
    : sourceProject;

  useEffect(() => {
    if (!activeBranchId || sourceProject?.branches?.some((branch) => branch.id === activeBranchId)) return;
    setActiveBranchId('');
  }, [activeBranchId, sourceProject]);

  useEffect(() => {
    if (workspaceMode !== 'prompt') setOverviewCopy({ text: '', count: 0, selected: false, categoryCount: 0 });
  }, [activeId, workspaceMode]);
  const filteredProjects = useMemo(() => {
    const viewProjects = projects.filter((project) => {
      if (libraryView === 'trash') return Boolean(project.deleted_at);
      if (project.deleted_at) return false;
      if (libraryView === 'favorites') return Boolean(project.is_favorite);
      if (libraryView === 'ungrouped') return !(project.collection_ids || []).length;
      if (libraryView.startsWith('collection:')) return (project.collection_ids || []).includes(libraryView.slice('collection:'.length));
      return true;
    });
    const needles = expandSearch(query);
    if (!needles.length) return viewProjects;
    return viewProjects.filter((project) => [project.name, ...allPromptTags(project).flatMap((tag) => [tag.tag, tag.translation, tag.category, CATEGORY_LABELS[tag.category]])].some((value) => needles.some((needle) => normalizeSearch(value).includes(needle))));
  }, [projects, query, libraryView]);

  useEffect(() => {
    if (activeId && filteredProjects.some((project) => project.id === activeId)) return;
    setActiveId(filteredProjects[0]?.id || null);
  }, [activeId, filteredProjects]);

  useEffect(() => {
    const visibleIds = new Set(filteredProjects.map((project) => project.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [filteredProjects]);

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(''), 2200);
  };

  const applyLibraryOrganization = (organization) => {
    const byProject = new Map((organization.projects || []).map((project) => [project.id, project]));
    setProjects((current) => current.map((project) => byProject.has(project.id) ? { ...project, ...byProject.get(project.id) } : project));
    setCollections(organization.collections || []);
  };

  const runLibraryOrganization = async (action, successMessage) => {
    try {
      const result = await action();
      if (!result?.ok) { showToast(result?.error || '操作没有完成'); return false; }
      applyLibraryOrganization(result);
      if (successMessage) showToast(successMessage);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
      return false;
    }
  };

  const changeLibraryView = (view) => {
    setLibraryView(view);
    setSelectedIds(new Set());
  };

  const toggleSelected = (projectId) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    return next;
  });

  const toggleSelectAll = () => setSelectedIds((current) => {
    const visibleIds = filteredProjects.map((project) => project.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => current.has(id));
    if (allSelected) return new Set([...current].filter((id) => !visibleIds.includes(id)));
    return new Set([...current, ...visibleIds]);
  });

  const createCollection = (name) => runLibraryOrganization(() => studio.createCollection(name), `已创建收藏集「${name.trim()}」`);
  const renameCollection = (id, name) => runLibraryOrganization(() => studio.renameCollection(id, name), '收藏集已重命名');
  const deleteCollection = async (id) => {
    const success = await runLibraryOrganization(() => studio.deleteCollection(id), '收藏集已删除，作品仍保留在库中');
    if (success && libraryView === `collection:${id}`) changeLibraryView('all');
    return success;
  };
  const addSelectedToCollection = async (collectionId) => {
    if (!collectionId || !selectedIds.size) return false;
    const success = await runLibraryOrganization(
      () => studio.addProjectsToCollection(collectionId, [...selectedIds]),
      `已把 ${selectedIds.size} 个作品加入收藏集`,
    );
    if (success) setSelectedIds(new Set());
    return success;
  };
  const removeSelectedFromCollection = async (collectionId) => {
    if (!collectionId || !selectedIds.size) return false;
    const success = await runLibraryOrganization(
      () => studio.removeProjectsFromCollection(collectionId, [...selectedIds]),
      `已从当前收藏集移出 ${selectedIds.size} 个作品`,
    );
    if (success) setSelectedIds(new Set());
    return success;
  };
  const setFavorite = async (favorite, projectIds = [...selectedIds]) => {
    if (!projectIds.length) return false;
    const success = await runLibraryOrganization(
      () => studio.setProjectsFavorite(projectIds, favorite),
      favorite ? `已收藏 ${projectIds.length} 个作品` : `已取消收藏 ${projectIds.length} 个作品`,
    );
    if (success && projectIds.length > 1) setSelectedIds(new Set());
    return success;
  };
  const setDeleted = async (deleted) => {
    const projectIds = [...selectedIds];
    if (!projectIds.length) return false;
    const success = await runLibraryOrganization(
      () => studio.setProjectsDeleted(projectIds, deleted),
      deleted ? `已将 ${projectIds.length} 个作品移入回收站` : `已恢复 ${projectIds.length} 个作品`,
    );
    if (success) setSelectedIds(new Set());
    return success;
  };

  const currentImportCollectionId = libraryView.startsWith('collection:') ? libraryView.slice('collection:'.length) : '';
  const importing = importProgress && ['preparing', 'importing'].includes(importProgress.phase);

  const finishImport = (result, collectionId = '') => {
    if (result?.canceled) {
      setImportProgress(null);
      return;
    }
    const imported = result?.imported || [];
    setImportResult(result);
    setImportProgress(null);
    if (!imported.length) {
      if (result?.summary?.cancelled) showToast('导入已停止，已完成的作品会保留');
      else if (result?.errors?.length) showToast('没有导入作品，请查看导入摘要');
      else if (result?.duplicates?.length) showToast('图片已经在作品库中');
      return;
    }
    setProjects((current) => {
      const importedIds = new Set(imported.map((project) => project.id));
      return [...imported, ...current.filter((project) => !importedIds.has(project.id))];
    });
    setActiveId(imported[0].id);
    setActiveBranchId('');
    if (!collectionId) setLibraryView('all');
    setSelectedIds(new Set());
    setWorkspaceMode('image');
    setPromptScopeKey('base:prompt');
    const limitedCount = imported.filter((project) => hasLimitedReproduction(project.metadata)).length;
    const duplicateText = result.duplicates?.length ? ` · 跳过 ${result.duplicates.length} 个重复` : '';
    showToast(limitedCount ? `已导入 ${imported.length} 个作品 · ${limitedCount} 张局部重绘已标记${duplicateText}` : `已导入 ${imported.length} 个作品${duplicateText}`);
  };

  const runImport = async (action, collectionId = currentImportCollectionId) => {
    if (importing) { showToast('当前导入尚未完成'); return; }
    setImportResult(null);
    setImportProgress({ phase: 'preparing', prepared: 0, sourceCount: 0, current: '读取文件…' });
    try {
      finishImport(await action({ collectionId }), collectionId);
    } catch (error) {
      finishImport({
        ok: false,
        imported: [],
        duplicates: [],
        errors: [{ file: '导入批次', error: error instanceof Error ? error.message : String(error) }],
        summary: { total: 0, processed: 0, imported: 0, duplicates: 0, failed: 1, skipped: 0, remaining: 0, cancelled: false },
      }, collectionId);
    }
  };

  const importImages = () => runImport((options) => studio.importImages(options));
  const importDroppedFiles = (files) => runImport((options) => studio.importDroppedFiles(files, options));
  dropFilesHandlerRef.current = importDroppedFiles;

  const replaceBranch = (branch) => setProjects((current) => current.map((project) => project.id === branch.source_project_id
    ? { ...project, branches: (project.branches || []).map((item) => item.id === branch.id ? branch : item) }
    : project));

  const persistBranchSoon = (branch) => {
    window.clearTimeout(branchSaveTimers.current.get(branch.id));
    branchSaveTimers.current.set(branch.id, window.setTimeout(async () => {
      const creation = branchCreatePromises.current.get(branch.id);
      if (creation && !(await creation)?.ok) return;
      const result = await studio.updateBranch(branch);
      if (!result?.ok) showToast(result?.error || '分支草稿保存失败');
      branchSaveTimers.current.delete(branch.id);
    }, 450));
  };

  const createDraftBranch = (candidate, parentBranchId = null) => {
    if (!sourceProject) return;
    const now = new Date().toISOString();
    const branch = {
      id: crypto.randomUUID(),
      source_project_id: sourceProject.id,
      parent_branch_id: parentBranchId,
      name: `分支 ${(sourceProject.branches || []).length + 1}`,
      status: 'draft',
      snapshot_json: JSON.stringify(generationSnapshot(syncProjectPromptMetadata(candidate))),
      change_summary: branchChangeSummary(sourceProject, candidate),
      created_at: now,
      updated_at: now,
    };
    setProjects((current) => current.map((project) => project.id === sourceProject.id
      ? { ...project, branches: [branch, ...(project.branches || [])] }
      : project));
    setActiveBranchId(branch.id);
    const creation = studio.createBranch(branch).then((result) => {
      if (result?.ok) return result;
      window.clearTimeout(branchSaveTimers.current.get(branch.id));
      branchSaveTimers.current.delete(branch.id);
      setProjects((current) => current.map((project) => project.id === sourceProject.id
        ? { ...project, branches: (project.branches || []).filter((item) => item.id !== branch.id) }
        : project));
      setActiveBranchId('');
      showToast(result?.error || '分支草稿创建失败');
      return result;
    }).catch((error) => {
      window.clearTimeout(branchSaveTimers.current.get(branch.id));
      branchSaveTimers.current.delete(branch.id);
      setProjects((current) => current.map((project) => project.id === sourceProject.id
        ? { ...project, branches: (project.branches || []).filter((item) => item.id !== branch.id) }
        : project));
      setActiveBranchId('');
      showToast(error instanceof Error ? error.message : String(error));
      return { ok: false };
    });
    branchCreatePromises.current.set(branch.id, creation);
    creation.finally(() => branchCreatePromises.current.delete(branch.id));
    showToast('已创建分支草稿；原图信息保持不变');
  };

  const updateProject = (nextProject) => {
    if (!sourceProject) return;
    const updated = {
      ...syncProjectPromptMetadata(nextProject),
      updated_at: new Date().toISOString(),
    };

    if (!activeBranch) {
      if (hasGenerationChanges(sourceProject, updated)) {
        createDraftBranch(updated);
        return;
      }
      const sourceUpdate = { ...updated, branches: sourceProject.branches || [] };
      setProjects((current) => current.map((project) => project.id === sourceUpdate.id ? sourceUpdate : project));
      window.clearTimeout(saveTimers.current.get(sourceUpdate.id));
      saveTimers.current.set(sourceUpdate.id, window.setTimeout(async () => {
        const result = await studio.updateProject(sourceUpdate);
        if (!result?.ok) showToast(result?.error || '作品注释保存失败');
        saveTimers.current.delete(sourceUpdate.id);
      }, 450));
      return;
    }

    if (activeBranch.status !== 'draft') {
      createDraftBranch(updated, activeBranch.id);
      return;
    }
    const branch = {
      ...activeBranch,
      snapshot_json: JSON.stringify(generationSnapshot(updated)),
      change_summary: branchChangeSummary(sourceProject, updated),
      updated_at: updated.updated_at,
    };
    replaceBranch(branch);
    persistBranchSoon(branch);
  };

  const discardBranch = async (branchId) => {
    const branch = sourceProject?.branches?.find((item) => item.id === branchId);
    if (!branch || branch.status !== 'draft') return;
    window.clearTimeout(branchSaveTimers.current.get(branch.id));
    const creation = branchCreatePromises.current.get(branch.id);
    if (creation && !(await creation)?.ok) return;
    const result = await studio.deleteBranch(branch.id);
    if (!result?.ok) { showToast(result?.error || '无法放弃这个分支'); return; }
    setProjects((current) => current.map((project) => project.id === branch.source_project_id
      ? { ...project, branches: (project.branches || []).filter((item) => item.id !== branch.id) }
      : project));
    setActiveBranchId('');
    showToast('分支草稿已放弃，原图未受影响');
  };

  const markBranchWaiting = async (branchId) => {
    const branch = sourceProject?.branches?.find((item) => item.id === branchId);
    if (!branch || branch.status !== 'draft') return;
    window.clearTimeout(branchSaveTimers.current.get(branch.id));
    const nextBranch = { ...branch, status: 'waiting', updated_at: new Date().toISOString() };
    const creation = branchCreatePromises.current.get(branch.id);
    if (creation && !(await creation)?.ok) return;
    const result = await studio.updateBranch(nextBranch);
    if (!result?.ok) { showToast(result?.error || '分支状态保存失败'); return; }
    replaceBranch(nextBranch);
    showToast('已标记为待生成；可在 NovelAI 出图后回到这里关联结果');
  };

  const copyOverviewText = async (text, count, selected = false) => {
    if (!text || !count) {
      showToast('当前没有可复制的 Tag');
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast(selected ? `已复制 ${count} 个已选 Tag` : `已复制 ${count} 个可见 Tag`);
  };

  const copyPrompt = async () => {
    if (workspaceMode === 'prompt') {
      await copyOverviewText(overviewCopy.text, overviewCopy.count, overviewCopy.selected);
      return;
    }
    await navigator.clipboard.writeText(formatPositivePromptForCopy(activeProject));
    showToast('Prompt 已复制，可直接粘贴到 NovelAI');
  };

  const useLegacyVersion = (version) => {
    try {
      createDraftBranch(restorePromptSnapshot(sourceProject, JSON.parse(version.snapshot_json)));
    } catch {
      showToast('这个旧版本无法读取');
    }
  };

  const openPromptOverview = (projectId) => {
    setActiveId(projectId);
    setActiveBranchId('');
    setWorkspaceMode('prompt');
  };

  const openTagEditor = (scopeKey, tagId) => {
    setWorkspaceMode('prompt');
    setTab('tags');
    if (scopeKey) setPromptScopeKey(scopeKey);
    setFocusTagId(null);
    if (tagId) requestAnimationFrame(() => setFocusTagId(tagId));
  };

  if (loading) return <div className="loading-screen"><div className="brand-symbol">N<span>4</span></div><span>正在打开本地资料库…</span></div>;

  return <div className="app-shell" ref={appShellRef}>
    <LibraryPanel
      projects={filteredProjects}
      allProjects={projects}
      collections={collections}
      activeId={activeId}
      setActiveId={(id) => { setActiveId(id); setActiveBranchId(''); setPromptScopeKey('base:prompt'); }}
      query={query}
      setQuery={setQuery}
      onImport={importImages}
      onOpenPromptOverview={openPromptOverview}
      shortcutModifier={shortcutModifier}
      libraryView={libraryView}
      onViewChange={changeLibraryView}
      selectionMode={selectionMode}
      setSelectionMode={setSelectionMode}
      selectedIds={selectedIds}
      onToggleSelected={toggleSelected}
      onSelectAll={toggleSelectAll}
      onClearSelection={() => setSelectedIds(new Set())}
      onCreateCollection={createCollection}
      onRenameCollection={renameCollection}
      onDeleteCollection={deleteCollection}
      onAddToCollection={addSelectedToCollection}
      onRemoveFromCollection={removeSelectedFromCollection}
      onSetFavorite={setFavorite}
      onSetDeleted={setDeleted}
    />
    {activeProject ? <>
      <PreviewStage project={activeProject} sourceProject={sourceProject} mode={workspaceMode} setMode={setWorkspaceMode} onCopy={copyPrompt} onReveal={studio.revealFile} onEditTag={openTagEditor} updateProject={updateProject} activeBranchId={activeBranchId} onSelectBranch={setActiveBranchId} onDiscardBranch={discardBranch} onMarkBranchWaiting={markBranchWaiting} onUseLegacyVersion={useLegacyVersion} overviewCopy={overviewCopy} onOverviewCopyChange={setOverviewCopy} onCopyText={copyOverviewText} onNotify={showToast}/>
      <Inspector tab={tab} setTab={setTab} project={activeProject} branch={activeBranch} updateProject={updateProject} showToast={showToast} promptScopeKey={promptScopeKey} setPromptScopeKey={setPromptScopeKey} focusTagId={focusTagId}/>
    </> : <EmptyState onImport={importImages} hasProjects={projects.length > 0}/>}
    <ImportExperience
      dragState={dragState}
      progress={importProgress}
      result={importResult}
      onCancel={() => importProgress?.batchId && studio.cancelImport(importProgress.batchId)}
      onDismiss={() => setImportResult(null)}
    />
    {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
  </div>;
}
