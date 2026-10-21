import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createCommands } from './index.js';
import { openDatabase } from '../database.js';
import { openPreferences } from '../preferences.js';
import { readWorkbenchImage } from '../workbench.js';
import { startFakeNovelAI } from '../fixtures/novelAIService.js';
import { createPromptStructure } from '../../src/lib/promptStructure.js';

it('edits parameters and references through Agent commands, with revision, undo, model constraints and durable cache', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-params-'));
  const database = await openDatabase(directory),
    service = await startFakeNovelAI();
  const file = path.join(directory, 'synthetic.png');
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#335577' } })
    .png()
    .toFile(file);
  const metadata = {
    model: 'nai-diffusion-5-full',
    width: 832,
    height: 1216,
    prompt_raw: 'synthetic shape',
    negative_prompt: 'synthetic defect',
    extra_json: '{}',
  };
  const project = {
    id: 'synthetic',
    image_path: file,
    thumbnail_path: file,
    name: 'Synthetic',
    tags: [],
    metadata,
    prompt_structure: createPromptStructure(metadata),
  };
  const preferences = openPreferences(directory, {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  });
  const events = [],
    finishes = new Map();
  let onFinished;
  let imported = 0;
  const commands = await createCommands({
    directory,
    database,
    preferences,
    generationBaseUrl: service.url,
    version: 'test',
    busy: () => false,
    readImage: async () => project,
    readSource: async () => project,
    importImage: async (source) => {
      const image = await readWorkbenchImage(source);
      image.id = `generated-${++imported}`;
      database.insertProject(image);
      return image;
    },
    emit: (event) => {
      events.push(event);
      if (event.type === 'generation')
        for (const job of event.data.jobs)
          if (['completed', 'failed'].includes(job.state)) {
            finishes.set(job.id, job);
            onFinished?.();
          }
    },
  });
  const call = async (name, input = {}, source = 'agent') => {
    const result = await commands.dispatch(name, input, source);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data;
  };
  const waitJob = async (id) => {
    if (!finishes.has(id))
      await new Promise((resolve) => {
        onFinished = resolve;
      });
    return finishes.get(id);
  };
  try {
    const opened = await call('workbench.open', { path: file }),
      tabId = opened.tab.id;
    expect(opened.tab.project.params.model).toBe('nai-diffusion-5-full');
    const changed = await call('params.set', {
      tabId,
      expectedRevision: opened.revision,
      patch: { effort: 'Medium', steps: 50, sampler: 'k_euler', uc: 'None' },
    });
    expect(changed.tab.project.params).toMatchObject({
      effort: 'Medium',
      steps: 14,
      sampler: 'k_euler_ancestral',
      uc: 'Heavy',
    });
    // Medium 锁住的值界面上显示锁定，不另发通知
    expect(changed.notes).toEqual([]);
    expect((await call('workbench.list')).tabs[0].dirty).toBe(true);
    const undoId = events.findLast((e) => e.undoId).undoId;
    expect(
      (await commands.dispatch('params.set', { tabId, expectedRevision: 0, patch: { steps: 25 } }))
        .error.code,
    ).toBe('conflict');
    await call('workbench.undo', { undoId }, 'ui');
    expect((await call('workbench.get', { tabId })).tab.project.params.effort).toBe('High');
    await call('params.set', { tabId, patch: { quality: 'Light', uc: 'Furry Focus' } });
    const downgraded = await call('params.set', {
      tabId,
      patch: { model: 'nai-diffusion-4-full' },
    });
    expect(downgraded.tab.project.params).toMatchObject({
      quality: 'Standard',
      uc: 'Heavy',
      effort: null,
      noise: 'karras',
    });
    expect(downgraded.notes).toEqual([
      '质量 Tag 改成了 Standard（V4 Full 没有 Light）',
      '负面预设改成了 Heavy（V4 Full 没有 Furry Focus）',
    ]);
    await call('params.set', { tabId, patch: { model: 'nai-diffusion-5-full' } });
    for (let i = 0; i < 7; i++) await call('character.add', { tabId });
    expect(
      (await commands.dispatch('params.set', { tabId, patch: { model: 'nai-diffusion-4-5-full' } }))
        .error.code,
    ).toBe('invalid_input');
    const chars = (await call('workbench.get', { tabId })).tab.project.prompt_structure.characters;
    for (const c of chars) await call('character.remove', { tabId, characterId: c.id });
    await call('params.set', { tabId, patch: { model: 'nai-diffusion-4-5-full' } });
    const added = await call('reference.add-vibe', { tabId, path: file }),
      id = added.tab.project.references.vibes[0].id;
    expect(
      (await commands.dispatch('reference.add-precise', { tabId, path: file })).error.code,
    ).toBe('invalid_input');
    const beforeConfirm = await call('workbench.get', { tabId });
    expect(
      (await commands.dispatch('params.set', { tabId, patch: { model: 'nai-diffusion-5-full' } }))
        .error.code,
    ).toBe('needs_confirm');
    expect((await call('workbench.get', { tabId })).revision).toBe(beforeConfirm.revision);
    expect(
      (await commands.dispatch('reference.set', { tabId, id, strength: 1.1 })).error.code,
    ).toBe('invalid_input');
    expect(
      (await commands.dispatch('params.set', { tabId, patch: { invented: true } })).error.code,
    ).toBe('invalid_input');
    await call('reference.set', { tabId, id, strength: 0.4 });
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    expect((await call('generate.estimate', { tabId, count: 2 })).parts.encode).toBe(2);
    expect(service.state.encodes).toHaveLength(0);
    const pending = await call('generate.start', { tabId, count: 2 });
    expect(pending.state).toBe('pending');
    expect(service.state.encodes).toHaveLength(0);
    await call('generate.confirm', { ids: [pending.id] }, 'ui');
    expect((await waitJob(pending.id)).state).toBe('completed');
    expect(service.state.encodes).toHaveLength(1);
    expect(service.state.requests).toHaveLength(2);
    expect((await call('generate.estimate', { tabId, count: 1 })).parts.encode).toBe(0);
    const versions = (await call('version.list', { tabId })).versions;
    expect(
      versions.every((v) => v.project.params && v.project.references && v.project.keptParameters),
    ).toBe(true);
    const library = (await call('vibe.library')).items;
    expect(library).toHaveLength(1);
    await call('reference.remove', { tabId, id });
    const fromLibrary = await call('reference.add-vibe', { tabId, libraryId: library[0].id });
    expect(fromLibrary.tab.project.references.vibes[0]).toMatchObject({
      libraryId: library[0].id,
      encode: null,
    });
    const dropped = await call('params.set', {
      tabId,
      patch: { model: 'nai-diffusion-5-full' },
      dropReferences: true,
    });
    expect(dropped.tab.project.references).toEqual({ vibes: [], precise: [] });
    database.insertProject({
      ...project,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    database.saveProjectPrompt(project.id, dropped.tab.project);
    expect(database.loadProject(project.id).params).toEqual(dropped.tab.project.params);
    const cachedId = library[0].id;
    await commands.close();
    database.close();
    const reopened = await openDatabase(directory);
    expect(reopened.vibeLibrary.list()[0].id).toBe(cachedId);
    expect(reopened.loadProject(project.id).params.model).toBe('nai-diffusion-5-full');
    reopened.close();
  } finally {
    await commands.close();
    await service.close();
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}, 20000);
