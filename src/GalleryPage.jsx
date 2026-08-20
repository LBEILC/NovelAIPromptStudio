import { Accordion, AccordionItem, ActionIcon, DatePicker as LobeDatePicker, DraggablePanel as LobeDraggablePanel, Empty as LobeEmpty, Highlighter, Popover, PopoverGroup, SearchBar as LobeSearchBar } from '@lobehub/ui';
import { Button as LobeButton, Input as LobeInput, Segmented, Select as LobeSelect, Slider, SplitButton, Switch as LobeSwitch } from '@lobehub/ui/base-ui';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import Icon, { getIconComponent } from './components/Icon.jsx';
import ImagePreviewToolbar from './components/ImagePreviewToolbar.jsx';
import ImageStage, { mediaUrl } from './components/ImageStage.jsx';
import SelectionMark from './components/SelectionMark.jsx';
import { galleryEmptyState, galleryGroupMember, galleryScrubMemberIndex, shouldCollapseGalleryPreview } from './lib/gallery.js';
import {
  DEFAULT_GALLERY_FILTERS,
  GALLERY_DATE_PRESETS,
  galleryActiveFilterCount,
  hasActiveGalleryFilters,
  normalizeGalleryFilters,
} from './lib/galleryFilters.js';
import {
  GALLERY_CARD_SIZE_MAX,
  GALLERY_CARD_SIZE_MIN,
  galleryDensityForSize,
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
  panelStorage,
  panelWidthForViewport,
  readPanelBoolean,
  readPanelWidth,
  writePanelBoolean,
  writePanelWidth,
} from './lib/panelLayout.js';
import { countPromptTags, positiveRawPromptScopes } from './lib/promptStructure.js';
import { isTextEditingTarget } from './lib/contextMenu.js';

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

export function GalleryFilterControl({ filters = DEFAULT_GALLERY_FILTERS, options = {}, onChange }) {
  const value = normalizeGalleryFilters(filters);
  const activeCount = galleryActiveFilterCount(value);
  const tagOptions = options.tags || [];
  const content = <div className="gallery-filter-panel">
    <header className="gallery-filter-header">
      <div><strong>筛选图片</strong><small>不同筛选项之间同时满足</small></div>
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

export function BatchToolbar({ view, selectedGroups, selectedImages, onFavorite, onTrash, onRestore, onPermanentDelete, onClear }) {
  if (!selectedGroups) return null;
  return <div className="gallery-selection-bar">
    <span>已选 <b>{selectedGroups}</b> 组 · <b>{selectedImages}</b> 张图片</span>
    {view === 'trash' ? <>
      <LobeButton icon={<Icon name="restore" size={14}/>} onClick={() => onRestore()} size="small">恢复</LobeButton>
      <LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => onPermanentDelete()} size="small">永久删除</LobeButton>
    </> : <>
      <LobeButton icon={<Icon name="star" size={14}/>} onClick={() => onFavorite(true)} size="small">收藏</LobeButton>
      <LobeButton onClick={() => onFavorite(false)} size="small">取消收藏</LobeButton>
      <LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => onTrash()} size="small" type="fill">移入回收站</LobeButton>
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
        {stackMembers.map((member, index) => <img
          alt=""
          aria-hidden="true"
          className={`gallery-card-stack gallery-card-stack-${index + 1}`}
          key={member.id}
          loading="lazy"
          src={mediaUrl(member.thumbnail_path || member.image_path)}
        />)}
        <img alt="" loading="lazy" src={mediaUrl(project.thumbnail_path || project.image_path)}/>
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

export default function GalleryPage({
  groups,
  filters,
  filterOptions,
  query,
  sort,
  view,
  previewGroup,
  preview,
  importing,
  selectedGroupIds,
  selectedImageCount,
  grouping = DEFAULT_GALLERY_GROUPING,
  onClearSelection,
  onEmptyTrash,
  onFavorite,
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
  const [galleryCardSize, setGalleryCardSize] = useState(() => readGalleryCardSize(panelStorage()));
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const renameTargetRef = useRef('');

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
  const emptyState = galleryEmptyState(view, hasActiveGalleryFilters(filters));
  const updatePreviewExpanded = (expanded) => {
    setPreviewExpanded(writePanelBoolean(panelStorage(), GALLERY_PREVIEW_PANEL_EXPANDED_KEY, expanded));
  };
  const updatePreviewPinned = (pinned) => {
    setPreviewPinned(writePanelBoolean(panelStorage(), GALLERY_PREVIEW_PANEL_PINNED_KEY, pinned));
  };
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

  return <main className="gallery-page">
    <header className="workspace-page-header">
      <h1>图片库</h1>
      <ImportButton importing={importing} onImport={onImport} onImportClipboard={onImportClipboard}/>
    </header>
    <div className="gallery-toolbar">
      <Segmented
        aria-label="图片库视图"
        onChange={onViewChange}
        options={[{ label: '全部', value: 'all' }, { label: '收藏', value: 'favorites' }, { label: '回收站', value: 'trash' }]}
        size="small"
        value={view}
      />
      <LobeSearchBar className="gallery-search" onInputChange={onQueryChange} placeholder="搜索文件名、Tag 或译名" value={query}/>
      <GalleryFilterControl filters={filters} onChange={onFiltersChange} options={filterOptions}/>
      <div className="gallery-sort">
        <LobeSelect aria-label="图片排序" onChange={onSortChange} options={[
          { label: '最近导入', value: 'recent' },
          { label: '最早导入', value: 'oldest' },
          { label: '按名称', value: 'name' },
        ]} value={sort}/>
      </div>
      <div className="gallery-size-control" title={`缩略图大小：${galleryCardSize} 像素`}>
        <Icon name="image" size={13}/>
        <Slider
          aria-label="缩略图大小"
          className="gallery-size-slider"
          getAriaValueText={(value) => `${value} 像素`}
          max={GALLERY_CARD_SIZE_MAX}
          min={GALLERY_CARD_SIZE_MIN}
          onChange={setGalleryCardSize}
          onChangeComplete={(value) => writeGalleryCardSize(panelStorage(), value)}
          step={8}
          value={galleryCardSize}
        />
        <Icon name="image" size={18}/>
      </div>
      <GalleryGroupingControl grouping={grouping} onChange={onGroupingChange}/>
      <span className="gallery-count">{groups.length} 组 · {groups.reduce((count, group) => count + group.count, 0)} 张</span>
      <LobeButton disabled={!groups.length} onClick={onSelectAll} size="small" type="text">全选当前结果</LobeButton>
      {view === 'trash' && <LobeButton danger disabled={!groups.length} onClick={onEmptyTrash} size="small">清空回收站</LobeButton>}
    </div>
    <BatchToolbar
      onClear={onClearSelection}
      onFavorite={onFavorite}
      onPermanentDelete={onPermanentDelete}
      onRestore={onRestore}
      onTrash={onTrash}
      selectedGroups={selectedGroupIds.length}
      selectedImages={selectedImageCount}
      view={view}
    />
    <div className="gallery-workspace">
      <section
        className="gallery-grid-scroll"
        onClick={(event) => {
          if (!shouldCollapseGalleryPreview(event.target, previewPinned)) return;
          updatePreviewExpanded(false);
        }}
        onContextMenu={(event) => {
          if (event.target.closest('.gallery-card')) return;
          onWorkspaceContextMenu(event);
        }}
      >
        {groups.length ? <PopoverGroup closeDelay={120} openDelay={450} placement="rightTop" trigger="hover"><div
          className={`gallery-grid density-${galleryDensity}`}
          style={{ '--gallery-card-min-width': `${galleryCardSize}px` }}
        >
          {groups.map((group) => <GalleryCard
            active={previewGroup?.id === group.id}
            group={group}
            key={group.id}
            onContextMenu={(event) => onProjectContextMenu(event, group, () => requestRename(group))}
            onOpenWorkbench={view === 'trash' ? undefined : onOpenWorkbench}
            onPreview={(project) => { updatePreviewExpanded(true); onPreview(group, project); }}
            onSelect={(event) => onToggleSelect(group, event)}
            selected={selectedGroupIds.includes(group.id)}
          />)}
        </div></PopoverGroup> : <LobeEmpty
          className="gallery-empty"
          description={emptyState.description}
          gap={6}
          icon={getIconComponent(emptyState.icon)}
          imageSize={38}
          justify="center"
          title={emptyState.title}
        />}
      </section>
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
            <LobeButton icon={<Icon name="star" size={14}/>} onClick={() => onFavorite(!preview.is_favorite, [preview.id])}>{preview.is_favorite ? '取消收藏' : '收藏'}</LobeButton>
            <LobeButton icon={<Icon name="folder" size={14}/>} onClick={() => onReveal(preview)}>在文件夹中显示</LobeButton>
            {view !== 'trash' && <LobeButton onClick={() => setRenaming(true)}>重命名</LobeButton>}
            {previewGroup?.canSetCover && previewGroup.count > 1 && previewGroup.cover.id !== preview.id && view !== 'trash' && <LobeButton onClick={() => onSetCover(previewGroup, preview)}>设为头图</LobeButton>}
            {view === 'trash'
              ? <><LobeButton icon={<Icon name="restore" size={14}/>} onClick={() => onRestore([preview.id])}>恢复当前图片</LobeButton><LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => onPermanentDelete([preview.id])}>永久删除当前图片</LobeButton></>
              : <LobeButton className="gallery-preview-action-wide" danger icon={<Icon name="trash" size={14}/>} onClick={() => onTrash([preview.id], 'detail')} type="fill">删除当前图片</LobeButton>}
          </footer>
        </LobeDraggablePanel.Body>}
      </LobeDraggablePanel>
    </div>
  </main>;
}
