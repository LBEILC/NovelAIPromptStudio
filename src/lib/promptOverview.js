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

export function overviewTagInteractionState(selectedCount = 0, filtered = false) {
  const selectionActive = selectedCount > 0;
  return {
    reorderDisabled: selectionActive || filtered,
    selectionActive,
    startMarqueeOnItems: selectionActive,
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
  const positive = source.filter((entry) => entry.scopePolarity === 'prompt');
  const ignored = source.length - positive.length;
  const groups = selected.size ? overviewCategoryGroups(positive) : [];
  return {
    text: selected.size
      ? groups.map((group) => group.entries.map((entry) => formatTag(entry.tag)).join(', ')).join('\n')
      : positive.map((entry) => formatTag(entry.tag)).join(', '),
    count: positive.length,
    ignored,
    selected: selected.size > 0,
    categoryCount: selected.size ? groups.length : 0,
    entries: positive,
  };
}

export function selectedOverviewEntries(project, selectedKeys = []) {
  const selected = new Set(selectedKeys);
  return overviewEntries(getPromptScopes(project)).filter((entry) => selected.has(entry.key));
}

export function overviewSelectionMenuItems({
  categories = [],
  count = 0,
  copyCount = 0,
  ignored = 0,
  onCategoryChange,
  onCopy,
  onDelete,
  onTranslate,
  translating = false,
}) {
  const copyLabel = ignored
    ? `复制可用 ${copyCount} 个 Prompt Tag（忽略 ${ignored} 个排除 Tag）`
    : `复制已选 ${copyCount} 个 Prompt Tag`;
  return [
    { key: 'copy-selected-tags', label: copyLabel, disabled: copyCount < 1, onClick: () => onCopy?.() },
    {
      key: 'translate-selected-tags',
      label: translating ? 'AI 翻译已选 Tag 中…' : `AI 翻译已选 ${count} 个 Tag`,
      disabled: count < 1 || translating,
      onClick: () => onTranslate?.(),
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
  ];
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
