import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNovelAIMetadata } from './metadata.js';

const temporaryDirectories = [];

function chunk(type, content = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  return Buffer.concat([length, typeBuffer, content, Buffer.alloc(4)]);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('NovelAI PNG metadata', () => {
  it('recovers generation fields from a Description JSON text chunk', () => {
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

    expect(readNovelAIMetadata(filePath)).toMatchObject({
      prompt_raw: '1girl, 1.3::silver hair ::',
      negative_prompt: 'lowres, blurry',
      seed: '42042',
      steps: 28,
      sampler: 'k_euler_ancestral',
      guidance: 5.5,
      model: 'nai-diffusion-4-5-full',
    });
  });

  it('reads the generated image dimensions from the PNG IHDR chunk', () => {
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

    expect(readNovelAIMetadata(filePath)).toMatchObject({ width: 1024, height: 1536 });
  });

  it('separates V4 base and character prompts with undesired content and positions', () => {
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

    const metadata = readNovelAIMetadata(filePath);
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

  it('extracts encoded Vibes from NovelAI PNG metadata', () => {
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

    const metadata = readNovelAIMetadata(filePath);
    expect(metadata.embedded_vibes).toEqual([
      expect.objectContaining({ strength: 0.4, information_extracted: null, model: 'nai-diffusion-4-5-full' }),
    ]);
  });

  it('recognizes NativeInfillingRequest images without discarding their generation fields', () => {
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

    expect(readNovelAIMetadata(filePath)).toMatchObject({
      generation_mode: 'inpainting',
      prompt_raw: '1girl, white background',
      seed: '1658537204',
      steps: 23,
    });
  });
});
