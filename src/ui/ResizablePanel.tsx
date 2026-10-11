import { useRef, type ReactNode } from 'react';
import { clamp } from './internal';

export function ResizablePanel({
  width,
  onWidthChange,
  min,
  max,
  defaultWidth,
  step,
  label,
  children,
  edge = 'right',
}: {
  width: number;
  onWidthChange: (width: number) => void;
  min: number;
  max: number;
  defaultWidth: number;
  step?: number;
  label: string;
  children: ReactNode;
  edge?: 'left' | 'right';
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const direction = edge === 'right' ? 1 : -1;
  return (
    <div className="nps-resizable" style={{ width: clamp(width, min, max) }}>
      <div className="nps-panel-content">{children}</div>
      <div
        className={`nps-resizer nps-resizer-${edge}`}
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamp(width, min, max)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          drag.current = { x: event.clientX, width };
          event.currentTarget.dataset.dragging = 'true';
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            onWidthChange(
              clamp(drag.current.width + (event.clientX - drag.current.x) * direction, min, max),
            );
        }}
        onPointerUp={(event) => {
          drag.current = null;
          delete event.currentTarget.dataset.dragging;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          drag.current = null;
          delete event.currentTarget.dataset.dragging;
        }}
        onLostPointerCapture={(event) => {
          drag.current = null;
          delete event.currentTarget.dataset.dragging;
        }}
        onDoubleClick={() => onWidthChange(clamp(defaultWidth, min, max))}
        onKeyDown={(event) => {
          const tokenStep = parseFloat(
            getComputedStyle(event.currentTarget).getPropertyValue('--split-step'),
          );
          const delta = (step ?? tokenStep) * (event.shiftKey ? 4 : 1);
          const next =
            event.key === 'Home'
              ? min
              : event.key === 'End'
                ? max
                : event.key === 'ArrowRight'
                  ? width + delta * direction
                  : event.key === 'ArrowLeft'
                    ? width - delta * direction
                    : undefined;
          if (next !== undefined) {
            event.preventDefault();
            onWidthChange(clamp(next, min, max));
          }
        }}
      />
    </div>
  );
}
