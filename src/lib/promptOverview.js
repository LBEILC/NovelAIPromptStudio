import { CATEGORY_OPTIONS, formatTag, normalizeSearch } from './prompt.js';
import { getPromptScopes, updatePromptScope } from './promptStructure.js';

export const DEFAULT_OVERVIEW_FILTERS = {
  category: 'All',
  polarity: 'all',
  domain: 'all',
  query: '',
};

export function overviewTagKey(scopeKey, tagId) {
  return `${scopeKey}\u0000${tagId}`;
}

export function isOverviewTagVisible(entries = [], scopeKey, tagId) {
  const targetKey = overviewTagKey(scopeKey, tagId);
  return entries.some((entry) => entry.key === targetKey);
}

export function overviewTagInteractionState(selectedCount = 0, filtered = false, selectionMode = false) {
  const selectionActive = selectedCount > 0;
  const selectionModeActive = selectionMode || selectionActive;
  return {
    reorderDisabled: selectionModeActive || filtered,
    selectionActive,
    selectionModeActive,
    startMarqueeOnItems: selectionModeActive,
  };
}

export function reorderOverviewTags(tags = [], activeId, overId) {
  const sourceIndex = tags.findIndex((tag) => tag.id === activeId);
  const targetIndex = tags.findIndex((tag) => tag.id === overId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return tags;
  const nextTags = [...tags];
  const [activeTag] = nextTags.splice(sourceIndex, 1);
  nextTags.splice(targetIndex, 0, activeTag);
  return nextTags;
}

export function shouldReorderOverviewTags(tags = [], activeId, overId, pointerX, targetRect) {
  if (!overId || activeId === overId || !Number.isFinite(pointerX) || !targetRect) return false;
  const sourceIndex = tags.findIndex((tag) => tag.id === activeId);
  const targetIndex = tags.findIndex((tag) => tag.id === overId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;
  const targetCenterX = Number(targetRect.left) + Number(targetRect.width) / 2;
  if (!Number.isFinite(targetCenterX)) return false;
  return sourceIndex < targetIndex ? pointerX >= targetCenterX : pointerX <= targetCenterX;
}

export function filterOverviewScopes(project, filters = DEFAULT_OVERVIEW_FILTERS) {
  const query = normalizeSearch(filters.query || '');
  return getPromptScopes(project)
    .filter((scope) => filters.polarity === 'all' || scope.polarity === filters.polarity)
    .filter((scope) => filters.domain === 'all' || scope.kind === filters.domain)
    .map((scope) => ({
      ...scope,
      tags: scope.tags.filter((tag) => {
        if (filters.category !== 'All' && tag.category !== filters.category) return false;
        if (!query) return true;
        return [tag.tag, tag.translation, tag.note].some((value) => normalizeSearch(value).includes(query));
      }),
    }));
}

export function overviewEntries(scopes) {
  return scopes.flatMap((scope) => scope.tags.map((tag) => ({
    automation: scope.automation?.tagIds?.includes(tag.id) ? scope.automation : null,
    key: overviewTagKey(scope.key, tag.id),
    scopeKey: scope.key,
    scopeLabel: scope.label,
    scopeKind: scope.kind,
    scopePolarity: scope.polarity,
    tag,
  })));
}

export function overviewCategoryGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const category = entry.tag.category || 'Unsorted';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(entry);
  }
  const known = CATEGORY_OPTIONS
    .filter((category) => groups.has(category))
    .map((category) => ({ category, entries: groups.get(category) }));
  const other = [...groups.entries()]
    .filter(([category]) => !CATEGORY_OPTIONS.includes(category))
    .map(([category, categoryEntries]) => ({ category, entries: categoryEntries }));
  return [...known, ...other];
}

export function toggleOverviewSelectionGroup(selectedKeys = [], entries = []) {
  const keys = entries.map((entry) => entry.key);
  if (!keys.length) return selectedKeys;
  const groupKeys = new Set(keys);
  const selected = new Set(selectedKeys);
  const allSelected = keys.every((key) => selected.has(key));
  if (allSelected) return selectedKeys.filter((key) => !groupKeys.has(key));
  return [...new Set([...selectedKeys, ...keys])];
}

export function overviewCopyContext(project, visibleScopes, selectedKeys = []) {
  const selected = new Set(selectedKeys);
  const source = selected.size
    ? overviewEntries(getPromptScopes(project)).filter((entry) => selected.has(entry.key))
    : overviewEntries(visibleScopes);
  const promptEntries = source.filter((entry) => entry.scopePolarity === 'prompt');
  const positive = promptEntries.filter((entry) => entry.automation?.status !== 'confirmed');
  const ignored = source.length - promptEntries.length;
  const automaticIgnored = promptEntries.length - positive.length;
  const groups = selected.size ? overviewCategoryGroups(positive) : [];
  return {
    text: selected.size
      ? groups.map((group) => group.entries.map((entry) => formatTag(entry.tag)).join(', ')).join('\n')
      : positive.map((entry) => formatTag(entry.tag)).join(', '),
    count: positive.length,
    ignored,
    automaticIgnored,
    selected: selected.size > 0,
    categoryCount: selected.size ? groups.length : 0,
    entries: positive,
  };
}

export function selectedOverviewEntries(project, selectedKeys = []) {
  const selected = new Set(selectedKeys);
  return overviewEntries(getPromptScopes(project)).filter((entry) => selected.has(entry.key));
}

export function overviewMoveContext(project, selectedKeys = []) {
  const entries = selectedOverviewEntries(project, selectedKeys);
  const polarities = new Set(entries.map((entry) => entry.scopePolarity));
  if (!entries.length) return { disabled: true, description: '没有可移动的 Tag', options: [] };
  if (polarities.size !== 1) {
    return {
      disabled: true,
      description: 'Prompt 与 Undesired Tag 不能混合移动',
      options: [],
    };
  }
  const [polarity] = polarities;
  const options = getPromptScopes(project)
    .filter((scope) => scope.polarity === polarity)
    .map((scope) => ({
      disabled: entries.every((entry) => entry.scopeKey === scope.key),
      key: scope.key,
      label: scope.label,
    }));
  const disabled = options.every((option) => option.disabled);
  return {
    disabled,
    description: disabled ? '没有其他可移动的提示词区域' : '',
    options,
  };
}

export function moveOverviewTags(project, selectedKeys = [], targetScopeKey = '') {
  const entries = selectedOverviewEntries(project, selectedKeys);
  const target = getPromptScopes(project).find((scope) => scope.key === targetScopeKey);
  const polarities = new Set(entries.map((entry) => entry.scopePolarity));
  if (!target || !entries.length || polarities.size !== 1 || !polarities.has(target.polarity)) {
    return { project, movedCount: 0, mergedCount: 0 };
  }

  const movingEntries = entries.filter((entry) => entry.scopeKey !== target.key);
  if (!movingEntries.length) return { project, movedCount: 0, mergedCount: 0 };

  const selected = new Set(selectedKeys);
  let nextProject = getPromptScopes(project).reduce((current, scope) => {
    if (scope.key === target.key) return current;
    const nextTags = scope.tags.filter((tag) => !selected.has(overviewTagKey(scope.key, tag.id)));
    return nextTags.length === scope.tags.length ? current : updatePromptScope(current, scope.key, nextTags);
  }, project);

  const targetTags = [...target.tags];
  const seen = new Set(targetTags.map((tag) => String(tag.tag || '').trim().toLocaleLowerCase('en-US')).filter(Boolean));
  let mergedCount = 0;
  for (const entry of movingEntries) {
    const key = String(entry.tag.tag || '').trim().toLocaleLowerCase('en-US');
    if (key && seen.has(key)) {
      mergedCount += 1;
      continue;
    }
    targetTags.push(entry.tag);
    if (key) seen.add(key);
  }
  nextProject = updatePromptScope(nextProject, target.key, targetTags);
  return { project: nextProject, movedCount: movingEntries.length, mergedCount };
}

export function overviewSelectionMenuItems({
  automaticIgnored = 0,
  categories = [],
  count = 0,
  copyCount = 0,
  ignored = 0,
  moveContext,
  onCategoryChange,
  onCopy,
  onDelete,
  onMove,
  onTranslate,
  translating = false,
}) {
  const ignoredLabels = [
    ignored ? `${ignored} 个排除 Tag` : '',
    automaticIgnored ? `${automaticIgnored} 个 NovelAI 自动 Tag` : '',
  ].filter(Boolean);
  const copyLabel = ignoredLabels.length
    ? `复制可用 ${copyCount} 个 Prompt Tag（忽略 ${ignoredLabels.join('、')}）`
    : `复制已选 ${copyCount} 个 Prompt Tag`;
  return [
    { key: 'copy-selected-tags', label: copyLabel, disabled: copyCount < 1, onClick: () => onCopy?.() },
    {
      key: 'translate-selected-tags',
      label: translating ? 'AI 翻译已选 Tag 中…' : `AI 翻译已选 ${count} 个 Tag`,
      disabled: count < 1 || translating,
      onClick: () => onTranslate?.(),
    },
    moveContext && {
      key: 'move-selected-tags',
      label: '移动到',
      desc: moveContext.description || undefined,
      disabled: moveContext.disabled,
      type: 'submenu',
      openOnHover: true,
      children: moveContext.options.map((option) => ({
        key: `move-selected-tags-${option.key}`,
        label: option.label,
        disabled: option.disabled,
        onClick: () => onMove?.(option.key),
      })),
    },
    {
      key: 'set-selected-tags-category',
      label: `设置已选 ${count} 个 Tag 分类`,
      type: 'submenu',
      openOnHover: true,
      children: categories.map(([category, label]) => ({
        key: `selected-category-${category}`,
        label,
        onClick: () => onCategoryChange?.(category),
      })),
    },
    { key: 'selected-tags-divider', type: 'divider' },
    { key: 'delete-selected-tags', label: `删除已选 ${count} 个 Tag`, danger: true, onClick: () => onDelete?.() },
  ].filter(Boolean);
}

export function updateOverviewTags(project, selectedKeys = [], patch = {}) {
  const selected = new Set(selectedKeys);
  return getPromptScopes(project).reduce((current, scope) => {
    let changed = false;
    const nextTags = scope.tags.map((tag) => {
      if (!selected.has(overviewTagKey(scope.key, tag.id))) return tag;
      changed = true;
      return { ...tag, ...patch };
    });
    return changed ? updatePromptScope(current, scope.key, nextTags) : current;
  }, project);
}

export function deleteOverviewTags(project, selectedKeys = []) {
  const selected = new Set(selectedKeys);
  return getPromptScopes(project).reduce((current, scope) => {
    const nextTags = scope.tags.filter((tag) => !selected.has(overviewTagKey(scope.key, tag.id)));
    return nextTags.length === scope.tags.length ? current : updatePromptScope(current, scope.key, nextTags);
  }, project);
}
