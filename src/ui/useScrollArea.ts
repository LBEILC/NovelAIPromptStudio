import { useLayoutEffect, type RefObject } from 'react';
import './scroll.css';

export function scrollThumbGeometry(
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

/** Adds a visual scrollbar without replacing the native scroll container. */
export function useScrollArea(
  ref: RefObject<HTMLElement | null>,
  {
    topInset,
    bottomInset,
    enabled = true,
    overlayRef,
  }: {
    topInset?: string;
    bottomInset?: string;
    enabled?: boolean;
    overlayRef?: RefObject<HTMLElement | null>;
  } = {},
) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    const overlay = overlayRef?.current || node;
    const thumb = node.ownerDocument.createElement('span');
    thumb.className = 'nps-scroll-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    thumb.setAttribute('data-marquee-ignore', 'true');
    const previousPosition = overlay.style.position;
    if (getComputedStyle(overlay).position === 'static') overlay.style.position = 'relative';
    node.classList.add('nps-scroll-host');
    overlay.append(thumb);
    let hovered = false;
    let dragging: { y: number; scroll: number; pointerId: number } | null = null;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const token = (name?: string) =>
      name ? parseFloat(getComputedStyle(node).getPropertyValue(name)) || 0 : 0;
    const geometry = () =>
      scrollThumbGeometry(
        node.clientHeight,
        node.scrollHeight,
        node.scrollTop,
        token('--sb-inset'),
        token('--sb-min'),
        token(topInset),
        token(bottomInset),
      );
    const measure = () => {
      frame = 0;
      // Exclude the old thumb from content height without dropping pointer capture.
      thumb.style.top = '0px';
      thumb.style.height = '0px';
      const metrics = geometry();
      thumb.hidden = !metrics.visible;
      thumb.style.height = `${metrics.size}px`;
      // Include scrollTop so the absolute thumb stays in the viewport.
      thumb.style.top = `${(overlay === node ? node.scrollTop : node.offsetTop) + metrics.offset}px`;
      thumb.style.right = `${token('--sb-inset') - (overlay === node ? node.scrollLeft : 0)}px`;
      node.toggleAttribute('data-scrolled', node.scrollTop > 0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const reveal = () => {
      thumb.dataset.visible = 'true';
      clearTimeout(idle);
      const duration = getComputedStyle(node).getPropertyValue('--sb-idle').trim();
      const milliseconds = parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
      idle = setTimeout(() => {
        if (!hovered && !dragging) delete thumb.dataset.visible;
      }, milliseconds);
    };
    const scroll = () => {
      measure();
      reveal();
    };
    const enter = () => {
      hovered = true;
      reveal();
    };
    const leave = () => {
      hovered = false;
      reveal();
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = { y: event.clientY, scroll: node.scrollTop, pointerId: event.pointerId };
      thumb.dataset.dragging = 'true';
      thumb.setPointerCapture(event.pointerId);
      reveal();
    };
    const move = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      if (!event.buttons) {
        release(event);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const metrics = geometry();
      if (metrics.travel)
        node.scrollTop =
          dragging.scroll + ((event.clientY - dragging.y) * metrics.range) / metrics.travel;
      measure();
    };
    const release = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      event.stopPropagation();
      dragging = null;
      delete thumb.dataset.dragging;
      reveal();
    };
    const observed = new Set<Element>();
    const resize = new ResizeObserver(schedule);
    resize.observe(node);
    const observeContents = () => {
      for (const child of observed)
        if (child.parentElement !== node) {
          resize.unobserve(child);
          observed.delete(child);
        }
      for (const child of node.children)
        if (child !== thumb && !observed.has(child)) {
          observed.add(child);
          resize.observe(child);
        }
    };
    const mutations = new MutationObserver((records) => {
      if (
        records.every(
          (record) =>
            record.target === thumb || (record.target === node && record.type === 'attributes'),
        )
      )
        return;
      observeContents();
      schedule();
    });
    mutations.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
    observeContents();
    node.addEventListener('scroll', scroll, { passive: true });
    node.addEventListener('input', schedule);
    node.addEventListener('pointermove', reveal, { passive: true });
    node.addEventListener('pointerleave', reveal, { passive: true });
    thumb.addEventListener('pointerenter', enter);
    thumb.addEventListener('pointerleave', leave);
    thumb.addEventListener('pointerdown', down);
    // Keep dragging reliable in hidden Electron windows and outside the thumb.
    node.ownerDocument.addEventListener('pointermove', move, true);
    node.ownerDocument.addEventListener('pointerup', release, true);
    node.ownerDocument.addEventListener('pointercancel', release, true);
    measure();
    return () => {
      clearTimeout(idle);
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
      node.removeEventListener('scroll', scroll);
      node.removeEventListener('input', schedule);
      node.removeEventListener('pointermove', reveal);
      node.removeEventListener('pointerleave', reveal);
      node.ownerDocument.removeEventListener('pointermove', move, true);
      node.ownerDocument.removeEventListener('pointerup', release, true);
      node.ownerDocument.removeEventListener('pointercancel', release, true);
      node.classList.remove('nps-scroll-host');
      node.removeAttribute('data-scrolled');
      overlay.style.position = previousPosition;
      thumb.remove();
    };
  }, [ref, topInset, bottomInset, enabled, overlayRef]);
}
