import { inpaintSize, type Rect } from './inpaint.ts';

export type Edge = 'left' | 'right' | 'top' | 'bottom';
export interface OutpaintEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export const EDGE_ORDER: readonly Edge[] = ['left', 'right', 'top', 'bottom'];
export const EMPTY_EDGES: OutpaintEdges = { left: 0, right: 0, top: 0, bottom: 0 };
type Size = { width: number; height: number };
export function outpaintSize(width: number, height: number, fullSize = false) {
  const size = inpaintSize(width, height, fullSize);
  const scale = 2048 / Math.max(width, height);
  return fullSize || Math.max(size.width, size.height) <= 2048
    ? size
    : {
        width: Math.max(64, Math.floor((width * scale) / 64) * 64),
        height: Math.max(64, Math.floor((height * scale) / 64) * 64),
      };
}
export function outpaintCanvas(source: Size, edges: OutpaintEdges): Size {
  if (
    !edges ||
    !EDGE_ORDER.every(
      (edge) => Number.isSafeInteger(edges[edge]) && edges[edge] >= 0 && edges[edge] % 64 === 0,
    ) ||
    !EDGE_ORDER.some((edge) => edges[edge] > 0)
  )
    throw Object.assign(new Error('扩图边距必须是非负的 64 倍数，且至少扩一条边'), {
      code: 'invalid_input',
    });
  const width = source.width + edges.left + edges.right;
  const height = source.height + edges.top + edges.bottom;
  if (width > Math.min(4096, source.width * 2) || height > Math.min(4096, source.height * 2))
    throw Object.assign(new Error('扩图宽高不能超过原图两倍或 4096'), { code: 'invalid_input' });
  return { width, height };
}
export function outpaintBlocks(source: Size, edges: OutpaintEdges) {
  outpaintCanvas(source, edges);
  let width = source.width,
    height = source.height;
  const applied = { ...EMPTY_EDGES };
  return EDGE_ORDER.filter((edge) => edges[edge] > 0).map((edge) => {
    const horizontal = edge === 'left' || edge === 'right';
    const depth = Math.min(horizontal ? source.width : source.height, Math.max(128, edges[edge]));
    if (horizontal) width += edges[edge];
    else height += edges[edge];
    applied[edge] = edges[edge];
    const rect: Rect = horizontal
      ? {
          x: edge === 'left' ? 0 : width - edges[edge] - depth,
          y: 0,
          width: edges[edge] + depth,
          height,
        }
      : {
          x: 0,
          y: edge === 'top' ? 0 : height - edges[edge] - depth,
          width,
          height: edges[edge] + depth,
        };
    return {
      edge,
      rect,
      ...outpaintSize(rect.width, rect.height),
      canvas: { width, height },
      applied: { ...applied },
    };
  });
}
export function outpaintCenter(
  center: { x: number; y: number },
  source: Size,
  edges: OutpaintEdges,
  rect: Rect,
) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    x: clamp((center.x * source.width + edges.left - rect.x) / rect.width),
    y: clamp((center.y * source.height + edges.top - rect.y) / rect.height),
  };
}
// Positive inside the retained image; negative in the newly added area.
export function outpaintDistance(x: number, y: number, source: Size, edges: OutpaintEdges) {
  return Math.min(
    edges.left ? x - edges.left : Infinity,
    edges.right ? edges.left + source.width - 1 - x : Infinity,
    edges.top ? y - edges.top : Infinity,
    edges.bottom ? edges.top + source.height - 1 - y : Infinity,
  );
}
export function recommendOutpaint(edges: OutpaintEdges, opus: boolean): 'whole' | 'edges' {
  return EDGE_ORDER.filter((edge) => edges[edge] > 0).length === 1 || opus ? 'edges' : 'whole';
}
