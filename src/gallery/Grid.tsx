// 图片库的网格（doc/design.md 2.13、2.17）：等高排列，每行一样高，图片按自己的宽高比占宽度，一行排满；最后一行不拉伸。
// 每张卡片的位置和大小写进 style，多了少了几张时由 CSS 过渡移过去（删掉的先淡出，其他再补位）；
// 拖"大小"、第一次量到宽度时直接到位。换一批结果时整个网格换内容。只画看得见的几行。
// 单击选中，双击或 Enter 在工作台打开，空格看大图；方向键移动；多选：Ctrl / Cmd 点击、Shift 连选、拖动框选、Ctrl A。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon, isMod } from '../kit/controls';
import { ms, useExitList, useSwap } from '../kit/motion';
import { mediaUrl } from '../lib/imageStage.js';
import { imageAccessibleName } from '../lib/imageNaming.js';
import {
  adjacentRowIndex,
  fallbackRatio,
  layoutLibraryRows,
  type LibraryRow,
} from '../library/layout';
import { libraryCountText } from '../library/presentation';
import { hasActiveGalleryFilters } from '../lib/galleryFilters.js';
import {
  GALLERY_MOSAIC_MIN_ROW,
  GALLERY_MOSAIC_RATIO,
  galleryCoverMember,
  galleryMosaicMembers,
  isGroupOrigin,
} from '../lib/gallery.js';
import { GENERATED } from './Side';
import type { LibraryGroup, LibraryProps } from '../library/types';
import type { LibraryCard } from '../shared/types';

const cardRatio = (c: LibraryCard) => {
  const { width, height } = c.metadata;
  return width && height ? width / height : fallbackRatio;
};
/** 卡片显示的样子（1.5.6）：主图按"封面"选；多张预览时右边多一列，卡片宽出行高的 GALLERY_MOSAIC_RATIO */
export type GalleryDisplay = { cover: 'origin' | 'earliest' | 'latest'; mosaic: boolean };
const mosaicOn = (g: LibraryGroup, d: GalleryDisplay, rowHeight: number) =>
  d.mosaic && rowHeight >= GALLERY_MOSAIC_MIN_ROW && g.members.length >= 3;
const isWork = (g: LibraryGroup) => g.id.startsWith('work:');
/** 作品的角标图标：在预览里比较 node-tree、git-branch-line、git-commit-line 后定 */
export const WORK_ICON = 'node-tree';
const thumb = (c: Pick<LibraryCard, 'thumbnail_path' | 'image_path'>) =>
  mediaUrl(c.thumbnail_path || c.image_path);

export interface GridHandle {
  /** 选中了哪一组（键盘移动时用来滚到看得见） */
  reveal: (index: number, focus?: boolean) => void;
}

export function Grid({
  p,
  rowHeight,
  display,
  onRowHeight,
  onViewer,
  onCardMenu,
  empty,
}: {
  p: LibraryProps;
  rowHeight: number;
  display: GalleryDisplay;
  onRowHeight: (h: number) => void;
  onViewer: (group: LibraryGroup, member?: LibraryCard) => void;
  onCardMenu: (at: [number, number], group: LibraryGroup, member: LibraryCard) => void;
  empty: React.ReactNode;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ width: 0, height: 0, top: 0 });
  const [jump, setJump] = useState(true);
  const lastRow = useRef(rowHeight);
  // 拖"大小"、Ctrl 滚轮：跟手，不加过渡
  if (lastRow.current !== rowHeight) lastRow.current = rowHeight;
  useLayoutEffect(() => {
    setJump(true);
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setJump(false)));
    return () => cancelAnimationFrame(t);
  }, [rowHeight, vp.width]);
  useLayoutEffect(() => {
    const el = scroll.current!;
    const measure = () =>
      setVp((v) => ({
        ...v,
        width: el.clientWidth - 2 * ms('--sp-5'),
        height: el.clientHeight,
        top: el.scrollTop,
      }));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  // Ctrl / Cmd 加滚轮：调大小，一次一档
  const wheel = useRef(0);
  useEffect(() => {
    const el = scroll.current!;
    const on = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      wheel.current += e.deltaY;
      if (Math.abs(wheel.current) >= 24) {
        onRowHeight(Math.min(360, Math.max(120, rowHeight + (wheel.current < 0 ? 20 : -20))));
        wheel.current = 0;
      }
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [rowHeight, onRowHeight]);
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
    setVp((v) => ({ ...v, top: 0 }));
  }, [p.contentKey]);
  const swaps = useSwap({ groups: p.groups, key: p.contentKey }, (v) => v.key);
  const count = libraryCountText(
    p.groups.length,
    p.groups.reduce((n, g) => n + g.members.length, 0),
    hasActiveGalleryFilters(p.filters) ? p.filterProjects.length : undefined,
  );
  return (
    <div
      className="scroll"
      ref={scroll}
      tabIndex={-1}
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop;
        setVp((v) => ({ ...v, top }));
      }}
    >
      <div className="swap lswap">
        {p.groups.length || p.loading
          ? swaps.map(({ key, value, leaving }) => (
              <Cards
                key={key}
                p={p}
                groups={value.groups}
                leaving={leaving}
                vp={vp}
                rowHeight={rowHeight}
                display={display}
                jump={jump}
                scroll={scroll}
                onViewer={onViewer}
                onCardMenu={onCardMenu}
              />
            ))
          : empty}
      </div>
      {p.groups.length > 0 && <div className="label lcount">{count}</div>}
    </div>
  );
}

function Cards({
  p,
  groups: live,
  leaving: gridLeaving,
  vp,
  rowHeight,
  display,
  jump,
  scroll,
  onViewer,
  onCardMenu,
}: {
  p: LibraryProps;
  groups: LibraryGroup[];
  leaving: boolean;
  vp: { width: number; height: number; top: number };
  rowHeight: number;
  display: GalleryDisplay;
  jump: boolean;
  scroll: React.RefObject<HTMLDivElement | null>;
  onViewer: (group: LibraryGroup, member?: LibraryCard) => void;
  onCardMenu: (at: [number, number], group: LibraryGroup, member: LibraryCard) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  // 删掉的先淡出（留在原来的位置），--dur-1 之后才拿掉，其他再补位
  const exit = useExitList(live, (g) => g.id);
  const groups = exit.map((x) => x.item);
  const gap = ms('--thumb-gap') || 14;
  const rows: LibraryRow[] = useMemo(
    () =>
      layoutLibraryRows(
        groups.map(
          (g) =>
            cardRatio(galleryCoverMember(g, display.cover)) +
            (mosaicOn(g, display, rowHeight) ? GALLERY_MOSAIC_RATIO : 0),
        ),
        vp.width,
        rowHeight,
        gap,
        ms('--thumb-ratio-min') || 0.5,
        ms('--thumb-ratio-max') || 2.5,
      ),
    [exit.map((x) => x.key).join('|'), vp.width, rowHeight, gap, display.cover, display.mosaic],
  );
  const height = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : 0;
  // 新出现的（导入、生成的图）淡入；第一次画出来的不淡入
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();
  if (seen.current) for (const g of groups) if (!seen.current.has(g.id)) fresh.add(g.id);
  useEffect(() => {
    seen.current = new Set(groups.map((g) => g.id));
  });
  const [scrub, setScrub] = useState<{ id: string; i: number } | null>(null);
  const preloaded = useRef(new Map<string, Promise<void>>());
  const preload = (url: string) => {
    let ready = preloaded.current.get(url);
    if (!ready) {
      const img = new Image();
      img.src = url;
      ready = img.decode();
      preloaded.current.set(url, ready);
      void ready.catch(() => preloaded.current.delete(url));
    }
    return ready;
  };
  const anchor = useRef('');
  const index = groups.findIndex((g) => g.id === p.previewGroup?.id);
  const picking = p.selectedGroupIds.length > 0;
  const reveal = (i: number, focus = false) => {
    const el = scroll.current,
      row = rows.find((r) => i >= r.start && i < r.start + r.widths.length);
    if (!el || !row) return;
    const inset = ms('--sp-1');
    if (row.top < el.scrollTop) el.scrollTop = row.top;
    else if (row.top + row.height + inset > el.scrollTop + el.clientHeight)
      el.scrollTop = row.top + row.height + inset - el.clientHeight;
    if (focus)
      requestAnimationFrame(() =>
        grid.current
          ?.querySelector<HTMLElement>(`[data-index="${i}"]`)
          ?.focus({ preventScroll: true }),
      );
  };
  useLayoutEffect(() => {
    if (index >= 0 && !gridLeaving) reveal(index);
  }, [rows, index]);
  const select = (i: number, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    const g = groups[i];
    if (!g) return;
    if (e.shiftKey) {
      const from = Math.max(
        0,
        groups.findIndex((x) => x.id === (anchor.current || p.previewGroup?.id)),
      );
      p.onSelectionChange([
        ...new Set([
          ...p.selectedGroupIds,
          ...groups.slice(Math.min(from, i), Math.max(from, i) + 1).map((x) => x.id),
        ]),
      ]);
    } else if (isMod(e) || picking) {
      if (!picking && isMod(e) && p.previewGroup && p.previewGroup.id !== g.id)
        p.onSelectionChange([p.previewGroup.id, g.id]);
      else p.onToggleSelect(g, e);
      anchor.current = g.id;
    } else {
      anchor.current = g.id;
      p.onPreview(
        g,
        scrub?.id === g.id
          ? g.members[scrub.i]
          : p.previewGroup?.id === g.id
            ? p.preview || undefined
            : undefined,
      );
    }
  };
  // 框选：在网格的空白处按下拖动，框住的卡片进入多选；按住 Shift 或 Ctrl 时追加；拖到上下边缘时自动滚动
  const [marq, setMarq] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drag = useRef<{
    sx: number;
    sy: number;
    on: boolean;
    base: string[];
    px: number;
    py: number;
  } | null>(null);
  const suppress = useRef(false);
  const updateMarq = () => {
    const d = drag.current,
      g = grid.current;
    if (!d?.on || !g) return;
    const r = g.getBoundingClientRect();
    const cx = (x: number) => Math.max(0, Math.min(r.width, x - r.left)),
      cy = (y: number) => Math.max(0, Math.min(r.height, y - r.top));
    const x0 = cx(d.sx),
      // 起点固定在内容上：网格跟着滚动往上走了多少，起点在屏幕上就往上挪多少
      y0 = cy(d.sy - (scroll.current!.scrollTop - (d as unknown as { st: number }).st)),
      x1 = cx(d.px),
      y1 = cy(d.py);
    const box = {
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      w: Math.abs(x1 - x0),
      h: Math.abs(y1 - y0),
    };
    setMarq(box);
    const hits: string[] = [];
    for (const row of rows) {
      if (row.top + row.height < box.y || row.top > box.y + box.h) continue;
      let left = 0;
      row.widths.forEach((w, o) => {
        if (left + w > box.x && left < box.x + box.w) hits.push(groups[row.start + o].id);
        left += w + gap;
      });
    }
    p.onSelectionChange([...new Set([...d.base, ...hits])]);
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.on && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
      d.on = true;
      d.px = e.clientX;
      d.py = e.clientY;
      document.documentElement.classList.add('is-dragging');
      const sc = scroll.current!,
        sr = sc.getBoundingClientRect(),
        edge = ms('--sp-6');
      if (e.clientY > sr.bottom - edge) sc.scrollTop += ms('--sp-2');
      else if (e.clientY < sr.top + edge) sc.scrollTop -= ms('--sp-2');
      updateMarq();
    };
    const up = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      document.documentElement.classList.remove('is-dragging');
      if (d.on) {
        suppress.current = true;
        setTimeout(() => (suppress.current = false), 0);
      }
      setMarq(null);
    };
    // 框选时滚动（滚轮或贴边自动滚）：指针没动也要重算框住的范围
    const onScroll = () => drag.current?.on && updateMarq();
    const sc = scroll.current;
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    sc?.addEventListener('scroll', onScroll);
    return () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      sc?.removeEventListener('scroll', onScroll);
    };
  });
  // 画出看得见的几行（上下各多画一行）
  const visible = rows.filter(
    (r) => r.top + r.height >= vp.top - rowHeight && r.top <= vp.top + vp.height + rowHeight,
  );
  return (
    <div
      ref={grid}
      className={`lgrid ${jump ? 'jump' : ''} ${picking ? 'picking' : ''} ${gridLeaving ? 'leaving' : ''}`}
      data-enter="fade"
      style={{ height }}
      role="listbox"
      aria-multiselectable="true"
      aria-label="图片"
      onPointerDown={(e) => {
        if (e.button !== 0 || gridLeaving || (e.target as Element).closest('.card, button')) return;
        drag.current = Object.assign(
          {
            sx: e.clientX,
            sy: e.clientY,
            on: false,
            base: e.shiftKey || isMod(e) ? [...p.selectedGroupIds] : [],
            px: e.clientX,
            py: e.clientY,
          },
          { st: scroll.current!.scrollTop },
        );
      }}
      onClickCapture={(e) => {
        if (suppress.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        // 点网格的空白处：退出多选
        if (e.target === e.currentTarget && picking) p.onClearSelection();
      }}
      onKeyDown={(e) => {
        if ((e.target as Element).closest('.lpick')) return;
        if (isMod(e)) {
          if (e.key.toLowerCase() === 'a') {
            e.preventDefault();
            p.onSelectAll();
          }
          return;
        }
        if (e.key === 'Escape' && picking) {
          e.preventDefault();
          p.onClearSelection();
          return;
        }
        if (e.key === 'Enter' && p.preview && !picking) {
          e.preventDefault();
          if (p.view !== 'trash') p.onOpenWorkbench(p.preview, p.previewGroup || undefined);
          return;
        }
        if (e.key === ' ' && p.previewGroup && !picking) {
          e.preventDefault();
          onViewer(p.previewGroup, p.preview || undefined);
          return;
        }
        const i = Math.max(0, index);
        const next =
          e.key === 'ArrowRight'
            ? Math.min(groups.length - 1, i + 1)
            : e.key === 'ArrowLeft'
              ? Math.max(0, i - 1)
              : e.key === 'ArrowDown'
                ? adjacentRowIndex(rows, i, 1, gap)
                : e.key === 'ArrowUp'
                  ? adjacentRowIndex(rows, i, -1, gap)
                  : -1;
        if (next >= 0) {
          e.preventDefault();
          select(next, e);
          reveal(next, true);
        }
      }}
    >
      {visible.flatMap((row) => {
        let left = 0;
        return row.widths.map((w, o) => {
          const i = row.start + o,
            g = groups[i],
            x = left;
          left += w + gap;
          const leaving = exit[i].leaving;
          const n = g.members.length;
          const sc = scrub?.id === g.id ? scrub : null;
          const main = galleryCoverMember(g, display.cover);
          const shown = sc ? g.members[Math.min(sc.i, n - 1)] : main;
          const mosaic = mosaicOn(g, display, rowHeight) ? galleryMosaicMembers(g, main) : null;
          // 翻看到比例和主图差得多的图时完整缩进框里，不裁切（用户 10-22：一个作品里横图竖图都有）
          const fit = sc && Math.abs(cardRatio(shown) / cardRatio(main) - 1) > 0.15;
          const work = isWork(g);
          const originOnly = work && n === 1 && isGroupOrigin(g, g.members[0]);
          const picked = p.selectedGroupIds.includes(g.id);
          const on = g.id === p.previewGroup?.id && !picking;
          const genNote =
            p.activeCollection?.id === GENERATED && shown.version_number
              ? `第 ${shown.version_number} 版${shown.generation_source === 'agent' ? ' · Agent' : ''}`
              : '';
          return (
            <div
              key={g.id}
              className={`card ${on ? 'on' : ''} ${picked ? 'picked' : ''} ${leaving ? 'leaving fading' : ''} ${mosaic ? 'mosaic' : ''}`}
              data-enter={fresh.has(g.id) ? 'fade' : undefined}
              data-index={i}
              data-group-id={g.id}
              role="option"
              aria-selected={picked || on}
              aria-label={imageAccessibleName(g.cover)}
              tabIndex={on || (index < 0 && i === 0) ? 0 : -1}
              style={
                {
                  left: x,
                  top: row.top,
                  width: w,
                  height: row.height,
                  '--mw': `${Math.round(row.height * GALLERY_MOSAIC_RATIO)}px`,
                } as React.CSSProperties
              }
              onClick={(e) => {
                if (e.detail > 1) return;
                select(i, e);
              }}
              onDoubleClick={() => {
                if (picking) return;
                onViewer(g, shown);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onCardMenu([e.clientX, e.clientY], g, shown);
              }}
              onPointerEnter={() => {
                if (n > 1) for (const m of g.members) void preload(thumb(m)).catch(() => {});
              }}
              onPointerMove={(e) => {
                if (n < 2 || e.buttons) return;
                const r = e.currentTarget.getBoundingClientRect(),
                  k = Math.max(
                    0,
                    Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)),
                  );
                if (sc?.i === k) return;
                void preload(thumb(g.members[k]))
                  .then(() => setScrub({ id: g.id, i: k }))
                  .catch(() => {});
              }}
              onPointerLeave={() => setScrub((s) => (s?.id === g.id ? null : s))}
            >
              <img
                className={`lmain ${fit ? 'fit' : ''}`}
                src={thumb(shown)}
                alt=""
                draggable={false}
              />
              {mosaic && (
                <span className="lmosaic" aria-hidden="true">
                  {mosaic.picks.map((m, k) => (
                    <span key={m.id}>
                      <img src={thumb(m)} alt="" draggable={false} />
                      {k === mosaic.picks.length - 1 && mosaic.more > 0 && (
                        <b className="mono">+{mosaic.more}</b>
                      )}
                    </span>
                  ))}
                </span>
              )}
              {/* 角标：作品是作品图标，按提示词合并的一组是叠放图标；只有一张的作品只有图标、不带数字 */}
              {!sc && (n > 1 || work || genNote) && (
                <span
                  className={`stack ${n > 1 || work ? 'lstack' : ''}`}
                  data-tip={
                    originOnly
                      ? '作品 · 还没生成'
                      : work
                        ? `作品 · ${n} 张`
                        : n > 1
                          ? `${n} 张`
                          : undefined
                  }
                >
                  {n > 1 || work ? (
                    <>
                      <Icon name={work ? WORK_ICON : 'stack-line'} />
                      {n > 1 && <span className="mono">{n}</span>}
                    </>
                  ) : (
                    genNote
                  )}
                </span>
              )}
              {sc && (
                <>
                  <span className="stack" data-enter="fade">
                    {sc.i + 1} / {n}
                  </span>
                  <span className="scrub-bar" data-enter="fade">
                    <i style={{ left: `${(sc.i / n) * 100}%`, width: `${100 / n}%` }} />
                  </span>
                </>
              )}
              <span
                className={`check lchk lpick ${picked ? 'on' : ''}`}
                role="checkbox"
                aria-checked={picked}
                aria-label="选择"
                tabIndex={-1}
                data-tip={picked ? '取消选择' : '选择'}
                onKeyDown={(e) => {
                  // 复选框获得焦点时：空格或回车切换选择（不打开大图或工作台）
                  if (e.key !== ' ' && e.key !== 'Enter') return;
                  e.preventDefault();
                  e.stopPropagation();
                  anchor.current = g.id;
                  p.onToggleSelect(g, e);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) select(i, e);
                  else {
                    anchor.current = g.id;
                    p.onToggleSelect(g, e);
                  }
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Icon name="check-line" />
              </span>
            </div>
          );
        });
      })}
      {marq && (
        <div
          className="lmarq"
          style={{ left: marq.x, top: marq.y, width: marq.w, height: marq.h }}
        />
      )}
    </div>
  );
}
