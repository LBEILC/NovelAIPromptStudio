import { Accordion, AccordionItem, ActionIcon, DatePicker as LobeDatePicker, DraggablePanel as LobeDraggablePanel, Empty as LobeEmpty, Highlighter, Popover, PopoverGroup, SearchBar as LobeSearchBar } from '@lobehub/ui';
import { Button as LobeButton, Input as LobeInput, Segmented, Select as LobeSelect, Slider, SplitButton, Switch as LobeSwitch } from '@lobehub/ui/base-ui';
import dayjs from 'dayjs';
import { AnimatePresence, motion } from 'motion/react';
import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon, { getIconComponent } from './components/Icon.jsx';
import ImagePreviewToolbar from './components/ImagePreviewToolbar.jsx';
import ImageStage, { mediaUrl } from './components/ImageStage.jsx';
import SelectionMark from './components/SelectionMark.jsx';
import { galleryEmptyState, galleryGroupMember, galleryScrubMemberIndex, shouldCollapseGalleryPreview } from './lib/gallery.js';
import {
  DEFAULT_GALLERY_FILTERS,
  GALLERY_DATE_PRESETS,
  galleryActiveFilterCount,
  galleryFilterOptions as buildGalleryFilterOptions,
  hasActiveGalleryFilters,
  normalizeGalleryFilters,
} from './lib/galleryFilters.js';
import {
  GALLERY_CARD_SIZE_MAX,
  GALLERY_CARD_SIZE_MIN,
  GALLERY_CARD_SIZE_STEP,
  GALLERY_CARD_SIZE_WHEEL_THRESHOLD,
  galleryCardSizeFromWheel,
  galleryDensityForSize,
  isGalleryWheelZoomGesture,
  normalizeGalleryCardSize,
  readGalleryCardSize,
  writeGalleryCardSize,
} from './lib/galleryLayout.js';
import { fitTabPreviewCanvas } from './lib/imagePreview.js';
import {
  DEFAULT_GALLERY_GROUPING,
  GALLERY_PROMPT_SCOPES,
  GALLERY_PROMPT_SCOPE_LABELS,
  GALLERY_SIMILARITY_MAX,
  GALLERY_SIMILARITY_MIN,
  galleryGroupingStatusLabel,
} from './lib/galleryGrouping.js';
import {
  GALLERY_PREVIEW_PANEL_EXPANDED_KEY,
  GALLERY_PREVIEW_PANEL_PINNED_KEY,
  GALLERY_PREVIEW_PANEL_WIDTH_KEY,
  GALLERY_COLLECTIONS_PANEL_EXPANDED_KEY,
  GALLERY_COLLECTIONS_PANEL_WIDTH_KEY,
  panelStorage,
  panelWidthForViewport,
  readPanelBoolean,
  readPanelWidth,
  writePanelBoolean,
  writePanelWidth,
} from './lib/panelLayout.js';
import { countPromptTags, positiveRawPromptScopes } from './lib/promptStructure.js';
import { isTextEditingTarget } from './lib/contextMenu.js';
import { gallerySmartCollectionDefaultName } from './lib/galleryCollections.js';
import { galleryCardLayoutTransition, galleryCardTransitionDelay } from './lib/galleryTransition.js';
import { MOTION_EASE_OUT, useStudioReducedMotion } from './lib/motion.js';

function formatDate(value) {
  if (!value) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function promptScopeTitle(scope) {
  if (scope.kind === 'base') return '基础 Prompt';
  const fallback = `角色 ${(scope.characterIndex ?? 0) + 1}`;
  const label = String(scope.character?.label || '').trim();
  return `${/^Character \d+$/i.test(label) || !label ? fallback : label} Prompt`;
}

function RawPromptSections({ project }) {
  const scopes = positiveRawPromptScopes(project);
  if (!scopes.length) return <div className="gallery-preview-prompt-empty">没有检测到 Prompt</div>;
  const baseScope = scopes.find((scope) => scope.kind === 'base');
  return <Accordion
    className="gallery-preview-prompt-accordion"
    defaultExpandedKeys={baseScope ? [baseScope.key] : [scopes[0].key]}
    gap={8}
    keepContentMounted={false}
  >
    {scopes.map((scope) => <AccordionItem
      classNames={{ content: 'gallery-preview-prompt-content', header: 'gallery-preview-prompt-header' }}
      itemKey={scope.key}
      key={scope.key}
      padding={0}
      title={<span className="gallery-preview-prompt-title"><strong>{promptScopeTitle(scope)}</strong><small>{scope.tags.length} Tags</small></span>}
      variant="outlined"
    >
      <Highlighter
        className="gallery-preview-prompt-code"
        copyable
        language="plaintext"
        showLanguage={false}
        variant="filled"
        wrap
      >{scope.raw_prompt}</Highlighter>
    </AccordionItem>)}
  </Accordion>;
}

function ImportButton({ importing, onImport, onImportClipboard }) {
  return <SplitButton loading={importing} type="primary">
    <SplitButton.Main icon={<Icon name="plus"/>} onClick={onImport}>
      {importing ? '正在导入…' : '导入图片'}
    </SplitButton.Main>
    <SplitButton.Menu
      aria-label="其他导入方式"
      items={[{ key: 'clipboard', label: '从剪贴板导入', onClick: onImportClipboard }]}
      placement="bottomRight"
    />
  </SplitButton>;
}

const GALLERY_GROUPING_DESCRIPTIONS = {
  separate: '每张图片独立显示',
  full: '角色、位置与完整 Prompt 必须相同',
  base: '忽略角色 Prompt 与位置',
  similar: '按基础 Prompt 的 Tag 相似度归组',
};

export function GalleryGroupingControl({ grouping = DEFAULT_GALLERY_GROUPING, onChange }) {
  const status = galleryGroupingStatusLabel(grouping);
  const content = <div className="gallery-grouping-panel">
    <strong className="gallery-grouping-heading">分组方式</strong>
    <div aria-label="图片自动分组方式" className="gallery-grouping-options" role="radiogroup">
      {GALLERY_PROMPT_SCOPES.map((scope) => {
        const selected = grouping.promptScope === scope;
        return <button
          aria-checked={selected}
          className={`gallery-grouping-option ${selected ? 'selected' : ''}`}
          key={scope}
          onClick={() => onChange({ promptScope: scope })}
          role="radio"
          type="button"
        >
          <span aria-hidden="true" className="gallery-grouping-radio">{selected && <Icon name="check" size={11}/>}</span>
          <span><strong>{GALLERY_PROMPT_SCOPE_LABELS[scope]}</strong><small>{GALLERY_GROUPING_DESCRIPTIONS[scope]}</small></span>
        </button>;
      })}
    </div>
    {grouping.promptScope === 'similar' && <div className="gallery-similarity-control">
      <div><span>最低相似度</span><strong>{grouping.similarityThreshold}%</strong></div>
      <Slider
        aria-label="基础 Prompt 最低相似度"
        defaultValue={grouping.similarityThreshold}
        getAriaValueText={(value) => `${value}%`}
        key={grouping.similarityThreshold}
        max={GALLERY_SIMILARITY_MAX}
        min={GALLERY_SIMILARITY_MIN}
        onChangeComplete={(value) => onChange({ similarityThreshold: value })}
        step={5}
      />
      <div className="gallery-similarity-scale"><span>宽松</span><span>严格</span></div>
    </div>}
    <div className="gallery-grouping-vibe-row">
      <div><strong>跨 Vibe 合并</strong><small>{grouping.promptScope === 'separate' ? '全部分开时不适用' : '允许不同 Vibe 进入同一组'}</small></div>
      <LobeSwitch
        aria-label="跨 Vibe 合并"
        checked={grouping.promptScope !== 'separate' && grouping.mergeVibes}
        disabled={grouping.promptScope === 'separate'}
        onChange={(checked) => onChange({ mergeVibes: checked })}
        size="small"
      />
    </div>
  </div>;

  return <Popover
    arrow
    className="gallery-grouping-popover"
    content={content}
    placement="bottomRight"
    standalone
    trigger="click"
  >
    <LobeButton aria-label={`图库分组设置，当前：${status}`} icon={<Icon name="layers" size={14}/>} size="small">
      分组：{status}
    </LobeButton>
  </Popover>;
}

function gallerySelectOptions(items = []) {
  return items.map((item) => ({ label: item.label, title: `${item.label} · ${item.count} 张`, value: item.value }));
}

function GalleryFilterSelect({ items, ...props }) {
  const countByValue = new Map(items.map((item) => [item.value, item.count]));
  return <LobeSelect
    {...props}
    listHeight={260}
    optionRender={(option) => <span className="gallery-filter-option"><span>{option.label}</span><small>{countByValue.get(option.value) || 0}</small></span>}
    options={gallerySelectOptions(items)}
    popupMatchSelectWidth={360}
    showSearch
    size="small"
  />;
}

function galleryDatePopupContainer(trigger) {
  return trigger.closest('.gallery-filter-popover') || document.body;
}

const EMPTY_GALLERY_FILTER_OPTIONS = Object.freeze({ models: [], tags: [], vibes: [] });
const EMPTY_GALLERY_PROJECTS = Object.freeze([]);
const GALLERY_FILTER_OPTIONS_CACHE = new WeakMap();

function cachedGalleryFilterOptions(cacheSource, scopeKey) {
  return GALLERY_FILTER_OPTIONS_CACHE.get(cacheSource)?.get(scopeKey);
}

function storeGalleryFilterOptions(cacheSource, scopeKey, options) {
  let cache = GALLERY_FILTER_OPTIONS_CACHE.get(cacheSource);
  if (!cache) {
    cache = new Map();
    GALLERY_FILTER_OPTIONS_CACHE.set(cacheSource, cache);
  }
  cache.set(scopeKey, options);
}

function scheduleGalleryIdleWork(callback) {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: 120 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, 0);
  return () => window.clearTimeout(id);
}

export function GalleryFilterControl({ filters = DEFAULT_GALLERY_FILTERS, loading = false, onChange, onOpenChange, open, options = EMPTY_GALLERY_FILTER_OPTIONS }) {
  const value = normalizeGalleryFilters(filters);
  const activeCount = galleryActiveFilterCount(value);
  const tagOptions = options.tags || [];
  const content = <div className="gallery-filter-panel">
    <header className="gallery-filter-header">
      <div><strong>筛选图片</strong><small>{loading ? '正在准备筛选选项' : '不同筛选项之间同时满足'}</small></div>
      <LobeButton disabled={!activeCount} onClick={() => onChange({ ...DEFAULT_GALLERY_FILTERS, query: value.query })} size="small" type="text">清除</LobeButton>
    </header>
    <section className="gallery-filter-section">
      <div className="gallery-filter-label">
        <span>包含 Tag</span>
        <Segmented
          aria-label="包含 Tag 的匹配方式"
          onChange={(tagMatch) => onChange({ tagMatch })}
          options={[{ label: '全部', value: 'all' }, { label: '任意', value: 'any' }]}
          size="small"
          value={value.tagMatch}
        />
      </div>
      <GalleryFilterSelect
        aria-label="必须包含的 Tag"
        items={tagOptions}
        loading={loading}
        mode="multiple"
        onChange={(includeTags) => onChange({ includeTags: Array.isArray(includeTags) ? includeTags : [] })}
        placeholder="选择 Tag"
        value={value.includeTags}
      />
    </section>
    <section className="gallery-filter-section">
      <span className="gallery-filter-label">排除 Tag</span>
      <GalleryFilterSelect
        aria-label="要排除的 Tag"
        items={tagOptions}
        loading={loading}
        mode="multiple"
        onChange={(excludeTags) => onChange({ excludeTags: Array.isArray(excludeTags) ? excludeTags : [] })}
        placeholder="选择不想出现的 Tag"
        value={value.excludeTags}
      />
    </section>
    <div className="gallery-filter-fields">
      <section className="gallery-filter-section">
        <span className="gallery-filter-label">模型</span>
        <GalleryFilterSelect
          aria-label="生成模型"
          items={options.models || []}
          loading={loading}
          mode="multiple"
          onChange={(models) => onChange({ models: Array.isArray(models) ? models : [] })}
          placeholder="不限模型"
          value={value.models}
        />
      </section>
      <section className="gallery-filter-section">
        <span className="gallery-filter-label">Vibe</span>
        <GalleryFilterSelect
          aria-label="Vibe"
          items={options.vibes || []}
          loading={loading}
          mode="multiple"
          onChange={(vibes) => onChange({ vibes: Array.isArray(vibes) ? vibes : [] })}
          placeholder="不限 Vibe"
          value={value.vibes}
        />
      </section>
    </div>
    <section className="gallery-filter-section">
      <span className="gallery-filter-label">导入时间</span>
      <LobeSelect
        aria-label="导入时间"
        onChange={(datePreset) => onChange({ datePreset: datePreset || 'all' })}
        options={GALLERY_DATE_PRESETS}
        size="small"
        value={value.datePreset}
      />
      {value.datePreset === 'custom' && <div className="gallery-filter-date-range">
        <label><span>从</span><LobeDatePicker
          allowClear
          aria-label="最早导入日期"
          format="YYYY-MM-DD"
          getPopupContainer={galleryDatePopupContainer}
          onChange={(_date, dateString) => onChange({ dateFrom: String(dateString || '') })}
          placeholder="开始日期"
          size="small"
          value={value.dateFrom ? dayjs(value.dateFrom) : null}
        /></label>
        <label><span>至</span><LobeDatePicker
          allowClear
          aria-label="最晚导入日期"
          format="YYYY-MM-DD"
          getPopupContainer={galleryDatePopupContainer}
          onChange={(_date, dateString) => onChange({ dateTo: String(dateString || '') })}
          placeholder="结束日期"
          size="small"
          value={value.dateTo ? dayjs(value.dateTo) : null}
        /></label>
      </div>}
    </section>
  </div>;

  return <Popover
    arrow
    className="gallery-filter-popover"
    content={content}
    onOpenChange={onOpenChange}
    open={open}
    placement="bottom"
    standalone
    trigger="click"
  >
    <LobeButton
      aria-label={`图库筛选${activeCount ? `，已启用 ${activeCount} 项` : '，未启用'}`}
      aria-pressed={Boolean(activeCount)}
      className={activeCount ? 'gallery-filter-trigger active' : 'gallery-filter-trigger'}
      icon={<Icon name="filter" size={14}/>}
      size="small"
    >
      筛选{activeCount ? ` · ${activeCount}` : ''}
    </LobeButton>
  </Popover>;
}

function GalleryFilterOptionsControl({ cacheSource = EMPTY_GALLERY_PROJECTS, filters, onChange, projects = EMPTY_GALLERY_PROJECTS, scopeKey }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, options: EMPTY_GALLERY_FILTER_OPTIONS, scopeKey: '', source: null });
  const current = state.source === cacheSource && state.scopeKey === scopeKey
    ? state
    : { loading: open, options: EMPTY_GALLERY_FILTER_OPTIONS };

  useEffect(() => {
    if (!open) return undefined;
    const cached = cachedGalleryFilterOptions(cacheSource, scopeKey);
    if (cached) {
      setState({ loading: false, options: cached, scopeKey, source: cacheSource });
      return undefined;
    }

    let active = true;
    setState({ loading: true, options: EMPTY_GALLERY_FILTER_OPTIONS, scopeKey, source: cacheSource });
    let cancelIdle = () => {};
    const frame = window.requestAnimationFrame(() => {
      cancelIdle = scheduleGalleryIdleWork(() => {
        const options = buildGalleryFilterOptions(projects);
        storeGalleryFilterOptions(cacheSource, scopeKey, options);
        if (!active) return;
        startTransition(() => setState({ loading: false, options, scopeKey, source: cacheSource }));
      });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      cancelIdle();
    };
  }, [cacheSource, open, projects, scopeKey]);

  return <GalleryFilterControl
    filters={filters}
    loading={current.loading}
    onChange={onChange}
    onOpenChange={setOpen}
    open={open}
    options={current.options}
  />;
}

function CollectionMembershipControl({ className, collections = [], projectIds = [], onChange, size, label = '加入收藏集' }) {
  const manualCollections = collections.filter((collection) => collection.kind === 'manual');
  if (!projectIds.length) return null;
  const content = <div className="gallery-collection-picker">
    <header><strong>加入普通收藏集</strong><small>一张图片可以加入多个收藏集</small></header>
    {manualCollections.length ? <div className="gallery-collection-picker-list">{manualCollections.map((collection) => {
      const members = new Set(collection.member_ids || []);
      const included = projectIds.filter((id) => members.has(id)).length;
      return <button
        disabled={included === projectIds.length}
        key={collection.id}
        onClick={() => onChange(collection.id, projectIds, 'add')}
        type="button"
      >
        <Icon name="folder" size={14}/><span>{collection.name}</span><small>{included === projectIds.length ? '已加入' : included ? `${included}/${projectIds.length}` : `${collection.image_count ?? collection.member_ids?.length ?? 0} 张`}</small>
      </button>;
    })}</div> : <p>还没有普通收藏集，可在左侧收藏集面板中新建。</p>}
  </div>;
  return <Popover arrow content={content} placement="bottom" standalone trigger="click">
    <LobeButton className={className} icon={<Icon name="folderPlus" size={14}/>} size={size}>{label}</LobeButton>
  </Popover>;
}

function collectionRuleCount(collection) {
  const filters = normalizeGalleryFilters(collection.filters);
  return galleryActiveFilterCount(filters) + (filters.query.trim() ? 1 : 0);
}

function GalleryCollectionsPanel({
  activeCollection,
  collections = [],
  editingSmartCollection,
  filters,
  onCreate,
  onDelete,
  onRename,
  onRulesEdit,
  onSelect,
}) {
  const [editor, setEditor] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const manual = collections.filter((collection) => collection.kind === 'manual');
  const smart = collections.filter((collection) => collection.kind === 'smart');
  const canSaveSmart = !activeCollection && !editingSmartCollection && hasActiveGalleryFilters(filters);
  const beginEditor = (mode, collection = null) => {
    setEditor({ mode, collection });
    setNameDraft(collection?.name || (mode === 'smart' ? gallerySmartCollectionDefaultName(filters) : ''));
  };
  const saveEditor = async () => {
    const name = nameDraft.trim();
    if (!name || saving) return;
    setSaving(true);
    const saved = editor.mode === 'rename'
      ? await onRename(editor.collection, name)
      : await onCreate(editor.mode === 'smart' ? 'smart' : 'manual', name);
    setSaving(false);
    if (saved) setEditor(null);
  };
  const section = (title, items, empty) => <section className="gallery-collections-section">
    <h3>{title}</h3>
    {items.length ? <div className="gallery-collections-list">{items.map((collection) => <div
      aria-current={activeCollection?.id === collection.id ? 'page' : undefined}
      className={activeCollection?.id === collection.id ? 'active' : editingSmartCollection?.id === collection.id ? 'editing' : ''}
      key={collection.id}
      onClick={() => onSelect(collection.id)}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(collection.id); } }}
      role="button"
      tabIndex={0}
    >
      <Icon name={collection.kind === 'smart' ? 'spark' : 'folder'} size={15}/>
      <span><strong>{collection.name}</strong><small>{editingSmartCollection?.id === collection.id ? '正在编辑规则' : collection.kind === 'smart' ? `${collectionRuleCount(collection)} 条规则` : '普通收藏集'}</small></span>
      <em>{collection.image_count == null ? '—' : collection.image_count}</em>
      <span className="gallery-collection-row-actions">
        {collection.kind === 'smart' && <ActionIcon
          aria-label={`编辑“${collection.name}”的规则`}
          icon={<Icon name="filter" size={13}/>}
          onClick={(event) => { event.stopPropagation(); onRulesEdit(collection); }}
          size="small"
          title="编辑规则"
        />}
        <ActionIcon aria-label={`重命名“${collection.name}”`} icon={<Icon name="edit" size={13}/>} onClick={(event) => { event.stopPropagation(); beginEditor('rename', collection); }} size="small" title="重命名"/>
        <ActionIcon aria-label={`删除“${collection.name}”`} icon={<Icon name="trash" size={13}/>} onClick={(event) => { event.stopPropagation(); onDelete(collection); }} size="small" title="删除收藏集"/>
      </span>
    </div>)}</div> : <p className="gallery-collections-empty">{empty}</p>}
  </section>;

  return <div className="gallery-collections-panel">
    <header className="gallery-collections-header">
      <strong>收藏集</strong>
      <Popover
        arrow
        content={<div className="gallery-collections-create-menu">
          <button onClick={() => beginEditor('manual')} type="button"><Icon name="folder" size={15}/><span><strong>新建普通收藏集</strong><small>手动添加或移除图片</small></span></button>
          <button disabled={!canSaveSmart} onClick={() => beginEditor('smart')} type="button"><Icon name="spark" size={15}/><span><strong>保存为智能收藏集</strong><small>{canSaveSmart ? '使用当前搜索与筛选条件' : activeCollection ? '请先返回全部图片' : '请先设置搜索或筛选条件'}</small></span></button>
        </div>}
        placement="bottomLeft"
        standalone
        trigger="click"
      ><ActionIcon aria-label="新建收藏集" icon={<Icon name="plus"/>} title="新建收藏集"/></Popover>
    </header>
    {editor && <div className="gallery-collection-editor">
      <label>{editor.mode === 'rename' ? '重命名收藏集' : editor.mode === 'smart' ? '智能收藏集名称' : '普通收藏集名称'}</label>
      <LobeInput
        autoFocus
        maxLength={80}
        onChange={(event) => setNameDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') saveEditor(); if (event.key === 'Escape') setEditor(null); }}
        placeholder={editor.mode === 'smart' ? '按当前筛选自动生成，可直接修改' : '例如：构图参考'}
        size="small"
        value={nameDraft}
      />
      <div><LobeButton disabled={!nameDraft.trim()} loading={saving} onClick={saveEditor} size="small" type="primary">保存</LobeButton><LobeButton onClick={() => setEditor(null)} size="small" type="text">取消</LobeButton></div>
    </div>}
    <button className={!activeCollection && !editingSmartCollection ? 'gallery-collection-all active' : 'gallery-collection-all'} onClick={() => onSelect('')} type="button">
      <Icon name="library" size={15}/><span>全部图片</span>
    </button>
    <div className="gallery-collections-scroll">
      {section('普通收藏集', manual, '还没有普通收藏集')}
      {section('智能收藏集', smart, '把当前搜索与筛选保存为自动更新的收藏集')}
    </div>
  </div>;
}

export function BatchToolbar({ view, selectedGroups, selectedImages, selectedProjectIds = [], collections = [], activeCollection, onCollectionProjectsChange, onTrash, onRestore, onPermanentDelete, onClear }) {
  if (!selectedGroups) return null;
  return <div className="gallery-selection-bar">
    <span>已选 <b>{selectedGroups}</b> 组 · <b>{selectedImages}</b> 张图片</span>
    {view === 'trash' ? <>
      <LobeButton icon={<Icon name="restore" size={14}/>} onClick={() => onRestore()} size="small">恢复</LobeButton>
      <LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => onPermanentDelete()} size="small">永久删除</LobeButton>
    </> : <>
      <LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => onTrash()} size="small" type="fill">移入回收站</LobeButton>
      <CollectionMembershipControl collections={collections} onChange={onCollectionProjectsChange} projectIds={selectedProjectIds} size="small"/>
      {activeCollection?.kind === 'manual' && <LobeButton onClick={() => onCollectionProjectsChange(activeCollection.id, selectedProjectIds, 'remove')} size="small">移出当前收藏集</LobeButton>}
    </>}
    <LobeButton onClick={() => onClear()} size="small" type="text">取消选择</LobeButton>
  </div>;
}

export function GalleryCardHoverPreview({ group, project = group.cover }) {
  const width = Number(project.metadata?.width || 0);
  const height = Number(project.metadata?.height || 0);
  const memberIndex = Math.max(0, (group.members || []).findIndex((member) => member.id === project.id));
  const previewCanvas = fitTabPreviewCanvas(width, height, { maxWidth: 320, maxHeight: 360, minWidth: 220, minHeight: 180 });
  return <div
    className="gallery-card-hover-preview"
    style={{
      '--gallery-card-hover-ratio': `${previewCanvas.width} / ${previewCanvas.height}`,
      '--gallery-card-hover-width': `${previewCanvas.width}px`,
    }}
  >
    <div className="gallery-card-hover-media">
      <img alt="" key={project.id} src={mediaUrl(project.thumbnail_path || project.image_path)}/>
    </div>
    {group.count > 1 && <div className="gallery-card-hover-scrub" aria-hidden="true">
      <i style={{ '--gallery-card-hover-progress': (memberIndex + 1) / group.count }}/>
    </div>}
    <div className="gallery-card-hover-meta">
      <span>{width || '—'} × {height || '—'} · {countPromptTags(project)} Tags</span>
      <span>{group.count > 1 ? `${memberIndex + 1} / ${group.count} · ` : ''}{formatDate(project.created_at)}</span>
    </div>
  </div>;
}

const GALLERY_HOVER_POSITIONER_STYLES = { root: { pointerEvents: 'none' } };

function GalleryThumbnail({ alt = '', className = '', src, ...imageProps }) {
  const [loaded, setLoaded] = useState(false);
  return <img
    {...imageProps}
    alt={alt}
    className={`${className} ${loaded ? 'is-loaded' : ''}`.trim()}
    decoding="async"
    loading="lazy"
    onLoad={() => setLoaded(true)}
    src={src}
  />;
}

const GALLERY_RESULTS_VARIANTS = {
  enter: { opacity: 1 },
  visible: { opacity: 1 },
  exit: { opacity: 1, transition: { when: 'afterChildren' } },
};

const GALLERY_CARD_TRANSITION_VARIANTS = {
  enter: ({ reduceMotion }) => ({ opacity: reduceMotion ? 1 : 0 }),
  visible: ({ index, reduceMotion }) => ({
    opacity: 1,
    transition: reduceMotion ? { duration: 0 } : {
      delay: galleryCardTransitionDelay(index),
      duration: 0.14,
      ease: MOTION_EASE_OUT,
    },
  }),
  exit: ({ index, reduceMotion }) => ({
    opacity: 0,
    transition: reduceMotion ? { duration: 0 } : {
      delay: galleryCardTransitionDelay(index, 'exit'),
      duration: 0.08,
      ease: 'easeIn',
    },
  }),
};

function GalleryResultsSurface({ children, className, style }) {
  return <motion.div
    animate="visible"
    className={className}
    exit="exit"
    initial="enter"
    style={style}
    variants={GALLERY_RESULTS_VARIANTS}
  >{children}</motion.div>;
}

function DelayedGalleryStatus({ active, loading }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setVisible(true), 140);
    return () => window.clearTimeout(timer);
  }, [active]);
  if (!visible) return null;
  return <div aria-live="polite" className="gallery-update-status" role="status">
    <Icon name="refresh" size={13}/><span>{loading ? '正在准备图库' : '正在更新图库'}</span>
  </div>;
}

function GalleryLoadingState({ reduceMotion }) {
  return <motion.div
    animate={{ opacity: 1 }}
    aria-live="polite"
    className="gallery-transition-loading"
    exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.08 } }}
    initial={{ opacity: reduceMotion ? 1 : 0 }}
    key="gallery-loading"
    role="status"
    transition={{ duration: reduceMotion ? 0 : 0.12, ease: MOTION_EASE_OUT }}
  >
    <span aria-hidden="true" className="gallery-transition-loading-icon"><Icon name="refresh" size={18}/></span>
    <span>正在加载图片</span>
  </motion.div>;
}

function preloadGalleryThumbnails(groups) {
  if (typeof Image === 'undefined') return;
  for (const group of groups.slice(0, GALLERY_INITIAL_RENDER_COUNT)) {
    for (const project of [group.cover, ...group.members.filter((member) => member.id !== group.cover?.id).slice(0, 2)]) {
      const image = new Image();
      image.decoding = 'async';
      image.src = mediaUrl(project.thumbnail_path || project.image_path);
    }
  }
}

export const GALLERY_INITIAL_RENDER_COUNT = 30;
export const GALLERY_RENDER_BATCH_SIZE = 24;

export function nextGalleryRenderCount(total, current = 0) {
  const safeTotal = Math.max(0, Number(total) || 0);
  if (current <= 0) return Math.min(safeTotal, GALLERY_INITIAL_RENDER_COUNT);
  return Math.min(safeTotal, current + GALLERY_RENDER_BATCH_SIZE);
}

export function GalleryCardView({ active, group, hoverProject = group.cover, selected, onOpenWorkbench, onPointerEnter, onPointerLeave, onPointerMove, onPreview, onSelect, onContextMenu }) {
  const project = group.cover;
  const stackMembers = group.members.filter((member) => member.id !== project.id).slice(0, 2);
  return <Popover content={<GalleryCardHoverPreview group={group} project={hoverProject}/>} placement="rightTop" styles={GALLERY_HOVER_POSITIONER_STYLES} trigger="hover"><article className={`gallery-card ${active ? 'active' : ''} ${selected ? 'selected' : ''} ${group.count > 1 ? 'grouped' : ''}`}>
    <button
      aria-label={group.count > 1 ? `预览图片组：${project.name}，共 ${group.count} 张` : `预览图片：${project.name}`}
      className="gallery-card-main"
      onClick={(event) => selected || event.ctrlKey || event.metaKey || event.shiftKey ? onSelect(event) : onPreview(hoverProject, event)}
      onContextMenu={onContextMenu}
      onDoubleClick={(event) => {
        if (!onOpenWorkbench || event.ctrlKey || event.metaKey || event.shiftKey) return;
        onOpenWorkbench(hoverProject);
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      type="button"
    >
      <span className="gallery-card-image">
        {stackMembers.map((member, index) => <GalleryThumbnail
          alt=""
          aria-hidden="true"
          className={`gallery-card-stack gallery-card-stack-${index + 1}`}
          decoding="async"
          key={member.id}
          loading="lazy"
          src={mediaUrl(member.thumbnail_path || member.image_path)}
        />)}
        <GalleryThumbnail key={mediaUrl(project.thumbnail_path || project.image_path)} src={mediaUrl(project.thumbnail_path || project.image_path)}/>
        {group.count > 1 && <span className="gallery-group-count"><b>{group.count}</b><span> 张</span></span>}
        <span aria-hidden="true" className="gallery-card-hover-name">{hoverProject.name}</span>
      </span>
    </button>
    <button
      aria-label={selected ? `取消选择 ${project.name}` : `选择 ${project.name}`}
      className="gallery-card-select"
      onClick={(event) => { event.stopPropagation(); onSelect(event); }}
      type="button"
    ><SelectionMark selected={selected}/></button>
  </article></Popover>;
}

export function GalleryCard(props) {
  const { group } = props;
  const [hoverProjectId, setHoverProjectId] = useState('');
  const scrubBoundsRef = useRef(null);
  const hoverProjectIdRef = useRef('');
  const activatedProjectIdRef = useRef('');
  const hoverProject = galleryGroupMember(group, hoverProjectId);
  const currentScrubProject = () => galleryGroupMember(group, hoverProjectIdRef.current);
  const resetScrub = () => {
    scrubBoundsRef.current = null;
    hoverProjectIdRef.current = '';
    setHoverProjectId('');
  };
  const updateScrubProject = (pointerX, bounds) => {
    if (group.count <= 1) return;
    const member = group.members[galleryScrubMemberIndex(pointerX, bounds.left, bounds.width, group.members.length)];
    if (!member) return;
    hoverProjectIdRef.current = member.id;
    setHoverProjectId((current) => current === member.id ? current : member.id);
  };

  return <GalleryCardView
    {...props}
    hoverProject={hoverProject}
    onOpenWorkbench={props.onOpenWorkbench ? (renderedProject) => {
      const projectId = hoverProjectIdRef.current || activatedProjectIdRef.current || renderedProject?.id;
      props.onOpenWorkbench(galleryGroupMember(group, projectId));
    } : undefined}
    onPointerEnter={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      scrubBoundsRef.current = bounds;
      activatedProjectIdRef.current = '';
      updateScrubProject(event.clientX, bounds);
    }}
    onPointerLeave={resetScrub}
    onPointerMove={(event) => {
      if (group.count <= 1) return;
      const bounds = scrubBoundsRef.current || event.currentTarget.getBoundingClientRect();
      scrubBoundsRef.current = bounds;
      updateScrubProject(event.clientX, bounds);
    }}
    onPreview={(renderedProject, event) => {
      const candidate = event?.detail === 0 ? galleryGroupMember(group) : currentScrubProject() || renderedProject;
      if (!activatedProjectIdRef.current || !event || event.detail <= 1) activatedProjectIdRef.current = candidate?.id || '';
      props.onPreview(galleryGroupMember(group, activatedProjectIdRef.current || candidate?.id));
    }}
  />;
}

const GalleryGridCard = memo(function GalleryGridCard({ actionsRef, active, canOpenWorkbench, group, selected }) {
  return <GalleryCard
    active={active}
    group={group}
    onContextMenu={(event) => actionsRef.current.onProjectContextMenu(event, group, () => actionsRef.current.requestRename(group))}
    onOpenWorkbench={canOpenWorkbench ? (project) => actionsRef.current.onOpenWorkbench(project) : undefined}
    onPreview={(project) => {
      actionsRef.current.updatePreviewExpanded(true);
      actionsRef.current.onPreview(group, project);
    }}
    onSelect={(event) => actionsRef.current.onToggleSelect(group, event)}
    selected={selected}
  />;
});

const GalleryGridSlot = memo(function GalleryGridSlot({ actionsRef, active, canOpenWorkbench, group, index, layoutSize, reduceMotion, selected }) {
  return <motion.div
    className="gallery-card-slot"
    custom={{ index, layoutSize, reduceMotion }}
    layout={!reduceMotion}
    layoutDependency={layoutSize}
    transition={{ layout: galleryCardLayoutTransition(reduceMotion) }}
    variants={GALLERY_CARD_TRANSITION_VARIANTS}
  >
    <GalleryGridCard
      actionsRef={actionsRef}
      active={active}
      canOpenWorkbench={canOpenWorkbench}
      group={group}
      selected={selected}
    />
  </motion.div>;
});

const ProgressiveGalleryGrid = memo(function ProgressiveGalleryGrid({ actionsRef, canOpenWorkbench, groups, layoutSize, onRenderingChange, previewGroupId, reduceMotion, selectedGroupIds }) {
  const [renderCount, setRenderCount] = useState(() => nextGalleryRenderCount(groups.length));
  const hasMore = renderCount < groups.length;
  const selectedIds = new Set(selectedGroupIds);

  useEffect(() => {
    onRenderingChange(hasMore);
  }, [hasMore, onRenderingChange]);

  useEffect(() => () => onRenderingChange(false), [onRenderingChange]);

  useEffect(() => {
    if (!hasMore) return undefined;
    return scheduleGalleryIdleWork(() => {
      startTransition(() => setRenderCount((current) => nextGalleryRenderCount(groups.length, current)));
    });
  }, [groups.length, hasMore, renderCount]);

  return groups.slice(0, renderCount).map((group, index) => <GalleryGridSlot
    actionsRef={actionsRef}
    active={previewGroupId === group.id}
    canOpenWorkbench={canOpenWorkbench}
    group={group}
    index={index}
    key={group.id}
    layoutSize={layoutSize}
    reduceMotion={reduceMotion}
    selected={selectedIds.has(group.id)}
  />);
});

export default function GalleryPage({
  activeCollection,
  collections = [],
  contentKey = '',
  editingSmartCollection,
  groups = [],
  filters,
  filterCacheSource,
  filterProjects,
  filterScopeKey = 'all',
  query,
  sort,
  view,
  previewGroup,
  preview,
  importing,
  loading = false,
  selectedGroupIds = [],
  selectedImageCount,
  grouping = DEFAULT_GALLERY_GROUPING,
  onClearSelection,
  onCollectionCreate,
  onCollectionDelete,
  onCollectionProjectsChange,
  onCollectionRename,
  onCollectionRulesCancel,
  onCollectionRulesEdit,
  onCollectionRulesSave,
  onCollectionSelect,
  onEmptyTrash,
  onImport,
  onImportClipboard,
  onNavigatePreview,
  onOpenWorkbench,
  onPreview,
  onProjectContextMenu,
  onWorkspaceContextMenu,
  onQueryChange,
  onRename,
  onRestore,
  onPermanentDelete,
  onReveal,
  onSetCover,
  onSelectAll,
  onSortChange,
  onToggleSelect,
  onTrash,
  onViewChange,
  onCopyImage,
  onDownloadImage,
  onGroupingChange,
  onFiltersChange,
  updating = false,
}) {
  const [previewExpanded, setPreviewExpanded] = useState(() => readPanelBoolean(
    panelStorage(),
    GALLERY_PREVIEW_PANEL_EXPANDED_KEY,
    Boolean(preview),
  ));
  const [previewPanelWidth, setPreviewPanelWidth] = useState(() => readPanelWidth(
    panelStorage(),
    GALLERY_PREVIEW_PANEL_WIDTH_KEY,
    panelWidthForViewport(globalThis.innerWidth, .28, 340, 560),
    340,
    560,
  ));
  const [previewPinned, setPreviewPinned] = useState(() => readPanelBoolean(
    panelStorage(),
    GALLERY_PREVIEW_PANEL_PINNED_KEY,
    false,
  ));
  const [collectionsExpanded, setCollectionsExpanded] = useState(() => readPanelBoolean(
    panelStorage(),
    GALLERY_COLLECTIONS_PANEL_EXPANDED_KEY,
    false,
  ));
  const [collectionsPanelWidth, setCollectionsPanelWidth] = useState(() => readPanelWidth(
    panelStorage(),
    GALLERY_COLLECTIONS_PANEL_WIDTH_KEY,
    panelWidthForViewport(globalThis.innerWidth, .18, 248, 360),
    248,
    360,
  ));
  const [galleryCardSize, setGalleryCardSize] = useState(() => readGalleryCardSize(panelStorage()));
  const [progressiveRendering, setProgressiveRendering] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const reduceMotion = useStudioReducedMotion();
  const transitionBusy = loading || updating;
  const [loadingHeld, setLoadingHeld] = useState(transitionBusy);
  const renameTargetRef = useRef('');
  const galleryScrollRef = useRef(null);
  const galleryCardSizeFrameRef = useRef(null);
  const galleryCardSizePersistTimerRef = useRef(null);
  const pendingGalleryCardSizeRef = useRef(galleryCardSize);
  const galleryWheelDeltaRef = useRef(0);
  const galleryWheelFrameRef = useRef(null);

  const updateGalleryCardSize = useCallback((value) => {
    const nextSize = normalizeGalleryCardSize(value);
    if (nextSize === undefined) return;
    pendingGalleryCardSizeRef.current = nextSize;
    if (galleryCardSizeFrameRef.current !== null) return;
    galleryCardSizeFrameRef.current = window.requestAnimationFrame(() => {
      galleryCardSizeFrameRef.current = null;
      setGalleryCardSize(pendingGalleryCardSizeRef.current);
    });
  }, []);

  const completeGalleryCardSize = useCallback((value) => {
    const nextSize = normalizeGalleryCardSize(value);
    if (nextSize === undefined) return;
    pendingGalleryCardSizeRef.current = nextSize;
    if (galleryCardSizeFrameRef.current !== null) {
      window.cancelAnimationFrame(galleryCardSizeFrameRef.current);
      galleryCardSizeFrameRef.current = null;
    }
    if (galleryCardSizePersistTimerRef.current !== null) {
      window.clearTimeout(galleryCardSizePersistTimerRef.current);
      galleryCardSizePersistTimerRef.current = null;
    }
    setGalleryCardSize(nextSize);
    writeGalleryCardSize(panelStorage(), nextSize);
  }, []);

  const scheduleGalleryCardSizePersistence = useCallback(() => {
    if (galleryCardSizePersistTimerRef.current !== null) window.clearTimeout(galleryCardSizePersistTimerRef.current);
    galleryCardSizePersistTimerRef.current = window.setTimeout(() => {
      galleryCardSizePersistTimerRef.current = null;
      writeGalleryCardSize(panelStorage(), pendingGalleryCardSizeRef.current);
    }, 180);
  }, []);

  useEffect(() => {
    const surface = galleryScrollRef.current;
    if (!surface) return undefined;
    const handleWheel = (event) => {
      if (!isGalleryWheelZoomGesture(event)) return;
      event.preventDefault();
      const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, surface.clientHeight) : 1;
      galleryWheelDeltaRef.current += event.deltaY * deltaScale;
      if (Math.abs(galleryWheelDeltaRef.current) < GALLERY_CARD_SIZE_WHEEL_THRESHOLD || galleryWheelFrameRef.current !== null) return;
      galleryWheelFrameRef.current = window.requestAnimationFrame(() => {
        galleryWheelFrameRef.current = null;
        const wheelDelta = galleryWheelDeltaRef.current;
        galleryWheelDeltaRef.current = 0;
        const nextSize = galleryCardSizeFromWheel(pendingGalleryCardSizeRef.current, wheelDelta);
        if (nextSize === pendingGalleryCardSizeRef.current) return;
        pendingGalleryCardSizeRef.current = nextSize;
        setGalleryCardSize(nextSize);
        scheduleGalleryCardSizePersistence();
      });
    };
    surface.addEventListener('wheel', handleWheel, { passive: false });
    return () => surface.removeEventListener('wheel', handleWheel);
  }, [scheduleGalleryCardSizePersistence]);

  useEffect(() => () => {
    if (galleryCardSizeFrameRef.current !== null) window.cancelAnimationFrame(galleryCardSizeFrameRef.current);
    if (galleryWheelFrameRef.current !== null) window.cancelAnimationFrame(galleryWheelFrameRef.current);
    if (galleryCardSizePersistTimerRef.current !== null) {
      window.clearTimeout(galleryCardSizePersistTimerRef.current);
      writeGalleryCardSize(panelStorage(), pendingGalleryCardSizeRef.current);
    }
  }, []);

  useEffect(() => {
    if (transitionBusy) {
      if (!loadingHeld) setLoadingHeld(true);
      return undefined;
    }
    if (!loadingHeld) return undefined;
    const timer = window.setTimeout(() => setLoadingHeld(false), reduceMotion ? 0 : 220);
    return () => window.clearTimeout(timer);
  }, [loadingHeld, reduceMotion, transitionBusy]);

  useEffect(() => {
    if (!transitionBusy && loadingHeld) preloadGalleryThumbnails(groups);
  }, [groups, loadingHeld, transitionBusy]);

  const showLoadingPage = transitionBusy || loadingHeld;

  useLayoutEffect(() => {
    if (updating && galleryScrollRef.current) galleryScrollRef.current.scrollTop = 0;
  }, [updating]);

  useEffect(() => {
    const requestedRename = Boolean(preview && renameTargetRef.current === preview.id);
    renameTargetRef.current = '';
    setRenaming(requestedRename);
    setNameDraft(preview?.name || '');
  }, [preview?.id]);

  useEffect(() => {
    const handleKey = (event) => {
      if (!previewGroup || isTextEditingTarget(event.target) || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      onNavigatePreview(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onNavigatePreview, previewGroup]);

  const memberIndex = previewGroup?.members.findIndex((project) => project.id === preview?.id) ?? -1;
  const galleryDensity = galleryDensityForSize(galleryCardSize);
  const emptyState = activeCollection
    ? hasActiveGalleryFilters(filters)
      ? { icon: 'search', title: '收藏集中没有匹配图片', description: '清除当前搜索或筛选条件后再试。' }
      : activeCollection.kind === 'smart'
        ? { icon: 'spark', title: '智能收藏集暂无匹配图片', description: '新导入的图片满足规则后会自动出现在这里。' }
        : { icon: 'folder', title: '收藏集为空', description: '选择图片后，将它们加入这个普通收藏集。' }
    : galleryEmptyState(view, hasActiveGalleryFilters(filters));
  const updatePreviewExpanded = (expanded) => {
    setPreviewExpanded(writePanelBoolean(panelStorage(), GALLERY_PREVIEW_PANEL_EXPANDED_KEY, expanded));
  };
  const updatePreviewPinned = (pinned) => {
    setPreviewPinned(writePanelBoolean(panelStorage(), GALLERY_PREVIEW_PANEL_PINNED_KEY, pinned));
  };
  const updateCollectionsExpanded = (expanded) => {
    setCollectionsExpanded(writePanelBoolean(panelStorage(), GALLERY_COLLECTIONS_PANEL_EXPANDED_KEY, expanded));
  };
  useEffect(() => {
    if (view === 'trash' && collectionsExpanded) updateCollectionsExpanded(false);
  }, [collectionsExpanded, view]);
  const saveName = async () => {
    if (await onRename(preview, nameDraft)) setRenaming(false);
  };
  const requestRename = (group) => {
    const project = group.cover;
    updatePreviewExpanded(true);
    if (preview?.id === project.id) {
      setNameDraft(project.name || '');
      setRenaming(true);
      return;
    }
    renameTargetRef.current = project.id;
    onPreview(group);
  };
  const gridActionsRef = useRef({});
  gridActionsRef.current = {
    onOpenWorkbench,
    onPreview,
    onProjectContextMenu,
    onToggleSelect,
    requestRename,
    updatePreviewExpanded,
  };

  return <main className="gallery-page">
    <header className="workspace-page-header">
      <h1>图片库</h1>
      <ImportButton importing={importing} onImport={onImport} onImportClipboard={onImportClipboard}/>
    </header>
    <div className="gallery-toolbar">
      <Segmented
        aria-label="图片库视图"
        onChange={onViewChange}
        options={[{ label: '全部', value: 'all' }, { label: '回收站', value: 'trash' }]}
        size="small"
        value={view}
      />
      <LobeButton
        aria-expanded={view !== 'trash' && collectionsExpanded}
        className={activeCollection ? 'gallery-collections-trigger active' : 'gallery-collections-trigger'}
        disabled={view === 'trash'}
        icon={<Icon name="folder" size={14}/>}
        onClick={() => updateCollectionsExpanded(!collectionsExpanded)}
        size="small"
        title={view === 'trash' ? '回收站不使用收藏集' : undefined}
      >{activeCollection ? activeCollection.name : '收藏集'}</LobeButton>
      <LobeSearchBar className="gallery-search" onInputChange={onQueryChange} placeholder="搜索文件名、Tag 或译名" value={query}/>
      <GalleryFilterOptionsControl
        cacheSource={filterCacheSource || filterProjects}
        filters={filters}
        onChange={onFiltersChange}
        projects={filterProjects}
        scopeKey={filterScopeKey}
      />
      <div className="gallery-sort">
        <LobeSelect aria-label="图片排序" onChange={onSortChange} options={[
          { label: '最近导入', value: 'recent' },
          { label: '最早导入', value: 'oldest' },
          { label: '按名称', value: 'name' },
        ]} value={sort}/>
      </div>
      <div className="gallery-size-control" title={`缩略图大小：${galleryCardSize} 像素 · Ctrl/⌘ + 滚轮`}>
        <Icon name="image" size={13}/>
        <Slider
          aria-label="缩略图大小"
          className="gallery-size-slider"
          getAriaValueText={(value) => `${value} 像素`}
          max={GALLERY_CARD_SIZE_MAX}
          min={GALLERY_CARD_SIZE_MIN}
          onChange={updateGalleryCardSize}
          onChangeComplete={completeGalleryCardSize}
          step={GALLERY_CARD_SIZE_STEP}
          value={galleryCardSize}
        />
        <Icon name="image" size={18}/>
      </div>
      <GalleryGroupingControl grouping={grouping} onChange={onGroupingChange}/>
      <span className="gallery-count">{groups.length} 组 · {groups.reduce((count, group) => count + group.count, 0)} 张</span>
      <LobeButton disabled={updating || !groups.length} onClick={onSelectAll} size="small" type="text">全选当前结果</LobeButton>
      {view === 'trash' && <LobeButton danger disabled={updating || !groups.length} onClick={onEmptyTrash} size="small">清空回收站</LobeButton>}
    </div>
    {editingSmartCollection && <div className="gallery-rule-edit-bar">
      <span><Icon name="filter" size={15}/><span><strong>正在编辑“{editingSmartCollection.name}”</strong><small>调整搜索与筛选，图库结果会实时预览</small></span></span>
      <div>
        <LobeButton disabled={!hasActiveGalleryFilters(filters)} onClick={onCollectionRulesSave} size="small" type="primary">保存修改</LobeButton>
        <LobeButton onClick={onCollectionRulesCancel} size="small" type="text">取消</LobeButton>
      </div>
    </div>}
    <BatchToolbar
      onClear={onClearSelection}
      onPermanentDelete={onPermanentDelete}
      onRestore={onRestore}
      onTrash={onTrash}
      activeCollection={activeCollection}
      collections={collections}
      onCollectionProjectsChange={onCollectionProjectsChange}
      selectedProjectIds={selectedGroupIds.length ? groups.filter((group) => selectedGroupIds.includes(group.id)).flatMap((group) => group.members.map((project) => project.id)) : []}
      selectedGroups={selectedGroupIds.length}
      selectedImages={selectedImageCount}
      view={view}
    />
    <div className="gallery-workspace">
      <DelayedGalleryStatus active={!showLoadingPage && progressiveRendering} loading={false}/>
      <LobeDraggablePanel
        className="gallery-collections-shell"
        classNames={{ content: 'workspace-side-panel-content' }}
        defaultSize={{ width: 'clamp(248px, 18vw, 360px)' }}
        expand={view !== 'trash' && collectionsExpanded}
        maxWidth={360}
        minWidth={248}
        mode="float"
        onExpandChange={updateCollectionsExpanded}
        onSizeChange={(_delta, size) => {
          const width = writePanelWidth(panelStorage(), GALLERY_COLLECTIONS_PANEL_WIDTH_KEY, size?.width, 248, 360);
          if (width !== undefined) setCollectionsPanelWidth(width);
        }}
        placement="left"
        showHandleHighlight
        stableLayout
        size={{ height: '100%', width: collectionsPanelWidth }}
      >
        <LobeDraggablePanel.Body style={{ display: 'block', height: '100%', minHeight: 0, overflow: 'hidden', padding: 0 }}>
          <GalleryCollectionsPanel
            activeCollection={activeCollection}
            collections={collections}
            editingSmartCollection={editingSmartCollection}
            filters={filters}
            onCreate={onCollectionCreate}
            onDelete={onCollectionDelete}
            onRename={onCollectionRename}
            onRulesEdit={onCollectionRulesEdit}
            onSelect={(id) => { onCollectionSelect(id); updateCollectionsExpanded(false); }}
          />
        </LobeDraggablePanel.Body>
      </LobeDraggablePanel>
      <motion.section
        aria-busy={showLoadingPage || progressiveRendering}
        className="gallery-grid-scroll"
        layoutScroll
        onClick={(event) => {
          if (!shouldCollapseGalleryPreview(event.target, previewPinned)) return;
          updatePreviewExpanded(false);
          updateCollectionsExpanded(false);
        }}
        onContextMenu={(event) => {
          if (event.target.closest('.gallery-card')) return;
          onWorkspaceContextMenu(event);
        }}
        ref={galleryScrollRef}
      >
        <PopoverGroup closeDelay={120} openDelay={450} placement="rightTop" trigger="hover">
          <AnimatePresence initial={false} mode="wait">
            {showLoadingPage ? <GalleryLoadingState reduceMotion={reduceMotion}/> : groups.length ? <GalleryResultsSurface
              className={`gallery-grid density-${galleryDensity}`}
              key={`results:${contentKey}`}
              style={{ '--gallery-card-min-width': `${galleryCardSize}px` }}
            >
              <ProgressiveGalleryGrid
                actionsRef={gridActionsRef}
                canOpenWorkbench={view !== 'trash'}
                groups={groups}
                key={contentKey}
                layoutSize={galleryCardSize}
                onRenderingChange={setProgressiveRendering}
                previewGroupId={previewGroup?.id || ''}
                reduceMotion={reduceMotion}
                selectedGroupIds={selectedGroupIds}
              />
            </GalleryResultsSurface> : <motion.div
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              initial={{ opacity: reduceMotion ? 1 : 0 }}
              key={`empty:${contentKey}`}
              className="gallery-transition-empty"
            ><LobeEmpty
              className="gallery-empty"
              description={emptyState.description}
              gap={6}
              icon={getIconComponent(emptyState.icon)}
              imageSize={38}
              justify="center"
              title={emptyState.title}
            /></motion.div>}
          </AnimatePresence>
        </PopoverGroup>
      </motion.section>
      <LobeDraggablePanel
        className={`gallery-preview-shell ${previewPinned ? 'is-fixed' : 'is-floating'}`}
        classNames={{ content: 'workspace-side-panel-content' }}
        defaultSize={{ width: 'clamp(340px, 28vw, 560px)' }}
        expand={Boolean(preview) && previewExpanded}
        maxWidth={560}
        minWidth={340}
        mode={previewPinned ? 'fixed' : 'float'}
        onExpandChange={updatePreviewExpanded}
        onSizeChange={(_delta, size) => {
          const width = writePanelWidth(panelStorage(), GALLERY_PREVIEW_PANEL_WIDTH_KEY, size?.width, 340, 560);
          if (width !== undefined) setPreviewPanelWidth(width);
        }}
        placement="right"
        showHandleHighlight
        stableLayout
        size={{ height: '100%', width: previewPanelWidth }}
      >
        {preview && <LobeDraggablePanel.Body
          className={`gallery-preview ${view === 'trash' ? 'is-trash' : ''}`}
          style={{ display: 'grid', height: '100%', minHeight: 0, overflow: 'hidden', padding: 0 }}
        >
          <section className="gallery-preview-primary">
            <header>
              {renaming ? <div className="gallery-rename">
                <LobeInput
                  autoFocus
                  maxLength={160}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveName();
                    if (event.key === 'Escape') setRenaming(false);
                  }}
                  size="small"
                  value={nameDraft}
                />
                <LobeButton onClick={saveName} size="small" type="primary">保存</LobeButton>
                <LobeButton onClick={() => setRenaming(false)} size="small" type="text">取消</LobeButton>
              </div> : <h2 onDoubleClick={() => view !== 'trash' && setRenaming(true)} title={preview.name}>{preview.name}</h2>}
              <ActionIcon
                active={previewPinned}
                aria-label={previewPinned ? '取消固定预览面板' : '固定预览面板'}
                aria-pressed={previewPinned}
                className="gallery-preview-pin"
                icon={<Icon name={previewPinned ? 'pinOff' : 'pin'}/>}
                onClick={() => updatePreviewPinned(!previewPinned)}
                title={previewPinned ? '取消固定，浮动显示' : '固定为分栏'}
              />
            </header>
            <ImageStage
              alt={preview.name}
              className="gallery-preview-stage"
              filePath={preview.image_path}
              previewToolbar={(_originalNode, info) => <ImagePreviewToolbar
                info={info}
                onCopy={() => onCopyImage(preview)}
                onDownload={() => onDownloadImage(preview)}
              />}
            >
              {previewGroup?.count > 1 && <>
                <ActionIcon className="gallery-stage-nav previous" icon={<Icon name="previous"/>} onClick={() => onNavigatePreview(-1)} title="上一张"/>
                <span className="gallery-stage-position">{memberIndex + 1} / {previewGroup.count}</span>
                <ActionIcon className="gallery-stage-nav next" icon={<Icon name="next"/>} onClick={() => onNavigatePreview(1)} title="下一张"/>
              </>}
            </ImageStage>
            <div className="gallery-preview-meta"><span>{preview.metadata?.width || '—'} × {preview.metadata?.height || '—'}</span><span>{countPromptTags(preview)} Tags</span><span>{formatDate(preview.created_at)}</span></div>
          </section>
          <section className="gallery-preview-prompt" aria-label="原始 Prompt">
            <header><h3>原始 Prompt</h3></header>
            <RawPromptSections key={preview.id} project={preview}/>
          </section>
          <footer className="gallery-preview-actions">
            {view !== 'trash' && <LobeButton className="gallery-preview-action-wide" icon={<Icon name="edit" size={14}/>} onClick={() => onOpenWorkbench(preview)} type="primary">在工作台编辑</LobeButton>}
            {view !== 'trash' && <CollectionMembershipControl className="gallery-preview-action-button" collections={collections} onChange={onCollectionProjectsChange} projectIds={[preview.id]}/>}
            {activeCollection?.kind === 'manual' && view !== 'trash' && <LobeButton onClick={() => onCollectionProjectsChange(activeCollection.id, [preview.id], 'remove')}>移出当前收藏集</LobeButton>}
            <LobeButton icon={<Icon name="folder" size={14}/>} onClick={() => onReveal(preview)}>在文件夹中显示</LobeButton>
            {view !== 'trash' && <LobeButton onClick={() => setRenaming(true)}>重命名</LobeButton>}
            {previewGroup?.canSetCover && previewGroup.count > 1 && previewGroup.cover.id !== preview.id && view !== 'trash' && <LobeButton onClick={() => onSetCover(previewGroup, preview)}>设为头图</LobeButton>}
            {view === 'trash'
              ? <><LobeButton icon={<Icon name="restore" size={14}/>} onClick={() => onRestore([preview.id])}>恢复当前图片</LobeButton><LobeButton className="gallery-preview-action-wide" danger icon={<Icon name="trash" size={14}/>} onClick={() => onPermanentDelete([preview.id])}>永久删除当前图片</LobeButton></>
              : <LobeButton className="gallery-preview-action-wide" danger icon={<Icon name="trash" size={14}/>} onClick={() => onTrash([preview.id], 'detail')} type="fill">删除当前图片</LobeButton>}
          </footer>
        </LobeDraggablePanel.Body>}
      </LobeDraggablePanel>
    </div>
  </main>;
}
