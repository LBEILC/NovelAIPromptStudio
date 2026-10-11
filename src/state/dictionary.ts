import { useEffect, useState } from 'react';
import type { TagCacheRequest, TagCachePatch } from '../shared/ipc';
import type { TagDictionaryEntry, TagCategory } from '../shared/types';
export const PAGE_SIZE = 200;
export function useDictionary() {
  const [filters, setFilters] = useState<TagCacheRequest>({
    query: '',
    category: '',
    offset: 0,
    limit: PAGE_SIZE,
  });
  const [items, setItems] = useState<TagDictionaryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setSelected([]);
    const timer = setTimeout(() => {
      setBusy(true);
      window.studio
        ?.listTagCache(filters)
        .then((result) => {
          if (!active) return;
          if (!result.ok) throw new Error(result.error);
          setItems(result.items);
          setTotal(result.total);
          setError('');
        })
        .catch((e: Error) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters, revision]);
  const mutate = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) throw new Error(result.error);
      setSelected([]);
      setRevision((n) => n + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = (tag: string, patch: TagCachePatch) =>
    mutate(() => window.studio!.updateTagCache(tag, patch));
  const categorize = (category: TagCategory) =>
    mutate(() => window.studio!.updateTagCacheMany(selected, category));
  const remove = async (tags: string[]) => {
    const result = await mutate(() =>
      tags.length === 1
        ? window.studio!.deleteTagCache(tags[0])
        : window.studio!.deleteTagCacheMany(tags),
    );
    if (result && tags.length >= items.length && filters.offset)
      setFilters((f) => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - PAGE_SIZE) }));
    return result;
  };
  return {
    filters,
    setFilters,
    items,
    total,
    selected,
    setSelected,
    busy,
    error,
    save,
    categorize,
    remove,
  };
}
