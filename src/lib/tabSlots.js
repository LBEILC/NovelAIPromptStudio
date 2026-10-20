/** Select the nearest insertion slot from the dragged tab's own left edge. */
export function nearestTabSlot(base, widths, gap, want) {
  let left = base,
    best = Infinity,
    index = 0;
  for (let i = 0; i <= widths.length; i++) {
    const distance = Math.abs(left - want);
    if (distance < best) {
      best = distance;
      index = i;
    }
    if (i < widths.length) left += widths[i] + gap;
  }
  return index;
}
