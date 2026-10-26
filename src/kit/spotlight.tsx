// 指出控件（doc/design.md 2.40，1.8.4）：功能一览点"去看看"跳到页面以后，目标控件外面一圈墨色描边（和焦点框同色），
// 轻轻闪两下，旁边一个小气泡写"在这里"；不在可见范围先滚过去。点任意地方、Esc 或 6 秒后消失。只指一下，不压暗页面。
// 按 data-feature 找（一个控件可以挂几个 id，空格隔开），不按样式类名：改了布局也指得准。
// 要先切到某个状态的（"参考"页签里的东西）先点 before 那个控件；目标不在时指前提（比如"打开图片"），
// 前提也找不到就交给调用的地方发通知，写"在哪"那一句。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ToWin, useWin } from './layer';

export interface PointSpec {
  /** 目标控件的 data-feature */
  id: string;
  /** 指着目标时气泡里写什么，默认"在这里" */
  tip?: string;
  /** 先点一下这个 data-feature 控件（切页签之类）再找目标 */
  before?: string;
  /** 目标不在时指这里，气泡写 text */
  need?: { id: string; text: string };
}
type Shown = { el: Element; text: string; key: number };

let show: ((s: Shown | null) => void) | null = null;
let seq = 0;

const visible = (el: Element) =>
  el.getClientRects().length > 0 && !el.closest('[inert], [aria-hidden="true"]');
export const findFeature = (id: string) =>
  [...document.querySelectorAll(`[data-feature~="${CSS.escape(id)}"]`)].find(visible) || null;

// 换页有进入动画，页面刚显示时控件可能还没画出来：最多等 1.5 秒。用定时器不用 rAF，窗口在后台时也照常找。
function waitFor(ids: string[], ms = 1500) {
  return new Promise<Element | null>((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      for (const id of ids) {
        const el = findFeature(id);
        if (el) return resolve(el);
      }
      if (performance.now() - t0 > ms) resolve(null);
      else setTimeout(tick, 50);
    };
    tick();
  });
}

/** 指出控件；找不到目标也找不到前提时返回 false，由调用的地方发通知 */
export async function pointAt(spec: PointSpec) {
  const key = ++seq;
  show?.(null);
  if (spec.before) {
    // 前提已经在页面上（没打开图片）就不用等要先点的那个
    const b = await waitFor(spec.need ? [spec.before, spec.need.id] : [spec.before]);
    if (key !== seq) return true;
    if (b instanceof HTMLElement && b.matches(`[data-feature~="${CSS.escape(spec.before)}"]`))
      b.click();
  }
  // 目标和前提一起找：两样一般不会同时在页面上，同时在时指目标
  const el = await waitFor(spec.need ? [spec.id, spec.need.id] : [spec.id]);
  if (key !== seq) return true;
  if (!el) return false;
  const hit = findFeature(spec.id);
  const target = hit || el;
  const text = hit ? spec.tip || '在这里' : spec.need!.text;
  const off = document.documentElement.dataset.motion === 'off';
  target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: off ? 'auto' : 'smooth' });
  show?.({ el: target, text, key });
  return true;
}

type Box = { left: number; top: number; width: number; height: number; winW: number; winH: number };
const same = (a: Box | null, b: Box) =>
  !!a && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

export function Spotlight() {
  const win = useWin();
  const [cur, setCur] = useState<Shown | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [tipW, setTipW] = useState(0);
  useEffect(() => {
    show = setCur;
    return () => {
      show = null;
    };
  }, []);
  useEffect(() => {
    if (!cur) return setBox(null);
    let raf = 0;
    // 跟着目标走：滚过去的过程中、窗口改大小时描边贴着控件
    const track = () => {
      const w = (win.current || document.body).getBoundingClientRect();
      const r = cur.el.getBoundingClientRect();
      const next = {
        left: Math.round(r.left - w.left),
        top: Math.round(r.top - w.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
        winW: w.width,
        winH: w.height,
      };
      setBox((b) => (same(b, next) ? b : next));
      if (!cur.el.isConnected || !visible(cur.el)) return close();
      raf = requestAnimationFrame(track);
    };
    const close = () => setCur((c) => (c?.key === cur.key ? null : c));
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    track();
    const t = setTimeout(close, 6000);
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', esc, true);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', esc, true);
    };
  }, [cur, win]);
  useLayoutEffect(() => setTipW(tip.current?.offsetWidth || 0), [cur?.text, box !== null]);
  if (!cur || !box) return null;
  // 气泡放在目标下面，下面放不下放上面；左右不出窗口
  const gap = 8;
  const below = box.top + box.height + gap + 32 < box.winH;
  const half = tipW / 2;
  const cx = Math.min(Math.max(box.left + box.width / 2, half + gap), box.winW - half - gap);
  return (
    <ToWin>
      <div
        key={cur.key}
        className="spot"
        data-spotlight=""
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      />
      <div
        key={`t${cur.key}`}
        ref={tip}
        className={`tip spot-tip ${below ? 'below' : 'above'}`}
        role="status"
        style={{
          left: cx - half,
          top: below ? box.top + box.height + gap : box.top - gap,
        }}
      >
        {cur.text}
      </div>
    </ToWin>
  );
}
