import { Component, createRef, type ReactNode } from 'react';
import { animateElement, motionEnabled, motionTokens } from './transitions';

type Props = {
  ids: string[];
  attribute: 'data-wb-tag' | 'data-collection-id';
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  as?: 'span' | 'div';
  parentItem?: boolean;
};
type Removed = { copy: HTMLElement; next: string[] };
type Before = { positions: Map<string, DOMRect>; removed: Removed[]; added: Set<string> } | null;

/** Removed items leave an inert picture in the flow until the fade finishes.
 * Commands commit immediately; neither the copied controls nor IDs stay active.
 */
export class AnimatedItems extends Component<Props> {
  private node = createRef<HTMLElement>();
  private stops = new Set<() => void>();
  private alive = true;

  private items() {
    return new Map(
      [...(this.node.current?.querySelectorAll<HTMLElement>(`[${this.props.attribute}]`) ?? [])]
        .filter((node) => !node.closest('[data-list-exit]'))
        .map((node) => [
          node.getAttribute(this.props.attribute)!,
          this.props.parentItem ? node.parentElement! : node,
        ]),
    );
  }

  private positions() {
    return new Map([...this.items()].map(([id, node]) => [id, node.getBoundingClientRect()]));
  }

  getSnapshotBeforeUpdate(previous: Props): Before {
    if (previous.disabled || this.props.disabled || !motionEnabled()) return null;
    const next = new Set(this.props.ids);
    const old = new Set(previous.ids);
    if (next.size === old.size && [...next].every((id) => old.has(id))) return null;
    const removed: Removed[] = [];
    const nodes = this.items();
    for (const [id, node] of nodes) {
      if (next.has(id)) continue;
      const copy = node.cloneNode(true) as HTMLElement;
      for (const element of [copy, ...copy.querySelectorAll('*')]) {
        for (const attribute of element.getAttributeNames()) {
          if (
            attribute === 'id' ||
            attribute === 'tabindex' ||
            attribute === 'role' ||
            attribute.startsWith('aria-') ||
            (attribute.startsWith('data-') && !attribute.startsWith('data-image-'))
          )
            element.removeAttribute(attribute);
        }
      }
      copy.querySelectorAll('[popover],dialog').forEach((layer) => layer.remove());
      const rect = node.getBoundingClientRect();
      Object.assign(copy.style, {
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        minWidth: '0',
        flexShrink: '0',
        pointerEvents: 'none',
        transform: 'none',
        display: getComputedStyle(node).display,
      });
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('data-list-exit', '');
      copy.inert = true;
      removed.push({ copy, next: previous.ids.slice(previous.ids.indexOf(id) + 1) });
    }
    return {
      positions: this.positions(),
      removed,
      added: new Set(this.props.ids.filter((id) => !old.has(id))),
    };
  }

  private play(
    node: HTMLElement,
    frames: Keyframe[],
    duration: number,
    easing: string,
    done = () => {},
  ) {
    let stop = () => {};
    stop = animateElement(node, frames, duration, easing, () => {
      this.stops.delete(stop);
      done();
    });
    this.stops.add(stop);
  }

  private move(before: Map<string, DOMRect>) {
    // TODO(design): Movement outside this list (later section/group headings) needs
    // a choice between container height and individual translation; keep its existing layout.
    if (!this.alive || this.props.disabled || !motionEnabled()) return;
    for (const [id, node] of this.items()) {
      const old = before.get(id);
      const next = node.getBoundingClientRect();
      if (!old || (Math.abs(old.left - next.left) < 0.5 && Math.abs(old.top - next.top) < 0.5))
        continue;
      const t = motionTokens(node);
      this.play(
        node,
        [
          { transform: `translate(${old.left - next.left}px,${old.top - next.top}px)` },
          { transform: 'none' },
        ],
        t.move,
        t.easeMove,
      );
    }
  }

  componentDidUpdate(_previous: Props, _state: unknown, before: Before) {
    if (this.props.disabled || !motionEnabled()) {
      for (const stop of [...this.stops]) stop();
      return;
    }
    if (!before || !this.node.current) return;
    const nodes = this.items();
    for (const { copy, next } of before.removed) {
      const following = next.map((id) => nodes.get(id)).find(Boolean);
      this.node.current.insertBefore(copy, following ?? null);
      const t = motionTokens(copy);
      this.play(copy, [{ opacity: 1 }, { opacity: 0 }], t.exit, t.out, () => {
        const positions = this.positions();
        copy.remove();
        this.move(positions);
      });
    }
    this.move(before.positions);
    for (const id of before.added) {
      const node = nodes.get(id);
      if (!node) continue;
      const t = motionTokens(node);
      this.play(node, [{ opacity: 0 }, { opacity: 1 }], t.enter, t.out);
    }
  }

  componentWillUnmount() {
    this.alive = false;
    for (const stop of [...this.stops]) stop();
    this.stops.clear();
  }

  render() {
    const Tag = this.props.as ?? 'div';
    return (
      <Tag
        ref={(node) => {
          this.node.current = node;
        }}
        className={`nps-animated-items ${this.props.className ?? ''}`}
      >
        {this.props.children}
      </Tag>
    );
  }
}
