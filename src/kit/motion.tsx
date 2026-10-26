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
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

const root = () => document.documentElement;
/**
 * 读一个令牌的数值（`--dur-2`、`--thumb-gap`……）：时长换成毫秒，长度是像素。
 * 正式版的 CSS 压缩会把 240ms 写成 .24s（用户 10-21：1.5.1 里拖拽松手没有归位动效），所以要认单位。
 */
export function ms(name: string) {
  const value = getComputedStyle(root()).getPropertyValue(name).trim();
  const n = parseFloat(value) || 0;
  return /[^m]s$/.test(value) ? n * 1000 : n;
}
export const motionOff = () => root().dataset.motion === 'off';
/** --dur-1 / --dur-2 / --dur-3，动效关闭时是 0。 */
export function dur(k: 1 | 2 | 3) {
  return motionOff() ? 0 : ms(`--dur-${k}`);
}
export const easeMove = () => getComputedStyle(root()).getPropertyValue('--ease-move').trim();
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * 等下一帧画出来以后再开始倒计时，返回取消函数。退出动画要画出来才开始播，
 * 如果倒计时从渲染那一刻就开始，前面主线程卡一下（例如一次重的重渲染），
 * 计时到了动画还没播，元素刚画上淡出的样子就被拿掉（用户 10-25：点"恢复"后"已修改"直接没了）。
 */
export function afterPaint(ms: number, fn: () => void) {
  let t = 0,
    done = false;
  const run = () => {
    if (done) return;
    done = true;
    clearTimeout(t);
    clearTimeout(backup);
    fn();
  };
  const f = requestAnimationFrame(() => {
    t = window.setTimeout(run, ms);
  });
  // 窗口藏起来（托盘）时下一帧可能一直不来，最多再等一秒照样拿掉
  const backup = window.setTimeout(run, ms + 1000);
  return () => {
    done = true;
    cancelAnimationFrame(f);
    clearTimeout(t);
    clearTimeout(backup);
  };
}

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
    return afterPaint(d + 30, () => {
      setMounted(false);
      setLeaving(false);
    });
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
  const timers = useRef(new Map<string, () => void>());
  const [revision, force] = useState(0);
  const fade = dur(1);
  const out = useMemo(() => {
    const keys = items.map(keyOf);
    const live = new Set(keys);
    const next: Exiting<T>[] = items.map((item, i) => ({ item, key: keys[i], leaving: false }));
    prev.current.forEach((p, i) => {
      if (live.has(p.key)) {
        expired.current.delete(p.key);
        return;
      }
      if (!fade || expired.current.has(p.key)) return;
      next.splice(Math.min(i, next.length), 0, { item: p.item, key: p.key, leaving: true });
    });
    return next;
  }, [items, keyOf, fade, revision]);
  useLayoutEffect(() => {
    prev.current = out;
    const leaving = new Set(out.filter((o) => o.leaving).map((o) => o.key));
    for (const [k, cancel] of timers.current)
      if (!leaving.has(k)) {
        cancel();
        timers.current.delete(k);
      }
    for (const k of leaving)
      if (!timers.current.has(k))
        timers.current.set(
          k,
          afterPaint(fade + 30, () => {
            timers.current.delete(k);
            expired.current.add(k);
            force((n) => n + 1);
          }),
        );
  }, [out, fade]);
  useEffect(() => () => timers.current.forEach((cancel) => cancel()), []);
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
      const width = `${on.offsetWidth}px`,
        height = `${on.offsetHeight}px`,
        transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      // 换选中项本身也会让整条宽一两像素（选中的字变粗，英文和数字尤其明显）：这时滑块已经在往对的位置滑，
      // 不打断它。以前一律直接到位，"使用方式""图片模糊"这类带英文的切换就成了跳过去（用户 10-26）
      if (
        ind.style.width === width &&
        ind.style.height === height &&
        ind.style.transform === transform
      )
        return;
      ind.classList.add('jump');
      ind.style.width = width;
      ind.style.height = height;
      ind.style.transform = transform;
      ind.getBoundingClientRect();
      ind.classList.remove('jump');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}

/**
 * 换图片前先把新图解码好，再交给 useSwap。不等的话新图元素一挂上就开始淡入，可图还没画出来，
 * 旧图又先淡出了：中间空一下，新图解码完一下子蹦出来，看着像闪了一下（用户 10-25，图片库详情栏）。
 * 超过 wait 毫秒还没解码完就照换，不让界面干等；src 为空或解码失败也立刻换。key 没变时值照常立刻更新。
 */
export function useDecoded<T>(
  value: T,
  keyOf: (v: T) => string,
  srcOf: (v: T) => string,
  wait = 400,
): T {
  const key = keyOf(value);
  const [ready, setReady] = useState(key);
  const shown = useRef(value);
  if (ready === key) shown.current = value;
  useEffect(() => {
    if (ready === key) return;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setReady(key);
    };
    const src = srcOf(value);
    if (!src) return go();
    const img = new Image();
    img.src = src;
    img.decode().then(go, go);
    const timer = setTimeout(go, wait);
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, [key]);
  return shown.current;
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
    afterPaint(dur(1) + 30, () => setGone((g) => g.filter((x) => x !== prev)));
  }, [key]);
  useLayoutEffect(() => {
    if (last.current?.key === key) last.current.value = value;
  });
  // key 刚变的这一次渲染里，上一份还没进 gone：当场把它当作离开的那一份放在原位。
  // 不这样的话这一帧旧的会被拿掉、下一帧再重建，重建会重播进场动画，看起来闪两下（用户 10-25）
  const prev = last.current;
  const pending = prev && prev.key !== key && dur(1) ? prev : null;
  return [
    ...gone
      .filter((g) => g.key !== key && g.key !== pending?.key)
      .map((g) => ({ ...g, leaving: true })),
    ...(pending ? [{ ...pending, leaving: true }] : []),
    { key, value, leaving: false },
  ];
}
