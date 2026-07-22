import { useEffect, useMemo, useState } from 'react';
import LobeButton from '@lobehub/ui/es/Button/index';
import LobeCheckbox from '@lobehub/ui/es/Checkbox/index';
import LobeInput from '@lobehub/ui/es/Input/Input';
import LobeTextArea from '@lobehub/ui/es/Input/TextArea';
import LobePopover from '@lobehub/ui/es/Popover/index';
import LobeSearchBar from '@lobehub/ui/es/SearchBar/index';
import LobeSelect from '@lobehub/ui/es/Select/index';
import LobeSliderWithInput from '@lobehub/ui/es/SliderWithInput/index';
import LobeSegmented from '@lobehub/ui/es/base-ui/Segmented/Segmented';
import { analyzePromptBatch, CATEGORY_LABELS, CATEGORY_OPTIONS, inferCategory } from './lib/prompt.js';
import { addPromptCharacter, getPromptScope, removePromptCharacter, updatePromptCharacter, updatePromptScope } from './lib/promptStructure.js';
import SelectionMark from './components/SelectionMark.jsx';
import Icon from './components/Icon.jsx';
import {
  DEFAULT_OVERVIEW_FILTERS,
  deleteOverviewTags,
  filterOverviewScopes,
  overviewCategoryGroups,
  overviewCopyContext,
  overviewEntries,
  overviewTagKey,
} from './lib/promptOverview.js';

const LANGUAGE_OPTIONS = [
  ['original', '原文'],
  ['translated', '翻译'],
  ['bilingual', '对照'],
];

function compactPosition(center) {
  return `${Math.round(Number(center?.x ?? 0.5) * 100)} / ${Math.round(Number(center?.y ?? 0.5) * 100)}`;
}

function syntaxMessage(tag) {
  if (tag.syntax_issue === 'control_only') return '单独的 :: 是结束控制符，不是 Tag，建议删除。';
  if (tag.syntax_issue === 'emphasis_closer') return '包含可能多余的 :: 结束符；没有前置强调时相当于普通权重 1。';
  return '';
}

function tagPresentation(tag, language) {
  if (language === 'translated') {
    return {
      primary: tag.translation || tag.tag,
      secondary: '',
      title: tag.translation ? `原文：${tag.tag}` : `暂无翻译 · 原文：${tag.tag}`,
      fallback: !tag.translation,
    };
  }
  if (language === 'bilingual') {
    return {
      primary: tag.tag,
      secondary: tag.translation || '暂无翻译',
      title: tag.translation ? `原文：${tag.tag}\n翻译：${tag.translation}` : `原文：${tag.tag}\n暂无翻译`,
      fallback: !tag.translation,
    };
  }
  return {
    primary: tag.tag,
    secondary: '',
    title: tag.translation ? `翻译：${tag.translation}` : '暂无翻译',
    fallback: false,
  };
}

function TagQuickEditor({ tag, translating, onChange, onClose, onTranslate }) {
  return <div className="tag-quick-editor" onClick={(event) => event.stopPropagation()}>
    <div className="tag-quick-editor-heading">
      <div><strong>编辑 Tag</strong><small>修改只保存在当前工作台草稿</small></div>
      <LobeButton onClick={onClose} size="small" type="text">完成</LobeButton>
    </div>
    <label><span>原文</span><LobeInput autoFocus onChange={(event) => onChange({ tag: event.target.value, translation: '', translation_source: '', category: inferCategory(event.target.value), category_source: 'heuristic', raw_segment: '', syntax_issue: '' })} size="small" value={tag.tag}/></label>
    <label><span>翻译</span><LobeInput onChange={(event) => onChange({ translation: event.target.value, translation_source: 'manual' })} placeholder="添加中文翻译" size="small" value={tag.translation || ''}/></label>
    <div className="tag-quick-editor-row">
      <label><span>分类</span><LobeSelect onChange={(category) => onChange({ category, category_source: 'manual' })} options={CATEGORY_OPTIONS.map((value) => ({ label: CATEGORY_LABELS[value], value }))} size="small" value={tag.category || 'Unsorted'}/></label>
      <label><span>权重</span><LobeSliderWithInput controls={false} gap={6} max={10} min={-10} onChange={(weight) => onChange({ weight: Number(weight) })} size="small" step={0.05} value={Number(tag.weight)}/></label>
    </div>
    <div className="tag-quick-editor-footer">
      <LobeButton disabled={translating} icon={<Icon name="spark" size={14}/>} onClick={onTranslate} size="small">{translating ? '翻译中…' : 'AI 翻译'}</LobeButton>
    </div>
  </div>;
}

function EditableTag({ children, disabled, editKey, editingKey, onEditingChange, onTranslate, onUpdate, tag, translating }) {
  if (disabled) return children;
  return <LobePopover
    arrow
    className="tag-quick-popover"
    content={<TagQuickEditor tag={tag} translating={translating} onChange={onUpdate} onClose={() => onEditingChange('')} onTranslate={onTranslate}/>}
    onOpenChange={(open) => onEditingChange(open ? editKey : '')}
    open={editingKey === editKey}
    placement="bottomLeft"
    trigger="click"
  >
    {children}
  </LobePopover>;
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
      <label><LobeCheckbox checked={Boolean(structure.use_coords)} onChange={(event) => updateStructure({ use_coords: event.target.checked })} size={16}/><span>{structure.use_coords ? '自定义位置' : 'AI 选择'}</span></label>
    </div>
    <div className={`character-position-grid ${structure.use_coords ? '' : 'disabled'}`} aria-label={`${character.label} 位置`}>
      {Array.from({ length: 25 }, (_, index) => {
        const column = index % 5;
        const row = Math.floor(index / 5);
        return <button aria-label={`第 ${row + 1} 行，第 ${column + 1} 列`} className={activeColumn === column && activeRow === row ? 'active' : ''} disabled={!structure.use_coords} key={index} onClick={() => choosePosition(column, row)}><i/></button>;
      })}
    </div>
    <div className="character-position-footer"><code>X {Number(character.center?.x ?? 0.5).toFixed(2)} · Y {Number(character.center?.y ?? 0.5).toFixed(2)}</code><label><LobeCheckbox checked={Boolean(structure.use_order)} onChange={(event) => updateStructure({ use_order: event.target.checked })} size={16}/><span>遵循角色顺序</span></label></div>
    <div className="character-quick-editor-actions"><LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={onDelete} size="small">移除角色</LobeButton></div>
  </div>;
}

function ScopeTags({
  scope,
  addDraft,
  addingScopeKey,
  dragging,
  language,
  selecting,
  selectedKeys,
  filtered,
  onDragStart,
  onDragEnd,
  onDrop,
  editingKey,
  onAddScope,
  onAddDraftChange,
  onAddingScopeChange,
  onEditingChange,
  onTranslateTag,
  onUpdateTag,
  onKeyboardMove,
  onToggleSelect,
  onTagContextMenu,
  translatingKeys,
}) {
  const selectedSet = new Set(selectedKeys);
  const pendingAdd = analyzePromptBatch(addDraft, scope.tags);
  return <div className={`overview-scope ${scope.polarity === 'undesired' ? 'undesired' : ''}`}>
    <div className="overview-scope-heading">
      <span>{scope.polarity === 'undesired' ? '排除' : 'Prompt'}</span>
      <b>{scope.tags.length}</b>
      <LobePopover
        arrow
        className="add-tag-popover-shell"
        content={<AddTagEditor draft={addDraft} pending={pendingAdd} scope={scope} onAdd={() => onAddScope(scope.key)} onChange={onAddDraftChange} onClose={() => onAddingScopeChange('')}/>}
        disabled={selecting}
        onOpenChange={(open) => onAddingScopeChange(open ? scope.key : '')}
        open={addingScopeKey === scope.key}
        placement="bottomLeft"
        trigger="click"
      ><LobeButton aria-label={`添加到 ${scope.label}`} icon={<Icon name="plus" size={13}/>} size="small" type="text"/></LobePopover>
    </div>
    <div className="overview-tags" role="list" aria-label={scope.label}>
      {scope.tags.map((tag, index) => {
        const key = overviewTagKey(scope.key, tag.id);
        const selected = selectedSet.has(key);
        const display = tagPresentation(tag, language);
        const warning = syntaxMessage(tag);
        const tagButton = <button
          key={tag.id}
          className={`overview-tag cat-${String(tag.category || 'Unsorted').toLowerCase()} ${dragging?.scopeKey === scope.key && dragging.index === index ? 'dragging' : ''} ${selected ? 'selected' : ''} ${selecting ? 'selecting' : ''} ${display.fallback ? 'translation-fallback' : ''} ${warning ? 'syntax-warning' : ''}`}
          draggable={!selecting && !filtered}
          onDragStart={(event) => !selecting && !filtered && onDragStart(scope.key, index, event)}
          onDragEnd={onDragEnd}
          onDragOver={(event) => !selecting && !filtered && event.preventDefault()}
          onDrop={(event) => !selecting && !filtered && onDrop(scope, index, event)}
          onClick={(event) => {
            if (!selecting) return;
            event.preventDefault();
            event.stopPropagation();
            onToggleSelect(key);
          }}
          onContextMenu={(event) => onTagContextMenu(event, scope.key, tag)}
          onKeyDown={(event) => selecting ? undefined : onKeyboardMove(scope, index, event)}
          role="listitem"
          aria-pressed={selecting ? selected : undefined}
          title={`${display.title}${warning ? `\n语法提醒：${warning}` : ''}${selecting ? '\n点击选择' : '\n点击编辑，拖动排序'}`}
        >
          {selecting && <SelectionMark selected={selected}/>}
          <span className="overview-tag-copy"><span>{display.primary}</span>{display.secondary && <small>{display.secondary}</small>}</span>
          {Math.abs(Number(tag.weight) - 1) >= 0.001 && <em>{Number(tag.weight).toFixed(2)}</em>}
          {warning && <Icon name="warning" className="overview-syntax-mark" size={15}/>}
        </button>;
        return <EditableTag
          disabled={selecting}
          editKey={key}
          editingKey={editingKey}
          key={tag.id}
          onEditingChange={onEditingChange}
          onTranslate={() => onTranslateTag(scope.key, tag)}
          onUpdate={(patch) => onUpdateTag(scope.key, tag.id, patch)}
          tag={tag}
          translating={translatingKeys.has(key)}
        >
          {tagButton}
        </EditableTag>;
      })}
      {!scope.tags.length && (filtered
        ? <span className="overview-filter-empty">当前筛选无 Tag</span>
        : <span className="overview-filter-empty">暂无 Tag，使用左侧加号添加</span>)}
    </div>
  </div>;
}

function CategoryGroup({ group, language, selecting, selectedKeys, editingKey, onEditingChange, onToggleSelect, onToggleGroup, onTranslateTag, onUpdateTag, onTagContextMenu, translatingKeys }) {
  const selectedSet = new Set(selectedKeys);
  const groupKeys = group.entries.map((entry) => entry.key);
  const allSelected = groupKeys.length > 0 && groupKeys.every((key) => selectedSet.has(key));
  return <section className={`overview-category-group cat-${String(group.category).toLowerCase()}`}>
    <div className="overview-category-body">
      <div className="overview-category-heading">
        <div><strong>{CATEGORY_LABELS[group.category] || group.category}</strong><small>{group.entries.length} 个 Tag</small></div>
        {selecting && <LobeButton className={allSelected ? 'active' : ''} onClick={() => onToggleGroup(group.entries)} size="small">{allSelected ? '取消整组' : `选择整组 ${group.entries.length}`}</LobeButton>}
      </div>
      <div className="overview-tags" role="list" aria-label={`${CATEGORY_LABELS[group.category] || group.category} Tag`}>
        {group.entries.map((entry) => {
          const selected = selectedSet.has(entry.key);
          const display = tagPresentation(entry.tag, language);
          const warning = syntaxMessage(entry.tag);
          const tagButton = <button
            key={entry.key}
            className={`overview-tag cat-${String(group.category).toLowerCase()} ${entry.scopePolarity === 'undesired' ? 'undesired-tag' : ''} ${selected ? 'selected' : ''} ${selecting ? 'selecting' : ''} ${display.fallback ? 'translation-fallback' : ''} ${warning ? 'syntax-warning' : ''}`}
            onClick={(event) => {
              if (!selecting) return;
              event.preventDefault();
              event.stopPropagation();
              onToggleSelect(entry.key);
            }}
            onContextMenu={(event) => onTagContextMenu(event, entry.scopeKey, entry.tag)}
            role="listitem"
            aria-pressed={selecting ? selected : undefined}
            title={`${display.title}\n区域：${entry.scopeLabel}${warning ? `\n语法提醒：${warning}` : ''}${selecting ? '\n点击选择' : '\n点击编辑'}`}
          >
            {selecting && <SelectionMark selected={selected}/>}
            <span className="overview-tag-copy"><span>{display.primary}</span>{display.secondary && <small>{display.secondary}</small>}</span>
            {Math.abs(Number(entry.tag.weight) - 1) >= 0.001 && <em>{Number(entry.tag.weight).toFixed(2)}</em>}
            {warning && <Icon name="warning" className="overview-syntax-mark" size={15}/>}
          </button>;
          return <EditableTag
            disabled={selecting}
            editKey={entry.key}
            editingKey={editingKey}
            key={entry.key}
            onEditingChange={onEditingChange}
            onTranslate={() => onTranslateTag(entry.scopeKey, entry.tag)}
            onUpdate={(patch) => onUpdateTag(entry.scopeKey, entry.tag.id, patch)}
            tag={entry.tag}
            translating={translatingKeys.has(entry.key)}
          >
            {tagButton}
          </EditableTag>;
        })}
      </div>
    </div>
  </section>;
}

function Segment({ value, options, onChange, label }) {
  return <LobeSegmented aria-label={label} className="overview-segment" onChange={onChange} options={options.map(([option, text]) => ({ label: text, value: option }))} size="small" value={value}/>;
}

export default function PromptOverview({ project, updateProject, focusScopeKey, focusTagId, onTagContextMenu, onCopyText, onNotify, onTranslateTags }) {
  const [dragging, setDragging] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_OVERVIEW_FILTERS);
  const [language, setLanguage] = useState('original');
  const [viewMode, setViewMode] = useState('structure');
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [editingKey, setEditingKey] = useState('');
  const [addingScopeKey, setAddingScopeKey] = useState('');
  const [addDraft, setAddDraft] = useState('');
  const [editingCharacterId, setEditingCharacterId] = useState('');
  const [translatingKeys, setTranslatingKeys] = useState(new Set());
  const structure = project.prompt_structure;

  useEffect(() => {
    setFilters(DEFAULT_OVERVIEW_FILTERS);
    setViewMode('structure');
    setSelecting(false);
    setSelectedKeys([]);
    setDeleteArmed(false);
    setEditingKey('');
    setAddingScopeKey('');
    setAddDraft('');
    setEditingCharacterId('');
    setTranslatingKeys(new Set());
  }, [project.id]);

  useEffect(() => {
    if (!focusTagId || !focusScopeKey) return;
    setFilters(DEFAULT_OVERVIEW_FILTERS);
    setViewMode('structure');
    setEditingKey(overviewTagKey(focusScopeKey, focusTagId));
  }, [focusScopeKey, focusTagId]);

  useEffect(() => {
    if (!deleteArmed) return undefined;
    const timer = window.setTimeout(() => setDeleteArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteArmed]);

  const visibleScopes = useMemo(() => filterOverviewScopes(project, filters), [project, filters]);
  const visibleEntries = useMemo(() => overviewEntries(visibleScopes), [visibleScopes]);
  const categoryGroups = useMemo(() => overviewCategoryGroups(visibleEntries), [visibleEntries]);
  const copyContext = useMemo(() => overviewCopyContext(project, visibleScopes, selectedKeys), [project, visibleScopes, selectedKeys]);
  const categorySourceScopes = useMemo(() => filterOverviewScopes(project, { ...filters, category: 'All' }), [project, filters]);
  const categoryCounts = useMemo(() => overviewEntries(categorySourceScopes).reduce((counts, entry) => {
    counts[entry.tag.category || 'Unsorted'] = (counts[entry.tag.category || 'Unsorted'] || 0) + 1;
    return counts;
  }, {}), [categorySourceScopes]);
  const baseScopes = visibleScopes.filter((scope) => scope.kind === 'base');
  const characterScopes = visibleScopes.filter((scope) => scope.kind === 'character');
  const filtered = filters.category !== 'All' || filters.polarity !== 'all' || filters.domain !== 'all' || Boolean(filters.query.trim());

  const changeFilter = (patch) => {
    setFilters((current) => ({ ...current, ...patch }));
    setSelectedKeys([]);
    setDeleteArmed(false);
  };

  const moveTag = (scope, sourceIndex, targetIndex) => {
    if (filtered || sourceIndex === targetIndex || sourceIndex < 0 || targetIndex < 0 || targetIndex >= scope.tags.length) return;
    const tags = [...scope.tags];
    const [moved] = tags.splice(sourceIndex, 1);
    tags.splice(targetIndex, 0, moved);
    updateProject(updatePromptScope(project, scope.key, tags));
  };

  const beginDrag = (scopeKey, index, event) => {
    if (filtered) return;
    setDragging({ scopeKey, index });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({ scopeKey, index }));
  };

  const dropTag = (scope, targetIndex, event) => {
    event.preventDefault();
    let source = dragging;
    try {
      source = JSON.parse(event.dataTransfer.getData('application/json')) || source;
    } catch {
      // Some desktop drag implementations only preserve the in-memory fallback.
    }
    if (source?.scopeKey === scope.key) moveTag(scope, Number(source.index), targetIndex);
    setDragging(null);
  };

  const keyboardMove = (scope, index, event) => {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
    moveTag(scope, index, index + direction);
  };

  const toggleSelection = (key) => {
    setDeleteArmed(false);
    setSelectedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const toggleCategoryGroup = (entries) => {
    const keys = entries.map((entry) => entry.key);
    setDeleteArmed(false);
    setSelectedKeys((current) => {
      const selected = new Set(current);
      const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
      if (allSelected) return current.filter((key) => !keys.includes(key));
      return [...new Set([...current, ...keys])];
    });
  };

  const toggleSelecting = () => {
    setSelecting((current) => !current);
    setSelectedKeys([]);
    setDeleteArmed(false);
    setEditingKey('');
    setAddingScopeKey('');
  };

  const selectAllVisible = () => {
    setSelectedKeys(visibleEntries.map((entry) => entry.key));
    setDeleteArmed(false);
  };

  const copyVisibleOrSelected = () => onCopyText?.(copyContext.text, copyContext.count, copyContext.selected);

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
    setAddingScopeKey(scopeKey);
    if (scopeKey) setAddDraft('');
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
    dragging,
    language,
    selecting,
    selectedKeys,
    addDraft,
    addingScopeKey,
    filtered,
    onDragStart: beginDrag,
    onDragEnd: () => setDragging(null),
    onDrop: dropTag,
    editingKey,
    onAddScope: addTags,
    onAddDraftChange: setAddDraft,
    onAddingScopeChange: changeAddingScope,
    onEditingChange: setEditingKey,
    onTranslateTag: (scopeKey, tag) => translateEntries([{ scopeKey, tag }]),
    onUpdateTag: updateTag,
    onKeyboardMove: keyboardMove,
    onToggleSelect: toggleSelection,
    onTagContextMenu,
    translatingKeys,
  };

  return <div className="prompt-overview">
    <header className="overview-header">
      <div className="overview-toolbar">
        <LobeSearchBar className="overview-search" onInputChange={(query) => changeFilter({ query })} placeholder="筛选 Tag 或译名" value={filters.query}/>
        <div className="overview-primary-actions">
          <LobeButton disabled={!visibleEntries.length || translatingKeys.size > 0} icon={<Icon name="spark" size={13}/>} onClick={() => translateEntries(visibleEntries)} size="small">{translatingKeys.size ? '翻译中…' : `AI 翻译 ${visibleEntries.length}`}</LobeButton>
          <LobeButton disabled={structure.characters.length >= 6} icon={<Icon name="plus" size={14}/>} onClick={addCharacter} size="small">角色</LobeButton>
          <LobeButton className={`overview-select-toggle ${selecting ? 'active' : ''}`} onClick={toggleSelecting} size="small" type={selecting ? 'primary' : 'default'}>{selecting ? `退出多选 · ${selectedKeys.length}` : '多选'}</LobeButton>
        </div>
      </div>

      <div className="overview-filter-strip">
        <div className="overview-filter-controls">
          <Segment value={filters.polarity} options={[["all", '全部'], ['prompt', 'Prompt'], ['undesired', 'Undesired']]} onChange={(polarity) => changeFilter({ polarity })} label="Prompt 类型"/>
          <Segment value={filters.domain} options={[["all", '全部区域'], ['base', 'Base'], ['character', 'Character']]} onChange={(domain) => changeFilter({ domain })} label="Prompt 区域"/>
          <Segment value={viewMode} options={[["structure", '按结构'], ['category', '按分类']]} onChange={setViewMode} label="总览分组方式"/>
          <Segment value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} label="显示语言"/>
        </div>
        <div className="overview-category-row" aria-label="Tag 分类筛选">
          <LobeButton className={filters.category === 'All' ? 'active' : ''} onClick={() => changeFilter({ category: 'All' })} size="small">全部 <b>{overviewEntries(categorySourceScopes).length}</b></LobeButton>
          {CATEGORY_OPTIONS.map((category) => <LobeButton key={category} className={`${filters.category === category ? 'active' : ''} cat-${category.toLowerCase()}`} onClick={() => changeFilter({ category })} size="small">{CATEGORY_LABELS[category]} <b>{categoryCounts[category] || 0}</b></LobeButton>)}
        </div>
      </div>

      {selecting && <div className="overview-selection-bar">
        <span>已选 <b>{selectedKeys.length}</b> 个{copyContext.categoryCount ? ` · ${copyContext.categoryCount} 个分类` : ''}；不同分类复制时自动换行。</span>
        <LobeButton disabled={!visibleEntries.length} onClick={selectAllVisible} size="small">全选可见</LobeButton>
        <LobeButton disabled={!selectedKeys.length} onClick={() => setSelectedKeys([])} size="small">取消选择</LobeButton>
        <LobeButton disabled={!copyContext.count} onClick={copyVisibleOrSelected} size="small" type="primary">{copyContext.selected ? `复制已选 ${copyContext.count}` : `复制可见 ${copyContext.count}`}</LobeButton>
        <LobeButton danger className={deleteArmed ? 'armed' : ''} disabled={!selectedKeys.length} onClick={deleteSelected} size="small" type={deleteArmed ? 'primary' : 'default'}>{deleteArmed ? `再次点击删除 ${selectedKeys.length}` : `删除已选 ${selectedKeys.length}`}</LobeButton>
      </div>}
    </header>

    <div className={`overview-content ${viewMode === 'category' ? 'category-view' : ''}`}>
      {viewMode === 'category' && categoryGroups.map((group) => <CategoryGroup
        key={group.category}
        group={group}
        language={language}
        selecting={selecting}
        selectedKeys={selectedKeys}
        editingKey={editingKey}
        onEditingChange={setEditingKey}
        onToggleSelect={toggleSelection}
        onToggleGroup={toggleCategoryGroup}
        onTranslateTag={(scopeKey, tag) => translateEntries([{ scopeKey, tag }])}
        onUpdateTag={updateTag}
        onTagContextMenu={onTagContextMenu}
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
      {viewMode === 'structure' && !structure.characters.length && filters.domain !== 'base' && <LobeButton className="overview-add-character" onClick={addCharacter} type="dashed">
        <Icon name="plus" size={20}/><div><strong>还没有 Character Prompt</strong><small>添加后可在这里设置角色名称、位置和独立 Prompt。</small></div>
      </LobeButton>}
    </div>
  </div>;
}
