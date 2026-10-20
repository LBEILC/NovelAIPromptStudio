// 素材（doc/design.md 2.9、2.25）：左边三类（常用块、角色、Vibe），右边一行一项、细线分隔，不做卡片。
// 点一行在原位展开看完整内容，再点收起。行末三张示例小图（多的写"+N"），停在上面弹出大图预览，左右划过去换图。
// 右键或行末"更多"：重命名（就地改）、复制、删除。删除直接删：那一行淡出，通知里可以撤销（几秒后才真的删）。
// 从工作台"存为常用块""存为角色"的通知点"查看"跳过来时，刚存的那一项展开并滚到它。
// Vibe 在 1.3 只列出从图片里读到过的 Vibe（2.25）。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { writeClipboardText } from '../lib/clipboard';
import { mediaUrl } from '../lib/imageStage.js';
import { Icon, Kbd, isMod } from '../kit/controls';
import { Pop } from '../kit/layer';
import { ContextMenu, type MenuEntry } from '../kit/menu';
import { FlipScope, dur, useIndicator } from '../kit/motion';
import { useNotifications } from '../kit/toast';
import { MaterialContent } from '../workbench/Insert';
import { Swap } from '../settings/parts';
import type { Material } from '../shared/materials';

type Kind = 'block' | 'character' | 'vibe';
type Vibe = {
  id: string;
  name: string;
  sources: { id: string; name: string; thumbnail: string }[];
};
const TABS: [Kind, string, string][] = [
  ['block', '常用块', 'stack-line'],
  ['character', '角色', 'user-3-line'],
  ['vibe', 'Vibe', 'palette-line'],
];
const NOUN: Record<Kind, string> = { block: '常用块', character: '角色', vibe: 'Vibe' };
// 名词前后接中文时，英文名词两边留空格（"搜索 Vibe 的名称"）
const sp = (n: string) => (/^[A-Za-z]/.test(n) ? ` ${n} ` : n);
const ROW = 3;
type Part = 'self' | 'negative' | number;
const UNDO_MS = 5000;

// ---------- 示例图片：按图片 id 读缩略图和名称，读过的记下来 ----------
type Example = { id: string; thumb: string; image: string; name: string; file: string };
const exampleCache = new Map<string, Promise<Example | null>>();
function loadExample(id: string) {
  let p = exampleCache.get(id);
  if (!p) {
    p = invokeUI('library.get', { id })
      .then(({ project }) =>
        project.deleted_at
          ? null
          : {
              id,
              thumb: mediaUrl(project.thumbnail_path || project.image_path),
              image: mediaUrl(project.image_path),
              name: project.name || '',
              file: project.image_path.split(/[\\/]/).pop() || '',
            },
      )
      .catch(() => null);
    exampleCache.set(id, p);
  }
  return p;
}
function useExamples(ids: string[]) {
  const [list, setList] = useState<Example[]>([]);
  const key = ids.join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(ids.map(loadExample)).then(
      (rows) => live && setList(rows.filter((x): x is Example => !!x)),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return list;
}

const contentText = (m: Material) =>
  [...m.blocks, ...(m.negativeBlocks || [])].map((b) => b.content).join('\n\n');
const preview = (m: Material) => {
  const b = m.blocks[0];
  if (!b) return <span className="muted">没有块</span>;
  return b.type === 'tags' ? (
    <span className="mono">{b.content}</span>
  ) : (
    <span className="prose-pre">{b.content}</span>
  );
};
const typeText = (m: Material) => {
  if (m.kind === 'character') {
    const neg = (m.negativeBlocks || []).reduce(
      (n, b) => n + (b.type === 'tags' ? b.tags.length : 0),
      0,
    );
    return `${m.blocks.length} 块${neg ? ` · 负面 ${neg} 个 Tag` : ''}`;
  }
  const b = m.blocks[0];
  return b?.type === 'tags' ? `Tag 块 · ${b.tags.length} 个` : '段落';
};

export function MaterialsPage({
  target,
  onShowImage,
}: {
  /** 要看的那一类，以及要展开的那一项（从工作台跳过来时） */
  target?: { kind: string; id?: string; n: number };
  onShowImage?: (id: string) => void;
}) {
  const notify = useNotifications();
  const [items, setItems] = useState<Material[]>([]);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState<Kind>('block');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState('');
  const [rename, setRename] = useState<{ id: string; text: string } | null>(null);
  const [fading, setFading] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ at: [number, number]; id: string } | null>(null);
  const [peek, setPeek] = useState<{ id: string; i: number } | null>(null);
  const side = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const deletes = useRef(new Map<string, number>());
  const scrollTo = useRef('');
  useIndicator(side, [kind]);

  const reload = async () => {
    const [m, v] = await Promise.all([
      invokeUI('material.list', {}),
      invokeUI('material.vibes', {}),
    ]);
    setItems(m.items);
    setVibes(v.items);
    setLoaded(true);
  };
  useEffect(() => {
    void reload().catch((e) => notify({ text: (e as Error).message, tone: 'error' }));
  }, []);
  // 每次回到这一页都重新读一遍（工作台里可能刚存了新的）
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) void reload().catch(() => {});
      else {
        setPeek(null);
        setMenu(null);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!target) return;
    const k = (['block', 'character', 'vibe'] as Kind[]).includes(target.kind as Kind)
      ? (target.kind as Kind)
      : 'block';
    setKind(k);
    setQ('');
    setRename(null);
    if (target.id) {
      setOpen(target.id);
      scrollTo.current = target.id;
    }
  }, [target?.n]);
  useLayoutEffect(() => {
    const id = scrollTo.current;
    if (!id) return;
    const row = list.current?.querySelector(`[data-mat="${CSS.escape(id)}"]`);
    if (!row) return;
    scrollTo.current = '';
    row.scrollIntoView({ block: 'nearest', behavior: dur(1) ? 'smooth' : 'auto' });
  });

  const query = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      kind === 'vibe'
        ? vibes.filter(
            (v) =>
              !query ||
              `${v.name} ${v.sources.map((s) => s.name).join(' ')}`.toLowerCase().includes(query),
          )
        : items.filter(
            (m) =>
              m.kind === kind &&
              !hidden.includes(m.id) &&
              (!query || `${m.name}\n${contentText(m)}`.toLowerCase().includes(query)),
          ),
    [items, vibes, kind, query, hidden],
  );
  // 换一批（切换分类、搜索）：结果真的变了才整块换内容
  const gen = useRef({ n: 0, key: '', sig: '' });
  const sig = shown.map((x) => x.id).join(',');
  const batch = `${kind}|${query}`;
  if (gen.current.key !== batch) {
    if (gen.current.sig !== `${kind}:${sig}`) gen.current.n++;
    gen.current.key = batch;
  }
  gen.current.sig = `${kind}:${sig}`;

  const count = (k: Kind) =>
    k === 'vibe'
      ? vibes.length
      : items.filter((m) => m.kind === k && !hidden.includes(m.id)).length;
  const switchTo = (k: Kind) => {
    if (k === kind) return;
    setKind(k);
    setOpen('');
    setRename(null);
  };

  // Ctrl K 聚焦搜索
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!root.current?.getClientRects().length) return;
      if (isMod(e) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        search.current?.focus();
        search.current?.select();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const commitRename = async (save: boolean) => {
    const r = rename;
    setRename(null);
    if (!r || !save) return;
    const name = r.text.trim();
    const m = items.find((x) => x.id === r.id);
    if (!m || !name || name === m.name) return;
    setItems((all) => all.map((x) => (x.id === r.id ? { ...x, name } : x)));
    try {
      await invokeUI('material.rename', { id: r.id, name });
    } catch (e) {
      notify({ text: `重命名失败：${(e as Error).message}`, tone: 'error' });
      void reload();
    }
  };
  const copy = (m: Material) =>
    void writeClipboardText(contentText(m)).then(
      () => notify({ text: `已复制“${m.name}”`, tone: 'success' }),
      (e) => notify({ text: `复制失败：${(e as Error).message}`, tone: 'error' }),
    );
  // 编辑内容：保存是原地改（用过次数不变）；另存为新的放在原来那份下面并展开
  const saveEdit = async (m: Material, part: Part, text: string, asNew: boolean) => {
    try {
      const { item } = await invokeUI('material.update', {
        id: m.id,
        text,
        ...(part === 'negative'
          ? { negative: true }
          : typeof part === 'number'
            ? { block: part }
            : {}),
        ...(asNew ? { asNew: true } : {}),
      });
      if (asNew) {
        setItems((all) => {
          const next = [...all];
          next.splice(next.findIndex((x) => x.id === m.id) + 1, 0, item);
          return next;
        });
        setOpen(item.id);
        scrollTo.current = item.id;
        notify({ text: `已另存为“${item.name}”`, tone: 'success' });
      } else {
        setItems((all) => all.map((x) => (x.id === m.id ? item : x)));
        notify({ text: '已保存', tone: 'success' });
      }
      return true;
    } catch (e) {
      notify({ text: `保存失败：${(e as Error).message}`, tone: 'error' });
      return false;
    }
  };
  // 删除：先淡出，再从列表里拿掉（其他行补位）；通知里可以撤销，几秒后才真的删
  const remove = (m: Material) => {
    if (open === m.id) setOpen('');
    setFading((f) => [...f, m.id]);
    window.setTimeout(() => {
      setFading((f) => f.filter((x) => x !== m.id));
      setHidden((h) => [...h, m.id]);
      const timer = window.setTimeout(() => {
        deletes.current.delete(m.id);
        void invokeUI('material.delete', { id: m.id })
          .then(() => {
            setItems((all) => all.filter((x) => x.id !== m.id));
            setHidden((h) => h.filter((x) => x !== m.id));
          })
          .catch((e) => {
            setHidden((h) => h.filter((x) => x !== m.id));
            notify({ text: `删除失败：${(e as Error).message}`, tone: 'error' });
          });
      }, UNDO_MS);
      deletes.current.set(m.id, timer);
      notify({
        text: `已删除${sp(NOUN[m.kind]).trimEnd()}“${m.name}”`,
        tone: 'success',
        duration: UNDO_MS,
        action: {
          label: '撤销',
          onClick: () => {
            clearTimeout(deletes.current.get(m.id));
            deletes.current.delete(m.id);
            setHidden((h) => h.filter((x) => x !== m.id));
          },
        },
      });
    }, dur(1));
  };
  // 离开软件前把还在等撤销的删掉
  useEffect(() => {
    const flush = () => {
      for (const [id, t] of deletes.current) {
        clearTimeout(t);
        void invokeUI('material.delete', { id });
      }
      deletes.current.clear();
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  const menuItem = menu && items.find((m) => m.id === menu.id);
  const lastMenu = useRef<Material | null>(null);
  if (menuItem) lastMenu.current = menuItem;
  const menuItems = (m: Material | null): MenuEntry[] =>
    m
      ? [
          { label: '重命名', onSelect: () => setRename({ id: m.id, text: m.name }) },
          { label: '复制', onSelect: () => copy(m) },
          'sep',
          { label: '删除', danger: true, onSelect: () => remove(m) },
        ]
      : [];

  // 示例图片的悬停预览：停 400ms 出现，在小图条上左右划动换图（已经出现时立即换），移开 80ms 后收起
  const peekTimer = useRef(0);
  const peekAt = (el: HTMLElement, x: number, n: number) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor(((x - r.left) / r.width) * n)));
  };
  const peekMove = (id: string, n: number) => (e: React.PointerEvent<HTMLElement>) => {
    const next = { id, i: peekAt(e.currentTarget, e.clientX, n) };
    clearTimeout(peekTimer.current);
    if (peek) {
      if (peek.id !== next.id || peek.i !== next.i) setPeek(next);
    } else peekTimer.current = window.setTimeout(() => setPeek(next), 400);
  };
  const peekLeave = () => {
    clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeek(null), 80);
  };
  useEffect(() => {
    if (!peek) return;
    const hide = () => {
      clearTimeout(peekTimer.current);
      setPeek(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [!!peek]);
  const lastPeek = useRef(peek);
  if (peek) lastPeek.current = peek;
  const peekItem = lastPeek.current && items.find((m) => m.id === lastPeek.current!.id);

  const empty = () => {
    const noun = sp(NOUN[kind]).trimEnd();
    if (query)
      return (
        <div className="empty">
          <h3>没有找到匹配的{noun}</h3>
          <p>名称和内容中都不包含“{q.trim()}”。</p>
          <div className="acts">
            <button
              className="btn"
              onClick={() => {
                setQ('');
                search.current?.focus();
              }}
            >
              清除搜索
            </button>
          </div>
        </div>
      );
    return (
      <div className="empty">
        <h3>暂无{noun}</h3>
        <p>
          {
            {
              block: '在工作台中打开块的菜单，选择“存为常用块”，就可以在这里反复使用。',
              character: '在工作台中打开角色的“更多”菜单，选择“存为角色”，就可以在这里反复使用。',
              vibe: '导入带 Vibe 的图片后，用到的 Vibe 会列在这里。',
            }[kind]
          }
        </p>
      </div>
    );
  };

  return (
    <div className="body matp" ref={root}>
      <div className="side has-ind" ref={side} aria-label="素材分类">
        <i className="ind" />
        {TABS.map(([k, name, icon]) => (
          <div
            key={k}
            className={`it ${kind === k ? 'on' : ''}`}
            role="button"
            tabIndex={0}
            aria-current={kind === k ? 'true' : undefined}
            onClick={() => switchTo(k)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && switchTo(k)}
          >
            <Icon name={icon} />
            <span className="nm">{name}</span>
            <span className="n">{loaded ? count(k) : ''}</span>
          </div>
        ))}
      </div>
      <div className="col mat-col">
        <div className="col-h mtools">
          <label className="field grow">
            <Icon name="search-line" />
            <input
              ref={search}
              placeholder={`搜索${sp(NOUN[kind])}的名称${kind === 'vibe' ? '' : '或内容'}`}
              aria-label="搜索素材"
              autoComplete="off"
              spellCheck={false}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && q) {
                  e.stopPropagation();
                  setQ('');
                }
              }}
            />
            {q && (
              <button
                className="btn quiet sm icon lq-x"
                aria-label="清除搜索"
                onClick={() => {
                  setQ('');
                  search.current?.focus();
                }}
              >
                <Icon name="close-line" />
              </button>
            )}
          </label>
        </div>
        <div className="scroll" ref={list}>
          <Swap k={String(gen.current.n)}>
            {!loaded ? null : shown.length ? (
              <>
                <FlipScope root={list}>
                  <div className="mlist">
                    {kind === 'vibe'
                      ? (shown as Vibe[]).map((v) => (
                          <VibeRow
                            key={v.id}
                            v={v}
                            open={open === v.id}
                            onToggle={() => setOpen(open === v.id ? '' : v.id)}
                            onShowImage={onShowImage}
                          />
                        ))
                      : (shown as Material[]).map((m) => (
                          <Row
                            key={m.id}
                            m={m}
                            open={open === m.id}
                            fading={fading.includes(m.id)}
                            menuOpen={menu?.id === m.id}
                            rename={rename?.id === m.id ? rename.text : null}
                            peekIndex={peek?.id === m.id ? peek.i : -1}
                            onToggle={() => {
                              if (rename?.id === m.id) return;
                              setOpen(open === m.id ? '' : m.id);
                            }}
                            onRename={(text) => setRename({ id: m.id, text })}
                            onRenameDone={(save) => void commitRename(save)}
                            onMenu={(at) => setMenu(menu?.id === m.id ? null : { at, id: m.id })}
                            onCopy={() => copy(m)}
                            onSave={(part, text, asNew) => saveEdit(m, part, text, asNew)}
                            onShowImage={onShowImage}
                            onPeekMove={peekMove}
                            onPeekLeave={peekLeave}
                          />
                        ))}
                  </div>
                </FlipScope>
                <div className="label lcount">
                  {shown.length} 个{sp(NOUN[kind]).trimEnd()}
                </div>
              </>
            ) : (
              empty()
            )}
          </Swap>
        </div>
      </div>
      <ContextMenu
        at={menuItem ? menu!.at : null}
        onClose={() => setMenu(null)}
        className="lsp"
        items={menuItems(lastMenu.current)}
      />
      <Pop
        open={!!peek && !!peekItem}
        onClose={() => setPeek(null)}
        anchor={lastPeek.current ? `[data-mexrow="${CSS.escape(lastPeek.current.id)}"]` : undefined}
        place="below-right"
        className="popover tab-peek mex-peek"
        passive
        deps={[lastPeek.current?.id]}
      >
        {peekItem && <PeekCard ids={peekItem.examples} i={lastPeek.current!.i} />}
      </Pop>
    </div>
  );
}

function PeekCard({ ids, i }: { ids: string[]; i: number }) {
  const ex = useExamples(ids);
  if (!ex.length) return null;
  const k = Math.min(i, ex.length - 1);
  const e = ex[k];
  return (
    <>
      <Swap k={e.id} className="tp-img">
        <img src={e.image} alt="" />
      </Swap>
      {e.name ? (
        <b className="tp-name">{e.name}</b>
      ) : (
        <span className="tp-file mono">{e.file}</span>
      )}
      <div className="mex-peek-f">
        <span className="mex-peek-strip">
          {ex.map((y, n) => (
            <img key={y.id} className={n === k ? 'cur' : ''} src={y.thumb} alt="" />
          ))}
        </span>
        <span className="sp" />
        <span className="tp-state mono">
          {k + 1} / {ex.length}
        </span>
      </div>
    </>
  );
}

function Row({
  m,
  open,
  fading,
  menuOpen,
  rename,
  peekIndex,
  onToggle,
  onRename,
  onRenameDone,
  onMenu,
  onCopy,
  onSave,
  onShowImage,
  onPeekMove,
  onPeekLeave,
}: {
  m: Material;
  open: boolean;
  fading: boolean;
  menuOpen: boolean;
  rename: string | null;
  peekIndex: number;
  onToggle: () => void;
  onRename: (text: string) => void;
  onRenameDone: (save: boolean) => void;
  onMenu: (at: [number, number]) => void;
  onCopy: () => void;
  /** 保存编辑：part 是 'self'（常用块本身）、角色的第几块或 'negative'；成功时返回 true */
  onSave: (part: Part, text: string, asNew: boolean) => Promise<boolean>;
  onShowImage?: (id: string) => void;
  onPeekMove: (id: string, n: number) => (e: React.PointerEvent<HTMLElement>) => void;
  onPeekLeave: () => void;
}) {
  const ex = useExamples(m.examples);
  const renaming = rename !== null;
  const [edit, setEdit] = useState<{ part: Part; text: string } | null>(null);
  useEffect(() => {
    if (!open) setEdit(null);
  }, [open]);
  const startEdit = (part: Part) =>
    setEdit({
      part,
      text:
        part === 'negative'
          ? (m.negativeBlocks || []).map((b) => b.content).join(', ')
          : (part === 'self' ? m.blocks[0] : m.blocks[part])?.content || '',
    });
  const editBox = (part: Part, tags: boolean) =>
    edit?.part === part ? (
      <EditBox
        text={edit.text}
        tags={tags}
        noun={NOUN[m.kind]}
        onChange={(text) => setEdit({ part, text })}
        onCancel={() => setEdit(null)}
        onSave={async (asNew) => {
          if (await onSave(part, edit.text.trim(), asNew)) setEdit(null);
        }}
      />
    ) : null;
  const editButton = (part: Part) =>
    edit ? null : (
      <button className="btn quiet sm icon" aria-label="编辑" onClick={() => startEdit(part)}>
        <Icon name="edit-line" />
      </button>
    );
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) {
      input.current?.focus();
      input.current?.select();
    }
  }, [renaming]);
  // 点到改名框以外：保存
  useEffect(() => {
    if (!renaming) return;
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.mrow-rename')) onRenameDone(true);
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [renaming, onRenameDone]);
  return (
    <div
      className={`mrow ${open ? 'open' : ''} ${fading ? 'fading' : ''}`}
      data-key={`mr-${m.id}`}
      data-flip=""
      data-enter="fade"
    >
      <div
        className="mrow-h"
        data-mat={m.id}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onToggle();
          }
        }}
        onContextMenu={(e) => {
          if ((e.target as Element).closest('input')) return;
          e.preventDefault();
          onMenu([e.clientX, e.clientY]);
        }}
      >
        <div className="mrow-main">
          <div className="mrow-t">
            {renaming ? (
              <label className="field sm mrow-rename" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={input}
                  aria-label="名称"
                  placeholder="名称"
                  value={rename}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => onRename(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'Enter') onRenameDone(true);
                    if (e.key === 'Escape') onRenameDone(false);
                  }}
                />
              </label>
            ) : (
              <b className="mrow-name">{m.name}</b>
            )}
            <span className="mtype">{typeText(m)}</span>
          </div>
          <div className="mrow-pre">{preview(m)}</div>
        </div>
        {ex.length > 0 && (
          <span
            className={`mex-row ${peekIndex >= 0 ? 'peeking' : ''}`}
            data-mexrow={m.id}
            onPointerMove={onPeekMove(m.id, ex.length)}
            onPointerLeave={onPeekLeave}
          >
            {ex.slice(0, ROW).map((e, i) => (
              <img
                key={e.id}
                className={i === peekIndex ? 'cur' : ''}
                src={e.thumb}
                alt=""
                draggable={false}
              />
            ))}
            {ex.length > ROW && (
              <span className={`mex-more mono ${peekIndex >= ROW ? 'cur' : ''}`}>
                +{ex.length - ROW}
              </span>
            )}
          </span>
        )}
        <span className="mrow-n">用过 {m.uses} 次</span>
        <button
          className={`btn quiet sm icon mmore ${menuOpen ? 'is-hover' : ''}`}
          aria-label="更多"
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu([r.right, r.bottom + 4]);
          }}
        >
          <Icon name="more-2-line" />
        </button>
      </div>
      <div className={`expand ${open ? 'open' : ''}`}>
        <div>
          <div className="mrow-body">
            {open && (
              <>
                {m.kind === 'character' ? (
                  <>
                    {m.blocks.map((b, i) => (
                      <div className="mat-sub" key={i}>
                        <div className="mat-sub-h">
                          <span className="label">{b.type === 'tags' ? 'Tag 块' : '段落'}</span>
                          {edit?.part !== i && editButton(i)}
                        </div>
                        {editBox(i, b.type === 'tags') || (
                          <MaterialContent m={{ ...m, blocks: [b] }} max={Infinity} />
                        )}
                      </div>
                    ))}
                    <div className="mat-sub">
                      <div className="mat-sub-h">
                        <span className="label">负面提示词</span>
                        {edit?.part !== 'negative' && editButton('negative')}
                      </div>
                      {editBox('negative', true) ||
                        (m.negativeBlocks?.some((b) => b.type !== 'tags' || b.tags.length) ? (
                          <MaterialContent m={{ ...m, blocks: m.negativeBlocks }} max={Infinity} />
                        ) : (
                          <p className="help">没有 Tag</p>
                        ))}
                    </div>
                  </>
                ) : edit?.part === 'self' ? (
                  editBox('self', m.blocks[0]?.type === 'tags')
                ) : (
                  <MaterialContent m={m} max={Infinity} />
                )}
                {edit?.part === 'self' ? null : (
                  <>
                    <div className="mat-sub mat-ex">
                      <div className="mat-ex-h">
                        <span className="label">示例图片</span>
                      </div>
                      {ex.length ? (
                        <div className="mat-ex-list">
                          {ex.map((e) => (
                            <span className="mat-ex-it" key={e.id}>
                              <img
                                src={e.thumb}
                                alt=""
                                draggable={false}
                                data-tip="在图片库中查看"
                                onClick={() => onShowImage?.(e.id)}
                              />
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="help">暂无示例图片。</span>
                      )}
                    </div>
                    <div className="mat-acts">
                      <span className="sp" />
                      <button className="btn quiet sm" onClick={onCopy}>
                        <Icon name="file-copy-line" />
                        复制
                      </button>
                      {m.kind === 'block' && (
                        <button className="btn sm" onClick={() => startEdit('self')}>
                          <Icon name="edit-line" />
                          编辑
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VibeRow({
  v,
  open,
  onToggle,
  onShowImage,
}: {
  v: Vibe;
  open: boolean;
  onToggle: () => void;
  onShowImage?: (id: string) => void;
}) {
  const first = v.sources[0];
  return (
    <div className={`mrow ${open ? 'open' : ''}`} data-key={`mr-${v.id}`} data-flip="">
      <div
        className="mrow-h"
        data-mat={v.id}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {first && (
          <span className="mrow-pic">
            <img src={mediaUrl(first.thumbnail)} alt="" draggable={false} />
          </span>
        )}
        <div className="mrow-main">
          <div className="mrow-t">
            <b className="mrow-name">{v.name}</b>
            <span className="mtype">出自 {v.sources.length} 张图片</span>
          </div>
          <div className="mrow-pre">{v.sources.map((s) => s.name).join('、')}</div>
        </div>
      </div>
      <div className={`expand ${open ? 'open' : ''}`}>
        <div>
          <div className="mrow-body">
            {open && (
              <>
                <span className="help">
                  图片里只保存了 Vibe 的编码，没有参考图本身。下面是用过它的图片。
                </span>
                <div className="mat-ex-list">
                  {v.sources.map((s) => (
                    <span className="mat-ex-it" key={s.id}>
                      <img
                        src={mediaUrl(s.thumbnail)}
                        alt=""
                        draggable={false}
                        data-tip={`${s.name || '图片'} · 在图片库中查看`}
                        onClick={() => onShowImage?.(s.id)}
                      />
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 编辑一块素材（原型 matEditBox）：素材是模板，插进提示词时复制一份，所以改这里只影响以后插入的地方；
 * 想保留原来的可以"另存为新的"。Ctrl Enter 保存，Esc 取消；Tag 写成 1.2::tag:: 带权重。
 */
function EditBox({
  text,
  tags,
  noun,
  onChange,
  onCancel,
  onSave,
}: {
  text: string;
  tags: boolean;
  noun: string;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSave: (asNew: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const ok = !!text.trim();
  const save = async (asNew: boolean) => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await onSave(asNew);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <label className={`field mat-edit ${tags ? 'mono' : ''}`}>
        <textarea
          autoFocus
          rows={tags ? 3 : 4}
          spellCheck={false}
          aria-label="素材内容"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            } else if (e.key === 'Enter' && isMod(e)) {
              e.preventDefault();
              void save(false);
            }
          }}
        />
      </label>
      <span className="help">
        修改只影响以后插入的地方，已经用过的提示词和图片不变。
        {tags ? '' : '保存后译文需要重新生成。'}
      </span>
      <div className="mat-acts">
        <span className="help key-hint">
          <Kbd keys="Mod Enter" />
          <span>保存</span>
          <Kbd keys="Esc" />
          <span>取消</span>
        </span>
        <span className="sp" />
        <button className="btn quiet sm" onClick={onCancel}>
          取消
        </button>
        <button className="btn sm" disabled={!ok || busy} onClick={() => void save(true)}>
          另存为新的{noun}
        </button>
        <button
          className={`btn ink sm ${busy ? 'loading' : ''}`}
          disabled={!ok || busy}
          data-tip={ok ? undefined : '内容不能为空'}
          onClick={() => void save(false)}
        >
          保存
        </button>
      </div>
    </>
  );
}
