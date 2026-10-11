export interface LibraryRow {
  start: number;
  top: number;
  height: number;
  widths: number[];
}

export const fallbackRatio = 832 / 1216;

/** Greedy, stable rows. The final row never stretches above the target height. */
export function layoutLibraryRows(
  ratios: readonly number[],
  containerWidth: number,
  targetHeight: number,
  gap: number,
  minRatio: number,
  maxRatio: number,
): LibraryRow[] {
  if (!(containerWidth > 0) || !(targetHeight > 0)) return [];
  const rows: LibraryRow[] = [];
  const normalized = ratios.map((ratio) =>
    Math.min(
      maxRatio,
      Math.max(minRatio, Number.isFinite(ratio) && ratio > 0 ? ratio : fallbackRatio),
    ),
  );
  let start = 0;
  let top = 0;
  while (start < normalized.length) {
    let end = start;
    let sum = 0;
    do {
      sum += normalized[end++];
    } while (
      end < normalized.length &&
      sum * targetHeight + (end - start - 1) * gap < containerWidth
    );
    const available = Math.max(0, containerWidth - (end - start - 1) * gap);
    const height =
      end === normalized.length ? Math.min(targetHeight, available / sum) : available / sum;
    rows.push({
      start,
      top,
      height,
      widths: normalized.slice(start, end).map((ratio) => ratio * height),
    });
    top += height + gap;
    start = end;
  }
  return rows;
}

export function adjacentRowIndex(
  rows: readonly LibraryRow[],
  index: number,
  direction: -1 | 1,
  gap: number,
) {
  const rowIndex = rows.findIndex(
    (row) => index >= row.start && index < row.start + row.widths.length,
  );
  const current = rows[rowIndex];
  const next = rows[rowIndex + direction];
  if (!current || !next) return index;
  const column = index - current.start;
  const center =
    current.widths.slice(0, column).reduce((sum, width) => sum + width + gap, 0) +
    current.widths[column] / 2;
  let left = 0;
  let nearest = next.start;
  let distance = Infinity;
  next.widths.forEach((width, offset) => {
    const delta = Math.abs(left + width / 2 - center);
    if (delta < distance) {
      distance = delta;
      nearest = next.start + offset;
    }
    left += width + gap;
  });
  return nearest;
}

/** The legacy preference stores portrait width; retain that key and its units. */
export function rowHeightFromLegacyWidth(width: number) {
  return Math.min(360, Math.max(120, Math.round(width / fallbackRatio / 20) * 20));
}
