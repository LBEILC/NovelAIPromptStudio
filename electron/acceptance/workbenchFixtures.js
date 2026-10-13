import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const workbenchRaw =
  '1.25::blue hair::, red coat, standing\n\nA quiet traveler is standing beside the window while the evening light falls across the room.\n\nglass window, soft light';
export const workbenchNegative = 'lowres, blurry';
function chunk(type, content) {
  const bytes = Buffer.concat([Buffer.from(type), content]);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, bytes, checksum]);
}
export async function createWorkbenchFixtures(
  directory,
  {
    prefix = 'synthetic-study',
    seed = 42000,
    dark = false,
    sizes = [
      [832, 1216],
      [1216, 832],
      [832, 832],
    ],
    prompts = [],
  } = {},
) {
  await fs.mkdir(directory, { recursive: true });
  const files = [];
  for (const [index, [width, height]] of sizes.entries()) {
    const file = path.join(directory, `${prefix}-s-${seed + index}.png`);
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ccd5d8"/><rect x="${width * 0.15}" y="${height * 0.12}" width="${width * 0.7}" height="${height * 0.76}" fill="#f1ece2"/><circle cx="${width * 0.5}" cy="${height * 0.4}" r="${width * 0.16}" fill="#80989d"/><path d="M ${width * 0.23} ${height * 0.85} L ${width * 0.5} ${height * 0.43} L ${width * 0.77} ${height * 0.85}" fill="#ad7971"/></svg>`;
    const png = await sharp(Buffer.from(svg))
      .modulate({ brightness: dark ? 0.2 : 1 })
      .png()
      .toBuffer();
    const comment = {
      prompt: prompts[index] ?? workbenchRaw,
      uc: workbenchNegative,
      steps: 28,
      scale: 6,
      seed: seed + index,
      width,
      height,
      model: 'nai-diffusion-4-5-full',
    };
    const meta = chunk('tEXt', Buffer.from('Description\0' + JSON.stringify(comment)));
    await fs.writeFile(
      file,
      Buffer.concat([png.subarray(0, png.length - 12), meta, png.subarray(png.length - 12)]),
    );
    files.push(file);
  }
  return files;
}
