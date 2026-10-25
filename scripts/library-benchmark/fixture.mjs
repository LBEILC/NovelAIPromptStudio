import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { openDatabase } from '../../electron/database.js';
import { readNovelAIMetadata } from '../../electron/metadata.js';
import { parsePrompt } from '../../src/lib/prompt.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';

const words = [
  'forest',
  'cloud',
  'rain',
  'sunlight',
  'river',
  'mountain',
  'flower',
  'blue sky',
  'tree',
  'grass',
  'snow',
  'night',
  'stars',
  'water',
  'rock',
  'sand',
];
export function pngMetadata(png, index) {
  let random = index + 1;
  const tags = Array.from({ length: 24 }, () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return words[(random >>> 16) % words.length];
  });
  const content = Buffer.from(
    'Comment\0' +
      JSON.stringify({
        prompt: tags.join(', '),
        uc: 'blurry',
        model: 'nai-diffusion-4-5-full',
        seed: index,
        steps: 28,
        scale: 5,
        sampler: 'k_euler',
      }),
  );
  const bytes = Buffer.concat([Buffer.from('tEXt'), content]);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([png.subarray(0, -12), length, bytes, checksum, png.subarray(-12)]);
}

export function diskBytes(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((n, entry) => {
    const file = path.join(directory, entry.name);
    return n + (entry.isDirectory() ? diskBytes(file) : fs.statSync(file).size);
  }, 0);
}

export async function seedLibrary(root, count, importCount = 1000) {
  const data = path.join(root, 'userData', 'data');
  const assets = path.join(root, 'userData', 'assets');
  for (const name of ['images', 'thumbnails'])
    fs.mkdirSync(path.join(assets, name), { recursive: true });
  const png = await sharp({
    create: { width: 832, height: 1216, channels: 3, background: '#789abc' },
  })
    .png()
    .toBuffer();
  const thumb = await sharp(png).resize(328, 480).webp({ quality: 82 }).toBuffer();
  const database = await openDatabase(data);
  const workBatches = [];
  try {
    for (let start = 0; start < count; start += 100) {
      const batch = [];
      for (let i = start; i < Math.min(start + 100, count); i++) {
        const id = `synthetic-${String(i).padStart(6, '0')}`;
        const image = path.join(assets, 'images', `${id}.png`);
        const thumbnail = path.join(assets, 'thumbnails', `${id}.webp`);
        const buffer = pngMetadata(png, i);
        fs.writeFileSync(image, buffer);
        fs.writeFileSync(thumbnail, thumb);
        const metadata = await readNovelAIMetadata(image);
        batch.push({
          id,
          name: id,
          image_path: image,
          thumbnail_path: thumbnail,
          content_hash: crypto.createHash('sha256').update(buffer).digest('hex'),
          created_at: new Date(1700000000000 + i * 1000).toISOString(),
          updated_at: new Date(1700000000000 + i * 1000).toISOString(),
          metadata,
          tags: parsePrompt(metadata.prompt_raw, () => crypto.randomUUID()),
          prompt_structure: createPromptStructure(metadata, () => crypto.randomUUID()),
        });
      }
      const results = database.insertProjects(batch);
      if (results.some((r) => r.error)) throw Error('Synthetic insert failed');
      if (start < count * 0.24) workBatches.push({ start, batch });
      if (start % 5000 === 0) console.log(`seed ${start}/${count}`);
    }
    // Build the same twenty-version works after insertion, so fixture setup does
    // not repeatedly resolve growing ownership data for unrelated imported rows.
    for (const { start, batch } of workBatches) {
      for (let offset = 0; offset < batch.length; offset += 20) {
        const workId = `synthetic-work-${start + offset}`;
        let parent = database.versions.ensure(workId, batch[offset]);
        for (const project of batch.slice(offset + 1, offset + 20)) {
          parent = database.versions.append({
            workId,
            parentId: parent.id,
            project,
            source: 'user',
            image: project,
            seed: project.metadata.seed,
          });
        }
      }
    }
    database.createCollection({
      id: 'benchmark-collection',
      name: 'Synthetic collection',
      kind: 'manual',
    });
    database.updateCollectionProjects(
      'benchmark-collection',
      Array.from(
        { length: Math.floor(count / 10) },
        (_, i) => `synthetic-${String(i * 10).padStart(6, '0')}`,
      ),
    );
    database.updateProjects(
      Array.from(
        { length: Math.floor(count / 20) },
        (_, i) => `synthetic-${String(count - 1 - i).padStart(6, '0')}`,
      ),
      { deleted: true },
    );
    await database.loadLibraryCards();
  } finally {
    database.close();
  }
  const inputs = path.join(root, 'import-input');
  fs.mkdirSync(inputs);
  // Half random pixels and half repeated pixels produce ~1.5 MB PNGs at the real dimensions.
  const raw = Buffer.alloc(832 * 1216 * 3);
  crypto.randomFillSync(raw, 0, Math.floor(raw.length / 2));
  const large = await sharp(raw, { raw: { width: 832, height: 1216, channels: 3 } })
    .png()
    .toBuffer();
  for (let i = 0; i < importCount; i++)
    fs.writeFileSync(path.join(inputs, `synthetic-import-${i}.png`), pngMetadata(large, count + i));
  return {
    totalBytes: diskBytes(root),
    databaseBytes: fs.statSync(path.join(data, 'studio.sqlite')).size,
    thumbnailBytes: diskBytes(path.join(assets, 'thumbnails')),
    importInputBytes: diskBytes(inputs),
    count,
    versionImageRatio: 0.24,
    collectionRatio: 0.1,
    trashRatio: 0.05,
  };
}
