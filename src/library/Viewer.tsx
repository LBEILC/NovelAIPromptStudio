import { DecodedImage, TransitionSurface } from '../ui/transitions';
import { Button } from '../ui';
import { imageAccessibleName } from '../lib/imageNaming.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mediaUrl } from '../lib/imageStage.js';
import type { ImageProject } from '../shared/types';
import type { LibraryProps } from './types';

export function LibraryViewer({
  p,
  onClose,
}: {
  p: Pick<
    LibraryProps,
    'previewGroup' | 'groups' | 'onPreview' | 'onCopyImage' | 'onDownloadImage'
  > & {
    preview: ImageProject | LibraryProps['preview'];
    onOpenWorkbench?: LibraryProps['onOpenWorkbench'];
  };
  onClose: () => void;
}) {
  // Freeze the opening order while background queries update the library.
  const [sequence] = useState(() =>
    p.groups.flatMap((group) => group.members.map((member) => ({ group, member }))),
  );
  const [image, setImage] = useState(p.preview);
  const [direction, setDirection] = useState(0);
  const [transform, setTransform] = useState({ z: 1, x: 0, y: 0 });
  const [fitting, setFitting] = useState(false);
  const [panning, setPanning] = useState(false);
  const [percent, setPercent] = useState(100);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const currentTransform = useRef(transform);
  currentTransform.current = transform;
  const pan = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const position = sequence.findIndex((item) => item.member.id === image?.id);
  const navigate = (delta: number) => {
    const next = sequence[position + delta];
    if (!next || position < 0) return;
    setDirection(delta);
    setTransform({ z: 1, x: 0, y: 0 });
    setFitting(false);
    setImage(next.member);
    p.onPreview(next.group, next.member);
  };
  const measure = () => {
    const img =
      canvas.current?.querySelector<HTMLImageElement>(
        '.library-viewer-image:not([aria-hidden=true]) img',
      ) || canvas.current?.querySelector('img');
    if (img?.naturalWidth)
      setPercent(
        Math.round(((currentTransform.current.z * img.clientWidth) / img.naturalWidth) * 100),
      );
  };
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure);
    if (canvas.current) observer.observe(canvas.current);
    measure();
    return () => observer.disconnect();
  }, [image?.id, transform.z]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    root.current?.focus();
    return () => previous?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const mx = event.clientX - (rect.left + rect.width / 2);
      const my = event.clientY - (rect.top + rect.height / 2);
      const old = currentTransform.current;
      const z = Math.min(8, Math.max(0.5, old.z * Math.exp(-event.deltaY * 0.0015)));
      const k = z / old.z;
      setFitting(false);
      setTransform({ z, x: mx - k * (mx - old.x), y: my - k * (my - old.y) });
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);
  if (!image) return null;
  return createPortal(
    <TransitionSurface
      className="library-viewer"
      kind="presence"
      change="viewer"
      enter
      shift={false}
      duration="move"
      role="dialog"
      aria-modal="true"
      aria-label="大图"
      data-viewer-project-id={image.id}
      nodeRef={root}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          navigate(event.key === 'ArrowLeft' ? -1 : 1);
        }
        if (event.key === 'Tab') {
          const items = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          ];
          if (
            event.shiftKey &&
            (document.activeElement === items[0] || document.activeElement === root.current)
          ) {
            event.preventDefault();
            items.at(-1)?.focus();
          } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
            event.preventDefault();
            items[0]?.focus();
          }
        }
      }}
    >
      <div
        className="library-viewer-canvas"
        ref={canvas}
        onClick={(event) => {
          if (!suppress.current && event.target === event.currentTarget) onClose();
        }}
        onDoubleClick={() => {
          setFitting(true);
          setTransform({ z: 1, x: 0, y: 0 });
        }}
      >
        <TransitionSurface
          className="library-viewer-image"
          change={image.id}
          direction={direction}
          enter
          scale
          onClick={(event) => {
            if (!suppress.current && event.target === event.currentTarget) onClose();
          }}
        >
          <DecodedImage
            src={mediaUrl(image.image_path)}
            alt={imageAccessibleName(image)}
            draggable={false}
            className={panning ? 'panning' : ''}
            onLoad={measure}
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.z})`,
              transition: fitting ? 'transform var(--dur-3) var(--ease-move)' : 'none',
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              pan.current = {
                x: event.clientX,
                y: event.clientY,
                ox: transform.x,
                oy: transform.y,
                moved: false,
              };
              setPanning(true);
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!pan.current) return;
              const dx = event.clientX - pan.current.x,
                dy = event.clientY - pan.current.y;
              if (Math.hypot(dx, dy) > 3) pan.current.moved = true;
              setFitting(false);
              const x = pan.current.ox + dx,
                y = pan.current.oy + dy;
              setTransform((old) => ({ ...old, x, y }));
            }}
            onPointerUp={(event) => {
              suppress.current = !!pan.current?.moved;
              pan.current = null;
              setPanning(false);
              if (event.currentTarget.hasPointerCapture?.(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
              setTimeout(() => {
                suppress.current = false;
              }, 0);
            }}
            onPointerCancel={() => {
              pan.current = null;
              setPanning(false);
            }}
            onLostPointerCapture={() => {
              pan.current = null;
              setPanning(false);
            }}
          />
        </TransitionSurface>
      </div>
      <div className="library-viewer-bar">
        <Button variant="quiet" size="small" aria-label="上一张" onClick={() => navigate(-1)}>
          <i className="ri-arrow-left-s-line" />
        </Button>
        <span className="library-mono">
          {Math.max(0, position) + 1} / {sequence.length || 1}
        </span>
        <Button variant="quiet" size="small" aria-label="下一张" onClick={() => navigate(1)}>
          <i className="ri-arrow-right-s-line" />
        </Button>
        <span className="library-help">滚轮缩放 · 拖动平移 · 双击适应窗口</span>
        <span className="library-viewer-percent library-mono">{percent}%</span>
        <span className="library-viewer-separator" />
        <Button
          variant="quiet"
          size="small"
          aria-label="复制图片"
          data-tip="复制图片"
          onClick={() => p.onCopyImage(image)}
        >
          <i className="ri-file-copy-line" />
        </Button>
        <Button
          variant="quiet"
          size="small"
          aria-label="另存为"
          data-tip="另存为"
          onClick={() => p.onDownloadImage(image)}
        >
          <i className="ri-download-2-line" />
        </Button>
        <Button
          variant="quiet"
          size="small"
          aria-label="在工作台打开"
          data-tip="在工作台打开"
          onClick={() => {
            p.onOpenWorkbench?.(image);
            onClose();
          }}
        >
          <i className="ri-external-link-line" />
        </Button>
        <Button variant="quiet" size="small" onClick={onClose}>
          <i className="ri-close-line" />
          关闭
        </Button>
      </div>
    </TransitionSurface>,
    document.body,
  );
}
