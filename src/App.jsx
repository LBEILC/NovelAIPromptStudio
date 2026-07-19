import { useEffect, useMemo, useRef, useState } from 'react';
import { dropTargetForExternal, monitorForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { containsFiles, getFiles } from '@atlaskit/pragmatic-drag-and-drop/external/file';
import { preventUnhandled } from '@atlaskit/pragmatic-drag-and-drop/prevent-unhandled';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { theme as antdTheme } from 'antd';
import LobeActionIcon from '@lobehub/ui/es/ActionIcon/index';
import LobeButton from '@lobehub/ui/es/Button/index';
import LobeInput from '@lobehub/ui/es/Input/Input';
import LobeInputPassword from '@lobehub/ui/es/Input/InputPassword';
import LobeSearchBar from '@lobehub/ui/es/SearchBar/index';
import LobeSelect from '@lobehub/ui/es/Select/index';
import LobeSegmented from '@lobehub/ui/es/Segmented/index';
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
import Icon from './components/Icon.jsx';
import SelectionMark from './components/SelectionMark.jsx';
import { groupVibeLibraryBySource } from './lib/vibeLibrary.js';
import { informationExtractedPatch, informationExtractedState, restoreOriginalInformationPatch } from './lib/vibes.js';
import { hasLimitedReproduction } from './lib/generationMetadata.js';
import { assessDroppedFiles } from './lib/importDrop.js';
import { applyGenerationSnapshot, branchChangeFields, branchChangeSummary, generationSnapshot, hasGenerationChanges } from './lib/branches.js';
import { contextMenuPosition, isTextEditingTarget } from './lib/contextMenu.js';
import { panCompareViewport, zoomCompareViewport } from './lib/compareViewport.js';
import { moveExperimentMember } from './lib/experiments.js';

const studio = window.studio || {
  loadLibrary: async () => [],
  showContextMenu: async () => null,
  loadLibraryOrganization: async () => ({ collections: [], series: [], projects: [] }),
  createCollection: async () => ({ ok: true, collections: [], projects: [] }),
  renameCollection: async () => ({ ok: true, collections: [], projects: [] }),
  deleteCollection: async () => ({ ok: true, collections: [], projects: [] }),
  addProjectsToCollection: async () => ({ ok: true, collections: [], projects: [] }),
  removeProjectsFromCollection: async () => ({ ok: true, collections: [], projects: [] }),
  createSeries: async () => ({ ok: true, collections: [], series: [], projects: [] }),
  renameSeries: async () => ({ ok: true, collections: [], series: [], projects: [] }),
  deleteSeries: async () => ({ ok: true, collections: [], series: [], projects: [] }),
  addProjectsToSeries: async () => ({ ok: true, collections: [], series: [], projects: [] }),
  removeProjectsFromSeries: async () => ({ ok: true, collections: [], series: [], projects: [] }),
  createExperiment: async () => ({ ok: true, collections: [], series: [], experiments: [], projects: [] }),
  renameExperiment: async () => ({ ok: true, collections: [], series: [], experiments: [], projects: [] }),
  deleteExperiment: async () => ({ ok: true, collections: [], series: [], experiments: [], projects: [] }),
  addProjectsToExperiment: async () => ({ ok: true, collections: [], series: [], experiments: [], projects: [] }),
  removeProjectsFromExperiment: async () => ({ ok: true, collections: [], series: [], experiments: [], projects: [] }),
  reorderExperimentMembers: async () => ({ ok: true, collections: [], series: [], experiments: [], projects: [] }),
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
  importBranchResult: async () => ({ ok: false, error: '请在桌面应用中上传结果图' }),
  deleteProject: async () => ({ ok: true }),
  loadVibeLibrary: async () => [],
  updateVibeLibrary: async (_id, _patch) => ({ ok: true, library: [] }),
  importVibeLibrary: async () => ({ ok: true, library: [], imported: [], errors: [] }),
  useVibeFromLibrary: async (entry) => ({ ...entry, id: crypto.randomUUID(), library_id: entry.id, enabled: true }),
  inspectEmbeddedVibes: async () => ({ total: 0, linked: 0, available: 0, missing: [] }),
  resolveEmbeddedVibes: async (project) => ({ ok: true, project, status: { total: 0, linked: 0, available: 0, missing: [] }, library: [], linked: 0, extracted: 0 }),
  revealFile: async () => {},
  getAISettings: async () => ({ baseUrl: 'https://api.openai.com/v1', model: '', hasApiKey: false, encryptionAvailable: true }),
  saveAISettings: async (settings) => ({ ...settings, hasApiKey: Boolean(settings.apiKey) }),
  getAppearanceSettings: async () => ({ themeMode: 'dark', fontScale: 'large', density: 'comfortable', motion: 'full' }),
  saveAppearanceSettings: async (settings) => settings,
  listAIModels: async () => ({ ok: false, error: '请在桌面应用中配置 API' }),
  testAIModel: async () => ({ ok: false, error: '请在桌面应用中配置 API' }),
  translateTags: async () => ({ ok: false, error: '请在桌面应用中配置 API' }),
};

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

async function showNativeContextMenu(event, request) {
  if (isTextEditingTarget(event.target)) return null;
  event.preventDefault();
  event.stopPropagation();
  return studio.showContextMenu({ ...request, ...contextMenuPosition(event) });
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
  series,
  experiments,
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
  onCreateSeries,
  onRenameSeries,
  onDeleteSeries,
  onAddToSeries,
  onRemoveFromSeries,
  onCreateExperiment,
  onRenameExperiment,
  onDeleteExperiment,
  onAddToExperiment,
  onRemoveFromExperiment,
  onSetFavorite,
  onSetDeleted,
  onProjectContextMenu,
  settingsOpen,
  onOpenSettings,
}) {
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [editingCollectionId, setEditingCollectionId] = useState('');
  const [editingCollectionName, setEditingCollectionName] = useState('');
  const [deleteArmedId, setDeleteArmedId] = useState('');
  const [batchCollectionId, setBatchCollectionId] = useState('');
  const [creatingSeries, setCreatingSeries] = useState(false);
  const [seriesName, setSeriesName] = useState('');
  const [editingSeriesId, setEditingSeriesId] = useState('');
  const [editingSeriesName, setEditingSeriesName] = useState('');
  const [deleteArmedSeriesId, setDeleteArmedSeriesId] = useState('');
  const [batchSeriesId, setBatchSeriesId] = useState('');
  const [editingExperimentId, setEditingExperimentId] = useState('');
  const [editingExperimentName, setEditingExperimentName] = useState('');
  const [deleteArmedExperimentId, setDeleteArmedExperimentId] = useState('');
  const [batchExperimentId, setBatchExperimentId] = useState('');
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
  const currentSeries = libraryView.startsWith('series:') ? series.find((entry) => `series:${entry.id}` === libraryView) : null;
  const currentExperiment = libraryView.startsWith('experiment:') ? experiments.find((entry) => `experiment:${entry.id}` === libraryView) : null;
  const currentLabel = currentCollection?.name || currentSeries?.name || currentExperiment?.name || viewItems.find((item) => item.id === libraryView)?.label || '作品库';
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
  const submitSeries = async () => {
    if (!(await onCreateSeries(seriesName))) return;
    setSeriesName('');
    setCreatingSeries(false);
  };
  const submitSeriesRename = async (id) => {
    if (!(await onRenameSeries(id, editingSeriesName))) return;
    setEditingSeriesId('');
    setEditingSeriesName('');
  };
  const submitExperimentRename = async (id) => {
    if (!(await onRenameExperiment(id, editingExperimentName))) return;
    setEditingExperimentId('');
    setEditingExperimentName('');
  };

  return <aside className="library-panel">
    <div className="brand-row">
      <div className="brand-symbol">N<span>4</span></div>
      <div><strong>Prompt Studio</strong><small>NovelAI asset desk</small></div>
    </div>
    <LobeButton block className="import-button" icon={<Icon name="plus"/>} onClick={onImport} type="primary">导入图片 <kbd>{shortcutModifier} I</kbd></LobeButton>
    <LobeSearchBar className="search-box" enableShortKey onInputChange={setQuery} placeholder="搜索当前视图…" value={query}/>
    <nav className="library-views" aria-label="作品库视图">
      {viewItems.map((item) => <LobeButton block key={item.id} className={libraryView === item.id ? 'active' : ''} icon={<Icon name={item.icon} size={14}/>} onClick={() => onViewChange(item.id)} type="text"><span>{item.label}</span><b>{item.count}</b></LobeButton>)}
    </nav>
    <div className="collection-heading"><span>收藏集</span><LobeActionIcon icon={<Icon name="plus" size={14}/>} onClick={() => { setCreatingCollection(true); setDeleteArmedId(''); }} size="small" title="新建收藏集" variant="borderless"/></div>
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
    <div className="collection-heading series-heading"><span>创作系列</span><LobeActionIcon icon={<Icon name="plus" size={14}/>} onClick={() => { setCreatingSeries(true); setDeleteArmedSeriesId(''); }} size="small" title="新建创作系列" variant="borderless"/></div>
    <div className="collection-list series-list">
      {creatingSeries && <div className="collection-editor"><input autoFocus maxLength={80} value={seriesName} onChange={(event) => setSeriesName(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) submitSeries();
        if (event.key === 'Escape') { setCreatingSeries(false); setSeriesName(''); }
      }} placeholder="系列名称"/><button onClick={submitSeries} disabled={!seriesName.trim()}><Icon name="check" size={13}/></button><button onClick={() => { setCreatingSeries(false); setSeriesName(''); }}><Icon name="close" size={13}/></button></div>}
      {series.map((entry) => <div className={`collection-row series-row ${libraryView === `series:${entry.id}` ? 'active' : ''}`} key={entry.id}>
        {editingSeriesId === entry.id
          ? <div className="collection-editor"><input autoFocus maxLength={80} value={editingSeriesName} onChange={(event) => setEditingSeriesName(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) submitSeriesRename(entry.id);
            if (event.key === 'Escape') setEditingSeriesId('');
          }}/><button onClick={() => submitSeriesRename(entry.id)} disabled={!editingSeriesName.trim()}><Icon name="check" size={13}/></button><button onClick={() => setEditingSeriesId('')}><Icon name="close" size={13}/></button></div>
          : <><button className="collection-open" onClick={() => onViewChange(`series:${entry.id}`)}><Icon name="layers" size={13}/><span>{entry.name}</span><b>{entry.project_count}</b></button><button className="collection-action" onClick={() => { setEditingSeriesId(entry.id); setEditingSeriesName(entry.name); setDeleteArmedSeriesId(''); }} aria-label={`重命名 ${entry.name}`}><Icon name="edit" size={12}/></button><button className={`collection-action delete ${deleteArmedSeriesId === entry.id ? 'armed' : ''}`} onClick={async () => {
            if (deleteArmedSeriesId !== entry.id) { setDeleteArmedSeriesId(entry.id); return; }
            if (await onDeleteSeries(entry.id)) setDeleteArmedSeriesId('');
          }} aria-label={deleteArmedSeriesId === entry.id ? `确认删除 ${entry.name}` : `删除 ${entry.name}`}>{deleteArmedSeriesId === entry.id ? '确认' : <Icon name="close" size={12}/>}</button></>}
      </div>)}
      {!series.length && !creatingSeries && <div className="collection-empty">把同一创作脉络的结果放进系列</div>}
    </div>
    <div className="collection-heading experiment-heading"><span>对比实验</span><small>控制变量</small></div>
    <div className="collection-list experiment-list">
      {experiments.map((experiment) => <div className={`collection-row experiment-row ${libraryView === `experiment:${experiment.id}` ? 'active' : ''}`} key={experiment.id}>
        {editingExperimentId === experiment.id
          ? <div className="collection-editor"><input autoFocus maxLength={80} value={editingExperimentName} onChange={(event) => setEditingExperimentName(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) submitExperimentRename(experiment.id);
            if (event.key === 'Escape') setEditingExperimentId('');
          }}/><button onClick={() => submitExperimentRename(experiment.id)} disabled={!editingExperimentName.trim()}><Icon name="check" size={13}/></button><button onClick={() => setEditingExperimentId('')}><Icon name="close" size={13}/></button></div>
          : <><button className="collection-open" onClick={() => onViewChange(`experiment:${experiment.id}`)} title={`基准：${experiment.baseline_name || '未知'} · 变化：${experiment.variable_fields?.join(' / ') || '无'}`}><Icon name="spark" size={13}/><span>{experiment.name}</span><em className={`experiment-state ${experiment.analysis_status}`}>{({ identical: '相同', single: '单变量', mixed: '混合', incomplete: '待补全' })[experiment.analysis_status] || '待分析'}</em><b>{experiment.project_count}</b></button><button className="collection-action" onClick={() => { setEditingExperimentId(experiment.id); setEditingExperimentName(experiment.name); setDeleteArmedExperimentId(''); }} aria-label={`重命名 ${experiment.name}`}><Icon name="edit" size={12}/></button><button className={`collection-action delete ${deleteArmedExperimentId === experiment.id ? 'armed' : ''}`} onClick={async () => {
            if (deleteArmedExperimentId !== experiment.id) { setDeleteArmedExperimentId(experiment.id); return; }
            if (await onDeleteExperiment(experiment.id)) setDeleteArmedExperimentId('');
          }} aria-label={deleteArmedExperimentId === experiment.id ? `确认删除 ${experiment.name}` : `删除 ${experiment.name}`}>{deleteArmedExperimentId === experiment.id ? '确认' : <Icon name="close" size={12}/>}</button></>}
      </div>)}
      {!experiments.length && <div className="collection-empty">多选至少 2 张作品，建立控制变量实验</div>}
    </div>
    <div className="section-heading library-result-heading"><span>{currentLabel}</span><b>{projects.length}</b><LobeButton className={selectionMode ? 'active' : ''} onClick={() => { setSelectionMode(!selectionMode); onClearSelection(); }} size="small" type="text">{selectionMode ? '完成' : '多选'}</LobeButton></div>
    {currentExperiment && <div className={`experiment-summary ${currentExperiment.analysis_status}`}>
      <div><span>基准</span><strong>{currentExperiment.baseline_name || '未知作品'}</strong></div>
      <div><span>固定</span><strong>{currentExperiment.fixed_fields?.join(' · ') || '暂无可靠字段'}</strong></div>
      <div><span>变化</span><strong>{currentExperiment.variable_fields?.join(' · ') || '参数相同'}</strong></div>
      {currentExperiment.analysis_status === 'mixed' && <p><Icon name="warning" size={13}/>混合变量只能用于视觉筛选，不能判断单一参数影响。</p>}
      {currentExperiment.incomplete_fields?.length > 0 && <p><Icon name="info" size={13}/>缺少 {currentExperiment.incomplete_fields.join('、')}，未把这些字段计为固定条件。</p>}
    </div>}
    {selectionMode && <div className="library-batch-toolbar">
      <div><LobeButton onClick={onSelectAll} size="small">{selectedIds.size === projects.length && projects.length ? '取消全选' : '全选'}</LobeButton><span>已选 <b>{selectedIds.size}</b></span><LobeButton disabled={!selectedIds.size} onClick={onClearSelection} size="small">清除</LobeButton></div>
      {libraryView !== 'trash' && <div><LobeSelect allowClear aria-label="目标收藏集" className="batch-select" onChange={(value) => setBatchCollectionId(value || '')} options={collections.map((collection) => ({ label: collection.name, value: collection.id }))} placeholder="加入收藏集…" size="small" value={batchCollectionId || undefined}/><LobeButton disabled={!selectedIds.size || !batchCollectionId} onClick={() => onAddToCollection(batchCollectionId)} size="small">加入</LobeButton></div>}
      {libraryView !== 'trash' && <div><LobeSelect allowClear aria-label="目标创作系列" className="batch-select" onChange={(value) => setBatchSeriesId(value || '')} options={series.map((entry) => ({ label: entry.name, value: entry.id }))} placeholder="加入创作系列…" size="small" value={batchSeriesId || undefined}/><LobeButton disabled={!selectedIds.size || !batchSeriesId} onClick={() => onAddToSeries(batchSeriesId)} size="small">加入</LobeButton></div>}
      {libraryView !== 'trash' && experiments.length > 0 && <div><LobeSelect allowClear aria-label="目标对比实验" className="batch-select" onChange={(value) => setBatchExperimentId(value || '')} options={experiments.map((experiment) => ({ label: experiment.name, value: experiment.id }))} placeholder="加入已有实验…" size="small" value={batchExperimentId || undefined}/><LobeButton disabled={!selectedIds.size || !batchExperimentId} onClick={() => onAddToExperiment(batchExperimentId)} size="small">加入</LobeButton></div>}
      <div className="batch-actions">
        {currentCollection && <LobeButton disabled={!selectedIds.size} onClick={() => onRemoveFromCollection(currentCollection.id)} size="small">移出当前组</LobeButton>}
        {currentSeries && <LobeButton disabled={!selectedIds.size} onClick={() => onRemoveFromSeries(currentSeries.id)} size="small">移出当前系列</LobeButton>}
        {currentExperiment && <LobeButton disabled={!selectedIds.size} onClick={() => onRemoveFromExperiment(currentExperiment.id)} size="small">移出当前实验</LobeButton>}
        {libraryView !== 'trash' && <LobeButton disabled={selectedIds.size < 2} icon={<Icon name="spark" size={13}/>} onClick={onCreateExperiment} size="small">建立实验</LobeButton>}
        {libraryView !== 'trash' && <LobeButton disabled={!selectedIds.size} icon={<Icon name="star" size={13}/>} onClick={() => onSetFavorite(!allSelectedAreFavorite)} size="small">{allSelectedAreFavorite ? '取消收藏' : '收藏'}</LobeButton>}
        <LobeButton danger={libraryView !== 'trash'} disabled={!selectedIds.size} icon={<Icon name={libraryView === 'trash' ? 'refresh' : 'trash'} size={13}/>} onClick={() => onSetDeleted(libraryView !== 'trash')} size="small">{libraryView === 'trash' ? '恢复' : '回收站'}</LobeButton>
      </div>
    </div>}
    <div className="asset-list">
      {projects.map((project) => <div key={project.id} className={`asset-row ${project.id === activeId ? 'active' : ''} ${selectedIds.has(project.id) ? 'selected' : ''}`} onContextMenu={(event) => onProjectContextMenu(event, project)}>
        {selectionMode && <button className="asset-check" onClick={() => onToggleSelected(project.id)} aria-pressed={selectedIds.has(project.id)} aria-label={`${selectedIds.has(project.id) ? '取消选择' : '选择'} ${project.name}`}><SelectionMark selected={selectedIds.has(project.id)}/></button>}
        <button className="asset-thumbnail" onClick={() => selectionMode ? onToggleSelected(project.id) : onOpenPromptOverview(project.id)} title={selectionMode ? '选择作品' : '打开 Prompt 总览'}><img src={mediaUrl(project.thumbnail_path)} alt=""/><span><Icon name="layers" size={13}/></span></button>
        <button className="asset-select" onClick={() => selectionMode ? onToggleSelected(project.id) : setActiveId(project.id)}><span className="asset-copy"><strong>{project.name}</strong><small>{countPromptTags(project)} tags · {(project.collection_ids || []).length} 组 · {(project.series_ids || []).length} 系列 · {(project.experiment_ids || []).length} 实验 · {relativeTime(project.updated_at)}</small></span></button>
        {libraryView !== 'trash' && <LobeActionIcon active={Boolean(project.is_favorite)} className="asset-favorite" icon={<Icon name="star" size={13}/>} onClick={() => onSetFavorite(!project.is_favorite, [project.id])} size="small" title={`${project.is_favorite ? '取消收藏' : '收藏'} ${project.name}`} variant="borderless"/>}
      </div>)}
      {!projects.length && <div className="list-empty">{query ? '没有匹配的作品' : `「${currentLabel}」还是空的`}</div>}
    </div>
    <div className="library-footer"><span><Icon name="folder"/>本地资料库</span><i>SQLite</i><LobeButton className={settingsOpen ? 'active' : ''} icon={<Icon name="settings" size={14}/>} onClick={onOpenSettings} size="small" type="text">设置</LobeButton></div>
  </aside>;
}

const BRANCH_STATUS_LABELS = {
  draft: '草稿',
  waiting: '待生成',
  result: '结果匹配',
  mismatch: '结果不匹配',
};

function experimentFieldValue(project, field) {
  if (field === 'Prompt') return formatPositivePromptForCopy(project) || '空 Prompt';
  if (field === 'Vibe') return (project.vibes || []).filter((vibe) => vibe.enabled).map((vibe) => `${vibe.name || 'Vibe'} ${Number(vibe.strength ?? .6).toFixed(2)}`).join(' + ') || '无';
  if (field === 'Size') return `${project.metadata?.width || '—'} × ${project.metadata?.height || '—'}`;
  const key = { Seed: 'seed', Model: 'model', Sampler: 'sampler', Steps: 'steps', CFG: 'guidance' }[field];
  return String(project.metadata?.[key] ?? '') || '—';
}

function ExperimentCompare({ experiment, projects, selectedIds }) {
  const [view, setView] = useState('visual');
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const viewportDrag = useRef(null);
  const selected = projects.filter((project) => selectedIds.has(project.id)).slice(0, 4);
  const baseline = projects.find((project) => project.id === experiment.baseline_project_id) || selected[0];
  const fields = experiment.variable_fields || [];
  const tableColumns = { gridTemplateColumns: `88px repeat(${Math.max(1, selected.length)}, minmax(125px, 1fr))` };
  return <div className="experiment-compare">
    <header>
      <div><span>CONTROLLED COMPARISON</span><strong>{experiment.name}</strong><small>基准：{experiment.baseline_name || baseline?.name || '未知'} · {selected.length} 个视图</small></div>
      <div className="compare-header-actions">
        {view === 'visual' && <div className="compare-zoom-controls" aria-label="同步缩放"><button onClick={() => setViewport((current) => zoomCompareViewport(current, -.25))}>缩小</button><b>{Math.round(viewport.scale * 100)}%</b><button onClick={() => setViewport((current) => zoomCompareViewport(current, .25))}>放大</button><button onClick={() => setViewport({ scale: 1, x: 0, y: 0 })}>适配</button></div>}
        <div className="compare-view-switch"><button className={view === 'visual' ? 'active' : ''} onClick={() => setView('visual')}><Icon name="image" size={14}/>视觉对比</button><button className={view === 'parameters' ? 'active' : ''} onClick={() => setView('parameters')}><Icon name="layers" size={14}/>参数差异</button></div>
      </div>
    </header>
    {experiment.analysis_status === 'mixed' && <div className="compare-causality-warning"><Icon name="warning" size={14}/>当前实验有多个变化字段，只适合视觉筛选，不能归因于单个参数。</div>}
    {view === 'visual' ? <div className={`compare-grid count-${selected.length}`}>
      {selected.map((project) => <figure key={project.id} className={project.id === experiment.baseline_project_id ? 'baseline' : ''}>
        <div className={`compare-image-viewport ${viewport.scale > 1 ? 'zoomed' : ''}`} onWheel={(event) => { event.preventDefault(); setViewport((current) => zoomCompareViewport(current, event.deltaY < 0 ? .25 : -.25)); }} onPointerDown={(event) => {
          if (viewport.scale <= 1) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          viewportDrag.current = { scale: viewport.scale, x: viewport.x, y: viewport.y, pointerX: event.clientX, pointerY: event.clientY };
        }} onPointerMove={(event) => {
          if (!viewportDrag.current) return;
          setViewport(panCompareViewport(viewportDrag.current, { x: event.clientX, y: event.clientY }));
        }} onPointerUp={(event) => { viewportDrag.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); }} onPointerCancel={() => { viewportDrag.current = null; }}>
          <img src={mediaUrl(project.image_path)} alt={project.name} draggable="false" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}/><span>{project.id === experiment.baseline_project_id ? 'BASELINE' : branchChangeFields(baseline, project).join(' · ') || 'SAME'}</span>
        </div>
        <figcaption><strong>{project.name}</strong><small>Seed {project.metadata?.seed || '—'} · {project.metadata?.model || 'Model unknown'}</small></figcaption>
      </figure>)}
    </div> : <div className="compare-parameter-table">
      <div className="compare-table-row heading" style={tableColumns}><b>变化字段</b>{selected.map((project) => <strong key={project.id}>{project.id === experiment.baseline_project_id ? '基准 · ' : ''}{project.name}</strong>)}</div>
      {fields.map((field) => <div className="compare-table-row" style={tableColumns} key={field}><b>{field}</b>{selected.map((project) => { const value = experimentFieldValue(project, field); return <span key={project.id} title={value}>{value}</span>; })}</div>)}
      {!fields.length && <div className="compare-table-empty">成员的可比较生成参数相同</div>}
    </div>}
  </div>;
}

function ExperimentFilmCard({ member, baselineProject, selected, baseline, onToggle, onMove, onContextMenu }) {
  const cardRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const differences = baseline ? [] : branchChangeFields(baselineProject, member);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return undefined;
    const cleanup = [dropTargetForElements({
      element,
      getData: () => ({ type: 'experiment-member', projectId: member.id }),
      canDrop: ({ source }) => source.data.type === 'experiment-member' && source.data.projectId !== member.id,
      onDragEnter: () => setDropTarget(true),
      onDragLeave: () => setDropTarget(false),
      onDrop: ({ source }) => {
        setDropTarget(false);
        onMove(String(source.data.projectId || ''), member.id);
      },
    })];
    if (!baseline) cleanup.push(draggable({
      element,
      getInitialData: () => ({ type: 'experiment-member', projectId: member.id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    }));
    return combine(...cleanup);
  }, [baseline, member.id, onMove]);

  return <button ref={cardRef} className={`version-card experiment-card ${selected ? 'selected' : ''} ${baseline ? 'baseline' : ''} ${dragging ? 'dragging' : ''} ${dropTarget ? 'drop-target' : ''}`} onClick={() => onToggle(member.id)} onContextMenu={(event) => onContextMenu(event, member)} onKeyDown={(event) => {
    if (!event.altKey || baseline || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    onMove(member.id, event.key === 'ArrowLeft' ? 'keyboard:previous' : 'keyboard:next');
  }} aria-pressed={selected} title={baseline ? '基准结果固定在首位' : '拖动排序；Alt/Option + 左右键微调'}>
    <img src={mediaUrl(member.thumbnail_path)} alt=""/><span><b>{member.name}</b><small>{baseline ? '基准结果' : differences.join(' · ') || '参数相同'}</small></span><em>{baseline ? 'BASE' : selected ? '对比中' : '加入'}</em>
  </button>;
}

function PreviewStage({ project, sourceProject, mode, setMode, experiment, experimentProjects, comparisonIds, onToggleComparison, onReorderExperiment, onCopy, onReveal, onEditTag, onTagContextMenu, onProjectContextMenu, onBranchContextMenu, onOpenResult, updateProject, activeBranchId, onSelectBranch, onDiscardBranch, onMarkBranchWaiting, onImportBranchResult, branchResultImporting, onUseLegacyVersion, overviewCopy, onOverviewCopyChange, onCopyText, onNotify }) {
  const limitedReproduction = hasLimitedReproduction(project.metadata);
  const activeBranch = (sourceProject.branches || []).find((branch) => branch.id === activeBranchId);
  const mismatchResult = activeBranch?.results?.find((result) => result.match_status === 'mismatch');
  const copyLabel = mode === 'prompt'
    ? overviewCopy.selected ? `复制已选 ${overviewCopy.count}` : `复制可见 ${overviewCopy.count}`
    : '复制 Prompt';
  return <section className="preview-column">
    <header className="topbar">
      <div className="breadcrumb branch-breadcrumb"><span>作品库</span><b>/</b><strong>{sourceProject.name}</strong>{activeBranch && <em>{activeBranch.name}</em>}</div>
      <div className="top-actions">
        <LobeSegmented aria-label="工作区视图" className="workspace-switch" onChange={setMode} options={[
          { label: <span><Icon name="image"/>图像</span>, value: 'image' },
          { label: <span><Icon name="layers"/>Prompt</span>, value: 'prompt' },
          ...(experiment ? [{ label: <span><Icon name="library"/>对比</span>, value: 'compare' }] : []),
        ]} value={mode}/>
        <LobeActionIcon className="ghost" icon={<Icon name="folder"/>} onClick={() => onReveal(sourceProject.image_path)} size="small" title="在文件夹中显示原图" variant="outlined"/>
        <LobeButton className="copy-button" disabled={mode === 'prompt' && !overviewCopy.count} icon={<Icon name="copy"/>} onClick={onCopy} type="primary">{copyLabel}</LobeButton>
      </div>
    </header>
    {mode === 'compare' && experiment ? <ExperimentCompare experiment={experiment} projects={experimentProjects} selectedIds={comparisonIds}/> : mode === 'image' ? <div className="stage">
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
        <i/><span>{project.metadata.width || '—'} × {project.metadata.height || '—'}</span>
        {limitedReproduction && <><i/><span className="reproduction-status" title="局部重绘 metadata 不包含完整底图与蒙版">INPAINT · 无法精确复现</span></>}
      </div>
      {mismatchResult && <aside className="branch-match-panel" role="status">
        <header><Icon name="warning" size={16}/><div><strong>上传结果与方案不一致</strong><small>原方案已保留，并按图片实际 metadata 创建子分支</small></div></header>
        <div className="branch-match-details">
          {(mismatchResult.details || []).map((detail) => <div key={detail.field}><b>{detail.field}</b><span><em>方案</em>{detail.expected || '—'}</span><span><em>结果</em>{detail.actual || '—'}</span></div>)}
          {!(mismatchResult.details || []).length && <div className="match-detail-empty">差异：{mismatchResult.differences?.join('、') || 'metadata 不一致'}</div>}
        </div>
        <footer>{mismatchResult.actual_branch_id && <button onClick={() => onSelectBranch(mismatchResult.actual_branch_id)}>打开实际结果分支</button>}<button onClick={() => onOpenResult(mismatchResult.project_id)}>查看结果图</button></footer>
      </aside>}
    </div> : <PromptOverview project={project} updateProject={updateProject} onEditTag={onEditTag} onTagContextMenu={onTagContextMenu} onCopyContextChange={onOverviewCopyChange} onCopyText={onCopyText} onNotify={onNotify}/>}
    {mode === 'compare' && experiment ? <footer className="version-rail experiment-rail">
      <div className="rail-title"><span><Icon name="history"/>实验胶片</span><small>选择 2–4 个成员；基准固定保留</small></div>
      <div className="version-strip experiment-strip">
        {experimentProjects.map((member) => <ExperimentFilmCard key={member.id} member={member} baselineProject={experimentProjects.find((item) => item.id === experiment.baseline_project_id)} selected={comparisonIds.has(member.id)} baseline={member.id === experiment.baseline_project_id} onToggle={onToggleComparison} onMove={onReorderExperiment} onContextMenu={onProjectContextMenu}/>)}
      </div>
    </footer> : <footer className="version-rail branch-rail">
      <div className="rail-title"><span><Icon name="history"/>生成分支</span><div className="rail-actions">
        {activeBranch?.status === 'draft' && <><button className="restore-action danger" onClick={() => onDiscardBranch(activeBranch.id)}>放弃草稿</button><button onClick={() => onMarkBranchWaiting(activeBranch.id)}><Icon name="check"/>标记待生成</button></>}
        {activeBranch && ['waiting', 'result', 'mismatch'].includes(activeBranch.status) && <button onClick={() => onImportBranchResult(activeBranch.id)} disabled={branchResultImporting === activeBranch.id}><Icon name="upload"/>{branchResultImporting === activeBranch.id ? '正在核对…' : '上传结果图'}</button>}
      </div></div>
      <div className="version-strip">
        <button className={`version-card current result-card ${!activeBranchId ? 'selected' : ''}`} onClick={() => onSelectBranch('')} onContextMenu={(event) => onProjectContextMenu(event, sourceProject)}>
          <img src={mediaUrl(sourceProject.thumbnail_path)} alt=""/><span><b>原图结果</b><small>生成信息只读 · {relativeTime(sourceProject.updated_at)}</small></span><em><Icon name="lock" size={11}/>RESULT</em>
        </button>
        {(sourceProject.branches || []).map((branch, index) => <button key={branch.id} className={`version-card branch-card ${activeBranchId === branch.id ? 'selected' : ''}`} onClick={() => onSelectBranch(branch.id)} onContextMenu={(event) => onBranchContextMenu(event, branch)}>
          {branch.results?.[0] ? <img src={mediaUrl(branch.results[0].thumbnail_path)} alt=""/> : <div className="version-number">B{(sourceProject.branches || []).length - index}</div>}<span><b>{branch.name}</b><small>{branch.results?.length ? `${branch.results.length} 张结果 · ${branch.results[0].match_status === 'matched' ? 'metadata 匹配' : `${branch.results[0].differences?.join(' / ') || 'metadata 不匹配'}`}` : branch.change_summary || relativeTime(branch.updated_at)}</small></span><em className={`branch-status ${branch.status}`}>{BRANCH_STATUS_LABELS[branch.status] || branch.status}</em>
        </button>)}
        {(sourceProject.versions || []).map((version, index) => <button key={version.id} className="version-card legacy-version" onClick={() => onUseLegacyVersion(version)} title="把旧版 Prompt 作为新的分支草稿打开">
          <div className="version-number">V{(sourceProject.versions || []).length - index}</div><span><b>{version.label}</b><small>旧版本 · 点击转为分支</small></span>
        </button>)}
        {!(sourceProject.branches || []).length && !(sourceProject.versions || []).length && <div className="version-empty">修改 Prompt、Vibe 或生成参数时，会自动创建分支草稿</div>}
      </div>
    </footer>}
  </section>;
}

function WeightControl({ value, onChange }) {
  return <div className="weight-control">
    <input type="range" min="-3" max="3" step="0.05" value={Math.max(-3, Math.min(3, Number(value)))} onChange={(event) => onChange(Number(event.target.value))}/>
    <input className="weight-number" type="number" min="-10" max="10" step="0.05" value={value} onChange={(event) => onChange(Math.max(-10, Math.min(10, Number(event.target.value))))}/>
  </div>;
}

function TagCard({ tag, index, translating, dragging, dropTarget, onTranslate, onChange, onDelete, onContextMenu, onPointerStart, onPointerMove, onPointerEnd, onKeyboardMove }) {
  return <article data-tag-index={index} data-tag-id={tag.id} className={`tag-card ${dragging ? 'dragging' : ''} ${dropTarget ? 'drop-target' : ''}`} onContextMenu={onContextMenu}>
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

function TagsPanel({ project, updateProject, showToast, scopeKey, setScopeKey, focusTagId, onTagContextMenu }) {
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
      {tags.map((tag, index) => <TagCard key={tag.id} tag={tag} index={index} translating={translatingIds.has(tag.id)} dragging={draggingIndex === index} dropTarget={dropIndex === index && draggingIndex !== index} onTranslate={() => translateTagIds([tag.id])} onChange={(patch) => updateTag(index, patch)} onDelete={() => updateProject(updatePromptScope(project, scope.key, tags.filter((_, itemIndex) => itemIndex !== index)))} onContextMenu={(event) => onTagContextMenu(event, scope.key, tag)} onPointerStart={beginPointerDrag} onPointerMove={movePointerDrag} onPointerEnd={endPointerDrag} onKeyboardMove={keyboardMove}/>)}
      {!tags.length && <div className="panel-empty"><Icon name="layers"/><strong>这里还没有 Tag</strong><span>从含 NovelAI V4 metadata 的图片自动恢复，或在上方逐个添加。</span></div>}
    </div>
  </div>;
}

function VibePanel({ project, updateProject, showToast }) {
  const [library, setLibrary] = useState([]);
  const [importing, setImporting] = useState(false);
  const [embeddedStatus, setEmbeddedStatus] = useState(null);
  const [resolving, setResolving] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingLibraryId, setEditingLibraryId] = useState('');
  const [libraryDraft, setLibraryDraft] = useState({ name: '', information_extracted: 0.7, original_information_extracted: 0.7 });
  useEffect(() => { studio.loadVibeLibrary().then(setLibrary); }, []);
  useEffect(() => {
    let active = true;
    studio.inspectEmbeddedVibes(project).then((status) => { if (active) setEmbeddedStatus(status); });
    return () => { active = false; };
  }, [project.id]);
  const archivedCount = library.filter((entry) => entry.archived_at).length;
  const visibleLibrary = useMemo(() => library.filter((entry) => showArchived ? Boolean(entry.archived_at) : !entry.archived_at), [library, showArchived]);
  const libraryGroups = useMemo(() => groupVibeLibraryBySource(visibleLibrary), [visibleLibrary]);

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
          information_extracted_source: vibe.information_extracted_source,
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
    if (entry.archived_at) {
      showToast('请先恢复这个已归档 Vibe');
      return;
    }
    if (project.vibes.some((vibe) => vibe.library_id === entry.id)) {
      showToast('这个 Vibe 已在当前作品中');
      return;
    }
    const vibe = await studio.useVibeFromLibrary(entry);
    updateProject({ ...project, vibes: [...project.vibes, vibe] });
    showToast(`${entry.name} 已加入当前作品`);
  };
  const beginLibraryEdit = (entry) => {
    setEditingLibraryId(entry.id);
    setLibraryDraft({
      name: entry.name || '',
      information_extracted: Number(entry.information_extracted ?? 0.7),
      original_information_extracted: Number(entry.information_extracted ?? 0.7),
    });
  };
  const saveLibraryEdit = async (entry) => {
    try {
      const informationChanged = Math.abs(Number(libraryDraft.information_extracted) - Number(libraryDraft.original_information_extracted)) > 0.0001;
      const result = await studio.updateVibeLibrary(entry.id, {
        name: libraryDraft.name,
        ...(informationChanged ? { information_extracted: libraryDraft.information_extracted } : {}),
      });
      if (!result?.ok) throw new Error(result?.error || 'Vibe 资料没有保存');
      setLibrary(result.library || []);
      setEditingLibraryId('');
      showToast(informationChanged ? 'Vibe 资料已保存；Information 标记为用户设置、未验证' : 'Vibe 名称已保存');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  };
  const setLibraryArchived = async (entry, archived = !entry.archived_at) => {
    try {
      const result = await studio.updateVibeLibrary(entry.id, { archived });
      if (!result?.ok) throw new Error(result?.error || 'Vibe 状态没有保存');
      setLibrary(result.library || []);
      if (editingLibraryId === entry.id) setEditingLibraryId('');
      showToast(archived ? 'Vibe 已归档；现有作品引用保持可用' : 'Vibe 已恢复到资料库');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  };
  const updateVibe = (index, patch) => updateProject({ ...project, vibes: project.vibes.map((vibe, itemIndex) => itemIndex === index ? { ...vibe, ...patch } : vibe) });
  const currentVibeContextMenu = async (event, vibe, index, informationState) => {
    const action = await showNativeContextMenu(event, {
      kind: 'vibe-current',
      enabled: Boolean(vibe.enabled),
      hasSource: Boolean(vibe.reference_image),
      fileUsable: Boolean(vibe.vibe_file && informationState.fileUsable),
    });
    if (action === 'vibe:toggle') updateVibe(index, { enabled: !vibe.enabled });
    if (action === 'vibe:reveal-source') studio.revealFile(vibe.reference_image);
    if (action === 'vibe:reveal-file') studio.revealFile(vibe.vibe_file);
    if (action === 'vibe:remove') {
      updateProject({ ...project, vibes: project.vibes.filter((_, itemIndex) => itemIndex !== index) });
      showToast('Vibe 已从当前分支移除');
    }
  };
  const libraryVibeContextMenu = async (event, entry) => {
    const inUse = project.vibes.some((vibe) => vibe.library_id === entry.id);
    const action = await showNativeContextMenu(event, {
      kind: 'vibe-library',
      inUse,
      hasSource: Boolean(entry.reference_image),
      hasFile: Boolean(entry.vibe_file),
      archived: Boolean(entry.archived_at),
    });
    if (action === 'vibe-library:use') useLibraryVibe(entry);
    if (action === 'vibe-library:reveal-source') studio.revealFile(entry.reference_image);
    if (action === 'vibe-library:reveal-file') studio.revealFile(entry.vibe_file);
    if (action === 'vibe-library:edit') beginLibraryEdit(entry);
    if (action === 'vibe-library:archive') setLibraryArchived(entry);
  };
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
        return <article className={`vibe-card ${!vibe.enabled ? 'disabled' : ''}`} key={vibe.id} onContextMenu={(event) => currentVibeContextMenu(event, vibe, index, informationState)}>
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
    <div className="vibe-section-heading library-heading"><span>Vibe 库</span><b>{visibleLibrary.length}</b><small>{libraryGroups.length} 个图源组</small>{archivedCount > 0 && <button className={showArchived ? 'active' : ''} onClick={() => setShowArchived((value) => !value)}>{showArchived ? '返回可用' : `归档 ${archivedCount}`}</button>}</div>
    <div className="vibe-library-list">
      {libraryGroups.map((group) => <section className={`vibe-source-group ${group.source.reference_image ? '' : 'missing-source'}`} key={group.key}>
        <header>
          <img src={mediaUrl(group.source.thumbnail_path)} alt="Vibe 源图"/>
          <div><strong>{group.source.name}</strong><small>{group.entries.length} 个参数版本 · {group.source.reference_image ? '已绑定源图' : '缺少源 PNG'}</small></div>
          {group.source.reference_image && <button onClick={() => studio.revealFile(group.source.reference_image)} title="打开源图所在文件夹"><Icon name="folder" size={14}/></button>}
        </header>
        {!group.source.reference_image && <div className="vibe-group-warning"><Icon name="info" size={13}/>导入原始 PNG 或带内嵌图片的 `.naiv4vibe` 后可建立可视绑定</div>}
        <div className="vibe-variant-list">
          {group.entries.map((entry) => <article className={`vibe-library-card ${entry.archived_at ? 'archived' : ''} ${editingLibraryId === entry.id ? 'editing' : ''}`} key={entry.id} onContextMenu={(event) => libraryVibeContextMenu(event, entry)}>
            {editingLibraryId === entry.id ? <div className="vibe-library-editor">
              <label><span>显示名称</span><input autoFocus maxLength={120} value={libraryDraft.name} onChange={(event) => setLibraryDraft((current) => ({ ...current, name: event.target.value }))}/></label>
              <label><span>Information Extracted <b>{Number(libraryDraft.information_extracted).toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" value={libraryDraft.information_extracted} onChange={(event) => setLibraryDraft((current) => ({ ...current, information_extracted: Number(event.target.value) }))}/></label>
              <small><Icon name="info" size={12}/>调整 Information 后，只在这个位置标记编码可用，并注明“用户设置、未验证”；不会重新计算或修改文件。只改名称不会改变验证状态。</small>
              <div><button onClick={() => setEditingLibraryId('')}>取消</button><button className="save" onClick={() => saveLibraryEdit(entry)} disabled={!libraryDraft.name.trim()}>保存资料</button></div>
            </div> : <>
              <div><strong>{entry.source_kind === 'image' ? '原始参考图' : entry.name}</strong><small>{entry.source_kind === 'image' ? '尚未编码' : `${entry.encoding_count || 1} 个缓存编码 · ${entry.model || 'NovelAI V4'}`}</small><span>{entry.information_extracted_source === 'user' ? `Information ${Number(entry.information_extracted).toFixed(2)} · 用户设置、未验证` : entry.information_extracted_known ? `Information ${Number(entry.information_extracted).toFixed(2)} · 已验证` : 'Information 未知 · 固定编码'}</span></div>
              <div className="vibe-library-actions"><button onClick={() => beginLibraryEdit(entry)} aria-label={`编辑 ${entry.name}`}><Icon name="edit" size={12}/></button>{entry.archived_at ? <button onClick={() => setLibraryArchived(entry, false)}>恢复</button> : <button onClick={() => useLibraryVibe(entry)} disabled={project.vibes.some((vibe) => vibe.library_id === entry.id)}>{project.vibes.some((vibe) => vibe.library_id === entry.id) ? '已用' : '使用'}</button>}</div>
            </>}
          </article>)}
        </div>
      </section>)}
      {!visibleLibrary.length && (showArchived ? <div className="panel-empty compact"><Icon name="archive"/><strong>没有已归档 Vibe</strong><span>归档项目会保留已有作品引用。</span></div> : <button className="vibe-library-empty" onClick={() => importVibes(false)}><Icon name="plus"/><span><strong>建立 Vibe 库</strong><small>导入 `.naiv4vibe` 可直接复用缓存编码，不必重新计算。</small></span></button>)}
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
      <label><span>Width</span><input type="number" min="0" step="64" value={metadata.width || ''} onChange={(event) => update({ width: event.target.value })} placeholder="—"/></label>
      <label><span>Height</span><input type="number" min="0" step="64" value={metadata.height || ''} onChange={(event) => update({ height: event.target.value })} placeholder="—"/></label>
    </div>
    <label className="textarea-label"><span>Base Undesired Content · 在 Prompt 面板编辑</span><textarea value={formatPrompt(project.prompt_structure.base_undesired_tags)} readOnly placeholder="未检测到 Undesired Content"/></label>
    <details className="raw-metadata"><summary>查看原始 metadata</summary><pre>{metadata.extra_json || '{}'}</pre></details>
  </div>;
}

function Inspector({ tab, setTab, project, branch, updateProject, showToast, promptScopeKey, setPromptScopeKey, focusTagId, onTagContextMenu }) {
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
    {tab === 'tags' && <TagsPanel project={project} updateProject={updateProject} showToast={showToast} scopeKey={promptScopeKey} setScopeKey={setPromptScopeKey} focusTagId={focusTagId} onTagContextMenu={onTagContextMenu}/>}
    {tab === 'vibe' && <VibePanel project={project} updateProject={updateProject} showToast={showToast}/>}
    {tab === 'metadata' && <MetadataPanel project={project} updateProject={updateProject}/>}
  </aside>;
}

function SettingsPage({ appearance, onAppearanceChange, onClose, showToast }) {
  const [section, setSection] = useState('appearance');
  const [aiSettings, setAISettings] = useState({ baseUrl: 'https://api.openai.com/v1', model: '', apiKey: '', hasApiKey: false, encryptionAvailable: true });
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    studio.getAISettings().then((settings) => setAISettings((current) => ({ ...current, ...settings, apiKey: '' })));
  }, []);

  const saveAI = async () => {
    setBusy('save');
    try {
      const saved = await studio.saveAISettings({
        baseUrl: aiSettings.baseUrl,
        model: aiSettings.model,
        apiKey: aiSettings.apiKey,
      });
      setAISettings((current) => ({ ...current, ...saved, apiKey: '' }));
      showToast('AI 服务设置已安全保存');
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy('');
    }
  };

  const loadModels = async () => {
    if (!(await saveAI())) return;
    setBusy('models');
    const result = await studio.listAIModels();
    setBusy('');
    if (!result?.ok) { showToast(result?.error || '无法读取模型列表'); return; }
    setModels(result.models || []);
    showToast(`已读取 ${result.models?.length || 0} 个模型`);
  };

  const testConnection = async () => {
    if (!(await saveAI())) return;
    setBusy('test');
    const result = await studio.testAIModel();
    setBusy('');
    showToast(result?.ok ? `连接成功 · ${result.model || aiSettings.model}` : result?.error || '连接测试失败');
  };

  const platform = navigator.platform.startsWith('Mac') ? 'macOS' : navigator.platform.startsWith('Win') ? 'Windows' : 'Desktop';
  return <main className="settings-page">
    <aside className="settings-nav">
      <header><span>SETTINGS / 01</span><h1>软件设置</h1><p>设置保存在当前设备，不会写入作品 metadata。</p></header>
      <nav aria-label="设置分类">
        <LobeButton block className={section === 'appearance' ? 'active' : ''} icon={<Icon name="settings"/>} onClick={() => setSection('appearance')} type="text"><span><strong>外观与可读性</strong><small>主题、字号、密度、动效</small></span></LobeButton>
        <LobeButton block className={section === 'ai' ? 'active' : ''} icon={<Icon name="spark"/>} onClick={() => setSection('ai')} type="text"><span><strong>AI 服务</strong><small>接口、模型、安全存储</small></span></LobeButton>
      </nav>
      <LobeButton className="settings-back" onClick={onClose}><Icon name="close" size={14}/>返回作品库</LobeButton>
    </aside>
    <section className="settings-content">
      {section === 'appearance' ? <>
        <header className="settings-heading"><span>APPEARANCE</span><h2>让高密度工作台保持清楚</h2><p>字号会按固定档位缩放语义排版；密度只改变留白和控件高度，不会隐藏功能。</p></header>
        <div className="settings-group">
          <div className="settings-row"><div><strong>界面主题</strong><small>默认使用深色；跟随系统会响应 Windows 或 macOS 的外观设置。</small></div><LobeSegmented aria-label="界面主题" className="settings-segment" options={[{ label: '跟随系统', value: 'auto' }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }]} value={appearance.themeMode} onChange={(value) => onAppearanceChange({ themeMode: value })}/></div>
          <div className="settings-row"><div><strong>界面字号</strong><small>默认使用“较大”，改善中文与长时间阅读。</small></div><LobeSegmented aria-label="界面字号" className="settings-segment" options={[{ label: '标准', value: 'default' }, { label: '较大', value: 'large' }, { label: '特大', value: 'larger' }]} value={appearance.fontScale} onChange={(value) => onAppearanceChange({ fontScale: value })}/></div>
          <div className="settings-row"><div><strong>界面密度</strong><small>窗口较窄时建议紧凑；大屏长期整理建议舒适。</small></div><LobeSegmented aria-label="界面密度" className="settings-segment" options={[{ label: '紧凑', value: 'compact' }, { label: '舒适', value: 'comfortable' }]} value={appearance.density} onChange={(value) => onAppearanceChange({ density: value })}/></div>
          <div className="settings-row"><div><strong>界面动效</strong><small>“跟随系统”尊重系统的减少动态效果设置；关闭后只保留必要状态变化。</small></div><LobeSegmented aria-label="界面动效" className="settings-segment" options={[{ label: '完整', value: 'full' }, { label: '跟随系统', value: 'reduced' }, { label: '关闭', value: 'off' }]} value={appearance.motion} onChange={(value) => onAppearanceChange({ motion: value })}/></div>
        </div>
        <aside className="settings-platform-note"><Icon name="info"/><div><strong>{platform} 当前生效</strong><span>Geist、Geist Mono 与 HarmonyOS Sans SC 已随应用打包；Windows 保持隐藏应用菜单，macOS 保留原生菜单与窗口习惯。</span></div></aside>
      </> : <>
        <header className="settings-heading"><span>AI SERVICE</span><h2>翻译与分类使用同一安全连接</h2><p>API Key 由操作系统安全存储加密，不进入 SQLite、日志、导出文件或跨平台协调文档。</p></header>
        <div className="settings-group ai-settings-group">
          <label><span><strong>API Base URL</strong><small>兼容 OpenAI API 格式的服务地址</small></span><LobeInput value={aiSettings.baseUrl} onChange={(event) => setAISettings((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.openai.com/v1"/></label>
          <label><span><strong>API Key</strong><small>{aiSettings.hasApiKey ? '已加密保存；留空可保留现有 Key' : '尚未保存'}</small></span><LobeInputPassword value={aiSettings.apiKey} onChange={(event) => setAISettings((current) => ({ ...current, apiKey: event.target.value }))} placeholder={aiSettings.hasApiKey ? '已安全保存' : '输入 API Key'}/></label>
          <label><span><strong>默认模型</strong><small>翻译与分类任务暂时共用；后续可分别配置</small></span><div className="settings-model-input"><LobeInput list="settings-model-list" value={aiSettings.model} onChange={(event) => setAISettings((current) => ({ ...current, model: event.target.value }))} placeholder="输入或读取模型 ID"/><datalist id="settings-model-list">{models.map((model) => <option key={model} value={model}/>)}</datalist><LobeButton onClick={loadModels} disabled={Boolean(busy)}><Icon name="refresh" size={14}/>{busy === 'models' ? '读取中' : '读取模型'}</LobeButton></div></label>
        </div>
        <div className="settings-actions"><LobeButton onClick={testConnection} disabled={Boolean(busy)}>测试连接</LobeButton><LobeButton type="primary" onClick={saveAI} disabled={Boolean(busy)}>{busy === 'save' ? '保存中…' : '保存 AI 设置'}</LobeButton></div>
        {!aiSettings.encryptionAvailable && <aside className="settings-warning"><Icon name="warning"/><span>当前系统安全存储不可用，应用不会以明文保存 API Key。</span></aside>}
      </>}
    </section>
  </main>;
}

export default function App({ appearance, setAppearance }) {
  const { token: lobeTheme } = antdTheme.useToken();
  const [projects, setProjects] = useState([]);
  const [collections, setCollections] = useState([]);
  const [series, setSeries] = useState([]);
  const [experiments, setExperiments] = useState([]);
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
  const [branchResultImporting, setBranchResultImporting] = useState('');
  const [comparisonIds, setComparisonIds] = useState(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveTimers = useRef(new Map());
  const branchSaveTimers = useRef(new Map());
  const branchCreatePromises = useRef(new Map());
  const appShellRef = useRef(null);
  const dropFilesHandlerRef = useRef(null);
  const shortcutModifier = useMemo(() => navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl', []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.themeMode = appearance.themeMode;
    root.dataset.fontScale = appearance.fontScale;
    root.dataset.density = appearance.density;
    root.dataset.motion = appearance.motion;
  }, [appearance]);

  const studioThemeStyle = {
    '--ink': lobeTheme.colorBgLayout,
    '--panel': lobeTheme.colorBgContainer,
    '--panel-2': lobeTheme.colorBgElevated,
    '--raised': lobeTheme.colorFillSecondary,
    '--line': lobeTheme.colorBorder,
    '--line-soft': lobeTheme.colorBorderSecondary,
    '--text': lobeTheme.colorText,
    '--muted': lobeTheme.colorTextSecondary,
    '--faint': lobeTheme.colorTextTertiary,
    '--accent': lobeTheme.colorPrimary,
    '--accent-strong': lobeTheme.colorPrimaryHover,
    '--blue': lobeTheme.colorInfo,
    '--green': lobeTheme.colorSuccess,
    '--purple': lobeTheme.purple,
    '--red': lobeTheme.colorError,
  };

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
      setSeries(organization.series || []);
      setExperiments(organization.experiments || []);
      setActiveId(repairedItems.find((project) => !project.deleted_at)?.id || null);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    studio.onImportProgress((progress) => setImportProgress(progress));
    return () => studio.offImportProgress();
  }, []);

  useEffect(() => {
    const handleTextContextMenu = (event) => {
      if (event.defaultPrevented || !isTextEditingTarget(event.target)) return;
      event.preventDefault();
      studio.showContextMenu({ kind: 'text', ...contextMenuPosition(event) });
    };
    document.addEventListener('contextmenu', handleTextContextMenu);
    return () => document.removeEventListener('contextmenu', handleTextContextMenu);
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
  const activeExperiment = libraryView.startsWith('experiment:') ? experiments.find((entry) => `experiment:${entry.id}` === libraryView) : null;
  const experimentProjects = (activeExperiment?.member_ids || []).map((id) => projects.find((project) => project.id === id)).filter(Boolean);
  const activeBranch = sourceProject?.branches?.find((branch) => branch.id === activeBranchId) || null;
  const activeProject = sourceProject && activeBranch
    ? applyGenerationSnapshot(sourceProject, parseBranchSnapshot(activeBranch))
    : sourceProject;

  useEffect(() => {
    if (!activeBranchId || sourceProject?.branches?.some((branch) => branch.id === activeBranchId)) return;
    setActiveBranchId('');
  }, [activeBranchId, sourceProject]);

  useEffect(() => {
    if (!activeExperiment) { setComparisonIds(new Set()); return; }
    const memberIds = activeExperiment.member_ids || [];
    setComparisonIds((current) => {
      const next = new Set([...current].filter((id) => memberIds.includes(id) && id !== activeExperiment.baseline_project_id).slice(0, 3));
      if (activeExperiment.baseline_project_id) next.add(activeExperiment.baseline_project_id);
      for (const id of memberIds) {
        if (next.size >= 2) break;
        next.add(id);
      }
      return next;
    });
  }, [activeExperiment?.id, activeExperiment?.baseline_project_id, activeExperiment?.member_ids?.join('|')]);

  useEffect(() => {
    if (workspaceMode !== 'prompt') setOverviewCopy({ text: '', count: 0, selected: false, categoryCount: 0 });
  }, [activeId, workspaceMode]);
  const filteredProjects = useMemo(() => {
    let viewProjects = projects.filter((project) => {
      if (libraryView === 'trash') return Boolean(project.deleted_at);
      if (project.deleted_at) return false;
      if (libraryView === 'favorites') return Boolean(project.is_favorite);
      if (libraryView === 'ungrouped') return !(project.collection_ids || []).length;
      if (libraryView.startsWith('collection:')) return (project.collection_ids || []).includes(libraryView.slice('collection:'.length));
      if (libraryView.startsWith('series:')) return (project.series_ids || []).includes(libraryView.slice('series:'.length));
      if (libraryView.startsWith('experiment:')) return (project.experiment_ids || []).includes(libraryView.slice('experiment:'.length));
      return true;
    });
    if (libraryView.startsWith('experiment:')) {
      const experiment = experiments.find((entry) => `experiment:${entry.id}` === libraryView);
      const positions = new Map((experiment?.member_ids || []).map((id, index) => [id, index]));
      viewProjects = [...viewProjects].sort((left, right) => (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER));
    }
    const needles = expandSearch(query);
    if (!needles.length) return viewProjects;
    return viewProjects.filter((project) => [project.name, ...allPromptTags(project).flatMap((tag) => [tag.tag, tag.translation, tag.category, CATEGORY_LABELS[tag.category]])].some((value) => needles.some((needle) => normalizeSearch(value).includes(needle))));
  }, [projects, query, libraryView, experiments]);

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
    setSeries(organization.series || []);
    setExperiments(organization.experiments || []);
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
    setSettingsOpen(false);
    setLibraryView(view);
    setSelectedIds(new Set());
    setWorkspaceMode(view.startsWith('experiment:') ? 'compare' : workspaceMode === 'compare' ? 'image' : workspaceMode);
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

  const toggleComparison = (projectId) => {
    if (!activeExperiment) return;
    if (projectId === activeExperiment.baseline_project_id) { showToast('基准作品固定保留在对比中'); return; }
    setComparisonIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        if (next.size <= 2) { showToast('对比模式至少保留 2 个成员'); return current; }
        next.delete(projectId);
      } else {
        if (next.size >= 4) { showToast('一次最多对比 4 个成员'); return current; }
        next.add(projectId);
      }
      return next;
    });
  };

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
  const createSeries = (name) => runLibraryOrganization(() => studio.createSeries(name), `已创建创作系列「${name.trim()}」`);
  const renameSeries = (id, name) => runLibraryOrganization(() => studio.renameSeries(id, name), '创作系列已重命名');
  const deleteSeries = async (id) => {
    const success = await runLibraryOrganization(() => studio.deleteSeries(id), '创作系列已删除，作品仍保留在库中');
    if (success && libraryView === `series:${id}`) changeLibraryView('all');
    return success;
  };
  const addSelectedToSeries = async (seriesId) => {
    if (!seriesId || !selectedIds.size) return false;
    const success = await runLibraryOrganization(
      () => studio.addProjectsToSeries(seriesId, [...selectedIds]),
      `已把 ${selectedIds.size} 个作品加入创作系列`,
    );
    if (success) setSelectedIds(new Set());
    return success;
  };
  const removeSelectedFromSeries = async (seriesId) => {
    if (!seriesId || !selectedIds.size) return false;
    const success = await runLibraryOrganization(
      () => studio.removeProjectsFromSeries(seriesId, [...selectedIds]),
      `已从当前系列移出 ${selectedIds.size} 个作品`,
    );
    if (success) setSelectedIds(new Set());
    return success;
  };
  const createExperiment = async () => {
    const projectIds = [...selectedIds];
    if (projectIds.length < 2) return false;
    const baselineId = projectIds.includes(activeId) ? activeId : projectIds[0];
    const baseline = projects.find((project) => project.id === baselineId);
    const name = `对比 · ${String(baseline?.name || '未命名').replace(/\.[^.]+$/, '').slice(0, 48)}`;
    const success = await runLibraryOrganization(
      () => studio.createExperiment(name, baselineId, projectIds),
      `已建立对比实验，基准为「${baseline?.name || '当前作品'}」`,
    );
    if (success) setSelectedIds(new Set());
    return success;
  };
  const renameExperiment = (id, name) => runLibraryOrganization(() => studio.renameExperiment(id, name), '对比实验已重命名');
  const deleteExperiment = async (id) => {
    const success = await runLibraryOrganization(() => studio.deleteExperiment(id), '对比实验已删除，成员作品仍保留');
    if (success && libraryView === `experiment:${id}`) changeLibraryView('all');
    return success;
  };
  const addSelectedToExperiment = async (experimentId) => {
    if (!experimentId || !selectedIds.size) return false;
    const success = await runLibraryOrganization(
      () => studio.addProjectsToExperiment(experimentId, [...selectedIds]),
      `已加入实验并重新分析 ${selectedIds.size} 个作品`,
    );
    if (success) setSelectedIds(new Set());
    return success;
  };
  const removeSelectedFromExperiment = async (experimentId) => {
    if (!experimentId || !selectedIds.size) return false;
    const success = await runLibraryOrganization(
      () => studio.removeProjectsFromExperiment(experimentId, [...selectedIds]),
      `已移出实验并重新计算变量`,
    );
    if (success) setSelectedIds(new Set());
    return success;
  };
  const reorderExperiment = async (sourceId, targetId) => {
    if (!activeExperiment || !sourceId) return false;
    const currentIds = activeExperiment.member_ids || [];
    let nextIds;
    if (targetId === 'keyboard:previous' || targetId === 'keyboard:next') {
      const sourceIndex = currentIds.indexOf(sourceId);
      if (sourceIndex < 1) return false;
      const targetIndex = targetId === 'keyboard:previous' ? Math.max(1, sourceIndex - 1) : Math.min(currentIds.length - 1, sourceIndex + 1);
      nextIds = [...currentIds];
      [nextIds[sourceIndex], nextIds[targetIndex]] = [nextIds[targetIndex], nextIds[sourceIndex]];
    } else {
      nextIds = moveExperimentMember(currentIds, sourceId, targetId, activeExperiment.baseline_project_id);
    }
    if (nextIds.every((id, index) => id === currentIds[index])) return false;
    return runLibraryOrganization(
      () => studio.reorderExperimentMembers(activeExperiment.id, nextIds),
      '实验胶片顺序已保存',
    );
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

  const projectContextMenu = async (event, project) => {
    const action = await showNativeContextMenu(event, {
      kind: 'project',
      favorite: Boolean(project.is_favorite),
      deleted: Boolean(project.deleted_at),
      collections,
      series,
      experiments,
    });
    if (!action) return;
    if (action === 'project:open-prompt') openPromptOverview(project.id);
    if (action === 'project:copy-prompt') {
      await navigator.clipboard.writeText(formatPositivePromptForCopy(project));
      showToast('Prompt 已复制');
    }
    if (action === 'project:reveal') studio.revealFile(project.image_path);
    if (action === 'project:toggle-favorite') setFavorite(!project.is_favorite, [project.id]);
    if (action === 'project:toggle-trash') runLibraryOrganization(
      () => studio.setProjectsDeleted([project.id], !project.deleted_at),
      project.deleted_at ? '作品已恢复' : '作品已移入回收站',
    );
    if (action.startsWith('project:add-collection:')) {
      const collectionId = action.slice('project:add-collection:'.length);
      runLibraryOrganization(() => studio.addProjectsToCollection(collectionId, [project.id]), '作品已加入收藏集');
    }
    if (action.startsWith('project:add-series:')) {
      const seriesId = action.slice('project:add-series:'.length);
      runLibraryOrganization(() => studio.addProjectsToSeries(seriesId, [project.id]), '作品已加入创作系列');
    }
    if (action.startsWith('project:add-experiment:')) {
      const experimentId = action.slice('project:add-experiment:'.length);
      runLibraryOrganization(() => studio.addProjectsToExperiment(experimentId, [project.id]), '作品已加入对比实验，变量已重新计算');
    }
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

  const tagContextMenu = async (event, scopeKey, tag) => {
    if (!activeProject || !tag) return;
    const action = await showNativeContextMenu(event, {
      kind: 'tag',
      hasTranslation: Boolean(tag.translation?.trim()),
      category: tag.category || 'Unsorted',
    });
    if (!action) return;
    if (action === 'tag:copy') {
      await navigator.clipboard.writeText(tag.tag);
      showToast('Tag 已复制');
      return;
    }
    if (action === 'tag:copy-translation') {
      await navigator.clipboard.writeText(tag.translation || '');
      showToast('翻译已复制');
      return;
    }
    if (action === 'tag:edit') {
      openTagEditor(scopeKey, tag.id);
      return;
    }
    const scope = getPromptScope(activeProject, scopeKey);
    const replaceTag = (patch) => updateProject(updatePromptScope(activeProject, scope.key, scope.tags.map((item) => item.id === tag.id ? { ...item, ...patch } : item)));
    if (action === 'tag:delete') {
      updateProject(updatePromptScope(activeProject, scope.key, scope.tags.filter((item) => item.id !== tag.id)));
      showToast('Tag 已删除');
      return;
    }
    if (action.startsWith('tag:category:')) {
      replaceTag({ category: action.slice('tag:category:'.length), category_source: 'manual' });
      showToast('Tag 分类已更新');
      return;
    }
    if (action === 'tag:translate') {
      const result = await studio.translateTags([tag.tag]);
      if (!result?.ok) { showToast(result?.error || 'AI 翻译没有完成'); return; }
      const item = result.items?.[0] || { translation: result.translations?.[0] || '', category: result.categories?.[0] || tag.category };
      replaceTag({ ...item, translation_source: item.translation_source || 'ai', category_source: item.category_source || 'ai' });
      showToast('Tag 已翻译并分类');
    }
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

  const importBranchResult = async (branchId) => {
    setBranchResultImporting(branchId);
    try {
      const result = await studio.importBranchResult(branchId);
      if (result?.canceled) return;
      if (!result?.ok) { showToast(result?.error || '结果图没有导入'); return; }
      setProjects((current) => {
        let foundResult = false;
        const next = current.map((item) => {
          if (item.id === result.project.id) {
            foundResult = true;
            return result.project;
          }
          if (item.id === result.branch.source_project_id) {
            let branches = (item.branches || []).map((branch) => branch.id === result.branch.id ? result.branch : branch);
            if (result.actualBranch) {
              branches = branches.some((branch) => branch.id === result.actualBranch.id)
                ? branches.map((branch) => branch.id === result.actualBranch.id ? result.actualBranch : branch)
                : [result.actualBranch, ...branches];
            }
            return { ...item, branches };
          }
          return item;
        });
        return foundResult ? next : [result.project, ...next];
      });
      if (result.match.status === 'matched') showToast(`结果图已匹配并绑定 · Seed ${result.match.actualSeed || '—'}`);
      else showToast(`结果图与方案不一致；已保留原方案并创建“实际结果”子分支`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    } finally {
      setBranchResultImporting('');
    }
  };

  const openResultProject = (projectId) => {
    setLibraryView('all');
    setActiveBranchId('');
    setActiveId(projectId);
    setWorkspaceMode('image');
  };

  const branchContextMenu = async (event, branch) => {
    const action = await showNativeContextMenu(event, {
      kind: 'branch',
      status: branch.status,
      results: branch.results || [],
    });
    if (!action || !sourceProject) return;
    if (action === 'branch:open') setActiveBranchId(branch.id);
    if (action === 'branch:copy-prompt') {
      const branchProject = applyGenerationSnapshot(sourceProject, parseBranchSnapshot(branch));
      await navigator.clipboard.writeText(formatPositivePromptForCopy(branchProject));
      showToast('分支 Prompt 已复制');
    }
    if (action === 'branch:mark-waiting') markBranchWaiting(branch.id);
    if (action === 'branch:upload-result') importBranchResult(branch.id);
    if (action === 'branch:discard') discardBranch(branch.id);
    if (action.startsWith('branch:open-result:')) {
      openResultProject(action.slice('branch:open-result:'.length));
    }
    if (action.startsWith('branch:reveal-result:')) {
      const projectId = action.slice('branch:reveal-result:'.length);
      const result = (branch.results || []).find((item) => item.project_id === projectId);
      if (result?.image_path) studio.revealFile(result.image_path);
    }
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
    setSettingsOpen(false);
    setActiveId(projectId);
    setActiveBranchId('');
    setWorkspaceMode('prompt');
  };

  const openTagEditor = (scopeKey, tagId) => {
    setSettingsOpen(false);
    setWorkspaceMode('prompt');
    setTab('tags');
    if (scopeKey) setPromptScopeKey(scopeKey);
    setFocusTagId(null);
    if (tagId) requestAnimationFrame(() => setFocusTagId(tagId));
  };

  const updateAppearance = async (patch) => {
    const previous = appearance;
    const next = { ...appearance, ...patch };
    setAppearance(next);
    try {
      const saved = await studio.saveAppearanceSettings(next);
      setAppearance(saved);
      showToast('外观设置已保存');
    } catch (error) {
      setAppearance(previous);
      showToast(error instanceof Error ? error.message : String(error));
    }
  };

  if (loading) return <div className="loading-screen" style={studioThemeStyle}><div className="brand-symbol">N<span>4</span></div><span>正在打开本地资料库…</span></div>;

  return <div className={`app-shell ${settingsOpen ? 'settings-open' : ''}`} ref={appShellRef} style={studioThemeStyle}>
    <LibraryPanel
      projects={filteredProjects}
      allProjects={projects}
      collections={collections}
      series={series}
      experiments={experiments}
      activeId={activeId}
      setActiveId={(id) => { setSettingsOpen(false); setActiveId(id); setActiveBranchId(''); setPromptScopeKey('base:prompt'); }}
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
      onCreateSeries={createSeries}
      onRenameSeries={renameSeries}
      onDeleteSeries={deleteSeries}
      onAddToSeries={addSelectedToSeries}
      onRemoveFromSeries={removeSelectedFromSeries}
      onCreateExperiment={createExperiment}
      onRenameExperiment={renameExperiment}
      onDeleteExperiment={deleteExperiment}
      onAddToExperiment={addSelectedToExperiment}
      onRemoveFromExperiment={removeSelectedFromExperiment}
      onSetFavorite={setFavorite}
      onSetDeleted={setDeleted}
      onProjectContextMenu={projectContextMenu}
      settingsOpen={settingsOpen}
      onOpenSettings={() => setSettingsOpen(true)}
    />
    {settingsOpen ? <SettingsPage appearance={appearance} onAppearanceChange={updateAppearance} onClose={() => setSettingsOpen(false)} showToast={showToast}/> : activeProject ? <>
      <PreviewStage project={activeProject} sourceProject={sourceProject} mode={workspaceMode} setMode={setWorkspaceMode} experiment={activeExperiment} experimentProjects={experimentProjects} comparisonIds={comparisonIds} onToggleComparison={toggleComparison} onReorderExperiment={reorderExperiment} onCopy={copyPrompt} onReveal={studio.revealFile} onEditTag={openTagEditor} onTagContextMenu={tagContextMenu} onProjectContextMenu={projectContextMenu} onBranchContextMenu={branchContextMenu} onOpenResult={openResultProject} updateProject={updateProject} activeBranchId={activeBranchId} onSelectBranch={setActiveBranchId} onDiscardBranch={discardBranch} onMarkBranchWaiting={markBranchWaiting} onImportBranchResult={importBranchResult} branchResultImporting={branchResultImporting} onUseLegacyVersion={useLegacyVersion} overviewCopy={overviewCopy} onOverviewCopyChange={setOverviewCopy} onCopyText={copyOverviewText} onNotify={showToast}/>
      <Inspector tab={tab} setTab={setTab} project={activeProject} branch={activeBranch} updateProject={updateProject} showToast={showToast} promptScopeKey={promptScopeKey} setPromptScopeKey={setPromptScopeKey} focusTagId={focusTagId} onTagContextMenu={tagContextMenu}/>
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
