import crypto from 'node:crypto';
import { normalizeRelayUrl } from './relay.js';
import { MODEL_ORDER } from '../src/shared/params.ts';
import yauzl from 'yauzl';
import { validParameterNumber, MEDIUM_FIXED } from '../src/shared/params.ts';
import { CommandError } from './commands/registry.js';
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
  'tag_hint_qt',
  'tag_hint_uc_preset',
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
      'nai-diffusion-5-full-medium',
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
  if (/medium|93f4bd30|70ab5786/.test(text)) return 'nai-diffusion-5-full-medium';
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

export function normalizeVibeParameters(raw) {
  const images = raw.reference_image_multiple || [];
  if (
    !Array.isArray(images) ||
    Math.max(
      raw.reference_strength_multiple?.length || 0,
      raw.reference_information_extracted_multiple?.length || 0,
    ) > images.length ||
    Array.from(images).some((x) => typeof x !== 'string' || !x)
  )
    throw new Error('这张图的 Vibe 编码没有保存在图片里');
  if (!images.length) return { ...raw };
  return {
    ...raw,
    reference_strength_multiple: images.map((_, i) => raw.reference_strength_multiple?.[i] ?? 0.6),
    reference_information_extracted_multiple: images.map(
      (_, i) => raw.reference_information_extracted_multiple?.[i] ?? 1,
    ),
  };
}

export function generationUnavailable(raw, model) {
  if (!GENERATION_MODELS[model]) return '这个模型暂不支持生成';
  if (Object.keys(raw).some((key) => key.startsWith('director_reference_') && raw[key]?.length))
    return '带参考图的图暂不支持生成';
  try {
    normalizeVibeParameters(raw);
  } catch (error) {
    return error.message;
  }
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
  Object.assign(parameters, normalizeVibeParameters(parameters));
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
  // Match the official client's model capabilities, rather than forwarding PNG-only options.
  delete parameters.sm;
  delete parameters.sm_dyn;
  parameters.dynamic_thresholding = false;
  if (parameters.sampler === 'ddim') parameters.sampler = 'k_euler_ancestral';
  if (model.startsWith('nai-diffusion-5-')) {
    parameters.noise_schedule = 'karras';
    delete parameters.skip_cfg_above_sigma;
  }
  if (parameters.sampler === 'k_euler_ancestral' && parameters.noise_schedule !== 'native') {
    parameters.deliberate_euler_ancestral_bug = false;
    parameters.prefer_brownian = true;
  }
  parameters.v4_prompt.use_coords ??= false;
  parameters.v4_prompt.use_order ??= true;
  parameters.v4_negative_prompt.legacy_uc ??=
    model.startsWith('nai-diffusion-4-') && !model.startsWith('nai-diffusion-4-5-');
  for (const key of ['width', 'height']) if (edits[key] !== undefined) parameters[key] = edits[key];
  const action = edits.action || 'generate';
  if (!['generate', 'img2img'].includes(action)) throw new Error('生成操作无效');
  if (action === 'img2img') {
    for (const key of ['image', 'strength', 'noise', 'upscaled_enhance'])
      if (edits[key] !== undefined) parameters[key] = edits[key];
    parameters.seed ||= 1;
    parameters.extra_noise_seed = parameters.seed - 1;
    parameters.color_correct = false;
  }
  return { action, input: prompt, model, parameters };
}

export function estimateGeneration(request, subscription, count = 1, pendingEncodes = 0) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('张数必须是正整数');
  const p = request.parameters;
  const v5 = request.model.startsWith('nai-diffusion-5-');
  const free =
    // TODO: verify Opus precise-reference base pricing with an authorized paid experiment.
    !p.director_reference_images?.length &&
    subscription?.active === true &&
    subscription.tier >= 3 &&
    p.width * p.height <= 1048576 &&
    p.steps <= 28 &&
    !(v5 && subscription.usage?.isNegative);
  // Formula from the official image client's checkStableDiffusionPrice (2026-10-20).
  const base = Math.ceil(
    2.951823174884865e-6 * p.width * p.height +
      5.753298233447344e-7 *
        p.width *
        p.height *
        p.steps *
        (request.model.endsWith('-medium') ? 1 / 1.06521739 : 1),
  );
  const basePrice = free
    ? 0
    : Math.max(
        2,
        Math.ceil(
          base *
            (p.sm_dyn && p.sm ? 1.4 : p.sm ? 1.2 : 1) *
            (v5 ? 1.5 : 1) *
            (request.action === 'img2img' ? p.strength : 1),
        ),
      );
  // TODO: verify multi-image Vibe surcharge; conservatively charge per image.
  const vibeExtra = 2 * Math.max(0, (p.reference_image_multiple?.length || 0) - 4);
  const precise = 5 * (p.director_reference_images?.length || 0);
  const perImage = basePrice + vibeExtra + precise;
  const parts = {
    base: basePrice * count,
    encode: pendingEncodes * 2,
    vibeExtra: vibeExtra * count,
    precise: precise * count,
  };
  const anlas = perImage * count + parts.encode;
  return { anlas, perImage, free: anlas === 0, count, parts };
}

export function generationError(status, reason = '') {
  if (status === 401) return '持久令牌无效，请在设置里更换';
  if (status === 402) return 'Anlas 不足';
  if (status === 429) return '请求太频繁，请稍后再试';
  if (status >= 500) {
    const message =
      status === 502 || status === 504
        ? 'NovelAI 暂时无法访问'
        : status === 503
          ? 'NovelAI 服务繁忙'
          : 'NovelAI 服务器出错';
    return `${message}（HTTP ${status}）${reason ? `：${reason}` : status === 503 ? '，请稍后再试' : ''}`;
  }
  if (status >= 400) return `NovelAI 拒绝了这次请求${reason ? `：${reason}` : ''}`;
  return '无法连接到 NovelAI，请检查网络';
}

function httpError(status, reason) {
  return Object.assign(
    new CommandError(
      status === 401
        ? 'invalid_token'
        : status === 403
          ? 'forbidden'
          : status === 429
            ? 'usage_limit'
            : 'request_failed',
      generationError(status, reason),
      {
        status,
        machineCode:
          status >= 500
            ? 'server'
            : status === 401 || status === 403
              ? 'auth'
              : status === 429
                ? 'rate_limit'
                : 'http',
      },
    ),
    { status, safe: true },
  );
}

export function validateGenerationRequest(request) {
  const p = request?.parameters;
  if (
    request?.action === 'img2img' &&
    (!/nai-diffusion-(5|4-5)-/.test(request.model) ||
      !p?.image ||
      !Number.isFinite(p.strength) ||
      p.strength < 0.01 ||
      p.strength > 0.99 ||
      !Number.isFinite(p.noise) ||
      p.noise < 0 ||
      p.noise > 0.99)
  )
    throw new CommandError('invalid_input', '底图参数无效');
  const medium = request?.model === 'nai-diffusion-5-full-medium';
  if (
    !Object.hasOwn(GENERATION_MODELS, request?.model) ||
    !p ||
    !validParameterNumber('steps', p.steps) ||
    !validParameterNumber('scale', p.scale) ||
    (p.cfg_rescale !== undefined && !validParameterNumber('rescale', p.cfg_rescale)) ||
    (medium && (p.steps !== MEDIUM_FIXED.steps || p.sampler !== MEDIUM_FIXED.sampler))
  ) {
    throw new CommandError('invalid_input', '生成参数无效', {
      machineCode: 'invalid_generation_parameters',
    });
  }
}

function serverReason(body, secret = '') {
  const value = body?.message ?? body?.error?.message ?? body?.error ?? body?.detail;
  if (typeof value !== 'string') return '';
  return (secret ? value.split(secret).join('[redacted]') : value)
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/https?:\/\/\S+/gi, '[redacted]')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .slice(0, 500);
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
  connection = 'official',
  baseUrl = 'https://image.novelai.net',
  fetchImpl = fetch,
}) {
  const url = new URL(connection === 'relay' ? normalizeRelayUrl(baseUrl) : baseUrl);
  if (
    connection !== 'relay' &&
    url.origin !== 'https://image.novelai.net' &&
    !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
  )
    throw new Error('不支持的生成服务地址');
  const errorFor = (status, reason) => {
    const error = httpError(status, reason);
    if (connection === 'relay') {
      error.message =
        status === 403 && /model.*(?:does not exist|maintenance)|模型不存在/i.test(reason)
          ? '中转站没有这个模型'
          : status === 401 || status === 403
            ? `中转站拒绝了 Key${reason ? `：${reason}` : ''}`
            : error.message.replaceAll('NovelAI', '中转站');
    }
    return error;
  };
  async function send(endpoint, body) {
    let secret;
    try {
      secret = await token();
      const response = await fetchImpl(new URL(endpoint, url), {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${secret}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw errorFor(response.status, serverReason(body, secret));
      }
      return response;
    } catch (error) {
      // Only the bounded, redacted server reason may reach the UI.
      if (error.safe || error instanceof CommandError) throw error;
      const machineCode = /proxy|tunnel|socks/i.test(String(error.message)) ? 'proxy' : 'network';
      throw new CommandError(
        'network',
        machineCode === 'proxy'
          ? `无法通过代理连接到 ${connection === 'relay' ? '中转站' : 'NovelAI'}，请检查设置里的网络`
          : `无法连接到 ${connection === 'relay' ? '中转站' : 'NovelAI'}，请检查网络`,
        { status: error.status || 0, machineCode },
      );
    }
  }
  return {
    models: async () => {
      let response;
      try {
        response = await send('/v1/models');
      } catch (error) {
        if (
          error.status === 404 ||
          (error.status === 403 && error.message === '中转站没有这个模型')
        )
          return null;
        throw error;
      }
      const body = await response.json().catch(() => null);
      if (!Array.isArray(body?.data)) return null;
      const ids = [...new Set(body.data.map((m) => m.id).filter((id) => typeof id === 'string'))];
      return {
        models: ids.filter((id) => MODEL_ORDER.includes(id)),
        other: ids.filter((id) => !MODEL_ORDER.includes(id)),
      };
    },
    encodeVibe: async (body) =>
      Buffer.from(await (await send('/ai/encode-vibe', body)).arrayBuffer()).toString('base64'),
    upscale: async (request) =>
      extractGeneratedPng(
        Buffer.from(
          await (
            await send('/ai/upscale', {
              image: request.image,
              model: 'nai-diffusion-5-curated',
              declared_blur_sigma: 0,
            })
          ).arrayBuffer(),
        ),
      ),
    subscription: async () => (await send('/user/subscription')).json(),
    generate: async (request, onProgress = () => {}) => {
      const normalized = normalizeVibeParameters(request.parameters);
      validateGenerationRequest(request);
      const response = await send('/ai/generate-image-stream', {
        ...request,
        parameters: { ...normalized, stream: 'sse' },
      });
      if (!response.headers.get('content-type')?.includes('text/event-stream'))
        return extractGeneratedPng(Buffer.from(await response.arrayBuffer()));
      const secret = await token();
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
        if (type === 'error')
          throw errorFor(
            Number(value.status || value.status_code) || 500,
            serverReason(value, secret),
          );
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
        if (error.safe) throw error;
        throw new Error('无法读取生成结果');
      }
      if (!final) throw new Error('生成结果没有 PNG');
      if (final.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        return extractGeneratedPng(final);
      onProgress(1);
      return final;
    },
  };
}
