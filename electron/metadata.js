import fs from 'node:fs';
import zlib from 'node:zlib';
import { extractV4PromptData } from '../src/lib/promptStructure.js';

function parsePngText(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return {};
  const text = {};
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    try {
      if (type === 'tEXt') {
        const separator = data.indexOf(0);
        if (separator > -1) text[data.subarray(0, separator).toString('utf8')] = data.subarray(separator + 1).toString('utf8');
      } else if (type === 'zTXt') {
        const separator = data.indexOf(0);
        if (separator > -1) text[data.subarray(0, separator).toString('utf8')] = zlib.inflateSync(data.subarray(separator + 2)).toString('utf8');
      } else if (type === 'iTXt') {
        let cursor = data.indexOf(0);
        const key = data.subarray(0, cursor).toString('utf8');
        const compressed = data[cursor + 1] === 1;
        cursor += 3;
        cursor = data.indexOf(0, cursor) + 1;
        cursor = data.indexOf(0, cursor) + 1;
        const payload = data.subarray(cursor);
        text[key] = compressed ? zlib.inflateSync(payload).toString('utf8') : payload.toString('utf8');
      }
    } catch {
      // Preserve all other metadata if one optional text chunk is malformed.
    }
    if (type === 'IEND') break;
  }
  return text;
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function first(source, keys, fallback = '') {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null) return source[key];
  }
  return fallback;
}

export function readNovelAIMetadata(filePath) {
  const text = parsePngText(fs.readFileSync(filePath));
  const candidates = Object.values(text).map(safeJson).filter((value) => value && typeof value === 'object');
  const raw = candidates.reduce((merged, item) => ({ ...merged, ...item }), {});
  const legacyPrompt = first(raw, ['prompt', 'description'], text.Description || '');
  const legacyNegative = first(raw, ['uc', 'negative_prompt', 'negativePrompt'], '');
  const promptStructure = extractV4PromptData(raw, legacyPrompt, legacyNegative);
  return {
    prompt_raw: promptStructure.base_prompt_raw,
    negative_prompt: promptStructure.base_undesired_raw,
    prompt_structure_raw: promptStructure,
    model: String(first(raw, ['model', 'source'], text.Source || text.Software || '')),
    seed: String(first(raw, ['seed'], '')),
    steps: first(raw, ['steps'], ''),
    sampler: String(first(raw, ['sampler'], '')),
    guidance: first(raw, ['scale', 'cfg_scale', 'guidance'], ''),
    extra_json: JSON.stringify({ pngText: text, parsed: raw }),
  };
}
