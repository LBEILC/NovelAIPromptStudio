import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { Layer, Popover } from '../ui';

// Local positioning adapter until shared layers support the reference's end alignment and gap.
function usePosition(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  align: 'start' | 'end',
) {
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const node = content.current?.closest<HTMLElement>('.nps-layer');
    const anchor = anchorRef.current;
    if (!node || !anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const style = getComputedStyle(node);
      const gap = parseFloat(style.getPropertyValue('--ctl-gap'));
      const margin = parseFloat(style.getPropertyValue('--sp-2'));
      const left = Math.max(
        margin,
        Math.min(
          innerWidth - node.offsetWidth - margin,
          align === 'end' ? rect.right - node.offsetWidth : rect.left,
        ),
      );
      const flip =
        rect.bottom + gap + node.offsetHeight > innerHeight - margin &&
        rect.top > innerHeight - rect.bottom;
      const top = Math.max(margin, flip ? rect.top - node.offsetHeight - gap : rect.bottom + gap);
      const origin = `${Math.max(0, Math.min(node.offsetWidth, rect.left + rect.width / 2 - left))}px ${flip ? node.offsetHeight : 0}px`;
      if (node.style.left !== `${left}px`) node.style.left = `${left}px`;
      if (node.style.top !== `${top}px`) node.style.top = `${top}px`;
      if (node.style.transformOrigin !== origin) node.style.transformOrigin = origin;
    };
    const observer = new MutationObserver(place);
    observer.observe(node, { attributes: true, attributeFilter: ['style'] });
    const resize = new ResizeObserver(place);
    resize.observe(node);
    resize.observe(anchor);
    window.addEventListener('resize', place);
    place();
    return () => {
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [open, anchorRef, align]);
  return content;
}

export function LibraryPopover({
  align = 'end',
  ...props
}: ComponentProps<typeof Popover> & { align?: 'start' | 'end' }) {
  const content = usePosition(props.open, props.anchor, align);
  return (
    <Popover {...props}>
      <div className="library-popover-content" ref={content}>
        {props.children}
      </div>
    </Popover>
  );
}

export function LibraryLayer({
  align = 'end',
  ...props
}: ComponentProps<typeof Layer> & { align?: 'start' | 'end' }) {
  const content = usePosition(props.open, props.anchor, align);
  return (
    <Layer {...props}>
      <div className="library-popover-content" ref={content}>
        {props.children}
      </div>
    </Layer>
  );
}
