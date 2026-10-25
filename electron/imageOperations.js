import fs from 'node:fs/promises';
import sharp from 'sharp';
import { buildInpaint } from './inpaint.js';
import { buildProjectRequest } from './parameterRequest.js';
import { estimateGeneration } from './generation.js';
import { MODEL_CAPS } from '../src/shared/params.ts';

const MAX_AREA = 3145728;
export const ENHANCE_MAGNITUDES = [
  { strength: 0.2, noise: 0 },
  { strength: 0.4, noise: 0 },
  { strength: 0.5, noise: 0 },
  { strength: 0.6, noise: 0 },
  { strength: 0.7, noise: 0.1 },
];
export function maxEnhanceResultSize(width, height) {
  const ratio = Math.min(2, Math.sqrt(MAX_AREA / (width * height)));
  return { width: Math.floor(width * ratio), height: Math.floor(height * ratio) };
}
export function maxEnhanceTargetSize(width, height) {
  const w = Math.floor(width / 16) * 32,
    h = Math.floor(height / 16) * 32;
  const ratio = Math.min(1, Math.sqrt(MAX_AREA / (w * h)));
  let result = {
    width: 32 * Math.round((w * ratio) / 32),
    height: 32 * Math.round((h * ratio) / 32),
  };
  if (result.width * result.height > MAX_AREA)
    result = {
      width: 32 * Math.floor((w * ratio) / 32),
      height: 32 * Math.floor((h * ratio) / 32),
    };
  if (result.width < 32 || result.height < 32) throw new Error('尺寸无效');
  return result;
}
export function enhanceSize(width, height, scale) {
  const snap = (n) => Math.max(64, Math.round(Math.floor(n * scale) / 64) * 64);
  return { width: snap(width), height: snap(height) };
}
export function enhanceScales(width, height, model) {
  if (!MODEL_CAPS[model]?.img2img) return [];
  const standard = (width === 832 && height === 1216) || (width === 1216 && height === 832);
  const scales = (standard ? [1, 1.5] : [1, 1.5, 2]).filter((scale) => {
    const size = enhanceSize(width, height, scale);
    return size.width * size.height <= MAX_AREA;
  });
  if (model.startsWith('nai-diffusion-5-') && width * height < 2516582.4) scales.push('max');
  return scales;
}
export function upscalePrice(width, height) {
  const area = width * height;
  const tier = [1048576, 1747627, 2446678, MAX_AREA].findIndex(
    (limit) => area > 0 && area <= limit,
  );
  if (tier < 0) throw new Error('图片太大，不能放大');
  return tier + 1;
}
export function applyEnhancePromptAdd(prompt) {
  // Official client's applyEnhancePromptAdd / TEXT_REGEX (2026-10-25).
  if (prompt.includes('upscaled, blurry')) return prompt;
  const addition = ', -2::upscaled, blurry::,';
  const index = prompt.search(/(?:^|\s|[,.:[\]{}、。])text:(?!:)/i);
  return index < 0 ? prompt + addition : prompt.slice(0, index) + addition + prompt.slice(index);
}
export function estimateImageOperation(request, subscription, pending = 0) {
  if (request.action === 'upscale') {
    const price = upscalePrice(request.parameters.width, request.parameters.height);
    return { anlas: price, perImage: price, free: false, count: 1 };
  }
  const priced = structuredClone(request);
  if (priced.parameters.upscaled_enhance)
    Object.assign(
      priced.parameters,
      maxEnhanceTargetSize(priced.parameters.width, priced.parameters.height),
    );
  return estimateGeneration(priced, subscription, 1, pending);
}
export async function buildImageOperation(project, sourcePath, operation, library, options = {}) {
  if (operation.kind === 'inpaint')
    return buildInpaint(project, sourcePath, operation, library, options);
  const bytes = await fs.readFile(sourcePath);
  const { width, height } = await sharp(bytes).metadata();
  if (operation.kind === 'upscale') {
    upscalePrice(width, height);
    return {
      request: {
        action: 'upscale',
        model: 'nai-diffusion-5-curated',
        image: bytes.toString('base64'),
        parameters: { width, height, seed: Number(project.metadata.seed) || 0 },
      },
      pendingEncodes: 0,
      width: width * 2,
      height: height * 2,
    };
  }
  const model = project.params.model;
  const scales = enhanceScales(width, height, model);
  if (!scales.includes(operation.scale)) throw new Error('这个尺寸或模型不能使用该增强档位');
  const values = ENHANCE_MAGNITUDES[operation.magnitude - 1];
  if (!values) throw new Error('增强幅度无效');
  const size =
    operation.scale === 'max' ? { width, height } : enhanceSize(width, height, operation.scale);
  const draft = structuredClone(project);
  Object.assign(draft.metadata, size);
  draft.references = { ...draft.references, base: { path: sourcePath, ...values } };
  const prepared = await buildProjectRequest(draft, library, options);
  if (operation.scale === 'max') prepared.request.parameters.upscaled_enhance = true;
  else {
    const prompt = applyEnhancePromptAdd(prepared.request.input);
    prepared.request.input = prompt;
    prepared.request.parameters.prompt = prompt;
    prepared.request.parameters.v4_prompt.caption.base_caption = prompt;
  }
  return {
    ...prepared,
    ...(operation.scale === 'max' ? maxEnhanceResultSize(width, height) : size),
    scales,
  };
}
