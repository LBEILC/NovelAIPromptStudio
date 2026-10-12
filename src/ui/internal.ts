import type { KeyboardEvent } from 'react';

export const cx = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(' ');
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export const quantize = (value: number, min: number, max: number, step: number) =>
  clamp(Number((min + Math.round((value - min) / step) * step).toPrecision(12)), min, max);
export const composing = (event: KeyboardEvent) =>
  event.nativeEvent.isComposing || event.keyCode === 229;

export function focusables(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'),
  ].filter((element) => {
    if (
      element.tabIndex < 0 ||
      element.matches(':disabled, [hidden]') ||
      element.closest('[hidden], [inert]')
    )
      return false;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (node === root) break;
    }
    return true;
  });
}

export function trapTab(event: KeyboardEvent, root: HTMLElement) {
  if (event.key !== 'Tab') return;
  const items = focusables(root);
  const first = items[0] ?? root;
  const last = items.at(-1) ?? root;
  if (
    !items.length ||
    (event.shiftKey && (document.activeElement === first || document.activeElement === root))
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Coordinates are measured viewport geometry, never design constants. */
export function placeLayer(layer: HTMLElement, anchor: DOMRect, side = false) {
  const bounds = { width: layer.offsetWidth, height: layer.offsetHeight };
  let left = side ? anchor.right : anchor.left;
  let top = side ? anchor.top : anchor.bottom;
  if (left + bounds.width > innerWidth)
    left = side ? anchor.left - bounds.width : anchor.right - bounds.width;
  if (top + bounds.height > innerHeight) top = anchor.top - bounds.height;
  layer.dataset.placement = side
    ? left < anchor.left
      ? 'left'
      : 'right'
    : top < anchor.top
      ? 'top'
      : 'bottom';
  const finalLeft = clamp(left, 0, Math.max(0, innerWidth - bounds.width));
  const finalTop = clamp(top, 0, Math.max(0, innerHeight - bounds.height));
  layer.style.transformOrigin = side
    ? `${left < anchor.left ? bounds.width : 0}px ${clamp(anchor.top + anchor.height / 2 - finalTop, 0, bounds.height)}px`
    : `${clamp(anchor.left + anchor.width / 2 - finalLeft, 0, bounds.width)}px ${top < anchor.top ? bounds.height : 0}px`;
  layer.style.left = `${clamp(left, 0, Math.max(0, innerWidth - bounds.width))}px`;
  layer.style.top = `${clamp(top, 0, Math.max(0, innerHeight - bounds.height))}px`;
}
