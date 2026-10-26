import sharp from 'sharp';
import { CommandError } from './commands/registry.js';

export const DIRECTOR_TOOLS = [
  'bg-removal',
  'lineart',
  'sketch',
  'colorize',
  'emotion',
  'declutter',
];
export const DIRECTOR_EMOTIONS =
  'neutral happy sad angry scared surprised tired excited nervous thinking confused shy disgusted smug bored laughing irritated aroused embarrassed worried love determined hurt playful'.split(
    ' ',
  );

export function validateDirector(input) {
  const parameters = ['colorize', 'emotion'].includes(input.tool);
  if (
    !DIRECTOR_TOOLS.includes(input.tool) ||
    (!parameters && ['prompt', 'defry', 'emotion'].some((key) => input[key] !== undefined)) ||
    (input.tool !== 'emotion' && input.emotion !== undefined) ||
    (input.tool === 'emotion' && !DIRECTOR_EMOTIONS.includes(input.emotion)) ||
    (input.prompt !== undefined && typeof input.prompt !== 'string') ||
    (input.defry !== undefined &&
      (!Number.isInteger(input.defry) || input.defry < 0 || input.defry > 5))
  )
    throw new CommandError('invalid_input', '导演工具参数无效');
  return parameters
    ? {
        tool: input.tool,
        prompt: input.prompt ?? '',
        defry: input.defry ?? 0,
        ...(input.tool === 'emotion' ? { emotion: input.emotion } : {}),
      }
    : { tool: input.tool };
}

export function directorSize(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw new CommandError('invalid_input', '图片尺寸无效');
  let scale = Math.min(1, Math.sqrt(3143728 / (width * height)));
  width = Math.floor(width * scale);
  height = Math.floor(height * scale);
  if (width * height < 1011712) {
    scale = Math.sqrt(1048576 / (width * height));
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }
  if (!width || !height) throw new CommandError('invalid_input', '图片比例无效');
  return { width, height };
}

export async function buildDirector(file, input) {
  const options = validateDirector(input);
  const metadata = await sharp(file).metadata();
  const size = directorSize(metadata.width, metadata.height);
  const image = await sharp(file)
    .resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  return {
    ...size,
    request: {
      req_type: options.tool,
      ...size,
      image: image.toString('base64'),
      use_new_shared_trial: true,
      ...(options.prompt !== undefined
        ? {
            prompt:
              options.tool === 'emotion' ? `${options.emotion};;${options.prompt}` : options.prompt,
            defry: options.defry,
          }
        : {}),
    },
  };
}

export function estimateDirector(request, subscription) {
  const area = request.width * request.height;
  const base = Math.max(
    2,
    Math.ceil(2.951823174884865e-6 * area + 5.753298233447344e-7 * area * 28),
  );
  const expensive = ['bg-removal', 'declutter'].includes(request.req_type);
  const free =
    !expensive && subscription?.active === true && subscription.tier >= 3 && area <= 1048576;
  const anlas = expensive ? 3 * base + 5 : free ? 0 : base;
  return {
    anlas,
    perImage: anlas,
    free,
    count: 1,
    outputImages: request.req_type === 'bg-removal' ? 3 : 1,
  };
}
