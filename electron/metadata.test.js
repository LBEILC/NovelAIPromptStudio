import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { readNovelAIMetadata } from './metadata.js';

const temporaryDirectories = [];

function chunk(type, content = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  return Buffer.concat([length, typeBuffer, content, Buffer.alloc(4)]);
}

async function writeStealthPng(filePath, metadata, { compressed = true } = {}) {
  const width = 128;
  const height = 128;
  const raw = Buffer.alloc(width * height * 4, 255);
  const json = Buffer.from(JSON.stringify(metadata));
  const payload = compressed ? zlib.gzipSync(json) : json;
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length * 8);
  const hidden = Buffer.concat([
    Buffer.from(compressed ? 'stealth_pngcomp' : 'stealth_pnginfo'),
    length,
    payload,
  ]);
  if (hidden.length * 8 > width * height) throw new Error('Stealth test metadata exceeds image capacity');

  for (let streamIndex = 0; streamIndex < hidden.length * 8; streamIndex += 1) {
    const x = Math.floor(streamIndex / height);
    const y = streamIndex % height;
    const bit = (hidden[Math.floor(streamIndex / 8)] >> (7 - (streamIndex % 8))) & 1;
    const alphaIndex = ((y * width) + x) * 4 + 3;
    raw[alphaIndex] = (raw[alphaIndex] & 0xfe) | bit;
  }
  await sharp(raw, { raw: { width, height, channels: 4 } }).png().toFile(filePath);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('NovelAI PNG metadata', () => {
  it('recovers generation fields from a Description JSON text chunk', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-metadata-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'sample.png');
    const description = JSON.stringify({
      prompt: '1girl, 1.3::silver hair ::',
      uc: 'lowres, blurry',
      seed: 42042,
      steps: 28,
      sampler: 'k_euler_ancestral',
      scale: 5.5,
      model: 'nai-diffusion-4-5-full',
    });
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('tEXt', Buffer.concat([Buffer.from('Description'), Buffer.from([0]), Buffer.from(description)])),
      chunk('IEND'),
    ]);
    fs.writeFileSync(filePath, png);

    expect(await readNovelAIMetadata(filePath)).toMatchObject({
      prompt_raw: '1girl, 1.3::silver hair ::',
      negative_prompt: 'lowres, blurry',
      seed: '42042',
      steps: 28,
      sampler: 'k_euler_ancestral',
      guidance: 5.5,
      model: 'nai-diffusion-4-5-full',
    });
  });

  it('reads the generated image dimensions from the PNG IHDR chunk', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-metadata-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'dimensions.png');
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1024, 0);
    ihdr.writeUInt32BE(1536, 4);
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', ihdr),
      chunk('IEND'),
    ]);
    fs.writeFileSync(filePath, png);

    expect(await readNovelAIMetadata(filePath)).toMatchObject({ width: 1024, height: 1536 });
  });

  it.each([
    ['compressed', true],
    ['uncompressed', false],
  ])('recovers generation fields from %s alpha-channel stealth metadata', async (_label, compressed) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-metadata-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'stealth.png');
    await writeStealthPng(filePath, {
      Description: '2girls, outdoors',
      Software: 'NovelAI',
      Source: 'NovelAI Diffusion V4.5',
      Comment: JSON.stringify({
        prompt: '2girls, outdoors',
        uc: 'lowres, blurry',
        seed: 1127158183,
        steps: 28,
        sampler: 'k_euler_ancestral',
        scale: 6,
      }),
    }, { compressed });

    expect(await readNovelAIMetadata(filePath)).toMatchObject({
      prompt_raw: '2girls, outdoors',
      negative_prompt: 'lowres, blurry',
      seed: '1127158183',
      steps: 28,
      sampler: 'k_euler_ancestral',
      guidance: 6,
      model: 'NovelAI Diffusion V4.5',
      width: 128,
      height: 128,
    });
  });

  it('separates V4 base and character prompts with undesired content and positions', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-metadata-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'v4.png');
    const description = JSON.stringify({
      prompt: 'legacy prompt',
      uc: 'legacy undesired',
      v4_prompt: {
        use_coords: true,
        use_order: true,
        caption: {
          base_caption: '2girls, outdoors',
          char_captions: [
            { char_caption: 'girl, red hair', centers: [{ x: 0.3, y: 0.5 }] },
            { char_caption: 'girl, blue hair', centers: [{ x: 0.7, y: 0.5 }] },
          ],
        },
      },
      v4_negative_prompt: {
        caption: {
          base_caption: 'lowres, blurry',
          char_captions: [
            { char_caption: 'blue hair', centers: [{ x: 0.3, y: 0.5 }] },
            { char_caption: 'red hair', centers: [{ x: 0.7, y: 0.5 }] },
          ],
        },
      },
    });
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('tEXt', Buffer.concat([Buffer.from('Description'), Buffer.from([0]), Buffer.from(description)])),
      chunk('IEND'),
    ]);
    fs.writeFileSync(filePath, png);

    const metadata = await readNovelAIMetadata(filePath);
    expect(metadata.prompt_raw).toBe('2girls, outdoors');
    expect(metadata.negative_prompt).toBe('lowres, blurry');
    expect(metadata.prompt_structure_raw).toMatchObject({
      use_coords: true,
      use_order: true,
      characters: [
        { prompt_raw: 'girl, red hair', undesired_raw: 'blue hair', center: { x: 0.3, y: 0.5 } },
        { prompt_raw: 'girl, blue hair', undesired_raw: 'red hair', center: { x: 0.7, y: 0.5 } },
      ],
    });
  });

  it('extracts encoded Vibes from NovelAI PNG metadata', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-metadata-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'vibes.png');
    const description = JSON.stringify({
      reference_image_multiple: ['a'.repeat(1000)],
      reference_strength_multiple: [0.4],
      reference_information_extracted_multiple: [],
    });
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('tEXt', Buffer.concat([Buffer.from('Description'), Buffer.from([0]), Buffer.from(description)])),
      chunk('tEXt', Buffer.concat([Buffer.from('Source'), Buffer.from([0]), Buffer.from('NovelAI Diffusion V4.5')])),
      chunk('IEND'),
    ]);
    fs.writeFileSync(filePath, png);

    const metadata = await readNovelAIMetadata(filePath);
    expect(metadata.embedded_vibes).toEqual([
      expect.objectContaining({ strength: 0.4, information_extracted: null, model: 'nai-diffusion-4-5-full' }),
    ]);
  });

  it('recognizes NativeInfillingRequest images without discarding their generation fields', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-metadata-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'inpainting.png');
    const description = JSON.stringify({
      prompt: '1girl, white background',
      uc: 'lowres',
      seed: 1658537204,
      steps: 23,
      request_type: 'NativeInfillingRequest',
      img2img: null,
    });
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('tEXt', Buffer.concat([Buffer.from('Description'), Buffer.from([0]), Buffer.from(description)])),
      chunk('IEND'),
    ]);
    fs.writeFileSync(filePath, png);

    expect(await readNovelAIMetadata(filePath)).toMatchObject({
      generation_mode: 'inpainting',
      prompt_raw: '1girl, white background',
      seed: '1658537204',
      steps: 23,
    });
  });
});
