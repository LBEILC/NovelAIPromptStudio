// 自绘滚动条（doc/design.md 2.11）：全软件统一，一条浮在内容上的细条（--sb-*）。平时看不见，
// 滚动或指针在区域里移动时出现，停下 --sb-idle 后淡出；悬停变粗、可以拖动；避开停在顶部的页头和底部的页脚。
// 用法：滚动的区域带 .scroll 类（或 data-scroll）；要避开的页头、页脚写 data-sb-top / data-sb-bottom="选择器"。
// 整个窗口共用一条，放在 .sb-layer 里（src/styles/01-base.css）。
import { useEffect, useRef } from 'react';
import { ms } from './motion';

const SCROLLER = '.scroll, [data-scroll]';
// 跟着的区域没了或正在淡出（浮层关掉时先加 .leaving 再拿掉）：滚动条要和它一起走，不能多停一会儿（用户 10-27）
const gone = (el: HTMLElement | null) => !el || !el.isConnected || !!el.closest('.leaving');
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
    // 显示期间盯着整页的增删和类名：跟着的区域一开始淡出或被拿掉，滚动条立刻跟着淡出（用 --dur-1，和浮层的退出一样快）。
    // 只在显示时盯，藏起来就停
    const watcher = new MutationObserver(() => {
      if (gone(active)) hideNow();
    });
    const show = () => {
      sb.classList.remove('quick');
      if (!sb.classList.contains('show'))
        watcher.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class'],
        });
      sb.classList.add('show');
    };
    const hide = () => {
      sb.classList.remove('show');
      watcher.disconnect();
    };
    const hideNow = () => {
      clearTimeout(idle);
      sb.classList.add('quick');
      hide();
    };
    const place = () => {
      const el = active;
      if (!el || gone(el)) {
        hide();
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
        hide();
        return false;
      }
      const r = el.getBoundingClientRect();
      // 平时在内容之上、浮层之下；滚的是对话框或浮层里面的内容时，放到它们上面
      sb.parentElement?.classList.toggle('over', !!el.closest('.backdrop, .float'));
      sb.style.height = `${g.size}px`;
      sb.style.transform = `translate(${r.left + el.clientWidth - ms('--sb-inset') - ms('--sb-w')}px, ${r.top + g.offset}px)`;
      return g;
    };
    // 正在显示的那块区域变大变小、或里面换了内容（例如更新日志切到短的一版、对话框跟着变矮）时重新量，
    // 不让滚动条停在旧的位置和长度上
    const refit = () => {
      if (sb.classList.contains('show')) place();
    };
    const sizes = new ResizeObserver(refit);
    const kids = new MutationObserver(() => {
      if (watched) watchKids(watched);
      refit();
    });
    let watched: HTMLElement | null = null;
    const watchKids = (el: HTMLElement) => {
      sizes.disconnect();
      sizes.observe(el);
      for (const c of el.children) sizes.observe(c);
    };
    const watch = (el: HTMLElement) => {
      if (watched === el) return;
      watched = el;
      kids.disconnect();
      kids.observe(el, { childList: true });
      watchKids(el);
    };
    const wake = (el: HTMLElement) => {
      // 正在淡出的浮层里滚动、指针划过：不再把滚动条叫出来
      if (gone(el)) return;
      active = el;
      watch(el);
      if (!place()) return;
      show();
      clearTimeout(idle);
      idle = window.setTimeout(function idleHide() {
        // 跟着的区域已经没了（例如悬停浮层关掉了）：指针停在滚动条上也要藏起来
        if (gone(active)) return hideNow();
        if (over || drag) {
          idle = window.setTimeout(idleHide, ms('--sb-idle'));
          return;
        }
        hide();
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
      if (e.target === sb) {
        if (gone(active)) hideNow();
        return;
      }
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
      watcher.disconnect();
      sizes.disconnect();
      kids.disconnect();
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
