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
import { flushSync } from 'react-dom';
import { cx, focusables, placeLayer, trapTab } from './internal';
import { useScrollArea } from './useScrollArea';

const activeLayers: {
  node: HTMLElement;
  trigger: HTMLElement | null;
  close: () => void;
  escapeFromAnchor: boolean;
}[] = [];

/** An inert exit can outlive its owner (for example, a menu that deletes its row). */
function retainLayerExit(source: HTMLElement, opacity: string, transform = 'none') {
  if (document.documentElement.dataset.motion === 'off') return;
  const ghost = source.cloneNode(true) as HTMLElement;
  for (const item of [ghost, ...ghost.querySelectorAll<HTMLElement>('*')]) {
    item.removeAttribute('id');
    item.removeAttribute('role');
    item.removeAttribute('aria-labelledby');
  }
  ghost.removeAttribute('data-entering');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, { pointerEvents: 'none', opacity, transform, transition: 'none' });
  document.body.append(ghost);
  ghost.showPopover();
  ghost.getBoundingClientRect();
  ghost.style.transition = '';
  ghost.style.opacity = '';
  ghost.hidePopover();
  const animations = ghost.getAnimations?.() ?? [];
  if (!animations.length) ghost.remove();
  else
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() =>
      ghost.remove(),
    );
}

/** Keep native top-layer nodes mounted until their CSS exit transitions finish. */
function usePresence(open: boolean, ref: RefObject<HTMLElement | null>) {
  const [mounted, setMounted] = useState(open);
  useLayoutEffect(() => {
    let cancelled = false;
    if (open) {
      setMounted(true);
      if (ref.current?.hasAttribute('popover')) ref.current.showPopover();
    } else {
      if (ref.current?.hasAttribute('popover')) ref.current.hidePopover();
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
  escapeFromAnchor = false,
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
  escapeFromAnchor?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  // Move focus out before hidePopover can restore the browser's opening-time
  // focus, which need not be this layer's trigger. Do not steal a new target.
  useLayoutEffect(() => {
    if (
      !open &&
      wasOpen.current &&
      focus &&
      anchor.current?.isConnected &&
      !anchor.current.closest('[inert]') &&
      (document.activeElement === document.body || ref.current?.contains(document.activeElement))
    )
      anchor.current.focus();
    wasOpen.current = open;
  }, [open, focus, anchor]);
  const present = usePresence(open, ref);
  const wasPresent = useRef(present);
  useLayoutEffect(() => {
    if (
      wasPresent.current &&
      !present &&
      focus &&
      document.activeElement === document.body &&
      anchor.current?.isConnected &&
      !anchor.current.closest('[inert]')
    )
      anchor.current.focus();
    wasPresent.current = present;
  }, [present, focus, anchor]);
  useScrollArea(ref, { enabled: open });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pointRef = useRef(point);
  pointRef.current = point;
  const snapshot = useRef<{ trigger: HTMLElement | null; node: HTMLElement } | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!present) snapshot.current = null;
    if (!open || !node || mode === 'manual') return;
    const old = snapshot.current;
    if (old && old.trigger !== anchor.current) {
      // A different anchor starts a new entry. Retain an inert visual snapshot
      // at the previous position so replacing the editor cannot skip its exit.
      retainLayerExit(old.node, getComputedStyle(node).opacity);
      if (getComputedStyle(node).transitionDuration !== '0s') {
        node.setAttribute('data-entering', '');
        node.getBoundingClientRect();
        requestAnimationFrame(() => node.removeAttribute('data-entering'));
      }
      if (focus) (focusables(node)[0] ?? node).focus();
    }
    snapshot.current = { trigger: anchor.current, node: node.cloneNode(true) as HTMLElement };
  });
  useLayoutEffect(() => {
    if (open && focus && ref.current) (focusables(ref.current)[0] ?? ref.current).focus();
  }, [open, focus, anchor]);
  useEffect(() => {
    const node = ref.current;
    if (!open || !node || mode === 'manual') return;
    const entry = {
      node,
      trigger: anchor.current,
      close: () => closeRef.current(),
      escapeFromAnchor,
    };
    for (const layer of activeLayers) if (!layer.node.contains(entry.trigger)) layer.close();
    activeLayers.push(entry);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      const index = activeLayers.indexOf(entry);
      if (
        activeLayers
          .slice(index)
          .some((layer) => layer.node.contains(target) || layer.trigger?.contains(target))
      )
        return;
      // A blank-area pointer default would blur the synchronously restored
      // trigger. Real controls still receive their normal focus and click.
      const focusTarget =
        target instanceof Element &&
        target.closest(
          'button, input, select, textarea, a[href], label, [tabindex], [contenteditable="true"]',
        );
      if (focus && !focusTarget) event.preventDefault();
      flushSync(() => entry.close());
    };
    const escape = (event: KeyboardEvent) => {
      const focusedLayer = [...activeLayers]
        .reverse()
        .find(
          (layer) =>
            layer.node.contains(event.target as Node) ||
            (layer.escapeFromAnchor && layer.trigger?.contains(event.target as Node)),
        );
      if (event.key !== 'Escape' || (focusedLayer ?? activeLayers.at(-1)) !== entry) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      entry.close();
      entry.trigger?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      for (const layer of activeLayers)
        if (layer !== entry && node.contains(layer.node)) layer.close();
      activeLayers.splice(activeLayers.indexOf(entry), 1);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open, anchor, anchor.current, mode, escapeFromAnchor]);
  useLayoutEffect(() => {
    const node = ref.current;
    const rect = point
      ? new DOMRect(point.x, point.y, 0, 0)
      : anchor.current?.getBoundingClientRect();
    if (open && node && rect) placeLayer(node, rect, side);
  });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!present || !node) return;
    // Measure the actual flipped placement before interpolating from its anchor.
    const entering = getComputedStyle(node)
      .transitionDuration.split(',')
      .some((duration) => parseFloat(duration) > 0);
    if (entering) node.setAttribute('data-entering', '');
    node.showPopover();
    const position = () => {
      const currentPoint = pointRef.current;
      const rect = currentPoint
        ? new DOMRect(currentPoint.x, currentPoint.y, 0, 0)
        : anchor.current?.getBoundingClientRect();
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
    return () => {
      if (node.matches(':popover-open') && !node.hasAttribute('aria-hidden')) {
        const style = getComputedStyle(node);
        retainLayerExit(node, style.opacity, style.transform);
      }
      if (enterFrame !== undefined) cancelAnimationFrame(enterFrame);
      node.removeAttribute('data-entering');
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      node.hidePopover();
    };
  }, [present, anchor, side, mode]);
  return present ? (
    <div
      ref={ref}
      id={id}
      popover="manual"
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
    const over = (event: PointerEvent) => {
      if (!pointer) show(find(event.target));
    };
    const out = (event: PointerEvent) => {
      const next = find(event.relatedTarget);
      if (next !== target) {
        hide();
        if (next && !pointer) show(next);
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
      className={anchor.current?.dataset.tipImage ? 'nps-tip wb-tab-preview' : 'nps-tip'}
      mode="manual"
    >
      {anchor.current?.dataset.tipImage ? (
        <>
          <img src={anchor.current.dataset.tipImage} alt="" />
          <span>{lastText.current}</span>
          <span className="nps-help">{anchor.current.dataset.tipDate}</span>
        </>
      ) : (
        lastText.current
      )}
    </Layer>
  );
}
