import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, expandSearch, formatPrompt, normalizeSearch, parsePrompt, repairLegacyPromptTags } from './lib/prompt.js';
import {
  addPromptCharacter,
  allPromptTags,
  countPromptTags,
  formatPositivePrompt,
  getPromptScope,
  getPromptScopes,
  normalizePromptStructure,
  promptSnapshot,
  removePromptCharacter,
  restorePromptSnapshot,
  syncProjectPromptMetadata,
  updatePromptCharacter,
  updatePromptScope,
} from './lib/promptStructure.js';
import PromptOverview from './PromptOverview.jsx';

const studio = window.studio || {
  loadLibrary: async () => [],
  importImages: async () => [],
  updateProject: async () => ({ ok: true }),
  deleteProject: async () => ({ ok: true }),
  chooseVibeImage: async () => null,
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

function EmptyState({ onImport }) {
  return <main className="empty-state">
    <div className="empty-mark"><Icon name="image" size={32}/><span>NAI / 01</span></div>
    <h1>把生成图变成<br/>可继续创作的资产</h1>
    <p>导入 NovelAI 图片，自动恢复 Prompt 与生成参数。Vibe 参考图和权重会独立保存，不再随页面关闭而丢失。</p>
    <button className="primary large" onClick={onImport}><Icon name="plus"/>导入第一批作品</button>
    <div className="empty-hint">PNG · JPG · WEBP　支持批量导入</div>
  </main>;
}

function LibraryPanel({ projects, activeId, setActiveId, query, setQuery, onImport, onOpenPromptOverview, shortcutModifier }) {
  return <aside className="library-panel">
    <div className="brand-row">
      <div className="brand-symbol">N<span>4</span></div>
      <div><strong>Prompt Studio</strong><small>NovelAI asset desk</small></div>
    </div>
    <button className="primary import-button" onClick={onImport}><Icon name="plus"/>导入图片 <kbd>{shortcutModifier} I</kbd></button>
    <label className="search-box"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标签、译名或文件…"/><span>{shortcutModifier} K</span></label>
    <div className="section-heading"><span>作品库</span><b>{projects.length}</b></div>
    <div className="asset-list">
      {projects.map((project) => <div key={project.id} className={`asset-row ${project.id === activeId ? 'active' : ''}`}>
        <button className="asset-thumbnail" onClick={() => onOpenPromptOverview(project.id)} title="打开 Prompt 总览"><img src={mediaUrl(project.thumbnail_path)} alt=""/><span><Icon name="layers" size={13}/></span></button>
        <button className="asset-select" onClick={() => setActiveId(project.id)}><span className="asset-copy"><strong>{project.name}</strong><small>{countPromptTags(project)} tags · {relativeTime(project.updated_at)}</small></span></button>
        <span className="asset-status" title="已保存在本地"/>
      </div>)}
      {!projects.length && <div className="list-empty">没有匹配的作品</div>}
    </div>
    <div className="library-footer"><Icon name="folder"/><span>本地资料库</span><i>SQLite</i></div>
  </aside>;
}

function PreviewStage({ project, mode, setMode, onCopy, onReveal, onEditTag, updateProject, saveVersion, restoreVersion, activeVersion, setActiveVersion }) {
  return <section className="preview-column">
    <header className="topbar">
      <div className="breadcrumb"><span>作品库</span><b>/</b><strong>{project.name}</strong></div>
      <div className="top-actions">
        <div className="workspace-switch" aria-label="工作区视图">
          <button className={mode === 'image' ? 'active' : ''} onClick={() => setMode('image')}><Icon name="image"/>图像</button>
          <button className={mode === 'prompt' ? 'active' : ''} onClick={() => setMode('prompt')}><Icon name="layers"/>Prompt</button>
        </div>
        <button className="ghost" onClick={() => onReveal(project.image_path)} title="在文件夹中显示"><Icon name="folder"/></button>
        <button className="copy-button" onClick={onCopy}><Icon name="copy"/>复制 Prompt</button>
      </div>
    </header>
    {mode === 'image' ? <div className="stage">
      <div className="image-mat">
        <img src={mediaUrl(project.image_path)} alt={project.name}/>
        <div className="image-index">ASSET<br/><b>{String(countPromptTags(project)).padStart(2, '0')}</b></div>
      </div>
      <div className="stage-meta">
        <span>{project.metadata.model || 'MODEL UNKNOWN'}</span>
        <i/>
        <span>SEED {project.metadata.seed || '—'}</span>
        <i/>
        <span>{project.metadata.steps || '—'} STEPS</span>
      </div>
    </div> : <PromptOverview project={project} updateProject={updateProject} onEditTag={onEditTag}/>}
    <footer className="version-rail">
      <div className="rail-title"><span><Icon name="history"/>版本胶片</span><div className="rail-actions">{activeVersion !== 'current' && <button className="restore-action" onClick={() => restoreVersion(activeVersion)}>恢复此版本</button>}<button onClick={saveVersion}><Icon name="plus"/>保存版本</button></div></div>
      <div className="version-strip">
        <button className={`version-card current ${activeVersion === 'current' ? 'selected' : ''}`} onClick={() => setActiveVersion('current')}>
          <img src={mediaUrl(project.thumbnail_path)} alt=""/><span><b>当前工作稿</b><small>{relativeTime(project.updated_at)}</small></span><em>LIVE</em>
        </button>
        {project.versions.map((version, index) => <button key={version.id} className={`version-card ${activeVersion === version.id ? 'selected' : ''}`} onClick={() => setActiveVersion(version.id)}>
          <div className="version-number">V{project.versions.length - index}</div><span><b>{version.label}</b><small>{version.change_summary || relativeTime(version.created_at)}</small></span>
        </button>)}
        {!project.versions.length && <div className="version-empty">保存版本后，可随时比较和恢复 Prompt 快照</div>}
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
        <input className="tag-name" value={tag.tag} onChange={(event) => onChange({ tag: event.target.value })} aria-label="Tag"/>
        <input className="translation" value={tag.translation || ''} onChange={(event) => onChange({ translation: event.target.value })} placeholder="添加中文翻译" aria-label="中文翻译"/>
      </div>
      <button className={`translate-tag ${translating ? 'working' : ''}`} onClick={onTranslate} disabled={translating} aria-label={`翻译 ${tag.tag}`}>{translating ? '···' : '译'}</button>
      <button className="icon-button danger" onClick={onDelete} aria-label="删除标签"><Icon name="close" size={14}/></button>
    </div>
    <div className="tag-options">
      <select value={tag.category} onChange={(event) => onChange({ category: event.target.value })}>{CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{CATEGORY_LABELS[option]}</option>)}</select>
      <WeightControl value={tag.weight} onChange={(weight) => onChange({ weight })}/>
    </div>
    <input className="tag-note" value={tag.note || ''} onChange={(event) => onChange({ note: event.target.value })} placeholder="备注（可选）"/>
  </article>;
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

  useEffect(() => {
    if (!scopes.some((item) => item.key === scopeKey)) setScopeKey('base:prompt');
  }, [scopeKey, scopes, setScopeKey]);

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
    setAIStatus({ type: 'progress', text: `正在用 AI 翻译 ${targets.length} 个 Tag…` });
    const result = await studio.translateTags(targets.map((tag) => tag.tag));
    setTranslatingIds((current) => {
      const next = new Set(current);
      targets.forEach((tag) => next.delete(tag.id));
      return next;
    });
    if (!result.ok) { setAIStatus({ type: 'error', text: result.error }); return; }
    const translated = new Map(targets.map((tag, index) => [tag.id, result.translations[index]]));
    updateProject(updatePromptScope(project, scope.key, tags.map((tag) => translated.has(tag.id) ? { ...tag, translation: translated.get(tag.id) } : tag)));
    setAIStatus({ type: 'success', text: `${result.model} 已补齐 ${targets.length} 个译名` });
    showToast(`AI 已翻译 ${targets.length} 个 Tag`);
  };

  const missingTranslationIds = tags.filter((tag) => !tag.translation?.trim()).map((tag) => tag.id);
  const addTag = () => {
    if (!newTag.trim()) return;
    const created = parsePrompt(newTag)[0];
    if (!created) return;
    updateProject(updatePromptScope(project, scope.key, [...tags, created]));
    setNewTag('');
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
    <div className="add-tag"><input value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addTag()} placeholder="输入 tag，按 Enter 添加"/><button onClick={addTag}><Icon name="plus"/></button></div>
    <section className={`ai-channel ${showAISettings ? 'expanded' : ''}`}>
      <div className="ai-channel-bar">
        <span className="ai-signal"><Icon name="spark"/><i/></span>
        <span className="ai-channel-copy"><b>{aiSettings.model || 'AI 翻译未配置'}</b><small>{aiSettings.model ? 'OpenAI-compatible channel' : '配置 API 后可批量翻译'}</small></span>
        <button className="translate-missing" disabled={!missingTranslationIds.length || translatingIds.size > 0} onClick={() => translateTagIds(missingTranslationIds)}>{translatingIds.size ? '翻译中' : `翻译 ${missingTranslationIds.length}`}</button>
        <button className="ai-settings-toggle" onClick={() => setShowAISettings((value) => !value)} aria-label="AI 翻译设置"><Icon name="settings"/></button>
      </div>
      {showAISettings && <div className="ai-config">
        <label><span>API Base URL</span><input value={aiSettings.baseUrl} onChange={(event) => setAISettings((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.openai.com/v1"/></label>
        <label><span>API Key <em>{aiSettings.hasApiKey ? '已加密保存' : '未保存'}</em></span><div className="secret-input"><input type="password" value={aiSettings.apiKey} onChange={(event) => setAISettings((current) => ({ ...current, apiKey: event.target.value }))} placeholder={aiSettings.hasApiKey ? '留空则保留现有 Key' : 'sk-…'}/><button onClick={saveAISettings}>保存</button></div></label>
        <label><span>Model</span><div className="model-input"><input list="ai-model-list" value={aiSettings.model} onChange={(event) => setAISettings((current) => ({ ...current, model: event.target.value }))} placeholder="读取或输入模型 ID"/><datalist id="ai-model-list">{models.map((model) => <option key={model} value={model}/>)}</datalist><button onClick={loadModels} disabled={aiBusy === 'models'} title="读取模型列表"><Icon name="refresh"/></button></div></label>
        <div className="ai-config-actions"><button className="outline" onClick={testAIModel} disabled={Boolean(aiBusy)}>{aiBusy === 'test' ? '测试中…' : '测试模型'}</button><small>翻译时会把英文 Tag 发送到此 Base URL</small></div>
      </div>}
      {aiStatus && <div className={`ai-status ${aiStatus.type}`}>{aiStatus.text}</div>}
    </section>
    <div className="category-legend">{CATEGORY_OPTIONS.slice(0, 4).map((category) => <span key={category} className={`cat-${category.toLowerCase()}`}>{CATEGORY_LABELS[category]}<b>{tags.filter((tag) => tag.category === category).length}</b></span>)}</div>
    <div className="tag-stack">
      {tags.map((tag, index) => <TagCard key={tag.id} tag={tag} index={index} translating={translatingIds.has(tag.id)} dragging={draggingIndex === index} dropTarget={dropIndex === index && draggingIndex !== index} onTranslate={() => translateTagIds([tag.id])} onChange={(patch) => updateTag(index, patch)} onDelete={() => updateProject(updatePromptScope(project, scope.key, tags.filter((_, itemIndex) => itemIndex !== index)))} onPointerStart={beginPointerDrag} onPointerMove={movePointerDrag} onPointerEnd={endPointerDrag} onKeyboardMove={keyboardMove}/>)}
      {!tags.length && <div className="panel-empty"><Icon name="layers"/><strong>这里还没有 Tag</strong><span>从含 NovelAI V4 metadata 的图片自动恢复，或在上方逐个添加。</span></div>}
    </div>
  </div>;
}

function VibePanel({ project, updateProject }) {
  const addVibe = async () => {
    const vibe = await studio.chooseVibeImage();
    if (vibe) updateProject({ ...project, vibes: [...project.vibes, vibe] });
  };
  const updateVibe = (index, patch) => updateProject({ ...project, vibes: project.vibes.map((vibe, itemIndex) => itemIndex === index ? { ...vibe, ...patch } : vibe) });
  return <div className="panel-scroll vibe-panel">
    <div className="panel-intro"><div><strong>Vibe Transfer</strong><small>独立保存，不依赖图片 metadata</small></div><button className="small-primary" onClick={addVibe}><Icon name="plus"/>参考图</button></div>
    <div className="vibe-note"><span>V4 / V4.5</span>每张参考图的强度与信息提取量都会保存在当前作品中。</div>
    <div className="vibe-stack">
      {project.vibes.map((vibe, index) => <article className={`vibe-card ${!vibe.enabled ? 'disabled' : ''}`} key={vibe.id}>
        <div className="vibe-image"><img src={mediaUrl(vibe.thumbnail_path)} alt="Vibe reference"/><label><input type="checkbox" checked={Boolean(vibe.enabled)} onChange={(event) => updateVibe(index, { enabled: event.target.checked })}/><span>{vibe.enabled ? '启用' : '停用'}</span></label></div>
        <div className="vibe-controls">
          <label><span>Reference Strength <b>{Number(vibe.strength).toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" value={vibe.strength} onChange={(event) => updateVibe(index, { strength: Number(event.target.value) })}/></label>
          <label><span>Information Extracted <b>{Number(vibe.information_extracted).toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" value={vibe.information_extracted} onChange={(event) => updateVibe(index, { information_extracted: Number(event.target.value) })}/></label>
          <button className="text-danger" onClick={() => updateProject({ ...project, vibes: project.vibes.filter((_, itemIndex) => itemIndex !== index) })}><Icon name="trash"/>移除参考图</button>
        </div>
      </article>)}
      {!project.vibes.length && <div className="panel-empty tall"><div className="vibe-orbit"><Icon name="image"/></div><strong>添加 Vibe 参考图</strong><span>保存风格参考与两项权重，下次打开可原样恢复。</span><button className="outline" onClick={addVibe}>选择参考图片</button></div>}
    </div>
  </div>;
}

function MetadataPanel({ project, updateProject }) {
  const metadata = project.metadata;
  const update = (patch) => updateProject({ ...project, metadata: { ...metadata, ...patch } });
  return <div className="panel-scroll metadata-panel">
    <div className="panel-intro"><div><strong>Generation Metadata</strong><small>从原图读取，可手动修正</small></div><span className="metadata-badge">PNG</span></div>
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

function Inspector({ tab, setTab, project, updateProject, showToast, promptScopeKey, setPromptScopeKey, focusTagId }) {
  return <aside className="inspector">
    <nav className="inspector-tabs">
      <button className={tab === 'tags' ? 'active' : ''} onClick={() => setTab('tags')}><Icon name="layers"/>Prompt</button>
      <button className={tab === 'vibe' ? 'active' : ''} onClick={() => setTab('vibe')}><Icon name="image"/>Vibe <i>{project.vibes.length || ''}</i></button>
      <button className={tab === 'metadata' ? 'active' : ''} onClick={() => setTab('metadata')}><Icon name="info"/>参数</button>
    </nav>
    {tab === 'tags' && <TagsPanel project={project} updateProject={updateProject} showToast={showToast} scopeKey={promptScopeKey} setScopeKey={setPromptScopeKey} focusTagId={focusTagId}/>}
    {tab === 'vibe' && <VibePanel project={project} updateProject={updateProject}/>}
    {tab === 'metadata' && <MetadataPanel project={project} updateProject={updateProject}/>}
  </aside>;
}

export default function App() {
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('tags');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeVersion, setActiveVersion] = useState('current');
  const [workspaceMode, setWorkspaceMode] = useState('image');
  const [promptScopeKey, setPromptScopeKey] = useState('base:prompt');
  const [focusTagId, setFocusTagId] = useState(null);
  const saveTimers = useRef(new Map());
  const shortcutModifier = useMemo(() => navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl', []);

  useEffect(() => {
    studio.loadLibrary().then((items) => {
      const repairedItems = items.map((project) => {
        const tags = repairLegacyPromptTags(project.tags, project.metadata.prompt_raw);
        const promptStructure = normalizePromptStructure(project.prompt_structure, project.metadata);
        const repaired = syncProjectPromptMetadata({ ...project, tags, prompt_structure: promptStructure });
        const needsMigration = tags !== project.tags || !project.prompt_structure?.base_undesired_tags;
        if (needsMigration) studio.updateProject(repaired);
        return repaired;
      });
      setProjects(repairedItems);
      setActiveId(repairedItems[0]?.id || null);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const keydown = (event) => {
      const commandKey = event.metaKey || event.ctrlKey;
      if (commandKey && event.key.toLowerCase() === 'i') { event.preventDefault(); importImages(); }
      if (commandKey && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('.search-box input')?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const activeProject = projects.find((project) => project.id === activeId) || null;
  const filteredProjects = useMemo(() => {
    const needles = expandSearch(query);
    if (!needles.length) return projects;
    return projects.filter((project) => [project.name, ...allPromptTags(project).flatMap((tag) => [tag.tag, tag.translation, tag.category, CATEGORY_LABELS[tag.category]])].some((value) => needles.some((needle) => normalizeSearch(value).includes(needle))));
  }, [projects, query]);

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(''), 2200);
  };

  const importImages = async () => {
    const imported = await studio.importImages();
    if (!imported.length) return;
    setProjects((current) => [...imported, ...current]);
    setActiveId(imported[0].id);
    setWorkspaceMode('image');
    setPromptScopeKey('base:prompt');
    showToast(`已导入 ${imported.length} 个作品`);
  };

  const updateProject = (nextProject) => {
    const updated = {
      ...syncProjectPromptMetadata(nextProject),
      updated_at: new Date().toISOString(),
    };
    setProjects((current) => current.map((project) => project.id === updated.id ? updated : project));
    window.clearTimeout(saveTimers.current.get(updated.id));
    saveTimers.current.set(updated.id, window.setTimeout(async () => {
      await studio.updateProject(updated);
      saveTimers.current.delete(updated.id);
    }, 450));
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(formatPositivePrompt(activeProject));
    showToast('Prompt 已复制，可直接粘贴到 NovelAI');
  };

  const saveVersion = () => {
    const versionNumber = activeProject.versions.length + 1;
    const previousSnapshot = activeProject.versions[0] ? JSON.parse(activeProject.versions[0].snapshot_json) : { tags: [], prompt_structure: { base_undesired_tags: [], characters: [] } };
    const previousNames = new Set(allPromptTags(restorePromptSnapshot(activeProject, previousSnapshot)).map((tag) => tag.tag));
    const currentNames = new Set(allPromptTags(activeProject).map((tag) => tag.tag));
    const added = [...currentNames].filter((tag) => !previousNames.has(tag));
    const removed = [...previousNames].filter((tag) => !currentNames.has(tag));
    const summaryParts = [added.length && `+${added.length} tag`, removed.length && `−${removed.length} tag`].filter(Boolean);
    const version = {
      id: crypto.randomUUID(),
      label: `Version ${versionNumber}`,
      prompt_text: formatPositivePrompt(activeProject),
      snapshot_json: JSON.stringify(promptSnapshot(activeProject)),
      change_summary: summaryParts.join(' · ') || '参数或顺序调整',
      image_path: activeProject.image_path,
      created_at: new Date().toISOString(),
    };
    updateProject({ ...activeProject, versions: [version, ...activeProject.versions] });
    setActiveVersion(version.id);
    showToast(`Version ${versionNumber} 已保存`);
  };

  const restoreVersion = (versionId) => {
    const version = activeProject.versions.find((item) => item.id === versionId);
    if (!version) return;
    updateProject(restorePromptSnapshot(activeProject, JSON.parse(version.snapshot_json)));
    setActiveVersion('current');
    showToast(`${version.label} 已恢复为当前工作稿`);
  };

  const openPromptOverview = (projectId) => {
    setActiveId(projectId);
    setActiveVersion('current');
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

  return <div className="app-shell">
    <LibraryPanel projects={filteredProjects} activeId={activeId} setActiveId={(id) => { setActiveId(id); setActiveVersion('current'); setPromptScopeKey('base:prompt'); }} query={query} setQuery={setQuery} onImport={importImages} onOpenPromptOverview={openPromptOverview} shortcutModifier={shortcutModifier}/>
    {activeProject ? <>
      <PreviewStage project={activeProject} mode={workspaceMode} setMode={setWorkspaceMode} onCopy={copyPrompt} onReveal={studio.revealFile} onEditTag={openTagEditor} updateProject={updateProject} saveVersion={saveVersion} restoreVersion={restoreVersion} activeVersion={activeVersion} setActiveVersion={setActiveVersion}/>
      <Inspector tab={tab} setTab={setTab} project={activeProject} updateProject={updateProject} showToast={showToast} promptScopeKey={promptScopeKey} setPromptScopeKey={setPromptScopeKey} focusTagId={focusTagId}/>
    </> : <EmptyState onImport={importImages}/>}
    {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
  </div>;
}
