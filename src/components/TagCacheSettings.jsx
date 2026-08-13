import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert as LobeAlert, SearchBar as LobeSearchBar } from '@lobehub/ui';
import { Button as LobeButton, Input as LobeInput, Select as LobeSelect } from '@lobehub/ui/base-ui';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../lib/prompt.js';
import Icon from './Icon.jsx';

const PAGE_SIZE = 40;
const SOURCE_LABELS = {
  ai: 'AI',
  builtin: '内置词典',
  cache: '缓存',
  danbooru: 'Danbooru',
  heuristic: '本地推断',
  manual: '用户修改',
  rule: '本地规则',
};

const CATEGORY_FILTER_OPTIONS = [
  { label: '全部分类', value: 'All' },
  ...CATEGORY_OPTIONS.map((value) => ({ label: CATEGORY_LABELS[value] || value, value })),
];

const SOURCE_FILTER_OPTIONS = [
  { label: '全部来源', value: 'All' },
  { label: '用户修改', value: 'manual' },
  { label: 'Danbooru', value: 'danbooru' },
  { label: 'AI', value: 'ai' },
  { label: '本地规则', value: 'rule' },
  { label: '内置词典', value: 'builtin' },
  { label: '本地推断', value: 'heuristic' },
];

const sourceLabel = (source) => SOURCE_LABELS[source] || '未记录';
const formatUpdatedAt = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export default function TagCacheSettings({ onConfirm, showToast, studio }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [source, setSource] = useState('All');
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cache, setCache] = useState({ error: '', items: [], loading: true, total: 0 });
  const [editingTag, setEditingTag] = useState('');
  const [draft, setDraft] = useState({ category: 'Unsorted', translation: '' });
  const [busyTag, setBusyTag] = useState('');

  const loadCache = useCallback(async (activeOffset = offset) => {
    const result = await studio.listTagCache({
      category,
      limit: PAGE_SIZE,
      offset: activeOffset,
      query,
      source,
    });
    if (!result?.ok) throw new Error(result?.error || '读取 Tag 缓存失败');
    return result;
  }, [category, offset, query, source, studio]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setCache((current) => ({ ...current, error: '', loading: true }));
      loadCache().then((result) => {
        if (!active) return;
        setCache({ error: '', items: result.items || [], loading: false, total: result.total || 0 });
      }).catch((error) => {
        if (active) setCache((current) => ({ ...current, error: error.message || String(error), loading: false }));
      });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadCache, refreshKey]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(cache.total / PAGE_SIZE));
  const categoryOptions = useMemo(() => CATEGORY_OPTIONS.map((value) => ({
    label: CATEGORY_LABELS[value] || value,
    value,
  })), []);

  const changeQuery = (value) => {
    setEditingTag('');
    setOffset(0);
    setQuery(value);
  };

  const beginEdit = (item) => {
    setEditingTag(item.tag);
    setDraft({ category: item.category || 'Unsorted', translation: item.translation || '' });
  };

  const saveEdit = async () => {
    setBusyTag(editingTag);
    try {
      const result = await studio.updateTagCache(editingTag, draft);
      if (!result?.ok) throw new Error(result?.error || '更新 Tag 缓存失败');
      setCache((current) => ({
        ...current,
        items: current.items.map((item) => item.tag === editingTag ? result.item : item),
      }));
      setEditingTag('');
      showToast('Tag 缓存已更新');
    } catch (error) {
      showToast(error.message || String(error), 'error');
    } finally {
      setBusyTag('');
    }
  };

  const deleteItem = async (item) => {
    const confirmed = await onConfirm({
      danger: true,
      detail: '不会修改图片中已经保存的 Prompt；再次整理这个 Tag 时，系统可能重新生成缓存。',
      message: `确定删除“${item.display_tag || item.tag}”的翻译和分类缓存吗？`,
      okText: '删除缓存',
      primaryDanger: true,
      title: '删除 Tag 缓存？',
    });
    if (!confirmed) return;
    setBusyTag(item.tag);
    try {
      const result = await studio.deleteTagCache(item.tag);
      if (!result?.ok) throw new Error(result?.error || '删除 Tag 缓存失败');
      setEditingTag('');
      if (cache.items.length === 1 && offset > 0) setOffset(Math.max(0, offset - PAGE_SIZE));
      else setRefreshKey((value) => value + 1);
      showToast('Tag 缓存已删除');
    } catch (error) {
      showToast(error.message || String(error), 'error');
    } finally {
      setBusyTag('');
    }
  };

  return <>
    <header className="settings-heading">
      <h2>Tag 缓存</h2>
      <p>查看并修正已经生成的 Tag 译文和分类。</p>
    </header>
    <div className="tag-cache-toolbar">
      <LobeSearchBar
        aria-label="搜索 Tag 缓存"
        className="tag-cache-search"
        loading={cache.loading}
        onInputChange={changeQuery}
        placeholder="搜索原 Tag、显示名或译文"
        value={query}
      />
      <LobeSelect aria-label="按 Tag 分类筛选" onChange={(value) => { setCategory(value); setOffset(0); }} options={CATEGORY_FILTER_OPTIONS} value={category}/>
      <LobeSelect aria-label="按缓存来源筛选" onChange={(value) => { setSource(value); setOffset(0); }} options={SOURCE_FILTER_OPTIONS} value={source}/>
    </div>
    {cache.error && <LobeAlert className="settings-warning" message={cache.error} type="error" variant="outlined"/>}
    <div className="tag-cache-summary">
      <span>{cache.loading ? '正在读取…' : `共 ${cache.total} 条缓存`}</span>
      {cache.total > 0 && <span>第 {page} / {pageCount} 页</span>}
    </div>
    <div className="tag-cache-list" aria-busy={cache.loading}>
      {!cache.loading && !cache.items.length ? <div className="tag-cache-empty">
        <Icon name="search" size={20}/>
        <strong>{query || category !== 'All' || source !== 'All' ? '没有匹配的 Tag 缓存' : '还没有 Tag 缓存'}</strong>
        <span>{query || category !== 'All' || source !== 'All' ? '试试更换搜索词或筛选条件。' : '整理或翻译 Tag 后，缓存会显示在这里。'}</span>
      </div> : cache.items.map((item) => {
        const editing = editingTag === item.tag;
        const itemBusy = busyTag === item.tag;
        return <article className={`tag-cache-item${editing ? ' editing' : ''}`} key={item.tag}>
          <div className="tag-cache-identity">
            <code title={item.display_tag || item.tag}>{item.display_tag || item.tag}</code>
            {item.display_tag && item.display_tag !== item.tag && <small>{item.tag}</small>}
          </div>
          {editing ? <>
            <div className="tag-cache-edit-fields">
              <LobeInput aria-label={`${item.display_tag || item.tag} 的译文`} maxLength={240} onChange={(event) => setDraft((current) => ({ ...current, translation: event.target.value }))} placeholder="译文可留空" value={draft.translation}/>
              <LobeSelect aria-label={`${item.display_tag || item.tag} 的分类`} onChange={(value) => setDraft((current) => ({ ...current, category: value }))} options={categoryOptions} value={draft.category}/>
            </div>
            <div className="tag-cache-actions">
              <LobeButton disabled={itemBusy} onClick={() => setEditingTag('')} size="small">取消</LobeButton>
              <LobeButton disabled={itemBusy} loading={itemBusy} onClick={saveEdit} size="small" type="primary">保存</LobeButton>
            </div>
          </> : <>
            <div className="tag-cache-value">
              <strong>{item.translation || '未翻译'}</strong>
              <small>译文：{sourceLabel(item.translation_source)} · 分类：{sourceLabel(item.category_source)}{item.updated_at ? ` · ${formatUpdatedAt(item.updated_at)}` : ''}</small>
            </div>
            <span className={`tag-cache-category cat-${String(item.category || 'Unsorted').toLowerCase()}`}>{CATEGORY_LABELS[item.category] || item.category || '未分类'}</span>
            <div className="tag-cache-actions">
              <LobeButton disabled={Boolean(busyTag)} icon={<Icon name="edit" size={13}/>} onClick={() => beginEdit(item)} size="small">编辑</LobeButton>
              <LobeButton danger disabled={Boolean(busyTag)} icon={<Icon name="trash" size={13}/>} loading={itemBusy} onClick={() => deleteItem(item)} size="small">删除</LobeButton>
            </div>
          </>}
        </article>;
      })}
    </div>
    {cache.total > PAGE_SIZE && <div className="tag-cache-pagination">
      <LobeButton disabled={cache.loading || offset === 0} icon={<Icon name="previous" size={14}/>} onClick={() => { setEditingTag(''); setOffset(Math.max(0, offset - PAGE_SIZE)); }}>上一页</LobeButton>
      <LobeButton disabled={cache.loading || offset + PAGE_SIZE >= cache.total} icon={<Icon name="next" size={14}/>} iconPosition="end" onClick={() => { setEditingTag(''); setOffset(offset + PAGE_SIZE); }}>下一页</LobeButton>
    </div>}
  </>;
}
