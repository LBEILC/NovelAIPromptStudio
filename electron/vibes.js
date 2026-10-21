import crypto from 'node:crypto';
import { generationModel } from './generation.js';
import fs from 'node:fs';
import path from 'node:path';

const VIBE_IDENTIFIER = 'novelai-vibe-transfer';

export function fingerprintVibe(value) {
  const payload = Buffer.isBuffer(value) ? value : String(value || '');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function fingerprintVibes(vibes = []) {
  const payload = (Array.isArray(vibes) ? vibes : []).map((vibe) => ({
    encoding: fingerprintVibe(vibe?.encoding),
    strength: finiteNumber(vibe?.strength, 0.6),
    informationExtracted: finiteNumber(vibe?.information_extracted),
    model: String(vibe?.model || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('en-US'),
  }));
  return payload.length ? fingerprintVibe(JSON.stringify(payload)) : '';
}

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedModel(value = '') {
  return (
    generationModel(value) ||
    (String(value).toLowerCase() === 'curated'
      ? 'nai-diffusion-4-5-curated'
      : 'nai-diffusion-4-5-full')
  );
}
export function modelKey(value = '') {
  const model = normalizedModel(value);
  return {
    'nai-diffusion-4-full': 'v4full',
    'nai-diffusion-4-curated-preview': 'v4curated',
    'nai-diffusion-4-5-full': 'v4-5full',
    'nai-diffusion-4-5-curated': 'v4-5curated',
  }[model];
}

export function createEmbeddedVibeDocument(vibe = {}) {
  const encoding = String(vibe.encoding || '');
  if (encoding.length <= 100) throw new Error('图片中的 Vibe 编码无效');
  const id = fingerprintVibe(encoding);
  const informationExtracted = finiteNumber(vibe.information_extracted);
  const model = normalizedModel(vibe.model);
  const variant = { encoding };
  if (informationExtracted !== null)
    variant.params = { information_extracted: informationExtracted };
  return {
    identifier: VIBE_IDENTIFIER,
    version: 1,
    type: 'encoding',
    id,
    name: String(vibe.name || `Vibe ${id.slice(0, 8)}`),
    createdAt: Date.now(),
    encodings: { [modelKey(model)]: { unknown: variant } },
    importInfo: {
      model,
      information_extracted: informationExtracted,
      strength: finiteNumber(vibe.strength, 0.6),
    },
  };
}

export function exportEmbeddedVibeFile(vibe, assetsDirectory) {
  const document = createEmbeddedVibeDocument(vibe);
  const directory = path.join(assetsDirectory, 'vibes');
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, `${document.id}.naiv4vibe`);
  fs.writeFileSync(filePath, JSON.stringify(document, null, 2), 'utf8');
  return filePath;
}

export function extractEmbeddedVibes(raw, modelLabel = '') {
  const encodings = Array.isArray(raw?.reference_image_multiple)
    ? raw.reference_image_multiple
    : [];
  const strengths = Array.isArray(raw?.reference_strength_multiple)
    ? raw.reference_strength_multiple
    : [];
  const information = Array.isArray(raw?.reference_information_extracted_multiple)
    ? raw.reference_information_extracted_multiple
    : [];
  return encodings
    .map((encoding, index) => ({
      encoding,
      strength: finiteNumber(strengths[index], 0.6),
      information_extracted: finiteNumber(information[index]),
      model: normalizedModel(modelLabel),
    }))
    .filter((vibe) => typeof vibe.encoding === 'string' && vibe.encoding.length > 100);
}
