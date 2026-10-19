import { flushSync } from 'react-dom';
import {
  Component,
  createRef,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import './transitions.css';

export function motionEnabled() {
  const mode = document.documentElement.dataset.motion;
  return (
    mode !== 'off' && (mode === 'full' || !matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

/** Start the compositor-driven marker before publishing the content update.
 * Business commands stay in this event so later input cannot be overwritten.
 */
export function useNavigationSelection<T>(value: T, onChange: (next: T) => void) {
  const [selected, setSelected] = useState(value);
  useLayoutEffect(() => setSelected(value), [value]);
  const select = (next: T) => {
    flushSync(() => setSelected(next));
    onChange(next);
  };
  return [selected, select] as const;
}

function tokens(node: Element) {
  const style = getComputedStyle(node);
  const value = (name: string) => style.getPropertyValue(name).trim();
  const duration = (name: string) => {
    const text = value(name);
    return parseFloat(text) * (text.endsWith('ms') ? 1 : 1000);
  };
  return {
    exit: duration('--dur-1'),
    enter: duration('--dur-2'),
    move: duration('--dur-3'),
    out: value('--ease-out'),
    easeMove: value('--ease-move'),
    shift: parseFloat(value('--enter-shift')),
    scale: parseFloat(value('--enter-scale')),
  };
}

const running = new Set<() => void>();
let observing = false;
function observeMotion() {
  if (observing) return;
  observing = true;
  const update = () => {
    if (!motionEnabled()) for (const cancel of [...running]) cancel();
  };
  new MutationObserver(update).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-motion'],
  });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', update);
}

/** Animation cleanup is visual only. State, focus and commands never wait for it. */
function animate(
  node: HTMLElement,
  frames: Keyframe[],
  duration: number,
  easing: string,
  done = () => {},
) {
  if (!motionEnabled() || !node.animate || !Number.isFinite(duration)) {
    done();
    return () => {};
  }
  observeMotion();
  const animation = node.animate(frames, { duration, easing, fill: 'both' });
  let completed = false;
  const cancel = () => {
    if (completed) return;
    completed = true;
    running.delete(cancel);
    animation.cancel();
    done();
  };
  running.add(cancel);
  void animation.finished.then(cancel, cancel);
  return cancel;
}

export { animate as animateElement, tokens as motionTokens };

let snapshotSheet: CSSStyleSheet | undefined;
let sheetSignature = '';
function styleSheet() {
  const signature = [...document.styleSheets]
    .map((sheet) => sheet.href || sheet.ownerNode?.textContent)
    .join('\n');
  if (!snapshotSheet || signature !== sheetSignature) {
    snapshotSheet = new CSSStyleSheet();
    snapshotSheet.replaceSync(
      [...document.styleSheets]
        .map((sheet) => {
          try {
            return [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
          } catch {
            return '';
          }
        })
        .join('\n') +
        '\n*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
    );
    sheetSignature = signature;
  }
  return snapshotSheet;
}

/** A bounded, inert picture of the old DOM, not a second mounted React tree.
 * Shadow DOM keeps its controls/IDs out of application queries and the focus order.
 * Only the already-windowed grid is copied; no offscreen rows are materialized.
 */
function snapshot(source: HTMLElement) {
  const rect = source.getBoundingClientRect();
  if (!rect.width || !rect.height || !source.checkVisibility()) return null;
  const host = document.createElement('div');
  host.className = 'nps-transition-snapshot';
  host.dataset.transitionSource = source.className;
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  host.popover = 'manual';
  Object.assign(host.style, {
    position: 'fixed',
    inset: 'auto',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    padding: '0',
    border: '0',
    background: 'transparent',
    overflow: 'hidden',
    pointerEvents: 'none',
  });
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.adoptedStyleSheets = [styleSheet()];
  // Preserve selector context and inherited styles without duplicating ancestor layout.
  const ancestors: HTMLElement[] = [];
  for (let node = source.parentElement; node; node = node.parentElement) ancestors.unshift(node);
  let parent: ShadowRoot | HTMLElement = shadow;
  for (const ancestor of ancestors) {
    const copy = ancestor.cloneNode(false) as HTMLElement;
    copy.removeAttribute('popover');
    copy.style.setProperty('display', 'contents', 'important');
    parent.appendChild(copy);
    parent = copy;
  }
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute('popover');
  Object.assign(clone.style, {
    position: 'relative',
    inset: 'auto',
    margin: '0',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    minWidth: '0',
    maxWidth: 'none',
    flex: 'none',
    opacity: '1',
    transform: 'none',
  });
  parent.appendChild(clone);
  const originals = [source, ...source.querySelectorAll<HTMLElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  document.body.appendChild(host);
  host.showPopover();
  originals.forEach((node, index) => {
    const copy = copies[index];
    if (!copy) return;
    copy.scrollTop = node.scrollTop;
    copy.scrollLeft = node.scrollLeft;
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
      (copy as HTMLInputElement).value = node.value;
  });
  return { host, rect };
}

type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  change: unknown;
  kind?: 'content' | 'height' | 'presence';
  direction?: number;
  enter?: boolean;
  scale?: boolean;
  shift?: boolean;
  duration?: 'enter' | 'move';
  nodeRef?: RefObject<HTMLDivElement | null>;
};
type Snapshot = { old: ReturnType<typeof snapshot>; height: number; opacity: string } | null;

/** Capture before React mutates the DOM; publish the new live content immediately. */
export class TransitionSurface extends Component<SurfaceProps> {
  private node = createRef<HTMLDivElement>();
  private stop = () => {};
  private stopOld = () => {};

  getSnapshotBeforeUpdate(previous: SurfaceProps): Snapshot {
    if (previous.change === this.props.change || !this.node.current) return null;
    const node = this.node.current;
    const opacity = getComputedStyle(node).opacity;
    const height = node.getBoundingClientRect().height;
    const interrupted = node.getAnimations().length > 0;
    this.stop();
    this.stopOld();
    return {
      old: motionEnabled() ? snapshot(node) : null,
      height,
      opacity: interrupted ? opacity : '0',
    };
  }

  componentDidMount() {
    if (this.props.enter) this.arrive(null);
  }

  componentDidUpdate(_previous: SurfaceProps, _state: unknown, before: Snapshot) {
    if (before) this.arrive(before);
  }

  componentWillUnmount() {
    this.stop();
    this.stopOld();
    // Presence surfaces can exit even when their business owner disappears.
    if (this.props.kind === 'presence' && this.node.current && motionEnabled()) {
      const old = snapshot(this.node.current);
      if (old) {
        const t = tokens(this.node.current);
        animate(old.host, [{ opacity: 1 }, { opacity: 0 }], t.exit, t.out, () => old.host.remove());
      }
    }
  }

  private arrive(before: Snapshot) {
    const node = this.node.current;
    if (!node) return;
    const t = tokens(node);
    const { kind = 'content', direction = 0, shift = true, duration, scale } = this.props;
    const scaleIn = scale && !before;
    const height = node.getBoundingClientRect().height;
    const old = before?.old;
    if (old) {
      old.host.dataset.transitionKind = `${kind}-exit`;
      const frames: Keyframe[] =
        kind === 'height'
          ? [
              { height: `${before.height}px`, opacity: 1 },
              { height: `${height}px`, opacity: 0 },
            ]
          : [{ opacity: 1 }, { opacity: 0 }];
      this.stopOld = animate(
        old.host,
        frames,
        kind === 'height' ? t.move : t.exit,
        kind === 'height' ? t.easeMove : t.out,
        () => old.host.remove(),
      );
    }
    if (kind === 'presence' && this.props.change === false) return;
    const frames: Keyframe[] =
      kind === 'height'
        ? [
            { height: `${before?.height || 0}px`, opacity: before?.opacity || 0 },
            { height: `${height}px`, opacity: 1 },
          ]
        : [{ opacity: before?.opacity || 0 }, { opacity: 1 }];
    if (kind !== 'height' && (direction || (kind === 'presence' && shift) || scaleIn)) {
      frames[0].transform = scaleIn
        ? `scale(${t.scale})`
        : direction
          ? `translateX(${Math.sign(direction) * t.shift * 2}px)`
          : `translateY(${t.shift * 2}px)`;
      frames[1].transform = 'none';
    }
    if (kind === 'height') node.setAttribute('data-height-animating', '');
    this.stop = animate(
      node,
      frames,
      kind === 'height' || scaleIn || duration === 'move' ? t.move : t.enter,
      kind === 'height' ? t.easeMove : t.out,
      () => node.removeAttribute('data-height-animating'),
    );
  }

  render() {
    const {
      change,
      kind = 'content',
      direction,
      enter,
      scale,
      shift,
      duration,
      nodeRef,
      children,
      className = '',
      ...props
    } = this.props;
    return (
      <div
        {...props}
        className={`nps-transition-${kind} ${className}`}
        data-transition-kind={kind}
        ref={(node) => {
          this.node.current = node;
          if (nodeRef) nodeRef.current = node;
        }}
      >
        {children}
      </div>
    );
  }
}

export function Collapse({
  open,
  children,
  ...props
}: Omit<SurfaceProps, 'change' | 'kind'> & { open: boolean; children: ReactNode }) {
  return (
    <TransitionSurface {...props} change={open} kind="height">
      {open ? children : null}
    </TransitionSurface>
  );
}

/** Keep native disclosure semantics, with a shared height surface for its contents. */
export function Disclosure({
  summary,
  summaryClassName,
  children,
}: {
  summary: ReactNode;
  summaryClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="nps-disclosure" open={open}>
      <summary
        className={summaryClassName}
        onClick={(event) => {
          if (event.defaultPrevented) return;
          event.preventDefault();
          setOpen(!open);
        }}
      >
        {summary}
      </summary>
      <Collapse open={open}>{children}</Collapse>
    </details>
  );
}

export function Presence({
  show,
  children,
  ...props
}: Omit<SurfaceProps, 'change' | 'kind'> & { show: boolean; children: ReactNode }) {
  return (
    <TransitionSurface {...props} change={show} kind="presence" enter={show}>
      {show ? children : null}
    </TransitionSurface>
  );
}

/** Animate only newly inserted visible items; scrolling/recycling is not insertion. */
export function useNewItemEntrance(
  root: RefObject<HTMLElement | null>,
  ids: string[],
  revision: string,
  ready = true,
) {
  const previous = useRef<{ ids: Set<string>; revision: string } | null>(null);
  const active = useRef(new Set<() => void>());
  useLayoutEffect(() => {
    if (!ready) return;
    const before = previous.current;
    if (before?.revision === revision && root.current && motionEnabled()) {
      for (const item of root.current.querySelectorAll<HTMLElement>('[data-enter-id]')) {
        if (before.ids.has(item.dataset.enterId!)) continue;
        const t = tokens(item);
        let cancel = () => {};
        cancel = animate(item, [{ opacity: 0 }, { opacity: 1 }], t.enter, t.out, () =>
          active.current.delete(cancel),
        );
        active.current.add(cancel);
      }
    }
    previous.current = { ids: new Set(ids), revision };
  }, [root, ids, revision, ready]);
  useLayoutEffect(
    () => () => {
      for (const cancel of active.current) cancel();
      active.current.clear();
    },
    [],
  );
}

const displayedImages = new Set<string>();
type ImageProps = ImgHTMLAttributes<HTMLImageElement> & { immediate?: boolean };
export function DecodedImage(props: ImageProps) {
  return <DecodedImageSource key={props.src} {...props} />;
}
function DecodedImageSource({ src = '', className = '', immediate = false, ...props }: ImageProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState('');
  const [known] = useState(() => displayedImages.has(src));
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !src) return;
    let current = true;
    // Establish the transparent first frame even when decode resolves immediately.
    void getComputedStyle(node).opacity;
    void node.decode().then(
      () => {
        if (!current) return;
        displayedImages.add(src);
        setReady(src);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [src]);
  return (
    <img
      {...props}
      ref={ref}
      src={src || undefined}
      className={`nps-decoded-image ${className}`}
      data-image-ready={known || ready === src || immediate || undefined}
      data-image-immediate={known || immediate || undefined}
    />
  );
}

/** FLIP only the empty indicator, never the label or image it marks. */
export function useMovingIndicator(
  container: RefObject<HTMLElement | null>,
  indicator: RefObject<HTMLElement | null>,
  selector: string,
  change: unknown,
) {
  const placed = useRef(false);
  const cancel = useRef(() => {});
  const geometry = useRef('');
  useLayoutEffect(() => {
    const root = container.current;
    const marker = indicator.current;
    if (!root || !marker) return;
    const update = (moving = false) => {
      const target = root.querySelector<HTMLElement>(selector);
      if (!target) {
        marker.hidden = true;
        placed.current = false;
        return;
      }
      const before = marker.getBoundingClientRect();
      const outer = root.getBoundingClientRect();
      const next = target.getBoundingClientRect();
      // Popovers may still be scaling in. Store layout pixels, not scaled screen pixels.
      const scaleX = outer.width / root.offsetWidth || 1;
      const scaleY = outer.height / root.offsetHeight || 1;
      const width = next.width / scaleX;
      const height = next.height / scaleY;
      const x = (next.left - outer.left) / scaleX + root.scrollLeft - root.clientLeft;
      const y = (next.top - outer.top) / scaleY + root.scrollTop - root.clientTop;
      const key = [x, y, width, height].map((value) => Math.round(value * 100) / 100).join(':');
      if (placed.current && geometry.current === key) return;
      geometry.current = key;
      cancel.current();
      marker.hidden = false;
      Object.assign(marker.style, {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${x}px, ${y}px)`,
      });
      if (placed.current && moving && next.width && next.height) {
        const t = tokens(marker);
        cancel.current = animate(
          marker,
          [
            {
              transform: `translate(${x + (before.left - next.left) / scaleX}px, ${y + (before.top - next.top) / scaleY}px) scale(${before.width / next.width}, ${before.height / next.height})`,
            },
            { transform: `translate(${x}px, ${y}px)` },
          ],
          t.move,
          t.easeMove,
        );
      }
      placed.current = true;
    };
    update(true);
    const resize = new ResizeObserver(() => update());
    resize.observe(root);
    for (const child of root.children) if (child !== marker) resize.observe(child);
    return () => resize.disconnect();
  }, [container, indicator, selector, change]);
  useLayoutEffect(() => () => cancel.current(), []);
}
