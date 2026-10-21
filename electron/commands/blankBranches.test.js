import '../fixtures/databaseTestBudget.js';
import { it, expect, vi } from 'vitest';
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
import { createWorkbenchFixtures } from '../acceptance/workbenchFixtures.js';

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
  const listeners = new Set();
  const services = {
    directory,
    database,
    preferences,
    version: 'test',
    busy: () => false,
    generationBaseUrl: service.url,
    readImage: readWorkbenchImage,
    readSource: ({ path: file, type, projectId }) =>
      type === 'library' ? database.loadProject(projectId) : readWorkbenchImage(file),
    importImage: async (source) => {
      const file = path.join(directory, `synthetic-${++imported}.png`);
      await fs.copyFile(source, file);
      const image = await readWorkbenchImage(file);
      database.insertProject(image);
      return image;
    },
    emit: (event) => {
      events.push(event);
      for (const listener of listeners) listener(event);
    },
  };
  let commands = await createCommands(services);
  const dispatch = (...args) => commands.dispatch(...args);
  const call = async (name, input = {}, source = 'agent') => {
    const result = await dispatch(name, input, source);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data;
  };
  const waitJob = async (id) => {
    // Subscribe before reading status so completion cannot fall between the read
    // and subscription. The fixture's database budget guards stalled jobs.
    const job = await new Promise((resolve, reject) => {
      const observe = (event) => {
        if (event.type !== 'generation') return;
        const current = event.data.jobs.find((item) => item.id === id);
        if (!current || !['completed', 'failed', 'canceled'].includes(current.state)) return;
        listeners.delete(observe);
        resolve(current);
      };
      listeners.add(observe);
      call('generate.status', { id }).then(
        (data) => observe({ type: 'generation', data }),
        (error) => {
          listeners.delete(observe);
          reject(error);
        },
      );
    });
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
      store: commands.store,
      restart: async () => {
        await commands.close();
        commands = await createCommands(services);
      },
    });
  } finally {
    listeners.clear();
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
    expect(
      (await dispatch('version.delete', { versionId: branch.id, only: true })).error.code,
    ).toBe('branch_generating');
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

it('deletes mainline versions with confirmation, cancels pending jobs and restores their subtree', () =>
  fixture(async ({ call, dispatch, database, append, restart }) => {
    const { tab } = await call('workbench.new');
    const first = append(tab.workId, tab.versionId, 'linear-first');
    const second = append(tab.workId, first.id, 'linear-second');
    expect((await dispatch('version.delete', { versionId: first.id })).error).toMatchObject({
      code: 'needs_confirm',
      details: { versions: 2, branches: 0, images: 2 },
    });
    const fork = append(tab.workId, first.id, 'linear-fork');
    expect((await dispatch('version.delete', { versionId: tab.versionId })).error.code).toBe(
      'invalid_input',
    );
    const origin = database.versions.ensure('synthetic-import', first.project);
    expect((await dispatch('version.delete', { versionId: origin.id })).error.code).toBe(
      'invalid_input',
    );
    const confirm = await dispatch('version.delete', { versionId: first.id });
    expect(confirm.error).toMatchObject({
      code: 'needs_confirm',
      details: { versions: 3, branches: 1, images: 3 },
    });
    await call('version.open', { tabId: tab.id, versionId: second.id });
    await call('prompt.set', {
      tabId: tab.id,
      scope: 'base:prompt',
      text: 'synthetic retained draft',
    });
    const draft = (await call('workbench.get', { tabId: tab.id })).tab.project;
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    const pending = await call('generate.queue', { tabId: tab.id, count: 1 });
    const removed = await call('version.delete', { versionId: first.id, confirmed: true });
    expect(removed).toMatchObject({ versions: 3, branches: 1, images: 3, cancelledJobs: 1 });
    expect((await call('generate.status', { id: pending.id })).jobs[0].state).toBe('canceled');
    expect((await call('workbench.get', { tabId: tab.id })).tab).toMatchObject({
      versionId: tab.versionId,
      project: draft,
    });
    expect(database.versions.list(tab.workId)).toHaveLength(1);
    await restart();
    await call('branch.restore', { undo: removed.undo });
    expect(database.versions.list(tab.workId)).toHaveLength(4);
    expect(database.versions.get(fork.id).branchId).toBe(fork.branchId);
    const single = await call('version.delete', { versionId: second.id });
    expect(single).toMatchObject({ versions: 1, branches: 0, images: 1 });
    expect(database.versions.get(fork.id)).toBeDefined();
    await call('branch.restore', { undo: single.undo });
    expect(database.versions.get(second.id).images[0].deleted).toBe(false);
    expect((await dispatch('trash.delete-permanently', { ids: [] })).error.code).toBe('forbidden');
    expect((await dispatch('library.restore', { ids: [] })).error.code).toBe('forbidden');
  }));

it('rolls image and version deletion back when pruning or session persistence fails', () =>
  fixture(async ({ call, dispatch, database, append, store }) => {
    const { tab } = await call('workbench.new');
    const leaf = append(tab.workId, tab.versionId, 'rollback-leaf');
    const id = leaf.images[0].projectId;
    const prune = vi.spyOn(database.versions, 'pruneImages').mockImplementationOnce(() => {
      throw Error('synthetic database failure');
    });
    try {
      expect((await dispatch('library.trash', { ids: [id] })).ok).toBe(false);
      expect(database.loadProject(id).deleted_at).toBe('');
      expect(database.versions.get(leaf.id)).toBeDefined();
    } finally {
      prune.mockRestore();
    }
    const save = vi.spyOn(store, 'save').mockRejectedValueOnce(Error('synthetic session failure'));
    try {
      expect((await dispatch('library.trash', { ids: [id] })).ok).toBe(false);
      expect(database.loadProject(id).deleted_at).toBe('');
      expect(database.versions.get(leaf.id)).toBeDefined();
    } finally {
      save.mockRestore();
    }
  }));

it('can trash images while an unrelated tab has no version tree yet', () =>
  fixture(async ({ call, database, append, store }) => {
    const { tab } = await call('workbench.new');
    const leaf = append(tab.workId, tab.versionId, 'uninitialized-tab');
    const session = store.get();
    delete session.tabs[0].versionId;
    await store.save(session);
    const result = await call('library.trash', { ids: [leaf.images[0].projectId] });
    expect(result.versions).toHaveLength(1);
    expect(database.versions.get(leaf.id)).toBeUndefined();
    expect(store.get().tabs[0].project).toEqual(tab.project);
  }));

it('refuses version deletion while generating', () =>
  fixture(async ({ call, dispatch, append, service, waitJob }) => {
    const { tab } = await call('workbench.new', { width: 64, height: 64 });
    const first = append(tab.workId, tab.versionId, 'active-linear');
    await call('version.open', { tabId: tab.id, versionId: first.id });
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    service.state.holdAt = 1;
    const job = await call('generate.queue', { tabId: tab.id, count: 1 }, 'ui');
    await expect.poll(() => typeof service.state.resume).toBe('function');
    expect(
      (await dispatch('version.delete', { versionId: first.id, confirmed: true })).error.code,
    ).toBe('branch_generating');
    service.state.resume();
    await waitJob(job.id);
  }));

it('prunes empty leaves and ancestors after image trash, preserves drafts and restores or purges ancestry', () =>
  fixture(async ({ call, database, append, restart }) => {
    const { tab } = await call('workbench.new');
    const first = append(tab.workId, tab.versionId, 'empty-parent');
    const leaf = append(tab.workId, first.id, 'empty-leaf');
    await call('version.open', { tabId: tab.id, versionId: leaf.id });
    await call('prompt.set', {
      tabId: tab.id,
      scope: 'base:prompt',
      text: 'synthetic draft survives trash',
    });
    const draft = (await call('workbench.get', { tabId: tab.id })).tab.project;
    const parentTrash = await call('library.trash', { ids: [first.images[0].projectId] });
    expect(parentTrash.versions).toEqual([]);
    expect(database.versions.get(first.id)).toBeDefined();
    const removed = await call('library.trash', { ids: [leaf.images[0].projectId] });
    expect(removed.versions.map((v) => v.number)).toEqual([leaf.number, first.number]);
    expect(removed.versions.every((v) => !v.lastOfBranch)).toBe(true);
    expect((await call('workbench.get', { tabId: tab.id })).tab).toMatchObject({
      versionId: tab.versionId,
      project: draft,
    });
    await restart();
    database.updateProjects([leaf.images[0].projectId], { deleted: false });
    expect(database.versions.get(first.id)).toBeDefined();
    expect(database.versions.get(leaf.id)).toMatchObject({
      number: leaf.number,
      branchId: leaf.branchId,
    });
    expect(database.versions.get(first.id).images[0].deleted).toBe(true);
    await call('library.trash', { ids: [leaf.images[0].projectId] });
    database.deleteProject(leaf.images[0].projectId);
    database.deleteProject(first.images[0].projectId);
    expect(database.versions.getAny(leaf.id)).toBeUndefined();
    expect(database.versions.getAny(first.id)).toBeUndefined();
    expect(database.versions.get(tab.versionId)).toBeDefined();
  }));

it('keeps versions with another image or child and removes the last version of a named branch', () =>
  fixture(async ({ call, database, append }) => {
    const { tab } = await call('workbench.new');
    const main = append(tab.workId, tab.versionId, 'kept-main');
    const branch = append(tab.workId, tab.versionId, 'one-branch');
    database.versions.rename(branch.branchId, 'Synthetic named branch');
    database.versions.append({
      workId: tab.workId,
      parentId: tab.versionId,
      versionId: branch.id,
      project: branch.project,
      source: 'agent',
      image: main.project,
      seed: 2,
    });
    expect((await call('library.trash', { ids: [branch.images[0].projectId] })).versions).toEqual(
      [],
    );
    const removed = await call(
      'library.trash',
      { ids: [main.images[0].projectId, main.images[0].projectId, 'missing-synthetic'] },
      'ui',
    );
    expect(removed.results.failed).toHaveLength(1);
    expect(removed.versions).toContainEqual({
      workName: tab.displayName,
      number: branch.number,
      branchName: 'Synthetic named branch',
      lastOfBranch: true,
    });
    database.updateProjects([main.images[0].projectId, branch.images[0].projectId], {
      deleted: false,
    });
    expect(database.versions.get(branch.id)).toMatchObject({
      number: branch.number,
      branchName: 'Synthetic named branch',
    });
    expect(database.versions.get(main.id)).toBeDefined();
  }));

for (const library of [false, true]) {
  it(`removes and restores a ${library ? 'library' : 'file'} original without changing snapshots or drafts`, () =>
    fixture(async ({ directory, call, dispatch, database, append, store, restart, waitJob }) => {
      const [file] = await createWorkbenchFixtures(directory, { sizes: [[64, 64]] });
      const image = await readWorkbenchImage(file);
      if (library) database.insertProject(image);
      const { tab } = await call('workbench.open', { path: file });
      const root = (await call('version.list', { tabId: tab.id })).versions[0];
      expect(root.originState).toBe(library ? 'library' : 'file');
      append(root.workId, root.id, 'original-descendant');
      await call('prompt.set', {
        tabId: tab.id,
        scope: 'base:prompt',
        text: 'synthetic unsaved draft',
      });
      const before = store.get();
      const tree = database.versions.list(root.workId);
      const bytes = await fs.readFile(file);
      expect(
        (await dispatch('work.remove-original', { tabId: tab.id, expectedRevision: -1 })).ok,
      ).toBe(false);
      const result = await call('work.remove-original', { tabId: tab.id });
      expect(result.trashed).toBe(library);
      expect(store.get()).toEqual(before);
      expect(database.versions.list(root.workId)).toEqual(
        tree.map((v, i) => (i ? v : { ...v, originState: library ? 'trashed' : 'removed' })),
      );
      expect(await fs.readFile(file)).toEqual(bytes);
      expect((await dispatch('work.remove-original', { tabId: tab.id })).ok).toBe(false);
      await restart();
      expect((await call('version.list', { tabId: tab.id })).versions[0].originState).toBe(
        library ? 'trashed' : 'removed',
      );
      await call('version.open', { tabId: tab.id, versionId: root.id });
      await fs.unlink(file);
      await call('account.save', { token: 'acceptance-token' }, 'ui');
      const generated = await waitJob(
        (await call('generate.start', { tabId: tab.id, count: 1 }, 'ui')).id,
      );
      expect(generated.versionId).not.toBe(root.id);
      expect(database.versions.get(generated.versionId).project.metadata.prompt_raw).toBe(
        root.project.metadata.prompt_raw,
      );
      expect(await call('work.restore-original', { undo: result.undo })).toEqual({
        restored: true,
      });
      expect(database.versions.get(root.id).originState).toBe(library ? 'library' : 'file');
      expect((await dispatch('work.restore-original', { undo: result.undo })).ok).toBe(false);
    }));
}

it('tracks external original trash, recovery and purge, names affected works and survives source deletion', () =>
  fixture(async ({ directory, call, dispatch, database, append, waitJob }) => {
    const [file] = await createWorkbenchFixtures(directory, { sizes: [[64, 64]] });
    const image = await readWorkbenchImage(file);
    database.insertProject(image);
    const { tab } = await call('workbench.open', { path: file });
    const root = (await call('version.list', { tabId: tab.id })).versions[0];
    const first = append(root.workId, root.id, 'derived-source');
    const derived = (
      await call('work.open-from-image', {
        tabId: tab.id,
        versionId: first.id,
        imageId: first.images[0].projectId,
      })
    ).tab;
    expect((await call('version.list', { tabId: derived.id })).origin.deleted).toBeUndefined();
    const removed = await call('library.trash', { ids: [image.id, first.images[0].projectId] });
    expect(removed.originsOf).toEqual(
      expect.arrayContaining([tab.displayName, derived.displayName]),
    );
    expect(database.versions.get(root.id).originState).toBe('trashed');
    expect((await call('version.list', { tabId: derived.id })).versions[0].originState).toBe(
      'trashed',
    );
    expect((await call('version.list', { tabId: derived.id })).origin.deleted).toBe(true);
    database.updateProjects([image.id, first.images[0].projectId], { deleted: false });
    expect(database.versions.get(root.id).originState).toBe('library');
    expect((await call('version.list', { tabId: derived.id })).origin.deleted).toBeUndefined();
    const removal = await call('work.remove-original', { tabId: tab.id });
    database.deleteProject(image.id);
    await fs.unlink(file);
    expect(database.versions.get(root.id).originState).toBe('removed');
    expect((await dispatch('work.restore-original', { undo: removal.undo })).ok).toBe(false);
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    await waitJob((await call('generate.start', { tabId: tab.id, count: 1 }, 'ui')).id);
    expect(database.versions.get(root.id).project).toEqual(root.project);
    const raw = new DatabaseSync(database.filePath);
    try {
      raw.prepare('DELETE FROM works WHERE id=?').run(root.workId);
      expect((await call('version.list', { tabId: derived.id })).origin.deleted).toBe(true);
    } finally {
      raw.close();
    }
  }));

it('deletes only one fork version, preserves lineage and images, and restores independently', () =>
  fixture(async ({ call, dispatch, database, append, directory, restart }) => {
    const { tab } = await call('workbench.new');
    const first = append(tab.workId, tab.versionId, 'only-first');
    const middle = append(tab.workId, first.id, 'only-middle');
    const last = append(tab.workId, middle.id, 'only-last');
    const fork = append(tab.workId, middle.id, 'only-fork');
    await call('version.open', { tabId: tab.id, versionId: middle.id });
    const result = await call('version.delete', { versionId: middle.id, only: true });
    expect(result).toMatchObject({ versions: 1, images: 1, cancelledJobs: 0 });
    expect(database.versions.get(last.id)).toMatchObject({
      parentId: first.id,
      project: last.project,
    });
    expect(database.versions.get(fork.id).parentId).toBe(first.id);
    expect(database.loadProject(middle.images[0].projectId).deleted_at).not.toBe('');
    expect(database.loadProject(last.images[0].projectId).deleted_at).toBe('');
    expect((await call('workbench.get', { tabId: tab.id })).tab).toMatchObject({
      versionId: last.id,
      project: expect.objectContaining({ id: last.project.id }),
    });
    const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'), { readOnly: true });
    try {
      expect(
        raw.prepare('SELECT parent_id FROM work_versions WHERE id=?').get(last.id).parent_id,
      ).toBe(middle.id);
    } finally {
      raw.close();
    }
    await restart();
    await call('branch.restore', { undo: result.undo });
    expect(database.versions.get(last.id).parentId).toBe(middle.id);
    const deleted = await call('version.delete', { versionId: middle.id, only: true });
    const childDeleted = await call('version.delete', { versionId: last.id, only: true });
    await call('branch.restore', { undo: childDeleted.undo });
    expect(database.versions.get(middle.id)).toBeUndefined();
    await call('branch.restore', { undo: deleted.undo });
    expect(database.versions.get(last.id).parentId).toBe(middle.id);
    const again = await call('version.delete', { versionId: middle.id, only: true });
    database.updateProjects([middle.images[0].projectId], { deleted: false });
    expect(database.versions.get(last.id).parentId).toBe(middle.id);
    await call('branch.restore', { undo: again.undo });
    const next = append(tab.workId, last.id, 'only-next');
    expect(next.number).toBeGreaterThan(fork.number);
    expect((await dispatch('version.delete', { versionId: tab.versionId, only: true })).ok).toBe(
      false,
    );
    const origin = database.versions.ensure('only-import', first.project);
    expect((await dispatch('version.delete', { versionId: origin.id, only: true })).ok).toBe(false);
  }));

it('retains branch identity on the surviving first version and moves drafts to the visible parent', () =>
  fixture(async ({ call, database, append }) => {
    const { tab } = await call('workbench.new');
    const main = append(tab.workId, tab.versionId, 'only-main');
    const fork = append(tab.workId, tab.versionId, 'only-branch');
    const tail = append(tab.workId, fork.id, 'only-tail');
    await call('branch.rename', { branchId: fork.id, name: 'Synthetic branch' });
    await call('version.open', { tabId: tab.id, versionId: fork.id });
    await call('prompt.set', {
      tabId: tab.id,
      scope: 'base:prompt',
      text: 'synthetic retained only draft',
    });
    const draft = (await call('workbench.get', { tabId: tab.id })).tab.project;
    const deleted = await call('version.delete', { versionId: fork.id, only: true });
    expect((await call('workbench.get', { tabId: tab.id })).tab).toMatchObject({
      versionId: tab.versionId,
      project: draft,
    });
    expect(database.versions.list(tab.workId).find((v) => v.id === tail.id)).toMatchObject({
      branchId: tail.id,
      branchNumber: fork.branchNumber,
      branchName: 'Synthetic branch',
      parentId: tab.versionId,
    });
    await call('branch.rename', { branchId: tail.id, name: 'Renamed synthetic' });
    await call('branch.restore', { undo: deleted.undo });
    expect(database.versions.get(fork.id).branchName).toBe('Renamed synthetic');
    await call('version.delete', { versionId: fork.id, only: true });
    await call('branch.delete', { branchId: tail.id });
    expect(database.versions.get(tail.id)).toBeUndefined();
    expect(database.versions.get(main.id)).toBeDefined();
  }));

it('keeps later ancestor deletions independent and rolls back a failed only-version session save', () =>
  fixture(async ({ call, dispatch, database, append, store }) => {
    const { tab } = await call('workbench.new');
    const first = append(tab.workId, tab.versionId, 'only-independent-parent');
    const middle = append(tab.workId, first.id, 'only-independent-middle');
    const last = append(tab.workId, middle.id, 'only-independent-last');
    const deleted = await call('version.delete', { versionId: middle.id, only: true });
    const ancestor = await call('version.delete', { versionId: first.id, confirmed: true });
    await call('branch.restore', { undo: deleted.undo });
    expect(database.versions.get(first.id)).toBeUndefined();
    expect(database.versions.get(last.id)).toBeUndefined();
    expect(database.versions.get(middle.id).parentId).toBe(tab.versionId);
    await call('branch.restore', { undo: ancestor.undo });
    await call('version.open', { tabId: tab.id, versionId: middle.id });
    const session = store.get();
    const fail = vi
      .spyOn(store, 'save')
      .mockRejectedValueOnce(Error('synthetic persistence failure'));
    try {
      expect((await dispatch('version.delete', { versionId: middle.id, only: true })).ok).toBe(
        false,
      );
      expect(database.versions.get(last.id).parentId).toBe(middle.id);
      expect(database.versions.get(middle.id).images[0].deleted).toBe(false);
      expect(store.get()).toEqual(session);
    } finally {
      fail.mockRestore();
    }
  }));

it('blocks only-version deletion for a queued parent and a version receiving another image', () =>
  fixture(async ({ call, dispatch, database, append, service, waitJob }) => {
    const { tab } = await call('workbench.new', { width: 64, height: 64 });
    const first = append(tab.workId, tab.versionId, 'only-queue-first');
    const second = append(tab.workId, first.id, 'only-queue-second');
    await call('version.open', { tabId: tab.id, versionId: first.id });
    await call('account.save', { token: 'acceptance-token' }, 'ui');
    service.state.holdAt = 1;
    const active = await call('generate.queue', { tabId: tab.id, count: 2 }, 'ui');
    await expect.poll(() => typeof service.state.resume).toBe('function');
    await call('version.open', { tabId: tab.id, versionId: second.id });
    const queued = await call('generate.queue', { tabId: tab.id, count: 1 }, 'ui');
    expect(
      (await dispatch('version.delete', { versionId: second.id, only: true })).error.code,
    ).toBe('branch_generating');
    service.state.holdAt = 2;
    const resume = service.state.resume;
    service.state.resume = null;
    resume();
    await expect.poll(() => typeof service.state.resume).toBe('function');
    const job = (await call('generate.status', { id: active.id })).jobs[0];
    expect(job.versionId).toBeTruthy();
    expect(
      (await dispatch('version.delete', { versionId: job.versionId, only: true })).error.code,
    ).toBe('branch_generating');
    expect(database.versions.get(job.versionId)).toBeDefined();
    service.state.resume();
    await waitJob(active.id);
    await waitJob(queued.id);
  }));

it('reopens generated images and original sources, remembers usage, and supports explicit new works', () =>
  fixture(async ({ directory, call, database, append, restart }) => {
    const [file] = await createWorkbenchFixtures(directory, { sizes: [[64, 64]] });
    const image = await readWorkbenchImage(file);
    database.insertProject(image);
    const first = (await call('workbench.open', { libraryId: image.id })).tab;
    const second = append(first.workId, first.versionId, 'return-second');
    const third = append(first.workId, second.id, 'return-third');
    await call('workbench.close', { tabId: first.id });
    const reopened = (await call('workbench.open', { libraryId: second.images[0].projectId })).tab;
    expect(reopened.workId).toBe(first.workId);
    expect(reopened.versionId).toBe(second.id);
    expect(reopened.versionImageId).toBe(second.images[0].projectId);
    expect((await call('version.list', { tabId: reopened.id })).versions).toHaveLength(3);
    const original = (
      await call('workbench.open', { source: { type: 'library', projectId: image.id } }, 'ui')
    ).tab;
    expect(original.id).toBe(reopened.id);
    expect(original.versionId).toBe(second.id);
    const fresh = (await call('workbench.open', { libraryId: image.id, fresh: true })).tab;
    expect(fresh.workId).not.toBe(first.workId);
    expect((await call('workbench.open', { libraryId: image.id })).tab.id).toBe(fresh.id);
    await call('work.open', { workId: first.workId, imageId: third.images[0].projectId });
    expect((await call('workbench.open', { libraryId: image.id })).tab.versionId).toBe(third.id);
    await call('workbench.close', { tabId: reopened.id });
    await restart();
    expect((await call('workbench.open', { libraryId: image.id })).tab.workId).toBe(first.workId);
    const derived = (await call('work.open-from-image', { imageId: second.images[0].projectId }))
      .tab;
    expect(derived.workOrigin).toMatchObject({ workId: first.workId, versionId: second.id });
    expect((await call('workbench.list')).tabs.at(-1).id).toBe(derived.id);
    const raw = new DatabaseSync(database.filePath);
    try {
      raw.prepare('DELETE FROM works WHERE id=?').run(first.workId);
    } finally {
      raw.close();
    }
    expect(
      (await call('workbench.open', { libraryId: third.images[0].projectId })).tab.workId,
    ).not.toBe(first.workId);
  }));

it('matches file signatures and upgrades only matching legacy metadata without rewriting snapshots', () =>
  fixture(async ({ directory, call, database, append }) => {
    const [file] = await createWorkbenchFixtures(directory, { sizes: [[64, 64]] });
    const first = (await call('workbench.open', { path: file })).tab;
    const latest = append(first.workId, first.versionId, 'file-latest');
    await call('workbench.close', { tabId: first.id });
    const raw = new DatabaseSync(database.filePath);
    try {
      const origin = database.versions.work(first.workId).origin;
      delete origin.fileSignature;
      raw
        .prepare('UPDATE works SET origin_json=? WHERE id=?')
        .run(JSON.stringify(origin), first.workId);
      raw.prepare('DELETE FROM work_activity WHERE work_id=?').run(first.workId);
      const reopened = (await call('workbench.open', { path: file })).tab;
      expect(reopened.workId).toBe(first.workId);
      expect(reopened.versionId).toBe(latest.id);
      expect(
        raw.prepare('SELECT * FROM work_file_signatures WHERE work_id=?').get(first.workId),
      ).toBeDefined();
      expect(database.versions.work(first.workId).origin.fileSignature).toBeUndefined();
      await fs.appendFile(file, Buffer.from('changed'));
      const changed = (await call('workbench.open', { path: file })).tab;
      expect(changed.workId).not.toBe(first.workId);
      expect(database.versions.list(first.workId)).toHaveLength(2);
      await call('work.remove-original', { tabId: changed.id });
      expect((await call('workbench.open', { path: file })).tab.workId).not.toBe(changed.workId);
    } finally {
      raw.close();
    }
  }));

it('rejects legacy mismatches and missing metadata, and selects the most recently used legacy candidate', () =>
  fixture(async ({ directory, call, database }) => {
    const [file] = await createWorkbenchFixtures(directory, { sizes: [[64, 64]] });
    const a = (await call('workbench.open', { path: file })).tab;
    const b = (await call('workbench.open', { path: file, fresh: true })).tab;
    const raw = new DatabaseSync(database.filePath);
    try {
      for (const tab of [a, b]) {
        const origin = database.versions.work(tab.workId).origin;
        delete origin.fileSignature;
        raw
          .prepare('UPDATE works SET origin_json=? WHERE id=?')
          .run(JSON.stringify(origin), tab.workId);
      }
      await call('work.open', { workId: a.workId });
      expect((await call('workbench.open', { path: file })).tab.workId).toBe(a.workId);
      raw.prepare('DELETE FROM work_file_signatures').run();
      for (const tab of [a, b]) {
        const origin = database.versions.work(tab.workId).origin;
        origin.metadata.seed = '999';
        raw
          .prepare('UPDATE works SET origin_json=? WHERE id=?')
          .run(JSON.stringify(origin), tab.workId);
      }
      const mismatch = (await call('workbench.open', { path: file })).tab;
      expect([a.workId, b.workId]).not.toContain(mismatch.workId);
      const sharp = (await import('sharp')).default;
      await sharp({ create: { width: 64, height: 64, channels: 3, background: 'white' } })
        .png()
        .toFile(file + '.png');
      await fs.copyFile(file + '.png', file);
      const missing = (await call('workbench.open', { path: file })).tab;
      const origin = database.versions.work(missing.workId).origin;
      delete origin.fileSignature;
      raw
        .prepare('UPDATE works SET origin_json=? WHERE id=?')
        .run(JSON.stringify(origin), missing.workId);
      expect((await call('workbench.open', { path: file })).tab.workId).not.toBe(missing.workId);
      expect(database.versions.work(a.workId)).toBeDefined();
    } finally {
      raw.close();
    }
  }));

it('requires all signature fields, including a hash when size and modification time are unchanged', () =>
  fixture(async ({ directory, call, database }) => {
    const [file] = await createWorkbenchFixtures(directory, { sizes: [[64, 64]] });
    const first = (await call('workbench.open', { path: file })).tab;
    const signature = database.versions.work(first.workId).origin.fileSignature;
    const original = database.versions.work(first.workId).origin;
    const source = { type: 'file', path: file };
    for (const changed of [
      { ...signature, size: signature.size + 1 },
      { ...signature, mtimeMs: signature.mtimeMs + 1 },
      { ...signature, sha256: 'different-content' },
    ])
      expect(
        database.versions.findOrigin(source, { ...original, fileSignature: changed }),
      ).toBeUndefined();
    expect(database.versions.findOrigin(source, original)).toBe(first.workId);
    const bytes = await fs.readFile(file);
    const edited = Buffer.from(bytes);
    const position = edited.indexOf(Buffer.from('42000'));
    expect(position).toBeGreaterThan(0);
    edited[position] = '5'.charCodeAt(0);
    await fs.writeFile(file, edited);
    const changed = await readWorkbenchImage(file);
    changed.fileSignature.mtimeMs = signature.mtimeMs;
    expect(changed.fileSignature.size).toBe(signature.size);
    expect(database.versions.findOrigin(source, changed)).toBeUndefined();
  }));
