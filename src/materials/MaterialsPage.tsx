import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon, isMod } from '../kit/controls';
import { Pop } from '../kit/layer';
import { ContextMenu, type MenuEntry } from '../kit/menu';
import { FlipScope, dur, useIndicator } from '../kit/motion';
import { useNotifications } from '../kit/toast';
import { writeClipboardText } from '../lib/clipboard';
import { invokeUI } from '../lib/commands';
import { Swap } from '../settings/parts';
import type { Material } from '../shared/materials';
import {
  Kind,
  NOUN,
  Part,
  PeekCard,
  Row,
  TABS,
  UNDO_MS,
  Vibe,
  VibeRow,
  contentText,
  sp,
} from './materialRows';

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
