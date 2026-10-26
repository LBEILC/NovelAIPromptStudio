import { it, expect } from 'vitest';
import sharp from 'sharp';
import yazl from 'yazl';
import {
  buildDirector,
  directorSize,
  estimateDirector,
  DIRECTOR_TOOLS,
  validateDirector,
} from './director.js';
import { extractDirectorPngs } from './directorZip.js';
import { createNovelAIClient } from './generation.js';

const image = (width = 32, height = 32) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 40, g: 80, b: 120, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
async function zip(entries) {
  const archive = new yazl.ZipFile(),
    chunks = [];
  const done = new Promise((resolve, reject) => {
    archive.outputStream.on('data', (chunk) => chunks.push(chunk));
    archive.outputStream.on('error', reject);
    archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
  for (const [name, content] of entries) archive.addBuffer(content, name);
  archive.end();
  return done;
}

it('uses actual floor dimensions without padding or 64 alignment', () => {
  expect(directorSize(512, 512)).toEqual({ width: 1024, height: 1024 });
  expect(directorSize(500, 700)).toEqual({ width: 865, height: 1211 });
  expect(directorSize(832, 1216)).toEqual({ width: 832, height: 1216 });
  expect(directorSize(4096, 4096)).toEqual({ width: 1773, height: 1773 });
});

it.each(DIRECTOR_TOOLS)('builds the exact %s request, retaining alpha', async (tool) => {
  const options = { tool, ...(tool === 'emotion' ? { emotion: 'happy' } : {}) };
  const { request } = await buildDirector(await image(500, 700), options);
  const { image: base64, ...body } = request;
  expect(body).toEqual({
    req_type: tool,
    width: 865,
    height: 1211,
    use_new_shared_trial: true,
    ...(['emotion', 'colorize'].includes(tool)
      ? { prompt: tool === 'emotion' ? 'happy;;' : '', defry: 0 }
      : {}),
  });
  const sent = await sharp(Buffer.from(base64, 'base64')).metadata();
  expect(sent).toMatchObject({ width: 865, height: 1211, format: 'png', hasAlpha: true });
  expect((await sharp(Buffer.from(base64, 'base64')).stats()).isOpaque).toBe(false);
});

it('joins emotion and extra prompt and rejects unrelated parameters', async () => {
  expect(
    (
      await buildDirector(await image(), {
        tool: 'emotion',
        emotion: 'angry',
        prompt: 'blue eyes',
        defry: 5,
      })
    ).request.prompt,
  ).toBe('angry;;blue eyes');
  for (const options of [
    { tool: 'pixel-snap' },
    { tool: 'sketch', prompt: '' },
    { tool: 'lineart', defry: 0 },
    { tool: 'colorize', emotion: 'happy' },
    { tool: 'emotion' },
    { tool: 'emotion', emotion: 'unknown' },
    { tool: 'colorize', defry: 6 },
    { tool: 'colorize', defry: 0.5 },
  ])
    expect(() => validateDirector(options)).toThrow();
});

it('prices the sent area and applies only the V3 Opus conditions', () => {
  const price = (tool, width, height, subscription) =>
    estimateDirector({ req_type: tool, ...directorSize(width, height) }, subscription);
  for (const tool of ['lineart', 'sketch', 'colorize', 'emotion']) {
    expect(price(tool, 832, 1216).anlas).toBe(20);
    expect(price(tool, 1024, 1536).anlas).toBe(30);
    expect(price(tool, 500, 700).anlas).toBe(20);
    expect(
      price(tool, 832, 1216, { active: true, tier: 3, usage: { isNegative: true } }),
    ).toMatchObject({ anlas: 0, free: true });
    expect(price(tool, 1024, 1536, { active: true, tier: 3 }).anlas).toBe(30);
    expect(price(tool, 832, 1216, { active: false, tier: 3 }).anlas).toBe(20);
    expect(price(tool, 832, 1216, { active: true, tier: 2 }).anlas).toBe(20);
  }
  for (const tool of ['bg-removal', 'declutter'])
    expect(price(tool, 832, 1216, { active: true, tier: 3 })).toMatchObject({
      anlas: 65,
      free: false,
      count: 1,
      outputImages: tool === 'bg-removal' ? 3 : 1,
    });
});

it('sorts all PNG entries and rejects damaged or oversized archives', async () => {
  const png = await image();
  const archive = await zip([
    ['image_2.png', png],
    ['image_0.png', png],
    ['image_1.png', png],
  ]);
  expect((await extractDirectorPngs(archive)).map((i) => i.name)).toEqual([
    'image_0.png',
    'image_1.png',
    'image_2.png',
  ]);
  expect(await extractDirectorPngs(await zip([['image_1.png', png]]))).toHaveLength(1);
  for (const bad of [
    Buffer.from('bad'),
    archive.subarray(0, -20),
    await zip([['readme.txt', png]]),
    await zip([['image_0.png', Buffer.from('bad')]]),
    await zip([['image_0.png', png.subarray(0, 40)]]),
    await zip([
      ['same.png', png],
      ['same.png', png],
    ]),
  ])
    await expect(extractDirectorPngs(bad)).rejects.toThrow();
  for (const limits of [
    { entries: 2, bytes: 100000, pixels: 10000 },
    { entries: 16, bytes: 10, pixels: 10000 },
    { entries: 16, bytes: 100000, pixels: 10 },
  ])
    await expect(extractDirectorPngs(archive, limits)).rejects.toThrow();
});

it('never sends director requests to relays and never retries failed or lost responses', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw Error('secret network error');
  };
  await expect(
    createNovelAIClient({
      token: () => 'secret',
      connection: 'relay',
      baseUrl: 'http://localhost',
      fetchImpl,
    }).director({}),
  ).rejects.toMatchObject({ code: 'unsupported' });
  expect(calls).toBe(0);
  await expect(
    createNovelAIClient({ token: () => 'secret', fetchImpl }).director({}),
  ).rejects.toMatchObject({ code: 'network' });
  expect(calls).toBe(1);
});
