import { useRef, useState } from 'react';
import { Button, Input, Select, Checkbox, Dialog, Popover, EmptyState } from '../ui';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../lib/prompt.js';
import type { TagCategory } from '../shared/types';
import type { TagCacheRequest } from '../shared/ipc';
import { PAGE_SIZE, useDictionary } from '../state/dictionary';
const categoryTokens: Record<string, string> = {
  ArtistEra: 'artist-era',
  Composition: 'composition',
  Body: 'body',
  Clothing: 'clothing',
  Action: 'action',
  Environment: 'environment',
  StyleQuality: 'style',
  Unsorted: 'unsorted',
};
const categories = CATEGORY_OPTIONS.map((value: string) => ({
  value,
  label: CATEGORY_LABELS[value as TagCategory],
  prefix: (
    <span
      aria-hidden="true"
      className="settings-category-dot"
      style={{ background: `var(--cat-${categoryTokens[value] || value.toLowerCase()})` }}
    />
  ),
}));
const sources = [
  { value: '', label: '全部来源' },
  ...Object.entries({
    manual: '用户修改',
    danbooru: 'Danbooru',
    dso: 'DSO 内置词典',
    ai: 'AI',
    rule: '本地规则',
    builtin: '内置词典',
    heuristic: '本地推断',
  }).map(([value, label]) => ({ value, label })),
];
const sourceLabel = (source: string) =>
  sources.find((item) => item.value && item.value === source)?.label ||
  (source === 'cache' ? '缓存' : '未记录');
const formatUpdatedAt = (value?: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '';
export function Dictionary() {
  const d = useDictionary();
  const editAnchor = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState('');
  const [translation, setTranslation] = useState('');
  const [category, setCategory] = useState<TagCategory>('Unsorted');
  const [batchCategory, setBatchCategory] = useState<TagCategory>('Unsorted');
  const [deleting, setDeleting] = useState<string[]>([]);
  const editedItem = d.items.find((item) => item.tag === editing);
  const filter = (patch: TagCacheRequest) =>
    d.setFilters((current) => ({ ...current, ...patch, offset: 0 }));
  return (
    <div className="settings-dictionary">
      <header className="settings-copy">
        <h2>翻译词典</h2>
        <p>这里是软件记住的 Tag 译文和分类。修改只影响显示，不会改动图片里保存的 Prompt。</p>
      </header>
      <div className="settings-table-toolbar">
        <Input
          aria-label="搜索 Tag 或译文"
          placeholder="搜索 Tag 或译文"
          value={d.filters.query}
          onChange={(e) => filter({ query: e.target.value })}
        />
        <Select
          label="按 Tag 分类筛选"
          options={[{ value: '', label: '全部分类' }, ...categories]}
          value={d.filters.category || ''}
          onChange={(value) => filter({ category: value as TagCategory | '' })}
        />
        <Select
          label="按缓存来源筛选"
          options={sources}
          value={d.filters.source || ''}
          onChange={(value) => filter({ source: value as TagCacheRequest['source'] })}
        />
        <span>{d.busy ? '正在读取…' : `${d.total} 条`}</span>
      </div>
      {d.error && <p role="alert">{d.error}</p>}
      <div className="settings-table-scroll">
        <table className="settings-table">
          <thead>
            <tr>
              <th>
                <Checkbox
                  label="选择本页"
                  checked={!!d.items.length && d.selected.length === d.items.length}
                  onChange={(checked) => d.setSelected(checked ? d.items.map((i) => i.tag) : [])}
                />
              </th>
              <th>Tag</th>
              <th>译文</th>
              <th>分类</th>
              <th>来源</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.items.map((item) => (
              <tr key={item.tag} aria-selected={d.selected.includes(item.tag)}>
                <td>
                  <Checkbox
                    label={item.tag}
                    checked={d.selected.includes(item.tag)}
                    onChange={(checked) =>
                      d.setSelected((current) =>
                        checked ? [...current, item.tag] : current.filter((t) => t !== item.tag),
                      )
                    }
                  />
                </td>
                <td>
                  <span className="settings-tag">{item.display_tag || item.tag}</span>
                </td>
                <td>
                  <Button
                    variant="quiet"
                    onClick={(event) => {
                      editAnchor.current = event.currentTarget;
                      setEditing(item.tag);
                      setTranslation(item.translation || '');
                      setCategory(item.category || 'Unsorted');
                    }}
                  >
                    {item.translation || '点击填写'}
                  </Button>
                </td>
                <td>
                  <Button
                    variant="quiet"
                    onClick={(event) => {
                      editAnchor.current = event.currentTarget;
                      setEditing(item.tag);
                      setTranslation(item.translation || '');
                      setCategory(item.category || 'Unsorted');
                    }}
                  >
                    {categories.find((c) => c.value === item.category)?.prefix}
                    {CATEGORY_LABELS[item.category || 'Unsorted']}
                  </Button>
                </td>
                <td className="settings-source">
                  {sourceLabel(item.translation_source || item.category_source)}
                </td>
                <td>
                  <Button
                    size="small"
                    variant="quiet"
                    disabled={d.busy}
                    onClick={() => setDeleting([item.tag])}
                  >
                    删除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!d.busy && !d.items.length && (
          <EmptyState
            graphic={null}
            actions={null}
            title={
              d.filters.query || d.filters.category || d.filters.source
                ? '没有匹配的 Tag 数据'
                : '还没有 Tag 数据'
            }
            description={
              d.filters.query || d.filters.category || d.filters.source
                ? '试试更换搜索词或筛选条件。'
                : '整理或翻译 Tag 后，全局数据会显示在这里。'
            }
          />
        )}
      </div>
      {!!d.selected.length && (
        <div className="settings-actions">
          <span>已选 {d.selected.length} 条</span>
          <Select
            label="批量设置 Tag 分类"
            options={categories}
            value={batchCategory}
            onChange={(v) => setBatchCategory(v as TagCategory)}
          />
          <Button disabled={d.busy} onClick={() => void d.categorize(batchCategory)}>
            设置分类
          </Button>
          <Button variant="danger" disabled={d.busy} onClick={() => setDeleting(d.selected)}>
            删除
          </Button>
          <Button variant="quiet" onClick={() => d.setSelected([])}>
            取消
          </Button>
        </div>
      )}
      {d.total > PAGE_SIZE && (
        <div className="settings-actions">
          <Button
            disabled={!d.filters.offset || d.busy}
            onClick={() => d.setFilters((f) => ({ ...f, offset: (f.offset || 0) - PAGE_SIZE }))}
          >
            上一页
          </Button>
          <span>
            第 {Math.floor((d.filters.offset || 0) / PAGE_SIZE) + 1}/
            {Math.ceil(d.total / PAGE_SIZE)} 页
          </span>
          <Button
            disabled={(d.filters.offset || 0) + PAGE_SIZE >= d.total || d.busy}
            onClick={() => d.setFilters((f) => ({ ...f, offset: (f.offset || 0) + PAGE_SIZE }))}
          >
            下一页
          </Button>
        </div>
      )}
      <Popover open={!!editing} label={editing} anchor={editAnchor} onClose={() => setEditing('')}>
        <div className="settings-edit-fields">
          <strong>编辑缓存</strong>
          <small>原 Tag 只读 · 保存到全局缓存</small>
          <code>{editing}</code>
          <Input
            aria-label="译文"
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
          />
          <Select
            label="分类"
            options={categories}
            value={category}
            onChange={(v) => setCategory(v as TagCategory)}
          />
          <small>
            译文：{sourceLabel(editedItem?.translation_source || '')} · 分类：
            {sourceLabel(editedItem?.category_source || '')}
          </small>
          <small>{formatUpdatedAt(editedItem?.updated_at)}</small>
          {d.error && <p role="alert">{d.error}</p>}
          <div className="settings-actions">
            <Button onClick={() => setEditing('')}>取消</Button>
            <Button
              variant="ink"
              disabled={d.busy}
              onClick={() =>
                void d.save(editing, { translation, category }).then((ok) => {
                  if (ok) setEditing('');
                })
              }
            >
              保存
            </Button>
          </div>
        </div>
      </Popover>
      <Dialog
        open={!!deleting.length}
        title="删除 Tag 缓存？"
        destructive
        cancelLabel="取消"
        confirmLabel={deleting.length === 1 ? '删除缓存' : `删除 ${deleting.length} 条`}
        onCancel={() => setDeleting([])}
        onConfirm={() => {
          if (!d.busy)
            void d.remove(deleting).then((ok) => {
              if (ok) setDeleting([]);
            });
        }}
      >
        <p>确定删除选中的 {deleting.length} 条 Tag 缓存吗？</p>
        <p>不会修改图片中已经保存的 Prompt；再次整理这些 Tag 时，系统可能重新生成缓存。</p>
        {d.error && <p role="alert">{d.error}</p>}
      </Dialog>
    </div>
  );
}
