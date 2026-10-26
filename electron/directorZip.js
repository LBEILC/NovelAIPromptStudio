import yauzl from 'yauzl';
import sharp from 'sharp';
import { crc32 } from 'node:zlib';

export const DIRECTOR_ZIP_LIMITS = { entries: 16, bytes: 100 * 1024 * 1024, pixels: 16777216 };

// Read sequentially with both declared and streamed budgets. Never extract paths to disk.
export function extractDirectorPngs(buffer, limits = DIRECTOR_ZIP_LIMITS) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(new Error('导演工具结果不是有效的 ZIP'));
      const images = [],
        names = new Set();
      let total = 0,
        streamed = 0,
        entries = 0,
        failed = false;
      const fail = () => {
        failed = true;
        zip.close();
        reject(new Error('导演工具结果损坏或超过安全限制'));
      };
      if (zip.entryCount > limits.entries) return fail();
      zip.on('error', fail);
      zip.on('end', () => {
        if (failed) return;
        if (!images.length) return fail();
        resolve(images.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
      });
      zip.on('entry', (entry) => {
        total += entry.uncompressedSize;
        if (++entries > limits.entries || total > limits.bytes || names.has(entry.fileName))
          return fail();
        names.add(entry.fileName);
        if (!/\.png$/i.test(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (error, stream) => {
          if (error) return fail();
          const chunks = [];
          stream.on('error', fail);
          stream.on('data', (chunk) => {
            streamed += chunk.length;
            if (streamed > limits.bytes) {
              stream.destroy();
              fail();
            } else chunks.push(chunk);
          });
          stream.on('end', async () => {
            if (failed) return;
            try {
              const png = Buffer.concat(chunks);
              if (crc32(png) !== entry.crc32) throw Error();
              if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error();
              const decoder = sharp(png, { limitInputPixels: limits.pixels, failOn: 'warning' });
              const metadata = await decoder.metadata();
              if (
                metadata.format !== 'png' ||
                (metadata.pages || 1) > 1 ||
                metadata.width * metadata.height > limits.pixels
              )
                throw Error();
              await decoder.stats();
              images.push({ name: entry.fileName, png });
              zip.readEntry();
            } catch {
              fail();
            }
          });
        });
      });
      zip.readEntry();
    });
  });
}
