import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, expect, it, vi } from 'vitest';
import { readWorkbenchImage, createBlankProject } from './workbench.js';
import { hydrateParameters, normalizeSettings } from './params.js';
import { buildProjectRequest } from './parameterRequest.js';
import { MODEL_CAPS, NEW_WORK_DEFAULTS } from '../src/shared/params.ts';
import { createNovelAIClient } from './generation.js';
import { openDatabase } from './database.js';
import { createCommands } from './commands/index.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-parameter-recovery-'));
afterAll(async () => {
  // libvips can retain an open WebP source in its operation cache on Windows.
  sharp.cache(false);
  await fs.promises.rm(directory, { recursive: true, force: true });
});
const model = 'nai-diffusion-5-full';
for (const format of ['png', 'jpeg', 'webp'])
  it(`imports metadata-free ${format} with blank-work defaults and numeric requests`, async () => {
    const file = path.join(directory, `synthetic.${format}`);
    await sharp({ create: { width: 128, height: 128, channels: 3, background: '#226a83' } })
      [format]()
      .toFile(file);
    const project = await readWorkbenchImage(file);
    expect(project.params).toMatchObject(NEW_WORK_DEFAULTS);
    const { request } = await buildProjectRequest(project, {});
    expect(request.parameters).toMatchObject({ steps: 28, scale: 5 });
    const png = await sharp(fs.readFileSync(file)).png().toBuffer();
    const fetchImpl = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      expect(typeof body.parameters.steps).toBe('number');
      expect(typeof body.parameters.scale).toBe('number');
      return new Response(
        `event: final\ndata: ${JSON.stringify({ image: png.toString('base64') })}\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      );
    });
    expect(
      await createNovelAIClient({ token: () => 'synthetic', fetchImpl }).generate(request),
    ).toEqual(png);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

for (const key of ['steps', 'scale']) {
  for (const invalid of [
    '',
    '  ',
    '28',
    null,
    undefined,
    NaN,
    Infinity,
    -1,
    51,
    ...(key === 'steps' ? [1.5] : [11]),
  ]) {
    it(`repairs ${key}=${String(invalid)} without implicit string conversion`, () => {
      expect(normalizeSettings({ ...createBlankProject().params, [key]: invalid })[key]).toBe(
        MODEL_CAPS[model].defaults[key],
      );
    });
  }
}
it('preserves zero, numeric boundaries, explicit None and Medium constraints', () => {
  for (const steps of [1, 50])
    expect(
      normalizeSettings({ model, steps, scale: 0, quality: 'None', uc: 'None' }),
    ).toMatchObject({ steps, scale: 0, quality: 'None', uc: 'None' });
  expect(normalizeSettings({ model, effort: 'Medium', steps: '', scale: 0 })).toMatchObject({
    steps: 14,
    scale: 0,
    sampler: 'k_euler_ancestral',
    uc: 'Heavy',
    rescale: null,
  });
  expect(normalizeSettings({ model: 'unknown', steps: '' }).model).toBe(model);
  expect(hydrateParameters({ params: { model: 'unknown', steps: '' } }).params.steps).toBe(23);
});

it('repairs the final selected saved object and falls through invalid candidates to valid metadata', () => {
  for (const embedded of [false, true]) {
    const project = createBlankProject();
    project.metadata.steps = 30;
    project.metadata.guidance = 0;
    project.metadata.extra_json = JSON.stringify({
      parsed: { steps: '', scale: '', tag_hint_qt: 0, tag_hint_uc_preset: 0 },
      ...(embedded
        ? { studio_generation: { params: { model: 'unknown', steps: '', scale: '' } } }
        : {}),
    });
    if (embedded) delete project.params;
    else project.params = { model: 'unknown', steps: '', scale: '' };
    expect(hydrateParameters(project).params).toMatchObject({
      model,
      steps: 30,
      scale: 0,
      quality: 'None',
      uc: 'None',
    });
  }
});

it('rejects corrupt outgoing parameters before token access, encoding or a paid request', async () => {
  const token = vi.fn(() => 'synthetic'),
    fetchImpl = vi.fn();
  const client = createNovelAIClient({ token, fetchImpl });
  for (const parameters of [
    { steps: '', scale: 5 },
    { steps: 28, scale: '' },
    { steps: 1.5, scale: 0 },
    { steps: 28, scale: Infinity },
  ])
    await expect(client.generate({ model, parameters })).rejects.toMatchObject({
      code: 'invalid_input',
      details: { machineCode: 'invalid_generation_parameters' },
    });
  expect(token).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('repairs and persists old session parameters across reopening and version recovery', async () => {
  const root = path.join(directory, 'session');
  fs.mkdirSync(root);
  const project = createBlankProject();
  project.params.steps = '';
  project.params.scale = '';
  const tab = {
    id: 'synthetic-tab',
    source: { type: 'file', path: '' },
    project,
    originalProject: project,
    revision: 0,
  };
  fs.writeFileSync(
    path.join(root, 'workbench-session.json'),
    JSON.stringify({
      version: 3,
      revision: 1,
      migrated: true,
      session: { version: 2, tabs: [tab], activeTabId: tab.id },
    }),
  );
  for (let pass = 0; pass < 2; pass++) {
    const database = await openDatabase(root);
    const commands = await createCommands({
      directory: root,
      database,
      version: 'test',
      busy: () => false,
      readSource: async () => project,
      readImage: async () => project,
      importImage: async () => project,
    });
    try {
      const recovered = commands.store.get().tabs[0];
      expect(recovered.project.params).toMatchObject({ steps: 28, scale: 5 });
      expect(recovered.originalProject.params).toMatchObject({ steps: 28, scale: 5 });
      const version = database.versions.ensure('synthetic-work', project);
      expect(database.versions.get(version.id).project.params).toMatchObject({
        steps: 28,
        scale: 5,
      });
    } finally {
      await commands.close();
      database.close();
    }
  }
});
