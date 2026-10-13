import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyWorkbenchLibraryDetails,
  applyWorkbenchStructure,
  readWorkbenchImage,
} from './workbench.js';
import { openDatabase } from './database.js';

const temporaryDirectories = [];

function chunk(type, content = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  return Buffer.concat([length, typeBuffer, content, Buffer.alloc(4)]);
}

function workbenchPng(filePath, { minimal = false } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(832, 0);
  ihdr.writeUInt32BE(1216, 4);
  const description = JSON.stringify({
    prompt: '1girl, silver hair',
    uc: 'lowres',
    model: 'nai-diffusion-4-5-full',
    ...(!minimal && {
      reference_image_multiple: ['a'.repeat(1000)],
      reference_strength_multiple: [0.45],
      qualityToggle: true,
      ucPreset: 0,
    }),
  });
  fs.writeFileSync(
    filePath,
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', ihdr),
      chunk(
        'tEXt',
        Buffer.concat([Buffer.from('Description'), Buffer.from([0]), Buffer.from(description)]),
      ),
      chunk('IEND'),
    ]),
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('workbench image reader', () => {
  it('remembers block annotations across close/reopen without replacing the source prompt', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-workbench-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'synthetic.png');
    // This case only needs source text and annotations; Vibe and automatic-tag
    // metadata are covered by the image-reader case below.
    workbenchPng(filePath, { minimal: true });
    const project = await readWorkbenchImage(filePath);
    const structure = {
      ...project.prompt_structure,
      block_annotations: {
        'base:prompt': [
          { raw: '1girl, silver hair', start: 0, type: 'paragraph', translation: '合成译文' },
        ],
      },
    };
    const database = await openDatabase(directory);
    try {
      database.insertProject({ ...project, content_hash: 'synthetic-memory' });
      database.rememberWorkbenchStructure(filePath, structure, project.id);
    } finally {
      database.close();
    }
    const reopened = await openDatabase(directory);
    try {
      const read = applyWorkbenchStructure(
        await readWorkbenchImage(filePath),
        reopened.loadWorkbenchStructure(filePath),
      );
      expect(read.prompt_structure.block_annotations).toEqual(structure.block_annotations);
      expect(reopened.loadProject(project.id).prompt_structure.block_annotations).toEqual(
        structure.block_annotations,
      );
      expect(read.metadata.prompt_raw).toBe(project.metadata.prompt_raw);
      expect(reopened.loadProject(project.id).metadata.prompt_raw).toBe(
        project.metadata.prompt_raw,
      );
    } finally {
      reopened.close();
    }
  }, 30_000);
  it('uses the library title and thumbnail for library-backed workbench tabs', () => {
    expect(
      applyWorkbenchLibraryDetails(
        { name: 'internal-asset-id', thumbnail_path: '' },
        { name: '图库标题', thumbnail_path: 'thumbnail.webp' },
      ),
    ).toMatchObject({ name: '图库标题', thumbnail_path: 'thumbnail.webp' });
  });

  it('parses a source image without copying it into the library', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-workbench-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'source.png');
    workbenchPng(filePath);

    const project = await readWorkbenchImage(filePath, {
      enrichProjectTags: (value) => ({
        ...value,
        tags: value.tags.map((tag) => ({ ...tag, translation: '缓存翻译' })),
      }),
    });

    expect(project).toMatchObject({
      name: 'source',
      image_path: filePath,
      metadata: { width: 832, height: 1216 },
      tags: [
        { tag: '1girl', translation: '缓存翻译' },
        { tag: 'silver hair', translation: '缓存翻译' },
      ],
      vibes: [{ name: 'Vibe 1', strength: 0.45 }],
    });
    expect(project.prompt_structure.novelai_auto).toMatchObject({
      quality_toggle: true,
      uc_preset: 0,
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
