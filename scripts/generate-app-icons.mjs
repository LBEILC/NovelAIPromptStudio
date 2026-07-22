import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(projectRoot, 'public', 'app-icon.svg');
const outputDirectory = path.join(projectRoot, 'build', 'icons');
const source = await fs.readFile(sourcePath);

await fs.mkdir(outputDirectory, { recursive: true });
await fs.writeFile(path.join(outputDirectory, 'app-icon.svg'), source);

async function renderPng(size) {
  return sharp(source, { density: 384 })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngs = new Map(await Promise.all(pngSizes.map(async (size) => [size, await renderPng(size)])));

await Promise.all([
  fs.writeFile(path.join(outputDirectory, 'icon.png'), pngs.get(512)),
  ...pngSizes.map((size) => fs.writeFile(path.join(outputDirectory, `icon-${size}.png`), pngs.get(size))),
]);

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(images.length * 16);
  let offset = header.length + entries.length;
  images.forEach(({ size, data }, index) => {
    const entry = index * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, entry);
    entries.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    entries.writeUInt8(0, entry + 2);
    entries.writeUInt8(0, entry + 3);
    entries.writeUInt16LE(1, entry + 4);
    entries.writeUInt16LE(32, entry + 6);
    entries.writeUInt32LE(data.length, entry + 8);
    entries.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, entries, ...images.map(({ data }) => data)]);
}

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
await fs.writeFile(path.join(outputDirectory, 'icon.ico'), createIco(icoSizes.map((size) => ({ size, data: pngs.get(size) }))));

function icnsChunk(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
}

const icnsEntries = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
].map(([type, size]) => icnsChunk(type, pngs.get(size)));
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns', 0, 4, 'ascii');
icnsHeader.writeUInt32BE(8 + icnsEntries.reduce((total, chunk) => total + chunk.length, 0), 4);
await fs.writeFile(path.join(outputDirectory, 'icon.icns'), Buffer.concat([icnsHeader, ...icnsEntries]));

console.log(`Generated app icons in ${path.relative(projectRoot, outputDirectory)}`);
