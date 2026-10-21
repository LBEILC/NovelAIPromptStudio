import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createCommands } from './index.js';
import { openDatabase } from '../database.js';
import { openPreferences } from '../preferences.js';
import { createBlankProject, readWorkbenchImage } from '../workbench.js';
import { startFakeNovelAI } from '../fixtures/novelAIService.js';
import { MODEL_ORDER } from '../../src/shared/params.ts';

async function fixture(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-blank-branches-'));
  const database = await openDatabase(directory);
  const service = await startFakeNovelAI();
  const preferences = openPreferences(directory, {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  });
  let imported = 0;
  const events = [];
  const services = {
    directory,
    database,
    preferences,
    version: 'test',
    busy: () => false,
    generationBaseUrl: service.url,
    readImage: readWorkbenchImage,
    readSource: ({ path: file }) => readWorkbenchImage(file),
    importImage: async (source) => {
      const file = path.join(directory, `synthetic-${++imported}.png`);
      await fs.copyFile(source, file);
      const image = await readWorkbenchImage(file);
      database.insertProject(image);
      return image;
    },
    emit: (event) => events.push(event),
  };
  let commands = await createCommands(services);
  const dispatch = (...args) => commands.dispatch(...args);
  const call = async (name, input = {}, source = 'agent') => {
    const result = await dispatch(name, input, source);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data;
  };
  const waitJob = async (id) => {
    await expect
      .poll(async () => (await call('generate.status', { id })).jobs[0].state)
      .toMatch(/^(completed|failed)$/);
    const job = (await call('generate.status', { id })).jobs[0];
    expect(job.error || job.state).toBe('completed');
    return job;
  };
  const append = (workId, parentId, name) => {
    const project = createBlankProject({ name, width: 64, height: 64 });
    delete project.blank;
    project.id = `synthetic-${name}`;
    project.image_path = path.join(directory, `${project.id}.png`);
    database.insertProject(project);
    return database.versions.append({
      workId,
      parentId,
      project,
      source: 'agent',
      image: project,
      seed: 1,
    });
  };
  try {
    await run({
      directory,
      database,
      preferences,
      service,
      call,
      dispatch,
      waitJob,
      append,
      events,
      restart: async () => {
        await commands.close();
        commands = await createCommands(services);
      },
    });
  } finally {
    service.state.resume?.();
    await commands.close();
    await service.close();
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

it('creates token-free blank defaults, validates overrides and settings, and cleans a closed start', () =>
  fixture(async ({ call, dispatch, preferences, database, restart }) => {
    const first = await call('workbench.new', {}, 'ui');
    expect(first.tab.project).toMatchObject({
      blank: true,
      paramsSource: 'defaults',
      image_path: '',
      thumbnail_path: '',
      metadata: { width: 832, height: 1216, seed: '', prompt_raw: '', negative_prompt: '' },
      params: {
        model: 'nai-diffusion-5-full',
        steps: 28,
        scale: 5,
        effort: 'High',
        quality: 'Standard',
        uc: 'Heavy',
        noise: null,
      },
      references: { vibes: [], precise: [] },
      keptParameters: [],
    });
    expect((await dispatch('generate.queue', { tabId: first.tab.id, count: 1 })).ok).toBe(false);
    expect(preferences.generationSettings().blankModel).toBe('last');
    await call('workbench.close', { tabId: first.tab.id });
    expect(database.versions.work(first.tab.workId)).toBeUndefined();
    await restart();
    expect((await call('workbench.list')).tabs).toEqual([]);
    expect(await database.loadLibraryCards()).toEqual([]);
  }));

it('supports all fixed models, validates input, restores blank sessions and preserves agent focus', () =>
  fixture(async ({ call, dispatch, preferences, database, restart }) => {
    const active = (await call('workbench.new', {}, 'ui')).tab.id;
    for (const model of MODEL_ORDER) {
      await call('settings.generation.save', { blankModel: model }, 'ui');
      const next = await call('workbench.new', {});
      expect(next.tab.project.params.model).toBe(model);
      expect(next.tab.project.params.steps).toBe(28);
      expect(next.tab.project.params.noise).toBe(
        model.startsWith('nai-diffusion-5-') ? null : 'karras',
      );
      expect(next.tab.project.paramsSource).toBe('defaults');
      expect((await call('workbench.list')).activeTabId).toBe(active);
      await call('workbench.close', { tabId: next.tab.id });
      expect(database.versions.work(next.tab.workId)).toBeUndefined();
    }
    expect(preferences.generationSettings().blankModel).toBe(MODEL_ORDER.at(-1));
    expect(
      (await dispatch('settings.generation.save', { blankModel: 'invalid' }, 'ui')).error.code,
    ).toBe('invalid_input');
    expect(() => preferences.saveGenerationSettings({ blankModel: 'invalid' })).toThrow();
    for (const params of [{ steps: 0 }, { model: 'invalid' }, { scale: 11 }, { invented: true }])
      expect((await dispatch('workbench.new', { params })).error.code).toBe('invalid_input');
    expect((await dispatch('workbench.new', { width: -1 })).error.code).toBe('invalid_input');
    const next = await call('workbench.new', {
      width: 1000,
      height: 512,
      name: 'Synthetic blank',
      params: { model: 'nai-diffusion-5-full', effort: 'Medium', steps: 50 },
    });
    expect(next.tab.project.params.steps).toBe(14);
    expect(next.tab.project.metadata.width).toBe(1024);
    expect(next.tab.project.prompt_structure.characters).toEqual([]);
    await restart();
    expect((await call('workbench.get', { tabId: next.tab.id })).tab.project).toEqual(
      next.tab.project,
    );
    expect((await call('account.get', {}, 'ui')).settings.blankModel).toBe(MODEL_ORDER.at(-1));
    expect(await database.loadLibraryCards()).toEqual([]);
  }));

it('generates version one from an empty start and inherits the latest generated parameters across works', () =>
  fixture(async ({ call, dispatch, database, service, waitJob, append }) => {
    const first = await call('workbench.new', { width: 64, height: 128 });
    const tabId = first.tab.id;
    const root = (await call('version.list', { tabId })).versions[0];
    expect(root).toMatchObject({ number: 0, isStart: true, images: [] });
    expect((await dispatch('generate.queue', { tabId, count: 1 })).ok).toBe(false);
    expect(await database.loadLibraryCards()).toEqual([]);
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    await call('prompt.set', { tabId, scope: 'base:prompt', text: 'synthetic clouds' });
    await call('params.set', { tabId, patch: { steps: 31, scale: 4 } });
    const job = await call('generate.queue', { tabId, count: 1 }, 'ui');
    await waitJob(job.id);
    const tree = (await call('version.list', { tabId })).versions;
    expect(tree.map((v) => v.number)).toEqual([0, 1]);
    expect(tree[1].images).toHaveLength(1);
    expect((await database.loadLibraryCards())[0].generated_work_id).toBe(first.tab.workId);
    expect((await call('workbench.get', { tabId })).tab.project.blank).toBeUndefined();
    expect(service.state.requests[0]).toMatchObject({
      parameters: { width: 64, height: 128, steps: 31, scale: 4 },
    });
    const inherited = (await call('workbench.new')).tab.project;
    expect(inherited).toMatchObject({
      paramsSource: 'last',
      metadata: { width: 64, height: 128, prompt_raw: '', seed: '' },
      params: { steps: 31, scale: 4, positions: {} },
    });
    const second = await call('workbench.new');
    append(second.tab.workId, second.tab.versionId, 'other-work');
    expect((await call('workbench.new')).tab.project.metadata).toMatchObject({
      width: 64,
      height: 64,
    });
    await call('settings.generation.save', { blankModel: 'nai-diffusion-4-full' }, 'ui');
    expect((await call('workbench.new')).tab.project).toMatchObject({
      paramsSource: 'defaults',
      metadata: { width: 832, height: 1216 },
      params: { steps: 28, scale: 5, model: 'nai-diffusion-4-full' },
    });
  }));

it('deletes a nested subtree, cancels pending Agent jobs, preserves drafts, and durably restores names and numbers', () =>
  fixture(async ({ call, dispatch, database, append, restart }) => {
    const first = await call('workbench.new');
    const { workId, versionId: rootId, id: tabId } = first.tab;
    append(workId, rootId, 'main');
    const branch = append(workId, rootId, 'branch');
    const child = append(workId, branch.id, 'child');
    const nested = append(workId, branch.id, 'nested');
    await call('branch.rename', { branchId: branch.branchId, name: 'Synthetic branch' });
    await call('branch.rename', { branchId: nested.branchId, name: 'Synthetic nested' });
    await call('version.open', { tabId, versionId: nested.id });
    await call('prompt.set', { tabId, scope: 'base:prompt', text: 'uncommitted synthetic draft' });
    const before = await call('workbench.get', { tabId });
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    const pending = await call('generate.queue', { tabId, count: 1 });
    expect(pending.state).toBe('pending');
    expect((await dispatch('branch.delete', { branchId: rootId })).error.code).toBe(
      'invalid_input',
    );
    const confirm = await dispatch('branch.delete', { branchId: branch.branchId });
    expect(confirm.error).toMatchObject({
      code: 'needs_confirm',
      details: { branches: 2, versions: 3, images: 3 },
    });
    expect(database.versions.list(workId)).toHaveLength(5);
    const removed = await call('branch.delete', { branchId: branch.branchId, confirmed: true });
    expect(removed).toMatchObject({ branches: 2, versions: 3, images: 3, cancelledJobs: 1 });
    expect((await call('generate.status', { id: pending.id })).jobs[0].state).toBe('canceled');
    const after = await call('workbench.get', { tabId });
    expect(after.tab.versionId).toBe(rootId);
    expect(after.tab.project).toEqual(before.tab.project);
    expect(after.revision).toBe(before.revision + 1);
    expect(database.versions.get(nested.id)).toBeUndefined();
    expect((await database.loadLibraryCards('trash')).length).toBe(3);
    await restart();
    await call('branch.restore', { undo: removed.undo });
    expect(database.versions.get(branch.id)).toMatchObject({
      branchName: 'Synthetic branch',
      number: branch.number,
    });
    expect(database.versions.get(nested.id)).toMatchObject({
      branchName: 'Synthetic nested',
      branchNumber: nested.branchNumber,
    });
    expect(database.versions.get(child.id).images[0].deleted).toBe(false);
    expect((await database.loadLibraryCards('trash')).length).toBe(0);
    expect((await dispatch('library.permanent-delete', { ids: ['synthetic'] })).error.code).toBe(
      'forbidden',
    );
  }));

it('restores image ancestry, purges empty deleted ancestors and never reuses branch numbers', () =>
  fixture(async ({ directory, call, dispatch, database, append, restart }) => {
    const { tab } = await call('workbench.new');
    append(tab.workId, tab.versionId, 'main');
    const branch = append(tab.workId, tab.versionId, 'branch');
    const leaf = append(tab.workId, branch.id, 'leaf');
    const removed = await call('branch.delete', { branchId: branch.branchId });
    expect(removed).toMatchObject({ branches: 1, versions: 2, images: 2 });
    database.updateProjects([leaf.images[0].projectId], { deleted: false });
    expect(database.versions.get(leaf.id)).toBeDefined();
    expect(database.versions.get(branch.id)).toBeDefined();
    expect(database.versions.get(branch.id).images[0].deleted).toBe(true);
    const again = await call('branch.delete', { branchId: branch.branchId });
    database.deleteProject(leaf.images[0].projectId);
    expect(database.versions.list(tab.workId)).toHaveLength(2);
    database.deleteProject(branch.images[0].projectId);
    const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'), { readOnly: true });
    try {
      expect(
        raw.prepare('SELECT id FROM work_versions WHERE id IN (?,?)').all(branch.id, leaf.id),
      ).toEqual([]);
      expect(raw.prepare('SELECT version_id FROM deleted_versions').all()).toEqual([]);
    } finally {
      raw.close();
    }
    expect((await dispatch('branch.restore', { undo: again.undo })).ok).toBe(false);
    await restart();
    const fresh = append(tab.workId, tab.versionId, 'fresh');
    expect(fresh.branchNumber).toBeGreaterThan(branch.branchNumber);
    expect(fresh.number).toBeGreaterThan(leaf.number);
  }));

it('refuses deletion while generation is active anywhere in the subtree', () =>
  fixture(async ({ call, dispatch, database, append, service, waitJob }) => {
    const { tab } = await call('workbench.new', { width: 64, height: 64 });
    append(tab.workId, tab.versionId, 'main');
    const branch = append(tab.workId, tab.versionId, 'branch');
    await call('version.open', { tabId: tab.id, versionId: branch.id });
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    service.state.holdAt = 1;
    const job = await call('generate.queue', { tabId: tab.id, count: 1 }, 'ui');
    await expect.poll(() => typeof service.state.resume).toBe('function');
    expect(
      (await dispatch('branch.delete', { branchId: branch.branchId, confirmed: true })).error.code,
    ).toBe('branch_generating');
    expect(database.versions.get(branch.id)).toBeDefined();
    service.state.resume();
    await waitJob(job.id);
  }));

it('preserves shared images in surviving branches and purges a deleted version only after its last image', () =>
  fixture(async ({ directory, call, database, append }) => {
    const { tab } = await call('workbench.new');
    const main = append(tab.workId, tab.versionId, 'main');
    const shared = database.versions.append({
      workId: tab.workId,
      parentId: tab.versionId,
      project: main.project,
      source: 'agent',
      image: database.loadProject(main.images[0].projectId),
      seed: 1,
    });
    const deletedShared = await call('branch.delete', { branchId: shared.branchId });
    expect(deletedShared.images).toBe(0);
    expect(database.loadProject(main.images[0].projectId).deleted_at).toBe('');
    expect((await database.loadLibraryCards())[0].version_number).toBe(main.number);
    await call('branch.restore', { undo: deletedShared.undo });
    const other = append(tab.workId, shared.id, 'other');
    database.versions.append({
      workId: tab.workId,
      parentId: shared.id,
      project: other.project,
      source: 'agent',
      image: database.loadProject(main.images[0].projectId),
      seed: 1,
      versionId: other.id,
    });
    await call('branch.delete', { branchId: shared.branchId });
    database.deleteProject(other.images[0].projectId);
    const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'), { readOnly: true });
    try {
      expect(raw.prepare('SELECT id FROM work_versions WHERE id=?').get(other.id)).toBeDefined();
      // The shared image keeps all remaining associations alive until it is actually purged.
      database.updateProjects([main.images[0].projectId], { deleted: true });
      database.deleteProject(main.images[0].projectId);
      expect(raw.prepare('SELECT id FROM work_versions WHERE id=?').get(other.id)).toBeUndefined();
      expect(raw.prepare('SELECT id FROM work_versions WHERE id=?').get(shared.id)).toBeUndefined();
    } finally {
      raw.close();
    }
  }));
