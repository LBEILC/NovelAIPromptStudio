// 局部重绘（doc/design.md 2.35，1.8.1）：盖住标题栏以下整个窗口的编辑层，底和大图一样。
// 一律要涂：框只决定送去重绘的范围，框里没涂的地方保持原图，贴回时边缘本来就是原图的像素。
// 两种顺序都行：先用"框"拖出范围（松手后放大到框里、换成笔刷）再涂；或者直接涂，松手后自动出框（上下文尽量多），框还能接着调。
// 滚轮缩放，按住空格或中键拖动平移，[ ] 调笔刷大小。重绘后编辑层关掉，框和涂抹留在这张图上，"再来一次"直接用。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Presence, dur } from '../kit/motion';
import { ToWin, useDismiss } from '../kit/layer';
import { Icon, Seg, Slider, Stepper, Switch } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { markLoaded } from '../kit/alpha';
import { invokeUI } from '../lib/commands';
import { useGeneration } from '../state/generation';
import { INPAINT_PRESETS, autoInpaintRect, inpaintSize, type Rect } from '../shared/inpaint';

type Preset = (typeof INPAINT_PRESETS)[number]['id'] | 'free';
type Tool = 'box' | 'brush' | 'erase';
type Estimate = Awaited<ReturnType<typeof invokeUI<'generate.estimate-inpaint'>>>;
interface Saved {
  rect: Rect | null;
  /** 用户自己拖过、调过的框；没调过的框跟着涂抹自动走 */
  manual: boolean;
  mask: HTMLCanvasElement;
  strength: number;
  fullSize: boolean;
  preset: Preset;
}
// 框和涂抹按"标签页 + 这张图"留着，关掉编辑层、重绘完都还在；关掉软件就没了
const saved = new Map<string, Saved>();
const keyOf = (tabId: string, imageId: string) => `${tabId}:${imageId}`;
/** 涂到离框边这么近（原图像素）就提示可能有接缝 */
const EDGE = 32;
const MIN = 64;
const FREE_PX = 1048576;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const IGNORED: Record<string, string> = { vibe: 'Vibe', precise: '精确参考', base: '底图' };

function exportMask(mask: HTMLCanvasElement, r: Rect) {
  const c = document.createElement('canvas');
  c.width = r.width;
  c.height = r.height;
  c.getContext('2d')!.drawImage(mask, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  return c.toDataURL('image/png').split(',')[1];
}
/** 框里有没有涂、涂到框边没有（贴着图片边缘的那几条边不算，外面本来就没有原图）：按 1/4 缩小了扫，够用也快 */
function scan(mask: HTMLCanvasElement, r: Rect | null) {
  if (!r) return { any: false, edge: false };
  const k = 4,
    w = Math.max(1, Math.round(r.width / k)),
    h = Math.max(1, Math.round(r.height / k)),
    c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(mask, r.x, r.y, r.width, r.height, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data,
    band = Math.ceil(EDGE / k);
  const L = r.x > 0 ? band : 0,
    T = r.y > 0 ? band : 0,
    R = r.x + r.width < mask.width ? band : 0,
    B = r.y + r.height < mask.height ? band : 0;
  let any = false,
    edge = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 127) {
        any = true;
        if (x < L || y < T || x >= w - R || y >= h - B) edge = true;
      }
  return { any, edge };
}
/** 整张涂抹的外接矩形（同样按 1/4 扫），没涂就是 null */
function bounds(mask: HTMLCanvasElement): Rect | null {
  const k = 4,
    w = Math.max(1, Math.ceil(mask.width / k)),
    h = Math.max(1, Math.ceil(mask.height / k)),
    c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(mask, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 64) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const x = Math.max(0, x0 * k - k),
    y = Math.max(0, y0 * k - k);
  return {
    x,
    y,
    width: Math.min(mask.width, (x1 + 2) * k) - x,
    height: Math.min(mask.height, (y1 + 2) * k) - y,
  };
}
/** 从 a 拖到 b 的框：按比例（宽/高）收，收在图片里 */
function span(
  a: { x: number; y: number },
  b: { x: number; y: number },
  ratio: number | null,
  W: number,
  H: number,
): Rect {
  const sx = b.x < a.x ? -1 : 1,
    sy = b.y < a.y ? -1 : 1;
  let w = Math.min(Math.abs(b.x - a.x), sx < 0 ? a.x : W - a.x),
    h = Math.min(Math.abs(b.y - a.y), sy < 0 ? a.y : H - a.y);
  if (ratio) {
    if (w / ratio > h) w = h * ratio;
    else h = w / ratio;
  }
  return {
    x: Math.round(sx < 0 ? a.x - w : a.x),
    y: Math.round(sy < 0 ? a.y - h : a.y),
    width: Math.round(w),
    height: Math.round(h),
  };
}
/** 以 center 为中心放一个 w × h 的框，图片放不下就按比例缩，再挪进图片里 */
function place(c: { x: number; y: number }, w: number, h: number, W: number, H: number): Rect {
  const k = Math.min(1, W / w, H / h);
  w = Math.round(w * k);
  h = Math.round(h * k);
  return {
    x: Math.round(clamp(c.x - w / 2, 0, W - w)),
    y: Math.round(clamp(c.y - h / 2, 0, H - h)),
    width: w,
    height: h,
  };
}

/** 重绘结果那一版上的"再来一次"：框和涂抹还在就直接重绘，返回 false 时由调用方打开编辑层 */
export async function rerunInpaint(tabId: string, imageId: string) {
  const s = saved.get(keyOf(tabId, imageId));
  if (!s?.rect || !scan(s.mask, s.rect).any) return false;
  await invokeUI('generate.inpaint', {
    tabId,
    imageId,
    rect: s.rect,
    mask: exportMask(s.mask, s.rect),
    strength: s.strength,
    fullSize: s.fullSize,
  });
  return true;
}

export interface InpaintProps {
  open: boolean;
  tabId: string;
  /** 源图：这个作品里的一张 */
  imageId: string;
  src: string;
  onClose: () => void;
}
export function Inpaint(p: InpaintProps) {
  // 关的时候调用方已经把图清掉了，照最后打开时的那张淡出
  const show = p.open && !!p.src;
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
  p: InpaintProps & { leaving: boolean; nodeRef: React.RefObject<HTMLElement | null> },
) {
  const notify = useNotifications();
  const relay = useGeneration().settings.connection === 'relay';
  const key = keyOf(p.tabId, p.imageId);
  const before = saved.get(key);
  const ov = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const mask = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState<{ W: number; H: number } | null>(
    before ? { W: before.mask.width, H: before.mask.height } : null,
  );
  const [fit, setFit] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const [tool, setTool] = useState<Tool>('brush');
  const [preset, setPreset] = useState<Preset>(before?.preset || '1:1');
  const [size, setSize] = useState(40);
  const [rect, setRect] = useState<Rect | null>(before?.rect || null);
  const [manual, setManual] = useState(before?.manual || false);
  const [strength, setStrength] = useState(before?.strength ?? 1);
  const [fullSize, setFullSize] = useState(before?.fullSize || false);
  const [painted, setPainted] = useState(0);
  const [info, setInfo] = useState({ any: false, edge: false, outside: false });
  const [est, setEst] = useState<Estimate | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [space, setSpace] = useState(false);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<
    | { kind: 'pan'; x: number; y: number; ox: number; oy: number }
    | { kind: 'new' | 'resize'; a: { x: number; y: number } }
    | { kind: 'move'; dx: number; dy: number }
    | { kind: 'paint'; last: { x: number; y: number }; erase: boolean }
    | null
  >(null);
  useLayoutEffect(() => {
    p.nodeRef.current = ov.current;
  });
  const keep = () => {
    const m = mask.current;
    if (!m || !dims) return;
    const copy = document.createElement('canvas');
    copy.width = m.width;
    copy.height = m.height;
    copy.getContext('2d')!.drawImage(m, 0, 0);
    saved.set(key, { rect, manual, mask: copy, strength, fullSize, preset });
  };
  const close = () => {
    keep();
    p.onClose();
  };
  useDismiss(!p.leaving, close, [ov], { modal: true });
  // 提示词栏留在外面照常能改（doc/design.md 2.35，10-26）：编辑层的右边停在提示词栏左边，
  // 重绘用的就是这份草稿。找不到提示词栏时照旧盖满
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
  // 恢复上次留下的涂抹
  useLayoutEffect(() => {
    if (dims && before && mask.current) mask.current.getContext('2d')!.drawImage(before.mask, 0, 0);
  }, [!!dims]);
  // 适应窗口：整张图放得下、尽量大
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !dims) return;
    const measure = () => {
      const cs = getComputedStyle(el),
        cw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        ch = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
        w = Math.min(cw, (ch * dims.W) / dims.H);
      setFit({ w, h: (w * dims.H) / dims.W });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dims]);
  const W = dims?.W || 1,
    H = dims?.H || 1;
  const ratio =
    preset === 'free'
      ? null
      : (() => {
          const x = INPAINT_PRESETS.find((q) => q.id === preset)!;
          return x.width / x.height;
        })();
  const toImg = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * W, 0, W),
      y: clamp(((e.clientY - r.top) / r.height) * H, 0, H),
    };
  };
  // 自动出框：整张图都不超过免费尺寸时就框整张，上下文最多
  const autoRect = (b: Rect) =>
    W * H <= FREE_PX
      ? { x: 0, y: 0, width: W, height: H }
      : autoInpaintRect(b, { width: W, height: H });
  /** 屏幕上 1px 是原图的多少像素 */
  const perPx = () => W / (stage.current?.getBoundingClientRect().width || W);
  const zoomTo = (r: Rect) => {
    const el = box.current;
    if (!el || !fit.w) return;
    const k = fit.w / W,
      z = clamp(
        Math.min((el.clientWidth * 0.8) / (r.width * k), (el.clientHeight * 0.8) / (r.height * k)),
        1,
        16,
      ),
      cx = (r.x + r.width / 2) * k - fit.w / 2,
      cy = (r.y + r.height / 2) * k - fit.h / 2;
    setAnimate(dur(3) > 0);
    setView({ z, x: -cx * z, y: -cy * z });
  };
  // 框里有没有涂、涂到框边、框外还有涂的
  useEffect(() => {
    const m = mask.current;
    if (!m || !dims) return;
    const s = scan(m, rect),
      b = bounds(m);
    setInfo({
      ...s,
      outside:
        !!rect &&
        !!b &&
        (b.x < rect.x - 2 ||
          b.y < rect.y - 2 ||
          b.x + b.width > rect.x + rect.width + 2 ||
          b.y + b.height > rect.y + rect.height + 2),
    });
  }, [rect, painted, dims]);
  // 价格和实际模型
  useEffect(() => {
    if (!rect || p.leaving) {
      setEst(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      setError('');
      void invokeUI('generate.estimate-inpaint', {
        tabId: p.tabId,
        imageId: p.imageId,
        rect,
        strength,
        fullSize,
      })
        .then((r) => live && setEst(r))
        .catch((e) => live && setError((e as Error).message));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [rect?.x, rect?.y, rect?.width, rect?.height, strength, fullSize, p.leaving]);
  // 滚轮以指针为中心缩放
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const fr = el.getBoundingClientRect(),
        mx = e.clientX - (fr.left + fr.width / 2),
        my = e.clientY - (fr.top + fr.height / 2);
      setAnimate(false);
      setView((v) => {
        const nz = clamp(v.z * Math.exp(-e.deltaY * 0.0015), 0.5, 16),
          k = nz / v.z;
        return { z: nz, x: mx - k * (mx - v.x), y: my - k * (my - v.y) };
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  // 空格按住平移；[ ] 调笔刷
  useEffect(() => {
    if (p.leaving) return;
    const down = (e: KeyboardEvent) => {
      // 提示词栏里打字、按空格不算
      if ((e.target as Element)?.closest?.('input, textarea, .col.prompt')) return;
      if (e.key === ' ') {
        e.preventDefault();
        setSpace(true);
      } else if (e.key === '[') setSize((s) => clamp(Math.round(s / 1.2), 4, 300));
      else if (e.key === ']') setSize((s) => clamp(Math.round(s * 1.2), 4, 300));
    };
    const up = (e: KeyboardEvent) => e.key === ' ' && setSpace(false);
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }, [p.leaving]);
  const stroke = (a: { x: number; y: number }, b: { x: number; y: number }, erase: boolean) => {
    const ctx = mask.current!.getContext('2d')!;
    ctx.save();
    // 自己框好的范围里才能涂；框外涂了也不会重画
    if (manual && rect) {
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();
    }
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    // 涂抹直接画成遮罩的颜色（--info），发出去只看透明度
    ctx.strokeStyle = ctx.fillStyle =
      getComputedStyle(ov.current!).getPropertyValue('--info').trim() || '#196aaf';
    ctx.lineWidth = size * perPx();
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    if (a.x === b.x && a.y === b.y) {
      ctx.arc(a.x, a.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  };
  const onDown = (e: React.PointerEvent) => {
    if (!dims || busy) return;
    if (e.button === 1 || (e.button === 0 && space)) {
      e.preventDefault();
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
    } else if (e.button === 0) {
      const pt = toImg(e);
      if (tool === 'box') {
        const tol = 12 * perPx();
        const corner =
          rect &&
          [
            [rect.x, rect.y],
            [rect.x + rect.width, rect.y],
            [rect.x, rect.y + rect.height],
            [rect.x + rect.width, rect.y + rect.height],
          ].findIndex(([cx, cy]) => Math.abs(pt.x - cx) < tol && Math.abs(pt.y - cy) < tol);
        if (rect && corner != null && corner >= 0) {
          // 拉一个角：对角不动
          drag.current = {
            kind: 'resize',
            a: {
              x: corner % 2 ? rect.x : rect.x + rect.width,
              y: corner > 1 ? rect.y : rect.y + rect.height,
            },
          };
        } else if (
          // 自己拖过、调过的框才能整个挪；自动出来的框（常常是整张图）在里面拖就是重新画一个
          rect &&
          manual &&
          (rect.width < W || rect.height < H) &&
          pt.x > rect.x &&
          pt.y > rect.y &&
          pt.x < rect.x + rect.width &&
          pt.y < rect.y + rect.height
        )
          drag.current = { kind: 'move', dx: pt.x - rect.x, dy: pt.y - rect.y };
        else drag.current = { kind: 'new', a: pt };
      } else {
        drag.current = { kind: 'paint', last: pt, erase: tool === 'erase' };
        stroke(pt, pt, tool === 'erase');
      }
    } else return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    setRing({ x: e.clientX - r.left, y: e.clientY - r.top });
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      setAnimate(false);
      setView((v) => ({ ...v, x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
      return;
    }
    const pt = toImg(e);
    if (d.kind === 'paint') {
      stroke(d.last, pt, d.erase);
      d.last = pt;
    } else if (d.kind === 'move' && rect)
      setRect({
        ...rect,
        x: Math.round(clamp(pt.x - d.dx, 0, W - rect.width)),
        y: Math.round(clamp(pt.y - d.dy, 0, H - rect.height)),
      });
    else if (d.kind === 'new' || d.kind === 'resize') {
      const next = span(d.a, pt, ratio, W, H);
      if (d.kind === 'resize' || (next.width > 4 && next.height > 4)) setRect(next);
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind === 'pan') return;
    if (d.kind === 'paint') {
      setPainted((n) => n + 1);
      if (!manual) {
        const b = bounds(mask.current!);
        setRect(b ? autoRect(b) : null);
      }
      return;
    }
    if (!rect) return;
    // 太小的框放大到最小，太小的拖动（其实是点了一下）不算新框
    if (d.kind === 'new' && (rect.width < 8 || rect.height < 8)) return;
    const fixed =
      rect.width < MIN || rect.height < MIN
        ? place(
            { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
            Math.max(MIN, rect.width),
            Math.max(MIN, rect.height),
            W,
            H,
          )
        : rect;
    setRect(fixed);
    setManual(true);
    if (d.kind === 'new') {
      zoomTo(fixed);
      setTool('brush');
    }
  };
  const pickPreset = (v: Preset) => {
    setPreset(v);
    if (v === 'free') return;
    const x = INPAINT_PRESETS.find((q) => q.id === v)!;
    const c = rect
      ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      : { x: W / 2, y: H / 2 };
    setRect(place(c, x.width, x.height, W, H));
    setManual(true);
  };
  const clear = () => {
    const m = mask.current;
    if (!m) return;
    m.getContext('2d')!.clearRect(0, 0, m.width, m.height);
    setPainted((n) => n + 1);
    if (!manual) setRect(null);
  };
  const go = async () => {
    if (busy || !rect || !info.any || est?.unavailable) return;
    setBusy(true);
    try {
      await invokeUI('generate.inpaint', {
        tabId: p.tabId,
        imageId: p.imageId,
        rect,
        mask: exportMask(mask.current!, rect),
        strength,
        fullSize,
      });
      close();
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const big = !!rect && rect.width * rect.height > FREE_PX;
  const gen = rect ? inpaintSize(rect.width, rect.height, fullSize) : null;
  const k = gen && rect ? gen.width / rect.width : 1;
  const scaleText =
    k > 1.01 ? `（放大 ${k.toFixed(1)} 倍）` : k < 0.99 ? `（缩小到 ${Math.round(k * 100)}%）` : '';
  const price = !rect
    ? ''
    : !est
      ? '…'
      : relay || est.relay
        ? '中转站按张计费'
        : est.free
          ? '免费'
          : `${est.anlas} Anlas`;
  const note = est?.unavailable
    ? est.unavailable
    : error
      ? error
      : !rect
        ? '涂上要重画的地方，或者先用"框"拖出范围'
        : !info.any
          ? '先涂上要重画的地方'
          : '';
  const warn = [
    info.edge && '涂到了框的边上，贴回时可能有接缝',
    info.outside && '框外涂的地方不会重画',
    big && !fullSize && '框比免费尺寸大，会缩小重绘，损失一些细节',
    est?.ignored?.length && `局部重绘不使用${est.ignored.map((x) => IGNORED[x] || x).join('、')}`,
  ].filter(Boolean) as string[];
  const can = !!rect && info.any && !!est && !est.unavailable && !busy;
  const transform =
    view.z === 1 && !view.x && !view.y
      ? undefined
      : `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  const cursor =
    space || drag.current?.kind === 'pan' ? 'grab' : tool === 'box' ? 'crosshair' : 'none';
  return (
    <div
      ref={ov}
      className={`viewer-ov inpaint-ov ${p.leaving ? 'leaving' : ''}`}
      style={{ right: right || undefined }}
      data-enter="fade3"
      role="dialog"
      aria-modal={right ? undefined : 'true'}
      aria-label="局部重绘"
    >
      <div className="viewer-bar ip-top">
        <b>局部重绘</b>
        <Seg
          label="工具"
          value={tool}
          onChange={setTool}
          items={[
            ['brush', <Icon name="brush-line" />, '笔刷：涂上要重画的地方'],
            ['erase', <Icon name="eraser-line" />, '橡皮'],
            ['box', <Icon name="crop-line" />, '框：拖出送去重绘的范围'],
          ]}
        />
        {/* 一直占着位置，选"框"时不可用，换工具时后面的按钮不挪 */}
        <span className="ip-size">
          <Slider
            value={size}
            min={4}
            max={300}
            step={1}
            onChange={setSize}
            label="笔刷大小"
            disabled={tool === 'box'}
          />
          <span className="mono muted">{size}</span>
        </span>
        <span className="vz-sep" />
        <span className="label">框</span>
        <Seg
          label="框的比例"
          value={preset}
          onChange={pickPreset}
          items={[
            ...INPAINT_PRESETS.map(
              (x) => [x.id, x.id, `免费最大：${x.width} × ${x.height}`] as const,
            ),
            ['free', '自由', '不限比例'] as const,
          ]}
        />
        {manual && (
          <button
            className="btn quiet sm"
            data-tip="框跟着涂抹自动走"
            onClick={() => {
              setManual(false);
              const b = bounds(mask.current!);
              setRect(b ? autoRect(b) : null);
            }}
          >
            自动框
          </button>
        )}
        <button className="btn quiet sm" onClick={clear}>
          <Icon name="delete-back-2-line" />
          清除涂抹
        </button>
        <span className="sp" />
        <span className="help">用右边的提示词重绘 · 滚轮缩放 · 按住空格拖动 · [ ] 调笔刷大小</span>
      </div>
      <div
        ref={box}
        className="ip-canvas"
        style={{ cursor }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => setRing(null)}
        onDoubleClick={() => {
          setAnimate(dur(3) > 0);
          setView({ z: 1, x: 0, y: 0 });
        }}
      >
        <div
          ref={stage}
          className="ip-stage"
          style={
            {
              width: fit.w || undefined,
              height: fit.h || undefined,
              transform,
              transition: animate ? 'transform var(--dur-3) var(--ease-move)' : 'none',
              '--vz': view.z,
            } as React.CSSProperties
          }
        >
          <img
            className="alpha-bg"
            src={p.src}
            alt=""
            draggable={false}
            onLoad={(e) => {
              markLoaded(e);
              const im = e.currentTarget;
              if (!dims || dims.W !== im.naturalWidth || dims.H !== im.naturalHeight)
                setDims({ W: im.naturalWidth, H: im.naturalHeight });
            }}
          />
          {dims && <canvas ref={mask} className="ip-mask" width={dims.W} height={dims.H} />}
          {rect && (
            <div
              className={`ip-rect ${manual ? 'manual' : ''}`}
              style={{
                left: `${(rect.x / W) * 100}%`,
                top: `${(rect.y / H) * 100}%`,
                width: `${(rect.width / W) * 100}%`,
                height: `${(rect.height / H) * 100}%`,
              }}
            >
              {tool === 'box' && ['tl', 'tr', 'bl', 'br'].map((c) => <i key={c} className={c} />)}
            </div>
          )}
        </div>
        {ring && tool !== 'box' && !space && (
          <span
            className="ip-ring"
            style={{ left: ring.x, top: ring.y, width: size, height: size }}
          />
        )}
      </div>
      <div className="viewer-bar ip-bar">
        <span className="ip-info">
          {rect && gen ? (
            <span className="mono">
              原图区域 {rect.width} × {rect.height} → 生成 {gen.width} × {gen.height}
              {scaleText}
              {price && <b> · {price}</b>}
            </span>
          ) : null}
          {note ? (
            <span className={`help ${est?.unavailable || error ? 'danger' : ''}`}>{note}</span>
          ) : (
            warn.map((w) => (
              <span key={w} className="help warn">
                {w}
              </span>
            ))
          )}
        </span>
        <span className="sp" />
        {big && (
          <span className="ip-full" data-tip="不缩小，按框本身的大小重绘，会收费">
            <Switch on={fullSize} onChange={setFullSize} label="按原尺寸" />
            按原尺寸
          </span>
        )}
        <span className="label">重绘强度</span>
        <Stepper
          value={strength}
          step={0.05}
          min={0.01}
          max={1}
          digits={2}
          label="重绘强度"
          onChange={setStrength}
        />
        <span className="vz-sep" />
        <button className="btn quiet sm" onClick={close}>
          取消
        </button>
        <button
          className={`btn ink sm ${busy ? 'loading' : ''} ${can || busy ? '' : 'is-off'}`}
          disabled={busy}
          {...(can
            ? { onClick: () => void go() }
            : {
                'aria-disabled': true,
                'data-tip': note || '现在不能重绘',
                onClick: () => {},
              })}
        >
          {busy && <Icon name="loader-4-line" />}
          重绘
        </button>
      </div>
    </div>
  );
}
