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
  changed = () => {},
  persist = () => {},
}) {
  const jobs = recentJobs(initial, 100);
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
    if (running || closed) return;
    running = true;
    finished = new Promise((resolve) => {
      complete = resolve;
    });
    try {
      let job;
      while (!closed && (job = jobs.find((item) => item.state === 'queued'))) {
        job.state = 'generating';
        publish();
        while (!job.stop && (job.continuous || job.completed < job.count)) {
          if (!(await beforeEach(job))) {
            job.state = 'pending';
            publish();
            break;
          }
          job.index = job.completed + 1;
          job.progress = null;
          publish();
          try {
            await run(async () => {
              if (closed || job.stop) return;
              let before;
              try {
                before = await balance();
                await prepare(job);
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
          job.state = job.stop ? 'canceled' : 'completed';
        publish();
      }
    } finally {
      running = false;
      complete();
    }
  }
  return {
    restore(restored) {
      jobs.splice(0, jobs.length, ...recentJobs(restored, 100));
      publish();
      void drain();
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
        error: '',
        createdAt: new Date().toISOString(),
      };
      jobs.push(job);
      publish();
      void drain();
      return publicJob(job);
    },
    status(id, limit = 100) {
      return id ? publicJob(find(id)) : publicJobs(recentJobs(jobs, limit));
    },
    confirm(ids) {
      for (const id of ids) {
        const job = find(id);
        if (job.state === 'pending') {
          job.state = 'queued';
          job.confirmed = true;
        }
      }
      publish();
      void drain();
    },
    cancel(ids) {
      for (const id of ids) {
        const job = find(id);
        if (['pending', 'queued'].includes(job.state)) job.state = 'canceled';
        else if (job.state === 'generating' && job.operation === 'outpaint') job.stop = true;
      }
      publish();
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
      // Retry exactly the failed slot, not the rest of the original batch.
      job.count = job.completed + 1;
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
      for (const job of jobs) {
        job.stop = true;
        if (['pending', 'queued'].includes(job.state)) job.state = 'canceled';
      }
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
