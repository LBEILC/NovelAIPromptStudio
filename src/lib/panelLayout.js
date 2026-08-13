export function panelWidthForViewport(viewportWidth, ratio, minWidth, maxWidth) {
  const numericViewportWidth = Number(viewportWidth);
  const preferredWidth = Number.isFinite(numericViewportWidth) ? numericViewportWidth * ratio : maxWidth;
  return Math.round(Math.min(maxWidth, Math.max(minWidth, preferredWidth)));
}
