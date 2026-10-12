import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TagCachePatch, DictionaryTranslationProgress } from '../shared/ipc';
import type { TagDictionaryEntry, TagCategory } from '../shared/types';

export type DictionaryView = 'all' | 'untranslated' | 'unsorted' | 'ai' | 'manual';
export type DictionarySort = 'usage' | 'tag' | 'recent';
export const dictionarySource = (item: TagDictionaryEntry) =>
  [item.translation_source, item.category_source].includes('manual')
    ? 'manual'
    : [item.translation_source, item.category_source].includes('ai')
      ? 'ai'
      : 'builtin';
export const inDictionaryView = (item: TagDictionaryEntry, view: DictionaryView) =>
  view === 'all' ||
  (view === 'untranslated' && !item.translation.trim()) ||
  (view === 'unsorted' && (!item.category || item.category === 'Unsorted')) ||
  (view === 'ai' && dictionarySource(item) === 'ai') ||
  (view === 'manual' && dictionarySource(item) === 'manual');

export function useDictionary() {
  const [allItems, setAllItems] = useState<TagDictionaryEntry[]>([]);
  const [filters, setFilters] = useState<{
    query: string;
    category: TagCategory | '';
    view: DictionaryView;
    sort: DictionarySort;
  }>({ query: '', category: '', view: 'all', sort: 'usage' });
  const [selected, setSelected] = useState<string[]>([]);
  const [held, setHeld] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [running, setRunning] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [progress, setProgress] = useState<DictionaryTranslationProgress | null>(null);
  const requestId = useRef('');
  const revision = useRef(0);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const sequence = ++revision.current;
    const result = await window.studio?.listTagCache({ all: true });
    if (sequence !== revision.current || !result) return;
    if (!result.ok) throw Error(result.error);
    setAllItems(result.items);
  }, []);
  useEffect(() => {
    let active = true;
    setPending(true);
    void refresh()
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setPending(false);
      });
    void window.studio
      ?.getAISettings?.()
      .then((settings) => {
        if (active) setAiReady(!!settings.model.trim());
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    window.studio?.onTagRetranslationProgress?.((value) => {
      if (value.id === requestId.current) setProgress(value);
    });
    return () => {
      active = false;
      revision.current++;
      window.studio?.offTagRetranslationProgress?.();
    };
  }, [refresh]);
  useEffect(() => {
    setHeld([]);
  }, [filters.view]);
  useEffect(() => {
    setSelected([]);
  }, [filters.query, filters.category, filters.view]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        (['all', 'untranslated', 'unsorted', 'ai', 'manual'] as const).map((view) => [
          view,
          allItems.filter((item) => inDictionaryView(item, view)).length,
        ]),
      ) as Record<DictionaryView, number>,
    [allItems],
  );
  const items = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase().replaceAll('_', ' ');
    return allItems
      .filter(
        (item) =>
          (inDictionaryView(item, filters.view) || held.includes(item.tag)) &&
          (!filters.category || item.category === filters.category) &&
          (!query ||
            `${item.tag}\n${item.display_tag}\n${item.translation}`
              .toLocaleLowerCase()
              .replaceAll('_', ' ')
              .includes(query)),
      )
      .sort(
        (a, b) =>
          (filters.sort === 'usage'
            ? (b.image_count || 0) - (a.image_count || 0)
            : filters.sort === 'recent'
              ? b.updated_at.localeCompare(a.updated_at)
              : 0) || a.tag.localeCompare(b.tag, 'en'),
      );
  }, [allItems, filters, held]);
  const mutate = async (
    tags: string[],
    action: () => Promise<{ ok: boolean; error?: string }>,
    keep = false,
  ) => {
    setPending(true);
    setError('');
    try {
      const result = await action();
      if (!result.ok) throw Error(result.error);
      if (keep && ['untranslated', 'unsorted'].includes(filters.view))
        setHeld((current) => [...new Set([...current, ...tags])]);
      await refresh();
      setSelected([]);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setPending(false);
    }
  };
  const save = (tag: string, patch: TagCachePatch) =>
    mutate([tag], () => window.studio!.updateTagCache(tag, patch), true);
  const categorize = (category: TagCategory) =>
    mutate(selected, () => window.studio!.updateTagCacheMany(selected, category), true);
  const remove = (tags: string[]) => mutate(tags, () => window.studio!.deleteTagCacheMany(tags));
  const retranslate = async () => {
    if (running || !selected.length || !aiReady) return;
    const id = crypto.randomUUID();
    requestId.current = id;
    setRunning(true);
    setError('');
    setProgress({
      id,
      total: selected.length,
      completed: 0,
      translated: 0,
      failed: [],
      canceled: false,
    });
    try {
      const result = await window.studio!.retranslateTagCache(id, selected);
      if (!result.ok) throw Error(result.error);
      setProgress(result);
      if (['untranslated', 'unsorted'].includes(filters.view))
        setHeld((current) => [...new Set([...current, ...selected])]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      requestId.current = '';
    }
  };
  const cancel = () => {
    if (requestId.current) void window.studio?.cancelTagRetranslation(requestId.current);
  };
  return {
    items,
    allItems,
    filters,
    setFilters,
    counts,
    total: items.length,
    selected,
    setSelected,
    busy: pending || running,
    running,
    aiReady,
    progress,
    error,
    save,
    categorize,
    remove,
    retranslate,
    cancel,
    refresh,
  };
}
