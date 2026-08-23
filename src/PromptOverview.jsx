import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, getFirstCollision, pointerWithin, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { ActionIcon as LobeActionIcon, Popover as LobePopover, SearchBar as LobeSearchBar, TooltipGroup as LobeTooltipGroup } from '@lobehub/ui';
import { motion, useReducedMotion } from 'motion/react';
import {
  Button as LobeButton,
  DropdownMenu as LobeDropdownMenu,
  Input as LobeInput,
  Segmented as LobeSegmented,
  Select as LobeSelect,
  TextArea as LobeTextArea,
} from '@lobehub/ui/base-ui';
import { Check, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import { analyzePromptBatch, CATEGORY_LABELS, CATEGORY_OPTIONS, inferCategory, parsePromptPreservingEdits } from './lib/prompt.js';
import { addPromptCharacter, getPromptScope, MAX_PROMPT_CHARACTERS, removePromptCharacter, updatePromptCharacter, updatePromptScope } from './lib/promptStructure.js';
import Icon from './components/Icon.jsx';
import { MarqueeSelectionOverlay, useMarqueeSelection } from './components/MarqueeSelection.jsx';
import { TagCategorySection, TagChip, TagHoverPreview, TagPopover, TagQuickEditor } from './components/TagManagement.jsx';
import { tagPresentation } from './lib/tagManagement.js';
import { encodeMarqueeKey } from './lib/marqueeSelection.js';
import {
  deleteOverviewTags,
  filterCollapsedAutomaticScopes,
  filterOverviewScopes,
  isAutomaticPromptCollapsible,
  isOverviewTagVisible,
  overviewCategoryGroups,
  overviewCopyContext,
  overviewEntries,
  overviewMoveContext,
  overviewTagInteractionState,
  moveOverviewTags,
  reorderOverviewTags,
  selectedOverviewEntries,
  shouldReorderOverviewTags,
  overviewTagKey,
  toggleOverviewSelectionGroup,
  updateOverviewTags,
} from './lib/promptOverview.js';
import { DEFAULT_WORKBENCH_VIEW_STATE } from './lib/workbenchSession.js';

const LANGUAGE_OPTIONS = [
  ['original', '原文'],
  ['translated', '翻译'],
  ['bilingual', '对照'],
];

const TAG_SORT_ACCESSIBILITY = {
  screenReaderInstructions: {
    draggable: '拖动可调整 Tag 顺序；也可以按 Alt 加方向键移动当前 Tag。',
  },
};

const LIVE_TAG_SORTING_STRATEGY = () => null;
const TAG_LAYOUT_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] };

function syntaxMessage(tag) {
  if (tag.syntax_issue === 'control_only') return '单独的 :: 是结束控制符，不是 Tag，建议删除。';
  if (tag.syntax_issue === 'emphasis_closer') return '包含可能多余的 :: 结束符；没有前置强调时相当于普通权重 1。';
  return '';
}

function SortableTag({ animateLayout, automation, display, editKey, editingKey, index, language, onEditingChange, onKeyboardMove, onTagClick, onTagContextMenu, onTranslateTag, onUpdateTag, reorderDisabled, scope, selected, selectionModeActive, tag, translating, warning }) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
  } = useSortable({
    animateLayoutChanges: () => false,
    disabled: reorderDisabled,
    id: tag.id,
  });
  const tagButton = <TagChip
    {...(reorderDisabled ? {} : attributes)}
    {...(reorderDisabled ? {} : listeners)}
    buttonRef={reorderDisabled ? undefined : setActivatorNodeRef}
    className={automation ? `automatic-prompt-tag ${automation.status}` : ''}
    display={display}
    dragging={isDragging}
    onClick={(event) => onTagClick(event, editKey)}
    onContextMenu={(event) => onTagContextMenu(event, scope.key, tag)}
    onKeyDown={(event) => selectionModeActive ? undefined : onKeyboardMove(scope, index, event)}
    selected={selected}
    selecting={selectionModeActive}
    showSelectionMark={false}
    tag={tag}
    tooltip={<TagHoverPreview
      actionHint={selectionModeActive
        ? '点击选择或取消 · 拖动 Tag 或空白处框选'
        : reorderDisabled
          ? '点击编辑 · 从空白处框选 · 清除筛选后可排序'
          : '点击编辑 · 拖动排序 · 从空白处框选'}
      language={language}
      scopeLabel={scope.label}
      sourceLabel={automation?.sourceLabel}
      tag={tag}
      warning={warning}
    />}
    warning={warning}
  />;

  return <motion.div
    className={`overview-tag-shell ${isDragging ? 'dragging' : ''}`}
    data-marquee-key={encodeMarqueeKey(editKey)}
    layout={animateLayout ? 'position' : false}
    ref={setNodeRef}
    role="listitem"
    transition={animateLayout ? { layout: TAG_LAYOUT_TRANSITION } : undefined}
  >
    <TagPopover
      content={<TagQuickEditor tag={tag} translating={translating} onChange={(patch) => onUpdateTag(scope.key, tag.id, patch)} onClose={() => onEditingChange('')} onTranslate={() => onTranslateTag(scope.key, tag)}/>}
      disabled={selectionModeActive}
      editKey={editKey}
      editingKey={editingKey}
      onEditingChange={onEditingChange}
    >
      {tagButton}
    </TagPopover>
  </motion.div>;
}

function AutomaticPromptSummary({ automation, controlsId, expanded = false, onToggle }) {
  if (!automation || !['confirmed', 'inferred', 'suspected', 'mismatch'].includes(automation.status)) return null;
  const isQuality = automation.kind === 'quality';
  const statusPrefix = automation.status === 'inferred' ? '推断 ' : automation.status === 'suspected' ? '疑似 ' : '';
  const label = automation.status === 'mismatch'
    ? isQuality ? '质量词开关已启用 · 模板未匹配' : 'UC 预设已启用 · 模板未匹配'
    : isQuality
      ? `${statusPrefix}NovelAI ${automation.modelLabel} Quality Tags ${automation.label} · ${automation.tagCount}`
      : `${statusPrefix}NovelAI UC ${automation.label} · ${automation.tagCount}`;
  const title = automation.status === 'confirmed'
    ? '元数据与官方预设模板均匹配；默认复制时会排除这些自动内容。'
    : automation.status === 'inferred'
      ? '元数据没有显式预设字段，但模型、完整模板与注入边界匹配；默认复制时会排除这些推断出的自动内容。'
    : automation.status === 'suspected'
      ? '文本与预设模板匹配，但元数据状态与自动预设不一致；复制时不会自动排除。'
      : '元数据显示已启用自动预设，但当前文本与已知模板不一致；复制时不会自动排除。';
  const content = <><span>{label}</span>{onToggle && <Icon className="overview-automatic-summary-icon" name="next" size={11}/>}</>;
  if (!onToggle) return <span className={`overview-automatic-summary ${automation.status}`} title={title}>{content}</span>;
  return <button
    aria-controls={controlsId}
    aria-expanded={expanded}
    className={`overview-automatic-summary ${automation.status} ${expanded ? 'is-expanded' : ''}`}
    onClick={onToggle}
    title={`${title} 点击${expanded ? '隐藏' : '显示'}这些自动 Tag。`}
    type="button"
  >{content}</button>;
}

function AddTagEditor({ draft, pending, scope, onAdd, onChange, onClose }) {
  return <div className="add-tag-popover" onClick={(event) => event.stopPropagation()}>
    <div className="tag-quick-editor-heading">
      <div><strong>添加到 {scope.label}</strong><small>支持中英文逗号与换行，可一次添加多个 Tag</small></div>
      <LobeButton onClick={onClose} size="small" type="text">取消</LobeButton>
    </div>
    <LobeTextArea autoFocus autoSize={{ minRows: 3, maxRows: 7 }} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
      event.preventDefault();
      onAdd();
    }} placeholder="例如：akakura, ciloranko, white background" value={draft}/>
    <div className="add-tag-popover-footer">
      <span>{pending.tags.length ? `将添加 ${pending.tags.length} 个` : '等待输入'}{pending.duplicateCount ? ` · ${pending.duplicateCount} 个重复` : ''}{pending.syntaxIssueCount ? ` · ${pending.syntaxIssueCount} 个语法提示` : ''}</span>
      <LobeButton disabled={!pending.tags.length} icon={<Icon name="plus" size={14}/>} onClick={onAdd} size="small" type="primary">添加</LobeButton>
    </div>
  </div>;
}

function RawPromptEditor({ draft, pending, scope, onChange, onClose, onSave }) {
  const label = scope.polarity === 'undesired' ? '排除内容' : 'Prompt';
  return <div className="raw-prompt-editor" onClick={(event) => event.stopPropagation()}>
    <div className="tag-quick-editor-heading">
      <div><strong>编辑原始 {label}</strong><small>自由编辑文本，保存后重新解析为 Tag</small></div>
      <LobeButton onClick={onClose} size="small" type="text">取消</LobeButton>
    </div>
    <LobeTextArea
      autoFocus
      autoSize={{ minRows: 8, maxRows: 16 }}
      className="raw-prompt-textarea"
      classNames={{ input: 'raw-prompt-textarea-input' }}
      onChange={(event) => onChange(event.target.value)}
      placeholder={scope.polarity === 'undesired' ? '输入排除内容，使用逗号或换行分隔' : '输入 Prompt，使用逗号或换行分隔'}
      value={draft}
    />
    <div className="raw-prompt-editor-footer">
      <span>将解析为 {pending.tags.length} 个 Tag{pending.syntaxIssueCount ? ` · ${pending.syntaxIssueCount} 个语法提示` : ''}</span>
      <LobeButton onClick={onSave} size="small" type="primary">保存并解析</LobeButton>
    </div>
  </div>;
}

function ScopeTags({
  scope,
  automaticExpanded,
  addDraft,
  addingScopeKey,
  language,
  interactionState,
  selectedKeys,
  filtered,
  onReorderTags,
  editingKey,
  onAddScope,
  onAddDraftChange,
  onAddingScopeChange,
  onEditingChange,
  onRawDraftChange,
  onRawEditingScopeChange,
  onSaveRawScope,
  onTranslateTag,
  onUpdateTag,
  onKeyboardMove,
  onTagClick,
  onToggleGroup,
  onTagContextMenu,
  onToggleAutomatic,
  translatingKeys,
  rawDraft,
  rawEditingScopeKey,
}) {
  const [activeTagId, setActiveTagId] = useState(null);
  const [dragTags, setDragTags] = useState(null);
  const dragTagsRef = useRef(null);
  const systemReducedMotion = useReducedMotion();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const motionMode = document.documentElement.dataset.motion || 'full';
  const animateLayout = motionMode === 'full' || (motionMode !== 'off' && !systemReducedMotion);
  const renderedTags = dragTags || scope.tags;
  const selectedSet = new Set(selectedKeys);
  const scopeEntries = scope.tags.map((tag) => ({ key: overviewTagKey(scope.key, tag.id) }));
  const pendingAdd = analyzePromptBatch(addDraft, scope.tags);
  const pendingRaw = analyzePromptBatch(rawDraft);
  const activeTag = scope.tags.find((tag) => tag.id === activeTagId);
  const activeDisplay = activeTag ? tagPresentation(activeTag, language) : null;
  const activeWarning = activeTag ? syntaxMessage(activeTag) : '';
  const activeAutomation = activeTag && scope.automation?.tagIds?.includes(activeTag.id) ? scope.automation : null;
  const { selectionModeActive } = interactionState;
  const reorderDisabled = interactionState.reorderDisabled || scope.automaticCollapsed;
  const tagListId = `overview-tags-${scope.key.replace(/[^a-z0-9_-]+/gi, '-')}`;
  const automaticToggle = isAutomaticPromptCollapsible(scope.automation) ? () => onToggleAutomatic(scope) : undefined;
  return <div className={`overview-scope ${scope.polarity === 'undesired' ? 'undesired' : ''}`}>
    <div className="overview-scope-heading">
      <div className="overview-scope-title"><strong>{scope.polarity === 'undesired' ? '排除' : 'Prompt'}</strong><div className="overview-scope-meta">{scope.tags.length > 0 && <small>{scope.tags.length} 个 Tag</small>}<AutomaticPromptSummary automation={scope.automation} controlsId={tagListId} expanded={automaticExpanded} onToggle={automaticToggle}/></div></div>
      {selectionModeActive ? <SelectionGroupButton entries={scopeEntries} selectedKeys={selectedKeys} onToggle={onToggleGroup}/> : <div className="overview-scope-actions">
        <LobePopover
          arrow
          className="raw-prompt-popover-shell"
          content={<RawPromptEditor draft={rawDraft} pending={pendingRaw} scope={scope} onChange={onRawDraftChange} onClose={() => onRawEditingScopeChange('')} onSave={() => onSaveRawScope(scope.key)}/>}
          onOpenChange={(open) => onRawEditingScopeChange(open ? scope.key : '')}
          open={rawEditingScopeKey === scope.key}
          placement="bottomRight"
          trigger="click"
        ><LobeButton icon={<Icon name="edit" size={13}/>} size="small" type="text">{scope.polarity === 'undesired' ? '原始排除' : '原始 Prompt'}</LobeButton></LobePopover>
        <LobePopover
          arrow
          className="add-tag-popover-shell"
          content={<AddTagEditor draft={addDraft} pending={pendingAdd} scope={scope} onAdd={() => onAddScope(scope.key)} onChange={onAddDraftChange} onClose={() => onAddingScopeChange('')}/>}
          onOpenChange={(open) => onAddingScopeChange(open ? scope.key : '')}
          open={addingScopeKey === scope.key}
          placement="bottomRight"
          trigger="click"
        ><LobeButton aria-label={`添加到 ${scope.label}`} icon={<Icon name="plus" size={13}/>} size="small" type="text"/></LobePopover>
      </div>}
    </div>
    <DndContext
      accessibility={TAG_SORT_ACCESSIBILITY}
      collisionDetection={pointerWithin}
      sensors={sensors}
      onDragCancel={() => {
        dragTagsRef.current = null;
        setDragTags(null);
        setActiveTagId(null);
      }}
      onDragEnd={({ over }) => {
        const nextTags = dragTagsRef.current;
        dragTagsRef.current = null;
        setDragTags(null);
        setActiveTagId(null);
        if (over && nextTags) onReorderTags(scope, nextTags);
      }}
      onDragMove={({ active, activatorEvent, collisions, delta }) => {
        // Reordering from onDragOver can create a feedback loop when flex reflow changes overId.
        const collision = getFirstCollision(collisions);
        const overId = collision?.id;
        const targetRect = collision?.data?.droppableContainer?.rect?.current;
        const pointerX = Number(activatorEvent?.clientX) + Number(delta?.x);
        if (!shouldReorderOverviewTags(dragTagsRef.current || scope.tags, active.id, overId, pointerX, targetRect)) return;
        const current = dragTagsRef.current || scope.tags;
        const nextTags = reorderOverviewTags(current, active.id, overId);
        if (nextTags === current) return;
        dragTagsRef.current = nextTags;
        setDragTags(nextTags);
      }}
      onDragStart={({ active }) => {
        onEditingChange('');
        dragTagsRef.current = scope.tags;
        setDragTags(scope.tags);
        setActiveTagId(active.id);
      }}
    >
      <SortableContext items={renderedTags.map((tag) => tag.id)} strategy={LIVE_TAG_SORTING_STRATEGY}>
        <div className={`overview-tags ${activeTagId ? 'sorting' : ''}`} id={tagListId} role="list" aria-label={scope.label}>
          {renderedTags.map((tag, index) => {
            const key = overviewTagKey(scope.key, tag.id);
            const automation = scope.automation?.tagIds?.includes(tag.id) ? scope.automation : null;
            return <SortableTag
              animateLayout={animateLayout}
              automation={automation}
              display={tagPresentation(tag, language)}
              editKey={key}
              editingKey={editingKey}
              index={index}
              key={tag.id}
              language={language}
              onEditingChange={onEditingChange}
              onKeyboardMove={onKeyboardMove}
              onTagClick={onTagClick}
              onTagContextMenu={onTagContextMenu}
              onTranslateTag={onTranslateTag}
              onUpdateTag={onUpdateTag}
              reorderDisabled={reorderDisabled}
              scope={scope}
              selected={selectedSet.has(key)}
              selectionModeActive={selectionModeActive}
              tag={tag}
              translating={translatingKeys.has(key)}
              warning={syntaxMessage(tag)}
            />;
          })}
          {!scope.tags.length && (scope.automaticCollapsed
            ? <span className="overview-filter-empty">自动 Tag 已折叠，点击上方提示显示</span>
            : filtered
              ? <span className="overview-filter-empty">当前筛选无 Tag</span>
              : <span className="overview-filter-empty">暂无 Tag，使用右上角 + 添加</span>)}
        </div>
      </SortableContext>
      {createPortal(<DragOverlay
        adjustScale={false}
        dropAnimation={{ duration: 180, easing: 'cubic-bezier(.22, 1, .36, 1)' }}
        modifiers={[restrictToWindowEdges]}
      >
        {activeTag && activeDisplay ? <TagChip
          className={activeAutomation ? `automatic-prompt-tag ${activeAutomation.status}` : ''}
          display={activeDisplay}
          overlay
          selected={false}
          selecting={false}
          tag={activeTag}
          warning={activeWarning}
        /> : null}
      </DragOverlay>, document.body)}
    </DndContext>
  </div>;
}

function SelectionGroupButton({ entries, selectedKeys, onToggle }) {
  const selectedSet = new Set(selectedKeys);
  const groupKeys = entries.map((entry) => entry.key);
  const allSelected = groupKeys.length > 0 && groupKeys.every((key) => selectedSet.has(key));
  if (!groupKeys.length) return null;
  return <LobeButton onClick={() => onToggle(entries)} size="small" type={allSelected ? 'primary' : 'default'}>{allSelected ? '取消整组' : `选择整组 ${entries.length}`}</LobeButton>;
}

function CategoryGroup({ group, language, selectionModeActive, selectedKeys, editingKey, onEditingChange, onTagClick, onToggleGroup, onTranslateTag, onUpdateTag, onTagContextMenu, translatingKeys }) {
  const selectedSet = new Set(selectedKeys);
  return <TagCategorySection
    action={selectionModeActive ? <SelectionGroupButton entries={group.entries} selectedKeys={selectedKeys} onToggle={onToggleGroup}/> : null}
    category={group.category}
    count={group.entries.length}
  >
    {group.entries.map((entry) => {
      const selected = selectedSet.has(entry.key);
      const display = tagPresentation(entry.tag, language);
      const warning = syntaxMessage(entry.tag);
      const tagButton = <TagChip
        className={`${entry.scopePolarity === 'undesired' ? 'undesired-tag' : ''} ${entry.automation ? `automatic-prompt-tag ${entry.automation.status}` : ''}`}
        data-marquee-key={encodeMarqueeKey(entry.key)}
        display={display}
        onClick={(event) => onTagClick(event, entry.key)}
        onContextMenu={(event) => onTagContextMenu(event, entry.scopeKey, entry.tag)}
        role="listitem"
        selected={selected}
        selecting={selectionModeActive}
        showSelectionMark={false}
        tag={entry.tag}
        tooltip={<TagHoverPreview
          actionHint={selectionModeActive ? '点击选择或取消 · 拖动 Tag 或空白处框选' : '点击编辑 · 从空白处框选'}
          language={language}
          scopeLabel={entry.scopeLabel}
          sourceLabel={entry.automation?.sourceLabel}
          tag={entry.tag}
          warning={warning}
        />}
        warning={warning}
      />;
      return <TagPopover
        content={<TagQuickEditor tag={entry.tag} translating={translatingKeys.has(entry.key)} onChange={(patch) => onUpdateTag(entry.scopeKey, entry.tag.id, patch)} onClose={() => onEditingChange('')} onTranslate={() => onTranslateTag(entry.scopeKey, entry.tag)}/>}
        disabled={selectionModeActive}
        editKey={entry.key}
        editingKey={editingKey}
        key={entry.key}
        onEditingChange={onEditingChange}
      >
        {tagButton}
      </TagPopover>;
    })}
  </TagCategorySection>;
}

function Segment({ value, options, onChange, label }) {
  return <LobeSegmented aria-label={label} className="overview-segment" onChange={onChange} options={options.map(([option, text]) => ({ label: text, value: option }))} size="small" value={value}/>;
}

export default function PromptOverview({ project, updateProject, viewState = DEFAULT_WORKBENCH_VIEW_STATE, onViewStateChange, focusScopeKey, focusTagId, onConfirm, onTagContextMenu, onCopyContextChange, onCopyText, onNotify, onTranslateTags }) {
  const { filters, language, viewMode } = viewState;
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [editingKey, setEditingKey] = useState('');
  const [addingScopeKey, setAddingScopeKey] = useState('');
  const [addDraft, setAddDraft] = useState('');
  const [rawEditingScopeKey, setRawEditingScopeKey] = useState('');
  const [rawDraft, setRawDraft] = useState('');
  const [renamingCharacterId, setRenamingCharacterId] = useState('');
  const [characterNameDraft, setCharacterNameDraft] = useState('');
  const [translatingKeys, setTranslatingKeys] = useState(new Set());
  const [expandedAutomaticScopes, setExpandedAutomaticScopes] = useState(new Set());
  const overviewContentRef = useRef(null);
  const selectionGestureRef = useRef(false);
  const structure = project.prompt_structure;

  useEffect(() => {
    setSelectionMode(false);
    setSelectedKeys([]);
    setDeleteArmed(false);
    setEditingKey('');
    setAddingScopeKey('');
    setAddDraft('');
    setRawEditingScopeKey('');
    setRawDraft('');
    setRenamingCharacterId('');
    setCharacterNameDraft('');
    setTranslatingKeys(new Set());
    setExpandedAutomaticScopes(new Set());
  }, [project.id]);

  useEffect(() => {
    if (!deleteArmed) return undefined;
    const timer = window.setTimeout(() => setDeleteArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteArmed]);

  const visibleScopes = useMemo(() => filterOverviewScopes(project, filters), [project, filters]);
  const displayedScopes = useMemo(() => filterCollapsedAutomaticScopes(visibleScopes, expandedAutomaticScopes), [visibleScopes, expandedAutomaticScopes]);
  const visibleEntries = useMemo(() => overviewEntries(displayedScopes), [displayedScopes]);
  const categoryGroups = useMemo(() => overviewCategoryGroups(visibleEntries), [visibleEntries]);
  const copyContext = useMemo(() => overviewCopyContext(project, visibleScopes, selectedKeys), [project, visibleScopes, selectedKeys]);
  const selectedEntries = useMemo(() => selectedOverviewEntries(project, selectedKeys), [project, selectedKeys]);
  const visibleCopyContext = useMemo(() => overviewCopyContext(project, visibleScopes, []), [project, visibleScopes]);
  const categorySourceScopes = useMemo(() => filterOverviewScopes(project, { ...filters, category: 'All' }), [project, filters]);
  const displayedCategorySourceScopes = useMemo(() => filterCollapsedAutomaticScopes(categorySourceScopes, expandedAutomaticScopes), [categorySourceScopes, expandedAutomaticScopes]);
  const categoryCounts = useMemo(() => overviewEntries(displayedCategorySourceScopes).reduce((counts, entry) => {
    counts[entry.tag.category || 'Unsorted'] = (counts[entry.tag.category || 'Unsorted'] || 0) + 1;
    return counts;
  }, {}), [displayedCategorySourceScopes]);
  const baseScopes = displayedScopes.filter((scope) => scope.kind === 'base');
  const characterScopes = displayedScopes.filter((scope) => scope.kind === 'character');
  const filtered = filters.category !== 'All' || filters.polarity !== 'all' || filters.domain !== 'all' || Boolean(filters.query.trim());
  const interactionState = overviewTagInteractionState(selectedKeys.length, filtered, selectionMode);
  const { selectionModeActive } = interactionState;
  const marqueeSelection = useMarqueeSelection({
    containerRef: overviewContentRef,
    enabled: visibleEntries.length > 0,
    onSelectionChange: (keys) => {
      setDeleteArmed(false);
      if (keys.length) {
        setEditingKey('');
        setAddingScopeKey('');
        setRawEditingScopeKey('');
      }
      setSelectedKeys(keys);
    },
    selectedKeys,
    startOnItems: interactionState.startMarqueeOnItems,
  });

  useEffect(() => {
    if (!focusTagId || !focusScopeKey) return;
    if (!isOverviewTagVisible(visibleEntries, focusScopeKey, focusTagId)) {
      setEditingKey('');
      onNotify?.('当前筛选已隐藏该 Tag', 'warning');
      return;
    }
    setEditingKey(overviewTagKey(focusScopeKey, focusTagId));
  }, [focusScopeKey, focusTagId]);

  useEffect(() => {
    onCopyContextChange?.(visibleCopyContext);
  }, [onCopyContextChange, visibleCopyContext]);

  const changeFilter = (patch) => {
    onViewStateChange?.({ ...viewState, filters: { ...filters, ...patch } });
    setSelectedKeys([]);
    setDeleteArmed(false);
  };

  const changeViewState = (patch) => onViewStateChange?.({ ...viewState, ...patch });

  const moveTag = (scope, sourceIndex, targetIndex) => {
    if (filtered || sourceIndex === targetIndex || sourceIndex < 0 || targetIndex < 0 || targetIndex >= scope.tags.length) return;
    const tags = [...scope.tags];
    const [moved] = tags.splice(sourceIndex, 1);
    tags.splice(targetIndex, 0, moved);
    updateProject(updatePromptScope(project, scope.key, tags));
  };

  const reorderTags = (scope, tags) => {
    if (filtered || tags.length !== scope.tags.length) return;
    const unchanged = tags.every((tag, index) => tag.id === scope.tags[index]?.id);
    if (!unchanged) updateProject(updatePromptScope(project, scope.key, tags));
  };

  const keyboardMove = (scope, index, event) => {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
    moveTag(scope, index, index + direction);
  };

  const toggleSelection = (key) => {
    setDeleteArmed(false);
    setEditingKey('');
    setAddingScopeKey('');
    setRawEditingScopeKey('');
    setSelectedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const toggleEntryGroup = (entries) => {
    setDeleteArmed(false);
    setSelectedKeys((current) => toggleOverviewSelectionGroup(current, entries));
  };

  const selectAllVisible = () => {
    setSelectedKeys(visibleEntries.map((entry) => entry.key));
    setDeleteArmed(false);
  };

  const copyVisibleOrSelected = () => onCopyText?.(copyContext.text, copyContext.count, copyContext.selected, copyContext.ignored, '', copyContext.automaticIgnored);

  const deleteSelected = () => {
    if (!selectedKeys.length) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    const count = selectedKeys.length;
    updateProject(deleteOverviewTags(project, selectedKeys));
    setSelectedKeys([]);
    setDeleteArmed(false);
    onNotify?.(`已删除 ${count} 个 Tag`);
  };

  const toggleAutomaticScope = (scope) => {
    const collapsing = expandedAutomaticScopes.has(scope.key);
    if (collapsing) {
      const automaticKeys = new Set(scope.automation.tagIds.map((tagId) => overviewTagKey(scope.key, tagId)));
      setSelectedKeys((current) => current.filter((key) => !automaticKeys.has(key)));
      setEditingKey((current) => automaticKeys.has(current) ? '' : current);
    }
    setExpandedAutomaticScopes((current) => {
      const next = new Set(current);
      if (next.has(scope.key)) next.delete(scope.key);
      else next.add(scope.key);
      return next;
    });
  };

  const toggleSelectionMode = () => {
    if (selectionModeActive) {
      setSelectionMode(false);
      setSelectedKeys([]);
      setDeleteArmed(false);
      return;
    }
    setSelectionMode(true);
    setEditingKey('');
    setAddingScopeKey('');
    setRawEditingScopeKey('');
    setDeleteArmed(false);
  };

  const updateTag = (scopeKey, tagId, patch) => {
    const scope = getPromptScope(project, scopeKey);
    updateProject(updatePromptScope(project, scopeKey, scope.tags.map((tag) => tag.id === tagId ? { ...tag, ...patch } : tag)));
  };

  const changeAddingScope = (scopeKey) => {
    setRawEditingScopeKey('');
    setAddingScopeKey(scopeKey);
    if (scopeKey) setAddDraft('');
  };

  const changeRawEditingScope = (scopeKey) => {
    setAddingScopeKey('');
    setRawEditingScopeKey(scopeKey);
    if (!scopeKey) return;
    setRawDraft(getPromptScope(project, scopeKey).raw_prompt || '');
  };

  const saveRawScope = (scopeKey) => {
    const scope = getPromptScope(project, scopeKey);
    const tags = parsePromptPreservingEdits(rawDraft, scope.tags);
    updateProject(updatePromptScope(project, scopeKey, tags, rawDraft));
    setRawEditingScopeKey('');
    setRawDraft('');
    onNotify?.(`已从原始文本更新 ${tags.length} 个 Tag`);
  };

  const addTags = (scopeKey) => {
    const scope = getPromptScope(project, scopeKey);
    const pending = analyzePromptBatch(addDraft, scope.tags);
    if (!pending.tags.length) return;
    updateProject(updatePromptScope(project, scopeKey, [...scope.tags, ...pending.tags]));
    setAddingScopeKey('');
    setAddDraft('');
    onNotify?.(`已添加 ${pending.tags.length} 个 Tag`);
  };

  const translateEntries = async (entries) => {
    if (!entries.length || !onTranslateTags) return;
    const keys = entries.map((entry) => overviewTagKey(entry.scopeKey, entry.tag.id));
    setTranslatingKeys((current) => new Set([...current, ...keys]));
    try {
      await onTranslateTags(entries);
    } finally {
      setTranslatingKeys((current) => {
        const next = new Set(current);
        keys.forEach((key) => next.delete(key));
        return next;
      });
    }
  };

  const handleTagClick = (event, key) => {
    if (selectionGestureRef.current && event.detail > 1) {
      selectionGestureRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    selectionGestureRef.current = false;
    const modifierSelection = event.ctrlKey || event.metaKey || event.shiftKey;
    if (!selectionModeActive && !modifierSelection) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.detail > 1) return;
    selectionGestureRef.current = true;
    toggleSelection(key);
  };

  const openTagContextMenu = (event, scopeKey, tag) => {
    if (!selectionModeActive) {
      onTagContextMenu?.(event, scopeKey, tag);
      return;
    }
    const contextKeys = selectedKeys.length ? selectedKeys : [overviewTagKey(scopeKey, tag.id)];
    const contextEntries = selectedKeys.length ? selectedEntries : selectedOverviewEntries(project, contextKeys);
    const contextCopy = overviewCopyContext(project, visibleScopes, contextKeys);
    const moveContext = overviewMoveContext(project, contextKeys);
    if (!selectedKeys.length) {
      setSelectedKeys(contextKeys);
      setDeleteArmed(false);
    }
    onTagContextMenu?.(event, scopeKey, tag, {
      count: contextEntries.length,
      copyCount: contextCopy.count,
      ignored: contextCopy.ignored,
      automaticIgnored: contextCopy.automaticIgnored,
      moveContext,
      translating: contextEntries.some((entry) => translatingKeys.has(entry.key)),
      onCopy: () => onCopyText?.(contextCopy.text, contextCopy.count, true, contextCopy.ignored, '', contextCopy.automaticIgnored),
      onTranslate: () => translateEntries(contextEntries),
      onCategoryChange: (category) => {
        updateProject(updateOverviewTags(project, contextKeys, { category, category_source: 'manual' }));
        onNotify?.(`已设置 ${contextEntries.length} 个 Tag 分类`);
      },
      onMove: (targetScopeKey) => {
        const target = moveContext.options.find((option) => option.key === targetScopeKey);
        const result = moveOverviewTags(project, contextKeys, targetScopeKey);
        if (!result.movedCount) return;
        updateProject(result.project);
        setSelectedKeys([]);
        setDeleteArmed(false);
        onNotify?.(`已移动 ${result.movedCount} 个 Tag 到 ${target?.label || '目标区域'}${result.mergedCount ? `，合并 ${result.mergedCount} 个重复项` : ''}`);
      },
      onDelete: () => {
        updateProject(deleteOverviewTags(project, contextKeys));
        setSelectedKeys([]);
        setDeleteArmed(false);
        onNotify?.(`已删除 ${contextEntries.length} 个 Tag`);
      },
    });
  };

  const addCharacter = () => {
    const next = addPromptCharacter(project);
    if (next === project) { onNotify?.(`最多支持 ${MAX_PROMPT_CHARACTERS} 个 Character Prompt`); return; }
    const character = next.prompt_structure.characters.at(-1);
    updateProject(next);
    setRenamingCharacterId(character.id);
    setCharacterNameDraft(character.label);
    onNotify?.(`${character.label} 已添加`);
  };

  const beginCharacterRename = (character) => {
    setRenamingCharacterId(character.id);
    setCharacterNameDraft(character.label);
  };

  const cancelCharacterRename = () => {
    setRenamingCharacterId('');
    setCharacterNameDraft('');
  };

  const commitCharacterRename = (character) => {
    const label = characterNameDraft.trim();
    if (!label) {
      onNotify?.('角色名称不能为空', 'error');
      return;
    }
    updateProject(updatePromptCharacter(project, character.id, { label }));
    cancelCharacterRename();
    if (label !== character.label) onNotify?.(`角色已重命名为 ${label}`);
  };

  const deleteCharacter = async (character) => {
    const tagCount = (character.prompt_tags?.length || 0) + (character.undesired_tags?.length || 0);
    const confirmed = onConfirm ? await onConfirm({
      title: `移除“${character.label}”？`,
      message: '该角色的 Prompt、Undesired Content 和已整理的 Tag 将一并移除。',
      detail: tagCount ? `共包含 ${tagCount} 个 Tag。` : '',
      okText: '移除角色',
      danger: true,
    }) : true;
    if (!confirmed) return;
    cancelCharacterRename();
    updateProject(removePromptCharacter(project, character.id));
    onNotify?.(`${character.label} 已移除`);
  };

  const scopeProps = {
    language,
    interactionState,
    selectedKeys,
    addDraft,
    addingScopeKey,
    filtered,
    onReorderTags: reorderTags,
    editingKey,
    onAddScope: addTags,
    onAddDraftChange: setAddDraft,
    onAddingScopeChange: changeAddingScope,
    onEditingChange: setEditingKey,
    onRawDraftChange: setRawDraft,
    onRawEditingScopeChange: changeRawEditingScope,
    onSaveRawScope: saveRawScope,
    onTranslateTag: (scopeKey, tag) => translateEntries([{ scopeKey, tag }]),
    onUpdateTag: updateTag,
    onKeyboardMove: keyboardMove,
    onTagClick: handleTagClick,
    onToggleGroup: toggleEntryGroup,
    onToggleAutomatic: toggleAutomaticScope,
    onTagContextMenu: openTagContextMenu,
    translatingKeys,
    rawDraft,
    rawEditingScopeKey,
  };

  return <LobeTooltipGroup arrow closeDelay={0} layoutAnimation openDelay={80}>
    <div className="prompt-overview">
    <header className="overview-header">
      <div className="overview-toolbar">
        <LobeSearchBar className="overview-search" onInputChange={(query) => changeFilter({ query })} placeholder="筛选 Tag 或译名" value={filters.query}/>
        <div className="overview-primary-actions">
          {selectionModeActive ? <>
            <span className="overview-selection-summary">已选 <b>{selectedKeys.length}</b></span>
            <LobeButton disabled={!visibleEntries.length} onClick={selectAllVisible} size="small">全选可见</LobeButton>
            <LobeButton disabled={!selectedKeys.length} onClick={() => setSelectedKeys([])} size="small">取消选择</LobeButton>
            <LobeButton disabled={!copyContext.count} onClick={copyVisibleOrSelected} size="small" type="primary">复制 {copyContext.count}</LobeButton>
            <LobeButton danger className={deleteArmed ? 'armed' : ''} disabled={!selectedKeys.length} onClick={deleteSelected} size="small" type={deleteArmed ? 'primary' : 'default'}>{deleteArmed ? `确认删除 ${selectedKeys.length}` : `删除 ${selectedKeys.length}`}</LobeButton>
            <LobeButton onClick={toggleSelectionMode} size="small">退出多选</LobeButton>
          </> : <>
            <LobeButton disabled={!visibleEntries.length || translatingKeys.size > 0} icon={<Icon name="spark" size={13}/>} onClick={() => translateEntries(visibleEntries)} size="small">{translatingKeys.size ? '整理中…' : `翻译与分类 ${visibleEntries.length}`}</LobeButton>
            <LobeButton disabled={structure.characters.length >= MAX_PROMPT_CHARACTERS} icon={<Icon name="plus" size={14}/>} onClick={addCharacter} size="small">角色</LobeButton>
            <LobeButton onClick={toggleSelectionMode} size="small">多选</LobeButton>
          </>}
        </div>
      </div>

      <div className="overview-filter-strip">
        <div className="overview-filter-controls">
          <Segment value={filters.polarity} options={[["all", '全部'], ['prompt', 'Prompt'], ['undesired', 'Undesired']]} onChange={(polarity) => changeFilter({ polarity })} label="Prompt 类型"/>
          <Segment value={filters.domain} options={[["all", '全部区域'], ['base', 'Base'], ['character', 'Character']]} onChange={(domain) => changeFilter({ domain })} label="Prompt 区域"/>
          <Segment value={viewMode} options={[["structure", '按结构'], ['category', '按分类']]} onChange={(nextViewMode) => changeViewState({ viewMode: nextViewMode })} label="总览分组方式"/>
          <Segment value={language} options={LANGUAGE_OPTIONS} onChange={(nextLanguage) => changeViewState({ language: nextLanguage })} label="显示语言"/>
        </div>
        <div className="overview-category-row" aria-label="Tag 分类筛选">
          <LobeButton className={filters.category === 'All' ? 'active' : ''} onClick={() => changeFilter({ category: 'All' })} size="small">全部 <b>{overviewEntries(displayedCategorySourceScopes).length}</b></LobeButton>
          {CATEGORY_OPTIONS.map((category) => <LobeButton key={category} className={`${filters.category === category ? 'active' : ''} cat-${category.toLowerCase()}`} onClick={() => changeFilter({ category })} size="small">{CATEGORY_LABELS[category]} <b>{categoryCounts[category] || 0}</b></LobeButton>)}
        </div>
      </div>

    </header>

    <div
      className={`overview-content is-marquee-enabled ${viewMode === 'category' ? 'category-view' : ''} ${selectionModeActive ? 'is-selection-active' : ''}`}
      ref={overviewContentRef}
      {...marqueeSelection.handlers}
    >
      {viewMode === 'category' && categoryGroups.map((group) => <CategoryGroup
        key={group.category}
        group={group}
        language={language}
        selectionModeActive={selectionModeActive}
        selectedKeys={selectedKeys}
        editingKey={editingKey}
        onEditingChange={setEditingKey}
        onTagClick={handleTagClick}
        onToggleGroup={toggleEntryGroup}
        onTranslateTag={(scopeKey, tag) => translateEntries([{ scopeKey, tag }])}
        onUpdateTag={updateTag}
        onTagContextMenu={openTagContextMenu}
        translatingKeys={translatingKeys}
      />)}

      {viewMode === 'structure' && baseScopes.length > 0 && <section className="overview-layer base-layer">
        <div className="overview-layer-body">
          <div className="overview-layer-heading"><strong>基础 Prompt</strong></div>
          {baseScopes.map((scope) => <ScopeTags automaticExpanded={expandedAutomaticScopes.has(scope.key)} key={scope.key} scope={scope} {...scopeProps}/>) }
        </div>
      </section>}

      {viewMode === 'structure' && filters.domain !== 'base' && structure.characters.map((character) => {
        const sections = characterScopes.filter((scope) => scope.characterId === character.id);
        if (!sections.length) return null;
        return <section className="overview-layer character-layer" key={character.id}>
          <div className="overview-layer-body">
            <div className="overview-layer-heading">
              <div className="character-heading-main">
                {renamingCharacterId === character.id ? <div className="character-heading-rename">
                  <LobeInput
                    aria-label={`重命名 ${character.label}`}
                    autoFocus
                    maxLength={80}
                    onChange={(event) => setCharacterNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') { event.preventDefault(); commitCharacterRename(character); }
                      if (event.key === 'Escape') { event.preventDefault(); cancelCharacterRename(); }
                    }}
                    value={characterNameDraft}
                  />
                  <LobeActionIcon aria-label="保存角色名称" disabled={!characterNameDraft.trim()} icon={Check} onClick={() => commitCharacterRename(character)} size="small" title="保存"/>
                  <LobeActionIcon aria-label="取消重命名" icon={X} onClick={cancelCharacterRename} size="small" title="取消"/>
                </div> : <strong className="character-heading-title" title={character.label}>{character.label}</strong>}
              </div>
              <div className="character-heading-actions">
                {renamingCharacterId !== character.id && <LobeActionIcon aria-label={`重命名 ${character.label}`} icon={Pencil} onClick={() => beginCharacterRename(character)} size="small" title="重命名角色"/>}
                <LobeDropdownMenu
                  items={[
                    { key: 'rename-character', label: '重命名', icon: Pencil, onClick: () => beginCharacterRename(character) },
                    { key: 'character-divider', type: 'divider' },
                    { key: 'delete-character', label: '移除角色', icon: Trash2, danger: true, onClick: () => deleteCharacter(character) },
                  ]}
                  placement="bottomRight"
                >
                  <LobeActionIcon aria-label={`${character.label} 的更多操作`} icon={MoreHorizontal} size="small" title="更多角色操作"/>
                </LobeDropdownMenu>
              </div>
            </div>
            {sections.map((scope) => <ScopeTags automaticExpanded={expandedAutomaticScopes.has(scope.key)} key={scope.key} scope={scope} {...scopeProps}/>) }
          </div>
        </section>;
      })}

      {!visibleEntries.length && filtered && <div className="overview-no-results"><strong>没有符合条件的 Tag</strong><span>调整分类、区域或搜索词后，顶部复制内容会同步更新。</span></div>}
      {viewMode === 'structure' && !structure.characters.length && filters.domain !== 'base' && <div className="overview-add-character-shell">
        <LobeButton className="overview-add-character" icon={<Icon name="plus" size={20}/>} onClick={addCharacter} type="dashed">
          <div><strong>暂无角色 Prompt</strong><small>添加后可分别整理角色 Prompt 与排除内容。</small></div>
        </LobeButton>
      </div>}
    </div>
    <MarqueeSelectionOverlay rect={marqueeSelection.rect}/>
    </div>
  </LobeTooltipGroup>;
}
