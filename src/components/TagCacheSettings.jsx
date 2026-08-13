import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert as LobeAlert, SearchBar as LobeSearchBar } from '@lobehub/ui';
import { Button as LobeButton, Segmented as LobeSegmented, Select as LobeSelect } from '@lobehub/ui/base-ui';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../lib/prompt.js';
import { tagPresentation } from '../lib/tagManagement.js';
import Icon from './Icon.jsx';
import { TagCategorySection, TagChip, TagPopover, TagQuickEditor } from './TagManagement.jsx';

const PAGE_SIZE = 200;
const SOURCE_LABELS = {
  ai: 'AI',
  builtin: '内置词典',
  cache: '缓存',
  danbooru: 'Danbooru',
  heuristic: '本地推断',
  manual: '用户修改',
  rule: '本地规则',
};

const CATEGORY_OPTIONS_WITH_LABELS = CATEGORY_OPTIONS.map((value) => ({
  label: CATEGORY_LABELS[value] || value,
  value,
}));
const CATEGORY_FILTER_OPTIONS = [
  { label: '全部分类', value: 'All' },
  ...CATEGORY_OPTIONS_WITH_LABELS,
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
const LANGUAGE_OPTIONS = [
  { label: '原文', value: 'original' },
  { label: '翻译', value: 'translated' },
  { label: '对照', value: 'bilingual' },
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
  const [language, setLanguage] = useState('original');
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cache, setCache] = useState({ error: '', items: [], loading: true, total: 0 });
  const [editingTag, setEditingTag] = useState('');
  const [draft, setDraft] = useState({ category: 'Unsorted', translation: '' });
  const [busy, setBusy] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [batchCategory, setBatchCategory] = useState('Unsorted');

  const loadCache = useCallback(async () => {
    const result = await studio.listTagCache({ category, limit: PAGE_SIZE, offset, query, source });
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

  useEffect(() => {
    setEditingTag('');
    setSelectedTags([]);
  }, [category, offset, query, source]);

  const groups = useMemo(() => CATEGORY_OPTIONS.map((groupCategory) => ({
    category: groupCategory,
    items: cache.items.filter((item) => (item.category || 'Unsorted') === groupCategory),
  })).filter((group) => group.items.length), [cache.items]);
  const selectedSet = useMemo(() => new Set(selectedTags), [selectedTags]);
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(cache.total / PAGE_SIZE));

  const refresh = () => setRefreshKey((value) => value + 1);
  const changeFilter = (setter, value) => {
    setter(value);
    setOffset(0);
  };
  const closeSelection = () => {
    setSelecting(false);
    setSelectedTags([]);
  };
  const toggleSelected = (tag) => setSelectedTags((current) => current.includes(tag)
    ? current.filter((value) => value !== tag)
    : [...current, tag]);
  const toggleGroup = (items) => {
    const tags = items.map((item) => item.tag);
    const allSelected = tags.every((tag) => selectedSet.has(tag));
    setSelectedTags((current) => allSelected
      ? current.filter((tag) => !tags.includes(tag))
      : [...new Set([...current, ...tags])]);
  };

  const beginEdit = (item) => {
    setEditingTag(item.tag);
    setDraft({ category: item.category || 'Unsorted', translation: item.translation || '' });
  };

  const saveEdit = async () => {
    setBusy(`save:${editingTag}`);
    try {
      const result = await studio.updateTagCache(editingTag, draft);
      if (!result?.ok) throw new Error(result?.error || '更新 Tag 缓存失败');
      setEditingTag('');
      refresh();
      showToast('Tag 缓存已更新');
    } catch (error) {
      showToast(error.message || String(error), 'error');
    } finally {
      setBusy('');
    }
  };

  const deleteItems = async (items) => {
    const tags = items.map((item) => item.tag);
    const confirmed = await onConfirm({
      danger: true,
      detail: '不会修改图片中已经保存的 Prompt；再次整理这些 Tag 时，系统可能重新生成缓存。',
      message: tags.length === 1
        ? `确定删除“${items[0].display_tag || items[0].tag}”的翻译和分类缓存吗？`
        : `确定删除选中的 ${tags.length} 条 Tag 缓存吗？`,
      okText: tags.length === 1 ? '删除缓存' : `删除 ${tags.length} 条`,
      primaryDanger: true,
      title: '删除 Tag 缓存？',
    });
    if (!confirmed) return;
    setBusy('delete');
    try {
      const result = tags.length === 1
        ? await studio.deleteTagCache(tags[0])
        : await studio.deleteTagCacheMany(tags);
      if (!result?.ok) throw new Error(result?.error || '删除 Tag 缓存失败');
      setEditingTag('');
      closeSelection();
      if (tags.length >= cache.items.length && offset > 0) setOffset(Math.max(0, offset - PAGE_SIZE));
      else refresh();
      showToast(tags.length === 1 ? 'Tag 缓存已删除' : `已删除 ${tags.length} 条 Tag 缓存`);
    } catch (error) {
      showToast(error.message || String(error), 'error');
    } finally {
      setBusy('');
    }
  };

  const updateSelectedCategory = async () => {
    if (!selectedTags.length) return;
    setBusy('batch-category');
    try {
      const result = await studio.updateTagCacheMany(selectedTags, batchCategory);
      if (!result?.ok) throw new Error(result?.error || '批量更新 Tag 分类失败');
      const count = selectedTags.length;
      closeSelection();
      refresh();
      showToast(`已更新 ${count} 条 Tag 分类`);
    } catch (error) {
      showToast(error.message || String(error), 'error');
    } finally {
      setBusy('');
    }
  };

  return <>
    <header className="settings-heading">
      <h2>Tag 缓存</h2>
      <p>按工作台的分类方式查看并修正全局译文与分类。</p>
    </header>
    <div className="tag-cache-toolbar">
      <LobeSearchBar
        aria-label="搜索 Tag 缓存"
        className="tag-cache-search"
        loading={cache.loading}
        onInputChange={(value) => changeFilter(setQuery, value)}
        placeholder="搜索原 Tag、显示名或译文"
        value={query}
      />
      <LobeSelect aria-label="按 Tag 分类筛选" onChange={(value) => changeFilter(setCategory, value)} options={CATEGORY_FILTER_OPTIONS} value={category}/>
      <LobeSelect aria-label="按缓存来源筛选" onChange={(value) => changeFilter(setSource, value)} options={SOURCE_FILTER_OPTIONS} value={source}/>
    </div>
    {cache.error && <LobeAlert className="settings-warning" message={cache.error} type="error" variant="outlined"/>}
    <div className="tag-cache-commandbar">
      <LobeSegmented aria-label="Tag 显示语言" onChange={setLanguage} options={LANGUAGE_OPTIONS} size="small" value={language}/>
      <span>{cache.loading ? '正在读取…' : `共 ${cache.total} 条缓存`}{cache.total > PAGE_SIZE ? ` · 第 ${page}/${pageCount} 页` : ''}</span>
      <LobeButton disabled={cache.loading || !cache.items.length} icon={<Icon name={selecting ? 'close' : 'check'} size={14}/>} onClick={() => selecting ? closeSelection() : setSelecting(true)} size="small">{selecting ? '完成选择' : '选择'}</LobeButton>
    </div>
    {selecting && <div className="tag-cache-selection-bar">
      <span>已选 {selectedTags.length} 条</span>
      <LobeButton onClick={() => setSelectedTags(selectedTags.length === cache.items.length ? [] : cache.items.map((item) => item.tag))} size="small">{selectedTags.length === cache.items.length ? '取消本页' : '选择本页'}</LobeButton>
      <LobeSelect aria-label="批量设置 Tag 分类" onChange={setBatchCategory} options={CATEGORY_OPTIONS_WITH_LABELS} size="small" value={batchCategory}/>
      <LobeButton disabled={!selectedTags.length || Boolean(busy)} loading={busy === 'batch-category'} onClick={updateSelectedCategory} size="small" type="primary">应用分类</LobeButton>
      <LobeButton danger disabled={!selectedTags.length || Boolean(busy)} loading={busy === 'delete'} onClick={() => deleteItems(cache.items.filter((item) => selectedSet.has(item.tag)))} size="small">删除</LobeButton>
    </div>}
    <div className="tag-cache-groups" aria-busy={cache.loading}>
      {!cache.loading && !cache.items.length ? <div className="tag-cache-empty">
        <Icon name="search" size={20}/>
        <strong>{query || category !== 'All' || source !== 'All' ? '没有匹配的 Tag 缓存' : '还没有 Tag 缓存'}</strong>
        <span>{query || category !== 'All' || source !== 'All' ? '试试更换搜索词或筛选条件。' : '整理或翻译 Tag 后，缓存会显示在这里。'}</span>
      </div> : groups.map((group) => {
        const allSelected = group.items.every((item) => selectedSet.has(item.tag));
        return <TagCategorySection
          action={selecting ? <LobeButton onClick={() => toggleGroup(group.items)} size="small" type={allSelected ? 'primary' : 'default'}>{allSelected ? '取消整组' : `选择整组 ${group.items.length}`}</LobeButton> : null}
          category={group.category}
          count={group.items.length}
          key={group.category}
        >
          {group.items.map((item) => {
            const selected = selectedSet.has(item.tag);
            const presentationTag = { ...item, tag: item.display_tag || item.tag, weight: 1 };
            const display = tagPresentation(presentationTag, language);
            const itemBusy = busy === `save:${item.tag}`;
            const metadata = <>
              <span>译文：{sourceLabel(item.translation_source)}</span>
              <span>分类：{sourceLabel(item.category_source)}</span>
              {item.updated_at && <span>{formatUpdatedAt(item.updated_at)}</span>}
            </>;
            const chip = <TagChip
              className="tag-cache-chip"
              display={display}
              onClick={(event) => {
                if (!selecting) return;
                event.preventDefault();
                event.stopPropagation();
                toggleSelected(item.tag);
              }}
              role="listitem"
              selected={selected}
              selecting={selecting}
              showWeight={false}
              tag={presentationTag}
              title={`${display.title}\n译文来源：${sourceLabel(item.translation_source)}\n分类来源：${sourceLabel(item.category_source)}${selecting ? '\n点击选择' : '\n点击编辑缓存'}`}
            />;
            return <TagPopover
              content={<TagQuickEditor
                actions={<>
                  <LobeButton danger disabled={itemBusy || busy === 'delete'} icon={<Icon name="trash" size={13}/>} onClick={() => deleteItems([item])} size="small">删除</LobeButton>
                  <LobeButton disabled={itemBusy} loading={itemBusy} onClick={saveEdit} size="small" type="primary">保存</LobeButton>
                </>}
                metadata={metadata}
                onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                onClose={() => setEditingTag('')}
                originalReadOnly
                showPromptControls={false}
                subtitle="原 Tag 只读 · 保存到全局缓存"
                tag={{ ...item, ...draft, tag: item.tag }}
                title="编辑缓存"
              />}
              disabled={selecting}
              editKey={item.tag}
              editingKey={editingTag}
              key={item.tag}
              onEditingChange={(key) => key ? beginEdit(item) : setEditingTag('')}
            >
              {chip}
            </TagPopover>;
          })}
        </TagCategorySection>;
      })}
    </div>
    {cache.total > PAGE_SIZE && <div className="tag-cache-pagination">
      <LobeButton disabled={cache.loading || offset === 0} icon={<Icon name="previous" size={14}/>} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>上一页</LobeButton>
      <LobeButton disabled={cache.loading || offset + PAGE_SIZE >= cache.total} icon={<Icon name="next" size={14}/>} iconPosition="end" onClick={() => setOffset(offset + PAGE_SIZE)}>下一页</LobeButton>
    </div>}
  </>;
}
