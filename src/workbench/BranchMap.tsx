// 分支总览（用户 11-01）：一块能缩放、平移的画布，把所有分支一次铺开。
// 每条分支一行（从它分出来的那一版起，沿第一个孩子一路往下），同一代的版本对齐在同一列；
// 分支从它分出来的那一版右边的缝里拐进自己那一行，连线不压到别的卡片。
// 按缩放程度显示不同的细节：缩得很小只剩方块看结构；中等每版一张图；放大后是这一版的全部图和改了什么。
// 滚轮缩放（以指针为中心）、拖动平移，和大图一致；点一版切过去，Ctrl / Cmd 点两版对比。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon, Kbd, isMod, modKey } from '../kit/controls';
import { Pop, ToWin, useDismiss } from '../kit/layer';
import { ContextMenu, type MenuEntry } from '../kit/menu';
import { Presence, ms } from '../kit/motion';
import type { VersionDiff } from '../lib/versionDiff';
import type { WorkVersion } from '../shared/generation';
import type { PeekImage } from './useVersionState';
import { VersionDifference, VersionSummary } from './VersionDifference';
import { PeekPicture, Thumb, isRedraw } from './versionHelpers';

type Tree = { byId: Map<string, WorkVersion>; children: Map<string, WorkVersion[]> };
type Props = {
  open: boolean;
  onClose: () => void;
  tab: string;
  versions: WorkVersion[];
  current?: WorkVersion;
  tree: Tree;
  name: (v: WorkVersion) => string;
  /** 一版拿哪张出来代表（没有图时是空的） */
  firstImage: (v: WorkVersion) => string;
  delta: (v: WorkVersion) => VersionDiff;
  /** 右键菜单：和版本栏的版本行一样 */
  menuFor: (v: WorkVersion) => MenuEntry[];
  onGo: (v: WorkVersion, imageId?: string) => void;
  onCompare: (
    a: { v: WorkVersion; imageId: string },
    b: { v: WorkVersion; imageId: string },
  ) => void;
  onPick: (v: WorkVersion) => void;
};

export function BranchMap(p: Props) {
  return (
    <Presence show={p.open}>
      {(leaving, ref) => (
        <ToWin>
          <Canvas {...p} leaving={leaving} nodeRef={ref} />
        </ToWin>
      )}
    </Presence>
  );
}

const MIN_Z = 0.05,
  MAX_Z = 2;
// 缩放到多少换一档细节
const ONE_AT = 0.1,
  FULL_AT = 0.9;
// 卡片里最多放几张（3 列 × 2 行），多的写 +N
const CELLS = 6;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const FOLD_KEY = 'nps:map-folded';
type Peek =
  | { kind: 'img'; v: WorkVersion; img: PeekImage }
  | { kind: 'diff'; v: WorkVersion; at: [number, number] };

function Canvas({
  onClose,
  tab,
  versions,
  current,
  tree,
  name,
  firstImage,
  delta,
  menuFor,
  onGo,
  onCompare,
  onPick,
  leaving,
  nodeRef,
}: Props & { leaving: boolean; nodeRef: React.RefObject<HTMLElement | null> }) {
  const ov = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    nodeRef.current = ov.current;
  });
  useDismiss(!leaving, onClose, [ov], { modal: true });
  const kids = (id: string) => tree.children.get(id) || [];
  // 收起了哪些分支下面再分出去的分支（按那一行第一版记）
  const [folded, setFolded] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });
  const toggleFold = (id: string) => {
    const next = new Set(folded);
    if (!next.delete(id)) next.add(id);
    setFolded(next);
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify([...next].slice(-2000)));
    } catch {
      // 存不了就只在这次有效
    }
  };
  // 分成一行一行：根那条线是第一行；每一版除第一个孩子以外的孩子各起一行，紧跟在它上面那行后面
  const layout = useMemo(() => {
    type Lane = { versions: WorkVersion[]; hidden: number; subs: number };
    const lanes: Lane[] = [];
    const col = new Map<string, number>();
    const laneOf = new Map<string, number>();
    const chain = (start: WorkVersion) => {
      const out: WorkVersion[] = [];
      for (let x: WorkVersion | undefined = start; x; x = kids(x.id)[0]) out.push(x);
      return out;
    };
    // 一行下面一共分出去多少行（收起时写"N 支"）
    const below = (lane: WorkVersion[]): number =>
      lane.reduce(
        (n, x) =>
          n +
          kids(x.id)
            .slice(1)
            .reduce((m, c) => m + 1 + below(chain(c)), 0),
        0,
      );
    const add = (start: WorkVersion, c: number) => {
      const lane = chain(start);
      const me = lanes.length;
      lane.forEach((x, k) => {
        col.set(x.id, c + k);
        laneOf.set(x.id, me);
      });
      const subs = lane.reduce((n, x) => n + Math.max(0, kids(x.id).length - 1), 0);
      const hidden = folded.has(start.id) ? below(lane) : 0;
      lanes.push({ versions: lane, hidden, subs });
      if (hidden) return;
      for (const x of lane) for (const other of kids(x.id).slice(1)) add(other, col.get(x.id)! + 1);
    };
    const root = versions.find((v) => !v.parentId);
    if (root) add(root, 0);
    return { lanes, col, laneOf };
  }, [versions, tree, folded]);
  const { lanes, col, laneOf } = layout;
  // 当前这一版往上一路到根：这条线上的连线深一档
  const onLine = useMemo(() => {
    const ids = new Set<string>();
    for (let x = current; x; x = x.parentId ? tree.byId.get(x.parentId) : undefined) ids.add(x.id);
    return ids;
  }, [current, tree]);
  const W = ms('--map-card-w') || 240,
    H = ms('--map-card-h') || 232,
    GAP_X = ms('--sp-8') || 32,
    GAP_Y = (ms('--sp-8') || 32) + (ms('--sp-4') || 16);
  const PITCH = W + GAP_X,
    LANE = H + GAP_Y;
  const cardX = (v: WorkVersion) => (col.get(v.id) ?? 0) * PITCH;
  const laneY = (li: number) => li * LANE;
  const cols = Math.max(1, ...[...col.values()].map((c) => c + 1));
  const worldW = cols * PITCH - GAP_X,
    worldH = Math.max(1, lanes.length) * LANE - GAP_Y;
  // 连线的高度：对着卡片里第一排图的中间
  const midY = (li: number) => laneY(li) + H * 0.4;
  // ---------- 视图：缩放和平移 ----------
  const [view, setView] = useState({ z: 0.5, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const edge = () => ms('--sp-8') || 32;
  const fitZ = () => Math.min((size.w - 2 * edge()) / worldW, (size.h - 2 * edge()) / worldH, 1);
  const fitView = () => {
    const z = clamp(fitZ(), MIN_Z, MAX_Z);
    setView({ z, x: (size.w - worldW * z) / 2, y: (size.h - worldH * z) / 2 });
  };
  const centerOn = (v: WorkVersion, z = Math.max(view.z, 0.5)) => {
    const li = laneOf.get(v.id) ?? 0;
    setView({
      z,
      x: size.w / 2 - (cardX(v) + W / 2) * z,
      y: size.h / 2 - (laneY(li) + H / 2) * z,
    });
  };
  // 打开时：整个装得下、又不至于太小就全部显示；不然以当前这一版为中心
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current || !size.w) return;
    opened.current = true;
    if (fitZ() >= 0.4 || !current) fitView();
    else centerOn(current, 0.5);
  }, [size.w]);
  const zoomAt = (z: number, px: number, py: number) =>
    setView((v) => {
      const nz = clamp(z, MIN_Z, MAX_Z),
        k = nz / v.z;
      return { z: nz, x: px - k * (px - v.x), y: py - k * (py - v.y) };
    });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const nz = clamp(v.z * Math.exp(-e.deltaY * 0.0015), MIN_Z, MAX_Z),
          k = nz / v.z,
          px = e.clientX - r.left,
          py = e.clientY - r.top;
        return { z: nz, x: px - k * (px - v.x), y: py - k * (py - v.y) };
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  // ---------- 悬停：图上看大图，卡片别处看对比（和版本栏一样） ----------
  const [peek, setPeek] = useState<Peek | null>(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  // 拖动平移：在哪里按下都能拖（卡片上也行），挪了几像素以上就不算点击
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(
    null,
  );
  const moved = useRef(false);
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    moved.current = false;
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      if (!d.moved) {
        d.moved = moved.current = true;
        clearTimeout(timer.current);
        setPeek(null);
        stage.current?.classList.add('panning');
      }
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    };
    const up = () => {
      drag.current = null;
      stage.current?.classList.remove('panning');
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    return () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
  }, []);
  const level = view.z < ONE_AT ? 'dot' : view.z < FULL_AT ? 'one' : 'full';
  const showPeek = (next: Peek, delay: number) => {
    if (drag.current?.moved) return;
    clearTimeout(timer.current);
    if (peek) return setPeek(next);
    timer.current = window.setTimeout(() => setPeek(next), delay);
  };
  const hidePeek = () => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPeek(null), 120);
  };
  const rightOf = (el: Element): [number, number] => {
    const r = el.getBoundingClientRect();
    return [r.right + 8, r.top];
  };
  const imgLabel = (v: WorkVersion, id: string) => {
    if (id === v.project.id) return { label: `${v.branchName} · 原图` };
    const list = v.images.filter((i) => !i.deleted);
    const k = list.findIndex((i) => i.projectId === id);
    return {
      label: `${v.branchName} · ${name(v)} · 第 ${k + 1} 张${list[k]?.seed ? ` · Seed ${list[k].seed}` : ''}`,
    };
  };
  // ---------- 搜索：含这段文字的版本亮着，别的变淡 ----------
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!q) return [] as WorkVersion[];
    const textOf = (v: WorkVersion) => {
      const s = v.project.prompt_structure;
      return [
        s?.base_prompt_raw || v.project.metadata?.prompt_raw || '',
        ...(s?.characters || []).map((c) => c.prompt_raw),
      ]
        .join('\n')
        .toLowerCase();
    };
    return lanes.flatMap((l) => l.versions).filter((v) => textOf(v).includes(q));
  }, [q, lanes]);
  const hitSet = useMemo(() => new Set(hits.map((v) => v.id)), [hits]);
  const [hitAt, setHitAt] = useState(-1);
  const nextHit = (d: number) => {
    if (!hits.length) return;
    const i = (hitAt + d + hits.length) % hits.length;
    setHitAt(i);
    centerOn(hits[i]);
  };
  // ---------- 点一版切过去；Ctrl / Cmd 点两版对比 ----------
  const [mark, setMark] = useState<WorkVersion | null>(null);
  const [menu, setMenu] = useState<{ at: [number, number]; items: MenuEntry[] } | null>(null);
  const click = (e: React.MouseEvent, v: WorkVersion, imageId?: string) => {
    if (moved.current) return;
    const id = imageId || firstImage(v);
    if (isMod(e)) {
      if (!id) return;
      if (mark && mark.id !== v.id) {
        const a = { v: mark, imageId: firstImage(mark) };
        setMark(null);
        onCompare(a, { v, imageId: id });
      } else setMark(mark?.id === v.id ? null : v);
      return;
    }
    onGo(v, id || undefined);
  };
  const count = (v: WorkVersion) =>
    v.images.filter((i) => !i.deleted).length + (firstImage(v) === v.project.id ? 1 : 0);
  const total = versions.reduce((n, v) => n + count(v), 0);
  // ---------- 连线 ----------
  const lines: { d: string; on: boolean }[] = [];
  lanes.forEach((lane, li) => {
    const vs = lane.versions;
    for (let i = 1; i < vs.length; i++)
      lines.push({
        d: `M${cardX(vs[i - 1]) + W} ${midY(li)}H${cardX(vs[i])}`,
        on: onLine.has(vs[i].id),
      });
    const first = vs[0];
    const parent = first.parentId ? tree.byId.get(first.parentId) : undefined;
    if (!parent || !laneOf.has(parent.id)) return;
    const x = cardX(first) - GAP_X / 2;
    lines.push({
      d: `M${cardX(parent) + W} ${midY(laneOf.get(parent.id)!)}H${x}V${midY(li)}H${cardX(first)}`,
      on: onLine.has(first.id),
    });
  });
  // ---------- 卡片：只画看得见的 ----------
  const margin = 200;
  const vis = {
    x0: (-view.x - margin) / view.z,
    y0: (-view.y - margin) / view.z,
    x1: (size.w - view.x + margin) / view.z,
    y1: (size.h - view.y + margin) / view.z,
  };
  const seen = (x: number, y: number) =>
    x + W >= vis.x0 && x <= vis.x1 && y + H >= vis.y0 && y <= vis.y1;
  const thumbOf = (v: WorkVersion, id: string) =>
    id === v.project.id ? (
      <Thumb
        id={id}
        path={v.project.thumbnail_path || v.project.image_path}
        image={v.project}
        tab={tab}
      />
    ) : (
      <Thumb id={id} tab={tab} />
    );
  const imagesOf = (v: WorkVersion) => [
    ...(firstImage(v) === v.project.id ? [v.project.id] : []),
    ...v.images.filter((i) => !i.deleted).map((i) => i.projectId),
  ];
  const card = (v: WorkVersion, li: number) => {
    const x = cardX(v),
      y = laneY(li);
    if (!seen(x, y)) return null;
    const n = count(v),
      id = firstImage(v),
      on = v.id === current?.id;
    const cls = `map-card ${level} ${view.z < 0.28 ? 'tiny' : ''} ${on ? 'on' : ''} ${mark?.id === v.id ? 'marked' : ''} ${q && !hitSet.has(v.id) ? 'dim' : ''}`;
    const common = {
      className: cls,
      'data-map': v.id,
      style: { left: x, top: y, width: W, height: H } as React.CSSProperties,
      onClick: (e: React.MouseEvent) => click(e, v),
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        clearTimeout(timer.current);
        setPeek(null);
        setMenu({ at: [e.clientX, e.clientY], items: menuFor(v) });
      },
    };
    if (level === 'dot')
      return <div key={v.id} {...common} data-tip={`${v.branchName} · ${name(v)} · ${n} 张`} />;
    const enterImg = (e: React.PointerEvent<HTMLElement>, img: string) => {
      e.stopPropagation();
      showPeek(
        {
          kind: 'img',
          v,
          img: {
            id: img,
            ...(img === v.project.id ? { path: v.project.image_path, image: v.project } : {}),
            ...imgLabel(v, img),
            at: rightOf(e.currentTarget.closest('.map-card') || e.currentTarget),
          },
        },
        250,
      );
    };
    const enterCard = (e: React.PointerEvent<HTMLElement>) => {
      const el = e.currentTarget.closest('.map-card');
      if (v.parentId && el) showPeek({ kind: 'diff', v, at: rightOf(el) }, 400);
    };
    if (level === 'one')
      return (
        <div key={v.id} {...common} onPointerEnter={enterCard} onPointerLeave={hidePeek}>
          <span
            className="map-pic"
            onPointerEnter={(e) => id && enterImg(e, id)}
            onPointerLeave={enterCard}
          >
            {id ? thumbOf(v, id) : <span className="map-none">{name(v)}</span>}
          </span>
          <span className="map-cap">
            <span>{name(v)}</span>
            {n > 1 && <span className="muted mono">×{n}</span>}
          </span>
        </div>
      );
    const all = imagesOf(v),
      shown = all.slice(0, CELLS),
      more = all.length - shown.length;
    return (
      <div key={v.id} {...common} onPointerEnter={enterCard} onPointerLeave={hidePeek}>
        <span className="map-h">
          <b>{name(v)}</b>
          {v.source === 'agent' && <span className="src">Agent</span>}
          <span className="sp" />
          <span className="muted">{n} 张</span>
        </span>
        <span
          className="map-pics"
          // 按张数排：1 张占满，2 张两列，3 张以上三列
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, shown.length))}, 1fr)`,
            gridTemplateRows: `repeat(${Math.max(1, Math.ceil(shown.length / 3))}, 1fr)`,
          }}
          onPointerLeave={enterCard}
        >
          {shown.map((img, k) => {
            const last = more > 0 && k === shown.length - 1;
            return (
              <span
                key={img}
                className="map-cell"
                onPointerEnter={(e) => enterImg(e, img)}
                onClick={(e) => {
                  e.stopPropagation();
                  // 最后一格写 +N：这一版的图多，打开挑图铺开来看
                  if (last) return moved.current || onPick(v);
                  click(e, v, img);
                }}
              >
                {thumbOf(v, img)}
                {last && <span className="map-more mono">+{more + 1}</span>}
              </span>
            );
          })}
          {!shown.length && <span className="map-none">{name(v)}</span>}
        </span>
        <span className="map-what">
          {v.parentId ? (
            <VersionSummary diff={delta(v)} />
          ) : (
            <span className="what">{name(v) === '原图' ? '原图，所有分支从这里开始' : '起点'}</span>
          )}
        </span>
      </div>
    );
  };
  // ---------- 分支名：字号不跟着画布缩放，贴在每行第一版的左边 ----------
  const labels = lanes.map((lane, li) => {
    const first = lane.versions[0],
      last = lane.versions[lane.versions.length - 1];
    // 写在这一行上方的空隙里；行首滚到屏幕左边外面时贴着左边，行尾也出去了就不写
    const gap = GAP_Y * view.z;
    const sy = view.y + laneY(li) * view.z - gap;
    const x0 = view.x + cardX(first) * view.z,
      x1 = view.x + (cardX(last) + W) * view.z;
    if (sy + gap < 0 || sy > size.h || x1 < 0 || x0 > size.w) return null;
    // 太小时上方空隙放不下字：只写名字，右对齐写在行首左边（这一行左边是空的）；左边也放不下就不写
    const side = gap < 16;
    if (side && x0 < 64) return null;
    const parent = first.parentId ? tree.byId.get(first.parentId) : undefined;
    const here = lane.versions.some((x) => x.id === current?.id);
    const small = gap < 28;
    return (
      <div
        key={first.id}
        className={`map-label ${here ? 'on' : ''} ${small ? 'small' : ''} ${side ? 'at-side' : ''}`}
        style={
          side
            ? { right: size.w - x0 + 6, top: sy + gap + (H * view.z) / 2 - 8, maxWidth: x0 - 14 }
            : {
                left: Math.max(8, x0),
                top: sy,
                height: gap,
                maxWidth: Math.max(80, x1 - Math.max(8, x0)),
              }
        }
        onPointerDown={(e) => e.stopPropagation()}
      >
        <b>{first.branchName}</b>
        {!small && (
          <span className="help">
            {parent ? `从${name(parent)}分出` : '从这里开始'} ·{' '}
            {lane.versions.filter((x) => !x.isStart).length} 版
          </span>
        )}
        {!small && (lane.subs > 0 || lane.hidden > 0) && (
          <button
            className="btn quiet sm map-fold"
            data-tip={
              lane.hidden ? '展开从这条分支再分出去的分支' : '把从这条分支再分出去的分支收起来'
            }
            onClick={() => toggleFold(first.id)}
          >
            <Icon name={lane.hidden ? 'add-line' : 'subtract-line'} />
            {lane.hidden ? `还有 ${lane.hidden} 支` : '收起分出去的'}
          </button>
        )}
      </div>
    );
  });
  // ---------- 小地图：点或拖到哪里，画布就移到哪里 ----------
  const MW = ms('--map-mini-w') || 200,
    MH = ms('--map-mini-h') || 128;
  const mk = Math.min(MW / worldW, MH / worldH);
  const mini = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const wx = (e.clientX - r.left) / mk,
      wy = (e.clientY - r.top) / mk;
    setView((v) => ({ ...v, x: size.w / 2 - wx * v.z, y: size.h / 2 - wy * v.z }));
  };
  return (
    <div
      ref={ov}
      className={`viewer-ov map-ov ${leaving ? 'leaving' : ''}`}
      data-enter="fade3"
      role="dialog"
      aria-modal="true"
      aria-label="分支总览"
    >
      <div className="viewer-bar map-top">
        <b>分支总览</b>
        <span className="muted">
          {lanes.length} 条分支 · {versions.filter((v) => !v.isStart).length} 版 · {total} 张
        </span>
        <label className="field sm map-search">
          <Icon name="search-line" />
          <input
            value={query}
            placeholder="找含有某个 Tag 的版本"
            aria-label="找含有某个 Tag 的版本"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setHitAt(-1);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.key !== 'Enter') return;
              e.preventDefault();
              nextHit(e.shiftKey ? -1 : 1);
            }}
          />
          {q && <span className="muted mono">{hits.length} 版</span>}
        </label>
        <span className="sp" />
        <span className="help key-hint">
          {mark ? (
            <span>按住 {modKey()} 再点一版，和标着的那版对比</span>
          ) : (
            <>
              <span>滚轮缩放 · 拖动平移 · 点一版切过去</span>
              <Kbd keys="Mod" />
              <span>点两版对比</span>
            </>
          )}
          <Kbd keys="Esc" />
          <span>关闭</span>
        </span>
        <button className="btn quiet sm" onClick={onClose}>
          <Icon name="close-line" />
          关闭
        </button>
      </div>
      <div ref={stage} className="map-stage" onPointerDown={down}>
        <div
          className="map-world"
          style={{
            width: worldW,
            height: worldH,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
          }}
        >
          <svg className="map-lines" width={worldW} height={worldH} aria-hidden="true">
            {lines.map((l, i) => (
              <path
                key={i}
                d={l.d}
                className={l.on ? 'on' : ''}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {lanes.flatMap((lane, li) => lane.versions.map((v) => card(v, li)))}
        </div>
        {labels}
        <div className="map-tools" onPointerDown={(e) => e.stopPropagation()}>
          <div className="map-zoom">
            <button
              className="btn quiet sm icon"
              aria-label="缩小"
              onClick={() => zoomAt(view.z / 1.25, size.w / 2, size.h / 2)}
            >
              <Icon name="subtract-line" />
            </button>
            <span className="mono">{Math.round(view.z * 100)}%</span>
            <button
              className="btn quiet sm icon"
              aria-label="放大"
              onClick={() => zoomAt(view.z * 1.25, size.w / 2, size.h / 2)}
            >
              <Icon name="add-line" />
            </button>
            <button className="btn quiet sm" onClick={fitView}>
              适应窗口
            </button>
            {current && (
              <button className="btn quiet sm" onClick={() => centerOn(current)}>
                回到当前版
              </button>
            )}
          </div>
          <div
            className="map-mini"
            style={{ width: worldW * mk, height: worldH * mk }}
            onPointerDown={(e) => {
              mini(e);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => e.buttons === 1 && mini(e)}
          >
            <svg width={worldW * mk} height={worldH * mk} aria-hidden="true">
              {lanes.map((lane, li) => {
                const a = lane.versions[0],
                  b = lane.versions[lane.versions.length - 1];
                const here = lane.versions.some((x) => x.id === current?.id);
                return (
                  <rect
                    key={a.id}
                    className={here ? 'on' : ''}
                    x={cardX(a) * mk}
                    y={laneY(li) * mk}
                    width={Math.max(2, (cardX(b) + W - cardX(a)) * mk)}
                    height={Math.max(2, H * mk)}
                  />
                );
              })}
              <rect
                className="view"
                x={(-view.x / view.z) * mk}
                y={(-view.y / view.z) * mk}
                width={(size.w / view.z) * mk}
                height={(size.h / view.z) * mk}
              />
            </svg>
          </div>
        </div>
      </div>
      <Pop
        open={!!peek && !menu}
        onClose={() => setPeek(null)}
        point={peek ? (peek.kind === 'img' ? peek.img.at : peek.at) : undefined}
        className={`popover ver-peek scroll ${peek?.kind === 'img' ? 'img' : ''}`}
        passive
        deps={[peek?.kind, peek?.v.id, peek?.kind === 'img' ? peek.img.id : '']}
      >
        {peek && (
          <div
            className="vp-in"
            onPointerEnter={() => clearTimeout(timer.current)}
            onPointerLeave={hidePeek}
          >
            {peek.kind === 'img' ? (
              <PeekPicture img={peek.img} tab={tab} />
            ) : (
              <VersionDifference
                diff={delta(peek.v)}
                title={`${peek.v.branchName} · ${name(peek.v)}`}
                against={peek.v.parentId ? name(tree.byId.get(peek.v.parentId)!) : name(peek.v)}
                redraw={isRedraw(peek.v)}
              />
            )}
          </div>
        )}
      </Pop>
      <ContextMenu at={menu?.at || null} onClose={() => setMenu(null)} items={menu?.items || []} />
    </div>
  );
}
