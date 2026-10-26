// 翻译词典（doc/design.md 2.11"翻译词典页重做"）：整页的表格，自己滚动；表头停在顶部。
// 切换分页签（标记会滑）、换分类和排序、搜索：结果真的变了才整个表格换内容。
// 点译文就地改：Enter 保存并跳到下一行，Tab 保存并打开分类菜单，Esc 取消，点到别处保存。
// 在当前分页签里改过的行留到离开这个分页签（免得列表在手底下跳动）。点分类直接改，点图片数在图片库中查找。
// 悬停一行出现"更多"（右键也可以）。勾选后底部出现多选操作条。行很多，只渲染看得到的那些。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { writeClipboardText } from '../lib/clipboard';
import { CAT_NAME, CATEGORIES, catColor } from '../kit/categories';
import { CheckMark, Icon, Kbd, isMod } from '../kit/controls';
import { layerOpen } from '../kit/layer';
import { ContextMenu, MenuPop, type MenuEntry } from '../kit/menu';
import { Presence } from '../kit/motion';
import { useNotifications } from '../kit/toast';
import {
  useDictionary,
  dictionarySource,
  type DictionarySort,
  type DictionaryView,
} from '../state/dictionary';
import { useIndicator } from '../kit/motion';
import { Dropdown, Swap } from './parts';
import { useAsk } from '../kit/dialog';
import type { TagCategory, TagDictionaryEntry } from '../shared/types';

const VIEWS: [DictionaryView, string][] = [
  ['all', '全部'],
  ['untranslated', '暂无译文'],
  ['unsorted', '未分类'],
  ['ai', 'AI 翻译'],
  ['manual', '已修改'],
];
const SORTS: [DictionarySort, string][] = [
  ['usage', '按图片数'],
  ['tag', '按 Tag 名称'],
  ['recent', '最近修改'],
];
const EMPTY: Record<DictionaryView, string> = {
  all: '暂无 Tag',
  untranslated: '所有 Tag 都已有译文',
  unsorted: '所有 Tag 都已分类',
  ai: '暂无 AI 翻译的 Tag',
  manual: '暂无修改过的 Tag',
};
const SRC = { manual: '已修改', ai: 'AI', builtin: '内置' };
const shown = (t: TagDictionaryEntry) => (t.display_tag || t.tag).replaceAll('_', ' ');
const Dot = ({ c }: { c?: string | null }) => (
  <span className="cdot" style={{ background: catColor(c) }} />
);

export function Dictionary({ onFindTag }: { onFindTag?: (tag: string) => void }) {
  const d = useDictionary();
  const notify = useNotifications();
  const [dialog, ask] = useAsk();
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLSpanElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [edit, setEdit] = useState<{ tag: string; text: string } | null>(null);
  const [cat, setCat] = useState<{ tag: string; el: HTMLElement } | null>(null);
  const catAnchor = useRef<HTMLElement | null>(null);
  catAnchor.current = cat?.el || catAnchor.current;
  const [more, setMore] = useState<{ tag: string; el?: HTMLElement; at?: [number, number] } | null>(
    null,
  );
  const moreAnchor = useRef<HTMLElement | null>(null);
  if (more?.el) moreAnchor.current = more.el;
  const [bulkCat, setBulkCat] = useState(false);
  const bulkBtn = useRef<HTMLButtonElement>(null);
  useIndicator(tabs, [d.filters.view, d.counts]);

  // 结果真的变了才换内容：筛选条件变了、而且行也不一样了
  const gen = useRef({ n: 0, filters: d.filters, sig: '' });
  const sig = useMemo(() => d.items.map((t) => t.tag).join('\n'), [d.items]);
  if (gen.current.filters !== d.filters) {
    if (gen.current.sig !== sig) gen.current.n++;
    gen.current.filters = d.filters;
  }
  gen.current.sig = sig;
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [gen.current.n]);

  // 只渲染看得到的行
  const [view, setView] = useState({ top: 0, h: 800, row: 37, head: 30 });
  useLayoutEffect(() => {
    const el = scroll.current!;
    const measure = () => {
      const row = el.querySelector<HTMLElement>('.dbody .drow')?.offsetHeight;
      const head = el.querySelector<HTMLElement>('.dhead')?.offsetHeight;
      setView((v) => ({
        top: el.scrollTop,
        h: el.clientHeight,
        row: row || v.row,
        head: (head || v.head) + (el.querySelector<HTMLElement>('.dtbl')?.offsetTop || 0),
      }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [d.items.length > 0]);
  const start = Math.max(0, Math.floor((view.top - view.head) / view.row) - 6);
  const end = Math.min(d.items.length, start + Math.ceil(view.h / view.row) + 12);

  // 点到正在改的那一行以外：保存
  const editRef = useRef(edit);
  editRef.current = edit;
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const cur = editRef.current;
      if (!cur || !(e.target instanceof Element)) return;
      if (e.target.closest('[data-dxrow]')?.getAttribute('data-dxrow') === cur.tag) return;
      setEdit(null);
      void commit(cur);
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [d.allItems]);
  // Ctrl K 聚焦搜索；Esc 取消选择
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!root.current?.getClientRects().length) return;
      if (isMod(e) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        search.current?.focus();
        search.current?.select();
      }
      if (e.key === 'Escape' && !editRef.current && !layerOpen() && d.selected.length)
        d.setSelected([]);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [d.selected.length, d.setSelected]);

  const get = (tag: string) => d.allItems.find((t) => t.tag === tag);
  const commit = async (cur: { tag: string; text: string }) => {
    const item = get(cur.tag);
    const text = cur.text.trim();
    if (!item || text === item.translation) return true;
    return d.save(cur.tag, { translation: text });
  };
  const rowEl = (tag: string) =>
    [...(root.current?.querySelectorAll<HTMLElement>('[data-dxrow]') || [])].find(
      (r) => r.dataset.dxrow === tag,
    );
  const startEdit = (t: TagDictionaryEntry) => {
    if (edit && edit.tag !== t.tag) void commit(edit);
    setEdit({ tag: t.tag, text: t.translation });
  };
  const finish = async (how: 'next' | 'cat') => {
    if (!edit) return;
    const cur = edit;
    const i = d.items.findIndex((t) => t.tag === cur.tag);
    const next = d.items[i + 1];
    setEdit(null);
    if (!(await commit(cur))) return;
    if (how === 'cat')
      requestAnimationFrame(() => {
        const el = rowEl(cur.tag)?.querySelector<HTMLElement>('.dcell[data-cat]');
        if (el) setCat({ tag: cur.tag, el });
      });
    else if (next) {
      const sc = scroll.current;
      const y = view.head + (i + 1) * view.row;
      if (sc && (y < sc.scrollTop + view.head || y + view.row > sc.scrollTop + sc.clientHeight))
        sc.scrollTop = y - sc.clientHeight / 2;
      setEdit({ tag: next.tag, text: next.translation });
    }
  };

  const remove = async (tags: string[]) => {
    const one = tags.length === 1 ? get(tags[0]) : undefined;
    const restore = !!one && dictionarySource(one) === 'manual';
    const ok = await ask({
      title: one ? `${restore ? '还原' : '删除'}“${shown(one)}”？` : `删除这 ${tags.length} 项？`,
      body: `${restore ? '将删除修改过的译文和分类。' : '软件不保存译文的历史记录。'}${one ? '此 Tag' : '这些 Tag'}再次出现时会重新查询内置词典；内置词典中没有的，需要再次“翻译并分类”才会有译文。`,
      ok: restore ? '还原' : '删除',
      danger: !restore,
    });
    if (!ok) return;
    if (await d.remove(tags))
      notify({
        text: restore ? '已还原' : one ? '已删除' : `已删除 ${tags.length} 项`,
        tone: 'success',
      });
  };
  const retranslate = async (tags = d.selected) => {
    const ok = await ask({
      title: `用 AI 重新翻译 ${tags.length} 项？`,
      body: `会把这 ${tags.length} 个 Tag 发给你配置的 AI 服务（${d.serviceUrl}）。返回的译文会替换现在的译文，改过的也会被替换。`,
      ok: '重新翻译',
    });
    if (ok) await run(tags);
  };
  const run = async (tags: string[]) => {
    const r = await d.retranslate(tags);
    if (!r) return;
    if (r.failed.length)
      notify({
        tone: 'error',
        text: `翻译失败：${r.failed[0].error}。已翻译 ${r.translated} 项，其余没有改动`,
        action: { label: '重试', onClick: () => void run(r.failed.map((x) => x.tag)) },
      });
    else if (r.canceled)
      notify({ tone: 'success', text: `已停止：翻译了 ${r.translated} 项，其余没有改动` });
    else notify({ tone: 'success', text: `已重新翻译 ${r.translated} 项` });
  };
  const moreItems = (t: TagDictionaryEntry): MenuEntry[] => [
    {
      label: '在图片库中查找',
      hint: t.image_count ? `${t.image_count} 张` : '未使用',
      onSelect: () => onFindTag?.(t.display_tag || t.tag),
    },
    {
      label: '复制 Tag',
      onSelect: () =>
        void writeClipboardText(shown(t)).then(
          () => notify({ text: '已复制', tone: 'success' }),
          (e) => notify({ text: String(e), tone: 'error' }),
        ),
    },
    'sep',
    dictionarySource(t) === 'manual'
      ? { label: '还原', onSelect: () => void remove([t.tag]) }
      : { label: '删除', danger: true, onSelect: () => void remove([t.tag]) },
  ];
  const catItems = (cur: string | null | undefined, pick: (c: TagCategory) => void): MenuEntry[] =>
    CATEGORIES.map((c) => ({
      label: CAT_NAME[c],
      dot: catColor(c),
      checked: cur === c,
      onSelect: () => pick(c),
    }));

  const picked = d.items.filter((t) => d.selected.includes(t.tag)).length;
  const head = !picked ? '' : picked === d.items.length ? 'on' : 'some';
  const q = d.filters.query.trim();
  const setF = (patch: Partial<typeof d.filters>) => {
    if (edit) {
      void commit(edit);
      setEdit(null);
    }
    d.setFilters((f) => ({ ...f, ...patch }));
  };
  const moreItem = more && get(more.tag);
  const catItem = cat && get(cat.tag);
  // 菜单关上时淡出，这期间还显示原来的内容
  const lastMore = useRef<{ item: TagDictionaryEntry; at: boolean } | null>(null);
  if (moreItem) lastMore.current = { item: moreItem, at: !!more?.at };
  const lastCat = useRef<TagDictionaryEntry | null>(null);
  if (catItem) lastCat.current = catItem;
  const menuMore = lastMore.current ? moreItems(lastMore.current.item) : [];
  const menuCat = lastCat.current;

  const row = (t: TagDictionaryEntry) => {
    const on = d.selected.includes(t.tag);
    const ed = edit?.tag === t.tag;
    const src = dictionarySource(t);
    const c = t.category || 'Unsorted';
    return (
      <div
        key={t.tag}
        className={`drow ${on ? 'on' : ''} ${more?.tag === t.tag ? 'menu-open' : ''}`}
        data-dxrow={t.tag}
        onContextMenu={(e) => {
          if ((e.target as Element).closest('input')) return;
          e.preventDefault();
          setMore({ tag: t.tag, at: [e.clientX, e.clientY] });
        }}
      >
        <div>
          <button
            className="dx-check"
            role="checkbox"
            aria-checked={on}
            aria-label={`选择 ${shown(t)}`}
            onClick={() =>
              d.setSelected((s) => (on ? s.filter((x) => x !== t.tag) : [...s, t.tag]))
            }
          >
            <CheckMark state={on ? 'on' : ''} />
          </button>
        </div>
        <div>
          <span className="en selectable" data-tip-overflow={shown(t)}>
            {shown(t)}
          </span>
        </div>
        <div>
          {ed ? (
            <label className="field sm dict-input">
              <input
                autoFocus
                aria-label="译文"
                value={edit.text}
                placeholder="暂无译文"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setEdit({ tag: t.tag, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setEdit(null);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    void finish('next');
                  } else if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    void finish('cat');
                  }
                }}
              />
            </label>
          ) : (
            <span
              className={`dict-zh ${t.translation ? '' : 'muted'}`}
              role="button"
              tabIndex={0}
              data-tip="点击修改"
              onClick={() => startEdit(t)}
              onKeyDown={(e) => e.key === 'Enter' && startEdit(t)}
            >
              {t.translation || '暂无译文'}
            </span>
          )}
        </div>
        <div>
          <button
            className={`dcell ${c === 'Unsorted' ? 'dim' : ''} ${cat?.tag === t.tag ? 'open' : ''}`}
            data-cat=""
            data-tip="点击修改分类"
            aria-haspopup="menu"
            onClick={(e) => {
              const el = e.currentTarget;
              setCat(cat?.tag === t.tag ? null : { tag: t.tag, el });
            }}
          >
            <Dot c={c} />
            {CAT_NAME[c as TagCategory]}
          </button>
        </div>
        <div className="num">
          {t.image_count ? (
            <button
              className="dcell mono"
              data-tip="在图片库中查找"
              onClick={() => onFindTag?.(t.display_tag || t.tag)}
            >
              {t.image_count}
            </button>
          ) : (
            <span className="muted">未使用</span>
          )}
        </div>
        <div className="src">{SRC[src]}</div>
        <div>
          <button
            className="btn quiet sm icon dmore"
            aria-label="更多"
            aria-haspopup="menu"
            onClick={(e) => {
              const el = e.currentTarget;
              setMore(more?.tag === t.tag && !more.at ? null : { tag: t.tag, el });
            }}
          >
            <Icon name="more-2-fill" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="dict" ref={root}>
      <div className="set-head">
        <div>
          <h1>翻译词典</h1>
          <p>
            软件认识的 Tag
            及其译文和分类。工作台和图片库中显示的译文都来自这里；修改只影响显示，不会改动图片中的提示词。
          </p>
        </div>
      </div>
      <div className="dict-bar">
        <div>
          <label className="field sm dict-search" data-feature="dictionary">
            <Icon name="search-line" />
            <input
              ref={search}
              placeholder="搜索 Tag 或译文"
              aria-label="搜索 Tag 或译文"
              autoComplete="off"
              spellCheck={false}
              value={d.filters.query}
              onChange={(e) => setF({ query: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && d.filters.query) {
                  e.stopPropagation();
                  setF({ query: '' });
                }
              }}
            />
            {d.filters.query ? (
              <button
                className="btn quiet sm icon lq-x"
                aria-label="清除搜索"
                onClick={() => {
                  setF({ query: '' });
                  search.current?.focus();
                }}
              >
                <Icon name="close-line" />
              </button>
            ) : (
              <Kbd keys="Mod K" />
            )}
          </label>
          <span className="sp" />
          <Dropdown
            label="按分类筛选"
            place="below-right"
            value={
              d.filters.category ? (
                <>
                  <Dot c={d.filters.category} />
                  {CAT_NAME[d.filters.category]}
                </>
              ) : (
                '全部分类'
              )
            }
            items={[
              {
                label: '全部分类',
                checked: !d.filters.category,
                onSelect: () => setF({ category: '' }),
              },
              'sep',
              ...catItems(d.filters.category, (category) => setF({ category })),
            ]}
          />
          <Dropdown
            label="排序"
            place="below-right"
            value={SORTS.find(([k]) => k === d.filters.sort)?.[1]}
            items={SORTS.map(([k, name]) => ({
              label: name,
              checked: d.filters.sort === k,
              onSelect: () => setF({ sort: k }),
            }))}
          />
        </div>
        <div className="dict-views">
          <span className="dtabs has-ind" ref={tabs} role="tablist" aria-label="词典分页签">
            <i className="ind" />
            {VIEWS.map(([k, name]) => (
              <button
                key={k}
                role="tab"
                aria-selected={d.filters.view === k}
                className={d.filters.view === k ? 'on' : ''}
                onClick={() => d.filters.view !== k && setF({ view: k })}
              >
                {name}
                <span className="dict-n">{d.counts[k].toLocaleString('en-US')}</span>
              </button>
            ))}
          </span>
        </div>
      </div>
      <div
        className="scroll dscroll"
        ref={scroll}
        data-sb-top=".dhead"
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop;
          setView((v) => (v.top === top ? v : { ...v, top }));
        }}
      >
        <div className="dtbl">
          <div className="drow dhead">
            <div>
              <button
                className="dx-check"
                role="checkbox"
                aria-checked={head === 'on' ? true : head === 'some' ? 'mixed' : false}
                aria-label="全选当前分页签"
                data-tip="全选当前分页签"
                disabled={!d.items.length}
                onClick={() => d.setSelected(head === 'on' ? [] : d.items.map((t) => t.tag))}
              >
                <CheckMark state={head} />
              </button>
            </div>
            <div>Tag</div>
            <div>译文</div>
            <div>分类</div>
            <div className="num">图片数</div>
            <div>来源</div>
            <div />
          </div>
          <Swap k={String(gen.current.n)}>
            <div className="dbody">
              {d.items.length ? (
                <>
                  {start > 0 && <div style={{ height: start * view.row }} aria-hidden="true" />}
                  {d.items.slice(start, end).map(row)}
                  {end < d.items.length && (
                    <div style={{ height: (d.items.length - end) * view.row }} aria-hidden="true" />
                  )}
                </>
              ) : d.loading ? null : q ? (
                <div className="empty">
                  <h3>没有找到匹配的 Tag</h3>
                  <p>Tag 和译文中都不包含“{q}”。</p>
                  <div className="acts">
                    <button className="btn" onClick={() => setF({ query: '' })}>
                      清除搜索
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty">
                  <h3>{d.filters.category ? '此分类下暂无 Tag' : EMPTY[d.filters.view]}</h3>
                </div>
              )}
            </div>
          </Swap>
        </div>
        <div className="dict-more muted">
          {d.loading
            ? '正在读取…'
            : d.items.length
              ? `共 ${d.items.length.toLocaleString('en-US')} 项`
              : ''}
        </div>
        {d.error && (
          <div className="banner danger set-banner dict-err">
            <Icon name="error-warning-line" />
            <span className="selectable">{d.error}</span>
          </div>
        )}
      </div>
      <div className="dict-sel">
        <Presence show={d.selected.length > 0}>
          {(leaving) => (
            <span
              className={`selbar ${leaving ? 'leaving' : ''}`}
              data-enter="up"
              role="group"
              aria-label="词典多选操作"
            >
              <span className="n">已选 {d.selected.length} 项</span>
              {d.running ? (
                <>
                  <span className="help dx-prog">
                    正在翻译 {d.progress?.completed || 0} / {d.progress?.total || 0}
                  </span>
                  <button className="btn quiet sm" onClick={d.cancel}>
                    停止
                  </button>
                </>
              ) : (
                <>
                  <button
                    ref={bulkBtn}
                    className={`btn quiet sm ${bulkCat ? 'is-hover' : ''}`}
                    disabled={d.busy}
                    onClick={() => setBulkCat(!bulkCat)}
                  >
                    设置分类
                    <Icon name="arrow-down-s-line" />
                  </button>
                  <button
                    className="btn quiet sm"
                    disabled={d.busy || !d.aiReady}
                    data-tip={!d.aiReady ? '先在“AI 服务”里配置' : undefined}
                    onClick={() => void retranslate()}
                  >
                    用 AI 重新翻译
                  </button>
                  <span className="sep" />
                  <button
                    className="btn danger sm"
                    disabled={d.busy}
                    onClick={() => void remove(d.selected)}
                  >
                    删除
                  </button>
                  <button className="btn quiet sm" onClick={() => d.setSelected([])}>
                    取消
                  </button>
                </>
              )}
            </span>
          )}
        </Presence>
      </div>
      <MenuPop
        open={bulkCat && d.selected.length > 0 && !d.running}
        onClose={() => setBulkCat(false)}
        anchor={bulkBtn}
        place="above-left"
        className="lsp"
        items={catItems(null, async (c) => {
          const n = d.selected.length;
          if (await d.categorize(c))
            notify({ text: `已将 ${n} 项设为“${CAT_NAME[c]}”`, tone: 'success' });
        })}
      />
      <MenuPop
        open={!!catItem}
        onClose={() => setCat(null)}
        anchor={catAnchor}
        place="below-left"
        className="lsp"
        items={
          menuCat
            ? catItems(menuCat.category || 'Unsorted', (c) => {
                if (c !== (menuCat.category || 'Unsorted'))
                  void d.save(menuCat.tag, { category: c });
              })
            : []
        }
      />
      <MenuPop
        open={!!moreItem && !more?.at}
        onClose={() => setMore(null)}
        anchor={moreAnchor}
        place="below-right"
        className="lsp"
        items={lastMore.current && !lastMore.current.at ? menuMore : []}
      />
      <ContextMenu
        at={moreItem && more?.at ? more.at : null}
        onClose={() => setMore(null)}
        className="lsp"
        items={lastMore.current?.at ? menuMore : []}
      />
      {dialog}
    </div>
  );
}
