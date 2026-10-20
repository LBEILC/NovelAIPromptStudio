import { DecodedImage, Presence, useNewItemEntrance } from '../ui/transitions';
import { SurfaceButton } from '../ui';
import { startMarqueeAutoScroll } from '../ui/MarqueeSelection.jsx';
import { Check } from 'lucide-react';
import { imageAccessibleName } from '../lib/imageNaming.js';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { adjacentRowIndex, fallbackRatio, layoutLibraryRows } from './layout';
import { mediaUrl } from '../lib/imageStage.js';
import type { LibraryProps } from './types';
import { useScrollArea } from '../ui';
import { CardMenu } from './CardMenu';
import { libraryCountText } from './presentation';
import { hasActiveGalleryFilters } from '../lib/galleryFilters.js';

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
  const [scrub, setScrub] = useState<{ group: string; index: number } | null>(null);
  const [hovered, setHovered] = useState('');
  const groupIds = useMemo(() => p.groups.map((group) => group.id), [p.groups]);
  useNewItemEntrance(scroll, groupIds, p.contentKey, !p.updating);
  const wanted = useRef('');
  const thumbnails = useRef(new Map<string, Promise<void>>());
  const preload = (path: string) => {
    const url = mediaUrl(path);
    let ready = thumbnails.current.get(url);
    if (!ready) {
      const image = new Image();
      image.src = url;
      ready = image.decode();
      thumbnails.current.set(url, ready);
      void ready.catch(() => thumbnails.current.delete(url));
    }
    return ready;
  };
  const anchor = useRef('');
  const multiClick = useRef(false);
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
    setViewport((v) => (v.top === 0 ? v : { ...v, top: 0 }));
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
    } else if (event.ctrlKey || event.metaKey || p.selectedGroupIds.length > 0) {
      p.onToggleSelect(group, event);
      anchor.current = group.id;
    } else {
      p.onClearSelection();
      anchor.current = group.id;
    }
    p.onPreview(group, scrub?.group === group.id ? group.members[scrub.index] : undefined);
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
        if ((event.target as Element).closest('.library-pick')) return;
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
      onClick={(event) => {
        if (!(event.target as Element).closest('.library-card, button, [data-marquee-ignore]'))
          p.onClearSelection();
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
              const shown = scrub?.group === group.id ? group.members[scrub.index] : group.cover;
              return (
                <CardMenu key={group.id} p={p} group={group} image={shown} onViewer={onViewer}>
                  <div
                    role="option"
                    aria-selected={selected || group.id === p.previewGroup?.id}
                    aria-label={imageAccessibleName(group.cover)}
                    tabIndex={
                      group.id === p.previewGroup?.id || (selectedIndex < 0 && index === 0) ? 0 : -1
                    }
                    data-library-index={index}
                    data-group-id={group.id}
                    data-enter-id={group.id}
                    data-project-id={group.cover.id}
                    className={`library-card ${group.id === p.previewGroup?.id ? 'current' : ''} ${selected ? 'picked' : ''}`}
                    style={{ width, height: row.height }}
                    key={group.id}
                    onClick={(event) => {
                      if (event.detail <= 1) multiClick.current = p.selectedGroupIds.length > 0;
                      if (event.detail > 1 && multiClick.current) return;
                      select(index, event);
                    }}
                    onDoubleClick={() => {
                      if (!multiClick.current && !p.selectedGroupIds.length)
                        p.onOpenWorkbench(shown);
                    }}
                    onPointerEnter={() => {
                      setHovered(group.id);
                      if (group.members.length > 1)
                        for (const member of group.members) {
                          void preload(member.thumbnail_path || member.image_path).catch(() => {});
                        }
                    }}
                    onPointerMove={(event) => {
                      if (group.members.length < 2 || event.buttons) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const index = Math.max(
                        0,
                        Math.min(
                          group.members.length - 1,
                          Math.floor(
                            ((event.clientX - rect.left) / rect.width) * group.members.length,
                          ),
                        ),
                      );
                      const member = group.members[index];
                      wanted.current = `${group.id}:${member.id}`;
                      void preload(member.thumbnail_path || member.image_path)
                        .then(() => {
                          if (wanted.current === `${group.id}:${member.id}`)
                            setScrub({ group: group.id, index });
                        })
                        .catch(() => {});
                    }}
                    onPointerLeave={() => {
                      setHovered('');
                      wanted.current = '';
                      setScrub(null);
                    }}
                  >
                    <DecodedImage
                      immediate={hovered === group.id || scrub?.group === group.id}
                      src={mediaUrl(shown.thumbnail_path || shown.image_path)}
                      data-scrub-image={shown.id}
                      alt=""
                      draggable={false}
                    />
                    {!!shown.version_number && (
                      <span className="library-version-badge">
                        第 {shown.version_number} 版
                        {shown.generation_source === 'agent' ? ' · Agent' : ''}
                      </span>
                    )}
                    {group.members.length > 1 && (
                      <>
                        <span className="library-stack" data-tip={`${group.members.length} 张`}>
                          {scrub?.group === group.id ? (
                            `${scrub.index + 1} / ${group.members.length}`
                          ) : (
                            <>
                              <i className="ri-stack-line" /> {group.members.length}
                            </>
                          )}
                        </span>
                        <Presence
                          show={hovered === group.id}
                          className="library-scrub-presence"
                          shift={false}
                        >
                          <span className="library-scrub">
                            {group.members.map((member, i) => (
                              <span
                                key={member.id}
                                data-current={i === (scrub?.group === group.id ? scrub.index : 0)}
                              />
                            ))}
                          </span>
                        </Presence>
                      </>
                    )}
                    <SurfaceButton
                      kind="check"
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={imageAccessibleName(group.cover)}
                      className="library-pick"
                      data-theme={selected ? undefined : 'light'}
                      onClick={(event) => {
                        event.stopPropagation();
                        anchor.current = group.id;
                        p.onToggleSelect(group, { ...event, shiftKey: false });
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
                      }}
                    >
                      {selected && <Check size={16} strokeWidth={1.5} aria-hidden="true" />}
                    </SurfaceButton>
                  </div>
                </CardMenu>
              );
            })}
          </div>
        ))}
      </div>
      <div className="library-count">
        {libraryCountText(
          p.groups.length,
          p.groups.reduce((sum, group) => sum + group.members.length, 0),
          hasActiveGalleryFilters(p.filters) ? p.filterProjects.length : undefined,
        )}
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
