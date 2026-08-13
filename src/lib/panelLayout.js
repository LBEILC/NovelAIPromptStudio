export const GALLERY_PREVIEW_PANEL_WIDTH_KEY = 'novelai-prompt-studio.gallery-preview-panel-width.v1';
export const WORKBENCH_SOURCE_PANEL_WIDTH_KEY = 'novelai-prompt-studio.workbench-source-panel-width.v1';

export function panelWidthForViewport(viewportWidth, ratio, minWidth, maxWidth) {
  const numericViewportWidth = Number(viewportWidth);
  const preferredWidth = Number.isFinite(numericViewportWidth) ? numericViewportWidth * ratio : maxWidth;
  return Math.round(Math.min(maxWidth, Math.max(minWidth, preferredWidth)));
}

export function normalizePanelWidth(width, minWidth, maxWidth) {
  if (width == null || width === '') return undefined;
  const numericWidth = typeof width === 'string' ? Number.parseFloat(width) : Number(width);
  if (!Number.isFinite(numericWidth)) return undefined;
  return Math.round(Math.min(maxWidth, Math.max(minWidth, numericWidth)));
}

export function panelStorage(globalObject = globalThis) {
  try {
    return globalObject?.localStorage;
  } catch {
    return undefined;
  }
}

export function readPanelWidth(storage, key, fallbackWidth, minWidth, maxWidth) {
  try {
    return normalizePanelWidth(storage?.getItem(key), minWidth, maxWidth) ?? fallbackWidth;
  } catch {
    return fallbackWidth;
  }
}

export function writePanelWidth(storage, key, width, minWidth, maxWidth) {
  const normalizedWidth = normalizePanelWidth(width, minWidth, maxWidth);
  if (normalizedWidth === undefined) return undefined;
  try {
    storage?.setItem(key, String(normalizedWidth));
  } catch {
    // Keep the in-memory width usable when persistence is unavailable.
  }
  return normalizedWidth;
}
