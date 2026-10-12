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

/** Keep native top-layer nodes mounted until their CSS exit transitions finish. */
function usePresence(open: boolean, ref: RefObject<HTMLElement | null>) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    let cancelled = false;
    if (open) setMounted(true);
    else {
      const animations = ref.current?.getAnimations?.() ?? [];
      if (!animations.length) setMounted(false);
      else
        void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
          if (!cancelled) setMounted(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, ref]);
  return open || mounted;
}

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
  const present = usePresence(open, ref);
  useScrollArea(ref, { enabled: open });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const node = ref.current;
    const rect = point
      ? new DOMRect(point.x, point.y, 0, 0)
      : anchor.current?.getBoundingClientRect();
    if (open && node && rect) placeLayer(node, rect, side);
  });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const trigger = anchor.current;
    // Measure the actual flipped placement before interpolating from its anchor.
    const entering = getComputedStyle(node)
      .transitionDuration.split(',')
      .some((duration) => parseFloat(duration) > 0);
    if (entering) node.setAttribute('data-entering', '');
    node.showPopover();
    const position = () => {
      const rect = point ? new DOMRect(point.x, point.y, 0, 0) : trigger?.getBoundingClientRect();
      if (rect) placeLayer(node, rect, side);
    };
    position();
    if (entering) node.getBoundingClientRect();
    const enterFrame = entering
      ? requestAnimationFrame(() => node.removeAttribute('data-entering'))
      : undefined;
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
      if (enterFrame !== undefined) cancelAnimationFrame(enterFrame);
      node.removeAttribute('data-entering');
      node.removeEventListener('toggle', toggle);
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      node.hidePopover();
      if (focus && trigger?.isConnected) trigger.focus();
    };
  }, [open, anchor, focus, side, point, mode]);
  return present ? (
    <div
      ref={ref}
      id={id}
      popover={mode}
      role={open ? role : undefined}
      aria-hidden={!open || undefined}
      inert={!open || undefined}
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
  const present = usePresence(open, ref);
  useScrollArea(ref, { enabled: open });
  const cancel = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!present && document.activeElement === document.body && returnFocus.current?.isConnected)
      returnFocus.current.focus();
  }, [present]);
  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    returnFocus.current = previous;
    const node = ref.current!;
    node.showModal();
    cancel.current?.focus();
    return () => {
      node.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return present ? (
    <dialog
      ref={ref}
      className="nps-dialog"
      aria-hidden={!open || undefined}
      inert={!open || undefined}
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

/** Annotate arbitrary controls without changing their layout. */
export function Tooltip({ children, text }: { children: ReactNode; text: string }) {
  return isValidElement<{ 'data-tip'?: string }>(children) ? (
    cloneElement(children, { 'data-tip': text })
  ) : (
    <span data-tip={text}>{children}</span>
  );
}

/** Shared across the application, including native top-layer descendants. */
export function TooltipRoot() {
  const anchor = useRef<HTMLElement | null>(null);
  const [tip, setTip] = useState({ text: '' });
  const text = tip.text;
  // Equal labels on different controls still need a render to reposition the layer.
  const setText = (value: string) =>
    setTip((previous) => (value || previous.text ? { text: value } : previous));
  const lastText = useRef('');
  if (text) lastText.current = text;
  const id = useId();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reset: ReturnType<typeof setTimeout> | undefined;
    let warm = false;
    let target: HTMLElement | null = null;
    let described: HTMLElement | null = null;
    let previousDescription: string | null = null;
    let pointer = false;
    const undescribe = () => {
      if (described) {
        if (previousDescription === null) described.removeAttribute('aria-describedby');
        else described.setAttribute('aria-describedby', previousDescription);
        described = null;
      }
    };
    const hide = () => {
      clearTimeout(timer);
      undescribe();
      setText('');
      target = null;
      clearTimeout(reset);
      reset = setTimeout(() => {
        warm = false;
      }, 300);
    };
    const find = (node: EventTarget | null) =>
      node instanceof Element ? node.closest<HTMLElement>('[data-tip], [data-tip-overflow]') : null;
    const show = (node: HTMLElement | null, immediate = false) => {
      if (!node || node.closest('[inert], [aria-hidden="true"]') || node === target) return;
      hide();
      const measured = node.querySelector<HTMLElement>('[data-tip-measure]') ?? node;
      if (
        node.hasAttribute('data-tip-overflow') &&
        measured.scrollWidth <= measured.clientWidth &&
        measured.scrollHeight <= measured.clientHeight
      )
        return;
      const value = node.dataset.tip ?? node.dataset.tipOverflow ?? '';
      if (!value) return;
      target = node;
      clearTimeout(reset);
      const reveal = () => {
        if (!node.isConnected) return;
        warm = true;
        anchor.current = node;
        described =
          document.activeElement instanceof HTMLElement &&
          document.activeElement !== document.body &&
          document.activeElement.contains(node)
            ? document.activeElement
            : node;
        previousDescription = described.getAttribute('aria-describedby');
        described.setAttribute(
          'aria-describedby',
          [previousDescription, id].filter(Boolean).join(' '),
        );
        setText(value);
      };
      if (immediate || warm) reveal();
      else timer = setTimeout(reveal, 500);
    };
    const over = (event: PointerEvent) => show(find(event.target));
    const out = (event: PointerEvent) => {
      const next = find(event.relatedTarget);
      if (next !== target) {
        hide();
        if (next) show(next);
      }
    };
    const down = () => {
      pointer = true;
      hide();
    };
    const up = () => {
      pointer = false;
    };
    const focus = (event: FocusEvent) => {
      if (!pointer)
        show(
          find(event.target) ??
            (event.target instanceof Element
              ? event.target.querySelector<HTMLElement>('[data-tip-overflow]')
              : null),
          true,
        );
    };
    const key = (event: KeyboardEvent) => {
      pointer = false;
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      clearTimeout(reset);
      undescribe();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, [id]);
  return (
    <Layer
      open={!!text}
      anchor={anchor}
      onClose={() => setText('')}
      role="tooltip"
      id={id}
      className="nps-tip"
      mode="manual"
    >
      {lastText.current}
    </Layer>
  );
}
