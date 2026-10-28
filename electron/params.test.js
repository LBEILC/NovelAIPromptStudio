import { validSettingsPatch } from './commands/parameterValidation.js';
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { MODEL_CAPS } from '../src/shared/params.ts';
import { createPromptStructure } from '../src/lib/promptStructure.js';
import { hydrateParameters, gridCell, gridCenter } from './params.js';
import { buildProjectRequest } from './parameterRequest.js';
import { createVibeLibrary, preciseImage } from './vibeLibrary.js';
import { estimateGeneration, createNovelAIClient } from './generation.js';
import { createEmbeddedVibeDocument } from './vibes.js';
import { startFakeNovelAI } from './fixtures/novelAIService.js';
import { versionSignature } from './versions.js';

export function fixture(model = 'nai-diffusion-4-5-full', raw = {}) {
  const parsed = {
    model_name: model,
    prompt: 'synthetic shape',
    uc: 'synthetic defect',
    width: 832,
    height: 1216,
    ...raw,
  };
  const metadata = {
    model,
    prompt_raw: parsed.prompt,
    negative_prompt: parsed.uc,
    width: 832,
    height: 1216,
    extra_json: JSON.stringify({ parsed }),
  };
  return hydrateParameters({
    id: 'synthetic',
    name: 'Synthetic',
    metadata,
    tags: [],
    prompt_structure: createPromptStructure(metadata),
  });
}
const blankLibrary = { resolve: async (r) => ({ encoding: r.encoding }) };
describe('parameter metadata and request contracts', () => {
  it('omits null original options from requests and kept labels while retaining metadata', async () => {
    const p = fixture('nai-diffusion-5-full', {
      tag_hint_transparent_background: null,
      straight_alpha: null,
      skip_cfg_above_sigma: null,
      legacy_v3_extend: false,
    });
    const before = structuredClone(p);
    expect(p.keptParameters).toEqual([['legacy_v3_extend', 'false']]);
    const { request, project } = await buildProjectRequest(p, blankLibrary);
    for (const key of ['tag_hint_transparent_background', 'straight_alpha', 'skip_cfg_above_sigma'])
      expect(request.parameters).not.toHaveProperty(key);
    expect(Object.values(request.parameters)).not.toContain(null);
    expect(project.metadata).toEqual(before.metadata);
    expect(p).toEqual(before);
  });
  it('replaces automatic text only at complete boundaries and preserves unknown UC hints', async () => {
    const p = fixture('nai-diffusion-4-full', { qualityToggle: true, ucPreset: 0 });
    const baseline = (await buildProjectRequest(p, blankLibrary)).request;
    const imported = fixture('nai-diffusion-4-full', {
      prompt: baseline.input,
      uc: baseline.parameters.negative_prompt,
      qualityToggle: true,
      ucPreset: 0,
    });
    imported.params.quality = 'None';
    imported.params.uc = 'None';
    const removed = (await buildProjectRequest(imported, blankLibrary)).request;
    expect(removed.input).toBe('synthetic shape');
    expect(removed.parameters.negative_prompt).toBe('synthetic defect');
    const again = structuredClone(imported);
    again.params.model = 'nai-diffusion-5-full';
    const switched = (await buildProjectRequest(again, blankLibrary)).request;
    again.metadata.extra_json = JSON.stringify({
      parsed: { ...switched.parameters, model_name: switched.model },
    });
    expect(
      (await buildProjectRequest(again, blankLibrary)).request.parameters.negative_prompt,
    ).toBe(switched.parameters.negative_prompt);
    const middle = fixture('nai-diffusion-4-full', {
      uc: `custom before, ${baseline.parameters.negative_prompt}, custom after`,
      ucPreset: 0,
    });
    middle.params.uc = 'None';
    expect(
      (await buildProjectRequest(middle, blankLibrary)).request.parameters.negative_prompt,
    ).toBe(middle.metadata.negative_prompt);
    const unknown = fixture('nai-diffusion-5-full', { tag_hint_uc_preset: 1, ucPreset: 0 });
    expect(unknown.params.uc).toBe('None');
    expect(
      (await buildProjectRequest(unknown, blankLibrary)).request.parameters.tag_hint_uc_preset,
    ).toBe(1);
  });
  it('preserves imported V4 encodings and rejects missing encodings without silently dropping references', async () => {
    const db = new DatabaseSync(':memory:');
    try {
      const library = createVibeLibrary(db);
      const p = fixture('nai-diffusion-4-full', {
        reference_image_multiple: ['synthetic encoding'],
        reference_strength_multiple: [0.6],
      });
      expect(
        (await buildProjectRequest(p, library)).request.parameters.reference_image_multiple,
      ).toEqual(['synthetic encoding']);
      const missing = fixture('nai-diffusion-4-full', { reference_strength_multiple: [0.6] });
      expect(missing.references.vibes).toHaveLength(1);
      await expect(buildProjectRequest(missing, library)).rejects.toThrow('没有适用于');
    } finally {
      db.close();
    }
  });
  for (const model of Object.keys(MODEL_CAPS))
    it(`restores and builds ${model}`, async () => {
      const p = fixture(model, {
        steps: 23,
        scale: 6,
        cfg_rescale: 0.4,
        sampler: 'k_dpmpp_2m',
        noise_schedule: 'exponential',
        qualityToggle: true,
        ucPreset: 0,
        skip_cfg_above_sigma: 12,
        image: 'must-not-forward',
      });
      expect(p.params).toMatchObject({
        model,
        steps: 23,
        scale: 6,
        quality: 'Standard',
        uc: 'Heavy',
        rescale: 0.4,
      });
      expect(p.keptParameters).toContainEqual(['skip_cfg_above_sigma', '12']);
      const { request } = await buildProjectRequest(p, blankLibrary, { seed: 123 });
      expect(request.model).toBe(model);
      expect(request.parameters).toMatchObject({
        steps: 23,
        scale: 6,
        cfg_rescale: 0.4,
        seed: 123,
        tag_hint_qt: 1,
        tag_hint_uc_preset: 2,
      });
      expect(request.input).toContain(model.endsWith('4-full') ? 'best quality' : 'very aesthetic');
      expect(request.parameters.negative_prompt).toContain('worst quality');
      expect(request.parameters.v4_prompt.caption.base_caption).toBe(request.input);
      expect(request.parameters).not.toHaveProperty('image');
      if (model.startsWith('nai-diffusion-5-')) {
        expect(request.parameters).not.toHaveProperty('skip_cfg_above_sigma');
        expect(request.parameters.noise_schedule).toBe('karras');
      } else expect(request.parameters.noise_schedule).toBe('exponential');
    });
  it('distinguishes every legacy index from global hints', () => {
    for (const [model, caps] of Object.entries(MODEL_CAPS)) {
      caps.ucPresets.forEach((uc, index) =>
        expect(fixture(model, { ucPreset: index }).params.uc).toBe(uc),
      );
      for (const [hint, uc] of [
        [0, 'None'],
        [2, 'Heavy'],
        [3, 'Light'],
        [4, 'Human Focus'],
        [5, 'Furry Focus'],
      ]) {
        if (caps.ucPresets.includes(uc))
          expect(fixture(model, { tag_hint_uc_preset: hint, ucPreset: 0 }).params.uc).toBe(uc);
      }
    }
    expect(fixture('nai-diffusion-5-full', { tag_hint_qt: 3 }).params.quality).toBe('Light');
    expect(
      fixture('nai-diffusion-5-full', { tag_hint_qt: 0, qualityToggle: true }).params.quality,
    ).toBe('None');
    expect(fixture('nai-diffusion-4-5-full', { qualityToggle: true }).params.quality).toBe(
      'Standard',
    );
    const unknown = fixture('not-a-known-model', { tag_hint_uc_preset: 1 });
    expect(unknown.params.model).toBe('nai-diffusion-5-full');
    expect(unknown.keptParameters).toContainEqual(['model', 'not-a-known-model']);
    expect(unknown.keptParameters).toContainEqual(['tag_hint_uc_preset', '1']);
  });
  for (const hash of ['93F4BD30', '70AB5786'])
    it(`enforces Medium from ${hash}`, async () => {
      const p = fixture(`NovelAI Diffusion V5 ${hash}`, {
        steps: 50,
        sampler: 'k_euler',
        cfg_rescale: 0.8,
        ucPreset: 4,
        v4_negative_prompt: {
          caption: {
            char_captions: [
              { char_caption: 'custom character negative', centers: [{ x: 0.5, y: 0.5 }] },
            ],
          },
        },
        v4_prompt: {
          caption: {
            base_caption: 'shape',
            char_captions: [{ char_caption: 'robot', centers: [{ x: 0.5, y: 0.5 }] }],
          },
        },
      });
      expect(p.params).toMatchObject({
        model: 'nai-diffusion-5-full',
        effort: 'Medium',
        steps: 14,
        sampler: 'k_euler_ancestral',
        uc: 'Heavy',
        rescale: null,
      });
      const { request } = await buildProjectRequest(p, blankLibrary);
      expect(request.model).toBe('nai-diffusion-5-full-medium');
      expect(request.parameters).not.toHaveProperty('cfg_rescale');
      expect(request.parameters.negative_prompt).not.toContain('synthetic defect');
      expect(
        request.parameters.v4_negative_prompt.caption.char_captions.every(
          (c) => c.char_caption === '',
        ),
      ).toBe(true);
    });
  it('rounds coordinates, preserves unknown extraction and restores precise arrays', () => {
    expect(gridCell({ x: 0, y: 1 })).toBe('A5');
    expect(gridCell({ x: 0.31, y: 0.68 })).toBe('B4');
    expect(gridCenter('E1')).toEqual({ x: 0.9, y: 0.1 });
    const p = fixture(undefined, {
      reference_image_multiple: ['encoding'],
      director_reference_images: ['image'],
      director_reference_secondary_strength_values: [0.25],
    });
    expect(p.references.vibes[0]).toMatchObject({
      thumbnail: null,
      information: null,
      encode: null,
    });
    expect(p.references.precise[0].fidelity).toBe(0.75);
    expect(fixture().params.steps).toBe(23);
  });
  it('rejects unknown fields and invalid numbers at the command schema boundary', () => {
    for (const patch of [
      { steps: 0 },
      { steps: 2.5 },
      { scale: Infinity },
      { rescale: -1 },
      { noise: 'native' },
      { positions: { a: 'F9' } },
      { apiKey: 'x' },
      { model: '__proto__' },
    ])
      expect(validSettingsPatch(patch)).toBe(false);
    expect(validSettingsPatch({ positions: { character: 'B3' }, scale: 0 })).toBe(true);
  });
  it('uses V4 encoding keys without mislabelling them as V4.5', () => {
    const d = createEmbeddedVibeDocument({
      model: 'nai-diffusion-4-full',
      encoding: 'x'.repeat(200),
    });
    expect(Object.keys(d.encodings)).toEqual(['v4full']);
  });
  it('preserves coordinate flags and counts parameter/reference changes as new versions', async () => {
    const p = fixture(undefined, {
      v4_prompt: {
        use_coords: true,
        caption: {
          base_caption: 'shape',
          char_captions: [{ char_caption: 'robot', centers: [{ x: 0.31, y: 0.68 }] }],
        },
      },
    });
    const { request } = await buildProjectRequest(p, blankLibrary);
    expect(request.parameters.v4_prompt.use_coords).toBe(true);
    expect(request.parameters.v4_prompt.caption.char_captions[0].centers[0].x).toBeCloseTo(0.3);
    const next = structuredClone(p);
    next.params.steps++;
    expect(versionSignature(next)).not.toBe(versionSignature(p));
    next.params.steps--;
    next.references.vibes.push({
      id: 'v',
      encoding: 'synthetic',
      strength: 0.6,
      information: null,
    });
    expect(versionSignature(next)).not.toBe(versionSignature(p));
  });
});

describe('reference encoding and pricing', () => {
  it('rebuilds every Vibe array from the draft instead of reusing the source image', async () => {
    const db = new DatabaseSync(':memory:'),
      library = createVibeLibrary(db);
    try {
      const p = fixture('nai-diffusion-4-5-full', {
        reference_image_multiple: ['synthetic-encoding-a', 'synthetic-encoding-b'],
        reference_strength_multiple: [0.6, 0.4],
        reference_information_extracted_multiple: [1, 0.8],
      });
      expect(p.references.vibes).toHaveLength(2);
      p.references.vibes.pop();
      const one = (await buildProjectRequest(p, library)).request.parameters;
      expect(one.reference_image_multiple).toHaveLength(1);
      expect(one.reference_strength_multiple).toEqual([0.6]);
      expect(one.reference_information_extracted_multiple).toEqual([1]);
      p.references.vibes = [];
      const none = (await buildProjectRequest(p, library)).request.parameters;
      for (const key of [
        'reference_image_multiple',
        'reference_strength_multiple',
        'reference_information_extracted_multiple',
      ])
        expect(none).not.toHaveProperty(key);
    } finally {
      db.close();
    }
  });
  it('caches real binary responses by content, model and extraction, including after reopen', async () => {
    const db = new DatabaseSync(':memory:'),
      library = createVibeLibrary(db),
      service = await startFakeNovelAI();
    const client = createNovelAIClient({ token: () => 'acceptance-token', baseUrl: service.url });
    try {
      const thumbnail = `data:image/png;base64,${(
        await sharp({ create: { width: 32, height: 48, channels: 3, background: '#ff0000' } })
          .png()
          .toBuffer()
      ).toString('base64')}`;
      const p = fixture();
      p.references.vibes = [
        {
          id: 'v',
          name: 'Synthetic',
          thumbnail,
          file: null,
          strength: 0.6,
          information: 0.7,
          encode: 'new',
        },
      ];
      const before = await buildProjectRequest(p, library);
      expect(before.pendingEncodes).toBe(1);
      expect(service.state.encodes).toHaveLength(0);
      const first = await buildProjectRequest(p, library, { encode: client.encodeVibe });
      expect(service.state.encodes).toHaveLength(1);
      expect(first.request.parameters.reference_strength_multiple).toEqual([0.6]);
      // NovelAI 要求三个数组一样长，编码好的也带信息提取
      expect(first.request.parameters.reference_information_extracted_multiple).toEqual([0.7]);
      expect(library.list()).toHaveLength(1);
      await buildProjectRequest(p, createVibeLibrary(db), { encode: client.encodeVibe });
      expect(service.state.encodes).toHaveLength(1);
      p.references.vibes[0].information = 0.5;
      p.references.vibes[0].encode = 'changed';
      await buildProjectRequest(p, library, { encode: client.encodeVibe });
      p.references.vibes[0].information = 0.7;
      await buildProjectRequest(p, library, { encode: client.encodeVibe });
      expect(service.state.encodes).toHaveLength(2);
      p.params.model = 'nai-diffusion-4-5-curated';
      await buildProjectRequest(p, library, { encode: client.encodeVibe });
      expect(service.state.encodes).toHaveLength(3);
      expect(library.list()[0].models).toHaveLength(2);
    } finally {
      await service.close();
      db.close();
    }
  });
  it('preprocesses precise references with black borders and sends fidelity inversely', async () => {
    const thumbnail = `data:image/png;base64,${(
      await sharp({ create: { width: 100, height: 40, channels: 3, background: '#ff0000' } })
        .png()
        .toBuffer()
    ).toString('base64')}`;
    const output = Buffer.from(await preciseImage(thumbnail), 'base64'),
      metadata = await sharp(output).metadata();
    expect([metadata.width, metadata.height]).toEqual([1536, 1024]);
    const { data } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)]).toEqual([0, 0, 0]);
    const p = fixture();
    p.references.precise = [{ id: 'r', thumbnail, type: 'style', strength: 0.8, fidelity: 0.75 }];
    const { request } = await buildProjectRequest(p, blankLibrary);
    expect(request.parameters.director_reference_secondary_strength_values).toEqual([0.25]);
    expect(request.parameters.director_reference_information_extracted).toEqual([1]);
    expect(request.parameters.director_reference_descriptions[0].caption.base_caption).toBe(
      'style',
    );
    expect(estimateGeneration(request, { active: true, tier: 3 }, 2).parts).toEqual({
      base: 34,
      precise: 10,
      encode: 0,
      vibeExtra: 0,
    });
    p.references.vibes.push({});
    await expect(buildProjectRequest(p, blankLibrary)).rejects.toThrow('不能同时');
  });
  for (const [model, steps, price] of [
    ['nai-diffusion-4-5-full', 23, 17],
    ['nai-diffusion-5-full', 23, 26],
    ['nai-diffusion-4-5-full', 28, 20],
    ['nai-diffusion-5-full', 28, 30],
    ['nai-diffusion-5-full-medium', 14, 17],
  ])
    it(`prices ${model}/${steps}`, () => {
      expect(
        estimateGeneration({ model, parameters: { width: 832, height: 1216, steps } }, null).anlas,
      ).toBe(price);
    });
  it('charges encoding once and excess Vibes per image', () => {
    const request = {
      model: 'nai-diffusion-4-5-full',
      parameters: {
        width: 832,
        height: 1216,
        steps: 23,
        reference_image_multiple: [1, 2, 3, 4, 5],
      },
    };
    expect(estimateGeneration(request, { active: true, tier: 3 }, 3, 2)).toMatchObject({
      anlas: 10,
      parts: { base: 0, encode: 4, vibeExtra: 6, precise: 0 },
    });
  });
});

it('rejects information-only embedded Vibes instead of silently dropping them', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await expect(
      buildProjectRequest(
        fixture('nai-diffusion-4-5-full', { reference_information_extracted_multiple: [1] }),
        createVibeLibrary(db),
      ),
    ).rejects.toThrow();
  } finally {
    db.close();
  }
});
