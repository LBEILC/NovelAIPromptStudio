import { promptForTransmission } from '../../src/lib/promptStructure.js';
import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  buildGenerationRequest,
  createNovelAIClient,
  estimateGeneration,
  generationModel,
  generationUnavailable,
} from '../generation.js';
import { createGenerationQueue } from '../generationQueue.js';
import { createWorkbenchTab } from '../../src/lib/workbenchSession.js';
import { createPromptDocument } from '../../src/lib/promptDocument.ts';
import { CommandError } from './registry.js';
import { versionDiff, diffSummary } from '../../src/lib/versionDiff.ts';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
export function generationCommands({ services, store, tab, revision, unlocked, emit }) {
  const preferences = services.preferences;
  if (!preferences) return { handlers: {}, close: () => {} };
  const versions = services.database.versions;
  let subscription = null,
    accountError = '';
  const balance = () =>
    Number(subscription?.trainingStepsLeft?.fixedTrainingStepsLeft || 0) +
    Number(subscription?.trainingStepsLeft?.purchasedTrainingSteps || 0);
  const client = () =>
    createNovelAIClient({ token: preferences.novelAIToken, baseUrl: services.generationBaseUrl });
  const settings = () => {
    const s = preferences.generationSettings();
    return { ...s, spentToday: s.spentDate === today() ? s.spentToday || 0 : 0 };
  };
  const status = (id) => ({
    jobs: id ? [queue.status(id)] : queue.status(),
    settings: settings(),
    subscription,
    balance: balance(),
    accountError,
  });
  const publish = () => services.emit?.({ type: 'generation', data: status() });
  async function refresh() {
    if (!settings().hasToken) return 0;
    try {
      subscription = await client().subscription();
      accountError = '';
      publish();
      return balance();
    } catch (error) {
      accountError = error.message;
      publish();
      throw error;
    }
  }
  async function ensure(current) {
    if (!current.project) throw new CommandError('not_found', '图片不存在');
    const workId = current.workId || current.id;
    const root = versions.ensure(
      workId,
      current.originalProject || current.project,
      current.workOrigin || null,
    );
    if (!current.workId) {
      const session = store.get(),
        t = session.tabs.find((t) => t.id === current.id);
      t.workId = workId;
      t.versionId = root.id;
      await store.save(session);
      Object.assign(current, t);
    }
    return versions.get(current.versionId) || root;
  }
  async function requestFor(current, fixedSeed = false, explicitSeed) {
    const original = current.originalProject || current.project;
    let metadata = original.metadata;
    if (!metadata.extra_json && original.image_path)
      metadata = (await services.readImage(original.image_path)).metadata;
    let raw;
    try {
      raw = JSON.parse(metadata.extra_json || '{}').parsed || {};
    } catch {
      raw = {};
    }
    // Older imported records still provide normalized parameters as a fallback.
    raw = {
      width: metadata.width,
      height: metadata.height,
      steps: metadata.steps,
      scale: metadata.guidance,
      sampler: metadata.sampler,
      ...raw,
    };
    const model =
      generationModel(raw.model_name) ||
      generationModel(raw.model) ||
      generationModel(metadata.model);
    const reason = generationUnavailable(raw, model);
    if (reason) throw new Error(reason);
    const draft = current.project,
      edits = { width: draft.metadata.width, height: draft.metadata.height };
    if (fixedSeed) {
      const seed = explicitSeed ?? Number(draft.metadata.seed);
      if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new Error('Seed 无效');
      edits.seed = seed;
    }
    if (draft.metadata.prompt_raw !== original.metadata.prompt_raw)
      edits.prompt = promptForTransmission(draft.metadata.prompt_raw, draft, 'base:prompt');
    if (draft.metadata.negative_prompt !== original.metadata.negative_prompt)
      edits.negative = promptForTransmission(
        draft.metadata.negative_prompt,
        draft,
        'base:undesired',
      );
    const chars = (p) =>
      (p.prompt_structure?.characters || []).map((c) => [c.prompt_raw, c.undesired_raw, c.center]);
    if (JSON.stringify(chars(draft)) !== JSON.stringify(chars(original))) {
      for (const [key, field, base] of [
        ['v4_prompt', 'prompt_raw', draft.metadata.prompt_raw],
        ['v4_negative_prompt', 'undesired_raw', draft.metadata.negative_prompt],
      ]) {
        edits[key] = {
          ...(raw[key] || {}),
          caption: {
            base_caption: promptForTransmission(
              base,
              draft,
              key === 'v4_prompt' ? 'base:prompt' : 'base:undesired',
            ),
            char_captions: draft.prompt_structure.characters.map((c) => ({
              char_caption: promptForTransmission(
                c[field],
                draft,
                `character:${c.id}:${field === 'prompt_raw' ? 'prompt' : 'undesired'}`,
              ),
              centers: [c.center],
            })),
          },
        };
      }
    }
    return buildGenerationRequest(raw, model, edits);
  }
  const spent = new Map();
  const queueFile = path.join(services.directory, 'generation-queue.json');
  let initial = [];
  if (syncFs.existsSync(queueFile)) initial = JSON.parse(syncFs.readFileSync(queueFile, 'utf8'));
  for (const job of initial) spent.set(job.id, job.spent || 0);
  const queue = createGenerationQueue({
    initial,
    persist: (jobs) => {
      const temporary = `${queueFile}.tmp`;
      syncFs.writeFileSync(temporary, JSON.stringify(jobs));
      syncFs.renameSync(temporary, queueFile);
    },
    generate: (request, progress) => client().generate(request, progress),
    balance: refresh,
    beforeEach: async (job) => {
      const s = settings();
      if (
        job.source === 'agent' &&
        !job.confirmed &&
        s.limitEnabled &&
        (s.spentToday || 0) + estimateGeneration(job.request, subscription, 1).perImage >
          s.dailyLimit
      ) {
        job.limitReached = true;
        return false;
      }
      return true;
    },
    changed: (jobs) => {
      for (const job of jobs)
        if (job.source === 'agent' && job.spent > (spent.get(job.id) || 0)) {
          const s = settings();
          preferences.saveGenerationSettings({
            spentDate: today(),
            spentToday: (s.spentToday || 0) + job.spent - (spent.get(job.id) || 0),
          });
          spent.set(job.id, job.spent);
        }
      // Deferred so queue construction is complete before status reads it.
      queueMicrotask(publish);
    },
    accept: async (job, png, seed) => {
      const directory = path.join(services.directory, 'generated');
      await fs.mkdir(directory, { recursive: true });
      const file = path.join(directory, `${crypto.randomUUID()}.png`);
      await fs.writeFile(file, png, { flag: 'wx' });
      const image = await services.importImage(file);
      await store.exclusive(async () => {
        const version = versions.append({
          workId: job.workId,
          parentId: job.parentId,
          project: job.project,
          source: job.source,
          image,
          seed,
          versionId: job.versionId,
        });
        job.versionId = version.id;
        services.database.refreshGeneratedCards();
        if (version.branchId === version.id && version.branchNumber && job.completed === 0)
          job.branchNotice = `已从第 ${versions.get(job.parentId).number} 版分出分支 ${version.branchNumber}`;
        const session = store.get(),
          current = session.tabs.find((t) => t.id === job.tabId);
        if (current && job.source === 'user' && job.completed === 0) {
          current.versionId = version.id;
          current.versionImageId = image.id;
          current.source = { type: 'library', projectId: image.id, path: image.image_path };
          // Preserve a newer draft entered while the network request was running.
          const changed = JSON.stringify(current.project) !== JSON.stringify(job.project);
          const snapshot = {
            ...job.project,
            id: image.id,
            image_path: image.image_path,
            thumbnail_path: image.thumbnail_path,
            metadata: {
              ...job.project.metadata,
              seed: String(seed),
              extra_json: image.metadata.extra_json,
            },
          };
          current.originalProject = snapshot;
          if (!changed) current.project = structuredClone(snapshot);
          current.revision = (current.revision || 0) + 1;
          await store.save(session);
        }
        emit({ libraryChanged: true, tabId: job.tabId });
      });
      await fs.unlink(file);
      return image.id;
    },
  });
  const full = (current) => ({
    tab: current,
    document: createPromptDocument(current.project),
    revision: current.revision || 0,
  });
  async function openVersion(input) {
    const current = tab(input.tabId);
    revision(input.expectedRevision, current.revision || 0);
    unlocked(input);
    const parent = await ensure(current),
      version = versions.get(input.versionId);
    if (!version || version.workId !== parent.workId)
      throw new CommandError('not_found', '版本不存在');
    const image =
      !version.parentId && input.imageId === version.project.id
        ? null
        : version.images.find((i) => i.projectId === input.imageId && !i.deleted) ||
          version.images.find((i) => !i.deleted);
    const p = image ? services.database.loadProject(image.projectId) : version.project;
    const snapshot = {
      ...version.project,
      image_path: p.image_path,
      thumbnail_path: p.thumbnail_path,
      id: p.id,
      metadata: {
        ...version.project.metadata,
        seed: p.metadata.seed,
        extra_json: p.metadata.extra_json,
      },
    };
    const session = store.get(),
      next = session.tabs.find((t) => t.id === current.id);
    Object.assign(next, {
      source: services.database.loadProject(p.id)
        ? { type: 'library', projectId: p.id, path: p.image_path }
        : { type: 'file', path: p.image_path },
      project: snapshot,
      originalProject: structuredClone(snapshot),
      versionId: version.id,
      versionImageId: image?.projectId || (!version.parentId ? version.project.id : ''),
      revision: (current.revision || 0) + 1,
    });
    await store.save(session);
    emit({ tabId: next.id });
    return full(next);
  }
  const handlers = {
    'account.get': () => status(),
    'account.refresh': async () => {
      await refresh();
      return status();
    },
    'account.save': async ({ token }) => {
      let next;
      try {
        next = await createNovelAIClient({
          token: () => token.trim(),
          baseUrl: services.generationBaseUrl,
        }).subscription();
      } catch {
        throw new Error('保存失败：持久令牌无效');
      }
      preferences.saveNovelAIToken(token.trim());
      subscription = next;
      accountError = '';
      publish();
      return status();
    },
    'settings.generation.save': (input) => {
      preferences.saveGenerationSettings(input);
      if (input.continuous === false)
        for (const j of queue.status())
          if (j.continuous && j.state === 'generating') queue.stop(j.id);
      publish();
      return status();
    },
    'generate.estimate': async (input) => {
      const current = tab(input.tabId);
      try {
        const request = await requestFor(current);
        for (const key of ['width', 'height'])
          if (input[key] !== undefined) {
            if (!Number.isFinite(input[key]) || input[key] <= 0) throw new Error('尺寸无效');
            request.parameters[key] = Math.min(
              2048,
              Math.max(64, Math.round(input[key] / 64) * 64),
            );
          }
        return {
          ...estimateGeneration(request, subscription, input.count),
          balance: balance(),
          usage: subscription?.usage?.percent,
        };
      } catch (error) {
        return {
          anlas: 0,
          perImage: 0,
          free: false,
          count: input.count,
          unavailable: error.message,
          balance: balance(),
        };
      }
    },
    'generate.start': async (input, caller) => {
      const current = tab(input.tabId);
      revision(input.expectedRevision, current.revision || 0);
      unlocked(input);
      if (!settings().hasToken) throw new Error('没有持久令牌');
      if (input.continuous && (caller.source === 'agent' || !settings().continuous))
        throw new CommandError('forbidden', '持续生成未开启');
      const request = await requestFor(current, input.fixedSeed, input.seed),
        price = estimateGeneration(request, subscription, input.count),
        s = settings();
      if (balance() < (input.continuous ? price.perImage : price.anlas))
        throw new Error('Anlas 不足');
      const parent = await ensure(current);
      return queue.start({
        ...input,
        request,
        tabId: current.id,
        workId: parent.workId,
        parentId: parent.id,
        project: current.project,
        name: current.displayName,
        parentNumber: parent.number,
        summary: diffSummary(versionDiff(parent.project, current.project)),
        estimate: price.anlas,
        source: caller.source === 'agent' ? 'agent' : 'user',
        pending:
          caller.source === 'agent' &&
          (s.agentMode !== 'direct' ||
            (s.limitEnabled && (s.spentToday || 0) + price.anlas > s.dailyLimit)),
      });
    },
    'generate.status': (input) => status(input.id),
    'generate.confirm': (input) => {
      queue.confirm(input.ids);
      return status();
    },
    'generate.cancel': (input) => {
      queue.cancel(input.ids);
      return status();
    },
    'generate.stop': (input) => {
      queue.stop(input.id);
      return status();
    },
    'generate.retry': (input) => queue.retry(input.id),
    'version.list': async (input) => {
      const current = tab(input.tabId),
        parent = await ensure(current),
        list = versions.list(parent.workId);
      return {
        versions: list.map((v) => ({
          ...v,
          summary: diffSummary(
            versionDiff(list.find((p) => p.id === v.parentId)?.project || v.project, v.project),
          ),
        })),
        origin: versions.work(parent.workId).source,
        derived: versions.derived(parent.workId),
      };
    },
    'work.open': async (input) => {
      const work = versions.work(input.workId);
      if (!work) throw new CommandError('not_found', '作品不存在');
      const session = store.get();
      let next = session.tabs.find((t) => t.workId === input.workId);
      if (!next) {
        next = createWorkbenchTab(work.origin, {
          source: { type: 'library', projectId: work.origin.id, path: work.origin.image_path },
        });
        next.identity = `work:${input.workId}`;
        next.workId = input.workId;
        next.versionId = versions.list(input.workId)[0].id;
        session.tabs.push(next);
      }
      session.activeTabId = next.id;
      await store.save(session);
      if (input.versionId)
        return openVersion({ tabId: next.id, versionId: input.versionId, imageId: input.imageId });
      emit({ tabId: next.id });
      return full(next);
    },
    'version.open': openVersion,
    'branch.rename': (input) => {
      const name = versions.rename(input.branchId, input.name);
      emit();
      publish();
      return { name };
    },
    'prompt.set-size': async (input) => {
      const current = tab(input.tabId);
      revision(input.expectedRevision, current.revision || 0);
      unlocked(input);
      const norm = (n) => {
        if (!Number.isFinite(n) || n <= 0) throw new Error('尺寸无效');
        return Math.min(2048, Math.max(64, Math.round(n / 64) * 64));
      };
      const session = store.get(),
        next = session.tabs.find((t) => t.id === current.id);
      next.project.metadata = {
        ...next.project.metadata,
        width: norm(input.width),
        height: norm(input.height),
      };
      next.revision = (next.revision || 0) + 1;
      await store.save(session);
      emit({ tabId: next.id });
      return full(next);
    },
    'work.open-from-image': async (input) => {
      const current = tab(input.tabId),
        version = versions.get(input.versionId);
      if (
        !version ||
        (!version.images.some((i) => i.projectId === input.imageId) &&
          (version.parentId || version.project.id !== input.imageId))
      )
        throw new CommandError('not_found', '图片不存在');
      const storedImage = services.database.loadProject(input.imageId);
      const image = storedImage || version.project;
      const snapshot = {
        ...version.project,
        id: image.id,
        image_path: image.image_path,
        thumbnail_path: image.thumbnail_path,
        metadata: {
          ...version.project.metadata,
          seed: image.metadata.seed,
          extra_json: image.metadata.extra_json,
        },
      };
      const next = createWorkbenchTab(snapshot, {
        source: storedImage
          ? { type: 'library', projectId: image.id, path: image.image_path }
          : { type: 'file', path: image.image_path },
      });
      next.identity = `work:${next.id}`;
      next.workId = next.id;
      next.workOrigin = {
        workId: version.workId,
        versionId: version.id,
        projectId: image.id,
        name: current.displayName,
        number: version.number,
      };
      next.versionId = versions.ensure(next.workId, snapshot, next.workOrigin).id;
      const session = store.get();
      session.tabs.splice(session.tabs.findIndex((t) => t.id === current.id) + 1, 0, next);
      session.activeTabId = next.id;
      await store.save(session);
      emit({ tabId: next.id });
      return full(next);
    },
  };
  if (settings().hasToken) void refresh().catch(() => {});
  return { handlers, close: () => queue.close() };
}
