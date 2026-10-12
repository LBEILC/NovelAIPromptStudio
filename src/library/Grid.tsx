import { startMarqueeAutoScroll } from '../components/MarqueeSelection.jsx';
import { Check } from 'lucide-react';
import { imageAccessibleName } from '../lib/imageNaming.js';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { adjacentRowIndex, fallbackRatio, layoutLibraryRows } from './layout';
import { mediaUrl } from '../lib/imageStage.js';
import type { LibraryProps } from './types';
import { useScrollArea } from '../ui';

export function LibraryGrid({
  p,
  rowHeight,
  onRowHeight,
  onViewer,
}: {
  p: LibraryProps;
  rowHeight: number;
  onRowHeight: (height: number) => void;
  onViewer: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  useScrollArea(scroll);
  const [viewport, setViewport] = useState({
    width: 0,
    height: 0,
    top: 0,
    gap: 0,
    padding: 0,
    inset: 0,
    min: 0.5,
    max: 2.5,
  });
  const anchor = useRef('');
  const wheel = useRef(0);
  useLayoutEffect(() => {
    const node = scroll.current!;
    const resize = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      wheel.current += event.deltaY;
      if (Math.abs(wheel.current) >= 24) {
        onRowHeight(Math.min(360, Math.max(120, rowHeight + (wheel.current < 0 ? 20 : -20))));
        wheel.current = 0;
      }
    };
    node.addEventListener('wheel', resize, { passive: false });
    return () => node.removeEventListener('wheel', resize);
  }, [rowHeight, onRowHeight]);
  const drag = useRef<{
    x: number;
    y: number;
    active: boolean;
    point: { x: number; y: number };
    initial: string[];
    additive: boolean;
  } | null>(null);
  const suppress = useRef(false);
  const stopScroll = useRef(() => {});
  useLayoutEffect(() => () => stopScroll.current(), []);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    const node = scroll.current!;
    const measure = () => {
      const style = getComputedStyle(node);
      const number = (name: string) => parseFloat(style.getPropertyValue(name));
      const padding = number('--sp-5');
      setViewport((v) => ({
        ...v,
        width: node.clientWidth - padding * 2,
        height: node.clientHeight,
        top: node.scrollTop,
        gap: number('--thumb-gap'),
        padding,
        inset: number('--sp-1'),
        min: number('--thumb-ratio-min'),
        max: number('--thumb-ratio-max'),
      }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  const rows = useMemo(
    () =>
      layoutLibraryRows(
        p.groups.map((group) => {
          const { width, height } = group.cover.metadata;
          return width && height ? width / height : fallbackRatio;
        }),
        viewport.width,
        rowHeight,
        viewport.gap,
        viewport.min,
        viewport.max,
      ),
    [p.groups, viewport.width, viewport.gap, viewport.min, viewport.max, rowHeight],
  );
  const selectedIndex = p.groups.findIndex((group) => group.id === p.previewGroup?.id);
  const reveal = (index: number, focus = false) => {
    const node = scroll.current;
    const row = rows.find((r) => index >= r.start && index < r.start + r.widths.length);
    if (!node || !row) return;
    if (row.top < node.scrollTop) node.scrollTop = row.top;
    else if (row.top + row.height + viewport.inset > node.scrollTop + node.clientHeight)
      node.scrollTop = row.top + row.height + viewport.inset - node.clientHeight;
    setViewport((v) => ({ ...v, top: node.scrollTop }));
    if (focus)
      requestAnimationFrame(() =>
        node
          .querySelector<HTMLElement>(`[data-library-index="${index}"]`)
          ?.focus({ preventScroll: true }),
      );
  };
  useLayoutEffect(() => {
    if (selectedIndex >= 0) reveal(selectedIndex);
  }, [rows, selectedIndex]);
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [p.contentKey]);
  const visible = rows.filter(
    (row) =>
      row.top + row.height >= viewport.top - rowHeight &&
      row.top <= viewport.top + viewport.height + rowHeight,
  );
  const totalHeight = rows.length ? rows.at(-1)!.top + rows.at(-1)!.height : 0;
  const select = (
    index: number,
    event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => {
    const group = p.groups[index];
    if (!group) return;
    if (event.shiftKey) {
      const from = Math.max(
        0,
        p.groups.findIndex((g) => g.id === (anchor.current || p.previewGroup?.id)),
      );
      p.onSelectionChange(
        p.groups.slice(Math.min(from, index), Math.max(from, index) + 1).map((g) => g.id),
      );
    } else if (event.ctrlKey || event.metaKey) {
      p.onToggleSelect(group, event);
      anchor.current = group.id;
    } else {
      p.onClearSelection();
      anchor.current = group.id;
    }
    p.onPreview(group);
  };
  const updateMarquee = () => {
    const initial = drag.current;
    const node = scroll.current;
    if (!initial?.active || !node) return;
    const rect = node.getBoundingClientRect();
    const x = Math.max(0, Math.min(node.clientWidth, initial.point.x - rect.left));
    const y = Math.max(0, Math.min(node.clientHeight, initial.point.y - rect.top)) + node.scrollTop;
    const box = {
      x: Math.min(x, initial.x),
      y: Math.min(y, initial.y),
      width: Math.abs(x - initial.x),
      height: Math.abs(y - initial.y),
    };
    setMarquee(box);
    const hits: string[] = [];
    for (const row of rows) {
      if (
        row.top + viewport.inset + row.height < box.y ||
        row.top + viewport.inset > box.y + box.height
      )
        continue;
      let left = viewport.padding;
      row.widths.forEach((width, offset) => {
        if (left + width >= box.x && left <= box.x + box.width)
          hits.push(p.groups[row.start + offset].id);
        left += width + viewport.gap;
      });
    }
    p.onSelectionChange(initial.additive ? [...new Set([...initial.initial, ...hits])] : hits);
  };
  return (
    <div
      ref={scroll}
      className="library-scroll"
      data-library-grid
      tabIndex={-1}
      onScroll={(event) => {
        const top = event.currentTarget.scrollTop;
        setViewport((v) => ({ ...v, top }));
        updateMarquee();
      }}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey) {
          if (event.key.toLowerCase() === 'a') {
            event.preventDefault();
            p.onSelectAll();
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          p.onClearSelection();
          return;
        }
        if (event.key === 'Enter' && p.preview) {
          event.preventDefault();
          p.onOpenWorkbench(p.preview);
          return;
        }
        if (event.key === ' ' && p.preview) {
          event.preventDefault();
          onViewer();
          return;
        }
        const index = Math.max(0, selectedIndex);
        const next =
          event.key === 'ArrowRight'
            ? Math.min(p.groups.length - 1, index + 1)
            : event.key === 'ArrowLeft'
              ? Math.max(0, index - 1)
              : event.key === 'ArrowDown'
                ? adjacentRowIndex(rows, index, 1, viewport.gap)
                : event.key === 'ArrowUp'
                  ? adjacentRowIndex(rows, index, -1, viewport.gap)
                  : -1;
        if (next >= 0) {
          event.preventDefault();
          select(next, event);
          reveal(next, true);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.pointerType === 'touch') return;
        if ((event.target as Element).closest('[data-marquee-ignore]')) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX >= rect.left + event.currentTarget.clientWidth) return;
        drag.current = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top + event.currentTarget.scrollTop,
          active: false,
          point: { x: event.clientX, y: event.clientY },
          initial: p.selectedGroupIds,
          additive: event.ctrlKey || event.metaKey || event.shiftKey,
        };
      }}
      onPointerMove={(event) => {
        const initial = drag.current;
        if (!initial) return;
        const node = event.currentTarget;
        const rect = node.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top + node.scrollTop;
        if (!initial.active && Math.hypot(x - initial.x, y - initial.y) < 5) return;
        initial.point = { x: event.clientX, y: event.clientY };
        if (!initial.active)
          stopScroll.current = startMarqueeAutoScroll(node, () => drag.current?.point);
        initial.active = true;
        suppress.current = true;
        try {
          node.setPointerCapture(event.pointerId);
        } catch {
          /* Synthetic DOM actions have no active platform pointer. */
        }
        event.preventDefault();
        updateMarquee();
      }}
      onPointerUp={(event) => {
        if (drag.current) {
          drag.current.point = { x: event.clientX, y: event.clientY };
          updateMarquee();
        }
        stopScroll.current();
        drag.current = null;
        setMarquee(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        setTimeout(() => {
          suppress.current = false;
        }, 0);
      }}
      onPointerCancel={() => {
        stopScroll.current();
        drag.current = null;
        setMarquee(null);
      }}
      onLostPointerCapture={() => {
        stopScroll.current();
        drag.current = null;
        setMarquee(null);
      }}
      onClickCapture={(event) => {
        if (suppress.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className="library-rows" style={{ height: totalHeight + viewport.inset }}>
        {visible.map((row) => (
          <div
            className="library-row"
            key={row.start}
            style={{ top: row.top + viewport.inset, height: row.height }}
          >
            {row.widths.map((width, offset) => {
              const index = row.start + offset;
              const group = p.groups[index];
              const selected = p.selectedGroupIds.includes(group.id);
              return (
                <div
                  role="option"
                  aria-selected={selected || group.id === p.previewGroup?.id}
                  aria-label={imageAccessibleName(group.cover)}
                  tabIndex={
                    group.id === p.previewGroup?.id || (selectedIndex < 0 && index === 0) ? 0 : -1
                  }
                  data-library-index={index}
                  data-group-id={group.id}
                  data-project-id={group.cover.id}
                  className={`library-card ${group.id === p.previewGroup?.id ? 'current' : ''} ${selected ? 'picked' : ''}`}
                  style={{ width, height: row.height }}
                  key={group.id}
                  onClick={(event) => select(index, event)}
                  onDoubleClick={() => p.onOpenWorkbench(group.cover)}
                >
                  <img
                    src={mediaUrl(group.cover.thumbnail_path || group.cover.image_path)}
                    alt=""
                    draggable={false}
                  />
                  {group.members.length > 1 && (
                    <span className="library-stack">{group.members.length} 张</span>
                  )}
                  {p.selectedGroupIds.length > 0 && (
                    <span className="library-pick">
                      {selected && <Check size={16} strokeWidth={1.5} aria-hidden="true" />}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="library-count">
        {p.groups.length} 组 · {p.groups.reduce((sum, group) => sum + group.members.length, 0)} 张
      </div>
      {marquee && (
        <div
          className="library-marquee"
          style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
        />
      )}
    </div>
  );
}
