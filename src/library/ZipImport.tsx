import { DecodedImage } from '../ui/transitions';
import { SurfaceButton } from '../ui';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, useScrollArea } from '../ui';
import { mediaUrl } from '../lib/imageStage.js';
import { fallbackRatio } from './layout';
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
  const grid = useRef<HTMLDivElement>(null);
  useScrollArea(grid, { enabled: !!importSession });
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
    if (!importSession || preview) return;
    const enter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      if (active.length || importSession.directImageCount) onImport(active);
    };
    document.addEventListener('keydown', enter, true);
    return () => document.removeEventListener('keydown', enter, true);
  }, [importSession, preview, active, onImport]);
  useEffect(() => {
    setSelection(importSession?.entries.map((entry) => entry.id) || []);
  }, [importSession?.sessionId]);
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
        title="从 ZIP 导入"
        confirmDisabled={!active.length && !importSession?.directImageCount}
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
            <span className="library-mono">
              {importSession?.archives.map((archive) => archive.name).join('、')}
            </span>{' '}
            · {entries.length} 张图片
            {entries.some((entry) => entry.duplicate) &&
              `，其中 ${entries.filter((entry) => entry.duplicate).length} 张已在图片库里`}
          </p>
          <div className="library-zip-actions">
            <span>已选 {active.length} 张 · 拖动可以框选，Shift 连选</span>
            <Button
              size="small"
              variant="quiet"
              disabled={active.length === selectable.length}
              onClick={() => setSelection(selectable.map((entry) => entry.id))}
            >
              全选
            </Button>
            <Button
              size="small"
              variant="quiet"
              disabled={!active.length}
              onClick={() => setSelection([])}
            >
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
                initial: event.ctrlKey || event.metaKey || event.shiftKey ? active : [],
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
              if (!from.active && Math.hypot(x - from.x, y - from.y) < 4) return;
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
            {entries.map((entry) => {
              const picked = active.includes(entry.id);
              const ratio =
                entry.previewWidth && entry.previewHeight
                  ? entry.previewWidth / entry.previewHeight
                  : fallbackRatio;
              return (
                <SurfaceButton
                  kind="image"
                  className={`library-card ${picked ? 'picked' : ''} ${entry.duplicate || entry.previewError ? 'dim' : ''}`}
                  key={entry.id}
                  data-entry-id={entry.id}
                  style={{ flex: `${ratio} 1 calc(var(--thumb-row) * 2 / 3 * ${ratio})` }}
                  aria-label={entry.fileName}
                  aria-pressed={picked}
                  onClick={(event) => toggle(entry, event.shiftKey)}
                  onDoubleClick={() => {
                    if (entry.previewPath) setPreview(entry);
                  }}
                >
                  <DecodedImage
                    src={entry.previewPath ? mediaUrl(entry.previewPath) : undefined}
                    alt={entry.previewPath ? '' : entry.fileName}
                    draggable={false}
                  />
                  {entry.duplicate ? (
                    <span className="library-stack">已在图片库</span>
                  ) : (
                    <span className="library-pick">
                      <i className="ri-check-line" aria-hidden="true" />
                    </span>
                  )}
                </SurfaceButton>
              );
            })}
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
        <DecodedImage
          className="library-zip-preview"
          src={preview ? mediaUrl(preview.previewPath) : undefined}
          alt={preview?.fileName}
        />
      </Dialog>
    </>
  );
}
