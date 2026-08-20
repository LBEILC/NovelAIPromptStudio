export const GALLERY_CARD_SIZE_KEY = 'novelai-prompt-studio.gallery-card-size.v1';
export const GALLERY_CARD_SIZE_MIN = 96;
export const GALLERY_CARD_SIZE_MAX = 260;
export const GALLERY_CARD_SIZE_DEFAULT = 190;
export const GALLERY_CARD_SIZE_STEP = 8;
export const GALLERY_CARD_SIZE_WHEEL_THRESHOLD = 24;

export function normalizeGalleryCardSize(value) {
  if (value == null || value === '') return undefined;
  const numericValue = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(numericValue)) return undefined;
  return Math.round(Math.min(GALLERY_CARD_SIZE_MAX, Math.max(GALLERY_CARD_SIZE_MIN, numericValue)));
}

export function galleryDensityForSize(value) {
  const size = normalizeGalleryCardSize(value) ?? GALLERY_CARD_SIZE_DEFAULT;
  if (size <= 128) return 'overview';
  if (size <= 168) return 'compact';
  return 'comfortable';
}

export function isGalleryWheelZoomGesture(event) {
  return Boolean(event && (event.ctrlKey || event.metaKey) && Number(event.deltaY));
}

export function galleryCardSizeFromWheel(value, deltaY) {
  const size = normalizeGalleryCardSize(value) ?? GALLERY_CARD_SIZE_DEFAULT;
  const numericDelta = Number(deltaY);
  if (!Number.isFinite(numericDelta) || numericDelta === 0) return size;
  return normalizeGalleryCardSize(size + (numericDelta < 0 ? GALLERY_CARD_SIZE_STEP : -GALLERY_CARD_SIZE_STEP));
}

export function readGalleryCardSize(storage) {
  try {
    return normalizeGalleryCardSize(storage?.getItem(GALLERY_CARD_SIZE_KEY)) ?? GALLERY_CARD_SIZE_DEFAULT;
  } catch {
    return GALLERY_CARD_SIZE_DEFAULT;
  }
}

export function writeGalleryCardSize(storage, value) {
  const normalizedValue = normalizeGalleryCardSize(value);
  if (normalizedValue === undefined) return undefined;
  try {
    storage?.setItem(GALLERY_CARD_SIZE_KEY, String(normalizedValue));
  } catch {
    // Keep the in-memory size usable when persistence is unavailable.
  }
  return normalizedValue;
}
