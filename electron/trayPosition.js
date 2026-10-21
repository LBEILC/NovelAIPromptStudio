// Electron cursor points, window sizes and display rectangles are all in DIP.
// The renderer includes a 12 DIP transparent shadow margin in its reported size.
export function trayMenuPosition(point, size, bounds, workArea) {
  const margin = 12;
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  let x = point.x - margin;
  let y = point.y - margin;
  if (x + size.width > right) x = point.x - size.width + margin;
  if (point.y >= bottom && bottom < bounds.y + bounds.height) y = point.y - size.height + margin;
  else if (point.y < workArea.y && workArea.y > bounds.y) y = point.y - margin;
  else if (point.x < workArea.x && workArea.x > bounds.x) x = point.x - margin;
  else if (point.x >= right && right < bounds.x + bounds.width) x = point.x - size.width + margin;
  else if (y + size.height > bottom) y = point.y - size.height + margin;
  return {
    x: Math.round(Math.max(workArea.x, Math.min(x, right - size.width))),
    y: Math.round(Math.max(workArea.y, Math.min(y, bottom - size.height))),
  };
}
