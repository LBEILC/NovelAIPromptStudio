import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  DragOverlay,
  defaultDropAnimationSideEffects,
  useDroppable,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

export function motionMilliseconds(value: string) {
  const time = value.trim();
  return parseFloat(time) * (time.endsWith('ms') ? 1 : 1000);
}

export function TagInsertionSlot({
  id,
  target,
  width,
  height,
}: {
  id: string;
  target: { section: number; block: number; index?: number };
  width: number;
  height: number;
}) {
  const drop = useDroppable({ id, data: { target } });
  return (
    <span
      ref={drop.setNodeRef}
      aria-hidden="true"
      className="wb-insertion-slot"
      style={{ width, height }}
    />
  );
}

/** Translate real flex positions; never borrow the size of another item. */
export function useTagDragLayout(root: RefObject<HTMLElement | null>, dragging: boolean) {
  const previous = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    const style = getComputedStyle(document.documentElement);
    const nodes = [...(root.current?.querySelectorAll<HTMLElement>('[data-wb-tag]') ?? [])].filter(
      (node) => getComputedStyle(node).visibility !== 'hidden',
    );
    const scroll = root.current?.querySelector<HTMLElement>('.wb-document-scroll');
    const measure = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      const bounds = scroll?.getBoundingClientRect();
      return new DOMRect(
        rect.left - (bounds?.left ?? 0) + (scroll?.scrollLeft ?? 0),
        rect.top - (bounds?.top ?? 0) + (scroll?.scrollTop ?? 0),
        rect.width,
        rect.height,
      );
    };
    for (const node of nodes) for (const animation of node.getAnimations()) animation.cancel();
    const animations: Animation[] = [];
    for (const node of nodes) {
      const key = node.dataset.wbTag!;
      const rect = measure(node);
      const old = previous.current.get(key);
      if (
        dragging &&
        old &&
        (old.left !== rect.left || old.top !== rect.top) &&
        document.documentElement.dataset.motion !== 'off'
      ) {
        animations.push(
          node.animate(
            [
              { transform: `translate(${old.left - rect.left}px, ${old.top - rect.top}px)` },
              { transform: 'none' },
            ],
            {
              duration: motionMilliseconds(style.getPropertyValue('--dur-3')),
              easing: style.getPropertyValue('--ease-move').trim(),
            },
          ),
        );
      }
      next.set(key, rect);
    }
    previous.current = next;
    // Wrapping can make straight FLIP paths cross. Advance the whole layout to
    // the next collision-free frame before painting, without scaling any item.
    let frame = 0;
    const guard = () => {
      const overlap = () => {
        const rects = [
          ...nodes.map((node) => (node.querySelector('.nps-tag') ?? node).getBoundingClientRect()),
          ...[...(root.current?.querySelectorAll('.wb-insertion-slot') ?? [])].map((node) =>
            node.getBoundingClientRect(),
          ),
        ];
        return rects.some((a, i) =>
          rects
            .slice(i + 1)
            .some(
              (b) =>
                a.left < b.right - 0.5 &&
                a.right > b.left + 0.5 &&
                a.top < b.bottom - 0.5 &&
                a.bottom > b.top + 0.5,
            ),
        );
      };
      while (overlap() && animations.some((animation) => animation.playState === 'running')) {
        for (const animation of animations) {
          const duration = Number(animation.effect?.getTiming().duration) || 0;
          animation.currentTime = Math.min(duration, Number(animation.currentTime) + duration / 60);
          if (Number(animation.currentTime) >= duration) animation.finish();
        }
      }
      previous.current = new Map(nodes.map((node) => [node.dataset.wbTag!, measure(node)]));
      if (animations.some((animation) => animation.playState === 'running'))
        frame = requestAnimationFrame(guard);
    };
    if (animations.length) guard();
    return () => cancelAnimationFrame(frame);
  });
}

/** Snapshot the rendered item without adding another draggable or duplicate IDs. */
export function restrictDrag(
  { transform, draggingNodeRect }: Parameters<Modifier>[0],
  container: HTMLElement | null,
  horizontal = false,
) {
  if (!container || !draggingNodeRect) return transform;
  const bounds = container.getBoundingClientRect();
  const scale =
    document.documentElement.dataset.motion === 'off'
      ? 1
      : parseFloat(getComputedStyle(container).getPropertyValue('--drag-scale')) || 1;
  const insetX = (draggingNodeRect.width * (scale - 1)) / 2;
  const insetY = horizontal ? 0 : (draggingNodeRect.height * (scale - 1)) / 2;
  return {
    ...transform,
    x: Math.max(
      bounds.left - draggingNodeRect.left + insetX,
      Math.min(transform.x, bounds.right - draggingNodeRect.right - insetX),
    ),
    y: horizontal
      ? 0
      : Math.max(
          bounds.top - draggingNodeRect.top + insetY,
          Math.min(transform.y, bounds.bottom - draggingNodeRect.bottom - insetY),
        ),
    scaleX: 1,
    scaleY: 1,
  };
}

export function useDragFeedback(container?: RefObject<HTMLElement | null>, horizontal = false) {
  const [snapshot, setSnapshot] = useState<{ html: string; width: number; height: number } | null>(
    null,
  );
  const [timing, setTiming] = useState({ duration: 0, easing: 'linear' });
  const landing = useRef<{ left: number; top: number } | null>(null);
  const start = (event: DragStartEvent, node: HTMLElement | null) => {
    landing.current = null;
    if (!node) return;
    const style = getComputedStyle(document.documentElement);
    setTiming({
      duration:
        document.documentElement.dataset.motion === 'off'
          ? 0
          : motionMilliseconds(style.getPropertyValue('--dur-3')),
      easing: style.getPropertyValue('--ease-move').trim(),
    });
    const clone = node.cloneNode(true) as HTMLElement;
    for (const item of [clone, ...clone.querySelectorAll('*')]) {
      for (const name of item.getAttributeNames())
        if (
          name === 'id' ||
          (name.startsWith('data-') && !name.startsWith('data-image-')) ||
          name.startsWith('aria-') ||
          name === 'tabindex'
        )
          item.removeAttribute(name);
    }
    for (const image of clone.querySelectorAll('.nps-decoded-image')) {
      image.setAttribute('data-image-ready', 'true');
      image.setAttribute('data-image-immediate', 'true');
    }
    clone.style.transform = '';
    const rect = event.active.rect.current.initial ?? node.getBoundingClientRect();
    setSnapshot({ html: clone.outerHTML, width: rect.width, height: rect.height });
  };
  return {
    start,
    end: () => {
      landing.current = null;
      setSnapshot(null);
    },
    finish: (commit: () => void, measure: () => { left: number; top: number }) => {
      // Dropping changes the document immediately. The overlay is only visual:
      // dnd-kit can skip its animation (including identical start/end frames).
      landing.current =
        document.documentElement.dataset.motion === 'off' || !timing.duration ? null : measure();
      commit();
      setSnapshot(null);
    },
    overlay: (
      <DragOverlay
        modifiers={[(args) => restrictDrag(args, container?.current ?? null, horizontal)]}
        adjustScale={false}
        dropAnimation={{
          ...timing,
          keyframes: ({ transform, dragOverlay }) => [
            { transform: CSS.Transform.toString(transform.initial) },
            {
              transform: CSS.Transform.toString(
                landing.current
                  ? {
                      ...transform.final,
                      x: transform.initial.x + landing.current.left - dragOverlay.rect.left,
                      y: transform.initial.y + landing.current.top - dragOverlay.rect.top,
                    }
                  : transform.final,
              ),
            },
          ],
          sideEffects: (args) => {
            const cleanup = defaultDropAnimationSideEffects({
              styles: { active: { opacity: '0' } },
            })(args);
            return () => {
              cleanup?.();
              landing.current = null;
            };
          },
        }}
      >
        {snapshot && (
          <div
            aria-hidden="true"
            className="wb-drag-feedback"
            style={{ width: snapshot.width, height: snapshot.height }}
            dangerouslySetInnerHTML={{ __html: snapshot.html }}
          />
        )}
      </DragOverlay>
    ),
  };
}
