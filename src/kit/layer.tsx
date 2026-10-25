// 浮层：定位、点外面和 Esc 关闭、进入和退出（doc/design.md 2.11、2.17）。
// 所有浮层都放进 .win 里（position: absolute 相对 .win），原型里 ".win .xxx" 的样式照常生效。
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Presence } from './motion';

const WinContext = createContext<RefObject<HTMLElement | null>>({ current: null });
export const WinProvider = WinContext.Provider;
export const useWin = () => useContext(WinContext);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// 最近一次操作是鼠标还是键盘。浮层关掉后把焦点还给触发它的元素时，如果焦点原来在浮层的输入框里，
// 浏览器会当成键盘操作、画出焦点框（用户 10-25：点开 Tag 再点一下，Tag 上多了个白框）。
// 鼠标关的就先不画，标上 data-pointer-focus；之后一按键或焦点离开就去掉，键盘用户照常看得到。
let pointerLast = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => (pointerLast = true), true);
  document.addEventListener('keydown', () => (pointerLast = false), true);
}
function focusQuietly(el: HTMLElement) {
  if (pointerLast) {
    el.dataset.pointerFocus = '';
    const clear = () => {
      delete el.dataset.pointerFocus;
      el.removeEventListener('blur', clear);
      el.removeEventListener('keydown', clear);
    };
    el.addEventListener('blur', clear);
    el.addEventListener('keydown', clear);
  }
  el.focus({ preventScroll: true });
}

export type Place =
  | 'below-left'
  | 'below-right'
  | 'above-left'
  | 'above-right'
  | 'right-top'
  | 'left-top';
/**
 * 贴着锚点放浮层（原型 placeOverlays）：默认在下面；下面放不下、上面放得下就翻到上面（反过来也一样），
 * 落在锚点上方时加 data-flipped，进入动效改成从下往上；左右超出窗口时往里推，离窗口边至少 --sp-2。
 */
export function placeAt(
  el: HTMLElement,
  win: HTMLElement,
  anchor: Element | null,
  place: Place,
  point?: [number, number],
) {
  const wr = win.getBoundingClientRect(),
    w = el.offsetWidth,
    h = el.offsetHeight,
    edge = 8,
    gap = 6;
  if (point) {
    const [x, y] = point;
    el.style.left = `${Math.max(edge, Math.min(x - wr.left, wr.width - w - edge))}px`;
    el.style.top = `${Math.max(edge, Math.min(y - wr.top, wr.height - h - edge))}px`;
    return;
  }
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  let left = place.endsWith('right') ? r.right - wr.left - w : r.left - wr.left;
  let top = place.startsWith('above') ? r.top - wr.top - h - gap : r.bottom - wr.top + gap;
  if (place === 'right-top') {
    left = r.right - wr.left + gap;
    top = clamp(r.top - wr.top, edge, wr.height - h - edge);
  } else if (place === 'left-top') {
    left = r.left - wr.left - w - gap;
    top = clamp(r.top - wr.top, edge, wr.height - h - edge);
  } else {
    const below = r.bottom - wr.top + gap,
      above = r.top - wr.top - h - gap;
    const flip = place.startsWith('above')
      ? above < edge && below + h <= wr.height - edge
      : below + h > wr.height - edge && above >= edge;
    if (flip) top = place.startsWith('above') ? below : above;
    el.toggleAttribute('data-flipped', top < r.top - wr.top);
  }
  left = Math.max(edge, Math.min(left, wr.width - w - edge));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

// 打开着的浮层按打开的先后排成一叠：Esc 只关最上面那一层；点外面时，点在上层里面的不算"外面"
type Layer = { id: number; close: () => void; inside: (t: Node) => boolean; modal?: boolean };
const stack: Layer[] = [];
let seq = 0;
function onPointerDown(e: PointerEvent) {
  const t = e.target as Node;
  // 从最上层往下：点在哪一层里面，它和它下面的都留着
  for (let i = stack.length - 1; i >= 0; i--) {
    const l = stack[i];
    if (l.inside(t)) return;
    if (l.modal) return;
    l.close();
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !stack.length) return;
  // 焦点在子菜单里：Esc 只关子菜单，交给菜单自己处理
  if ((document.activeElement as Element | null)?.closest?.('.submenu')) return;
  e.preventDefault();
  e.stopPropagation();
  stack[stack.length - 1].close();
}
function install() {
  if (stack.length !== 1) return;
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKey, true);
}
function uninstall() {
  if (stack.length) return;
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('keydown', onKey, true);
}
export const layerOpen = () => stack.length > 0;
/**
 * 打开时登记到浮层的叠里：点外面（refs 和 trigger 之外）、按 Esc 都调用 onClose。
 * trigger 是打开它的那个按钮：点它由按钮自己的动作处理（开着就关、关着就开）。
 */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  refs: RefObject<Element | null>[],
  options: { trigger?: RefObject<Element | null> | string; modal?: boolean } = {},
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const layer: Layer = {
      id: ++seq,
      close: () => close.current(),
      modal: options.modal,
      inside: (t) => {
        if (refs.some((r) => r.current?.contains(t))) return true;
        const tr = options.trigger;
        if (!tr) return false;
        if (typeof tr === 'string') return !!(t instanceof Element && t.closest(tr));
        return !!tr.current?.contains(t);
      },
    };
    stack.push(layer);
    install();
    return () => {
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      uninstall();
    };
  }, [open]);
}

/** 渲染到 .win 里（不在 .win 里时放进 body）。 */
export function ToWin({ children }: { children: ReactNode }) {
  const win = useWin();
  const [el, setEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setEl(win.current || document.body), [win]);
  return el ? createPortal(children, el) : null;
}

export interface PopProps {
  open: boolean;
  onClose: () => void;
  /** 锚点：元素的 ref，或者选择器（在 .win 里找） */
  anchor?: RefObject<Element | null> | string;
  /** 右键菜单这类：按指针的位置放 */
  point?: [number, number];
  place?: Place;
  /** 打开它的按钮：点它不算"点外面" */
  trigger?: RefObject<Element | null> | string;
  className: string;
  /** 进入动效（data-enter），默认 pop；向上弹的 pop-up */
  enter?: string;
  style?: CSSProperties;
  role?: string;
  label?: string;
  children: ReactNode;
  /** 内容变了以后重新定位 */
  deps?: unknown[];
  /** 关闭时把焦点还给触发它的按钮；有 trigger 时默认是 */
  restoreFocus?: boolean;
  /** 不登记点外面关闭（例如悬停弹出的预览） */
  passive?: boolean;
}
/** 一个浮层：菜单、浮层、补全、预览。进入 --dur-2，退出淡出 --dur-1。 */
export function Pop(p: PopProps) {
  // 关的时候里面照最后打开时的样子淡出：调用方多半一关就清掉内容（编辑的 Tag、菜单项），
  // 不留住的话只剩一个空壳在淡出，看着闪一下（用户 10-25）
  const kids = useRef(p.children);
  if (p.open) kids.current = p.children;
  return (
    <Presence show={p.open}>
      {(leaving, ref) => (
        <ToWin>
          <PopBody {...p} leaving={leaving} nodeRef={ref}>
            {p.open ? p.children : kids.current}
          </PopBody>
        </ToWin>
      )}
    </Presence>
  );
}
function PopBody(p: PopProps & { leaving: boolean; nodeRef: RefObject<HTMLElement | null> }) {
  const win = useWin();
  const ref = useRef<HTMLDivElement | null>(null);
  const anchorEl = () =>
    typeof p.anchor === 'string'
      ? (win.current || document).querySelector(p.anchor)
      : p.anchor?.current || null;
  useLayoutEffect(() => {
    p.nodeRef.current = ref.current;
  });
  useLayoutEffect(() => {
    if (p.leaving || !ref.current) return;
    const w = win.current || document.body;
    placeAt(ref.current, w, anchorEl(), p.place || 'below-left', p.point);
  }, [p.leaving, p.point?.[0], p.point?.[1], ...(p.deps || [])]);
  useEffect(() => {
    if (p.leaving || !ref.current) return;
    const el = ref.current,
      w = win.current || document.body;
    const ro = new ResizeObserver(() =>
      placeAt(el, w, anchorEl(), p.place || 'below-left', p.point),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.leaving]);
  useDismiss(p.open && !p.leaving && !p.passive, p.onClose, [ref], { trigger: p.trigger });
  // 关上时焦点回到打开它的地方：优先是触发它的按钮（锚点），其次是打开前有焦点的元素。
  // 只在焦点还在浮层里、或者已经丢到 body 上时才还，用户自己点到别处的不动
  // 有触发按钮的浮层默认还焦点
  const wantFocus = p.restoreFocus ?? !!p.trigger;
  const back = useRef<HTMLElement | null>(null);
  const restored = useRef(false);
  const restore = () => {
    if (!wantFocus || restored.current) return;
    restored.current = true;
    const a = document.activeElement;
    if (a && a !== document.body && !ref.current?.contains(a)) return;
    const resolve = (r: PopProps['trigger']) =>
      typeof r === 'string' ? (win.current || document).querySelector(r) : r?.current || null;
    // 锚点本身不能聚焦（例如包着按钮的 span）时，用它里面的第一个按钮
    const focusable = (el: Element | null) =>
      !el
        ? null
        : el.matches('button, a[href], input, textarea, select, [tabindex]')
          ? el
          : el.querySelector('button, a[href], [tabindex]');
    const target = [resolve(p.trigger), anchorEl(), back.current]
      .map(focusable)
      .find(
        (el): el is HTMLElement =>
          el instanceof HTMLElement && el.isConnected && el !== document.body,
      );
    if (target) focusQuietly(target);
  };
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  useEffect(() => {
    // 开发模式的严格模式会先卸载再挂载一次：重新挂载时重置
    restored.current = false;
    if (wantFocus && !back.current) back.current = document.activeElement as HTMLElement | null;
    // 关闭动效时浮层直接卸载，不经过 leaving
    return () => restoreRef.current();
  }, []);
  useEffect(() => {
    if (p.leaving) restore();
  }, [p.leaving]);
  return (
    <div
      ref={ref}
      className={`${p.className} float ${p.leaving ? 'leaving' : ''}`}
      data-pop=""
      data-enter={p.enter || 'pop'}
      role={p.role}
      aria-label={p.label}
      style={p.style}
    >
      {p.children}
    </div>
  );
}
