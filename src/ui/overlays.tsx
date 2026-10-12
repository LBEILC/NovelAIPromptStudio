import {
  useEffect,
  useLayoutEffect,
  useRef,
  useId,
  useState,
  cloneElement,
  isValidElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { cx, focusables, placeLayer, trapTab } from './internal';
import { useScrollArea } from './useScrollArea';

export function Layer({
  open,
  onClose,
  anchor,
  children,
  role,
  id,
  className,
  focus = false,
  side = false,
  point,
  labelledBy,
  onKeyDown,
  mode = 'auto',
}: {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  role?: string;
  id?: string;
  className?: string;
  focus?: boolean;
  side?: boolean;
  point?: { x: number; y: number };
  labelledBy?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  mode?: 'auto' | 'manual';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollArea(ref, { enabled: open });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const trigger = anchor.current;
    node.showPopover();
    const position = () => {
      const rect = point ? new DOMRect(point.x, point.y, 0, 0) : trigger?.getBoundingClientRect();
      if (rect) placeLayer(node, rect, side);
    };
    position();
    if (focus) (focusables(node)[0] ?? node).focus();
    const observer = new ResizeObserver(position);
    observer.observe(node);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    const toggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') closeRef.current();
    };
    node.addEventListener('toggle', toggle);
    return () => {
      node.removeEventListener('toggle', toggle);
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      node.hidePopover();
      if (focus && trigger?.isConnected) trigger.focus();
    };
  }, [open, anchor, focus, side, point, mode]);
  return open ? (
    <div
      ref={ref}
      id={id}
      popover={mode}
      role={role}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className={cx('nps-layer', className)}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  ) : null;
}

export function Popover({
  open,
  onClose,
  anchor,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  label: string;
}) {
  const id = useId();
  return (
    <Layer
      open={open}
      onClose={onClose}
      anchor={anchor}
      focus
      role="dialog"
      labelledBy={id}
      className="nps-popover"
      onKeyDown={(event) => {
        trapTab(event, event.currentTarget);
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <span id={id} className="nps-sr">
        {label}
      </span>
      {children}
    </Layer>
  );
}

export function DialogContent({
  title,
  children,
  quote,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  destructive = false,
  confirmDisabled = false,
  cancelRef,
}: {
  title: string;
  children: ReactNode;
  quote?: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
  confirmDisabled?: boolean;
  cancelRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <>
      <h3 className="nps-dialog-title">{title}</h3>
      <div className="nps-dialog-body">{children}</div>
      {quote && <blockquote className="nps-quote">{quote}</blockquote>}
      <div className="nps-actions">
        <button ref={cancelRef} type="button" className="nps-button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={cx('nps-button', destructive ? 'nps-button-danger-outline' : 'nps-button-ink')}
          onClick={onConfirm}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </button>
      </div>
    </>
  );
}
export function Dialog({
  open,
  ...props
}: { open: boolean } & React.ComponentProps<typeof DialogContent>) {
  const ref = useRef<HTMLDialogElement>(null);
  useScrollArea(ref, { enabled: open });
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    node.showModal();
    cancel.current?.focus();
    return () => {
      node.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return open ? (
    <dialog
      ref={ref}
      className="nps-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
      onKeyDown={(event) => {
        trapTab(event, event.currentTarget);
        if (props.destructive && event.key === 'Enter' && document.activeElement !== cancel.current)
          event.preventDefault();
      }}
    >
      <div id={id} className="nps-sr">
        {props.title}
      </div>
      <DialogContent {...props} cancelRef={cancel} />
    </dialog>
  ) : null;
}

export function Tooltip({ children, text }: { children: ReactNode; text: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const id = useId();
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => {
    window.addEventListener('scroll', hide, true);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);
  return (
    <span
      ref={anchor}
      className="nps-tooltip-anchor"
      aria-describedby={open ? id : undefined}
      onPointerEnter={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(true), 500);
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={() => setOpen(true)}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          hide();
        }
      }}
    >
      {isValidElement<{ 'aria-describedby'?: string }>(children)
        ? cloneElement(children, {
            'aria-describedby':
              [children.props['aria-describedby'], open ? id : undefined]
                .filter(Boolean)
                .join(' ') || undefined,
          })
        : children}
      <Layer
        open={open}
        anchor={anchor}
        onClose={hide}
        role="tooltip"
        id={id}
        className="nps-tip"
        mode="manual"
      >
        {text}
      </Layer>
    </span>
  );
}
