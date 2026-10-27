// 两张图对比（doc/design.md 2.35，1.8.1）：做在大图里，不另开页面。对比的是图，不是版本。
// 并排（左右各一张）或滑块（叠在一起，拖竖线看左边是哪张、右边是哪张），记住上次用的看法；缩放、拖动两边一起动。
// ← → 换右边那张（在它那一版的图之间走），左边不动；下面一栏写两版提示词和参数的差异，可以隔几版、跨分支。
// 入口：版本栏右键缩略图"和当前这张对比"、Ctrl（macOS 是 Command）点两张缩略图、局部重绘那一版的"和修之前对比"。
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Presence, dur } from '../kit/motion';
import { ToWin, useDismiss } from '../kit/layer';
import { Icon, Seg } from '../kit/controls';
import { markLoaded, readMatte, type Matte } from '../kit/alpha';
import { invokeUI } from '../lib/commands';
import { readVersions } from '../state/versions';
import { BlurImg, type BlurImage } from '../kit/blur';
import { versionDiff } from '../lib/versionDiff';
import type { WorkVersion } from '../shared/generation';
import type { ImageRecord } from '../shared/types';
import { VersionDifference } from './VersionDifference';
import { originGone } from './original';
import { isRedraw, promptOf } from './versionHelpers';

export interface CompareSide {
  versionId: string;
  imageId: string;
}
type Request = { tabId: string; a: CompareSide; b: CompareSide } | null;
let request: Request = null;
const listeners = new Set<() => void>();
const set = (r: Request) => {
  request = r;
  listeners.forEach((f) => f());
};
export const openCompare = (tabId: string, a: CompareSide, b: CompareSide) => set({ tabId, a, b });
const useRequest = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => request,
  );

type Mode = 'side' | 'slide';
const MODE_KEY = 'nps.compare.mode';
const readMode = (): Mode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'slide' ? 'slide' : 'side';
  } catch {
    return 'side';
  }
};
const writeMode = (v: Mode) => {
  try {
    localStorage.setItem(MODE_KEY, v);
  } catch {
    // 存不下就只在这次打开里生效
  }
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface Loaded {
  version: WorkVersion;
  /** 这一版里能看的图（根版本带原图） */
  items: { id: string; path: string; image: BlurImage; seed?: string }[];
}
const versionLabel = (v: WorkVersion) =>
  v.isStart || originGone(v) ? '起点' : v.parentId ? `第 ${v.number} 版` : '原图';

/** 挂在工作台舞台上；只响应这个标签页的请求 */
export function CompareHost({ tabId }: { tabId: string }) {
  const r = useRequest();
  const mine = r && r.tabId === tabId ? r : null;
  const [data, setData] = useState<{ a: Loaded; b: Loaded; ai: number; bi: number } | null>(null);
  useEffect(() => {
    if (!mine) return;
    setData(null);
    let live = true;
    void readVersions(tabId)
      .then(async (list) => {
        const load = async (side: CompareSide): Promise<Loaded | null> => {
          const version = list.versions.find((v) => v.id === side.versionId);
          if (!version) return null;
          const ids = [
            ...(!version.parentId && !originGone(version) ? [version.project.id] : []),
            ...version.images.filter((i) => !i.deleted).map((i) => i.projectId),
          ];
          const recs = await Promise.all(
            ids.map((id) =>
              invokeUI('library.get', { id })
                .then((x) => x.project as ImageRecord | null)
                .catch(() => null),
            ),
          );
          return {
            version,
            items: ids.map((id, i) => ({
              id,
              path:
                recs[i]?.image_path ||
                (id === version.project.id ? version.project.image_path : ''),
              image: recs[i] || (id === version.project.id ? version.project : { id }),
              seed: recs[i]?.metadata?.seed,
            })),
          };
        };
        const [a, b] = await Promise.all([load(mine.a), load(mine.b)]);
        if (!live) return;
        if (!a || !b) return set(null);
        setData({
          a,
          b,
          ai: Math.max(
            0,
            a.items.findIndex((x) => x.id === mine.a.imageId),
          ),
          bi: Math.max(
            0,
            b.items.findIndex((x) => x.id === mine.b.imageId),
          ),
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [mine]);
  const open = !!mine && !!data;
  // 关的时候照最后那份淡出
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
              onIndex={(bi) => setData((d) => d && { ...d, bi })}
              onSwap={() => setData((d) => d && { a: d.b, b: d.a, ai: d.bi, bi: d.ai })}
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
  onIndex,
  onSwap,
}: {
  tabId: string;
  data: { a: Loaded; b: Loaded; ai: number; bi: number };
  leaving: boolean;
  nodeRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onIndex: (i: number) => void;
  onSwap: () => void;
}) {
  const ov = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>(readMode);
  const [matte] = useState<Matte>(readMatte);
  const [z, setZ] = useState({ z: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const [cut, setCut] = useState(50);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const cutDrag = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    nodeRef.current = ov.current;
  });
  useDismiss(!leaving, onClose, [ov], { modal: true });
  const left = data.a.items[data.ai],
    right = data.b.items[data.bi];
  useEffect(() => {
    if (leaving) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      onIndex(clamp(data.bi + (e.key === 'ArrowLeft' ? -1 : 1), 0, data.b.items.length - 1));
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  });
  useEffect(() => {
    const el = ov.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const pane = (e.target as Element).closest?.('.cmp-pane');
      if (!pane) return;
      e.preventDefault();
      const fr = pane.getBoundingClientRect(),
        mx = e.clientX - (fr.left + fr.width / 2),
        my = e.clientY - (fr.top + fr.height / 2);
      setAnimate(false);
      setZ((v) => {
        const nz = clamp(v.z * Math.exp(-e.deltaY * 0.0015), 0.5, 16),
          k = nz / v.z;
        return { z: nz, x: mx - k * (mx - v.x), y: my - k * (my - v.y) };
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (cutDrag.current) {
        const r = cutDrag.current.getBoundingClientRect();
        setCut(clamp(((e.clientX - r.left) / r.width) * 100, 0, 100));
        return;
      }
      const d = pan.current;
      if (!d) return;
      setAnimate(false);
      setZ((v) => ({ ...v, x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
    };
    const up = () => {
      pan.current = null;
      cutDrag.current = null;
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    return () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
  }, []);
  const style = {
    transform:
      z.z === 1 && !z.x && !z.y ? undefined : `translate(${z.x}px, ${z.y}px) scale(${z.z})`,
    transition: animate ? 'transform var(--dur-3) var(--ease-move)' : 'none',
  };
  const bg = matte === 'checker' ? 'alpha-bg' : `matte-${matte}`;
  // 模糊（2.37）：滑块模式两张叠在一起，只在下面那张放眼睛；点了整个标签页一起显示
  const img = (it: Loaded['items'][number], label: string, eye = true) => (
    <BlurImg
      image={it.image}
      path={it.path}
      tab={tabId}
      eye={eye && !leaving ? 'md' : false}
      className={`vz ${bg}`}
      alt={label}
      draggable={false}
      onLoad={markLoaded}
      style={style}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        pan.current = { x: e.clientX, y: e.clientY, ox: z.x, oy: z.y };
      }}
    />
  );
  const name = (l: Loaded, i: number) =>
    l.items.length > 1 ? `${versionLabel(l.version)} · 第 ${i + 1} 张` : versionLabel(l.version);
  const ln = name(data.a, data.ai),
    rn = name(data.b, data.bi);
  // 局部重绘那一版比的是这次重绘用的提示词（1.8.6）
  const diff = versionDiff(promptOf(data.a.version), promptOf(data.b.version));
  const redraw = isRedraw(data.a.version) || isRedraw(data.b.version);
  const op = data.b.version.operation as
    | { kind: string; rect?: { x: number; y: number; width: number; height: number } }
    | undefined;
  const seedOnly = diff.empty && left.seed !== right.seed;
  return (
    <div
      ref={ov}
      className={`viewer-ov cmp-ov ${leaving ? 'leaving' : ''}`}
      data-enter="fade3"
      role="dialog"
      aria-modal="true"
      aria-label="对比"
      onDoubleClick={(e) => {
        if ((e.target as Element).closest('.viewer-bar, .cmp-diff')) return;
        setAnimate(dur(3) > 0);
        setZ({ z: 1, x: 0, y: 0 });
      }}
    >
      {mode === 'side' ? (
        <div className="cmp-panes">
          <div className="cmp-pane">
            <span className="cmp-tag">{ln}</span>
            {img(left, ln)}
          </div>
          <div className="cmp-pane">
            <span className="cmp-tag">{rn}</span>
            {img(right, rn)}
          </div>
        </div>
      ) : (
        <div className="cmp-panes">
          <div className="cmp-pane cmp-slide">
            <div className="cmp-layer">{img(left, ln)}</div>
            <div className="cmp-layer" style={{ clipPath: `inset(0 0 0 ${cut}%)` }}>
              {img(right, rn, false)}
            </div>
            <span className="cmp-tag">{ln}</span>
            <span className="cmp-tag right">{rn}</span>
            <span
              className="cmp-cut"
              style={{ left: `${cut}%` }}
              role="slider"
              aria-label="分界线"
              aria-valuenow={Math.round(cut)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                cutDrag.current = (e.currentTarget.parentElement as HTMLElement) || null;
              }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault();
                e.stopPropagation();
                setCut((c) => clamp(c + (e.key === 'ArrowLeft' ? -5 : 5), 0, 100));
              }}
            >
              <i>
                <Icon name="arrow-left-right-line" />
              </i>
            </span>
          </div>
        </div>
      )}
      <div className="cmp-diff" data-scroll="">
        {seedOnly ? (
          <p className="help">
            提示词和参数一样，只有 Seed 不同：
            <span className="mono">
              {left.seed || '未知'} → {right.seed || '未知'}
            </span>
          </p>
        ) : diff.empty ? (
          <p className="help">两张图的提示词和参数一样</p>
        ) : (
          <VersionDifference diff={diff} title={rn} against={ln} redraw={redraw} />
        )}
        {op?.kind === 'inpaint' && op.rect && (
          <p className="help">
            局部重绘：框在{' '}
            <span className="mono">
              {op.rect.x}, {op.rect.y} · {op.rect.width} × {op.rect.height}
            </span>
          </p>
        )}
      </div>
      <div className="viewer-bar">
        <Seg
          label="看法"
          value={mode}
          onChange={(v) => {
            setMode(v);
            writeMode(v);
          }}
          items={[
            ['side', <Icon name="layout-column-line" />, '并排'],
            ['slide', <Icon name="contrast-2-line" />, '滑块'],
          ]}
        />
        <button className="btn quiet sm" onClick={onSwap}>
          <Icon name="arrow-left-right-line" />
          交换左右
        </button>
        <span className="help">← → 换右边那张 · 滚轮缩放 · 拖动平移 · 双击适应窗口</span>
        <span className="sp" />
        <span className="mono muted">
          {data.bi + 1} / {data.b.items.length}
        </span>
        <span className="vz-sep" />
        <button className="btn quiet sm" onClick={onClose}>
          <Icon name="close-line" />
          关闭
        </button>
      </div>
    </div>
  );
}
