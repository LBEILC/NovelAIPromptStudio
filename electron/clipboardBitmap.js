import sharp from 'sharp';

// Sharp returns straight RGBA. DIBV5 uses bottom-up, straight BGRA pixels.
export async function createClipboardBitmap(bytes, format) {
  const { data, info } = await sharp(bytes)
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const dib = Buffer.alloc(124 + data.length);
  dib.writeUInt32LE(124, 0);
  dib.writeInt32LE(info.width, 4);
  dib.writeInt32LE(info.height, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(3, 16); // BI_BITFIELDS
  dib.writeUInt32LE(data.length, 20);
  for (const [offset, value] of [
    [40, 0x00ff0000],
    [44, 0x0000ff00],
    [48, 0x000000ff],
    [52, 0xff000000],
    [56, 0x73524742],
    [108, 4],
  ])
    dib.writeUInt32LE(value, offset);
  const stride = info.width * 4;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < stride; x += 4) {
      const source = y * stride + x;
      const target = 124 + (info.height - 1 - y) * stride + x;
      dib[target] = data[source + 2];
      dib[target + 1] = data[source + 1];
      dib[target + 2] = data[source];
      dib[target + 3] = data[source + 3];
    }
  }
  const png = format === 'PNG' ? bytes : await sharp(data, { raw: info }).png().toBuffer();
  return [
    { format, bytes },
    ...(format === 'PNG' ? [] : [{ format: 'PNG', bytes: png }]),
    { format: 17, bytes: dib },
  ];
}
