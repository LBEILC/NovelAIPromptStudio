import crypto from 'node:crypto';
import { activeJob, recentJobs, publicGenerationJob } from './generationStorage.js';
import { CommandError } from './commands/registry.js';

// One worker for the entire application. The worker never retries a request itself.
export function createGenerationQueue({
  generate,
  execute,
  run = (operation) => operation(),
  accept,
  prepare = async () => {},
  balance,
  beforeEach = () => true,
  initial = [],
  undoDuration = 10000,
  changed = () => {},
  persist = () => {},
}) {
  const jobs = recentJobs(initial, 100);
  let paused = false;
  const removed = new Map();
  let running = false;
  let closed = false;
  let finished;
  let complete;
  const publicJob = publicGenerationJob;
  const publicJobs = (items) => {
    const memo = new Map();
    return items.map((job) => publicJob(job, memo));
  };
  const publish = (durable = true) => {
    if (durable) {
      for (const job of jobs) {
        if (!activeJob(job)) job.finishedAt ||= new Date().toISOString();
        else delete job.finishedAt;
      }
      const kept = recentJobs(jobs, 100);
      jobs.splice(0, jobs.length, ...kept);
      persist(jobs);
    }
    changed(publicJobs(jobs));
  };
  async function drain() {
    if (running || closed || paused) return;
    running = true;
    finished = new Promise((resolve) => {
      complete = resolve;
    });
    try {
      let job;
      while (
        !closed &&
        !paused &&
        (job = jobs.find((item) => item.state === 'queued' && !item.deferred))
      ) {
        job.state = 'generating';
        publish();
        while (!closed && !paused && !job.stop && (job.continuous || job.completed < job.count)) {
          if (!(await beforeEach(job))) {
            job.state = 'failed';
            job.error ||= '已达到每日上限';
            publish();
            break;
          }
          job.index = job.completed + 1;
          job.progress = null;
          publish();
          try {
            await run(async () => {
              if (closed || paused || job.stop) return;
              let before;
              try {
                before = await balance();
                await prepare(job);
                if (closed || paused || job.stop) return;
                const request = structuredClone(job.request);
                if (!job.fixedSeed) request.parameters.seed = crypto.randomInt(0, 0x100000000);
                if (request.action === 'img2img') {
                  request.parameters.seed ||= 1;
                  request.parameters.extra_noise_seed = request.parameters.seed - 1;
                }
                const onProgress = (progress) => {
                  job.progress = progress;
                  publish(false);
                };
                const png = execute
                  ? await execute(job, request, generate, onProgress, publish)
                  : await generate(request, onProgress);
                // Persist the file and version before reporting success to any caller.
                const image = await accept(job, png, request.parameters.seed);
                job.images.push(image);
                job.completed++;
              } catch (error) {
                job.state = job.stop && job.operation === 'outpaint' ? 'canceled' : 'failed';
                job.error = error.message;
                if (error instanceof CommandError) {
                  job.errorCode = error.code;
                  job.errorDetails = error.details;
                }
              } finally {
                try {
                  const after = await balance();
                  if (Number.isFinite(before) && Number.isFinite(after))
                    job.spent += Math.max(0, before - after);
                  else job.spentKnown = false;
                } catch {
                  job.spentKnown = false;
                }
              }
            });
          } catch (error) {
            job.state = job.stop && job.operation === 'outpaint' ? 'canceled' : 'failed';
            job.error = error.message;
            if (error instanceof CommandError) {
              job.errorCode = error.code;
              job.errorDetails = error.details;
            }
          }
          publish();
          if (job.state === 'failed') break;
        }
        if (!['failed', 'pending'].includes(job.state))
          job.state = job.skipped
            ? 'skipped'
            : job.stop
              ? 'canceled'
              : (closed || paused) && (job.continuous || job.completed < job.count)
                ? 'queued'
                : 'completed';
        publish();
      }
    } finally {
      running = false;
      complete();
    }
  }
  return {
    restore(restored) {
      jobs.splice(
        0,
        jobs.length,
        ...recentJobs(
          restored.map((job) =>
            job.state === 'generating' ? { ...job, state: 'queued', resumedAfterExit: true } : job,
          ),
          100,
        ),
      );
      paused = jobs.some(activeJob);
      publish();
    },
    start(input) {
      if (closed) throw new Error('生成队列已关闭');
      if (!Number.isSafeInteger(input.count) || input.count < 1)
        throw new Error('张数必须是正整数');
      const job = {
        ...structuredClone(input),
        id: crypto.randomUUID(),
        state: input.pending ? 'pending' : 'queued',
        images: [],
        completed: 0,
        index: 0,
        spent: 0,
        spentKnown: true,
        stop: false,
        deferred: false,
        skipped: false,
        resumedAfterExit: false,
        hasRandomBlocks: JSON.stringify(input.project?.prompt_structure || {}).includes('__'),
        error: '',
        createdAt: new Date().toISOString(),
      };
      jobs.push(job);
      publish();
      void drain();
      return publicJob(job);
    },
    status(id, limit = 100) {
      return id
        ? publicJob(find(id))
        : publicJobs(
            recentJobs(
              jobs.filter((j) => !j.removed),
              limit,
            ),
          );
    },
    confirm(ids) {
      for (const id of ids) {
        const job = find(id);
        if (job.state === 'pending') {
          job.state = 'queued';
          job.confirmed = true;
          jobs.splice(jobs.indexOf(job), 1);
          jobs.push(job);
        }
      }
      publish();
      void drain();
    },
    get paused() {
      return paused;
    },
    pause() {
      paused = true;
      publish();
    },
    resume() {
      paused = false;
      publish();
      void drain();
    },
    setCount(id, count) {
      const job = find(id);
      if (job.continuous || !['queued', 'generating'].includes(job.state))
        throw new Error('这项任务不能修改张数');
      if (
        !Number.isSafeInteger(count) ||
        count < job.completed ||
        (job.state === 'queued' && count < 1)
      )
        throw new Error('张数无效');
      const next = Math.max(count, job.completed + 1);
      if (job.estimate != null) job.estimate = (job.estimate / job.count) * next;
      job.count = next;
      publish();
    },
    skip(id) {
      const job = find(id);
      if (job.state !== 'generating') throw new Error('这项任务没有正在生成');
      job.skipped = true;
      job.stop = true;
      publish();
    },
    defer(id, deferred) {
      const job = find(id);
      if (job.state !== 'queued') throw new Error('只能暂缓排队中的任务');
      job.deferred = deferred;
      publish();
      void drain();
    },
    move(id, before) {
      const job = find(id),
        target = before ? find(before) : null;
      if (job.state !== 'queued' || target?.state === 'generating')
        throw new Error('不能移动正在生成的任务');
      if (job === target) return;
      const active = jobs.findIndex((j) => j.state === 'generating');
      if (target && jobs.indexOf(target) <= active) throw new Error('不能插到正在生成的任务前');
      jobs.splice(jobs.indexOf(job), 1);
      jobs.splice(target ? jobs.indexOf(target) : jobs.length, 0, job);
      publish();
    },
    cancel(ids) {
      const undo = [];
      for (const id of ids) {
        const job = find(id);
        if (['pending', 'queued', 'failed'].includes(job.state)) {
          const entry = { id, index: jobs.indexOf(job), count: job.count, state: job.state };
          removed.set(id, { ...entry, job, before: jobs[jobs.indexOf(job) + 1]?.id });
          job.removed = true;
          job.undoAvailable = true;
          const timer = setTimeout(() => {
            removed.delete(id);
            job.undoAvailable = false;
            publish();
          }, undoDuration);
          timer.unref?.();
          removed.get(id).timer = timer;
          job.state = 'canceled';
          undo.push(entry);
        } else if (job.state === 'generating' && job.operation === 'outpaint') job.stop = true;
      }
      publish();
      return undo;
    },
    restoreRemoved(id) {
      const entry = removed.get(id);
      if (!entry) throw new Error('没有可恢复的任务');
      jobs.splice(jobs.indexOf(entry.job), 1);
      clearTimeout(entry.timer);
      entry.job.undoAvailable = false;
      entry.job.removed = false;
      entry.job.state = entry.state;
      const next = jobs.findIndex((j) => j.id === entry.before);
      const active = jobs.findIndex((j) => j.state === 'generating');
      jobs.splice(
        Math.max(active + 1, next < 0 ? Math.min(entry.index, jobs.length) : next),
        0,
        entry.job,
      );
      removed.delete(id);
      publish();
      void drain();
    },
    stop(id) {
      const job = find(id);
      job.stop = true;
      if (job.state === 'queued') job.state = 'canceled';
      publish();
    },
    retry(id) {
      const job = find(id);
      if (job.state !== 'failed') throw new Error('这项任务没有失败');
      // Keep the original remaining slots when retrying.
      job.continuous = false;
      job.stop = false;
      job.error = '';
      delete job.errorCode;
      delete job.errorDetails;
      job.state = 'queued';
      publish();
      void drain();
      return publicJob(job);
    },
    async close() {
      closed = true;
      for (const entry of removed.values()) {
        clearTimeout(entry.timer);
        entry.job.undoAvailable = false;
      }
      removed.clear();
      paused = true;
      publish();
      await finished;
    },
  };
  function find(id) {
    const job = jobs.find((job) => job.id === id);
    if (!job) throw new Error('生成任务不存在');
    return job;
  }
}
