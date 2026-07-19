import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const VIBE_IDENTIFIER = 'novelai-vibe-transfer';
const MAX_VIBE_BYTES = 256 * 1024 * 1024;

export function fingerprintVibe(value) {
  const payload = Buffer.isBuffer(value) ? value : String(value || '');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function modelKeyFromName(value = '') {
  const model = String(value).toLowerCase();
  if (model.includes('curated')) return 'v4-5curated';
  return 'v4-5full';
}

function modelNameFromKey(value = '') {
  if (String(value).includes('curated')) return 'nai-diffusion-4-5-curated';
  return 'nai-diffusion-4-5-full';
}

function collectVariants(document) {
  const variants = [];
  for (const [model, modelVariants] of Object.entries(document.encodings || {})) {
    for (const [modelHash, item] of Object.entries(modelVariants || {})) {
      if (!item?.encoding || typeof item.encoding !== 'string') continue;
      variants.push({
        model,
        model_hash: modelHash,
        fingerprint: fingerprintVibe(item.encoding),
        information_extracted: finiteNumber(item.params?.information_extracted),
        encoding: item.encoding,
      });
    }
  }
  return variants;
}

function selectedVariant(variants, importInfo = {}) {
  const requestedModel = modelKeyFromName(importInfo.model);
  const requestedInformation = finiteNumber(importInfo.information_extracted);
  return variants.find((variant) => variant.model === requestedModel && requestedInformation !== null && variant.information_extracted === requestedInformation)
    || variants.find((variant) => variant.model === requestedModel)
    || variants[0];
}

export function parseVibeDocument(document, sourceName = 'Imported Vibe') {
  if (!document || document.identifier !== VIBE_IDENTIFIER || Number(document.version) !== 1) {
    throw new Error('不是受支持的 NovelAI V4 Vibe 文件');
  }
  const variants = collectVariants(document);
  if (!variants.length) throw new Error('Vibe 文件中没有可复用的编码');
  const selected = selectedVariant(variants, document.importInfo);
  const selectedInformation = selected.information_extracted ?? finiteNumber(document.importInfo?.information_extracted);
  const values = [...new Set(variants.map((variant) => variant.information_extracted).filter((value) => value !== null))].sort((a, b) => a - b);
  return {
    id: selected.fingerprint,
    name: path.basename(sourceName, path.extname(sourceName)) || document.name || selected.fingerprint.slice(0, 12),
    source_kind: document.type === 'encoding' ? 'encoding' : 'naiv4vibe',
    original_vibe_id: String(document.id || ''),
    model: String(document.importInfo?.model || modelNameFromKey(selected.model)),
    strength: finiteNumber(document.importInfo?.strength, 0.6),
    information_extracted: selectedInformation ?? 0.7,
    information_extracted_known: selectedInformation === null ? 0 : 1,
    encoded_values_json: JSON.stringify(values),
    encoding_variants_json: JSON.stringify(variants.map(({ encoding, ...variant }) => variant)),
    encoding_count: variants.length,
    has_source_image: document.image ? 1 : 0,
    created_at: new Date(finiteNumber(document.createdAt, Date.now())).toISOString(),
  };
}

function decodeDataUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^data:([^;,]+);base64,(.+)$/s);
  return match ? { mime: match[1], buffer: Buffer.from(match[2], 'base64') } : null;
}

function imageExtension(buffer) {
  if (buffer?.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return '.png';
  if (buffer?.subarray(0, 3).toString('hex') === 'ffd8ff') return '.jpg';
  if (buffer?.subarray(0, 4).toString('ascii') === 'RIFF') return '.webp';
  return '.bin';
}

async function writeThumbnail(buffer, targetPath, label) {
  if (buffer?.length) {
    await sharp(buffer).rotate().resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(targetPath);
    return;
  }
  const escaped = String(label || 'VIBE').replace(/[<>&"']/g, '');
  const svg = `<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="480" fill="#111820"/><circle cx="240" cy="220" r="104" fill="none" stroke="#425663" stroke-width="3"/><circle cx="240" cy="220" r="72" fill="none" stroke="#e9a84b" stroke-width="2" stroke-dasharray="8 10"/><text x="240" y="225" fill="#d7e0e5" font-size="34" font-family="sans-serif" text-anchor="middle">VIBE</text><text x="240" y="278" fill="#7f909b" font-size="18" font-family="monospace" text-anchor="middle">${escaped.slice(0, 18)}</text></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(targetPath);
}

function ensureDirectories(assetsDirectory) {
  const vibeDirectory = path.join(assetsDirectory, 'vibes');
  const thumbnailDirectory = path.join(assetsDirectory, 'thumbnails');
  fs.mkdirSync(vibeDirectory, { recursive: true });
  fs.mkdirSync(thumbnailDirectory, { recursive: true });
  return { vibeDirectory, thumbnailDirectory };
}

export async function importVibeFile(sourcePath, assetsDirectory) {
  const stats = fs.statSync(sourcePath);
  if (stats.size > MAX_VIBE_BYTES) throw new Error('Vibe 文件超过 256 MB，已拒绝导入');
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  let document;
  try {
    document = JSON.parse(sourceText);
  } catch {
    throw new Error('Vibe 文件不是有效的 JSON');
  }
  const entry = parseVibeDocument(document, path.basename(sourcePath));
  const { vibeDirectory, thumbnailDirectory } = ensureDirectories(assetsDirectory);
  const vibeFile = path.join(vibeDirectory, `${entry.id}.naiv4vibe`);
  fs.copyFileSync(sourcePath, vibeFile);

  const embeddedImage = document.image ? Buffer.from(document.image, 'base64') : null;
  const referenceImage = embeddedImage?.length ? path.join(vibeDirectory, `${entry.id}${imageExtension(embeddedImage)}`) : '';
  if (referenceImage) fs.writeFileSync(referenceImage, embeddedImage);
  const thumbnailData = decodeDataUrl(document.thumbnail)?.buffer || embeddedImage;
  const thumbnailPath = path.join(thumbnailDirectory, `vibe-${entry.id}.webp`);
  await writeThumbnail(thumbnailData, thumbnailPath, entry.id.slice(0, 12));
  return {
    ...entry,
    vibe_file: vibeFile,
    reference_image: referenceImage,
    thumbnail_path: thumbnailPath,
    source_image_hash: embeddedImage?.length ? fingerprintVibe(embeddedImage) : '',
  };
}

export function extractEmbeddedVibes(raw, modelLabel = '') {
  const encodings = Array.isArray(raw?.reference_image_multiple) ? raw.reference_image_multiple : [];
  const strengths = Array.isArray(raw?.reference_strength_multiple) ? raw.reference_strength_multiple : [];
  const information = Array.isArray(raw?.reference_information_extracted_multiple) ? raw.reference_information_extracted_multiple : [];
  const model = modelNameFromKey(modelKeyFromName(modelLabel));
  return encodings.filter((encoding) => typeof encoding === 'string' && encoding.length > 100).map((encoding, index) => ({
    encoding,
    strength: finiteNumber(strengths[index], 0.6),
    information_extracted: finiteNumber(information[index]),
    model,
  }));
}

export async function importEmbeddedVibe(item, assetsDirectory, sourceName, index = 0) {
  const id = fingerprintVibe(item.encoding);
  const modelKey = modelKeyFromName(item.model);
  const information = finiteNumber(item.information_extracted);
  const document = {
    identifier: VIBE_IDENTIFIER,
    version: 1,
    type: 'encoding',
    id,
    encodings: { [modelKey]: { unknown: { encoding: item.encoding } } },
    name: `${id.slice(0, 6)}-${id.slice(-6)}`,
    createdAt: Date.now(),
    importInfo: {
      model: item.model || modelNameFromKey(modelKey),
      information_extracted: information,
      strength: finiteNumber(item.strength, 0.6),
    },
  };
  const { vibeDirectory, thumbnailDirectory } = ensureDirectories(assetsDirectory);
  const vibeFile = path.join(vibeDirectory, `${id}.naiv4vibe`);
  if (!fs.existsSync(vibeFile)) fs.writeFileSync(vibeFile, JSON.stringify(document, null, 2));
  const thumbnailPath = path.join(thumbnailDirectory, `vibe-${id}.webp`);
  if (!fs.existsSync(thumbnailPath)) await writeThumbnail(null, thumbnailPath, `META ${index + 1}`);
  return {
    id,
    name: `${path.basename(sourceName, path.extname(sourceName))} · Vibe ${index + 1}`,
    source_kind: 'metadata',
    original_vibe_id: id,
    model: document.importInfo.model,
    strength: document.importInfo.strength,
    information_extracted: information ?? 0.7,
    information_extracted_known: information === null ? 0 : 1,
    encoded_values_json: JSON.stringify(information === null ? [] : [information]),
    encoding_variants_json: JSON.stringify([{ model: modelKey, model_hash: 'unknown', fingerprint: id, information_extracted: information }]),
    encoding_count: 1,
    has_source_image: 0,
    source_image_hash: '',
    created_at: new Date().toISOString(),
    vibe_file: vibeFile,
    reference_image: '',
    thumbnail_path: thumbnailPath,
  };
}

export function toProjectVibe(entry, id = crypto.randomUUID()) {
  return {
    id,
    library_id: entry.id,
    name: entry.name,
    source_kind: entry.source_kind,
    reference_image: entry.reference_image || '',
    vibe_file: entry.vibe_file || '',
    thumbnail_path: entry.thumbnail_path || '',
    model: entry.model || '',
    strength: finiteNumber(entry.strength, 0.6),
    information_extracted: finiteNumber(entry.information_extracted, 0.7),
    information_extracted_origin: finiteNumber(entry.information_extracted, 0.7),
    information_extracted_known: entry.information_extracted_known ? 1 : 0,
    encoded_values_json: entry.encoded_values_json || '[]',
    source_image_hash: entry.source_image_hash || '',
    has_source_image: entry.has_source_image ? 1 : 0,
    information_extracted_dirty: 0,
    enabled: true,
  };
}
