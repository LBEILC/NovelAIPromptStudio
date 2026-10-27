import {
  createAgentImages,
  resolveAgentMask,
  croppedMaskInfo,
  currentMaskInput,
} from '../agentImages.js';
import { validateRect } from '../inpaint.js';
import { buildInpaint, compositeInpaint, storeInpaintMask } from '../inpaint.js';
import sharp from 'sharp';
import { outpaintSteps } from '../outpaint.js';
import { runOutpaint } from '../outpaintQueue.js';
import { outpaintCanvas, recommendOutpaint } from '../../src/shared/outpaint.ts';
import {
  buildImageOperation,
  estimateImageOperation,
  ENHANCE_MAGNITUDES,
} from '../imageOperations.js';
import { checkRelayRequest, normalizeRelayUrl } from '../relay.js';
import { saveWorkbenchImage } from './saveWorkbenchImage.js';
import { createBlankProject } from '../workbench.js';
import { buildProjectRequest } from '../parameterRequest.js';
import fs from 'node:fs/promises';
import { createGenerationStorage } from '../generationStorage.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { createNovelAIClient, estimateGeneration } from '../generation.js';
import { createGenerationQueue } from '../generationQueue.js';
import { createWorkbenchTab } from '../../src/lib/workbenchSession.js';
import { createPromptDocument } from '../../src/lib/promptDocument.ts';
import { CommandError } from './registry.js';
import { versionDiff, diffSummary } from '../../src/lib/versionDiff.ts';
import { createVersionDifferenceCache } from '../../src/lib/versionDifferenceCache.ts';
import { recordUsageRequest, localDay } from '../usage.js';
import { buildDirector, estimateDirector, validateDirector } from '../director.js';

const withPromptTemplate = (project, draft) => ({
  ...project,
  metadata: {
    ...project.metadata,
    prompt_raw: draft.metadata.prompt_raw,
    negative_prompt: draft.metadata.negative_prompt,
  },
  prompt_structure: structuredClone(draft.prompt_structure),
  tags: structuredClone(draft.tags),
});
export function generationCommands({ services, store, tab, revision, unlocked, emit }) {
  const previews = createAgentImages(services.directory);
  const inpaintStates = new Map();
  let previewCleanup = Promise.resolve();
  let previewState;
  const preferences = services.preferences;
  if (!preferences) return { handlers: {}, close: () => {} };
  const versions = services.database.versions;
  // Bound retained works while keeping each work's immutable summaries across reads.
  const summaryCaches = new Map();
  const usage = services.database.usage;
  const pools = () => services.database.materials.list().filter((p) => p.kind === 'pool');
  let shuttingDown = false;
  let subscription = null,
    accountError = '';
  const balance = () =>
    Number(subscription?.trainingStepsLeft?.fixedTrainingStepsLeft || 0) +
    Number(subscription?.trainingStepsLeft?.purchasedTrainingSteps || 0);
  const client = () =>
    createNovelAIClient({
      token: settings().connection === 'relay' ? preferences.relayKey : preferences.novelAIToken,
      connection: settings().connection,
      baseUrl:
        settings().connection === 'relay' ? settings().relay.baseUrl : services.generationBaseUrl,
      fetchImpl: services.fetcher,
    });
  const settings = () => {
    const s = preferences.generationSettings();
    return {
      ...s,
      spentDate: localDay(),
      spentImagesToday: usage.summary('today', 'relay').images,
      spentToday: usage.summary('today', 'official').anlas,
    };
  };
  const status = (id, limit = 20) => ({
    jobs: (id ? [queue.status(id)] : queue.status(undefined, limit)).map((job) => ({
      ...job,
      project: job.project
        ? { ...job.project, nsfw: services.database.nsfw.state(job.project) }
        : job.project,
    })),
    paused: queue.paused,
    spentToday: settings().spentToday,
    today: usage.summary('today', settings().connection),
    settings: settings(),
    subscription,
    balance: balance(),
    accountError,
  });
  const publish = () => {
    if (!shuttingDown) services.emit?.({ type: 'generation', data: status() });
  };
  const priceFor = (request, count = 1, pending = 0) => {
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('张数必须是正整数');
    return settings().connection === 'relay'
      ? { anlas: 0, perImage: 0, free: false, count, relay: true }
      : estimateGeneration(request, subscription, count, pending);
  };
  const idleConnection = () => {
    if (queue.status().some((j) => ['pending', 'queued', 'generating'].includes(j.state)))
      throw new Error('等生成完成后再切换连接');
  };
  async function testRelay(input = {}) {
    const baseUrl = normalizeRelayUrl(input.baseUrl ?? settings().relay.baseUrl);
    const key = input.key?.trim() ?? preferences.relayKey();
    const result = await createNovelAIClient({
      connection: 'relay',
      baseUrl,
      token: () => key,
      fetchImpl: services.fetcher,
    }).models();
    return { baseUrl, result };
  }
  async function refresh() {
    if (!settings().hasToken) return 0;
    try {
      if (settings().connection === 'relay') {
        const { baseUrl, result } = await testRelay();
        preferences.saveRelay({ baseUrl, models: result?.models ?? null });
        subscription = null;
      } else subscription = await client().subscription();
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
      versions.work(workId)
        ? current.originalProject || current.project
        : {
            ...(current.originalProject || current.project),
            autoSaveOriginal:
              current.source?.type !== 'library' &&
              !current.project.blank &&
              !services.database.loadProject(current.project.id),
          },
      current.workOrigin || null,
    );
    if (!current.workId) {
      const session = store.get(),
        t = session.tabs.find((t) => t.id === current.id);
      t.workId = workId;
      t.versionId = root.id;
      await store.save(session);
      Object.assign(current, t);
      versions.touch(workId, root.id);
    }
    return versions.get(current.versionId) || root;
  }
  async function requestFor(current, fixedSeed = false, explicitSeed) {
    let seed;
    if (fixedSeed) {
      seed = explicitSeed ?? Number(current.project.metadata.seed);
      if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new Error('Seed 无效');
    }
    const prepared = await buildProjectRequest(current.project, services.database.vibeLibrary, {
      seed,
      pools: pools(),
      sample: false,
    });
    checkRelayRequest(settings(), prepared.request, prepared.pendingEncodes);
    return prepared;
  }
  function protectJobs(jobs) {
    versions.setActiveVersions(
      jobs
        .filter((j) => j.undoAvailable || ['pending', 'queued', 'generating'].includes(j.state))
        .flatMap((j) => [j.parentId, j.versionId].filter(Boolean)),
    );
  }
  const storage = createGenerationStorage(services.directory);
  const queue = createGenerationQueue({
    run: services.network?.run,
    persist: storage.schedule,
    generate: (request, progress) =>
      request.req_type
        ? client().director(request)
        : request.action === 'upscale'
          ? client().upscale(request)
          : client().generate(request, progress),
    execute: (job, request, generate, onProgress, publish) => {
      const tracked = (request, progress) =>
        recordUsageRequest({
          usage,
          job,
          request,
          connection: settings().connection,
          price:
            settings().connection === 'relay'
              ? { anlas: 0, free: false }
              : request.req_type
                ? estimateDirector(request, subscription)
                : estimateImageOperation(request, subscription),
          balance: async () => {
            await refresh();
            return subscription?.trainingStepsLeft ? balance() : NaN;
          },
          send: () => generate(request, progress),
        });
      if (job.operation !== 'outpaint') return tracked(request, onProgress);
      return runOutpaint(job, {
        generate: tracked,
        seed: request.parameters.seed,
        library: services.database.vibeLibrary,
        pools: pools(),
        publish,
        beforeBlock: () => {
          const s = settings();
          if (s.connection === 'relay' && s.limitEnabled && s.spentImagesToday >= s.dailyImageLimit)
            throw new Error('已达到每日张数上限');
        },
      });
    },
    prepare: async (job) => {
      Object.assign(job, await storage.hydrate(job));
      // Persist before any paid reference encoding or image request. Pending jobs
      // reach this point only after confirmation; closed tabs are supported too.
      await store.exclusive(async () => {
        const root = versions.list(job.workId)[0];
        if (!job.originalPending || ['removed', 'trashed'].includes(root?.originState)) return;
        const saved = root?.project.autoSaveOriginal
          ? await saveWorkbenchImage(
              { services, store, emit },
              {
                id: job.tabId,
                workId: job.workId,
                versionId: root.id,
                project: { ...job.project, image_path: root.project.image_path },
              },
            )
          : { project: root.project };
        job.originalPending = false;
        job.project = {
          ...job.project,
          id: saved.project.id,
          image_path: saved.project.image_path,
          thumbnail_path: saved.project.thumbnail_path,
        };
      });
      if (job.operation === 'outpaint') return;
      if (job.operation === 'director') {
        checkDirectorConnection();
        const detail = job.operationDetails;
        job.request = (
          await buildDirector(job.operationPath, {
            tool: detail.tool,
            prompt: detail.toolPrompt,
            defry: detail.defry,
            emotion: detail.emotion,
          })
        ).request;
        return;
      }
      if (['upscale', 'enhance', 'inpaint'].includes(job.operation)) {
        const preview = await buildImageOperation(
          { ...job.project, ...job.operationDetails.prompt },
          job.operationPath,
          job.operationDetails,
          services.database.vibeLibrary,
          {
            seed: job.request.parameters.seed,
            pools: pools(),
            mask: job.inpaintMask,
            sample: job.operation === 'inpaint',
          },
        );
        checkOperationRelay(preview.request, preview.pendingEncodes);
        if (job.operation === 'inpaint') {
          job.random = preview.random;
          job.request = preview.request;
          job.referencesPrepared = true;
          return;
        }
        const prepared = await buildImageOperation(
          { ...job.project, ...job.operationDetails.prompt },
          job.operationPath,
          job.operationDetails,
          services.database.vibeLibrary,
          {
            seed: job.request.parameters.seed,
            pools: pools(),
            mask: job.inpaintMask,
            encode: (body) => client().encodeVibe(body),
          },
        );
        job.random = prepared.random;
        job.request = prepared.request;
        job.referencesPrepared = true;
        return;
      }
      // Rehydrate restored jobs too; previously prepared requests can contain legacy bad values.
      const preview = await buildProjectRequest(job.project, services.database.vibeLibrary, {
        seed: job.request.parameters.seed,
        pools: pools(),
        sample: false,
      });
      checkRelayRequest(settings(), preview.request, preview.pendingEncodes);
      const prepared = await buildProjectRequest(job.project, services.database.vibeLibrary, {
        seed: job.request.parameters.seed,
        pools: pools(),
        encode: (body) => client().encodeVibe(body),
      });
      job.random = prepared.random;
      job.request = prepared.request;
      job.project = prepared.project;
      job.referencesPrepared = true;
      emit({ tabId: job.tabId });
    },
    beforeEach: async (job) => {
      const s = settings();
      const imageOperation = ['upscale', 'enhance', 'inpaint', 'outpaint', 'director'].includes(
        job.operation,
      );
      if (s.connection === 'relay' && s.limitEnabled && s.spentImagesToday >= s.dailyImageLimit) {
        job.limitReached = true;
        return false;
      }
      if (
        s.connection !== 'relay' &&
        job.source === 'agent' &&
        !job.confirmed &&
        s.limitEnabled &&
        (s.spentToday || 0) +
          (imageOperation
            ? job.estimate
            : estimateGeneration(job.request, subscription, 1).perImage) >
          s.dailyLimit
      ) {
        job.limitReached = true;
        if (imageOperation) job.state = 'pending';
        return false;
      }
      return true;
    },
    changed: (jobs) => {
      protectJobs(jobs);
      const nextPreviewState = JSON.stringify(
        jobs
          .filter((job) => job.previewPath)
          .map((job) => [job.previewPath, job.state, job.removed]),
      );
      if (nextPreviewState !== previewState) {
        previewState = nextPreviewState;
        previewCleanup = previewCleanup
          .then(() => previews.cleanupJobs(jobs))
          .catch((error) => {
            cleanupError = error;
          });
      }
      if (!shuttingDown)
        void settlePruned().catch((error) => {
          cleanupError = error;
        });
      const openWorks = new Set(store.get().tabs.map((t) => t.workId));
      for (const job of jobs) {
        if (
          !openWorks.has(job.workId) &&
          !jobs.some(
            (j) => j.workId === job.workId && ['pending', 'queued', 'generating'].includes(j.state),
          )
        )
          versions.discardEmpty(job.workId);
      }
      // Deferred so queue construction is complete before status reads it.
      queueMicrotask(publish);
    },
    accept: async (job, png, seed, variant, imageIndex = 0) => {
      if (job.operation === 'inpaint') {
        png = await compositeInpaint(
          job.operationPath,
          png,
          job.operationDetails,
          job.inpaintMask,
          !!job.random?.blocks.length,
        );
        // A queued operation may share a mask with a version purged while waiting.
        await storeInpaintMask(
          job.inpaintMask,
          services.assetsDirectory?.() ||
            services.preferences?.librarySettings().assetsDirectory ||
            services.directory,
        );
      }
      const directory = path.join(services.directory, 'generated');
      await fs.mkdir(directory, { recursive: true });
      const file = path.join(directory, `${crypto.randomUUID()}.png`);
      await fs.writeFile(file, png, { flag: 'wx' });
      const image = await services.importImage(file);
      await store.exclusive(async () => {
        const version = versions.append({
          workId: job.workId,
          parentId: job.parentId,
          project:
            job.operation === 'enhance'
              ? { ...job.project, metadata: { ...job.project.metadata, seed: String(seed) } }
              : job.project,
          source: job.source,
          image,
          variant,
          seed,
          random: job.random,
          versionId: job.versionId,
          operation:
            job.operationDetails ||
            (job.project.references?.base
              ? {
                  kind: 'img2img',
                  strength: job.project.references.base.strength,
                  noise: job.project.references.base.noise,
                  sourceProjectId: job.project.references.base.projectId,
                }
              : undefined),
        });
        versions.touch(
          job.workId,
          job.source === 'user' && job.completed === 0 && imageIndex === 0 ? version.id : undefined,
        );
        job.versionId = version.id;
        usage.attachVersion(job.id, version.id);
        protectJobs(queue.retainedJobs());
        services.database.refreshGeneratedCards();
        if (version.branchId === version.id && version.branchNumber && job.completed === 0)
          job.branchNotice = `已从第 ${versions.get(job.parentId).number} 版分出分支 ${version.branchNumber}`;
        const session = store.get(),
          current = session.tabs.find((t) => t.id === job.tabId);
        if (current && job.source === 'user' && job.completed === 0 && imageIndex === 0) {
          current.versionId = version.id;
          current.versionImageId = image.id;
          current.source = { type: 'library', projectId: image.id, path: image.image_path };
          // Preserve a newer draft entered while the network request was running.
          const changed = JSON.stringify(current.project) !== JSON.stringify(job.project);
          const snapshot = {
            ...job.project,
            blank: undefined,
            id: image.id,
            nsfw: image.nsfw,
            image_path: image.image_path,
            thumbnail_path: image.thumbnail_path,
            metadata: {
              ...job.project.metadata,
              ...(job.operation === 'outpaint'
                ? { width: image.metadata.width, height: image.metadata.height }
                : {}),
              seed: ['inpaint', 'outpaint', 'director'].includes(job.operation)
                ? job.project.metadata.seed
                : String(seed),
              extra_json: image.metadata.extra_json,
            },
          };
          current.originalProject = snapshot;
          if (!changed) current.project = structuredClone(snapshot);
          else {
            // The draft differs from the job: edited while the request ran, or an
            // image operation (enhance and inpaint keep the source version's
            // prompt) started from a different draft. Keep its edits, but always
            // display the saved result. Only outpaint changes the generation size; upscale
            // and enhance keep the draft's size (the version row shows the pixel change).
            current.project = {
              ...current.project,
              id: image.id,
              image_path: image.image_path,
              thumbnail_path: image.thumbnail_path,
              nsfw: image.nsfw,
              metadata: {
                ...current.project.metadata,
                ...(job.operation === 'outpaint'
                  ? { width: image.metadata.width, height: image.metadata.height }
                  : {}),
              },
            };
          }
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
    tab: {
      ...current,
      project: current.project
        ? { ...current.project, nsfw: services.database.nsfw.state(current.project) }
        : null,
      originalProject: current.originalProject
        ? {
            ...current.originalProject,
            nsfw: services.database.nsfw.state(current.originalProject),
          }
        : null,
      workSaved: versions.isSaved(current.workId),
    },
    document: createPromptDocument(current.project, {}, pools()),
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
      blank: image ? undefined : version.project.blank,
      image_path: p.image_path,
      thumbnail_path: p.thumbnail_path,
      id: p.id,
      nsfw: p.nsfw,
      metadata: {
        ...version.project.metadata,
        ...(version.operation?.kind === 'outpaint'
          ? { width: p.metadata.width, height: p.metadata.height }
          : {}),
        seed:
          version.operation?.kind === 'director' ? version.project.metadata.seed : p.metadata.seed,
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
    versions.touch(version.workId, version.id);
    emit({ tabId: next.id });
    return full(next);
  }
  function retreatTabs(session, ids, parent) {
    for (const current of session.tabs) {
      if (!ids.has(current.versionId)) continue;
      current.versionId = parent.id;
      current.versionImageId = parent.images.find((i) => !i.deleted)?.projectId || '';
      const image = current.versionImageId && services.database.loadProject(current.versionImageId);
      current.originalProject = structuredClone({
        ...parent.project,
        ...(image
          ? {
              blank: undefined,
              image_path: image.image_path,
              thumbnail_path: image.thumbnail_path,
              id: image.id,
            }
          : {}),
      });
      const original = current.originalProject;
      current.source = services.database.loadProject(original.id)
        ? { type: 'library', projectId: original.id, path: original.image_path }
        : { type: 'file', path: original.image_path };
      current.error = '';
      current.revision = (current.revision || 0) + 1;
      versions.touch(parent.workId, parent.id);
    }
  }
  function retreatDeleted(session) {
    for (const current of session.tabs) {
      const deleted = current.versionId && versions.getAny(current.versionId);
      if (!deleted || versions.get(deleted.id)) continue;
      let parent = versions.getAny(deleted.parentId);
      while (parent && !versions.get(parent.id)) parent = versions.getAny(parent.parentId);
      if (!parent) continue;
      const viewing = versionDiff(deleted.project, current.project).empty;
      const next = versions.list(deleted.workId).find((v) => {
        if (versions.getAny(v.id).branchId !== deleted.branchId) return false;
        let ancestor = versions.getAny(v.id).parentId;
        while (ancestor && ancestor !== deleted.id) ancestor = versions.getAny(ancestor)?.parentId;
        return ancestor === deleted.id;
      });
      retreatTabs(
        { tabs: [current] },
        new Set([deleted.id]),
        viewing && next ? next : versions.get(parent.id),
      );
      if (viewing) current.project = structuredClone(current.originalProject);
    }
  }
  let cleanupError, closing;
  function settlePruned() {
    return store.exclusive(async () => {
      const removed = versions.pruneDeferred();
      if (!removed.length) return;
      const session = store.get();
      retreatDeleted(session);
      try {
        await store.save(session);
      } catch (error) {
        versions.retryPrune(removed);
        throw error;
      }
      services.database.refreshGeneratedCards();
      emit({ libraryChanged: true });
    });
  }
  async function deleteSubtree(input, version = false) {
    const { rows, parent, images } = versions.subtree(
      input.branchId,
      version ? input.versionId : undefined,
      version && input.only,
    );
    const ids = new Set(rows.map((v) => v.id));
    const jobs = queue.status().filter((j) => ids.has(j.parentId) || ids.has(j.versionId));
    if (jobs.some((j) => ['generating', 'queued'].includes(j.state)))
      throw new CommandError('branch_generating', '这条分支正在生成');
    const counts = {
      branches: new Set(rows.map((v) => v.branchId)).size - (version ? 1 : 0),
      versions: rows.length,
      images: images.length,
    };
    if (!input.only && (version ? counts.versions > 1 : counts.branches > 1) && !input.confirmed) {
      const error = new CommandError('needs_confirm', '删除分支需要确认');
      error.details = counts;
      throw error;
    }
    const pending = jobs.filter((j) => j.state === 'pending').map((j) => j.id);
    const before = input.only ? versions.list(rows[0].workId) : [];
    const next = before.find(
      (v) =>
        v.parentId === rows[0].id &&
        v.branchId === before.find((r) => r.id === rows[0].id)?.branchId,
    );
    const undo = versions.trash(rows, !!input.only);
    if (pending.length) queue.cancel(pending);
    const session = store.get();
    const viewing = input.only
      ? session.tabs
          .filter((t) => ids.has(t.versionId) && versionDiff(rows[0].project, t.project).empty)
          .map((t) => t.id)
      : [];
    retreatTabs(session, ids, parent);
    for (const t of session.tabs.filter((t) => viewing.includes(t.id))) {
      if (next) retreatTabs({ tabs: [t] }, new Set([parent.id]), versions.get(next.id));
      t.project = structuredClone(t.originalProject);
    }
    try {
      await store.save(session);
    } catch (error) {
      versions.restore(undo);
      services.database.refreshGeneratedCards();
      throw error;
    }
    services.database.refreshGeneratedCards();
    emit({ libraryChanged: true });
    publish();
    return { ...counts, cancelledJobs: pending.length, undo };
  }
  function checkDirectorConnection() {
    if (settings().connection === 'relay')
      throw new CommandError('unsupported', '中转站不支持导演工具', {
        unavailable: '中转站不支持导演工具',
      });
  }
  function checkOperationRelay(request, pending) {
    if (
      request.action === 'infill' &&
      settings().connection === 'relay' &&
      settings().relay.models !== null &&
      !settings().relay.models.includes(request.model)
    )
      throw new Error('中转站没有局部重绘用的模型');
    if (
      request.action === 'upscale' &&
      settings().connection === 'relay' &&
      settings().relay.models !== null &&
      !settings().relay.models.includes('nai-diffusion-5-curated')
    )
      throw new Error('中转站没有放大用的模型');
    checkRelayRequest(settings(), request, pending);
  }
  async function sourceFor(input) {
    const current = tab(input.tabId);
    await ensure(current);
    const parent =
      versions.forImage(input.imageId, current.workId) ||
      versions
        .list(current.workId)
        .find(
          (v) =>
            !v.parentId &&
            v.project.id === input.imageId &&
            !['removed', 'trashed'].includes(v.originState),
        );
    if (!parent) throw new CommandError('not_found', '图片不在这个作品中');
    const image = services.database.loadProject(input.imageId) || parent.project;
    if (image.deleted_at) throw new CommandError('not_found', '图片不存在');
    return { current, parent, image };
  }
  async function agentInpaint(input, caller) {
    if (caller?.source !== 'agent') return input;
    if (input.useCurrent) {
      const current = tab(input.tabId),
        state = inpaintStates.get(current.id);
      if (!state) throw new CommandError('not_found', '没有正在进行的局部重绘');
      if (input.imageId && input.imageId !== state.imageId)
        throw new CommandError('invalid_input', 'imageId 与正在重绘的图片不一致');
      if (!state.mask) throw new CommandError('invalid_input', '先涂上要重画的地方');
      const { image } = await sourceFor(state);
      return currentMaskInput(input, state, image.image_path);
    }
    const { image } = await sourceFor(input);
    return resolveAgentMask(input, image.image_path);
  }
  function agentPolicy(caller, price) {
    const s = settings();
    return {
      source: caller?.source === 'agent' ? 'agent' : 'user',
      pending:
        caller?.source === 'agent' &&
        (s.agentMode !== 'direct' ||
          (s.connection !== 'relay' &&
            s.limitEnabled &&
            (s.spentToday || 0) + price.anlas > s.dailyLimit)),
    };
  }
  async function operationFor(input) {
    const { current, parent, image } = await sourceFor(input);
    if (input.op === 'director') {
      checkDirectorConnection();
      const options = validateDirector(input);
      const prepared = await buildDirector(image.image_path, options);
      const { prompt, ...parameters } = options;
      return {
        current,
        parent,
        image,
        prepared,
        operation: {
          kind: 'director',
          ...parameters,
          sourceProjectId: input.imageId,
          ...(prompt !== undefined ? { toolPrompt: prompt } : {}),
          sent: { width: prepared.width, height: prepared.height },
        },
        price: estimateDirector(prepared.request, subscription),
        promptProject: parent.project,
      };
    }
    // 局部重绘用编辑器里的草稿（2.35）；放大、增强用这张图自己那一版的提示词和参数（2.34）
    const promptProject = input.op === 'inpaint' ? current.project : parent.project;
    const operation = {
      kind: input.op,
      sourceProjectId: input.imageId,
      prompt: structuredClone(
        Object.fromEntries(
          ['metadata', 'tags', 'prompt_structure', 'params', 'keptParameters']
            .filter((key) => promptProject[key] !== undefined)
            .map((key) => [key, promptProject[key]]),
        ),
      ),
      ...(input.op === 'inpaint'
        ? {
            rect: input.rect,
            strength: input.strength ?? 1,
            fullSize: input.fullSize ?? false,
          }
        : {}),
      ...(input.op === 'enhance'
        ? {
            magnitude: input.magnitude ?? 2,
            scale: input.scale ?? 1,
            ...ENHANCE_MAGNITUDES[(input.magnitude ?? 2) - 1],
          }
        : {}),
    };
    const prepared = await buildImageOperation(
      promptProject,
      image.image_path,
      operation,
      services.database.vibeLibrary,
      { mask: input.mask, pools: pools(), sample: false },
    );
    if (input.op === 'inpaint')
      operation.generated = {
        width: prepared.width,
        height: prepared.height,
        model: prepared.request.model,
      };
    checkOperationRelay(prepared.request, prepared.pendingEncodes);
    const price =
      settings().connection === 'relay'
        ? { anlas: 0, perImage: 0, free: false, count: 1, relay: true }
        : estimateImageOperation(prepared.request, subscription, prepared.pendingEncodes);
    return { current, parent, image, operation, prepared, price, promptProject };
  }
  async function startOperation(input, kind, caller) {
    const current = tab(input.tabId);
    revision(input.expectedRevision, current.revision || 0);
    unlocked(input);
    if (kind === 'director') {
      validateDirector(input);
      checkDirectorConnection();
    }
    if (!settings().hasToken) throw new Error('没有持久令牌');
    if (kind === 'inpaint') input = await agentInpaint(input, caller);
    const { parent, image, operation, prepared, price } = await operationFor({
      ...input,
      op: kind,
    });
    const s = settings();
    if (s.connection === 'relay' && s.limitEnabled && s.spentImagesToday + 1 > s.dailyImageLimit)
      throw new Error('已达到每日张数上限');
    if (s.connection !== 'relay' && balance() < price.anlas) throw new Error('Anlas 不足');
    if (kind === 'inpaint')
      operation.maskId = await storeInpaintMask(
        input.mask,
        services.assetsDirectory?.() ||
          services.preferences?.librarySettings().assetsDirectory ||
          services.directory,
      );
    return queue.start({
      ...(kind === 'inpaint' ? { inpaintMask: input.mask } : {}),
      tabId: current.id,
      workId: parent.workId,
      parentId: parent.id,
      // 快照是源图那一版的，和图片文件里的元数据一致；局部重绘用的草稿记在 operation.prompt
      project: parent.project,
      request: prepared.request,
      count: 1,
      fixedSeed: kind === 'upscale' || kind === 'director',
      ...agentPolicy(caller, price),
      ...(kind === 'inpaint'
        ? {
            previewPath: await previews.preview(image.image_path, input, { limit: 512, job: true }),
          }
        : {}),
      operation: kind,
      operationDetails: operation,
      operationPath: image.image_path,
      originalPending: !!versions.list(parent.workId)[0]?.project.autoSaveOriginal,
      parentNumber: parent.number,
      name: current.displayName,
      estimate: price.anlas,
      estimateFixed: price.parts?.encode || 0,
    });
  }
  async function outpaintFor(input) {
    const { current, parent, image } = await sourceFor(input);
    const source = await sharp(image.image_path).metadata();
    const canvas = outpaintCanvas(source, input.edges);
    // Only the common request settings are needed for pricing. No image is sent here.
    const prepared = await buildInpaint(
      current.project,
      image.image_path,
      {
        rect: {
          x: 0,
          y: 0,
          width: Math.min(source.width, 512),
          height: Math.min(source.height, 512),
        },
      },
      services.database.vibeLibrary,
      { pools: pools(), sample: false },
    );
    checkOperationRelay(prepared.request, prepared.pendingEncodes);
    const priceStep = (step) => {
      const request = structuredClone(prepared.request);
      Object.assign(request.parameters, { width: step.width, height: step.height });
      const price =
        settings().connection === 'relay'
          ? { anlas: 0, perImage: 0, free: false, count: 1, relay: true }
          : estimateImageOperation(request, subscription);
      if (step.width > 2048 || step.height > 2048 || step.width * step.height > 3145728)
        price.unavailable = '扩图生成尺寸超过单边 2048 或面积 3,145,728 上限';
      return price;
    };
    const wholeSteps = outpaintSteps(source, input.edges, 'whole', input.fullSize);
    const edgeSteps = outpaintSteps(source, input.edges, 'edges');
    const whole = {
      ...priceStep(wholeSteps[0]),
      width: wholeSteps[0].width,
      height: wholeSteps[0].height,
      scale: wholeSteps[0].width / canvas.width,
      model: prepared.request.model,
      balance: balance(),
    };
    const priced = edgeSteps.map((step) => ({ step, price: priceStep(step) }));
    const anlas = priced.reduce((sum, { price }) => sum + price.anlas, 0);
    const edges = {
      anlas,
      perImage: anlas / priced.length,
      count: priced.length,
      free: priced.every(({ price }) => price.free),
      model: prepared.request.model,
      balance: balance(),
      ...(settings().connection === 'relay' ? { relay: true } : {}),
      ...(priced.some(({ price }) => price.unavailable)
        ? { unavailable: priced.find(({ price }) => price.unavailable).price.unavailable }
        : {}),
      blocks: priced.map(({ step, price }) => ({
        edge: step.edge,
        rect: step.rect,
        width: step.width,
        height: step.height,
        anlas: price.anlas,
        free: price.free,
      })),
    };
    const estimate = {
      canvas,
      whole,
      edges,
      recommended: recommendOutpaint(input.edges, edges.free),
      ...(prepared.ignored.length ? { ignored: prepared.ignored } : {}),
    };
    return { current, parent, image, prepared, estimate, wholeSteps, edgeSteps };
  }
  const handlers = {
    'image.grid': async (input) => {
      const { image } = await sourceFor(input);
      return previews.grid(image.image_path, input.step);
    },
    'inpaint.sync': async (input) => {
      if (input.closed) {
        inpaintStates.delete(input.tabId);
        return { active: false };
      }
      const current = tab(input.tabId);
      const { image } = await sourceFor(input);
      if (input.rect) validateRect(input.rect, await sharp(image.image_path).metadata());
      if (input.mask && !input.rect) throw new CommandError('invalid_input', '遮罩需要重绘框');
      if (input.mask) await croppedMaskInfo(input.mask, input.rect);
      if (
        input.strength !== undefined &&
        (!Number.isFinite(input.strength) || input.strength < 0.01 || input.strength > 1)
      )
        throw new CommandError('invalid_input', '重绘强度无效');
      inpaintStates.set(current.id, {
        ...input,
        strength: input.strength ?? 1,
        fullSize: input.fullSize ?? false,
        updatedAt: new Date().toISOString(),
      });
      return { active: true };
    },
    'inpaint.get': async (input) => {
      const id = input.tabId ?? store.get().activeTabId;
      if (!id) return { active: false };
      const current = tab(id);
      const state = inpaintStates.get(current.id);
      if (!state) return { active: false };
      const { image, parent } = await sourceFor(state);
      return {
        active: true,
        tabId: current.id,
        imageId: state.imageId,
        versionId: parent.id,
        versionNumber: parent.number,
        rect: state.rect ?? null,
        strength: state.strength,
        fullSize: state.fullSize,
        ...(await croppedMaskInfo(state.mask, state.rect)),
        previewPath: await previews.preview(image.image_path, state),
        cropPath: await previews.preview(image.image_path, state, { limit: 1024, crop: true }),
        updatedAt: state.updatedAt,
      };
    },

    'usage.summary': ({ range = 'today' }) => usage.summary(range, settings().connection),
    'usage.daily': ({ days = 30 }) => usage.daily(days, settings().connection),
    'generate.estimate-outpaint': async (input) => {
      try {
        return (await outpaintFor(input)).estimate;
      } catch (error) {
        if (error.code === 'invalid_input') throw new CommandError('invalid_input', error.message);
        const price = {
          anlas: 0,
          perImage: 0,
          free: false,
          count: 1,
          model: '',
          unavailable: error.message,
          ...(settings().connection === 'relay' ? { relay: true } : {}),
        };
        return {
          canvas: { width: 0, height: 0 },
          whole: { ...price, width: 0, height: 0, scale: 0 },
          edges: { ...price, blocks: [] },
          recommended: recommendOutpaint(input.edges, false),
        };
      }
    },
    'generate.outpaint': async (input, caller) => {
      const current = tab(input.tabId);
      revision(input.expectedRevision, current.revision || 0);
      unlocked(input);
      if (!settings().hasToken) throw new Error('没有持久令牌');
      let context;
      try {
        context = await outpaintFor(input);
      } catch (error) {
        throw new CommandError(
          error.code === 'invalid_input' ? 'invalid_input' : 'unavailable',
          error.message,
        );
      }
      const { parent, image, prepared, estimate, wholeSteps, edgeSteps } = context;
      input = { ...input, mode: input.mode ?? estimate.recommended };
      const price = estimate[input.mode];
      if (price.unavailable) throw new CommandError('unavailable', price.unavailable);
      const steps = input.mode === 'whole' ? wholeSteps : edgeSteps;
      const s = settings();
      if (
        s.connection === 'relay' &&
        s.limitEnabled &&
        s.spentImagesToday + steps.length > s.dailyImageLimit
      )
        throw new Error('已达到每日张数上限');
      if (s.connection !== 'relay' && balance() < price.anlas) throw new Error('Anlas 不足');
      const operation = {
        kind: 'outpaint',
        sourceProjectId: input.imageId,
        edges: input.edges,
        mode: input.mode,
        fullSize: input.fullSize ?? false,
        blocks:
          input.mode === 'edges'
            ? edgeSteps.map(({ edge, rect, width, height }) => ({ edge, rect, width, height }))
            : [],
        rect: steps[0].rect,
        generated: {
          width: steps[0].width,
          height: steps[0].height,
          model: prepared.request.model,
        },
        prompt: structuredClone(
          Object.fromEntries(
            ['metadata', 'tags', 'prompt_structure', 'params', 'keptParameters']
              .filter((key) => current.project[key] !== undefined)
              .map((key) => [key, current.project[key]]),
          ),
        ),
      };
      return queue.start({
        tabId: current.id,
        workId: parent.workId,
        parentId: parent.id,
        project: withPromptTemplate(parent.project, current.project),
        request: prepared.request,
        count: 1,
        fixedSeed: false,
        ...agentPolicy(caller, price),
        previewPath: await previews.outpaint(image.image_path, input.edges, estimate.canvas),
        operation: 'outpaint',
        operationDetails: operation,
        operationPath: image.image_path,
        blockCount: steps.length,
        blockIndex: 0,
        originalPending: !!versions.list(parent.workId)[0]?.project.autoSaveOriginal,
        parentNumber: parent.number,
        name: current.displayName,
        estimate: price.anlas,
        estimateFixed: price.parts?.encode || 0,
      });
    },
    'generate.estimate-inpaint': async (input, caller) => {
      try {
        input = await agentInpaint(input, caller);
        const { prepared, price, image } = await operationFor({ ...input, op: 'inpaint' });
        const details = {
          rect: input.rect,
          ...(await croppedMaskInfo(input.mask, input.rect)),
          previewPath: await previews.preview(image.image_path, input),
        };
        return {
          ...price,
          width: prepared.width,
          height: prepared.height,
          ...details,
          scale: prepared.scale,
          model: prepared.request.model,
          ...(prepared.ignored.length ? { ignored: prepared.ignored } : {}),
          balance: balance(),
        };
      } catch (error) {
        if (['invalid_input', 'not_found'].includes(error.code)) throw error;
        return {
          anlas: 0,
          perImage: 0,
          free: false,
          count: 1,
          width: 0,
          height: 0,
          scale: 0,
          model: '',
          unavailable: error.message,
          ...(settings().connection === 'relay' ? { relay: true } : {}),
        };
      }
    },
    'generate.inpaint': (input, caller) => startOperation(input, 'inpaint', caller),
    'generate.director': (input, caller) => startOperation(input, 'director', caller),
    'generate.estimate-director': async (input) => {
      validateDirector(input);
      checkDirectorConnection();
      const { prepared, price } = await operationFor({ ...input, op: 'director' });
      return { ...price, width: prepared.width, height: prepared.height, balance: balance() };
    },
    'generate.estimate-op': async (input) => {
      try {
        const { prepared, price } = await operationFor(input);
        return {
          ...price,
          width: prepared.width,
          height: prepared.height,
          ...(prepared.scales ? { scales: prepared.scales } : {}),
          balance: balance(),
        };
      } catch (error) {
        return {
          anlas: 0,
          perImage: 0,
          free: false,
          count: 1,
          width: 0,
          height: 0,
          unavailable: error.message,
          ...(settings().connection === 'relay' ? { relay: true } : {}),
        };
      }
    },
    'generate.upscale': (input, caller) => startOperation(input, 'upscale', caller),
    'generate.enhance': (input, caller) => startOperation(input, 'enhance', caller),
    'trash.detached': async () => {
      const cards = new Map(
        (await services.database.loadLibraryCards()).map((card) => [card.id, card]),
      );
      return {
        items: versions.detachedImages().flatMap(({ imageId, ...record }) => {
          const image = cards.get(imageId);
          return image ? [{ ...record, image }] : [];
        }),
      };
    },
    'work.discard-detached': ({ undos }) => {
      const discarded = versions.discardDetached(undos);
      emit({ libraryChanged: true });
      return { discarded };
    },
    'work.detach-images': async ({ workId, imageIds }) => {
      const result = versions.detachImages(workId, imageIds);
      const session = store.get();
      retreatDeleted(session);
      try {
        await store.save(session);
      } catch (error) {
        versions.restoreDetached(result.undo);
        throw error;
      }
      services.database.refreshGeneratedCards();
      emit({ libraryChanged: true });
      return {
        undo: result.undo,
        versions: result.versions.map((v) => ({
          workName:
            session.tabs.find((t) => t.workId === v.workId)?.displayName ||
            versions.work(v.workId)?.origin.name ||
            '',
          number: v.number,
          branchName: v.branchName,
          lastOfBranch: !versions
            .list(v.workId)
            .some((other) => other.branchNumber === v.branchNumber),
        })),
      };
    },
    'work.restore-detached': ({ undo }) => {
      const restored = versions.restoreDetached(undo);
      services.database.refreshGeneratedCards();
      emit({ libraryChanged: true });
      return { restored };
    },
    'work.remove-original': async (input) => {
      const current = tab(input.tabId);
      revision(input.expectedRevision, current.revision || 0);
      unlocked(input);
      const parent = await ensure(current);
      const result = services.database.removeWorkOriginal(parent.workId);
      emit({ libraryChanged: true });
      return result;
    },
    'work.restore-original': ({ undo }) => {
      const restored = services.database.restoreWorkOriginal(undo);
      emit({ libraryChanged: true });
      return { restored };
    },
    'workbench.new': async (input, caller) => {
      const project = createBlankProject(input, {
        model: settings().blankModel || 'last',
        latest: versions.latest(),
      });
      const next = createWorkbenchTab(project);
      next.revision = 0;
      next.workId = next.id;
      next.versionId = versions.ensure(next.id, project).id;
      const session = store.get();
      session.tabs.push(next);
      if (caller.source !== 'agent') session.activeTabId = next.id;
      await store.save(session);
      emit({ tabId: next.id });
      return full(next);
    },
    'branch.delete': (input) => deleteSubtree(input),
    'version.delete': (input) => deleteSubtree(input, true),
    'branch.restore': ({ undo }) => {
      const restored = versions.restore(undo);
      services.database.refreshGeneratedCards();
      emit({ libraryChanged: true });
      publish();
      return { restored };
    },
    'account.connection.save': async ({ connection }) => {
      idleConnection();
      preferences.saveConnection(connection);
      subscription = null;
      accountError = '';
      if (settings().hasToken) await refresh().catch(() => {});
      publish();
      return status();
    },
    'account.relay.save': async (input) => {
      idleConnection();
      const { baseUrl, result } = await testRelay(input);
      preferences.saveRelay({ baseUrl, key: input.key, models: result?.models ?? null });
      accountError = '';
      publish();
      return status();
    },
    'account.relay.test': async (input) => {
      try {
        const { baseUrl, result } = await testRelay(input);
        if (
          baseUrl === settings().relay.baseUrl &&
          (input.key === undefined || input.key.trim() === preferences.relayKey())
        )
          preferences.saveRelay({ baseUrl, models: result?.models ?? null });
        return { ok: true, ...(result || { models: [], other: [] }) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    'account.get': () => status(),
    'account.refresh': async () => {
      await refresh();
      return status();
    },
    'account.save': async ({ token }) => {
      idleConnection();
      let next;
      try {
        next = await createNovelAIClient({
          token: () => token.trim(),
          baseUrl: services.generationBaseUrl,
          fetchImpl: services.fetcher,
        }).subscription();
      } catch (error) {
        if (error.code === 'invalid_token')
          throw new CommandError('invalid_token', '保存失败：持久令牌无效', error.details);
        throw error;
      }
      preferences.saveNovelAIToken(token.trim());
      subscription = settings().connection === 'relay' ? null : next;
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
        const { request, pendingEncodes } = await requestFor(current);
        if (
          (input.width ?? request.parameters.width) * (input.height ?? request.parameters.height) >
          1536 * 2048
        )
          throw new Error('面积最大 1536×2048');
        for (const key of ['width', 'height'])
          if (input[key] !== undefined) {
            if (!Number.isFinite(input[key]) || input[key] <= 0) throw new Error('尺寸无效');
            request.parameters[key] = Math.min(
              2048,
              Math.max(64, Math.round(input[key] / 64) * 64),
            );
          }
        if (request.parameters.width * request.parameters.height > 1536 * 2048)
          throw new Error('面积最大 1536×2048');
        return {
          ...priceFor(request, input.count, pendingEncodes),
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
      const { request, pendingEncodes } = await requestFor(current, input.fixedSeed, input.seed),
        price = priceFor(request, input.count, pendingEncodes),
        s = settings();
      if (
        s.connection === 'relay' &&
        s.limitEnabled &&
        s.spentImagesToday + input.count > s.dailyImageLimit
      )
        throw new Error('已达到每日张数上限');
      if (s.connection !== 'relay' && balance() < (input.continuous ? price.perImage : price.anlas))
        throw new Error('Anlas 不足');
      const parent = await ensure(current);
      return queue.start({
        ...input,
        request,
        tabId: current.id,
        workId: parent.workId,
        parentId: parent.id,
        originalPending: !!versions.list(parent.workId)[0]?.project.autoSaveOriginal,
        project: { ...current.project, nsfw: services.database.nsfw.state(current.project) },
        operation: current.project.references?.base ? 'img2img' : undefined,
        name: current.displayName,
        parentNumber: parent.number,
        summary: diffSummary(versionDiff(parent.project, current.project)),
        estimate: price.anlas,
        estimateFixed: price.parts?.encode || 0,
        source: caller.source === 'agent' ? 'agent' : 'user',
        pending:
          caller.source === 'agent' &&
          (s.agentMode !== 'direct' ||
            (s.limitEnabled && (s.spentToday || 0) + price.anlas > s.dailyLimit)),
      });
    },
    'generate.status': (input) => status(input.id, input.limit),
    'generate.pause': () => {
      queue.pause();
      return status();
    },
    'generate.resume': () => {
      queue.resume();
      return status();
    },
    'generate.set-count': ({ id, count }) => {
      queue.setCount(id, count);
      return status();
    },
    'generate.skip': ({ id }) => {
      queue.skip(id);
      return status();
    },
    'generate.defer': ({ id, deferred }) => {
      queue.defer(id, deferred);
      return status();
    },
    'generate.move': ({ id, before }) => {
      queue.move(id, before);
      return status();
    },
    'generate.restore': ({ id }) => {
      queue.restoreRemoved(id);
      return status();
    },

    'generate.confirm': (input) => {
      queue.confirm(input.ids);
      return status();
    },
    'generate.cancel': (input) => {
      const undo = queue.cancel(input.ids);
      return { ...status(), undo };
    },
    'generate.stop': (input) => {
      queue.stop(input.id);
      return status();
    },
    'generate.retry': (input) => {
      const job = queue.status(input.id);
      if (!versions.get(job.parentId) || (job.versionId && !versions.get(job.versionId)))
        throw new CommandError('not_found', '版本不存在');
      const retried = queue.retry(input.id);
      return {
        ...retried,
        project: { ...retried.project, nsfw: services.database.nsfw.state(retried.project) },
      };
    },
    'version.list': async (input) => {
      const current = tab(input.tabId),
        parent = await ensure(current),
        list = versions.list(parent.workId);
      const cache =
        summaryCaches.get(parent.workId) ||
        createVersionDifferenceCache((before, after) => diffSummary(versionDiff(before, after)));
      summaryCaches.delete(parent.workId);
      summaryCaches.set(parent.workId, cache);
      if (summaryCaches.size > 64) summaryCaches.delete(summaryCaches.keys().next().value);
      const summaries = cache.update(list);
      return {
        versions: list.map((v) => ({
          ...v,
          summary: summaries.get(v.id),
        })),
        origin: versions.work(parent.workId).source,
        derived: versions.derived(parent.workId),
      };
    },
    'work.open': async (input) => {
      const work = versions.work(input.workId);
      if (!work) throw new CommandError('not_found', '作品不存在');
      const target = input.versionId
        ? versions.get(input.versionId)
        : input.imageId
          ? versions.forImage(input.imageId, input.workId) ||
            versions.list(input.workId).find((v) => !v.parentId && v.project.id === input.imageId)
          : versions.lastVersion(input.workId);
      if (!target || target.workId !== input.workId)
        throw new CommandError('not_found', '版本不存在');
      const session = store.get();
      let next = session.tabs.find((t) => t.workId === input.workId);
      if (!next) {
        next = createWorkbenchTab(work.origin, {
          source: { type: 'library', projectId: work.origin.id, path: work.origin.image_path },
        });
        next.identity = `work:${input.workId}`;
        next.workId = input.workId;
        next.versionId = target.id;
        session.tabs.push(next);
      }
      session.activeTabId = next.id;
      await store.save(session);
      return openVersion({ tabId: next.id, versionId: target.id, imageId: input.imageId });
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
      if (input.width * input.height > 1536 * 2048) throw new Error('面积最大 1536×2048');
      if (norm(input.width) * norm(input.height) > 1536 * 2048)
        throw new Error('面积最大 1536×2048');
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
      const current = input.tabId ? tab(input.tabId) : null,
        version = input.versionId
          ? versions.get(input.versionId)
          : versions.forImage(input.imageId);
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
        nsfw: image.nsfw,
        image_path: image.image_path,
        thumbnail_path: image.thumbnail_path,
        metadata: {
          ...version.project.metadata,
          seed:
            version.operation?.kind === 'director'
              ? version.project.metadata.seed
              : image.metadata.seed,
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
        name: current?.displayName || versions.work(version.workId).origin.name,
        number: version.number,
      };
      next.versionId = versions.ensure(
        next.workId,
        { ...snapshot, autoSaveOriginal: !storedImage && !snapshot.blank },
        next.workOrigin,
      ).id;
      versions.touch(next.workId, next.versionId);
      const session = store.get();
      session.tabs.push(next);
      session.activeTabId = next.id;
      await store.save(session);
      emit({ tabId: next.id });
      return full(next);
    },
  };
  handlers['generate.queue'] = handlers['generate.start'];
  if (settings().hasToken) void refresh().catch(() => {});
  return {
    handlers,
    initialize: ensure,
    ready: async () => {
      await previews.cleanupTemporary();
      const initial = await storage.load();
      queue.restore(initial);
      await settlePruned();
    },
    async openSource(source, image, requestedWorkId) {
      if (requestedWorkId && source.type === 'library') {
        const ref = versions
          .workRefs()
          .get(source.projectId)
          ?.find((r) => r.workId === requestedWorkId);
        if (ref)
          return handlers['work.open']({
            workId: requestedWorkId,
            versionId: ref.role === 'origin' ? versions.list(requestedWorkId)[0].id : ref.versionId,
            imageId: source.projectId,
          });
      }
      const generated = source.type === 'library' && versions.forImage(source.projectId);
      if (generated)
        return handlers['work.open']({
          workId: generated.workId,
          versionId: generated.id,
          imageId: source.projectId,
        });
      const workId = versions.findOrigin(source, image);
      if (workId) {
        const alreadyOpen = store.get().tabs.some((t) => t.workId === workId);
        const opened = await handlers['work.open']({ workId });
        // Reopening a saved original must retain its library draft without rewriting history.
        if (
          source.type === 'library' &&
          !alreadyOpen &&
          !versions.get(opened.tab.versionId).parentId
        ) {
          const session = store.get(),
            current = session.tabs.find((t) => t.id === opened.tab.id);
          current.project = structuredClone(image);
          current.revision = (current.revision || 0) + 1;
          await store.save(session);
          emit({ tabId: current.id });
          return full(current);
        }
        return opened;
      }
      return null;
    },
    retreatDeleted,
    close: () =>
      (closing ??= (async () => {
        shuttingDown = true;
        await queue.close();
        await storage.flush();
        await previewCleanup;
        await store.exclusive(async () => {});
        if (cleanupError) throw cleanupError;
      })()),
    discardEmpty: (workId) => {
      if (
        workId &&
        !queue
          .status()
          .some((j) => j.workId === workId && ['pending', 'queued', 'generating'].includes(j.state))
      )
        versions.discardEmpty(workId);
    },
  };
}
