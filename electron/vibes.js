import crypto from 'node:crypto';

export function fingerprintVibe(value) {
  const payload = Buffer.isBuffer(value) ? value : String(value || '');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedModel(value = '') {
  return String(value).toLowerCase().includes('curated')
    ? 'nai-diffusion-4-5-curated'
    : 'nai-diffusion-4-5-full';
}

export function extractEmbeddedVibes(raw, modelLabel = '') {
  const encodings = Array.isArray(raw?.reference_image_multiple) ? raw.reference_image_multiple : [];
  const strengths = Array.isArray(raw?.reference_strength_multiple) ? raw.reference_strength_multiple : [];
  const information = Array.isArray(raw?.reference_information_extracted_multiple) ? raw.reference_information_extracted_multiple : [];
  return encodings.filter((encoding) => typeof encoding === 'string' && encoding.length > 100).map((encoding, index) => ({
    encoding,
    strength: finiteNumber(strengths[index], 0.6),
    information_extracted: finiteNumber(information[index]),
    model: normalizedModel(modelLabel),
  }));
}
