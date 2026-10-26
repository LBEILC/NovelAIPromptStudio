// 挑图（doc/design.md 2.47，1.8.6）：批量生成以后挑出要的、清掉不要的。做在大图里，不另开页面。
// 这一版的图和图片库一样按比例排成行（行高可调）；每张三种标记：保留、不要、未定。空格或 1 保留，X 或 Delete 不要，0 取消标记，
// 标完自动跳到下一张；Ctrl / Shift 点多选后一起标。Enter 或双击用普通大图看单张（盖在挑图上面，关掉回到网格），
// 大图里照样能标。底部"把不要的 N 张移入回收站"（可勾"未定的也一起"），移完通知带撤销。
// 标记不存进图片，按版本记在内存里：退出挑图再打开还在（用户 10-26：点错关闭，挑了一半的都没了）。
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Presence, ms } from '../kit/motion';
import { Viewer } from '../kit/Viewer';
import { adjacentRowIndex, layoutLibraryRows } from '../library/layout';
import { ToWin, useDismiss } from '../kit/layer';
import { Icon, Slider, Switch } from '../kit/controls';
import { markLoaded } from '../kit/alpha';
import { useNotifications } from '../kit/toast';
import { invokeUI } from '../lib/commands';
import { BlurImg, type BlurImage } from '../kit/blur';
import type { WorkVersion } from '../shared/generation';
import type { ImageRecord } from '../shared/types';
import { randomSummary } from './RandomBlock';

type Request = { tabId: string; versionId: string } | null;
let request: Request = null;
const listeners = new Set<() => void>();
const set = (r: Request) => {
  request = r;
  listeners.forEach((f) => f());
};
export const openPick = (tabId: string, versionId: string) => set({ tabId, versionId });
const useRequest = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => request,
  );

type Mark = 'keep' | 'drop';
/** 每一版挑到哪了：退出挑图不丢，软件重启才清 */
const savedMarks = new Map<string, Map<string, Mark>>();
interface Item {
  id: string;
  path: string;
  thumb: string;
  image: BlurImage;
  seed?: string;
  /** 随机块抽到了什么（2.44），悬停显示 */
  random?: string;
  /** 宽高比，按比例排行用 */
  ratio: number;
}
const SIZE_KEY = 'nps.pick.size';
const readSize = () => {
  try {
    const v = Number(localStorage.getItem(SIZE_KEY));
    return v >= 96 && v <= 360 ? v : 180;
  } catch {
    return 180;
  }
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 挂在工作台舞台上；只响应这个标签页的请求 */
export function PickHost({ tabId, onChanged }: { tabId: string; onChanged?: () => void }) {
  const r = useRequest();
  const mine = r && r.tabId === tabId ? r : null;
  const [data, setData] = useState<{ version: WorkVersion; items: Item[] } | null>(null);
  useEffect(() => {
    if (!mine) return;
    setData(null);
    let live = true;
    void invokeUI('version.list', { tabId }).then(async (list) => {
      const version = list.versions.find((v) => v.id === mine.versionId);
      if (!version) return set(null);
      const shown = version.images.filter((i) => !i.deleted);
      const ids = shown.map((i) => i.projectId);
      const recs = await Promise.all(
        ids.map((id) =>
          invokeUI('library.get', { id })
            .then((x) => x.project as ImageRecord | null)
            .catch(() => null),
        ),
      );
      if (!live) return;
      setData({
        version,
        items: ids.flatMap((id, i) =>
          recs[i]
            ? [
                {
                  id,
                  path: recs[i]!.image_path,
                  thumb: recs[i]!.thumbnail_path || recs[i]!.image_path,
                  image: recs[i]!,
                  seed: recs[i]!.metadata?.seed,
                  random: randomSummary(shown[i].random),
                  ratio:
                    Number(recs[i]!.metadata?.width) / Number(recs[i]!.metadata?.height) ||
                    832 / 1216,
                },
              ]
            : [],
        ),
      });
    });
    return () => {
      live = false;
    };
  }, [mine]);
  const open = !!mine && !!data;
  const last = useRef(data);
  if (open) last.current = data;
  return (
    <Presence show={open}>
      {(leaving, ref) =>
        last.current && (
          <ToWin>
            <Body
              tabId={tabId}
              data={open ? data! : last.current}
              leaving={leaving}
              nodeRef={ref}
              onClose={() => set(null)}
              onTrashed={(ids) => {
                onChanged?.();
                setData((d) => d && { ...d, items: d.items.filter((x) => !ids.includes(x.id)) });
              }}
            />
          </ToWin>
        )
      }
    </Presence>
  );
}

function Body({
  tabId,
  data,
  leaving,
  nodeRef,
  onClose,
  onTrashed,
}: {
  tabId: string;
  data: { version: WorkVersion; items: Item[] };
  leaving: boolean;
  nodeRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onTrashed: (ids: string[]) => void;
}) {
  const notify = useNotifications();
  const ov = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(readSize);
  const [marks, setMarks] = useState<Map<string, Mark>>(
    () => new Map(savedMarks.get(data.version.id)),
  );
  useEffect(() => {
    if (marks.size) savedMarks.set(data.version.id, marks);
    else savedMarks.delete(data.version.id);
  }, [marks, data.version.id]);
  const [focus, setFocus] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [single, setSingle] = useState(false);
  const [withUnsure, setWithUnsure] = useState(false);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    nodeRef.current = ov.current;
  });
  const items = data.items;
  const n = items.length;
  const cur = items[clamp(focus, 0, Math.max(0, n - 1))];
  // 单张大图是盖在上面的另一层：Esc 先关它（回到网格），再按一次才退出挑图
  useDismiss(!leaving, onClose, [ov], { modal: true });
  // 按比例排成行（同图片库，2.13）：宽度跟着窗口变
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const g = grid.current;
    if (!g) return;
    const fit = () => {
      const cs = getComputedStyle(g);
      setWidth(g.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(g);
    return () => ro.disconnect();
  }, []);
  const gap = ms('--thumb-gap') || 14;
  const rows = useMemo(
    () =>
      layoutLibraryRows(
        items.map((x) => x.ratio),
        width,
        size,
        gap,
        ms('--thumb-ratio-min') || 0.5,
        ms('--thumb-ratio-max') || 2.5,
      ),
    [items, width, size, gap],
  );
  useEffect(() => {
    try {
      localStorage.setItem(SIZE_KEY, String(size));
    } catch {
      /* 记不住格子大小不影响挑图 */
    }
  }, [size]);
  // 焦点那一格滚进可见范围
  useEffect(() => {
    grid.current
      ?.querySelector<HTMLElement>(`[data-pick-index="${focus}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [focus, single]);
  const mark = (m: Mark | null, ids: string[]) =>
    setMarks((cur) => {
      const next = new Map(cur);
      for (const id of ids) {
        if (m) next.set(id, m);
        else next.delete(id);
      }
      return next;
    });
  const apply = (m: Mark | null) => {
    if (!cur) return;
    if (sel.size) {
      mark(m, [...sel]);
      setSel(new Set());
      return;
    }
    mark(m, [cur.id]);
    // 标完跳到下一张
    if (m) setFocus((f) => Math.min(n - 1, f + 1));
  };
  useEffect(() => {
    if (leaving) return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as Element)?.closest?.('input, textarea')) return;
      const step = (d: number) => {
        e.preventDefault();
        e.stopPropagation();
        setFocus((f) => clamp(f + d, 0, n - 1));
      };
      const row = (d: 1 | -1) => {
        e.preventDefault();
        e.stopPropagation();
        setFocus((f) => adjacentRowIndex(rows, f, d, gap));
      };
      // 大图开着时 ← → 由大图自己换（换完告诉这里）
      if (!single) {
        if (e.key === 'ArrowRight') return step(1);
        if (e.key === 'ArrowLeft') return step(-1);
        if (e.key === 'ArrowDown') return row(1);
        if (e.key === 'ArrowUp') return row(-1);
      }
      if (e.key === ' ' || e.key === '1') {
        e.preventDefault();
        return apply('keep');
      }
      if (e.key === 'x' || e.key === 'X' || e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        return apply('drop');
      }
      if (e.key === '0') return apply(null);
      if (e.key === 'Enter') {
        e.preventDefault();
        return setSingle((s) => !s);
      }
      if (!single && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSel(new Set(items.map((x) => x.id)));
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  });
  const click = (i: number, e: React.MouseEvent) => {
    const id = items[i].id;
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      setSel(new Set([...sel, ...items.slice(a, b + 1).map((x) => x.id)]));
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSel(next);
      setAnchor(i);
    } else {
      setSel(new Set());
      setAnchor(i);
    }
    setFocus(i);
  };
  const keep = items.filter((x) => marks.get(x.id) === 'keep').length;
  const drop = items.filter((x) => marks.get(x.id) === 'drop').length;
  const unsure = n - keep - drop;
  const targets = items.filter(
    (x) => marks.get(x.id) === 'drop' || (withUnsure && !marks.has(x.id)),
  );
  const trash = async () => {
    if (!targets.length || busy) return;
    setBusy(true);
    const ids = targets.map((x) => x.id);
    try {
      await invokeUI('library.trash', { ids });
      onTrashed(ids);
      setMarks((m) => {
        const next = new Map(m);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setFocus(0);
      notify({
        text: `已把 ${ids.length} 张移入回收站`,
        action: {
          label: '撤销',
          // 撤销后重新读这一版，放回来的图回到网格（挑图已经关了就不再打开）
          onClick: () =>
            void invokeUI('library.restore', { ids }).then(() => {
              onTrashed([]);
              if (request?.tabId === tabId) set({ ...request });
            }),
        },
      });
      if (ids.length === n) onClose();
    } catch (e) {
      notify({ text: `操作失败：${(e as Error).message}`, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const v = data.version;
  return (
    <div
      ref={ov}
      className={`viewer-ov pick-ov ${leaving ? 'leaving' : ''}`}
      data-enter="fade3"
      role="dialog"
      aria-modal="true"
      aria-label="挑图"
      data-pick=""
    >
      <div className="viewer-bar pick-top">
        <b>挑图</b>
        <span className="muted">
          {v.parentId ? `第 ${v.number} 版` : '原图'} · {n} 张
        </span>
        <span className="pick-size" data-tip="图片大小">
          <Icon name="image-line" />
          <Slider value={size} min={96} max={360} step={4} onChange={setSize} label="图片大小" />
        </span>
        <span className="sp" />
        <span className="help">
          空格 保留 · X 不要 · 0 取消 · Enter 看大图 · Ctrl / Shift 点多选
        </span>
        <button className="btn quiet sm" onClick={onClose}>
          <Icon name="close-line" />
          退出挑图
        </button>
      </div>
      <div
        ref={grid}
        className="pick-grid scroll"
        role="listbox"
        aria-multiselectable="true"
        aria-label="这一版的图"
      >
        {rows.map((r) => (
          <div key={r.start} className="pick-row" style={{ height: r.height }}>
            {r.widths.map((w, k) => {
              const i = r.start + k,
                x = items[i],
                m = marks.get(x.id);
              return (
                <div
                  key={x.id}
                  className={`pick-cell ${m || ''} ${i === focus ? 'focus' : ''} ${sel.has(x.id) ? 'sel' : ''}`}
                  style={{ width: w }}
                  role="option"
                  aria-selected={sel.has(x.id)}
                  data-pick-index={i}
                  data-pick-mark={m || 'none'}
                  data-tip={x.random || undefined}
                  onClick={(e) => click(i, e)}
                  onDoubleClick={() => (setFocus(i), setSingle(true))}
                >
                  <BlurImg
                    image={x.image}
                    path={x.thumb}
                    tab={tabId}
                    eye="sm"
                    className="alpha-bg"
                    alt=""
                    draggable={false}
                    loading="lazy"
                    onLoad={markLoaded}
                  />
                  {m && <span className={`pick-badge ${m}`}>{badge(m)}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <Viewer
        open={single && !leaving}
        items={items.map((x) => ({ id: x.id, path: x.path, image: x.image, tab: tabId }))}
        index={focus}
        onIndex={setFocus}
        onClose={() => setSingle(false)}
        badge={
          cur && (
            <span className={`pick-badge big ${marks.get(cur.id) || ''}`}>
              {badge(marks.get(cur.id))}
            </span>
          )
        }
        actions={
          <>
            <span className="vz-sep" />
            <button className="btn quiet sm" onClick={() => apply('keep')}>
              <Icon name="check-line" />
              保留
            </button>
            <button className="btn quiet sm" onClick={() => apply('drop')}>
              <Icon name="close-line" />
              不要
            </button>
            <span className="help">空格 保留 · X 不要</span>
          </>
        }
      />
      <div className="viewer-bar pick-bar">
        <span className="pick-count mono">
          保留 <b>{keep}</b> · 不要 <b>{drop}</b> · 未定 <b>{unsure}</b>
        </span>
        <span className="sp" />
        <label className="pick-unsure">
          <Switch on={withUnsure} onChange={setWithUnsure} label="未定的也一起" />
          未定的也一起
        </label>
        <button
          className={`btn danger sm ${busy ? 'loading' : ''}`}
          disabled={!targets.length || busy}
          onClick={() => void trash()}
        >
          {busy && <Icon name="loader-4-line" />}
          {targets.length
            ? `把${withUnsure ? '不要和未定' : '不要'}的 ${targets.length} 张移入回收站`
            : '移入回收站'}
        </button>
      </div>
    </div>
  );
}

const badge = (m?: Mark) =>
  m === 'keep' ? (
    <>
      <Icon name="check-line" />
      保留
    </>
  ) : m === 'drop' ? (
    <>
      <Icon name="close-line" />
      不要
    </>
  ) : (
    '未定'
  );
