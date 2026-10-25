import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { openDatabase } from '../electron/database.js';
import { createFolderImporter } from '../electron/folderImport.js';

const parent = path.resolve('.codex-runs');
await fs.mkdir(parent, { recursive: true });
const root = await fs.mkdtemp(path.join(parent, 'folder-benchmark-'));
const source = path.join(root, 'source'),
  assets = path.join(root, 'assets');
await fs.mkdir(source);
await fs.mkdir(assets);
const pixels = Buffer.alloc(640 * 512 * 4);
let seed = 1729;
for (let i = 0; i < pixels.length; i++) {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  pixels[i] = seed & 255;
}
const png = await sharp(pixels, { raw: { width: 640, height: 512, channels: 4 } })
  .png({ compressionLevel: 0 })
  .toBuffer();
function textChunk(index) {
  const content = Buffer.from(
    'Comment\0' + JSON.stringify({ prompt: 'synthetic benchmark', seed: index, steps: 28 }),
  );
  const data = Buffer.concat([Buffer.from('tEXt'), content]);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, data, checksum]);
}
console.log('Preparing 10,000 unique synthetic 640×512 PNGs, approximately 1.31 MB each');
let database;
try {
  for (let folder = 0; folder < 100; folder++) {
    const dir = path.join(source, `group-${folder}`);
    await fs.mkdir(dir);
    await Promise.all(
      Array.from({ length: 100 }, (_, index) => {
        const id = folder * 100 + index;
        return fs.writeFile(
          path.join(dir, `${id}.png`),
          Buffer.concat([png.subarray(0, -12), textChunk(id), png.subarray(-12)]),
        );
      }),
    );
  }
  database = await openDatabase(path.join(root, 'data'));
  const importer = createFolderImporter({ database, assetsDirectory: assets });
  const start = performance.now();
  const scan = await importer.scan(source);
  const scanned = performance.now();
  console.log(
    JSON.stringify({
      scanMs: scanned - start,
      images: scan.folders.reduce((n, f) => n + f.imageCount, 0),
    }),
  );
  const result = await importer.commit(
    { sessionId: scan.sessionId, folderIds: scan.folders.map((f) => f.id), skipNoMetadata: false },
    (e) => {
      if (e.phase === 'importing' && e.processed % 1000 === 0)
        console.log(`Imported ${e.processed}/${e.total}`);
    },
  );
  const report = {
    count: 10000,
    bytesPerImage: png.length,
    scanMs: scanned - start,
    importMs: performance.now() - scanned,
    result,
  };
  await fs.writeFile(
    path.join(parent, '071-folder-benchmark.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  if (result.imported !== 10000 || result.errors.length) process.exitCode = 1;
} finally {
  database?.close();
  // Only the unique directory allocated by this process is removed.
  if (path.dirname(root) !== parent || !path.basename(root).startsWith('folder-benchmark-'))
    throw Error('Invalid fixture cleanup path');
  await fs.rm(root, { recursive: true, force: true });
}
