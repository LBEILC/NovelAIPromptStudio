// 自绘滚动条（doc/design.md 2.11）：全软件统一，一条浮在内容上的细条（--sb-*）。平时看不见，
// 滚动或指针在区域里移动时出现，停下 --sb-idle 后淡出；悬停变粗、可以拖动；避开停在顶部的页头和底部的页脚。
// 用法：滚动的区域带 .scroll 类（或 data-scroll）；要避开的页头、页脚写 data-sb-top / data-sb-bottom="选择器"。
// 整个窗口共用一条，放在 .sb-layer 里（src/styles/01-base.css）。
import { useEffect, useRef } from 'react';
import { ms } from './motion';

const SCROLLER = '.scroll, [data-scroll]';
export function thumbGeometry(
  viewport: number,
  content: number,
  scroll: number,
  inset: number,
  minimum: number,
  top = 0,
  bottom = 0,
) {
  const track = Math.max(0, viewport - top - bottom - inset * 2);
  const range = Math.max(0, content - viewport);
  const size = Math.min(track, Math.max(minimum, (track * viewport) / Math.max(1, content)));
  const travel = track - size;
  return {
    visible: range > 1 && track > 0,
    range,
    travel,
    size,
    offset: top + inset + (range ? (Math.min(range, Math.max(0, scroll)) / range) * travel : 0),
  };
}
const edge = (el: HTMLElement, attr: 'sbTop' | 'sbBottom') => {
  const sel = el.dataset[attr];
  const n = sel ? el.querySelector<HTMLElement>(sel) : null;
  return n ? n.offsetHeight : 0;
};

export function ScrollLayer() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sb = bar.current!;
    let active: HTMLElement | null = null,
      idle = 0,
      over = false,
      drag: { y: number; top: number; k: number } | null = null;
    const place = () => {
      const el = active;
      if (!el || !el.isConnected) {
        sb.classList.remove('show');
        return false;
      }
      const top = edge(el, 'sbTop'),
        bottom = edge(el, 'sbBottom');
      const g = thumbGeometry(
        el.clientHeight,
        el.scrollHeight,
        el.scrollTop,
        ms('--sb-inset'),
        ms('--sb-min'),
        top,
        bottom,
      );
      if (!g.visible) {
        sb.classList.remove('show');
        return false;
      }
      const r = el.getBoundingClientRect();
      // 平时在内容之上、浮层之下；滚的是对话框或浮层里面的内容时，放到它们上面
      sb.parentElement?.classList.toggle('over', !!el.closest('.backdrop, .float'));
      sb.style.height = `${g.size}px`;
      sb.style.transform = `translate(${r.left + el.clientWidth - ms('--sb-inset') - ms('--sb-w')}px, ${r.top + g.offset}px)`;
      return g;
    };
    const wake = (el: HTMLElement) => {
      active = el;
      if (!place()) return;
      sb.classList.add('show');
      clearTimeout(idle);
      idle = window.setTimeout(function hide() {
        if (over || drag) {
          idle = window.setTimeout(hide, ms('--sb-idle'));
          return;
        }
        sb.classList.remove('show');
      }, ms('--sb-idle'));
    };
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.matches(SCROLLER)) wake(t);
    };
    const onMove = (e: PointerEvent) => {
      if (drag) {
        if (!active) return;
        active.scrollTop = drag.top + (e.clientY - drag.y) * drag.k;
        return;
      }
      if (e.target === sb) return;
      const el =
        e.target instanceof Element ? (e.target.closest(SCROLLER) as HTMLElement | null) : null;
      if (el && el.scrollHeight > el.clientHeight + 1) wake(el);
    };
    const onDown = (e: PointerEvent) => {
      if (e.target !== sb || e.button !== 0 || !active) return;
      e.preventDefault();
      e.stopPropagation();
      const g = place();
      if (!g) return;
      drag = { y: e.clientY, top: active.scrollTop, k: g.range / Math.max(1, g.travel) };
      sb.classList.add('drag');
      document.documentElement.classList.add('is-dragging');
    };
    const onUp = () => {
      if (!drag) return;
      drag = null;
      sb.classList.remove('drag');
      document.documentElement.classList.remove('is-dragging');
      if (active) wake(active);
    };
    const enter = () => (over = true);
    const leave = () => (over = false);
    addEventListener('scroll', onScroll, true);
    addEventListener('pointermove', onMove, true);
    addEventListener('pointerdown', onDown, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('resize', () => active && place());
    sb.addEventListener('pointerenter', enter);
    sb.addEventListener('pointerleave', leave);
    return () => {
      removeEventListener('scroll', onScroll, true);
      removeEventListener('pointermove', onMove, true);
      removeEventListener('pointerdown', onDown, true);
      removeEventListener('pointerup', onUp, true);
    };
  }, []);
  return (
    <div className="sb-layer" aria-hidden="true">
      <div className="sb" ref={bar} />
    </div>
  );
}
