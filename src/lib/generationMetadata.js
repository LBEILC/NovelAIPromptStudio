export const GENERATION_MODES = ['text_to_image', 'image_to_image', 'inpainting', 'unknown'];

export function detectGenerationMode(raw = {}) {
  const requestType = String(raw?.request_type || raw?.requestType || '').trim();
  const normalizedRequest = requestType.toLocaleLowerCase('en-US');

  if (requestType === 'NativeInfillingRequest' || /inpaint|infill/.test(normalizedRequest)) return 'inpainting';
  if (/img2img|image.?to.?image/.test(normalizedRequest) || Boolean(raw?.img2img)) {
    return 'image_to_image';
  }
  if (/^nativerequest$|text.?to.?image/.test(normalizedRequest)) return 'text_to_image';
  return 'unknown';
}

export function normalizeGenerationMode(metadata = {}) {
  const explicit = String(metadata?.generation_mode || '').trim();
  if (GENERATION_MODES.includes(explicit) && explicit !== 'unknown') return explicit;

  try {
    const extra = typeof metadata?.extra_json === 'string' ? JSON.parse(metadata.extra_json || '{}') : metadata?.extra_json;
    return detectGenerationMode(extra?.parsed || extra || {});
  } catch {
    return explicit === 'unknown' ? explicit : 'unknown';
  }
}

export function hasLimitedReproduction(metadata = {}) {
  return normalizeGenerationMode(metadata) === 'inpainting';
}
