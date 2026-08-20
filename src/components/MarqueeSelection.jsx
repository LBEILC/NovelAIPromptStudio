import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  decodeMarqueeKey,
  marqueeMode,
  marqueeRect,
  marqueeSelection,
  MARQUEE_DRAG_THRESHOLD,
  rectanglesIntersect,
} from '../lib/marqueeSelection.js';

const INTERACTIVE_SELECTOR = 'a[href], button, input, select, textarea, [contenteditable="true"], [data-marquee-ignore]';

function sameKeys(first, second) {
  return first.length === second.length && first.every((key, index) => key === second[index]);
}

function pointerOnScrollbar(container, event) {
  const bounds = container.getBoundingClientRect();
  const verticalScrollbar = container.offsetWidth - container.clientWidth;
  const horizontalScrollbar = container.offsetHeight - container.clientHeight;
  return (verticalScrollbar > 0 && event.clientX >= bounds.right - verticalScrollbar)
    || (horizontalScrollbar > 0 && event.clientY >= bounds.bottom - horizontalScrollbar);
}

export function MarqueeSelectionOverlay({ rect }) {
  if (!rect || typeof document === 'undefined') return null;
  return createPortal(<div
    aria-hidden="true"
    className="marquee-selection-box"
    style={{ height: rect.height, left: rect.left, top: rect.top, width: rect.width }}
  />, document.body);
}

export function useMarqueeSelection({
  containerRef,
  enabled = true,
  itemSelector = '[data-marquee-key]',
  onSelectionChange,
  selectedKeys = [],
}) {
  const [rect, setRect] = useState(null);
  const dragRef = useRef(null);
  const selectedKeysRef = useRef(selectedKeys);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const suppressClickRef = useRef(false);

  selectedKeysRef.current = selectedKeys;
  onSelectionChangeRef.current = onSelectionChange;

  const updateSelection = (point) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return false;
    drag.point = point;
    const distance = Math.hypot(point.x - drag.start.x, point.y - drag.start.y);
    if (!drag.active && distance < MARQUEE_DRAG_THRESHOLD) return false;
    if (!drag.active) {
      drag.active = true;
      document.documentElement.classList.add('is-marquee-selecting');
    }
    const nextRect = marqueeRect(drag.start, point);
    const hitKeys = [...container.querySelectorAll(itemSelector)]
      .filter((element) => rectanglesIntersect(nextRect, element.getBoundingClientRect()))
      .map((element) => decodeMarqueeKey(element.getAttribute('data-marquee-key')))
      .filter(Boolean);
    const nextSelection = marqueeSelection(drag.initialKeys, hitKeys, drag.mode);
    if (!sameKeys(drag.lastSelection, nextSelection)) {
      drag.lastSelection = nextSelection;
      onSelectionChangeRef.current?.(nextSelection);
    }
    setRect(nextRect);
    return true;
  };

  const finishSelection = (event, canceled = false) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!canceled) updateSelection({ x: event.clientX, y: event.clientY });
    if (drag.active) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      event.preventDefault();
      event.stopPropagation();
    } else if (!canceled && !drag.startKey && drag.mode === 'replace') {
      onSelectionChangeRef.current?.([]);
    }
    dragRef.current = null;
    setRect(null);
    document.documentElement.classList.remove('is-marquee-selecting');
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => () => {
    document.documentElement.classList.remove('is-marquee-selecting');
  }, []);

  const handlers = {
    onClickCapture: (event) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onLostPointerCapture: (event) => {
      if (dragRef.current?.pointerId === event.pointerId) finishSelection(event, true);
    },
    onPointerCancel: (event) => finishSelection(event, true),
    onPointerDownCapture: (event) => {
      if (!enabled || event.button !== 0 || event.pointerType === 'touch') return;
      const container = containerRef.current;
      if (!container || pointerOnScrollbar(container, event)) return;
      const target = event.target;
      const item = target.closest?.(itemSelector);
      if (target.closest?.(INTERACTIVE_SELECTOR) && !item) return;
      const startKey = item ? decodeMarqueeKey(item.getAttribute('data-marquee-key')) : '';
      dragRef.current = {
        active: false,
        initialKeys: [...selectedKeysRef.current],
        lastSelection: [...selectedKeysRef.current],
        mode: marqueeMode(event),
        point: { x: event.clientX, y: event.clientY },
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        startKey,
      };
      container.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      if (updateSelection({ x: event.clientX, y: event.clientY })) event.preventDefault();
    },
    onPointerUp: (event) => finishSelection(event),
  };

  return { handlers, rect };
}
