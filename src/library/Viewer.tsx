import { DecodedImage } from '../ui/transitions';
import { SurfaceButton } from '../ui';
import { hasImageName, imageAccessibleName } from '../lib/imageNaming.js';
import { dimensions } from './presentation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shortcut, Button } from '../ui';
import { mediaUrl } from '../lib/imageStage.js';
import type { ImageProject } from '../shared/types';
import type { LibraryGroup, LibraryProps } from './types';

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
  const [zoom, setZoom] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState(false);
  // Keep the opening order even if background library work completes while viewing.
  const [groups] = useState(() =>
    p.groups.map((group) => ({ ...group, members: [...group.members] })),
  );
  const [image, setImage] = useState(p.preview);
  const group = groups.find((item) => item.members.some((member) => member.id === image?.id));
  const sequence = groups.flatMap((item) =>
    item.members.map((member) => ({ group: item, member })),
  );
  const position = sequence.findIndex((item) => item.member.id === image?.id);
  const show = (nextGroup: LibraryGroup, next: LibraryGroup['cover']) => {
    setImage(next);
    p.onPreview(nextGroup, next);
  };
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, dpr: window.devicePixelRatio });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const pending = useRef<{ x: number; y: number; u: number; v: number } | null>(null);
  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const measure = () => {
      const style = getComputedStyle(node);
      setSize({
        width: node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        height: node.clientHeight,
        dpr: window.devicePixelRatio,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    root.current?.focus();
    return () => {
      previous?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    setZoom(null);
    setNatural({ width: 0, height: 0 });
    setRotation(0);
    setFlip(false);
  }, [image?.id]);
  const navigate = (delta: number) => {
    if (position < 0) return;
    const next = sequence[position + delta];
    if (next) show(next.group, next.member);
  };
  const navigateGroup = (delta: number) => {
    if (!group) return;
    const next = groups[groups.indexOf(group) + delta];
    if (next) show(next, next.cover);
  };
  const width = natural.width || image?.metadata.width || 1;
  const height = natural.height || image?.metadata.height || 1;
  const sideways = Math.abs(rotation % 180) === 90;
  const rotatedWidth = sideways ? height : width;
  const rotatedHeight = sideways ? width : height;
  const fit = Math.min(size.width / rotatedWidth, size.height / rotatedHeight, 1 / size.dpr);
  const scale = zoom == null ? fit : zoom / size.dpr;
  const stageWidth = rotatedWidth * scale;
  const stageHeight = rotatedHeight * scale;
  const applyZoom = (value: number | null, point?: { x: number; y: number }) => {
    if (value === zoom) return;
    const node = canvas.current;
    const stage = node?.querySelector('.library-viewer-image');
    if (node && stage) {
      const bounds = node.getBoundingClientRect();
      const rect = stage.getBoundingClientRect();
      const x = point?.x ?? bounds.left + node.clientWidth / 2;
      const y = point?.y ?? bounds.top + node.clientHeight / 2;
      pending.current = {
        x: x - bounds.left - parseFloat(getComputedStyle(node).paddingLeft),
        y: y - bounds.top,
        u: (x - rect.left) / rect.width,
        v: (y - rect.top) / rect.height,
      };
    }
    setZoom(value);
  };
  const changeZoom = (factor: number, point?: { x: number; y: number }) =>
    applyZoom(Math.min(8, Math.max(0.05, (zoom ?? fit * size.dpr) * factor)), point);
  const wheelZoom = useRef(changeZoom);
  wheelZoom.current = changeZoom;
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
      wheelZoom.current(Math.exp(-event.deltaY * units * 0.002), {
        x: event.clientX,
        y: event.clientY,
      });
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);
  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const anchor = pending.current;
    node.scrollLeft = anchor
      ? Math.max(0, (size.width - stageWidth) / 2) + anchor.u * stageWidth - anchor.x
      : (stageWidth - size.width) / 2;
    node.scrollTop = anchor
      ? Math.max(0, (size.height - stageHeight) / 2) + anchor.v * stageHeight - anchor.y
      : (stageHeight - size.height) / 2;
    pending.current = null;
  }, [stageWidth, stageHeight, size.width, size.height]);
  if (!image) return null;
  return createPortal(
    <div
      className="library-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="大图"
      data-viewer-project-id={image.id}
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
          event.stopPropagation();
          navigate(event.key === 'ArrowLeft' ? -1 : 1);
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          navigateGroup(event.key === 'ArrowUp' ? -1 : 1);
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
      <div className="library-viewer-top">
        {hasImageName(image) && <b>{image.name}</b>}
        <span className="library-help library-mono">
          {dimensions(image.metadata)}
          {group &&
            group.members.length > 1 &&
            ` · ${group.members.findIndex((member) => member.id === image.id) + 1} / ${group.members.length}`}
        </span>
        <Button variant="quiet" size="small" onClick={onClose}>
          <i className="ri-close-line" />
          关闭 <Shortcut keys={['Esc']} />
        </Button>
      </div>
      <div
        className="library-viewer-canvas"
        ref={canvas}
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
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onPointerUp={(event) => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <div className="library-viewer-image" style={{ width: stageWidth, height: stageHeight }}>
          <DecodedImage
            src={mediaUrl(image.image_path)}
            alt={imageAccessibleName(image)}
            draggable={false}
            onLoad={(event) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onDoubleClick={() => applyZoom(zoom == null ? 1 : null)}
            style={{
              width: width * scale,
              height: height * scale,
              transform: `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${flip ? -1 : 1})`,
            }}
          />
        </div>
      </div>
      <Button
        className="library-viewer-prev"
        variant="quiet"
        aria-label="上一张"
        disabled={position <= 0}
        data-tip={position <= 0 ? '已经是第一张' : '上一张'}
        onClick={() => navigate(-1)}
      >
        <i className="ri-arrow-left-s-line" />
      </Button>
      <Button
        className="library-viewer-next"
        variant="quiet"
        aria-label="下一张"
        disabled={position < 0 || position >= sequence.length - 1}
        data-tip={position < 0 || position >= sequence.length - 1 ? '已经是最后一张' : '下一张'}
        onClick={() => navigate(1)}
      >
        <i className="ri-arrow-right-s-line" />
      </Button>
      <div className="library-viewer-foot">
        {group && group.members.length > 1 && (
          <div className="library-strip">
            {group.members.map((member) => (
              <SurfaceButton
                kind="image"
                key={member.id}
                className={member.id === image.id ? 'is-current' : ''}
                aria-label={imageAccessibleName(member)}
                onClick={() => show(group, member)}
              >
                <DecodedImage src={mediaUrl(member.thumbnail_path)} alt="" />
              </SurfaceButton>
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
          <Button variant="quiet" size="small" aria-label="100%" onClick={() => applyZoom(1)}>
            {zoom == null ? '适合窗口' : `${Math.round(zoom * 100)}%`}
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
          <Button
            variant="quiet"
            size="small"
            onClick={() => p.onCopyImage(image as Parameters<LibraryProps['onCopyImage']>[0])}
          >
            <i className="ri-file-copy-line" />
            复制图片
          </Button>
          <Button
            variant="quiet"
            size="small"
            onClick={() =>
              p.onDownloadImage(image as Parameters<LibraryProps['onDownloadImage']>[0])
            }
          >
            <i className="ri-download-line" />
            另存为
          </Button>
          {p.onOpenWorkbench && <span className="library-separator" />}
          {p.onOpenWorkbench && (
            <Button
              variant="quiet"
              size="small"
              onClick={() => {
                p.onOpenWorkbench?.(
                  image as Parameters<NonNullable<LibraryProps['onOpenWorkbench']>>[0],
                );
                onClose();
              }}
            >
              在工作台打开
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
