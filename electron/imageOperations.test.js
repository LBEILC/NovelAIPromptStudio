import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  buildImageOperation,
  estimateImageOperation,
  ENHANCE_MAGNITUDES,
  enhanceScales,
  maxEnhanceResultSize,
  maxEnhanceTargetSize,
  upscalePrice,
  applyEnhancePromptAdd,
} from './imageOperations.js';
import { createBlankProject } from './workbench.js';
import { createNovelAIClient } from './generation.js';

it('matches measured prices, allowed scales, magnitudes and separate Max sizes', () => {
  expect(maxEnhanceTargetSize(832, 1216)).toEqual({ width: 1440, height: 2144 });
  expect(maxEnhanceResultSize(832, 1216)).toEqual({ width: 1467, height: 2144 });
  expect(enhanceScales(832, 1216, 'nai-diffusion-5-full')).toEqual([1, 1.5, 'max']);
  expect(enhanceScales(512, 512, 'nai-diffusion-5-full')).toEqual([1, 1.5, 2, 'max']);
  expect(enhanceScales(832, 1216, 'nai-diffusion-4-5-full')).toEqual([1, 1.5]);
  expect(ENHANCE_MAGNITUDES).toEqual([
    { strength: 0.2, noise: 0 },
    { strength: 0.4, noise: 0 },
    { strength: 0.5, noise: 0 },
    { strength: 0.6, noise: 0 },
    { strength: 0.7, noise: 0.1 },
  ]);
  expect(
    [1048576, 1048577, 1747627, 1747628, 2446678, 2446679, 3145728].map((area) =>
      upscalePrice(area, 1),
    ),
  ).toEqual([1, 2, 2, 3, 3, 4, 4]);
  expect(() => upscalePrice(3145729, 1)).toThrow('图片太大');
  const request = {
    action: 'img2img',
    model: 'nai-diffusion-5-full',
    parameters: { width: 832, height: 1216, steps: 23, strength: 0.4, upscaled_enhance: true },
  };
  expect(estimateImageOperation(request, null).anlas).toBe(30);
  expect(
    estimateImageOperation(
      {
        ...request,
        parameters: { ...request.parameters, width: 1280, height: 1856, upscaled_enhance: false },
      },
      null,
    ).anlas,
  ).toBe(24);
  expect(
    estimateImageOperation(
      { action: 'upscale', parameters: { width: 832, height: 1216 } },
      { active: true, tier: 3 },
    ),
  ).toMatchObject({ anlas: 1, free: false });
});

it('adds the enhance fragment before text markers exactly once', () => {
  expect(applyEnhancePromptAdd('synthetic')).toBe('synthetic, -2::upscaled, blurry::,');
  expect(applyEnhancePromptAdd('synthetic, text: hello')).toBe(
    'synthetic,, -2::upscaled, blurry::, text: hello',
  );
  expect(applyEnhancePromptAdd('upscaled, blurry')).toBe('upscaled, blurry');
});

it('builds operation requests from snapshots without mutating them and sends only upscale API fields', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'image-ops-'));
  try {
    const file = path.join(directory, 'synthetic.png');
    await sharp({ create: { width: 832, height: 1216, channels: 4, background: '#335577' } })
      .png()
      .toFile(file);
    const project = createBlankProject({ params: { model: 'nai-diffusion-5-full', steps: 23 } });
    const original = structuredClone(project);
    const normal = await buildImageOperation(
      project,
      file,
      { kind: 'enhance', scale: 1.5, magnitude: 2 },
      {},
      { seed: 123 },
    );
    expect(normal.request).toMatchObject({
      action: 'img2img',
      parameters: {
        width: 1280,
        height: 1856,
        seed: 123,
        extra_noise_seed: 122,
        strength: 0.4,
        noise: 0,
      },
    });
    expect(normal.request.parameters).not.toHaveProperty('upscaled_enhance');
    expect(normal.request.input).toContain('-2::upscaled, blurry::');
    const max = await buildImageOperation(
      project,
      file,
      { kind: 'enhance', scale: 'max', magnitude: 5 },
      {},
      { seed: 456 },
    );
    expect(max.request.parameters).toMatchObject({
      width: 832,
      height: 1216,
      seed: 456,
      extra_noise_seed: 455,
      strength: 0.7,
      noise: 0.1,
      upscaled_enhance: true,
    });
    expect(max.request.input).not.toContain('upscaled, blurry');
    expect(project).toEqual(original);
    const upscale = await buildImageOperation(project, file, { kind: 'upscale' }, {});
    let sent;
    const client = createNovelAIClient({
      token: () => 'synthetic-token',
      fetchImpl: async (url, options) => {
        sent = { url: String(url), body: JSON.parse(options.body) };
        return new Response('bad zip');
      },
    });
    await expect(client.upscale(upscale.request)).rejects.toThrow();
    expect(sent.url).toContain('/ai/upscale');
    expect(Object.keys(sent.body).sort()).toEqual(['declared_blur_sigma', 'image', 'model']);
    expect(sent.body).toMatchObject({ model: 'nai-diffusion-5-curated', declared_blur_sigma: 0 });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
