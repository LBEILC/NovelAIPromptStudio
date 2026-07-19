import { formatTag, normalizeSearch } from './prompt.js';
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
    tag,
  })));
}

export function overviewCopyContext(project, visibleScopes, selectedKeys = []) {
  const selected = new Set(selectedKeys);
  const source = selected.size
    ? overviewEntries(getPromptScopes(project)).filter((entry) => selected.has(entry.key))
    : overviewEntries(visibleScopes);
  return {
    text: source.map((entry) => formatTag(entry.tag)).join(',\n'),
    count: source.length,
    selected: selected.size > 0,
    entries: source,
  };
}

export function deleteOverviewTags(project, selectedKeys = []) {
  const selected = new Set(selectedKeys);
  return getPromptScopes(project).reduce((current, scope) => {
    const nextTags = scope.tags.filter((tag) => !selected.has(overviewTagKey(scope.key, tag.id)));
    return nextTags.length === scope.tags.length ? current : updatePromptScope(current, scope.key, nextTags);
  }, project);
}
