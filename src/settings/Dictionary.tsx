import { Button, Input, Select } from './Controls';
import { writeClipboardText } from '../lib/clipboard';
import {
  Collapse,
  TransitionSurface,
  useMovingIndicator,
  useNavigationSelection,
} from '../ui/transitions';
import { SurfaceButton } from '../ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Checkbox,
  Dialog,
  EmptyState,
  Menu,
  Layer,
  MenuItems,
  Shortcut,
  Progress,
  useNotifications,
  useScrollArea,
  type MenuItem,
} from '../ui';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../lib/prompt.js';
import type { TagCategory, TagDictionaryEntry } from '../shared/types';
import {
  useDictionary,
  dictionarySource,
  type DictionarySort,
  type DictionaryView,
} from '../state/dictionary';
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
const views: [DictionaryView, string][] = [
  ['all', '全部'],
  ['untranslated', '暂无译文'],
  ['unsorted', '未分类'],
  ['ai', 'AI 翻译'],
  ['manual', '已修改'],
];
const sourceLabel = (item: TagDictionaryEntry) =>
  ({ manual: '已修改', ai: 'AI', builtin: '内置' })[dictionarySource(item)];

export function Dictionary({ onFindTag }: { onFindTag?: (tag: string) => void }) {
  const d = useDictionary();
  const notify = useNotifications();
  const scroll = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const viewList = useRef<HTMLDivElement>(null);
  const viewMarker = useRef<HTMLSpanElement>(null);
  const [selectedView, selectView] = useNavigationSelection(d.filters.view, (view) =>
    d.setFilters((f) => ({ ...f, view })),
  );
  useMovingIndicator(viewList, viewMarker, '[aria-selected=true]', selectedView);
  const failures = useRef<HTMLDivElement>(null);
  const [showFailures, setShowFailures] = useState(false);
  useScrollArea(failures, { enabled: showFailures && !!d.progress?.failed.length });
  useScrollArea(scroll, { topInset: '--table-head-h' });
  const [viewport, setViewport] = useState({ top: 0, height: 0, row: 36, head: 30 });
  const [editing, setEditing] = useState<string | null>(null);
  const [translation, setTranslation] = useState('');
  const [deleting, setDeleting] = useState<string[]>([]);
  const [confirmTranslation, setConfirmTranslation] = useState(false);
  const [menu, setMenu] = useState<{
    item: TagDictionaryEntry;
    point?: { x: number; y: number };
  } | null>(null);
  const lastMenu = useRef(menu);
  if (menu) lastMenu.current = menu;
  const shownMenu = menu ?? lastMenu.current;
  const menuAnchor = useRef<HTMLElement | null>(null);
  const [message, setMessage] = useState('');
  const edit = useRef({ tag: editing, translation });
  edit.current = { tag: editing, translation };
  useEffect(() => {
    const commitOutside = (event: PointerEvent) => {
      const current = edit.current;
      if (!current.tag || !(event.target instanceof Element)) return;
      if (event.target.closest('[data-tag]')?.getAttribute('data-tag') === current.tag) return;
      setEditing(null);
      void d.save(current.tag, { translation: current.translation.trim() });
    };
    document.addEventListener('pointerdown', commitOutside, true);
    return () => document.removeEventListener('pointerdown', commitOutside, true);
  }, [d.save]);
  const retranslate = async () => {
    setShowFailures(false);
    const result = await d.retranslate();
    if (result && !result.canceled && !result.failed.length)
      notify({ tone: 'success', text: `已重新翻译 ${result.translated} 项` });
  };
  useLayoutEffect(() => {
    const node = scroll.current!;
    const measure = () => {
      const css = getComputedStyle(node);
      setViewport({
        top: node.scrollTop,
        height: node.clientHeight,
        row: parseFloat(css.getPropertyValue('--table-row-h')),
        head: parseFloat(css.getPropertyValue('--table-head-h')),
      });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(node);
    measure();
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !editing &&
        root.current?.getClientRects().length &&
        !document.querySelector('.nps-layer:popover-open, dialog[open]')
      )
        d.setSelected([]);
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        root.current?.getClientRects().length
      ) {
        event.preventDefault();
        root.current.querySelector<HTMLInputElement>('[aria-label="搜索 Tag 或译文"]')?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [editing, d.setSelected]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [d.filters]);
  const start = Math.max(0, Math.floor((viewport.top - viewport.head) / viewport.row) - 4);
  const end = Math.min(d.items.length, start + Math.ceil(viewport.height / viewport.row) + 10);
  const beginEdit = (item: TagDictionaryEntry) => {
    setEditing(item.tag);
    setTranslation(item.translation);
  };
  const focusCategory = (tag: string) =>
    requestAnimationFrame(() => {
      const row = [...root.current!.querySelectorAll<HTMLTableRowElement>('tr[data-tag]')].find(
        (row) => row.dataset.tag === tag,
      );
      const button = row?.querySelector<HTMLButtonElement>('.settings-table-category button');
      button?.focus();
      button?.click();
    });
  const saveTranslation = async (item: TagDictionaryEntry, next: 'next' | 'category') => {
    const following = d.items[d.items.findIndex((row) => row.tag === item.tag) + 1];
    if (!(await d.save(item.tag, { translation: translation.trim() }))) return;
    setEditing(null);
    if (next === 'category') focusCategory(item.tag);
    else if (following) {
      const index = d.items.findIndex((row) => row.tag === following.tag);
      if (scroll.current && (index < start || index >= end))
        scroll.current.scrollTop = index * viewport.row;
      beginEdit(following);
    }
  };
  const moreItems = (item: TagDictionaryEntry): MenuItem[] => [
    {
      id: 'find',
      label: '在图片库里查找',
      trailing: item.image_count ? `${item.image_count} 张` : undefined,
      onSelect: () => onFindTag?.(item.display_tag || item.tag),
    },
    {
      id: 'copy',
      label: '复制 Tag',
      onSelect: () => {
        void writeClipboardText((item.display_tag || item.tag).replaceAll('_', ' ')).then(
          () => setMessage('已复制 Tag'),
          (error) => setMessage(String(error)),
        );
      },
    },
    { id: 'sep', separator: true },
    {
      id: 'delete',
      label: dictionarySource(item) === 'manual' ? '还原' : '删除',
      danger: dictionarySource(item) !== 'manual',
      onSelect: () => setDeleting([item.tag]),
    },
  ];
  const reverting =
    deleting.length === 1 &&
    d.allItems.some((item) => item.tag === deleting[0] && dictionarySource(item) === 'manual');
  return (
    <div className="settings-dictionary settings-page" ref={root}>
      <header className="settings-page-head">
        <div>
          <h1>翻译词典</h1>
          <p>
            软件认识的 Tag
            及其译文和分类。工作台和图片库中显示的译文都来自这里；修改只影响显示，不会改动图片中的提示词。
          </p>
        </div>
      </header>
      <div className="settings-table-toolbar">
        <div>
          <Input
            className="settings-dictionary-search"
            aria-label="搜索 Tag 或译文"
            placeholder="搜索 Tag 或译文"
            prefix={<i className="ri-search-line" />}
            suffix={
              d.filters.query ? (
                <Button
                  variant="quiet"
                  size="small"
                  aria-label="清除搜索"
                  onClick={() => d.setFilters((f) => ({ ...f, query: '' }))}
                >
                  <i className="ri-close-line" />
                </Button>
              ) : (
                <Shortcut keys={['Mod', 'K']} />
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                d.setFilters((f) => ({ ...f, query: '' }));
              }
            }}
            value={d.filters.query}
            onChange={(e) => d.setFilters((f) => ({ ...f, query: e.target.value }))}
          />
          <Select
            label="按 Tag 分类筛选"
            options={[{ value: '', label: '全部分类' }, ...categories]}
            value={d.filters.category}
            onChange={(value) =>
              d.setFilters((f) => ({ ...f, category: value as TagCategory | '' }))
            }
          />
          <Select
            label="排序"
            options={[
              { value: 'usage', label: '按图片数' },
              { value: 'tag', label: '按 Tag 名称' },
              { value: 'recent', label: '最近修改' },
            ]}
            value={d.filters.sort}
            onChange={(sort) => d.setFilters((f) => ({ ...f, sort: sort as DictionarySort }))}
          />
        </div>
        <div
          className="settings-dictionary-views"
          role="tablist"
          aria-label="词典分页签"
          ref={viewList}
        >
          {views.map(([view, label]) => (
            <SurfaceButton
              kind="tab"
              key={view}
              type="button"
              role="tab"
              aria-selected={selectedView === view}
              onClick={() => {
                setEditing(null);
                selectView(view);
              }}
            >
              {label}
              <span>{d.counts[view].toLocaleString()}</span>
            </SurfaceButton>
          ))}
          <span
            ref={viewMarker}
            className="nps-moving-indicator settings-view-indicator"
            aria-hidden="true"
          />
        </div>
      </div>
      {(d.error || message) && <p role={d.error ? 'alert' : 'status'}>{d.error || message}</p>}
      <TransitionSurface
        className="settings-table-scroll settings-scroll"
        change={d.filters}
        nodeRef={scroll}
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          setViewport((v) => ({ ...v, top }));
        }}
      >
        <table className="settings-table" aria-rowcount={d.items.length + 1}>
          <thead>
            <tr>
              <th>
                <Checkbox
                  label="选择当前分页签"
                  checked={
                    !!d.items.length && d.items.every((item) => d.selected.includes(item.tag))
                  }
                  onChange={(checked) =>
                    d.setSelected(checked ? d.items.map((item) => item.tag) : [])
                  }
                />
              </th>
              <th>Tag</th>
              <th>译文</th>
              <th>分类</th>
              <th className="settings-usage">图片数</th>
              <th>来源</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!!start && (
              <tr
                className="settings-table-spacer"
                aria-hidden="true"
                style={{ height: start * viewport.row }}
              >
                <td colSpan={7} />
              </tr>
            )}
            {d.items.slice(start, end).map((item, offset) => (
              <tr
                key={item.tag}
                data-tag={item.tag}
                aria-rowindex={start + offset + 2}
                aria-selected={d.selected.includes(item.tag)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (d.busy) return;
                  menuAnchor.current = event.currentTarget;
                  setMenu({ item, point: { x: event.clientX, y: event.clientY } });
                }}
              >
                <td>
                  <Checkbox
                    label={item.tag}
                    checked={d.selected.includes(item.tag)}
                    onChange={(checked) =>
                      d.setSelected((current) =>
                        checked
                          ? [...current, item.tag]
                          : current.filter((tag) => tag !== item.tag),
                      )
                    }
                  />
                </td>
                <td>
                  <span className="settings-tag" data-tip-overflow={item.display_tag || item.tag}>
                    {(item.display_tag || item.tag).replaceAll('_', ' ')}
                  </span>
                </td>
                <td>
                  <TransitionSurface
                    className="settings-translation"
                    change={editing === item.tag ? 'edit' : item.translation}
                  >
                    {editing === item.tag ? (
                      <Input
                        size="small"
                        aria-label="译文"
                        autoFocus
                        value={translation}
                        onChange={(event) => setTranslation(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.nativeEvent.isComposing) return;
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditing(null);
                          }
                          if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
                            event.preventDefault();
                            void saveTranslation(item, event.key === 'Enter' ? 'next' : 'category');
                          }
                        }}
                      />
                    ) : (
                      <Button
                        variant="quiet"
                        className={!item.translation ? 'settings-no-translation' : undefined}
                        disabled={d.busy}
                        onClick={() => beginEdit(item)}
                      >
                        <span className="settings-cell-content">
                          {item.translation || '暂无译文'}
                        </span>
                      </Button>
                    )}
                  </TransitionSurface>
                </td>
                <td>
                  <Menu
                    className="settings-table-category"
                    buttonVariant="quiet"
                    label={`分类：${item.tag}`}
                    trigger={
                      <span className="settings-cell-content">
                        {categories.find((c) => c.value === item.category)?.prefix}
                        {CATEGORY_LABELS[item.category || 'Unsorted']}
                      </span>
                    }
                    items={categories.map((category) => ({
                      id: category.value,
                      label: category.label,
                      prefix: category.prefix,
                      current: category.value === item.category,
                      disabled: d.busy,
                      onSelect: () =>
                        void d.save(item.tag, { category: category.value as TagCategory }),
                    }))}
                  />
                </td>
                <td className="settings-usage">
                  {item.image_count ? (
                    <Button
                      variant="quiet"
                      onClick={() => onFindTag?.(item.display_tag || item.tag)}
                    >
                      {item.image_count}
                    </Button>
                  ) : (
                    <span>未使用</span>
                  )}
                </td>
                <td className="settings-source">{sourceLabel(item)}</td>
                <td className="settings-row-more">
                  <Button
                    variant="quiet"
                    size="small"
                    aria-label={`更多：${item.tag}`}
                    aria-expanded={menu?.item.tag === item.tag && !menu.point}
                    disabled={d.busy}
                    onClick={(event) => {
                      menuAnchor.current = event.currentTarget;
                      setMenu(menu?.item.tag === item.tag && !menu.point ? null : { item });
                    }}
                  >
                    <i className="ri-more-line" />
                  </Button>
                </td>
              </tr>
            ))}
            {end < d.items.length && (
              <tr
                className="settings-table-spacer"
                aria-hidden="true"
                style={{ height: (d.items.length - end) * viewport.row }}
              >
                <td colSpan={7} />
              </tr>
            )}
          </tbody>
        </table>
        {!d.busy && !d.items.length && (
          <EmptyState
            graphic={null}
            actions={
              d.filters.query ? (
                <Button onClick={() => d.setFilters((f) => ({ ...f, query: '' }))}>清除搜索</Button>
              ) : null
            }
            title={
              d.filters.query
                ? '没有找到匹配的 Tag'
                : d.filters.category
                  ? '此分类下暂无 Tag'
                  : {
                      all: '暂无 Tag',
                      untranslated: '所有 Tag 都已有译文',
                      unsorted: '所有 Tag 都已分类',
                      ai: '暂无 AI 翻译的 Tag',
                      manual: '暂无修改过的 Tag',
                    }[d.filters.view]
            }
            description={d.filters.query ? `Tag 和译文中都不包含"${d.filters.query}"。` : ''}
          />
        )}
        <div className="settings-dictionary-count">
          {d.busy ? '正在读取…' : `共 ${d.items.length} 项`}
        </div>
      </TransitionSurface>
      {d.progress && (d.running || d.progress.canceled || !!d.progress.failed.length) && (
        <TransitionSurface
          kind="presence"
          enter
          change={true}
          className="settings-dictionary-progress"
          role="status"
        >
          <div className="settings-dictionary-progress-line">
            <span>
              {d.running
                ? `正在用 AI 翻译 · 已完成 ${d.progress.completed} / ${d.progress.total}${d.progress.failed.length ? ` · 没能翻译 ${d.progress.failed.length} 条` : ''}`
                : d.progress.canceled
                  ? `已取消。完成了 ${d.progress.translated} 条，其余没有改动`
                  : `已翻译 ${d.progress.translated} 条，没能翻译 ${d.progress.failed.length} 条，保持原样`}
            </span>
            {!d.running && !!d.progress.failed.length && (
              <Button
                variant="quiet"
                aria-expanded={showFailures}
                data-disclosure=""
                aria-controls="dictionary-failures"
                onClick={() => setShowFailures((open) => !open)}
              >
                查看原因
              </Button>
            )}
            {d.running && (
              <Button className="settings-dictionary-cancel" variant="quiet" onClick={d.cancel}>
                取消
              </Button>
            )}
          </div>
          {d.running && (
            <Progress value={d.progress.completed} max={d.progress.total} label="AI 翻译进度" />
          )}
          <Collapse open={!d.running && !!d.progress.failed.length && showFailures}>
            <div className="settings-dictionary-failures" id="dictionary-failures" ref={failures}>
              {d.progress.failed.map((item) => (
                <p key={item.tag}>
                  {item.tag}：{item.error}
                </p>
              ))}
            </div>
          </Collapse>
        </TransitionSurface>
      )}
      {!!d.selected.length && (
        <TransitionSurface
          kind="presence"
          enter
          change={true}
          className="settings-dictionary-selection"
        >
          <div className="nps-selection" role="group" aria-label="词典多选操作">
            <span>已选 {d.selected.length} 项</span>
            <Menu
              label="设置分类"
              buttonVariant="quiet"
              items={categories.map((category) => ({
                id: category.value,
                label: category.label,
                prefix: category.prefix,
                disabled: d.busy,
                onSelect: async () => {
                  const count = d.selected.length;
                  if (await d.categorize(category.value as TagCategory))
                    notify({ tone: 'success', text: `已将 ${count} 项设为"${category.label}"` });
                },
              }))}
            />
            <Button
              variant="quiet"
              disabled={d.busy || !d.aiReady}
              loading={d.running}
              disabledReason={!d.aiReady ? "先在'AI 服务'里配置" : undefined}
              onClick={() =>
                d.selected.length > 50 ? setConfirmTranslation(true) : void retranslate()
              }
            >
              {d.running ? '翻译中' : '用 AI 重新翻译'}
            </Button>
            <span className="settings-selection-divider" aria-hidden />
            <Button variant="danger" disabled={d.busy} onClick={() => setDeleting(d.selected)}>
              删除
            </Button>
            <Button variant="quiet" onClick={() => d.setSelected([])}>
              取消
            </Button>
          </div>
        </TransitionSurface>
      )}
      <Layer
        open={!!menu}
        anchor={menuAnchor}
        point={shownMenu?.point}
        onClose={() => setMenu(null)}
        className="nps-menu"
        focus
      >
        {shownMenu && (
          <MenuItems
            label="词典更多"
            items={moreItems(shownMenu.item)}
            closeAll={() => setMenu(null)}
            closeLevel={() => setMenu(null)}
          />
        )}
      </Layer>
      <Dialog
        open={confirmTranslation}
        title={`用 AI 重新翻译 ${d.selected.length} 条？`}
        cancelLabel="取消"
        confirmLabel="开始翻译"
        confirmDisabled={d.busy}
        onCancel={() => setConfirmTranslation(false)}
        onConfirm={() => {
          setConfirmTranslation(false);
          void retranslate();
        }}
      >
        <p>
          会把这些 Tag 的名字发给你配置的 AI 服务，分 {Math.ceil(d.selected.length / 50)}{' '}
          批完成，可以随时取消。现有的译文和分类会被新的结果替换。
        </p>
      </Dialog>
      <Dialog
        open={!!deleting.length}
        title={
          reverting
            ? `还原"${deleting[0]}"？`
            : deleting.length === 1
              ? `删除"${deleting[0]}"？`
              : `删除这 ${deleting.length} 项？`
        }
        destructive={!reverting}
        cancelLabel="取消"
        confirmLabel={reverting ? '还原' : '删除'}
        confirmDisabled={d.busy}
        onCancel={() => setDeleting([])}
        onConfirm={() => {
          if (!d.busy)
            void d.remove(deleting).then((ok) => {
              if (ok) {
                notify({
                  tone: 'success',
                  text: reverting
                    ? '已还原'
                    : deleting.length === 1
                      ? '已删除'
                      : `已删除 ${deleting.length} 项`,
                });
                setDeleting([]);
              }
            });
        }}
      >
        <p>
          {reverting
            ? '将删除修改过的译文和分类。此 Tag 再次出现时会重新查询内置词典；内置词典中没有的，需要再次"翻译并分类"才会有译文。'
            : `软件不保存译文的历史记录。${deleting.length === 1 ? '此 Tag' : '这些 Tag'} 再次出现时会重新查询内置词典；内置词典中没有的，需要再次"翻译并分类"才会有译文。`}
        </p>
      </Dialog>
    </div>
  );
}
