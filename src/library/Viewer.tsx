import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui';
import { mediaUrl } from '../lib/imageStage.js';
import type { LibraryProps } from './types';

export function LibraryViewer({ p, onClose }: { p: LibraryProps; onClose: () => void }) {
  const [zoom, setZoom] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const image = p.preview;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    root.current?.focus();
    return () => {
      previous?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    setZoom(null);
    setRotation(0);
    setFlip(false);
  }, [image?.id]);
  const navigate = (delta: number) => {
    const group = p.previewGroup;
    if (!group || !image) return;
    const members = group.members.length > 1 ? group.members : p.groups.map((g) => g.cover);
    const index = members.findIndex((member) => member.id === image.id);
    const next = members[(index + delta + members.length) % members.length];
    const nextGroup = p.groups.find((g) => g.members.some((member) => member.id === next.id));
    if (nextGroup) p.onPreview(nextGroup, next);
  };
  const changeZoom = (factor: number) => {
    const displayed = root.current?.querySelector('img');
    const fitted =
      displayed && image
        ? displayed.clientWidth / (image.metadata.width || displayed.naturalWidth)
        : 1;
    setZoom((value) => Math.min(8, Math.max(0.05, (value ?? fitted ?? 1) * factor)));
  };
  if (!image) return null;
  return createPortal(
    <div
      className="library-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="大图"
      ref={root}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          navigate(event.key === 'ArrowLeft' ? -1 : 1);
        }
        if (event.key === 'Tab') {
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
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
      <div className="library-viewer-top">
        <b>{image.name}</b>
        <span className="library-help library-mono">
          {image.metadata.width} × {image.metadata.height}
        </span>
        <Button variant="quiet" size="small" onClick={onClose}>
          <i className="ri-close-line" />
          关闭 <kbd>Esc</kbd>
        </Button>
      </div>
      <div
        className="library-viewer-canvas"
        ref={canvas}
        onWheel={(event) => {
          event.preventDefault();
          changeZoom(event.deltaY < 0 ? 1.2 : 1 / 1.2);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current) {
            event.currentTarget.scrollLeft = drag.current.left - event.clientX + drag.current.x;
            event.currentTarget.scrollTop = drag.current.top - event.clientY + drag.current.y;
          }
        }}
        onPointerUp={(event) => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <img
          src={mediaUrl(image.image_path)}
          alt={image.name}
          draggable={false}
          style={{
            transform: `rotate(${rotation}deg) scaleX(${flip ? -1 : 1})`,
            ...(zoom != null
              ? {
                  width: image.metadata.width * zoom,
                  height: image.metadata.height * zoom,
                  maxWidth: 'none',
                  maxHeight: 'none',
                }
              : {}),
          }}
        />
      </div>
      <Button
        className="library-viewer-prev"
        variant="quiet"
        aria-label="上一张"
        onClick={() => navigate(-1)}
      >
        <i className="ri-arrow-left-s-line" />
      </Button>
      <Button
        className="library-viewer-next"
        variant="quiet"
        aria-label="下一张"
        onClick={() => navigate(1)}
      >
        <i className="ri-arrow-right-s-line" />
      </Button>
      <div className="library-viewer-foot">
        {p.previewGroup && p.previewGroup.members.length > 1 && (
          <div className="library-strip">
            {p.previewGroup.members.map((member) => (
              <button
                key={member.id}
                className={member.id === image.id ? 'is-current' : ''}
                aria-label={member.name}
                onClick={() => p.onPreview(p.previewGroup!, member)}
              >
                <img src={mediaUrl(member.thumbnail_path)} alt="" />
              </button>
            ))}
          </div>
        )}
        <div className="library-selection-bar">
          <Button
            variant="quiet"
            size="small"
            aria-label="缩小"
            onClick={() => changeZoom(1 / 1.2)}
          >
            <i className="ri-zoom-out-line" />
          </Button>
          <Button variant="quiet" size="small" onClick={() => setZoom(1)}>
            100%
          </Button>
          <Button variant="quiet" size="small" aria-label="放大" onClick={() => changeZoom(1.2)}>
            <i className="ri-zoom-in-line" />
          </Button>
          <span className="library-separator" />
          <Button
            variant="quiet"
            size="small"
            aria-label="向左旋转"
            onClick={() => setRotation((value) => value - 90)}
          >
            <i className="ri-anticlockwise-line" />
          </Button>
          <Button
            variant="quiet"
            size="small"
            aria-label="向右旋转"
            onClick={() => setRotation((value) => value + 90)}
          >
            <i className="ri-clockwise-line" />
          </Button>
          <Button
            variant="quiet"
            size="small"
            aria-label="左右翻转"
            onClick={() => setFlip((value) => !value)}
          >
            <i className="ri-flip-horizontal-line" />
          </Button>
          <span className="library-separator" />
          <Button variant="quiet" size="small" onClick={() => p.onCopyImage(image)}>
            <i className="ri-file-copy-line" />
            复制图片
          </Button>
          <Button variant="quiet" size="small" onClick={() => p.onDownloadImage(image)}>
            <i className="ri-download-line" />
            另存为
          </Button>
          <span className="library-separator" />
          <Button
            variant="quiet"
            size="small"
            onClick={() => {
              p.onOpenWorkbench(image);
              onClose();
            }}
          >
            在工作台打开
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
