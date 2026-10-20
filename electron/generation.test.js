import { describe, expect, it } from 'vitest';
import {
  buildGenerationRequest,
  estimateGeneration,
  generationModel,
  generationUnavailable,
  createNovelAIClient,
} from './generation.js';
import { createGenerationQueue } from './generationQueue.js';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readNovelAIMetadata } from './metadata.js';
const raw = {
  prompt: 'rain, 1.3::cloud::',
  uc: 'lowres',
  width: 832,
  height: 1216,
  steps: 28,
  scale: 5,
  sampler: 'k_euler_ancestral',
  cfg_rescale: 0.3,
  tag_hint_qt: 1,
  tag_hint_uc_preset: 2,
  v4_prompt: {
    caption: {
      base_caption: 'rain, 1.3::cloud::',
      char_captions: [{ char_caption: 'robot', centers: [{ x: 0.3, y: 0.7 }] }],
    },
    use_coords: true,
    use_order: true,
  },
  v4_negative_prompt: {
    caption: {
      base_caption: 'lowres',
      char_captions: [{ char_caption: 'blurry', centers: [{ x: 0.3, y: 0.7 }] }],
    },
    legacy_uc: false,
  },
  model_hash: 'synthetic',
  internal_unknown: 12,
};
const model = 'nai-diffusion-5-full';
const subscription = { active: true, tier: 3, usage: { isNegative: false } };
describe('generation request contract', () => {
  it('preserves every supported repository demo image request field without edits', async () => {
    const root = new URL('../demo/images/final/', import.meta.url);
    let count = 0;
    for (const name of await readdir(root)) {
      if (!name.endsWith('.png')) continue;
      const metadata = await readNovelAIMetadata(fileURLToPath(new URL(name, root))),
        raw = JSON.parse(metadata.extra_json).parsed;
      const model =
        generationModel(raw.model_name) ||
        generationModel(raw.model) ||
        generationModel(metadata.model);
      if (!model || generationUnavailable(raw, model)) continue;
      const request = buildGenerationRequest(raw, model);
      count++;
      for (const key of [
        'prompt',
        'steps',
        'scale',
        'sampler',
        'v4_prompt',
        'v4_negative_prompt',
        'reference_image_multiple',
        'reference_strength_multiple',
        'reference_information_extracted_multiple',
      ])
        if (raw[key] !== undefined) expect(request.parameters[key]).toEqual(raw[key]);
      expect(request.parameters.negative_prompt).toBe(
        raw.uc ?? raw.negative_prompt ?? raw.v4_negative_prompt?.caption?.base_caption ?? '',
      );
    }
    expect(count).toBeGreaterThan(0);
  });
  it('expands V5 presets in both captions and request text while retaining coordinates and hints', () => {
    const r = buildGenerationRequest(raw, model);
    for (const k of [
      'width',
      'height',
      'steps',
      'scale',
      'sampler',
      'cfg_rescale',
      'tag_hint_qt',
      'tag_hint_uc_preset',
    ])
      expect(r.parameters[k]).toEqual(raw[k]);
    expect(r.input).toBe(`${raw.prompt}, very aesthetic, masterpiece, no text`);
    expect(r.parameters.prompt).toBe(r.input);
    expect(r.parameters.negative_prompt).toBe(
      'nsfw, lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, lowres',
    );
    expect(r.parameters.v4_prompt).toEqual({
      ...raw.v4_prompt,
      caption: { ...raw.v4_prompt.caption, base_caption: r.input },
    });
    expect(r.parameters.v4_negative_prompt).toEqual({
      ...raw.v4_negative_prompt,
      caption: { ...raw.v4_negative_prompt.caption, base_caption: r.parameters.negative_prompt },
    });
    expect(r.parameters).not.toHaveProperty('model_hash');
    expect(r.parameters).not.toHaveProperty('internal_unknown');
    expect(r.parameters.n_samples).toBe(1);
    expect(raw.v4_prompt.caption.base_caption).toBe(raw.prompt);
  });
  it('does not duplicate already expanded V5 presets on successive generations', () => {
    const first = buildGenerationRequest(raw, model, { seed: 123 });
    const again = buildGenerationRequest(
      { ...first.parameters, uc: first.parameters.negative_prompt },
      model,
      { seed: 123 },
    );
    expect(again).toEqual(first);
  });
  it('keeps None, Curated and explicit nsfw conditioning distinct', () => {
    const none = buildGenerationRequest({ ...raw, tag_hint_qt: 0, tag_hint_uc_preset: 0 }, model);
    expect(none.input).toBe(raw.prompt);
    expect(none.parameters.negative_prompt).toBe(raw.uc);
    for (const [variant, prompt] of [
      ['nai-diffusion-5-curated', 'synthetic landscape'],
      [model, 'nsfw, synthetic subject'],
    ]) {
      const result = buildGenerationRequest({ ...raw, prompt, tag_hint_qt: 3 }, variant);
      expect(result.input).toBe(`${prompt}, very aesthetic, amazing quality, no text`);
      expect(result.parameters.negative_prompt.startsWith('nsfw, ')).toBe(false);
    }
  });
  it('inserts quality before V5 Text content and leaves edited character captions intact', () => {
    const edited = {
      caption: {
        base_caption: 'stale base',
        char_captions: [{ char_caption: 'synthetic character', centers: [{ x: 0.6, y: 0.2 }] }],
      },
      use_coords: true,
    };
    const result = buildGenerationRequest(raw, model, {
      prompt: 'synthetic sign, Text: line one\n\nline two',
      v4_prompt: edited,
    });
    expect(result.input).toBe(
      'synthetic sign, very aesthetic, masterpiece, no text, Text: line one\n\nline two',
    );
    expect(result.parameters.v4_prompt.caption.char_captions).toEqual(edited.caption.char_captions);
    expect(result.parameters.v4_prompt.caption.base_caption).toBe(result.input);
    expect(edited.caption.base_caption).toBe('stale base');
  });
  it('preserves V4.5 Vibe encodings and their settings byte for byte', () => {
    const vibe = {
      ...raw,
      reference_image_multiple: ['c3ludGhldGlj'],
      reference_strength_multiple: [0.2],
      reference_information_extracted_multiple: [0.7],
    };
    const r = buildGenerationRequest(vibe, 'nai-diffusion-4-5-full');
    for (const k of [
      'reference_image_multiple',
      'reference_strength_multiple',
      'reference_information_extracted_multiple',
    ])
      expect(r.parameters[k]).toEqual(vibe[k]);
    expect(r.parameters).not.toHaveProperty('tag_hint_qt');
    expect(
      generationUnavailable({ ...vibe, reference_image_multiple: [] }, 'nai-diffusion-4-5-full'),
    ).toContain('编码没有');
  });
  it('rejects precise references and unknown models', () => {
    expect(() =>
      buildGenerationRequest({ ...raw, director_reference_strengths: [1] }, model),
    ).toThrow('带参考图');
    expect(generationModel('unrecognized')).toBeNull();
    expect(generationModel('NovelAI Diffusion V4.5 Full')).toBe('nai-diffusion-4-5-full');
  });
  it('matches the observed V5 price and free-area, step and subscription boundaries', () => {
    const r = buildGenerationRequest(raw, model);
    expect(estimateGeneration(r, { active: false, tier: 0 }).anlas).toBe(30);
    expect(estimateGeneration(r, subscription, 9).anlas).toBe(0);
    for (const [w, h, steps, free] of [
      [1024, 1024, 28, true],
      [1024, 1088, 28, false],
      [832, 1216, 29, false],
    ]) {
      expect(
        estimateGeneration(
          buildGenerationRequest({ ...raw, width: w, height: h, steps }, model),
          subscription,
        ).free,
      ).toBe(free);
    }
    expect(estimateGeneration(r, { ...subscription, tier: 2 }).free).toBe(false);
    expect(estimateGeneration(r, { ...subscription, usage: { isNegative: true } }).free).toBe(
      false,
    );
  });
  it('does not leak an HTTP error body or automatically retry', async () => {
    let calls = 0;
    const client = createNovelAIClient({
      token: () => 'synthetic-secret',
      fetchImpl: async () => {
        calls++;
        return new Response('synthetic-secret', { status: 500 });
      },
    });
    await expect(client.generate(buildGenerationRequest(raw, model))).rejects.toThrow(
      'NovelAI 服务繁忙',
    );
    expect(calls).toBe(1);
  });
});
const until = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 1));
  }
  throw new Error('queue did not settle');
};
describe('application-wide generation worker', () => {
  it('checks the cap before each image and awaits persistence on shutdown', async () => {
    let calls = 0,
      release;
    const q = createGenerationQueue({
      generate: async () => {
        calls++;
        return Buffer.alloc(0);
      },
      accept: async () => `image-${calls}`,
      balance: async () => 100,
      beforeEach: (job) => job.confirmed || calls < 1,
    });
    const j = q.start({ count: 3, request: buildGenerationRequest(raw, model) });
    await until(() => q.status(j.id).state === 'pending');
    expect(calls).toBe(1);
    q.confirm([j.id]);
    await until(() => q.status(j.id).state === 'completed');
    expect(calls).toBe(3);
    const r = createGenerationQueue({
      generate: async () => Buffer.alloc(0),
      accept: async () => {
        await new Promise((resolve) => {
          release = resolve;
        });
        return 'saved';
      },
      balance: async () => 100,
    });
    const k = r.start({ count: 2, request: buildGenerationRequest(raw, model) });
    await until(() => release);
    let closed = false;
    const stopping = r.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await stopping;
    expect(r.status(k.id).images).toEqual(['saved']);
    expect(r.status(k.id).state).toBe('canceled');
  });
  it('reports streamed steps and preserves the final PNG without another request', async () => {
    const png = Buffer.from('89504e470d0a1a0a010203', 'hex');
    let calls = 0;
    const progress = [];
    const client = createNovelAIClient({
      token: () => 'synthetic',
      fetchImpl: async () => {
        calls++;
        return new Response(
          `event: intermediate\ndata: {"step_ix":14}\n\nevent: final\ndata: {"image":"${png.toString('base64')}"}\n\n`,
          { headers: { 'content-type': 'text/event-stream' } },
        );
      },
    });
    expect(
      await client.generate(buildGenerationRequest(raw, model), (p) => progress.push(p)),
    ).toEqual(png);
    expect(progress).toEqual([0.5, 1]);
    expect(calls).toBe(1);
  });
  it('serializes jobs and leaves pending agent work unsent', async () => {
    let active = 0,
      max = 0,
      calls = 0;
    const q = createGenerationQueue({
      generate: async () => {
        calls++;
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 1));
        active--;
        return Buffer.alloc(0);
      },
      accept: async () => `image-${calls}`,
      balance: async () => 100,
    });
    const pending = q.start({
      count: 2,
      pending: true,
      request: buildGenerationRequest(raw, model),
    });
    const a = q.start({ count: 3, request: buildGenerationRequest(raw, model) });
    const b = q.start({ count: 2, request: buildGenerationRequest(raw, model) });
    await until(() => q.status(b.id).state === 'completed');
    expect(max).toBe(1);
    expect(calls).toBe(5);
    expect(q.status(a.id).images).toHaveLength(3);
    expect(q.status(pending.id).state).toBe('pending');
    q.close();
    expect(q.status(pending.id).state).toBe('canceled');
  });
  it('stop finishes only the current image; a failure waits for a one-image retry', async () => {
    let release,
      calls = 0;
    const q = createGenerationQueue({
      generate: async () => {
        calls++;
        await new Promise((r) => {
          release = r;
        });
        return Buffer.alloc(0);
      },
      accept: async () => `image-${calls}`,
      balance: async () => 100,
    });
    const a = q.start({ count: 10, request: buildGenerationRequest(raw, model) });
    await until(() => release);
    q.stop(a.id);
    release();
    await until(() => q.status(a.id).state === 'canceled');
    expect(calls).toBe(1);
    expect(q.status(a.id).images).toHaveLength(1);
    let fail = true,
      n = 0;
    const r = createGenerationQueue({
      generate: async () => {
        n++;
        if (fail) throw new Error('NovelAI 服务繁忙');
        return Buffer.alloc(0);
      },
      accept: async () => 'result',
      balance: async () => 100,
    });
    const b = r.start({ count: 20, request: buildGenerationRequest(raw, model) });
    await until(() => r.status(b.id).state === 'failed');
    expect(n).toBe(1);
    fail = false;
    r.retry(b.id);
    await until(() => r.status(b.id).state === 'completed');
    expect(n).toBe(2);
    expect(r.status(b.id).images).toEqual(['result']);
  });
});
