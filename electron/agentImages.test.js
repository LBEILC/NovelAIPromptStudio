import { afterAll, beforeAll, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { createAgentImages, resolveAgentMask, currentMaskInput } from './agentImages.js';
import { autoInpaintRect, defaultInpaintRect } from '../src/shared/inpaint.ts';

let fontDirectory;
const execute = promisify(execFile);
beforeAll(async () => {
  // SVG coordinates need digits, not the runner's entire system font inventory.
  // Pin one existing bundled font and a private cache before the first text render.
  fontDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-grid-fonts-'));
  await fs.copyFile(
    new URL(
      '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
      import.meta.url,
    ),
    path.join(fontDirectory, 'digits.woff2'),
  );
  const directory = fontDirectory
    .replaceAll('\\', '/')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;');
  const config = path.join(fontDirectory, 'fonts.conf');
  await fs.writeFile(
    config,
    `<fontconfig><dir>${directory}</dir><cachedir>${directory}/cache</cachedir></fontconfig>`,
  );
});
afterAll(async () => {
  if (fontDirectory) await fs.rm(fontDirectory, { recursive: true, force: true });
});

async function fixture(run, width = 512, height = 512) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-agent-images-'));
  const source = path.join(directory, 'synthetic.png');
  try {
    await sharp({ create: { width, height, channels: 3, background: '#667788' } })
      .png()
      .toFile(source);
    await run({ directory, source, images: createAgentImages(directory) });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
const rect = { type: 'rect', x: 80, y: 80, width: 40, height: 40 };
const alphaAt = async (result) => {
  const alpha = await sharp(Buffer.from(result.mask, 'base64'))
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer();
  return (x, y) => alpha[(y - result.rect.y) * result.rect.width + x - result.rect.x];
};

it('rasterizes rect, ellipse, polygon unions, growth and clipping in original pixels', async () => {
  await fixture(async ({ source }) => {
    const result = await resolveAgentMask(
      {
        shapes: [
          rect,
          { type: 'ellipse', cx: 200, cy: 200, rx: 30, ry: 50 },
          {
            type: 'polygon',
            points: [
              [300, 300],
              [400, 300],
              [350, 400],
            ],
          },
        ],
        grow: 8,
      },
      source,
    );
    const at = await alphaAt(result);
    expect(at(80, 80)).toBe(255);
    expect(at(74, 100)).toBe(255);
    expect(at(65, 100)).toBe(0);
    expect(at(200, 240)).toBe(255);
    expect(at(225, 245)).toBe(0);
    expect(at(350, 330)).toBe(255);
    expect(at(305, 390)).toBe(0);
    expect(result.rect).toEqual({ x: 0, y: 0, width: 512, height: 512 });
    const clipped = await resolveAgentMask({ shapes: [{ ...rect, x: -20, y: -20 }] }, source);
    expect(clipped.maskBounds).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    await expect(
      resolveAgentMask({ shapes: [{ ...rect, x: -200 }] }, source),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    for (const shapes of [
      [],
      [
        {
          type: 'polygon',
          points: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
      [{ type: 'ellipse', cx: 0, cy: 0, rx: -1, ry: 10 }],
      [{ ...rect, x: Infinity }],
    ])
      await expect(resolveAgentMask({ shapes }, source)).rejects.toMatchObject({
        code: 'invalid_input',
      });
    await expect(resolveAgentMask({ shapes: [rect], grow: 129 }, source)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      resolveAgentMask({ shapes: [rect], rect: { x: 0, y: 0, width: 64, height: 64 } }, source),
    ).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('"x":80') });
  });
});

it('validates mask PNG size, signature, dimensions, luminance and emptiness without rewriting it', async () => {
  await fixture(async ({ source, directory }) => {
    const file = path.join(directory, 'mask.png');
    const bytes = await sharp({
      create: { width: 512, height: 512, channels: 3, background: '#808080' },
    })
      .png()
      .toBuffer();
    await fs.writeFile(file, bytes);
    const result = await resolveAgentMask({ maskPath: file }, source);
    expect(result.maskRatio).toBe(1);
    expect(await fs.readFile(file)).toEqual(bytes);
    for (const content of [
      Buffer.from('not a PNG'),
      await sharp({ create: { width: 64, height: 64, channels: 3, background: '#fff' } })
        .png()
        .toBuffer(),
      await sharp({ create: { width: 512, height: 512, channels: 3, background: '#7f7f7f' } })
        .png()
        .toBuffer(),
    ]) {
      await fs.writeFile(file, content);
      await expect(resolveAgentMask({ maskPath: file }, source)).rejects.toMatchObject({
        code: 'invalid_input',
      });
    }
    await fs.truncate(file, 50 * 1024 * 1024 + 1);
    await expect(resolveAgentMask({ maskPath: file }, source)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(resolveAgentMask({ maskPath: directory }, source)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(resolveAgentMask({ maskPath: file + '.missing' }, source)).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });
});

it('shares the previous UI auto-frame rule and preserves current mask pixels when reframing', async () => {
  for (const image of [
    { width: 832, height: 1216 },
    { width: 2048, height: 1536 },
  ]) {
    const mask = { x: 100, y: 120, width: 250, height: 180 };
    expect(defaultInpaintRect(mask, image)).toEqual(
      image.width * image.height <= 1048576
        ? { x: 0, y: 0, ...image }
        : autoInpaintRect(mask, image),
    );
  }
  await fixture(async ({ source }) => {
    const state = await resolveAgentMask({ shapes: [rect] }, source);
    const result = await currentMaskInput(
      { rect: { x: 64, y: 64, width: 128, height: 128 } },
      state,
      source,
    );
    expect(result.maskRatio).toBe(1600 / 16384);
    expect((await alphaAt(result))(100, 100)).toBe(255);
    await expect(
      currentMaskInput({ rect: { x: 0, y: 0, width: 64, height: 64 } }, state, source),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

it('limits the coordinate grid and removes only expired temporary files', async () => {
  await fixture(
    async ({ source, images, directory }) => {
      // On Windows the native font library reads its environment at process
      // startup; changing process.env after loading sharp does not isolate it.
      const { stdout } = await execute(
        process.execPath,
        [
          fileURLToPath(new URL('./fixtures/agentGridWorker.mjs', import.meta.url)),
          directory,
          source,
        ],
        {
          windowsHide: true,
          env: {
            ...process.env,
            FONTCONFIG_FILE: path.join(fontDirectory, 'fonts.conf'),
            PANGOCAIRO_BACKEND: 'fontconfig',
          },
        },
      );
      const grid = JSON.parse(stdout);
      expect(grid).toMatchObject({ width: 1568, height: 1176, scale: 1568 / 2048 });
      expect(grid.step % 64).toBe(0);
      expect(2048 / grid.step).toBeGreaterThanOrEqual(8);
      expect(2048 / grid.step).toBeLessThanOrEqual(12);
      const retained = path.join(directory, 'agent-image-previews', 'retained.png');
      await fs.copyFile(grid.path, retained);
      const old = new Date(Date.now() - 25 * 3600000);
      await fs.utimes(grid.path, old, old);
      await images.cleanupTemporary();
      await expect(fs.access(grid.path)).rejects.toMatchObject({ code: 'ENOENT' });
      await fs.access(retained);
    },
    2048,
    1536,
  );
});

it.each([{}, { limit: 1024, crop: true }, { limit: 512, job: true }])(
  'produces a bounded highlighted preview with options %j',
  async (options) => {
    await fixture(
      async ({ source, images }) => {
        const resolved = await resolveAgentMask({ shapes: [rect] }, source);
        const file = await images.preview(source, resolved, options);
        const meta = await sharp(file).metadata();
        expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(options.limit || 1568);
        if (options.crop) expect(meta.width).toBe(meta.height);
        if (options.job) {
          await images.cleanupJobs([{ state: 'pending', previewPath: file }]);
          await fs.access(file);
          await images.cleanupJobs([{ state: 'canceled', previewPath: file }]);
          await expect(fs.access(file)).rejects.toMatchObject({ code: 'ENOENT' });
        }
      },
      1600,
      1024,
    );
  },
);

it('bounds outpaint previews and cleans up unretained jobs', async () => {
  await fixture(async ({ source, images }) => {
    const file = await images.outpaint(source, { left: 64, top: 64 }, { width: 576, height: 576 });
    const meta = await sharp(file).metadata();
    expect(Math.max(meta.width, meta.height)).toBe(512);
    await images.cleanupJobs([{ state: 'pending', previewPath: file }]);
    await fs.access(file);
    await images.cleanupJobs([]);
    await expect(fs.access(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
