export const MIN_COMPARE_SCALE = 1;
export const MAX_COMPARE_SCALE = 4;

export function clampCompareScale(value) {
  return Math.min(MAX_COMPARE_SCALE, Math.max(MIN_COMPARE_SCALE, Number(value) || MIN_COMPARE_SCALE));
}

export function zoomCompareViewport(viewport, delta) {
  const scale = clampCompareScale(Number(viewport?.scale || 1) + Number(delta || 0));
  if (scale === 1) return { scale: 1, x: 0, y: 0 };
  return { scale, x: Number(viewport?.x || 0), y: Number(viewport?.y || 0) };
}

export function panCompareViewport(origin, pointer) {
  return {
    scale: clampCompareScale(origin?.scale),
    x: Number(origin?.x || 0) + Number(pointer?.x || 0) - Number(origin?.pointerX || 0),
    y: Number(origin?.y || 0) + Number(pointer?.y || 0) - Number(origin?.pointerY || 0),
  };
}
