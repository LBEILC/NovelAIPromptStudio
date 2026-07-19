import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from './lib/prompt.js';
import { countPromptTags, updatePromptScope } from './lib/promptStructure.js';
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

function ScopeTags({
  scope,
  dragging,
  language,
  selecting,
  selectedKeys,
  filtered,
  onDragStart,
  onDragEnd,
  onDrop,
  onEditTag,
  onKeyboardMove,
  onToggleSelect,
}) {
  const selectedSet = new Set(selectedKeys);
  return <div className={`overview-scope ${scope.polarity === 'undesired' ? 'undesired' : ''}`}>
    <div className="overview-scope-heading">
      <span>{scope.polarity === 'undesired' ? 'UNDESIRED CONTENT' : 'PROMPT'}</span>
      <b>{scope.tags.length}</b>
    </div>
    <div className="overview-tags" role="list" aria-label={scope.label}>
      {scope.tags.map((tag, index) => {
        const key = overviewTagKey(scope.key, tag.id);
        const selected = selectedSet.has(key);
        const display = tagPresentation(tag, language);
        const warning = syntaxMessage(tag);
        return <button
          key={tag.id}
          className={`overview-tag cat-${String(tag.category || 'Unsorted').toLowerCase()} ${dragging?.scopeKey === scope.key && dragging.index === index ? 'dragging' : ''} ${selected ? 'selected' : ''} ${selecting ? 'selecting' : ''} ${display.fallback ? 'translation-fallback' : ''} ${warning ? 'syntax-warning' : ''}`}
          draggable={!selecting && !filtered}
          onDragStart={(event) => !selecting && !filtered && onDragStart(scope.key, index, event)}
          onDragEnd={onDragEnd}
          onDragOver={(event) => !selecting && !filtered && event.preventDefault()}
          onDrop={(event) => !selecting && !filtered && onDrop(scope, index, event)}
          onClick={() => selecting ? onToggleSelect(key) : onEditTag(scope.key, tag.id)}
          onKeyDown={(event) => selecting ? undefined : onKeyboardMove(scope, index, event)}
          role="listitem"
          aria-pressed={selecting ? selected : undefined}
          title={`${display.title}${warning ? `\n语法提醒：${warning}` : ''}${selecting ? '\n点击选择' : '\n点击编辑，拖动排序'}`}
        >
          {selecting && <i className="overview-select-mark" aria-hidden="true">{selected ? '✓' : ''}</i>}
          <span className="overview-tag-copy"><span>{display.primary}</span>{display.secondary && <small>{display.secondary}</small>}</span>
          {Math.abs(Number(tag.weight) - 1) >= 0.001 && <em>{Number(tag.weight).toFixed(2)}</em>}
          {warning && <i className="overview-syntax-mark" aria-hidden="true">!</i>}
        </button>;
      })}
      {!scope.tags.length && (filtered
        ? <span className="overview-filter-empty">当前筛选无 Tag</span>
        : <button className="overview-empty-tag" onClick={() => onEditTag(scope.key, null)}>+ 在右侧添加 Tag</button>)}
    </div>
  </div>;
}

function CategoryGroup({ group, language, selecting, selectedKeys, onToggleSelect, onToggleGroup, onEditTag }) {
  const selectedSet = new Set(selectedKeys);
  const groupKeys = group.entries.map((entry) => entry.key);
  const allSelected = groupKeys.length > 0 && groupKeys.every((key) => selectedSet.has(key));
  return <section className={`overview-category-group cat-${String(group.category).toLowerCase()}`}>
    <div className="overview-category-marker"><span>{CATEGORY_LABELS[group.category] || group.category}</span><i/></div>
    <div className="overview-category-body">
      <div className="overview-category-heading">
        <div><strong>{CATEGORY_LABELS[group.category] || group.category}</strong><small>{group.category.toUpperCase()} · {group.entries.length} TAGS</small></div>
        {selecting && <button className={allSelected ? 'active' : ''} onClick={() => onToggleGroup(group.entries)}>{allSelected ? '取消整组' : `选择整组 ${group.entries.length}`}</button>}
      </div>
      <div className="overview-tags" role="list" aria-label={`${CATEGORY_LABELS[group.category] || group.category} Tag`}>
        {group.entries.map((entry) => {
          const selected = selectedSet.has(entry.key);
          const display = tagPresentation(entry.tag, language);
          const warning = syntaxMessage(entry.tag);
          return <button
            key={entry.key}
            className={`overview-tag cat-${String(group.category).toLowerCase()} ${entry.scopePolarity === 'undesired' ? 'undesired-tag' : ''} ${selected ? 'selected' : ''} ${selecting ? 'selecting' : ''} ${display.fallback ? 'translation-fallback' : ''} ${warning ? 'syntax-warning' : ''}`}
            onClick={() => selecting ? onToggleSelect(entry.key) : onEditTag(entry.scopeKey, entry.tag.id)}
            role="listitem"
            aria-pressed={selecting ? selected : undefined}
            title={`${display.title}\n区域：${entry.scopeLabel}${warning ? `\n语法提醒：${warning}` : ''}${selecting ? '\n点击选择' : '\n点击编辑'}`}
          >
            {selecting && <i className="overview-select-mark" aria-hidden="true">{selected ? '✓' : ''}</i>}
            <span className="overview-tag-copy"><span>{display.primary}</span>{display.secondary && <small>{display.secondary}</small>}</span>
            {Math.abs(Number(entry.tag.weight) - 1) >= 0.001 && <em>{Number(entry.tag.weight).toFixed(2)}</em>}
            {warning && <i className="overview-syntax-mark" aria-hidden="true">!</i>}
          </button>;
        })}
      </div>
    </div>
  </section>;
}

function Segment({ value, options, onChange, label }) {
  return <div className="overview-segment" aria-label={label}>
    {options.map(([option, text]) => <button key={option} className={value === option ? 'active' : ''} onClick={() => onChange(option)}>{text}</button>)}
  </div>;
}

export default function PromptOverview({ project, updateProject, onEditTag, onCopyContextChange, onCopyText, onNotify }) {
  const [dragging, setDragging] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_OVERVIEW_FILTERS);
  const [language, setLanguage] = useState('original');
  const [viewMode, setViewMode] = useState('structure');
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const structure = project.prompt_structure;

  useEffect(() => {
    setFilters(DEFAULT_OVERVIEW_FILTERS);
    setViewMode('structure');
    setSelecting(false);
    setSelectedKeys([]);
    setDeleteArmed(false);
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
  const categorySourceScopes = useMemo(() => filterOverviewScopes(project, { ...filters, category: 'All' }), [project, filters]);
  const categoryCounts = useMemo(() => overviewEntries(categorySourceScopes).reduce((counts, entry) => {
    counts[entry.tag.category || 'Unsorted'] = (counts[entry.tag.category || 'Unsorted'] || 0) + 1;
    return counts;
  }, {}), [categorySourceScopes]);
  const baseScopes = visibleScopes.filter((scope) => scope.kind === 'base');
  const characterScopes = visibleScopes.filter((scope) => scope.kind === 'character');
  const filtered = filters.category !== 'All' || filters.polarity !== 'all' || filters.domain !== 'all' || Boolean(filters.query.trim());

  useEffect(() => {
    onCopyContextChange?.({ text: copyContext.text, count: copyContext.count, selected: copyContext.selected, categoryCount: copyContext.categoryCount });
  }, [copyContext.text, copyContext.count, copyContext.selected, copyContext.categoryCount, onCopyContextChange]);

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

  const scopeProps = {
    dragging,
    language,
    selecting,
    selectedKeys,
    filtered,
    onDragStart: beginDrag,
    onDragEnd: () => setDragging(null),
    onDrop: dropTag,
    onEditTag,
    onKeyboardMove: keyboardMove,
    onToggleSelect: toggleSelection,
  };

  return <div className="prompt-overview">
    <header className="overview-header">
      <div className="overview-title-row">
        <div>
          <span className="overview-kicker">PROMPT MAP / V4</span>
          <h2>Prompt 总览</h2>
          <p>默认同行复制；多选时同类同行，不同分类换行。</p>
        </div>
        <div className="overview-stats">
          <span><b>{visibleEntries.length}</b> VISIBLE</span>
          <span><b>{countPromptTags(project)}</b> TOTAL</span>
          <span><b>{structure.characters.length}</b> CHARACTERS</span>
        </div>
      </div>

      <div className="overview-toolbar">
        <label className="overview-search"><span>⌕</span><input value={filters.query} onChange={(event) => changeFilter({ query: event.target.value })} placeholder="筛选 Tag 或译名"/></label>
        <Segment value={filters.polarity} options={[["all", '全部'], ['prompt', 'Prompt'], ['undesired', 'Undesired']]} onChange={(polarity) => changeFilter({ polarity })} label="Prompt 类型"/>
        <Segment value={filters.domain} options={[["all", '全部区域'], ['base', 'Base'], ['character', 'Character']]} onChange={(domain) => changeFilter({ domain })} label="Prompt 区域"/>
        <Segment value={viewMode} options={[["structure", '按结构'], ['category', '按分类']]} onChange={setViewMode} label="总览分组方式"/>
        <Segment value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} label="显示语言"/>
        <button className={`overview-select-toggle ${selecting ? 'active' : ''}`} onClick={toggleSelecting}>{selecting ? `退出多选 · ${selectedKeys.length}` : '多选'}</button>
      </div>

      <div className="overview-category-row" aria-label="Tag 分类筛选">
        <button className={filters.category === 'All' ? 'active' : ''} onClick={() => changeFilter({ category: 'All' })}>全部 <b>{overviewEntries(categorySourceScopes).length}</b></button>
        {CATEGORY_OPTIONS.map((category) => <button key={category} className={`${filters.category === category ? 'active' : ''} cat-${category.toLowerCase()}`} onClick={() => changeFilter({ category })}>{CATEGORY_LABELS[category]} <b>{categoryCounts[category] || 0}</b></button>)}
      </div>

      {selecting && <div className="overview-selection-bar">
        <span>已选 <b>{selectedKeys.length}</b> 个{copyContext.categoryCount ? ` · ${copyContext.categoryCount} 个分类` : ''}；不同分类复制时自动换行。</span>
        <button onClick={selectAllVisible} disabled={!visibleEntries.length}>全选可见</button>
        <button onClick={() => setSelectedKeys([])} disabled={!selectedKeys.length}>取消选择</button>
        <button className="primary" onClick={copyVisibleOrSelected} disabled={!copyContext.count}>{copyContext.selected ? `复制已选 ${copyContext.count}` : `复制可见 ${copyContext.count}`}</button>
        <button className={`danger ${deleteArmed ? 'armed' : ''}`} onClick={deleteSelected} disabled={!selectedKeys.length}>{deleteArmed ? `再次点击删除 ${selectedKeys.length}` : `删除已选 ${selectedKeys.length}`}</button>
      </div>}
    </header>

    <div className={`overview-content ${viewMode === 'category' ? 'category-view' : ''}`}>
      {viewMode === 'category' && categoryGroups.map((group) => <CategoryGroup
        key={group.category}
        group={group}
        language={language}
        selecting={selecting}
        selectedKeys={selectedKeys}
        onToggleSelect={toggleSelection}
        onToggleGroup={toggleCategoryGroup}
        onEditTag={onEditTag}
      />)}

      {viewMode === 'structure' && baseScopes.length > 0 && <section className="overview-layer base-layer">
        <div className="overview-layer-marker"><span>BASE</span><i/></div>
        <div className="overview-layer-body">
          <div className="overview-layer-heading"><div><strong>Base Prompt</strong><small>场景、构图、风格与全局排除内容</small></div><span>GLOBAL</span></div>
          {baseScopes.map((scope) => <ScopeTags key={scope.key} scope={scope} {...scopeProps}/>) }
        </div>
      </section>}

      {viewMode === 'structure' && filters.domain !== 'base' && structure.characters.map((character, index) => {
        const sections = characterScopes.filter((scope) => scope.characterId === character.id);
        if (!sections.length) return null;
        return <section className="overview-layer character-layer" key={character.id}>
          <div className="overview-layer-marker"><span>{String(index + 1).padStart(2, '0')}</span><i/></div>
          <div className="overview-layer-body">
            <div className="overview-layer-heading">
              <div><strong>{character.label}</strong><small>独立角色描述与排除内容</small></div>
              <button onClick={() => onEditTag(sections[0]?.key, null)}>{structure.use_coords ? `POSITION ${compactPosition(character.center)}` : 'AI POSITION'}</button>
            </div>
            {sections.map((scope) => <ScopeTags key={scope.key} scope={scope} {...scopeProps}/>) }
          </div>
        </section>;
      })}

      {!visibleEntries.length && filtered && <div className="overview-no-results"><strong>没有符合条件的 Tag</strong><span>调整分类、区域或搜索词后，顶部复制内容会同步更新。</span></div>}
      {viewMode === 'structure' && !structure.characters.length && filters.domain !== 'base' && <button className="overview-add-character" onClick={() => onEditTag('base:prompt', null)}>
        <span>＋</span><div><strong>还没有 Character Prompt</strong><small>在右侧 Prompt 面板添加角色，最多支持 6 个。</small></div>
      </button>}
    </div>
  </div>;
}
