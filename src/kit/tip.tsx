// 悬停提示（doc/design.md 2.18）：用产品的提示块，不用系统的 title。
// 停 500ms 出现；刚关掉的 300ms 内移到另一个上立即出现；按下、滚动、Esc 收起；键盘焦点移上去立即出现。
// 默认在下方居中，下面放不下就放上面。
// 用法：元素上写 data-tip="…"；只有图标的按钮（.btn.icon）用 aria-label；
// data-tip-side="right" 放在右边（菜单项，不盖住下面几项）；
// data-tip-overflow="全文" 只在文字被省略时提示；放不下时字被收起来的按钮（.lbl 被藏起）也用 aria-label。
import { useEffect, useRef } from 'react';

const blockers: (() => boolean)[] = [];
const blocked = () => blockers.some((fn) => fn());
/** 拖动这类时候不出提示（可以登记多个条件）。 */
export function blockTips(fn: () => boolean) {
  blockers.push(fn);
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function TipLayer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = ref.current!;
    let timer = 0,
      reset = 0,
      warm = false,
      target: Element | null = null,
      down = false;
    const collapsed = (n: Element) => {
      const b = n.closest('.btn[aria-label]'),
        l = b?.querySelector(':scope > .lbl');
      return l && getComputedStyle(l).display === 'none' ? b : null;
    };
    const tipOf = (node: EventTarget | null) => {
      if (!(node instanceof Element)) return null;
      const el =
        node.closest('[data-tip], [data-tip-overflow], .btn.icon[aria-label]') || collapsed(node);
      if (!el || el.closest('[data-no-tip]')) return null;
      return el;
    };
    const hide = () => {
      clearTimeout(timer);
      target = null;
      if (tip.classList.contains('on')) {
        tip.classList.remove('on');
        clearTimeout(reset);
        reset = window.setTimeout(() => {
          warm = false;
        }, 300);
      }
    };
    const show = (el: Element | null, now = false) => {
      if (!el || el === target) return;
      hide();
      const h = el as HTMLElement;
      if (
        h.dataset.tipOverflow != null &&
        !h.dataset.tip &&
        h.scrollWidth <= h.clientWidth &&
        h.scrollHeight <= h.clientHeight
      )
        return;
      const text = h.dataset.tip || h.dataset.tipOverflow || h.getAttribute('aria-label') || '';
      if (!text || blocked()) return;
      target = el;
      clearTimeout(reset);
      const reveal = () => {
        if (!el.isConnected || target !== el) return;
        warm = true;
        tip.textContent = text;
        const r = el.getBoundingClientRect(),
          gap = 6,
          w = tip.offsetWidth,
          th = tip.offsetHeight;
        if ((el as HTMLElement).dataset.tipSide === 'right') {
          // 菜单项这类一列排下来的：放在右边，不盖住下面几项；右边放不下放左边
          const box =
            (el.closest('.menu') || el.closest('[role="menu"]'))?.getBoundingClientRect() || r;
          const left = box.right + gap + w <= innerWidth - 8 ? box.right + gap : box.left - gap - w;
          tip.style.left = `${clamp(left, 8, innerWidth - w - 8)}px`;
          tip.style.top = `${clamp(r.top, 8, innerHeight - th - 8)}px`;
        } else {
          let top = r.bottom + gap;
          if (top + th > innerHeight - 8 && r.top - gap - th >= 8) top = r.top - gap - th;
          tip.style.left = `${clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8)}px`;
          tip.style.top = `${top}px`;
        }
        tip.classList.add('on');
      };
      if (now || warm) reveal();
      else timer = window.setTimeout(reveal, 500);
    };
    const over = (e: PointerEvent) => {
      if (!down) show(tipOf(e.target));
    };
    const out = (e: PointerEvent) => {
      const next = tipOf(e.relatedTarget);
      if (next !== target) {
        hide();
        if (next && !down) show(next);
      }
    };
    const press = () => {
      down = true;
      hide();
    };
    const release = () => {
      down = false;
    };
    const focus = (e: FocusEvent) => {
      if (!down && e.target instanceof Element && e.target.matches(':focus-visible'))
        show(tipOf(e.target), true);
    };
    const key = (e: KeyboardEvent) => {
      down = false;
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', key, true);
    addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', press, true);
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', key, true);
      removeEventListener('scroll', hide, true);
    };
  }, []);
  return <div ref={ref} className="tip-pop" role="tooltip" />;
}
