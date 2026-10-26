import { it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createGenerationStorage, publicGenerationJob, recentJobs } from './generationStorage.js';
import { createGenerationQueue } from './generationQueue.js';
import { createBlankProject } from './workbench.js';
import { buildProjectRequest } from './parameterRequest.js';
import { buildImageOperation } from './imageOperations.js';
import { buildOutpaint, outpaintSteps } from './outpaint.js';
import { validateCommand } from './commands/registry.js';

async function temporary(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'generation-storage-'));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
const image = `data:image/png;base64,${'YWJj'.repeat(4096)}`;
const job = (id, state = 'pending') => ({
  id: String(id),
  state,
  count: 1,
  completed: 0,
  images: [],
  spent: 0,
  createdAt: new Date(id * 1000).toISOString(),
  request: { parameters: { seed: 123, image, future_image: image } },
  project: {
    metadata: { prompt_raw: 'synthetic test' },
    references: { precise: [{ thumbnail: image }] },
  },
});

it('deduplicates snapshots, strips request/public payloads, hydrates and collects only unreferenced assets', async () =>
  temporary(async (directory) => {
    const storage = createGenerationStorage(directory);
    const jobs = Array.from({ length: 50 }, (_, i) => job(i));
    jobs[0].inpaintMask = image;
    jobs[0].project.references.vibes = [{ encoding: image }];
    jobs[0].project.metadata.extra_json = JSON.stringify({ future: image });
    const compact = await storage.write(jobs);
    expect(await fs.readdir(path.join(directory, 'generation-assets'))).toHaveLength(1);
    const text = await fs.readFile(path.join(directory, 'generation-queue.json'), 'utf8');
    expect(text).not.toContain('data:');
    expect(text).not.toContain('YWJj'.repeat(300));
    expect(compact[0].request.parameters).toEqual({
      seed: 123,
      image: undefined,
      future_image: undefined,
    });
    const restored = await createGenerationStorage(directory).load();
    const hydrated = await storage.hydrate(restored[0]);
    expect(hydrated.project).toEqual(jobs[0].project);
    expect(hydrated.inpaintMask).toBe(image);
    expect(JSON.stringify(publicGenerationJob(jobs[0]))).not.toContain('data:');
    await storage.write([restored[0]]);
    expect(await fs.readdir(path.join(directory, 'generation-assets'))).toHaveLength(1);
    await storage.write([]);
    expect(await fs.readdir(path.join(directory, 'generation-assets'))).toHaveLength(0);
  }));

it('keeps 100 terminal records by finish time and every active job, and validates status limits', () => {
  const jobs = Array.from({ length: 115 }, (_, i) => ({
    ...job(i, ['completed', 'failed', 'canceled', 'stopped'][i % 4]),
    finishedAt: new Date(i * 1000).toISOString(),
  }));
  jobs.push(job(200, 'queued'), job(201, 'generating'), job(202));
  jobs[0].finishedAt = new Date(999000).toISOString();
  const q = createGenerationQueue({ initial: jobs });
  expect(q.status()).toHaveLength(103);
  expect(q.status().some((j) => j.id === '0')).toBe(true);
  expect(q.status(undefined, 20)).toHaveLength(23);
  expect(q.status('202').state).toBe('pending');
  for (const limit of [0, -1, 101, 1.5, '20'])
    expect(() => validateCommand('generate.status', { limit }, 'agent')).toThrow();
  expect(validateCommand('generate.status', { limit: 100 }, 'agent')).toBe('generate.status');
  expect(recentJobs(jobs, 1).filter((j) => j.state === 'completed')).toHaveLength(1);
});

it('coalesces durable changes, never persists streamed progress, and flushes the final state', async () =>
  temporary(async (directory) => {
    const storage = createGenerationStorage(directory, { delay: 10000 });
    const persist = vi.fn(storage.schedule);
    let release, progress;
    const q = createGenerationQueue({
      persist,
      balance: async () => 100,
      generate: async (_request, onProgress) => {
        progress = onProgress;
        await new Promise((r) => {
          release = r;
        });
        return Buffer.alloc(0);
      },
      accept: async () => 'image-id',
    });
    const started = q.start({ ...job(1), fixedSeed: true });
    await vi.waitFor(() => expect(progress).toBeTypeOf('function'));
    const calls = persist.mock.calls.length;
    for (let i = 0; i < 100; i++) progress(i / 100);
    expect(persist).toHaveBeenCalledTimes(calls);
    await expect(fs.stat(path.join(directory, 'generation-queue.json'))).rejects.toThrow();
    release();
    await vi.waitFor(() => expect(q.status(started.id).state).toBe('completed'));
    await q.close();
    await storage.flush();
    const saved = JSON.parse(
      await fs.readFile(path.join(directory, 'generation-queue.json'), 'utf8'),
    );
    expect(saved[0]).toMatchObject({ state: 'completed', completed: 1, images: ['image-id'] });
    expect(saved[0].finishedAt).toBeTruthy();
  }));

it('prunes on completion while retaining active work, result IDs and the shared asset still in use', async () =>
  temporary(async (directory) => {
    const storage = createGenerationStorage(directory, { delay: 10000 });
    const history = Array.from({ length: 100 }, (_, i) => ({
      ...job(i, 'completed'),
      finishedAt: new Date(i * 1000).toISOString(),
    }));
    history[0].project.references.precise[0].thumbnail = `data:image/png;base64,${'CCCC'.repeat(4096)}`;
    await storage.write(history);
    const q = createGenerationQueue({
      initial: history,
      persist: storage.schedule,
      balance: async () => 100,
      generate: async () => Buffer.alloc(0),
      accept: async () => 'new-image',
    });
    const pending = q.start({ ...job(101), pending: true });
    const completed = q.start(job(102));
    await vi.waitFor(() => expect(q.status(completed.id).state).toBe('completed'));
    expect(q.status()).toHaveLength(101);
    expect(q.status(pending.id).state).toBe('pending');
    expect(q.status(completed.id).images).toEqual(['new-image']);
    expect(() => q.status('0')).toThrow('生成任务不存在');
    await storage.flush();
    expect(await fs.readdir(path.join(directory, 'generation-assets'))).toHaveLength(1);
    await q.close();
    await storage.flush();
  }));

it('migrates legacy records on startup and preserves corrupt queues instead of silently deleting them', async () =>
  temporary(async (directory) => {
    const file = path.join(directory, 'generation-queue.json');
    const old = Array.from({ length: 114 }, (_, i) => job(i, 'completed'));
    old[0].project.references.precise[0].thumbnail = `data:image/png;base64,${'BBBB'.repeat(4096)}`;
    old.push(job(200, 'queued'), job(201, 'generating'));
    await fs.writeFile(file, JSON.stringify(old));
    const restored = await createGenerationStorage(directory).load();
    expect(restored).toHaveLength(102);
    expect(restored.find((j) => j.id === '200').state).toBe('queued');
    expect(restored.find((j) => j.id === '201').state).toBe('pending');
    expect((await fs.stat(file)).size).toBeLessThan(100000);
    expect(await fs.readdir(path.join(directory, 'generation-assets'))).toHaveLength(1);
    await fs.writeFile(file, '{broken');
    const log = vi.fn();
    expect(await createGenerationStorage(directory, { log }).load()).toEqual([]);
    const broken = (await fs.readdir(directory)).find((f) =>
      f.startsWith('generation-queue.broken-'),
    );
    expect(await fs.readFile(path.join(directory, broken), 'utf8')).toBe('{broken');
    expect(log).toHaveBeenCalledOnce();
  }));

it(
  'rebuilds identical seeded requests after restart for generation, precise, Vibe, img2img, upscale, enhance, inpaint and outpaint',
  async () =>
    temporary(async (directory) => {
      const png = await sharp({
        create: { width: 512, height: 512, channels: 4, background: '#456789' },
      })
        .png()
        .toBuffer();
      const file = path.join(directory, 'synthetic.png');
      await fs.writeFile(file, png);
      const thumbnail = `data:image/png;base64,${png.toString('base64')}`;
      const mask = (
        await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffffff' } })
          .png()
          .toBuffer()
      ).toString('base64');
      const draft = () => createBlankProject({ params: { model: 'nai-diffusion-4-5-full' } });
      const library = { resolve: async (ref) => ({ encoding: ref.encoding }) };
      const seed = 123;
      const cases = [
        'generate',
        'precise',
        'vibe',
        'img2img',
        'upscale',
        'enhance',
        'inpaint',
        'outpaint',
      ];
      const jobs = cases.map((operation, i) => {
        const project = draft();
        if (operation === 'precise')
          project.references.precise = [{ thumbnail, type: 'character', strength: 1, fidelity: 1 }];
        if (operation === 'vibe')
          project.references.vibes = [
            { encoding: 'YWJj'.repeat(4096), strength: 0.6, information: 1 },
          ];
        if (operation === 'img2img')
          project.references.base = { path: file, strength: 0.5, noise: 0 };
        return {
          ...job(i, 'queued'),
          operation,
          project,
          operationPath: file,
          inpaintMask: mask,
          operationDetails: {
            kind: operation,
            scale: 1.5,
            magnitude: 2,
            rect: { x: 0, y: 0, width: 512, height: 512 },
            strength: 1,
            fullSize: true,
          },
        };
      });
      const build = async (j) => {
        const options = { seed: j.request.parameters.seed, mask: j.inpaintMask };
        if (['upscale', 'enhance', 'inpaint'].includes(j.operation))
          return (
            await buildImageOperation(
              j.project,
              j.operationPath,
              j.operationDetails,
              library,
              options,
            )
          ).request;
        if (j.operation === 'outpaint') {
          const size = { width: 512, height: 512 },
            edges = { left: 64, right: 0, top: 0, bottom: 0 };
          return (
            await buildOutpaint(
              j.project,
              await fs.readFile(j.operationPath),
              size,
              edges,
              outpaintSteps(size, edges, 'whole', true)[0],
              library,
              options,
            )
          ).request;
        }
        return (await buildProjectRequest(j.project, library, options)).request;
      };
      const requests = await Promise.all(jobs.map(build));
      jobs.forEach((j, i) => {
        j.request = requests[i];
        j.request.parameters.seed ??= seed;
        j.fixedSeed = true;
      });
      const storage = createGenerationStorage(directory);
      await storage.write(jobs);
      const restored = await createGenerationStorage(directory).load();
      for (let i = 0; i < restored.length; i++) {
        const hydrated = await storage.hydrate(restored[i]);
        const request = await build(hydrated);
        request.parameters.seed ??= seed;
        expect(request, cases[i]).toEqual(requests[i]);
      }
      const sent = [];
      let finish;
      const completed = new Promise((resolve) => {
        finish = resolve;
      });
      const queue = createGenerationQueue({
        changed: (states) => {
          if (
            states.length === jobs.length &&
            states.every((j) => ['completed', 'failed', 'canceled'].includes(j.state))
          )
            finish(states);
        },
        prepare: async (j) => {
          Object.assign(j, await storage.hydrate(j));
          j.request = await build(j);
          j.request.parameters.seed ??= seed;
        },
        balance: async () => 0,
        generate: async (request) => {
          sent.push(request);
          return Buffer.alloc(0);
        },
        accept: async () => 'synthetic-result',
      });
      queue.restore(restored);
      const states = await completed;
      expect(states.map((j) => j.error || j.state)).toEqual(jobs.map(() => 'completed'));
      expect(sent).toEqual(requests);
      await queue.close();
    }),
  20000,
);
