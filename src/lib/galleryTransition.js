export const GALLERY_CARD_STAGGER_LIMIT = 12;
export const GALLERY_CARD_EXIT_STAGGER_SECONDS = 0.006;
export const GALLERY_CARD_EXIT_DURATION_SECONDS = 0.08;
export const GALLERY_COMPUTATION_GATE_MS = Math.round((
  GALLERY_CARD_STAGGER_LIMIT * GALLERY_CARD_EXIT_STAGGER_SECONDS
  + GALLERY_CARD_EXIT_DURATION_SECONDS
) * 1000) + 24;

export function galleryCardTransitionDelay(index, phase = 'visible') {
  const boundedIndex = Math.min(Math.max(0, Number(index) || 0), GALLERY_CARD_STAGGER_LIMIT);
  return boundedIndex * (phase === 'exit' ? GALLERY_CARD_EXIT_STAGGER_SECONDS : 0.008);
}

export function galleryComputationGateDelay(reduceMotion = false) {
  return reduceMotion ? 0 : GALLERY_COMPUTATION_GATE_MS;
}

export function scheduleGalleryComputation(callback, reduceMotion = false, scheduler = globalThis) {
  const timer = scheduler.setTimeout(callback, galleryComputationGateDelay(reduceMotion));
  return () => scheduler.clearTimeout(timer);
}
