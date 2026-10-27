// 扩图（doc/design.md 2.41，1.8.5）：和局部重绘一样的编辑层，只盖住版本栏和舞台，右边的提示词栏照常能改。
// 四条边中间各一个把手往外拖（原图像素 64 吸附），上面一排比例预设在需要变长的方向上两边均匀扩；
// 宽高各不超过原图 2 倍、整张不超过 4096。下面两张卡片：一次画完 / 按边分块，各写生成尺寸、次数和价格。
// 画布按"最大能扩到的大小"适应窗口；拖的时候原图不动，松手后整张回到中间。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Presence, dur } from '../kit/motion';
import { ToWin, useDismiss } from '../kit/layer';
import { Icon, Switch } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { markLoaded } from '../kit/alpha';
import { invokeUI } from '../lib/commands';
import { useGeneration } from '../state/generation';
import { BlurImg, type BlurImage } from '../kit/blur';

type Edges = { top: number; right: number; bottom: number; left: number };
type Side = keyof Edges;
type Mode = 'whole' | 'edges';
type Estimate = Awaited<ReturnType<typeof invokeUI<'generate.estimate-outpaint'>>>;
interface Saved {
  edges: Edges;
  /** 用户自己选过的画法；没选过跟着推荐走 */
  mode: Mode | null;
  fullSize: boolean;
}
const saved = new Map<string, Saved>();
const keyOf = (tabId: string, imageId: string) => `${tabId}:${imageId}`;
const NONE: Edges = { top: 0, right: 0, bottom: 0, left: 0 };
const STEP = 64;
const LIMIT = 4096;
const FREE_PX = 1048576;
const RATIOS = [
  ['16:9', 16 / 9],
  ['3:2', 3 / 2],
  ['1:1', 1],
  ['2:3', 2 / 3],
  ['9:16', 9 / 16],
] as const;
const SIDE_NAME: Record<Side, string> = { left: '左', right: '右', top: '上', bottom: '下' };
const IGNORED: Record<string, string> = { vibe: 'Vibe', precise: '精确参考', base: '底图' };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const snap = (v: number) => Math.round(v / STEP) * STEP;

/** 这个方向上扩出来的总长最多多少：宽高各不超过原图 2 倍、不超过 4096 */
const room = (base: number) => Math.max(0, Math.min(base * 2, LIMIT) - base);

/** 比例预设：在需要变长的方向上两边均匀扩到这个比例；原图已经比它宽（高）或扩不到时返回 null */
export function ratioEdges(W: number, H: number, r: number): Edges | null {
  if (Math.abs(W / H - r) < 0.01) return null;
  if (r > W / H) {
    const extra = snap(H * r - W);
    if (extra < STEP || extra > room(W)) return null;
    const left = Math.floor(extra / 2 / STEP) * STEP;
    return { top: 0, bottom: 0, left, right: extra - left };
  }
  const extra = snap(W / r - H);
  if (extra < STEP || extra > room(H)) return null;
  const top = Math.floor(extra / 2 / STEP) * STEP;
  return { left: 0, right: 0, top, bottom: extra - top };
}

export interface OutpaintProps {
  open: boolean;
  tabId: string;
  imageId: string;
  path: string;
  image?: BlurImage;
  onClose: () => void;
}
export function Outpaint(p: OutpaintProps) {
  const show = p.open && !!p.path;
  const last = useRef(p);
  if (show) last.current = p;
  const q = show ? p : last.current;
  return (
    <Presence show={show}>
      {(leaving, ref) => (
        <ToWin>
          <Editor
            key={keyOf(q.tabId, q.imageId)}
            {...q}
            onClose={p.onClose}
            leaving={leaving}
            nodeRef={ref}
          />
        </ToWin>
      )}
    </Presence>
  );
}

function Editor(
  p: OutpaintProps & { leaving: boolean; nodeRef: React.RefObject<HTMLElement | null> },
) {
  const notify = useNotifications();
  const relay = useGeneration().settings.connection === 'relay';
  const key = keyOf(p.tabId, p.imageId);
  const before = saved.get(key);
  const ov = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ W: number; H: number } | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [edges, setEdges] = useState<Edges>(before?.edges || NONE);
  const [picked, setPicked] = useState<Mode | null>(before?.mode ?? null);
  const [fullSize, setFullSize] = useState(before?.fullSize || false);
  const [est, setEst] = useState<Estimate | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 拖的时候原图停在原处（屏幕坐标），松手后回到中间
  const [hold, setHold] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ side: Side; x: number; y: number; from: Edges } | null>(null);
  useLayoutEffect(() => {
    p.nodeRef.current = ov.current;
  });
  const close = () => {
    saved.set(key, { edges, mode: picked, fullSize });
    p.onClose();
  };
  useDismiss(!p.leaving, close, [ov], { modal: true });
  // 提示词栏留在外面（和局部重绘一样，2.35）
  const [right, setRight] = useState(0);
  useLayoutEffect(() => {
    const col = document.querySelector<HTMLElement>('.col.prompt');
    const host = ov.current?.offsetParent as HTMLElement | null;
    if (!col || !host) return;
    const measure = () =>
      setRight(Math.max(0, host.getBoundingClientRect().right - col.getBoundingClientRect().left));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(col);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setArea({
        w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = dims?.W || 1,
    H = dims?.H || 1;
  const CW = W + edges.left + edges.right,
    CH = H + edges.top + edges.bottom;
  const any = edges.top + edges.right + edges.bottom + edges.left > 0;
  // 按最大能扩到的大小适应：怎么拖都放得下
  const s = dims && area.w ? Math.min(area.w / (W + room(W)), area.h / (H + room(H))) : 0;
  const pad = box.current ? parseFloat(getComputedStyle(box.current).paddingLeft) : 0;
  const centered = { x: pad + (area.w - CW * s) / 2, y: pad + (area.h - CH * s) / 2 };
  const pos = hold ? { x: hold.x - edges.left * s, y: hold.y - edges.top * s } : centered;

  // 价格和两种画法
  useEffect(() => {
    if (!any || p.leaving || !dims) {
      setEst(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      setError('');
      void invokeUI('generate.estimate-outpaint', {
        tabId: p.tabId,
        imageId: p.imageId,
        edges,
        fullSize,
      })
        .then((r) => live && setEst(r))
        .catch((e) => live && setError((e as Error).message));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [edges.top, edges.right, edges.bottom, edges.left, fullSize, p.leaving, !!dims]);

  const onHandleDown = (side: Side) => (e: React.PointerEvent) => {
    if (e.button !== 0 || busy || !s) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* 指针已经不在了，照样能拖 */
    }
    drag.current = { side, x: e.clientX, y: e.clientY, from: edges };
    setHold({ x: pos.x + edges.left * s, y: pos.y + edges.top * s });
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / s,
      dy = (e.clientY - d.y) / s;
    const f = d.from;
    const next = { ...f };
    if (d.side === 'left') next.left = clamp(snap(f.left - dx), 0, room(W) - f.right);
    if (d.side === 'right') next.right = clamp(snap(f.right + dx), 0, room(W) - f.left);
    if (d.side === 'top') next.top = clamp(snap(f.top - dy), 0, room(H) - f.bottom);
    if (d.side === 'bottom') next.bottom = clamp(snap(f.bottom + dy), 0, room(H) - f.top);
    if (next[d.side] !== edges[d.side]) setEdges(next);
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setHold(null);
  };
  const ratioOn = (r: number) => any && Math.abs(CW / CH - r) < 0.01;

  const mode: Mode = picked || est?.recommended || 'whole';
  const priceOf = (e?: { anlas: number; free: boolean; relay?: boolean }) =>
    !e ? '…' : relay || e.relay ? '中转站按张计费' : e.free ? '免费' : `${e.anlas} Anlas`;
  const big = CW * CH > FREE_PX;
  const blocks = est?.edges.blocks.length || 0;
  // 按边分块也写生成尺寸：各块一样大写"每次 W × H"；左右和上下不一样大时写第一块加"等"，每块的尺寸放进悬停说明
  const blockSizes = [...new Set(est?.edges.blocks.map((b) => `${b.width} × ${b.height}`) || [])];
  const blockSize = blockSizes.length > 1 ? `${blockSizes[0]} 等` : `每次 ${blockSizes[0] || ''}`;
  const blockTip =
    blockSizes.length > 1
      ? `（${est!.edges.blocks.map((b) => `${SIDE_NAME[b.edge]} ${b.width} × ${b.height}`).join('，')}）`
      : '';
  const unavailable = est ? (mode === 'whole' ? est.whole : est.edges).unavailable : '';
  const note = unavailable || error || (!any ? '拖四条边往外扩，或者点上面的比例' : '');
  const warn = [
    mode === 'whole' && big && !fullSize && '整张比免费尺寸大，会缩小来画，新区域损失一些细节',
    est?.ignored?.length && `扩图不使用${est.ignored.map((x) => IGNORED[x] || x).join('、')}`,
  ].filter(Boolean) as string[];
  const can = any && !!est && !unavailable && !busy;
  const go = async () => {
    if (!can) return;
    setBusy(true);
    try {
      await invokeUI('generate.outpaint', {
        tabId: p.tabId,
        imageId: p.imageId,
        edges,
        mode,
        fullSize: mode === 'whole' ? fullSize : false,
      });
      close();
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const sides = (['left', 'right', 'top', 'bottom'] as const).filter((k) => edges[k]);
  const card = (m: Mode, title: string, detail: string, tip: string) => (
    <button
      className={`op-card ${mode === m ? 'on' : ''}`}
      role="radio"
      aria-checked={mode === m}
      data-tip={tip}
      disabled={!any || busy}
      onClick={() => setPicked(m)}
    >
      <b>{title}</b>
      <span className="mono">{detail}</span>
    </button>
  );
  return (
    <div
      ref={ov}
      className={`viewer-ov inpaint-ov outpaint-ov ${p.leaving ? 'leaving' : ''}`}
      style={{ right: right || undefined }}
      data-enter="fade3"
      role="dialog"
      aria-modal={right ? undefined : 'true'}
      aria-label="扩图"
    >
      <div className="viewer-bar ip-top">
        <b>扩图</b>
        <span className="label">比例</span>
        <span className="op-ratios" role="group" aria-label="扩到这个比例">
          {RATIOS.map(([name, r]) => {
            const to = dims ? ratioEdges(W, H, r) : null;
            return (
              <button
                key={name}
                className={`btn quiet sm ${ratioOn(r) ? 'on' : ''} ${to ? '' : 'is-off'}`}
                aria-pressed={ratioOn(r)}
                {...(to
                  ? { 'data-tip': `两边均匀扩到 ${name}`, onClick: () => setEdges(to) }
                  : {
                      'aria-disabled': true,
                      'data-tip':
                        dims && Math.abs(W / H - r) < 0.01
                          ? '原图就是这个比例'
                          : '扩到这个比例超过原图 2 倍',
                      onClick: () => {},
                    })}
              >
                {name}
              </button>
            );
          })}
        </span>
        <button className="btn quiet sm" disabled={!any} onClick={() => setEdges(NONE)}>
          <Icon name="arrow-go-back-line" />
          重置
        </button>
        <span className="sp" />
        <span className="help">用右边的提示词画新区域 · 拖四条边往外扩，宽高各最多到原图 2 倍</span>
      </div>
      <div
        ref={box}
        className="ip-canvas op-area"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {dims === null && (
          // 先读出原图尺寸
          <BlurImg
            image={p.image}
            path={p.path}
            tab={p.tabId}
            className="op-probe"
            alt=""
            onLoad={(e) => {
              markLoaded(e);
              setDims({ W: e.currentTarget.naturalWidth, H: e.currentTarget.naturalHeight });
            }}
          />
        )}
        {dims && s > 0 && (
          <div
            className={`op-canvas ${hold ? 'dragging' : ''}`}
            data-outpaint-canvas=""
            style={{
              left: pos.x,
              top: pos.y,
              width: CW * s,
              height: CH * s,
              transition:
                hold || !dur(3)
                  ? 'none'
                  : 'left var(--dur-3) var(--ease-move), top var(--dur-3) var(--ease-move), width var(--dur-3) var(--ease-move), height var(--dur-3) var(--ease-move)',
            }}
          >
            <BlurImg
              image={p.image}
              path={p.path}
              tab={p.tabId}
              className="op-orig alpha-bg"
              alt=""
              draggable={false}
              eye={false}
              onLoad={markLoaded}
              style={{ left: edges.left * s, top: edges.top * s, width: W * s, height: H * s }}
            />
            {sides.map((k) => (
              <span key={k} className={`op-plus ${k}`} style={plusAt(k, edges, s, W, H)}>
                +{edges[k]}
              </span>
            ))}
            {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
              <i
                key={k}
                className={`op-grip ${k}`}
                role="slider"
                aria-label={`${SIDE_NAME[k]}边扩多少`}
                aria-valuenow={edges[k]}
                aria-valuemin={0}
                aria-valuemax={room(k === 'left' || k === 'right' ? W : H)}
                data-outpaint-handle={k}
                onPointerDown={onHandleDown(k)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="viewer-bar ip-bar op-bar">
        <span className="ip-info">
          <span className="mono">
            {W} × {H}
            {any && (
              <>
                {' → '}
                <b>
                  {CW} × {CH}
                </b>
              </>
            )}
          </span>
          {note ? (
            <span className={`help ${unavailable || error ? 'danger' : ''}`}>{note}</span>
          ) : (
            <>
              <span className="help">
                提示词写新区域里要有什么；照搬原图的提示词，旁边容易再画一个主体
              </span>
              {warn.map((w) => (
                <span key={w} className="help warn">
                  {w}
                </span>
              ))}
            </>
          )}
        </span>
        <span className="sp" />
        <span className="op-cards" role="radiogroup" aria-label="画法">
          {card(
            'whole',
            '一次画完',
            est ? `生成 ${est.whole.width} × ${est.whole.height} · ${priceOf(est.whole)}` : '…',
            '整张扩大后的图一次画完，几条边同时看到整体',
          )}
          {card(
            'edges',
            '按边分块',
            est ? `${blocks} 次 · ${blockSize} · ${priceOf(est.edges)}` : '…',
            `每条边连着一块原图单独画，新区域更清楚；几条边就画几次${blockTip}`,
          )}
        </span>
        {mode === 'whole' && big && (
          <span className="ip-full" data-tip="不缩小，按扩大后的整张来画，会收费">
            <Switch on={fullSize} onChange={setFullSize} label="按原尺寸" />
            按原尺寸
          </span>
        )}
        <span className="vz-sep" />
        <button className="btn quiet sm" onClick={close}>
          取消
        </button>
        <button
          className={`btn ink sm ${busy ? 'loading' : ''} ${can || busy ? '' : 'is-off'}`}
          disabled={busy}
          {...(can
            ? { onClick: () => void go() }
            : { 'aria-disabled': true, 'data-tip': note || '现在不能扩图', onClick: () => {} })}
        >
          {busy && <Icon name="loader-4-line" />}
          扩图
        </button>
      </div>
    </div>
  );
}

/** "+256" 放在扩出来那一条的正中 */
function plusAt(k: Side, e: Edges, s: number, W: number, H: number): React.CSSProperties {
  const cx = (e.left + W / 2) * s,
    cy = (e.top + H / 2) * s;
  if (k === 'left') return { left: (e.left / 2) * s, top: cy };
  if (k === 'right') return { left: (e.left + W + e.right / 2) * s, top: cy };
  if (k === 'top') return { left: cx, top: (e.top / 2) * s };
  return { left: cx, top: (e.top + H + e.bottom / 2) * s };
}
