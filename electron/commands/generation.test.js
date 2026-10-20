import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCommands } from './index.js';
import { openDatabase } from '../database.js';
import { openPreferences } from '../preferences.js';
import { startFakeNovelAI } from '../fixtures/novelAIService.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';
import { parsePrompt } from '../../src/lib/prompt.js';

it('runs generation through the command boundary with agent confirmation and version persistence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-generation-commands-'));
  const database = await openDatabase(root),
    service = await startFakeNovelAI();
  const preferences = openPreferences(root, {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  });
  const raw = {
    model_name: 'nai-diffusion-5-full',
    prompt: 'rain, cloud',
    uc: 'lowres',
    steps: 28,
    width: 832,
    height: 1216,
    sampler: 'k_euler_ancestral',
    scale: 5,
  };
  const metadata = {
    prompt_raw: raw.prompt,
    negative_prompt: raw.uc,
    model: raw.model_name,
    width: 832,
    height: 1216,
    steps: 28,
    seed: '1',
    sampler: raw.sampler,
    guidance: 5,
    extra_json: JSON.stringify({ parsed: raw }),
  };
  const project = {
    id: 'synthetic',
    name: 'Synthetic',
    image_path: '/synthetic.png',
    thumbnail_path: '',
    metadata,
    tags: parsePrompt(raw.prompt),
    prompt_structure: createPromptStructure(metadata),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  let count = 0;
  let finish;
  const completed = new Promise((resolve) => {
    finish = resolve;
  });
  const commands = await createCommands({
    directory: root,
    version: 'test',
    database,
    preferences,
    generationBaseUrl: service.url,
    busy: () => false,
    emit: (event) => {
      if (event.type === 'generation') {
        const job = event.data.jobs.find((item) => ['completed', 'failed'].includes(item.state));
        if (job) finish(job);
      }
    },
    readImage: async () => project,
    readSource: async () => project,
    importImage: async (file) => {
      const image = {
        ...project,
        id: `image-${++count}`,
        image_path: file,
        tags: parsePrompt(raw.prompt),
        prompt_structure: createPromptStructure(metadata),
      };
      database.insertProject(image);
      return image;
    },
  });
  const call = async (name, input = {}, source = 'agent') => {
    const r = await commands.dispatch(name, input, source);
    if (!r.ok) throw Error(r.error.message);
    return r.data;
  };
  try {
    await expect(call('account.save', { token: 'wrong' }, 'ui')).rejects.toThrow('保存失败');
    expect(preferences.generationSettings().hasToken).toBe(false);
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    const opened = await call('workbench.open', { path: '/synthetic.png' }),
      tabId = opened.tab.id;
    await Promise.all([
      call('version.list', { tabId }, 'ui'),
      call('version.list', { tabId }, 'ui'),
      call('prompt.set', { tabId, scope: 'base:prompt', text: 'rain, snow' }, 'ui'),
    ]);
    expect((await call('workbench.get', { tabId })).tab.project.metadata.prompt_raw).toBe(
      'rain, snow',
    );
    const pending = await call('generate.start', { tabId, count: 2 });
    expect(pending.state).toBe('pending');
    expect(service.state.requests).toHaveLength(0);
    for (const name of [
      'generate.confirm',
      'generate.cancel',
      'generate.stop',
      'account.get',
      'settings.generation.save',
    ])
      expect((await commands.dispatch(name, {}, 'agent')).error.code).toBe('forbidden');
    await call('generate.confirm', { ids: [pending.id] }, 'ui');
    // Await the real queue completion event, not a one-second polling budget.
    const finished = await completed;
    expect(finished.error || finished.state).toBe('completed');
    expect((await call('generate.status', { id: pending.id })).jobs[0].state).toBe('completed');
    expect(service.state.requests).toHaveLength(2);
    expect(service.state.maxActive).toBe(1);
    const tree = await call('version.list', { tabId });
    expect(tree.versions).toHaveLength(2);
    expect(tree.versions[1].source).toBe('agent');
    expect(tree.versions[1].images).toHaveLength(2);
    expect((await call('workbench.get', { tabId })).tab.project.image_path).toBe('/synthetic.png');
    await call(
      'settings.generation.save',
      { agentMode: 'direct', limitEnabled: true, dailyLimit: 0 },
      'ui',
    );
    service.state.tier = 0;
    await call('account.refresh', {}, 'ui');
    const capped = await call('generate.start', { tabId, count: 1 });
    expect(capped.state).toBe('pending');
  } finally {
    commands.close();
    await service.close();
    database.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
