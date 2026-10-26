// 拖动分隔线改栏宽（doc/design.md 2.11）：指针移到 --split-hit 范围内，--rule-w 的墨色线淡入，指针变左右箭头；
// 拖动跟手；双击恢复默认宽度；键盘焦点在分隔线上时方向键每次 --split-step，按住 Shift 乘以 4。宽度记住。
// 宽度写在根元素的 --<key>-w-live 上（src/styles/07-core.css 里各栏的 width 读它）。
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { layerOpen } from './layer';
import { ms } from './motion';
import { panelStorage, readPanelWidth, writePanelWidth } from '../lib/panelLayout.js';

export interface PanelSpec {
  /** 根元素上的变量名：--<key>-w-live */
  key: string;
  edge: 'left' | 'right';
  min: () => number;
  max: () => number;
  def: () => number;
  /** 记住宽度用的本地存储键 */
  storage: string;
  label: string;
}
const root = () => document.documentElement;

export function useResizable(panel: RefObject<HTMLElement | null>, spec: PanelSpec) {
  const [width, setWidth] = useState(() =>
    readPanelWidth(panelStorage(), spec.storage, 0, spec.min(), Number.MAX_SAFE_INTEGER),
  );
  const apply = (w: number) => {
    if (w) root().style.setProperty(`--${spec.key}-w-live`, `${w}px`);
    else root().style.removeProperty(`--${spec.key}-w-live`);
  };
  useLayoutEffect(() => apply(width), [width]);
  const save = (w: number) => {
    const n = w ? Math.round(Math.max(spec.min(), Math.min(spec.max(), w))) : 0;
    setWidth(n);
    apply(n);
    if (n) writePanelWidth(panelStorage(), spec.storage, n, spec.min(), Number.MAX_SAFE_INTEGER);
    else
      try {
        panelStorage()?.removeItem(spec.storage);
      } catch {
        /* 记不住也照常能用 */
      }
  };
  const current = () => panel.current?.getBoundingClientRect().width || spec.def();
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    let hot = false,
      drag: { x: number; w: number } | null = null;
    const near = (e: PointerEvent) => {
      // 上面盖着弹框、大图、菜单这类浮层时不算：指针在浮层上，分隔线不亮也拖不动（用户 10-26）
      if (
        layerOpen() ||
        (e.target as Element | null)?.closest?.(
          '[role="dialog"], [role="menu"], .backdrop, .popover, .viewer-ov',
        )
      )
        return false;
      const r = el.getBoundingClientRect(),
        x = spec.edge === 'right' ? r.right : r.left;
      return (
        Math.abs(e.clientX - x) <= ms('--split-hit') / 2 &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      );
    };
    const mark = (on: boolean) => {
      if (hot === on) return;
      hot = on;
      el.classList.toggle('rz-hot', on);
      root().classList.toggle('rz-cursor', on);
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !near(e)) return;
      e.preventDefault();
      e.stopPropagation();
      drag = { x: e.clientX, w: current() };
      root().classList.add('rz-dragging');
      mark(true);
    };
    const move = (e: PointerEvent) => {
      if (drag) {
        const dir = spec.edge === 'right' ? 1 : -1,
          w = Math.round(
            Math.max(spec.min(), Math.min(spec.max(), drag.w + (e.clientX - drag.x) * dir)),
          );
        apply(w);
        setWidth(w);
        return;
      }
      if (!(e.buttons & 1)) mark(near(e));
    };
    const up = () => {
      if (!drag) return;
      drag = null;
      root().classList.remove('rz-dragging');
      save(current());
      // 松手那一下紧跟着的点击不算
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', swallow, { capture: true }), 0);
    };
    const dbl = (e: MouseEvent) => {
      if (!near(e as PointerEvent)) return;
      e.stopPropagation();
      save(0);
    };
    addEventListener('pointerdown', down, true);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('dblclick', dbl, true);
    return () => {
      removeEventListener('pointerdown', down, true);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('dblclick', dbl, true);
      mark(false);
    };
  }, [panel.current]);
  /** 放在栏里的键盘分隔条（看不见；获得键盘焦点时显示那条线） */
  const handle = (
    <div
      className={`rz-key rz-${spec.edge}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={spec.label}
      aria-valuemin={Math.round(spec.min())}
      aria-valuemax={Math.round(spec.max())}
      aria-valuenow={Math.round(width || spec.def())}
      tabIndex={0}
      onFocus={() => panel.current?.classList.add('rz-hot')}
      onBlur={() => panel.current?.classList.remove('rz-hot')}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        if (!d) return;
        e.preventDefault();
        const step = ms('--split-step') * (e.shiftKey ? 4 : 1);
        save(current() + d * step * (spec.edge === 'right' ? 1 : -1));
      }}
      onDoubleClick={() => save(0)}
    />
  );
  return { width: width || spec.def(), handle, reset: () => save(0) };
}
