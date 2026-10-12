import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  DragOverlay,
  defaultDropAnimationSideEffects,
  useDroppable,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

export function TagInsertionSlot({
  target,
  width,
  height,
}: {
  target: { section: number; block: number; index?: number };
  width: number;
  height: number;
}) {
  const drop = useDroppable({ id: 'tag-insertion-slot', data: { target } });
  return (
    <span
      ref={drop.setNodeRef}
      aria-hidden="true"
      className="wb-insertion-slot"
      style={{ width, height }}
    />
  );
}

/** Animate the real layout change when a cross-block insertion slot is added. */
export function TagDragLayout({ children, dragging }: { children: ReactNode; dragging: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const previous = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    const style = getComputedStyle(document.documentElement);
    for (const node of root.current?.querySelectorAll<HTMLElement>('[data-wb-tag]') ?? []) {
      const key = node.dataset.wbTag!;
      const rect = node.getBoundingClientRect();
      const old = previous.current.get(key);
      if (
        dragging &&
        old &&
        (old.left !== rect.left || old.top !== rect.top) &&
        document.documentElement.dataset.motion !== 'off'
      ) {
        for (const animation of node.getAnimations()) animation.cancel();
        node.animate(
          [
            { transform: `translate(${old.left - rect.left}px, ${old.top - rect.top}px)` },
            { transform: 'none' },
          ],
          {
            duration: parseFloat(style.getPropertyValue('--dur-3')),
            easing: style.getPropertyValue('--ease-move').trim(),
          },
        );
      }
      next.set(key, rect);
    }
    previous.current = next;
  });
  return (
    <span className="wb-tag-layout" ref={root}>
      {children}
    </span>
  );
}

/** Snapshot the rendered item without adding another draggable or duplicate IDs. */
export function useDragFeedback() {
  const [snapshot, setSnapshot] = useState<{ html: string; width: number; height: number } | null>(
    null,
  );
  const [timing, setTiming] = useState({ duration: 0, easing: 'linear' });
  const landing = useRef<{ rect: { left: number; top: number }; commit: () => void } | null>(null);
  const start = (event: DragStartEvent, node: HTMLElement | null) => {
    if (!node) return;
    const style = getComputedStyle(document.documentElement);
    setTiming({
      duration:
        document.documentElement.dataset.motion === 'off'
          ? 0
          : parseFloat(style.getPropertyValue('--dur-3')),
      easing: style.getPropertyValue('--ease-move').trim(),
    });
    const clone = node.cloneNode(true) as HTMLElement;
    for (const item of [clone, ...clone.querySelectorAll('*')]) {
      for (const name of item.getAttributeNames())
        if (
          name === 'id' ||
          name.startsWith('data-') ||
          name.startsWith('aria-') ||
          name === 'tabindex'
        )
          item.removeAttribute(name);
    }
    clone.style.transform = '';
    const rect = event.active.rect.current.initial ?? node.getBoundingClientRect();
    setSnapshot({ html: clone.outerHTML, width: rect.width, height: rect.height });
  };
  return {
    start,
    end: () => setSnapshot(null),
    finish: (commit: () => void, rect: { left: number; top: number }) => {
      if (!timing.duration) commit();
      else landing.current = { rect, commit };
      setSnapshot(null);
    },
    overlay: (
      <DragOverlay
        dropAnimation={{
          ...timing,
          keyframes: ({ transform, dragOverlay }) => [
            { transform: CSS.Transform.toString(transform.initial) },
            {
              transform: CSS.Transform.toString(
                landing.current
                  ? {
                      ...transform.final,
                      x: transform.initial.x + landing.current.rect.left - dragOverlay.rect.left,
                      y: transform.initial.y + landing.current.rect.top - dragOverlay.rect.top,
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
              const result = landing.current;
              landing.current = null;
              result?.commit();
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
