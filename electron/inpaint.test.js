import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildImageOperation, estimateImageOperation } from './imageOperations.js';
import { compositeInpaint, prepareInpaintMask } from './inpaint.js';
import { createBlankProject } from './workbench.js';
import { validateGenerationRequest } from './generation.js';
import { createWorkbenchFixtures } from './acceptance/workbenchFixtures.js';

async function maskPng(width, height, alpha = 255) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = height / 4; y < (height * 3) / 4; y++)
    for (let x = width / 4; x < (width * 3) / 4; x++) data[(y * width + x) * 4 + 3] = alpha;
  return (
    await sharp(data, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer()
  ).toString('base64');
}

it('turns alpha selections into opaque black/white nearest-neighbor mask blocks', async () => {
  const mask = await maskPng(64, 64);
  const prepared = await prepareInpaintMask(
    mask,
    { width: 64, height: 64 },
    { width: 128, height: 128 },
  );
  const { data, info } = await sharp(prepared.request)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info).toMatchObject({ width: 128, height: 128, channels: 4 });
  expect([...data.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
  expect([...data.subarray((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4)]).toEqual([
    255, 255, 255, 255,
  ]);
  expect(prepared.low.length).toBe(16 * 16);
  expect(new Set(prepared.low)).toEqual(new Set([0, 255]));
  await expect(
    prepareInpaintMask(
      await maskPng(64, 64, 127),
      { width: 64, height: 64 },
      { width: 64, height: 64 },
    ),
  ).rejects.toThrow('先涂上');
  await expect(
    prepareInpaintMask(
      await maskPng(64, 64, 128),
      { width: 64, height: 64 },
      { width: 64, height: 64 },
    ),
  ).resolves.toBeTruthy();
  await expect(
    prepareInpaintMask(mask, { width: 128, height: 128 }, { width: 64, height: 64 }),
  ).rejects.toThrow('尺寸');
  await expect(
    prepareInpaintMask('YWJj', { width: 64, height: 64 }, { width: 64, height: 64 }),
  ).rejects.toThrow('PNG');
});

it('builds infill from the draft, maps models and transforms character centers without references', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'inpaint-'));
  try {
    const source = path.join(directory, 'synthetic.png');
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 20, g: 40, b: 60, alpha: 0 },
      },
    })
      .png()
      .toFile(source);
    const draft = createBlankProject({ params: { model: 'nai-diffusion-5-full', steps: 23 } });
    draft.metadata.prompt_raw = 'synthetic shape';
    draft.prompt_structure.characters = [
      { id: 'left', prompt_raw: 'synthetic left', undesired_raw: '' },
      { id: 'right', prompt_raw: 'synthetic right', undesired_raw: '' },
    ];
    draft.params.positions = { left: 'A1', right: 'E5' };
    draft.params.aiPositions = false;
    draft.references = {
      vibes: [{ id: 'unused-vibe' }],
      precise: [{ id: 'unused-precise' }],
      base: { path: 'unused-base' },
    };
    draft.metadata.extra_json = JSON.stringify({
      parsed: {
        image: 'untrusted',
        mask: 'untrusted',
        img2img: { strength: 0.1 },
        upscaled_enhance: true,
        add_original_image: true,
        tag_hint_transparent_background: null,
        straight_alpha: null,
        skip_cfg_above_sigma: null,
        cfg_rescale: null,
      },
    });
    const original = structuredClone(draft);
    const rect = { x: 256, y: 256, width: 512, height: 512 };
    const mask = await maskPng(512, 512);
    const build = (strength, model = 'nai-diffusion-5-full', fullSize = false) =>
      buildImageOperation(
        { ...draft, params: { ...draft.params, model } },
        source,
        { kind: 'inpaint', rect, strength, fullSize },
        {},
        { mask, seed: 123 },
      );
    const high = await build(1);
    for (const key of ['tag_hint_transparent_background', 'straight_alpha', 'skip_cfg_above_sigma'])
      expect(high.request.parameters).not.toHaveProperty(key);
    expect(Object.values(high.request.parameters)).not.toContain(null);
    expect(high.request).toMatchObject({
      action: 'infill',
      model: 'nai-diffusion-5-full-inpainting',
      parameters: {
        width: 1024,
        height: 1024,
        seed: 123,
        add_original_image: false,
        image_format: 'png',
      },
    });
    expect(high.ignored).toEqual(['vibe', 'precise', 'base']);
    expect(high.request.parameters).not.toHaveProperty('img2img');
    expect(high.request.parameters).not.toHaveProperty('upscaled_enhance');
    expect(
      Object.keys(high.request.parameters).some((k) => /^(reference_|director_reference_)/.test(k)),
    ).toBe(false);
    expect(
      high.request.parameters.v4_prompt.caption.char_captions.map((c) => c.centers[0]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(
      high.request.parameters.v4_negative_prompt.caption.char_captions.map((c) => c.centers[0]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(() => validateGenerationRequest(high.request)).not.toThrow();
    expect(
      (
        await sharp(Buffer.from(high.request.parameters.image, 'base64'))
          .ensureAlpha()
          .raw()
          .toBuffer()
      )[3],
    ).toBe(0);
    expect((await build(0.4)).request.parameters.img2img).toEqual({
      strength: 0.4,
      color_correct: true,
    });
    const curated = await build(1, 'nai-diffusion-5-curated');
    expect(curated.request.model).toBe('nai-diffusion-4-5-curated-inpainting');
    expect([
      ...(
        await sharp(Buffer.from(curated.request.parameters.image, 'base64'))
          .ensureAlpha()
          .raw()
          .toBuffer()
      ).subarray(0, 4),
    ]).toEqual([255, 255, 255, 255]);
    draft.params.effort = 'Medium';
    const medium = await build(1);
    expect(medium.request.model).toBe('nai-diffusion-5-full-medium-inpainting');
    expect(medium.request.parameters).toMatchObject({ steps: 14, sampler: 'k_euler_ancestral' });
    expect(() => validateGenerationRequest(medium.request)).not.toThrow();
    expect(() =>
      validateGenerationRequest({
        ...medium.request,
        parameters: { ...medium.request.parameters, steps: 23 },
      }),
    ).toThrow();
    draft.params.effort = original.params.effort;
    expect(draft).toEqual(original);
    for (const invalid of [
      { ...rect, x: -1 },
      { ...rect, width: 63 },
      { ...rect, x: 900 },
    ])
      await expect(
        buildImageOperation(draft, source, { kind: 'inpaint', rect: invalid }, {}),
      ).rejects.toMatchObject({ code: 'invalid_input' });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it('prices actual mapped models and strength, including Medium and Opus', () => {
  const request = {
    action: 'infill',
    model: 'nai-diffusion-5-full-inpainting',
    parameters: { width: 1024, height: 1024, steps: 23 },
  };
  expect(estimateImageOperation(request, null).anlas).toBe(26);
  expect(
    estimateImageOperation(
      { ...request, parameters: { ...request.parameters, img2img: { strength: 0.5 } } },
      null,
    ).anlas,
  ).toBe(13);
  expect(
    estimateImageOperation({ ...request, model: 'nai-diffusion-4-5-curated-inpainting' }, null)
      .anlas,
  ).toBe(17);
  expect(estimateImageOperation(request, { active: true, tier: 3 })).toMatchObject({
    free: true,
    anlas: 0,
  });
  expect(
    estimateImageOperation(
      { ...request, parameters: { ...request.parameters, width: 1536 } },
      { active: true, tier: 3 },
    ),
  ).toMatchObject({ free: false });
  const medium = {
    ...request,
    model: 'nai-diffusion-5-full-medium-inpainting',
    parameters: { ...request.parameters, steps: 14 },
  };
  expect(estimateImageOperation(medium, null).anlas).toBe(18);
});

it('composites only feathered pixels, preserves source text chunks and full dimensions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'inpaint-composite-'));
  try {
    const [source] = await createWorkbenchFixtures(directory, {
      sizes: [[1024, 1024]],
      prompts: ['synthetic original'],
    });
    const rect = { x: 128, y: 128, width: 768, height: 768 };
    const mask = await maskPng(768, 768);
    const generated = await sharp({
      create: { width: 1024, height: 1024, channels: 4, background: '#ee5533' },
    })
      .png()
      .toBuffer();
    const operation = { rect, generated: { width: 1024, height: 1024 } };
    const result = await compositeInpaint(source, generated, operation, mask);
    const before = await sharp(source).ensureAlpha().raw().toBuffer();
    const after = await sharp(result).ensureAlpha().raw().toBuffer();
    expect(await sharp(result).metadata()).toMatchObject({ width: 1024, height: 1024 });
    for (let y = 0; y < 1024; y++)
      for (let x = 0; x < 1024; x++) {
        if (x >= 240 && x < 784 && y >= 240 && y < 784) continue;
        const i = (y * 1024 + x) * 4;
        if (!after.subarray(i, i + 4).equals(before.subarray(i, i + 4)))
          throw new Error(`outside changed at ${x},${y}`);
      }
    expect(after.subarray((512 * 1024 + 512) * 4, (512 * 1024 + 512) * 4 + 4)).toEqual(
      Buffer.from([238, 85, 51, 255]),
    );
    const textChunks = (bytes) => {
      const list = [];
      for (let i = 8; i + 12 <= bytes.length; ) {
        const length = bytes.readUInt32BE(i);
        if (['tEXt', 'zTXt', 'iTXt'].includes(bytes.toString('ascii', i + 4, i + 8)))
          list.push(bytes.subarray(i, i + length + 12));
        i += length + 12;
      }
      return list;
    };
    expect(textChunks(result)).toEqual(textChunks(await fs.readFile(source)));
    await expect(compositeInpaint(source, Buffer.from('not png'), operation, mask)).rejects.toThrow(
      '不是 PNG',
    );
    await expect(
      compositeInpaint(
        source,
        generated,
        { ...operation, generated: { width: 512, height: 512 } },
        mask,
      ),
    ).rejects.toThrow('尺寸');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
