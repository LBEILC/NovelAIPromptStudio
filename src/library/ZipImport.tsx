import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog } from '../ui';
import { mediaUrl } from '../lib/imageStage.js';
import { layoutLibraryRows, fallbackRatio } from './layout';
import type { PreparedImportEntry } from '../shared/types';

interface Entry extends PreparedImportEntry {
  previewError?: string;
  duplicate?: boolean;
}
interface Session {
  sessionId: string;
  entries: Entry[];
  archives: { id: string; name: string; count: number }[];
  directImageCount?: number;
  previewComplete?: boolean;
  previewError?: string;
}
export function ZipImport({
  importSession,
  onCancel,
  onImport,
}: {
  importSession: Session | null;
  onCancel: () => void;
  onImport: (ids: string[]) => void;
}) {
  const [selection, setSelection] = useState(
    () => importSession?.entries.map((entry) => entry.id) || [],
  );
  const [preview, setPreview] = useState<Entry | null>(null);
  const [width, setWidth] = useState(0);
  const [tokens, setTokens] = useState({ height: 120, gap: 8, min: 0.5, max: 2.5 });
  const grid = useRef<HTMLDivElement>(null);
  const anchor = useRef('');
  const drag = useRef<{ x: number; y: number; initial: string[]; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [marquee, setMarquee] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const entries = importSession?.entries || [];
  const selectable = entries.filter((entry) => !entry.previewError && !entry.duplicate);
  const active = selection.filter((id) => selectable.some((entry) => entry.id === id));
  useEffect(() => {
    setSelection(importSession?.entries.map((entry) => entry.id) || []);
  }, [importSession?.sessionId]);
  useLayoutEffect(() => {
    const node = grid.current;
    if (!node) return;
    const measure = () => {
      const style = getComputedStyle(node);
      const value = (key: string) => parseFloat(style.getPropertyValue(key));
      setWidth(node.clientWidth);
      setTokens({
        height: value('--thumb-row-zip'),
        gap: value('--sp-2'),
        min: value('--thumb-ratio-min'),
        max: value('--thumb-ratio-max'),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [importSession?.sessionId]);
  const rows = useMemo(
    () =>
      layoutLibraryRows(
        entries.map((entry) =>
          entry.previewWidth && entry.previewHeight
            ? entry.previewWidth / entry.previewHeight
            : fallbackRatio,
        ),
        width,
        tokens.height,
        tokens.gap,
        tokens.min,
        tokens.max,
      ),
    [entries, width, tokens],
  );
  const toggle = (entry: Entry, shift: boolean) => {
    if (entry.previewError || entry.duplicate) return;
    const from = selectable.findIndex((item) => item.id === anchor.current);
    const to = selectable.findIndex((item) => item.id === entry.id);
    if (shift && from >= 0)
      setSelection([
        ...new Set([
          ...active,
          ...selectable.slice(Math.min(from, to), Math.max(from, to) + 1).map((item) => item.id),
        ]),
      ]);
    else
      setSelection(
        active.includes(entry.id) ? active.filter((id) => id !== entry.id) : [...active, entry.id],
      );
    anchor.current = entry.id;
  };
  return (
    <>
      <Dialog
        open={!!importSession}
        title="选择要导入的图片"
        cancelLabel="取消"
        confirmLabel={`导入 ${active.length + (importSession?.directImageCount || 0)} 张`}
        onCancel={onCancel}
        onConfirm={() => {
          if (active.length || importSession?.directImageCount) onImport(active);
        }}
      >
        <div
          className="library-zip"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
              event.preventDefault();
              event.stopPropagation();
              setSelection(selectable.map((entry) => entry.id));
            }
          }}
        >
          <p>
            {importSession?.archives.map((archive) => archive.name).join('、')} 里有{' '}
            {entries.length} 张图片，其中 {entries.filter((entry) => entry.duplicate).length}{' '}
            张已经在图片库里。
          </p>
          <div className="library-zip-actions">
            <span>
              已选 {active.length} / {selectable.length} 张
            </span>
            <Button
              size="small"
              variant="quiet"
              onClick={() => setSelection(selectable.map((entry) => entry.id))}
            >
              全选
            </Button>
            <Button size="small" variant="quiet" onClick={() => setSelection([])}>
              全不选
            </Button>
          </div>
          {importSession?.previewError && <p role="alert">{importSession.previewError}</p>}
          <div
            className="library-zip-grid"
            ref={grid}
            onPointerDown={(event) => {
              if (event.button !== 0 || event.pointerType === 'touch') return;
              const node = event.currentTarget;
              const rect = node.getBoundingClientRect();
              drag.current = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top + node.scrollTop,
                initial: event.ctrlKey || event.metaKey ? active : [],
                active: false,
              };
            }}
            onPointerMove={(event) => {
              const from = drag.current;
              if (!from) return;
              const node = event.currentTarget,
                rect = node.getBoundingClientRect();
              const x = event.clientX - rect.left,
                y = event.clientY - rect.top + node.scrollTop;
              if (!from.active && Math.hypot(x - from.x, y - from.y) < 5) return;
              from.active = true;
              suppressClick.current = true;
              event.preventDefault();
              try {
                node.setPointerCapture(event.pointerId);
              } catch {
                /* DOM acceptance has no platform pointer. */
              }
              const box = {
                left: Math.min(x, from.x),
                top: Math.min(y, from.y),
                width: Math.abs(x - from.x),
                height: Math.abs(y - from.y),
              };
              setMarquee(box);
              const hits = [...node.querySelectorAll<HTMLElement>('[data-entry-id]')]
                .filter((card) => {
                  const r = card.getBoundingClientRect();
                  const left = r.left - rect.left,
                    top = r.top - rect.top + node.scrollTop;
                  return (
                    left <= box.left + box.width &&
                    left + r.width >= box.left &&
                    top <= box.top + box.height &&
                    top + r.height >= box.top
                  );
                })
                .map((card) => card.dataset.entryId!)
                .filter((id) => selectable.some((entry) => entry.id === id));
              setSelection([...new Set([...from.initial, ...hits])]);
            }}
            onPointerUp={() => {
              drag.current = null;
              setMarquee(null);
              setTimeout(() => {
                suppressClick.current = false;
              }, 0);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setMarquee(null);
              suppressClick.current = false;
            }}
            onClickCapture={(event) => {
              if (suppressClick.current) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            {rows.map((row) => (
              <div
                className="library-zip-row"
                key={row.start}
                style={{ height: row.height, gap: tokens.gap }}
              >
                {row.widths.map((itemWidth, offset) => {
                  const entry = entries[row.start + offset];
                  const picked = active.includes(entry.id);
                  return (
                    <button
                      className={`library-card ${picked ? 'picked' : ''} ${entry.duplicate || entry.previewError ? 'dim' : ''}`}
                      key={entry.id}
                      data-entry-id={entry.id}
                      style={{ width: itemWidth, height: row.height }}
                      aria-label={entry.fileName}
                      aria-pressed={picked}
                      onClick={(event) => toggle(entry, event.shiftKey)}
                      onDoubleClick={() => {
                        if (entry.previewPath) setPreview(entry);
                      }}
                    >
                      <img
                        src={entry.previewPath ? mediaUrl(entry.previewPath) : undefined}
                        alt={entry.previewPath ? '' : entry.fileName}
                        draggable={false}
                      />
                      {entry.duplicate ? (
                        <span className="library-stack">已有</span>
                      ) : (
                        <span className="library-pick">
                          {picked && <i className="ri-check-line" />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {marquee && <div className="library-marquee" style={marquee} />}
          </div>
        </div>
      </Dialog>
      <Dialog
        open={!!preview}
        title={preview?.fileName || ''}
        cancelLabel="关闭"
        confirmLabel="关闭"
        onCancel={() => setPreview(null)}
        onConfirm={() => setPreview(null)}
      >
        <img
          className="library-zip-preview"
          src={preview ? mediaUrl(preview.previewPath) : undefined}
          alt={preview?.fileName}
        />
      </Dialog>
    </>
  );
}
