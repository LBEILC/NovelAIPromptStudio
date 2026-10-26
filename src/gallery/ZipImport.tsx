// 从 ZIP 导入（doc/design.md 2.13）：先让用户挑要导入哪几张。小图按各自的比例等高排列，已在图片库里的变淡、不能选，
// 其余默认选中；点击切换、Shift 连选、拖动框选（按住 Ctrl / Shift 是加选）。对话框按内容长高，最多到窗口高度减去上下留白，
// 放得下就不滚动；放不下时只有小图区域滚动，细条落在右边的留白里。双击一张看大图。
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../kit/dialog';
import { CheckMark, isMod } from '../kit/controls';
import { Viewer } from '../kit/Viewer';
import { BlurImg } from '../kit/blur';
import { fallbackRatio } from '../library/layout';
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
  previewCompleted?: number;
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
  const last = useRef(importSession);
  if (importSession) last.current = importSession;
  const s = importSession || last.current;
  const entries = s?.entries || [];
  const selectable = entries.filter((e) => !e.previewError && !e.duplicate);
  const [picked, setPicked] = useState<string[]>(() => selectable.map((e) => e.id));
  useEffect(
    () =>
      setPicked(
        (importSession?.entries || [])
          .filter((e) => !e.previewError && !e.duplicate)
          .map((e) => e.id),
      ),
    [importSession?.sessionId],
  );
  const active = picked.filter((id) => selectable.some((e) => e.id === id));
  const total = active.length + (s?.directImageCount || 0);
  const anchor = useRef('');
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; base: string[]; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const viewable = entries.filter((e) => e.previewPath);
  const go = () => {
    if (total) onImport(active);
  };
  useEffect(() => {
    if (!importSession || viewer != null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target as Element)?.closest?.('button')) {
        e.preventDefault();
        go();
      }
      if (isMod(e) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setPicked(selectable.map((x) => x.id));
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current,
        g = grid.current;
      if (!d || !g) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
      d.moved = true;
      suppress.current = true;
      const l = Math.min(e.clientX, d.x),
        t = Math.min(e.clientY, d.y),
        r = Math.max(e.clientX, d.x),
        b = Math.max(e.clientY, d.y);
      setBox({ left: l, top: t, width: r - l, height: b - t });
      const hits = [...g.querySelectorAll<HTMLElement>('[data-zid]')]
        .filter((el) => {
          const q = el.getBoundingClientRect();
          return q.right > l && q.left < r && q.bottom > t && q.top < b;
        })
        .map((el) => el.dataset.zid!);
      setPicked([...new Set([...d.base, ...hits])]);
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      setBox(null);
      setTimeout(() => (suppress.current = false), 0);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    return () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
  }, []);
  const toggle = (e: Entry, shift: boolean) => {
    const from = selectable.findIndex((x) => x.id === anchor.current),
      to = selectable.findIndex((x) => x.id === e.id);
    if (shift && from >= 0)
      setPicked([
        ...new Set([
          ...active,
          ...selectable.slice(Math.min(from, to), Math.max(from, to) + 1).map((x) => x.id),
        ]),
      ]);
    else setPicked(active.includes(e.id) ? active.filter((id) => id !== e.id) : [...active, e.id]);
    anchor.current = e.id;
  };
  const dup = entries.filter((e) => e.duplicate).length;
  return (
    <>
      <Dialog
        open={!!importSession}
        onClose={onCancel}
        label="从 ZIP 导入"
        className="zipdlg"
        backdropClass="zipback"
      >
        <h3>从 ZIP 导入</h3>
        <p>
          <span className="mono selectable">{s?.archives.map((a) => a.name).join('、')}</span> ·{' '}
          {entries.length} 张图片
          {dup ? `，其中 ${dup} 张已在图片库里` : ''}
          {s && !s.previewComplete && (
            <span className="zload">
              {' '}
              · 正在读取预览 {s.previewCompleted || 0} / {entries.length}
            </span>
          )}
        </p>
        {s?.previewError && (
          <p className="help err" role="alert">
            {s.previewError}
          </p>
        )}
        <div className="row zbar">
          <span className="help">已选 {active.length} 张 · 拖动可以框选，Shift 连选</span>
          <span className="sp" />
          <button
            className="btn quiet sm"
            disabled={active.length === selectable.length}
            onClick={() => setPicked(selectable.map((x) => x.id))}
          >
            全选
          </button>
          <button className="btn quiet sm" disabled={!active.length} onClick={() => setPicked([])}>
            全不选
          </button>
        </div>
        <div className="zipwrap">
          <div
            className="zipgrid scroll"
            ref={grid}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const add = isMod(e) || e.shiftKey;
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                base: add ? [...active] : [],
                moved: false,
              };
            }}
            onClickCapture={(e) => {
              if (suppress.current) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            {entries.map((e) => {
              const r =
                e.previewWidth && e.previewHeight
                  ? e.previewWidth / e.previewHeight
                  : fallbackRatio;
              const src = e.previewPath || undefined;
              if (e.duplicate || e.previewError)
                return (
                  <span
                    key={e.id}
                    className="ztile dup"
                    style={{ '--r': r.toFixed(4) } as React.CSSProperties}
                    data-tip={
                      e.duplicate ? '内容相同的图片已经在图片库里，导入时跳过' : e.previewError
                    }
                  >
                    <Thumb src={src} />
                    <span className="zdup">{e.duplicate ? '已在图片库' : '无法读取'}</span>
                  </span>
                );
              const on = active.includes(e.id);
              return (
                <button
                  key={e.id}
                  className={`ztile ${on ? 'on' : ''}`}
                  style={{ '--r': r.toFixed(4) } as React.CSSProperties}
                  data-zid={e.id}
                  aria-pressed={on}
                  aria-label={e.fileName}
                  data-tip={e.fileName}
                  onClick={(ev) => toggle(e, ev.shiftKey)}
                  onDoubleClick={() => src && setViewer(viewable.indexOf(e))}
                >
                  <Thumb src={src} />
                  <CheckMark state={on ? 'on' : ''} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="acts">
          <button className="btn quiet" onClick={onCancel}>
            取消
          </button>
          <button className="btn ink" disabled={!total} onClick={go}>
            导入 {total} 张
          </button>
        </div>
      </Dialog>
      {box && <div className="marquee-box" style={{ display: 'block', ...box }} />}
      <Viewer
        open={viewer != null}
        items={viewable.map((e) => ({ id: e.id, path: e.previewPath }))}
        index={viewer || 0}
        onIndex={setViewer}
        onClose={() => setViewer(null)}
      />
    </>
  );
}

/** 一张小图：预览还没读出来时是浅灰底加一道扫过的微光，读出来以后淡入 */
/** src 是文件路径；ZIP 里的图还没有记录，只在"所有图片都模糊"时模糊（2.37） */
function Thumb({ src }: { src?: string }) {
  const [ready, setReady] = useState(false);
  return (
    <span className={`zthumb ${ready ? 'ready' : 'wait'}`}>
      {src && (
        <BlurImg
          image={null}
          path={src}
          eye={false}
          alt=""
          draggable={false}
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
        />
      )}
    </span>
  );
}
