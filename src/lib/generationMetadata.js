export function detectGenerationMode(raw = {}) {
  const requestType = String(raw?.request_type || raw?.requestType || '').trim();
  const normalizedRequest = requestType.toLocaleLowerCase('en-US');

  if (requestType === 'NativeInfillingRequest' || /inpaint|infill/.test(normalizedRequest))
    return 'inpainting';
  if (/img2img|image.?to.?image/.test(normalizedRequest) || Boolean(raw?.img2img)) {
    return 'image_to_image';
  }
  if (/^nativerequest$|text.?to.?image/.test(normalizedRequest)) return 'text_to_image';
  return 'unknown';
}
