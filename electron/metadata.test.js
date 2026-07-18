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
});
