import crypto from 'node:crypto';
import yauzl from 'yauzl';
import { expandV5AutomaticPrompt } from '../src/lib/novelaiAutoPrompt.js';

// Explicit allowlists: image metadata also contains internal, non-request fields.
const COMMON = [
  'width',
  'height',
  'steps',
  'scale',
  'sampler',
  'cfg_rescale',
  'noise_schedule',
  'dynamic_thresholding',
  'deliberate_euler_ancestral_bug',
  'prefer_brownian',
  'legacy_v3_extend',
  'skip_cfg_above_sigma',
  'sm',
  'sm_dyn',
  'v4_prompt',
  'v4_negative_prompt',
];
const V5 = [
  'straight_alpha',
  'tag_hint_qt',
  'tag_hint_uc_preset',
  'tag_hint_transparent_background',
];
const VIBE = [
  'reference_image_multiple',
  'reference_strength_multiple',
  'reference_information_extracted_multiple',
];
export const GENERATION_MODELS = Object.freeze(
  Object.fromEntries(
    [
      'nai-diffusion-5-full',
      'nai-diffusion-5-curated',
      'nai-diffusion-4-5-full',
      'nai-diffusion-4-5-curated',
      'nai-diffusion-4-full',
      'nai-diffusion-4-curated-preview',
    ].map((model) => [
      model,
      [...COMMON, ...(model.includes('-5-') && !model.includes('-4-5-') ? V5 : VIBE)],
    ]),
  ),
);

export function generationModel(value) {
  const text = String(value || '')
    .toLowerCase()
    .replace(/-inpainting$/, '');
  if (GENERATION_MODELS[text]) return text;
  if (/medium|93f4bd30|70ab5786/.test(text)) return null;
  if (/657484a5|0adf9ab7/.test(text)) return 'nai-diffusion-5-full';
  if (/db276663/.test(text)) return 'nai-diffusion-5-curated';
  if (/37442fca|4f49ec75|ca4b7203|79f47848|f6302a9d/.test(text)) return 'nai-diffusion-4-full';
  if (/c02d4f98|5ab81c7c|b5a2a797/.test(text)) return 'nai-diffusion-4-5-curated';
  if (/7abffa2a|c1ccba86|770a9e12/.test(text)) return 'nai-diffusion-4-curated-preview';
  if (/4bde2a90|1229b44f|b9f340fd|f3d95188/.test(text)) return 'nai-diffusion-4-5-full';
  const version = /(?:diffusion\s*|\bv)(4\.5|4|5)\b/.exec(text)?.[1];
  if (!version) return null;
  if (!/curated|精选|full|完整/.test(text)) return null;
  const curated = /curated|精选/.test(text);
  const model = `nai-diffusion-${version.replace('.', '-')}-${curated ? (version === '4' ? 'curated-preview' : 'curated') : 'full'}`;
  return GENERATION_MODELS[model] ? model : null;
}

export function generationUnavailable(raw, model) {
  if (!GENERATION_MODELS[model]) return '这个模型暂不支持生成';
  if (Object.keys(raw).some((key) => key.startsWith('director_reference_') && raw[key]?.length))
    return '带参考图的图暂不支持生成';
  const count = Math.max(
    raw.reference_strength_multiple?.length || 0,
    raw.reference_information_extracted_multiple?.length || 0,
  );
  if (
    count &&
    (raw.reference_image_multiple?.length !== count || raw.reference_image_multiple.some((x) => !x))
  )
    return '这张图的 Vibe 编码没有保存在图片里';
  if (
    raw.reference_image_multiple?.length &&
    !GENERATION_MODELS[model].includes('reference_image_multiple')
  )
    return '这个模型暂不支持生成';
  return '';
}

export function buildGenerationRequest(raw, model, edits = {}) {
  const unavailable = generationUnavailable(raw, model);
  if (unavailable) throw new Error(unavailable);
  const parameters = Object.fromEntries(
    GENERATION_MODELS[model]
      .filter((key) => raw[key] !== undefined)
      .map((key) => [key, structuredClone(raw[key])]),
  );
  let prompt = edits.prompt ?? raw.prompt ?? raw.v4_prompt?.caption?.base_caption ?? '';
  let negative =
    edits.negative ??
    raw.uc ??
    raw.negative_prompt ??
    raw.v4_negative_prompt?.caption?.base_caption ??
    '';
  ({ prompt, negative } = expandV5AutomaticPrompt(prompt, negative, model, raw));
  Object.assign(parameters, {
    params_version: 4,
    prompt,
    negative_prompt: negative,
    seed: edits.seed ?? crypto.randomInt(0, 0x100000000),
    n_samples: 1,
  });
  for (const [key, value] of [
    ['v4_prompt', prompt],
    ['v4_negative_prompt', negative],
  ]) {
    parameters[key] ??= { caption: { base_caption: value, char_captions: [] } };
    // Keep unmodified captions and coordinate flags exactly as stored in the PNG.
    if (edits[key] !== undefined) parameters[key] = structuredClone(edits[key]);
    if (
      model.startsWith('nai-diffusion-5-') ||
      edits[key === 'v4_prompt' ? 'prompt' : 'negative'] !== undefined
    )
      parameters[key].caption.base_caption = value;
  }
  for (const key of ['width', 'height']) if (edits[key] !== undefined) parameters[key] = edits[key];
  return { action: 'generate', input: prompt, model, parameters };
}

export function estimateGeneration(request, subscription, count = 1) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('张数必须是正整数');
  const p = request.parameters;
  const v5 = request.model.startsWith('nai-diffusion-5-');
  const free =
    subscription?.active === true &&
    subscription.tier >= 3 &&
    p.width * p.height <= 1048576 &&
    p.steps <= 28 &&
    !(v5 && subscription.usage?.isNegative);
  // Formula from the official image client's checkStableDiffusionPrice (2026-10-20).
  const base = Math.ceil(
    2.951823174884865e-6 * p.width * p.height + 5.753298233447344e-7 * p.width * p.height * p.steps,
  );
  const perImage =
    (free
      ? 0
      : Math.max(2, Math.ceil(base * (p.sm_dyn && p.sm ? 1.4 : p.sm ? 1.2 : 1) * (v5 ? 1.5 : 1)))) +
    2 * Math.max(0, (p.reference_image_multiple?.length || 0) - 4);
  return { anlas: perImage * count, perImage, free: perImage === 0, count };
}

export function generationError(status) {
  return status === 401
    ? '持久令牌无效，请在设置里更换'
    : status === 402
      ? 'Anlas 不足'
      : status === 429
        ? '请求太频繁，请稍后再试'
        : status >= 500
          ? 'NovelAI 服务繁忙'
          : '无法连接到 NovelAI';
}

export function extractGeneratedPng(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(new Error('生成结果不是有效的 ZIP'));
      let found = false;
      zip.on('error', () => reject(new Error('无法读取生成结果')));
      zip.on('end', () => {
        if (!found) reject(new Error('生成结果没有 PNG'));
      });
      zip.on('entry', (entry) => {
        if (!/\.png$/i.test(entry.fileName)) return zip.readEntry();
        if (found || entry.uncompressedSize > 100 * 1024 * 1024) {
          zip.close();
          return reject(new Error('生成结果大小异常'));
        }
        found = true;
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(new Error('无法读取生成结果'));
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('error', () => reject(new Error('无法读取生成结果')));
          stream.on('end', () => {
            zip.close();
            const png = Buffer.concat(chunks);
            if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
              reject(new Error('生成结果不是 PNG'));
            else resolve(png);
          });
        });
      });
      zip.readEntry();
    });
  });
}

export function createNovelAIClient({
  token,
  baseUrl = 'https://image.novelai.net',
  fetchImpl = fetch,
}) {
  const url = new URL(baseUrl);
  if (
    url.origin !== 'https://image.novelai.net' &&
    !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
  )
    throw new Error('不支持的生成服务地址');
  async function send(endpoint, body) {
    try {
      const response = await fetchImpl(new URL(endpoint, url), {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${await token()}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok)
        throw Object.assign(new Error(generationError(response.status)), {
          status: response.status,
        });
      return response;
    } catch (error) {
      // Never propagate HTTP bodies, URLs, headers or tokens into diagnostics.
      throw Object.assign(new Error(generationError(error.status)), { status: error.status || 0 });
    }
  }
  return {
    subscription: async () => (await send('/user/subscription')).json(),
    generate: async (request, onProgress = () => {}) => {
      const response = await send('/ai/generate-image-stream', {
        ...request,
        parameters: { ...request.parameters, stream: 'sse' },
      });
      if (!response.headers.get('content-type')?.includes('text/event-stream'))
        return extractGeneratedPng(Buffer.from(await response.arrayBuffer()));
      let pending = '',
        final;
      const decoder = new TextDecoder();
      const consume = (frame) => {
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data || data === '[DONE]') return;
        let value;
        try {
          value = JSON.parse(data);
        } catch {
          throw new Error('无法读取生成结果');
        }
        const type =
          value.event_type ||
          frame
            .split('\n')
            .find((line) => line.startsWith('event:'))
            ?.slice(6)
            .trim();
        if (type === 'error') throw new Error(generationError(Number(value.status) || 500));
        if (type === 'intermediate' && Number.isFinite(value.step_ix))
          onProgress(Math.max(0, Math.min(1, value.step_ix / request.parameters.steps)));
        if (type === 'final' && value.image) final = Buffer.from(value.image, 'base64');
      };
      try {
        for await (const chunk of response.body) {
          pending += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
          let end;
          while ((end = pending.indexOf('\n\n')) >= 0) {
            consume(pending.slice(0, end));
            pending = pending.slice(end + 2);
          }
        }
        if (pending.trim()) consume(pending);
      } catch (error) {
        throw new Error(error.message === 'NovelAI 服务繁忙' ? error.message : '无法读取生成结果');
      }
      if (!final) throw new Error('生成结果没有 PNG');
      if (final.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        return extractGeneratedPng(final);
      onProgress(1);
      return final;
    },
  };
}
