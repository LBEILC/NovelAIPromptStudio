import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, getFirstCollision, pointerWithin, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { Popover as LobePopover, SearchBar as LobeSearchBar, TooltipGroup as LobeTooltipGroup } from '@lobehub/ui';
import { motion, useReducedMotion } from 'motion/react';
import {
  Button as LobeButton,
  Checkbox as LobeCheckbox,
  Input as LobeInput,
  Segmented as LobeSegmented,
  Select as LobeSelect,
  TextArea as LobeTextArea,
} from '@lobehub/ui/base-ui';
import { analyzePromptBatch, CATEGORY_LABELS, CATEGORY_OPTIONS, inferCategory, parsePromptPreservingEdits } from './lib/prompt.js';
import { addPromptCharacter, getPromptScope, removePromptCharacter, updatePromptCharacter, updatePromptScope } from './lib/promptStructure.js';
import Icon from './components/Icon.jsx';
import { MarqueeSelectionOverlay, useMarqueeSelection } from './components/MarqueeSelection.jsx';
import { TagCategorySection, TagChip, TagHoverPreview, TagPopover, TagQuickEditor } from './components/TagManagement.jsx';
import { tagPresentation } from './lib/tagManagement.js';
import { encodeMarqueeKey } from './lib/marqueeSelection.js';
import {
  deleteOverviewTags,
  filterOverviewScopes,
  isOverviewTagVisible,
  overviewCategoryGroups,
  overviewCopyContext,
  overviewEntries,
  overviewTagInteractionState,
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

function compactPosition(center) {
  return `${Math.round(Number(center?.x ?? 0.5) * 100)} / ${Math.round(Number(center?.y ?? 0.5) * 100)}`;
}

function syntaxMessage(tag) {
  if (tag.syntax_issue === 'control_only') return '单独的 :: 是结束控制符，不是 Tag，建议删除。';
  if (tag.syntax_issue === 'emphasis_closer') return '包含可能多余的 :: 结束符；没有前置强调时相当于普通权重 1。';
  return '';
}

function SortableTag({ animateLayout, display, editKey, editingKey, index, language, onEditingChange, onKeyboardMove, onTagClick, onTagContextMenu, onTranslateTag, onUpdateTag, reorderDisabled, scope, selected, selectionActive, tag, translating, warning }) {
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
    display={display}
    dragging={isDragging}
    onClick={(event) => onTagClick(event, editKey)}
    onContextMenu={(event) => onTagContextMenu(event, scope.key, tag)}
    onKeyDown={(event) => selectionActive ? undefined : onKeyboardMove(scope, index, event)}
    selected={selected}
    selecting={selectionActive}
    showSelectionMark={false}
    tag={tag}
    tooltip={<TagHoverPreview
      actionHint={selectionActive
        ? '点击选择或取消 · 拖动 Tag 或空白处框选'
        : reorderDisabled
          ? '点击编辑 · 从空白处框选 · 清除筛选后可排序'
          : '点击编辑 · 拖动排序 · 从空白处框选'}
      language={language}
      scopeLabel={scope.label}
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
      disabled={selectionActive}
      editKey={editKey}
      editingKey={editingKey}
      onEditingChange={onEditingChange}
    >
      {tagButton}
    </TagPopover>
  </motion.div>;
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

function CharacterEditor({ character, project, onChange, onClose, onDelete }) {
  const structure = project.prompt_structure;
  const activeColumn = Math.max(0, Math.min(4, Math.round(Number(character.center?.x ?? 0.5) * 5 - 0.5)));
  const activeRow = Math.max(0, Math.min(4, Math.round(Number(character.center?.y ?? 0.5) * 5 - 0.5)));
  const updateStructure = (patch) => onChange({ ...project, prompt_structure: { ...structure, ...patch } });
  const choosePosition = (column, row) => onChange(updatePromptCharacter(project, character.id, {
    center: { x: (column + 0.5) / 5, y: (row + 0.5) / 5 },
  }));
  return <div className="character-quick-editor" onClick={(event) => event.stopPropagation()}>
    <div className="tag-quick-editor-heading">
      <div><strong>角色设置</strong><small>名称、位置与生成顺序</small></div>
      <LobeButton onClick={onClose} size="small" type="text">完成</LobeButton>
    </div>
    <label><span>角色名称</span><LobeInput autoFocus onChange={(event) => onChange(updatePromptCharacter(project, character.id, { label: event.target.value }))} value={character.label}/></label>
    <div className="character-position-heading">
      <div><strong>Character Position</strong><small>5 × 5 粗略位置引导</small></div>
      <label><LobeCheckbox checked={Boolean(structure.use_coords)} onChange={(checked) => updateStructure({ use_coords: checked })} size={16}/><span>{structure.use_coords ? '自定义位置' : 'AI 选择'}</span></label>
    </div>
    <div className={`character-position-grid ${structure.use_coords ? '' : 'disabled'}`} aria-label={`${character.label} 位置`}>
      {Array.from({ length: 25 }, (_, index) => {
        const column = index % 5;
        const row = Math.floor(index / 5);
        return <button aria-label={`第 ${row + 1} 行，第 ${column + 1} 列`} className={activeColumn === column && activeRow === row ? 'active' : ''} disabled={!structure.use_coords} key={index} onClick={() => choosePosition(column, row)}><i/></button>;
      })}
    </div>
    <div className="character-position-footer"><code>X {Number(character.center?.x ?? 0.5).toFixed(2)} · Y {Number(character.center?.y ?? 0.5).toFixed(2)}</code><label><LobeCheckbox checked={Boolean(structure.use_order)} onChange={(checked) => updateStructure({ use_order: checked })} size={16}/><span>遵循角色顺序</span></label></div>
    <div className="character-quick-editor-actions"><LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={onDelete} size="small">移除角色</LobeButton></div>
  </div>;
}

function ScopeTags({
  scope,
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
  const { reorderDisabled, selectionActive } = interactionState;
  return <div className={`overview-scope ${scope.polarity === 'undesired' ? 'undesired' : ''}`}>
    <div className="overview-scope-heading">
      <div><strong>{scope.polarity === 'undesired' ? '排除' : 'Prompt'}</strong>{scope.tags.length > 0 && <small>{scope.tags.length} 个 Tag</small>}</div>
      {selectionActive ? <SelectionGroupButton entries={scopeEntries} selectedKeys={selectedKeys} onToggle={onToggleGroup}/> : <div className="overview-scope-actions">
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
        <div className={`overview-tags ${activeTagId ? 'sorting' : ''}`} role="list" aria-label={scope.label}>
          {renderedTags.map((tag, index) => {
            const key = overviewTagKey(scope.key, tag.id);
            return <SortableTag
              animateLayout={animateLayout}
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
              selectionActive={selectionActive}
              tag={tag}
              translating={translatingKeys.has(key)}
              warning={syntaxMessage(tag)}
            />;
          })}
          {!scope.tags.length && (filtered
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

function CategoryGroup({ group, language, selectionActive, selectedKeys, editingKey, onEditingChange, onTagClick, onToggleGroup, onTranslateTag, onUpdateTag, onTagContextMenu, translatingKeys }) {
  const selectedSet = new Set(selectedKeys);
  return <TagCategorySection
    action={selectionActive ? <SelectionGroupButton entries={group.entries} selectedKeys={selectedKeys} onToggle={onToggleGroup}/> : null}
    category={group.category}
    count={group.entries.length}
  >
    {group.entries.map((entry) => {
      const selected = selectedSet.has(entry.key);
      const display = tagPresentation(entry.tag, language);
      const warning = syntaxMessage(entry.tag);
      const tagButton = <TagChip
        className={entry.scopePolarity === 'undesired' ? 'undesired-tag' : ''}
        data-marquee-key={encodeMarqueeKey(entry.key)}
        display={display}
        onClick={(event) => onTagClick(event, entry.key)}
        onContextMenu={(event) => onTagContextMenu(event, entry.scopeKey, entry.tag)}
        role="listitem"
        selected={selected}
        selecting={selectionActive}
        showSelectionMark={false}
        tag={entry.tag}
        tooltip={<TagHoverPreview
          actionHint={selectionActive ? '点击选择或取消 · 拖动 Tag 或空白处框选' : '点击编辑 · 从空白处框选'}
          language={language}
          scopeLabel={entry.scopeLabel}
          tag={entry.tag}
          warning={warning}
        />}
        warning={warning}
      />;
      return <TagPopover
        content={<TagQuickEditor tag={entry.tag} translating={translatingKeys.has(entry.key)} onChange={(patch) => onUpdateTag(entry.scopeKey, entry.tag.id, patch)} onClose={() => onEditingChange('')} onTranslate={() => onTranslateTag(entry.scopeKey, entry.tag)}/>}
        disabled={selectionActive}
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

export default function PromptOverview({ project, updateProject, viewState = DEFAULT_WORKBENCH_VIEW_STATE, onViewStateChange, focusScopeKey, focusTagId, onTagContextMenu, onCopyContextChange, onCopyText, onNotify, onTranslateTags }) {
  const { filters, language, viewMode } = viewState;
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [editingKey, setEditingKey] = useState('');
  const [addingScopeKey, setAddingScopeKey] = useState('');
  const [addDraft, setAddDraft] = useState('');
  const [rawEditingScopeKey, setRawEditingScopeKey] = useState('');
  const [rawDraft, setRawDraft] = useState('');
  const [editingCharacterId, setEditingCharacterId] = useState('');
  const [translatingKeys, setTranslatingKeys] = useState(new Set());
  const overviewContentRef = useRef(null);
  const selectionGestureRef = useRef(false);
  const structure = project.prompt_structure;

  useEffect(() => {
    setSelectedKeys([]);
    setDeleteArmed(false);
    setEditingKey('');
    setAddingScopeKey('');
    setAddDraft('');
    setRawEditingScopeKey('');
    setRawDraft('');
    setEditingCharacterId('');
    setTranslatingKeys(new Set());
  }, [project.id]);

  useEffect(() => {
    if (!deleteArmed) return undefined;
    const timer = window.setTimeout(() => setDeleteArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteArmed]);

  const visibleScopes = useMemo(() => filterOverviewScopes(project, filters), [project, filters]);
  const visibleEntries = useMemo(() => overviewEntries(visibleScopes), [visibleScopes]);
  const categoryGroups = useMemo(() => overviewCategoryGroups(visibleEntries), [visibleEntries]);
  const copyContext = useMemo(() => overviewCopyContext(project, visibleScopes, selectedKeys), [project, visibleScopes, selectedKeys]);
  const selectedEntries = useMemo(() => selectedOverviewEntries(project, selectedKeys), [project, selectedKeys]);
  const visibleCopyContext = useMemo(() => overviewCopyContext(project, visibleScopes, []), [project, visibleScopes]);
  const categorySourceScopes = useMemo(() => filterOverviewScopes(project, { ...filters, category: 'All' }), [project, filters]);
  const categoryCounts = useMemo(() => overviewEntries(categorySourceScopes).reduce((counts, entry) => {
    counts[entry.tag.category || 'Unsorted'] = (counts[entry.tag.category || 'Unsorted'] || 0) + 1;
    return counts;
  }, {}), [categorySourceScopes]);
  const baseScopes = visibleScopes.filter((scope) => scope.kind === 'base');
  const characterScopes = visibleScopes.filter((scope) => scope.kind === 'character');
  const filtered = filters.category !== 'All' || filters.polarity !== 'all' || filters.domain !== 'all' || Boolean(filters.query.trim());
  const interactionState = overviewTagInteractionState(selectedKeys.length, filtered);
  const { selectionActive } = interactionState;
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

  const copyVisibleOrSelected = () => onCopyText?.(copyContext.text, copyContext.count, copyContext.selected, copyContext.ignored);

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
    if (!selectionActive && !modifierSelection) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.detail > 1) return;
    selectionGestureRef.current = true;
    toggleSelection(key);
  };

  const openTagContextMenu = (event, scopeKey, tag) => {
    if (!selectionActive) {
      onTagContextMenu?.(event, scopeKey, tag);
      return;
    }
    const contextKeys = selectedKeys;
    const contextEntries = selectedEntries;
    const contextCopy = overviewCopyContext(project, visibleScopes, contextKeys);
    onTagContextMenu?.(event, scopeKey, tag, {
      count: contextEntries.length,
      copyCount: contextCopy.count,
      ignored: contextCopy.ignored,
      translating: contextEntries.some((entry) => translatingKeys.has(entry.key)),
      onCopy: () => onCopyText?.(contextCopy.text, contextCopy.count, true, contextCopy.ignored),
      onTranslate: () => translateEntries(contextEntries),
      onCategoryChange: (category) => {
        updateProject(updateOverviewTags(project, contextKeys, { category, category_source: 'manual' }));
        onNotify?.(`已设置 ${contextEntries.length} 个 Tag 分类`);
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
    if (next === project) { onNotify?.('最多支持 6 个 Character Prompt'); return; }
    const character = next.prompt_structure.characters.at(-1);
    updateProject(next);
    setEditingCharacterId(character.id);
    onNotify?.(`${character.label} 已添加`);
  };

  const deleteCharacter = (character) => {
    setEditingCharacterId('');
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
    onTagContextMenu: openTagContextMenu,
    translatingKeys,
    rawDraft,
    rawEditingScopeKey,
  };

  return <LobeTooltipGroup arrow closeDelay={80} layoutAnimation openDelay={320}>
    <div className="prompt-overview">
    <header className="overview-header">
      <div className="overview-toolbar">
        <LobeSearchBar className="overview-search" onInputChange={(query) => changeFilter({ query })} placeholder="筛选 Tag 或译名" value={filters.query}/>
        <div className="overview-primary-actions">
          <LobeButton disabled={!visibleEntries.length || translatingKeys.size > 0} icon={<Icon name="spark" size={13}/>} onClick={() => translateEntries(visibleEntries)} size="small">{translatingKeys.size ? '翻译中…' : `AI 翻译 ${visibleEntries.length}`}</LobeButton>
          <LobeButton disabled={structure.characters.length >= 6} icon={<Icon name="plus" size={14}/>} onClick={addCharacter} size="small">角色</LobeButton>
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
          <LobeButton className={filters.category === 'All' ? 'active' : ''} onClick={() => changeFilter({ category: 'All' })} size="small">全部 <b>{overviewEntries(categorySourceScopes).length}</b></LobeButton>
          {CATEGORY_OPTIONS.map((category) => <LobeButton key={category} className={`${filters.category === category ? 'active' : ''} cat-${category.toLowerCase()}`} onClick={() => changeFilter({ category })} size="small">{CATEGORY_LABELS[category]} <b>{categoryCounts[category] || 0}</b></LobeButton>)}
        </div>
      </div>

      {selectionActive && <div className="overview-selection-bar">
        <span>已选 <b>{selectedKeys.length}</b> 个{copyContext.categoryCount ? ` · ${copyContext.categoryCount} 个分类` : ''}{copyContext.ignored ? ` · ${copyContext.ignored} 个排除 Tag 不会复制` : ''}。</span>
        <LobeButton disabled={!visibleEntries.length} onClick={selectAllVisible} size="small">全选可见</LobeButton>
        <LobeButton disabled={!selectedKeys.length} onClick={() => setSelectedKeys([])} size="small">取消选择</LobeButton>
        <LobeButton disabled={!copyContext.count} onClick={copyVisibleOrSelected} size="small" type="primary">{copyContext.selected ? `复制已选 ${copyContext.count}` : `复制可见 ${copyContext.count}`}</LobeButton>
        <LobeButton danger className={deleteArmed ? 'armed' : ''} disabled={!selectedKeys.length} onClick={deleteSelected} size="small" type={deleteArmed ? 'primary' : 'default'}>{deleteArmed ? `再次点击删除 ${selectedKeys.length}` : `删除已选 ${selectedKeys.length}`}</LobeButton>
      </div>}
    </header>

    <div
      className={`overview-content is-marquee-enabled ${viewMode === 'category' ? 'category-view' : ''} ${selectionActive ? 'is-selection-active' : ''}`}
      ref={overviewContentRef}
      {...marqueeSelection.handlers}
    >
      {viewMode === 'category' && categoryGroups.map((group) => <CategoryGroup
        key={group.category}
        group={group}
        language={language}
        selectionActive={selectionActive}
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
          {baseScopes.map((scope) => <ScopeTags key={scope.key} scope={scope} {...scopeProps}/>) }
        </div>
      </section>}

      {viewMode === 'structure' && filters.domain !== 'base' && structure.characters.map((character) => {
        const sections = characterScopes.filter((scope) => scope.characterId === character.id);
        if (!sections.length) return null;
        return <section className="overview-layer character-layer" key={character.id}>
          <div className="overview-layer-body">
            <div className="overview-layer-heading">
              <strong>{character.label}</strong>
              <LobePopover arrow className="character-quick-popover" content={<CharacterEditor character={character} project={project} onChange={updateProject} onClose={() => setEditingCharacterId('')} onDelete={() => deleteCharacter(character)}/>} onOpenChange={(open) => setEditingCharacterId(open ? character.id : '')} open={editingCharacterId === character.id} placement="bottomRight" trigger="click"><LobeButton size="small" type="text">{structure.use_coords ? `位置 ${compactPosition(character.center)}` : 'AI 位置'}</LobeButton></LobePopover>
            </div>
            {sections.map((scope) => <ScopeTags key={scope.key} scope={scope} {...scopeProps}/>) }
          </div>
        </section>;
      })}

      {!visibleEntries.length && filtered && <div className="overview-no-results"><strong>没有符合条件的 Tag</strong><span>调整分类、区域或搜索词后，顶部复制内容会同步更新。</span></div>}
      {viewMode === 'structure' && !structure.characters.length && filters.domain !== 'base' && <div className="overview-add-character-shell">
        <LobeButton className="overview-add-character" icon={<Icon name="plus" size={20}/>} onClick={addCharacter} type="dashed">
          <div><strong>暂无角色 Prompt</strong><small>添加后可设置角色名称、位置和独立 Prompt。</small></div>
        </LobeButton>
      </div>}
    </div>
    <MarqueeSelectionOverlay rect={marqueeSelection.rect}/>
    </div>
  </LobeTooltipGroup>;
}
