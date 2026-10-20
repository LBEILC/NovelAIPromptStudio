// 动效的底层工具：和交互原型的做法一一对应（doc/design.md 2.17）。
// - 进入：元素第一次挂载时带 data-enter，由 CSS 播一次（src/styles/07-core.css 的 pf-* 关键帧）。
// - 退出：被拿掉的元素先留着，加 .leaving（CSS 里从当前的样子淡出 --dur-1），之后再真正移除。
// - 移动：FlipScope 在 DOM 更新前记下 [data-flip] 元素的位置，更新后从旧位置滑到新位置（--dur-3 --ease-move）。
// - 会滑的标记：.has-ind 里的 .ind 停在 .on（或 aria-current）的那一项下面。
// 动效关闭（html[data-motion="off"]）时时长都是 0，一切直接到位。
import {
  Component,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

const root = () => document.documentElement;
/** 读一个以毫秒为单位的令牌（`--dur-2`、`--thumb-gap`……）。 */
export function ms(name: string) {
  return parseFloat(getComputedStyle(root()).getPropertyValue(name)) || 0;
}
export const motionOff = () => root().dataset.motion === 'off';
/** --dur-1 / --dur-2 / --dur-3，动效关闭时是 0。 */
export function dur(k: 1 | 2 | 3) {
  return motionOff() ? 0 : ms(`--dur-${k}`);
}
export const easeMove = () => getComputedStyle(root()).getPropertyValue('--ease-move').trim();
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** 单个元素的出现和消失：show 变 false 后保留 --dur-1，期间 leaving 为 true。 */
export function usePresence(show: boolean) {
  const [mounted, setMounted] = useState(show);
  const [leaving, setLeaving] = useState(false);
  useLayoutEffect(() => {
    if (show) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    const d = dur(1);
    if (!d) {
      setMounted(false);
      return;
    }
    setLeaving(true);
    const t = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, d + 30);
    return () => clearTimeout(t);
  }, [show]);
  return { mounted: show || mounted, leaving: !show && leaving };
}

/** 退出时淡出：从当前的透明度到 0，--dur-1，不位移。 */
export function fadeOut(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return;
  const d = dur(1);
  if (!d) return;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], {
    duration: d,
    easing: EASE_OUT,
    fill: 'forwards',
  });
}

/**
 * 一个元素：show 为 false 时淡出再卸载。children 是一个函数，拿到 leaving 自己加 .leaving（不能点）。
 * 用在浮层、对话框、通知、多选条这类只有一个的东西上。
 */
export function Presence({
  show,
  children,
}: {
  show: boolean;
  children: (leaving: boolean, ref: RefObject<HTMLElement | null>) => ReactNode;
}) {
  const { mounted, leaving } = usePresence(show);
  const ref = useRef<HTMLElement | null>(null);
  return mounted ? children(leaving, ref) : null;
}

export interface Exiting<T> {
  item: T;
  key: string;
  leaving: boolean;
}
/**
 * 列表里的增减：拿掉的项留在原来的位置，leaving 为 true，--dur-1 后才真正去掉。
 * 配合 FlipScope：留下的项在拿掉的那一项真正移除时补位（"删掉的先淡出，其他再补位"）。
 */
export function useExitList<T>(items: T[], keyOf: (item: T) => string): Exiting<T>[] {
  const prev = useRef<Exiting<T>[]>([]);
  const expired = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());
  const [, force] = useState(0);
  const keys = items.map(keyOf);
  const live = new Set(keys);
  const out: Exiting<T>[] = items.map((item, i) => ({ item, key: keys[i], leaving: false }));
  const fade = dur(1);
  prev.current.forEach((p, i) => {
    if (live.has(p.key)) {
      expired.current.delete(p.key);
      return;
    }
    if (!fade || expired.current.has(p.key)) return;
    out.splice(Math.min(i, out.length), 0, { item: p.item, key: p.key, leaving: true });
  });
  useLayoutEffect(() => {
    prev.current = out;
    const leaving = new Set(out.filter((o) => o.leaving).map((o) => o.key));
    for (const [k, t] of timers.current)
      if (!leaving.has(k)) {
        clearTimeout(t);
        timers.current.delete(k);
      }
    for (const k of leaving)
      if (!timers.current.has(k))
        timers.current.set(
          k,
          window.setTimeout(() => {
            timers.current.delete(k);
            expired.current.add(k);
            force((n) => n + 1);
          }, fade + 30),
        );
  });
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  return out;
}

type Snapshot = Map<string, DOMRect | number>;
function capture(el: HTMLElement | null): Snapshot {
  const m: Snapshot = new Map();
  if (!el) return m;
  el.querySelectorAll<HTMLElement>('[data-flip]').forEach((n) => {
    if (n.dataset.key) m.set(n.dataset.key, n.getBoundingClientRect());
  });
  el.querySelectorAll<HTMLElement>('[data-grow]').forEach((n) => {
    if (n.dataset.key) m.set(`h:${n.dataset.key}`, n.offsetHeight);
  });
  return m;
}
function play(el: HTMLElement | null, before: Snapshot) {
  if (!el || !dur(3)) return;
  el.querySelectorAll<HTMLElement>('[data-grow]').forEach((n) => {
    const h0 = before.get(`h:${n.dataset.key}`) as number | undefined,
      h1 = n.offsetHeight;
    if (h0 == null || Math.abs(h0 - h1) < 1) return;
    n.style.overflow = 'hidden';
    n.animate([{ height: `${h0}px` }, { height: `${h1}px` }], {
      duration: dur(3),
      easing: easeMove(),
    }).onfinish = () => {
      n.style.overflow = '';
    };
  });
  el.querySelectorAll<HTMLElement>('[data-flip]').forEach((n) => {
    const r0 = before.get(n.dataset.key || '') as DOMRect | undefined;
    if (!r0 || n.classList.contains('leaving')) return;
    const r1 = n.getBoundingClientRect(),
      dx = r0.left - r1.left,
      dy = r0.top - r1.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    n.style.transition = 'none';
    n.style.transform = `translate(${dx}px,${dy}px)`;
    n.getBoundingClientRect();
    n.style.transition =
      'transform var(--dur-3) var(--ease-move), opacity var(--dur-1) var(--ease-out)';
    n.style.transform = '';
    n.addEventListener(
      'transitionend',
      () => {
        n.style.transition = '';
      },
      { once: true },
    );
  });
}
/**
 * 包住一块会让位的内容：每次重画前记下 [data-flip][data-key] 的位置和 [data-grow] 的高度，
 * 重画后从旧的位置移到新的位置。离开时 data-exit="lift" 的项先按原来的位置浮起来，留下的立刻补位。
 */
export class FlipScope extends Component<{
  root: RefObject<HTMLElement | null>;
  children: ReactNode;
}> {
  getSnapshotBeforeUpdate() {
    return capture(this.props.root.current);
  }
  componentDidUpdate(_p: unknown, _s: unknown, before: Snapshot) {
    const el = this.props.root.current;
    el?.querySelectorAll<HTMLElement>('[data-exit="lift"].leaving:not([data-lifted])').forEach(
      (n) => {
        const r0 = before.get(n.dataset.key || '') as DOMRect | undefined,
          p = n.offsetParent as HTMLElement | null;
        if (!r0 || !p) return;
        const pr = p.getBoundingClientRect();
        Object.assign(n.style, {
          position: 'absolute',
          margin: '0',
          left: `${r0.left - pr.left + p.scrollLeft}px`,
          top: `${r0.top - pr.top + p.scrollTop}px`,
          width: `${r0.width}px`,
          transform: '',
        });
        n.dataset.lifted = '';
      },
    );
    play(el, before);
  }
  render() {
    return this.props.children;
  }
}

/** .has-ind 里的 .ind 停在当前项下面；第一次直接到位，之后滑过去（CSS 里 .ind 的过渡）。 */
export function useIndicator(box: RefObject<HTMLElement | null>, deps: unknown[]) {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const ind = el.querySelector<HTMLElement>(':scope > .ind');
      const on = el.querySelector<HTMLElement>(':scope > .on, :scope > [aria-current="page"]');
      if (!ind) return;
      if (!on) {
        ind.style.opacity = '0';
        return;
      }
      const first = !ind.dataset.placed;
      if (first) ind.classList.add('jump');
      ind.style.opacity = '1';
      ind.style.width = `${on.offsetWidth}px`;
      ind.style.height = `${on.offsetHeight}px`;
      ind.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      if (first) {
        ind.getBoundingClientRect();
        ind.classList.remove('jump');
        ind.dataset.placed = '1';
      }
    };
    place();
  }, deps);
  // 大小变了（窗口、字体）时直接到位，不滑。只建一次：新建的监听会马上回调一次，会打断刚开始的滑动
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let size = '';
    const ro = new ResizeObserver(() => {
      const next = `${el.offsetWidth}x${el.offsetHeight}`;
      if (next === size) return;
      const first = !size;
      size = next;
      if (first) return;
      const ind = el.querySelector<HTMLElement>(':scope > .ind');
      const on = el.querySelector<HTMLElement>(':scope > .on, :scope > [aria-current="page"]');
      if (!ind || !on) return;
      ind.classList.add('jump');
      ind.style.width = `${on.offsetWidth}px`;
      ind.style.height = `${on.offsetHeight}px`;
      ind.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      ind.getBoundingClientRect();
      ind.classList.remove('jump');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}

/** 换内容（2.17）：key 变了时旧的淡出、新的淡入。返回当前和正在离开的两份。 */
export function useSwap<T>(value: T, keyOf: (v: T) => string) {
  const key = keyOf(value);
  // 只记正在离开的；当前这一份永远用传进来的值
  const last = useRef<{ key: string; value: T } | null>(null);
  const [gone, setGone] = useState<{ key: string; value: T }[]>([]);
  useLayoutEffect(() => {
    const prev = last.current;
    last.current = { key, value };
    if (!prev || prev.key === key || !dur(1)) return;
    setGone((g) => [...g.filter((x) => x.key !== key && x.key !== prev.key), prev]);
    setTimeout(() => setGone((g) => g.filter((x) => x !== prev)), dur(1) + 30);
  }, [key]);
  useLayoutEffect(() => {
    if (last.current?.key === key) last.current.value = value;
  });
  return [
    ...gone.filter((g) => g.key !== key).map((g) => ({ ...g, leaving: true })),
    { key, value, leaving: false },
  ];
}
