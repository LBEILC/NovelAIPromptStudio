import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readWorkbenchImage } from './workbench.js';

const temporaryDirectories = [];

function chunk(type, content = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  return Buffer.concat([length, typeBuffer, content, Buffer.alloc(4)]);
}

function workbenchPng(filePath) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(832, 0);
  ihdr.writeUInt32BE(1216, 4);
  const description = JSON.stringify({
    prompt: '1girl, silver hair',
    uc: 'lowres',
    model: 'nai-diffusion-4-5-full',
    reference_image_multiple: ['a'.repeat(1000)],
    reference_strength_multiple: [0.45],
  });
  fs.writeFileSync(filePath, Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.concat([Buffer.from('Description'), Buffer.from([0]), Buffer.from(description)])),
    chunk('IEND'),
  ]));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('workbench image reader', () => {
  it('parses a source image without copying it into the library', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-workbench-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'source.png');
    workbenchPng(filePath);

    const project = await readWorkbenchImage(filePath, {
      enrichProjectTags: (value) => ({ ...value, tags: value.tags.map((tag) => ({ ...tag, translation: '缓存翻译' })) }),
    });

    expect(project).toMatchObject({
      name: 'source',
      image_path: filePath,
      metadata: { width: 832, height: 1216 },
      tags: [{ tag: '1girl', translation: '缓存翻译' }, { tag: 'silver hair', translation: '缓存翻译' }],
      vibes: [{ name: 'Vibe 1', strength: 0.45 }],
    });
    expect(fs.readdirSync(directory)).toEqual(['source.png']);
  });

  it('rejects unsupported files before attempting metadata parsing', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-workbench-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'notes.txt');
    fs.writeFileSync(filePath, 'not an image');
    await expect(readWorkbenchImage(filePath)).rejects.toThrow('仅支持 PNG、JPG 和 WEBP');
  });
});

