import crypto from 'node:crypto';
import { CommandError } from './commands/registry.js';

// One worker for the entire application. The worker never retries a request itself.
export function createGenerationQueue({
  generate,
  run = (operation) => operation(),
  accept,
  prepare = async () => {},
  balance,
  beforeEach = () => true,
  initial = [],
  changed = () => {},
  persist = () => {},
}) {
  const jobs = initial.map((job) => ({
    ...job,
    state: ['pending', 'queued', 'generating'].includes(job.state) ? 'canceled' : job.state,
  }));
  let running = false;
  let closed = false;
  let finished;
  let complete;
  const publicJob = (job) => {
    const { request, ...view } = job;
    return structuredClone(view);
  };
  const publish = () => {
    persist(jobs);
    changed(jobs.map(publicJob));
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
                const png = await generate(request, (progress) => {
                  job.progress = progress;
                  publish();
                });
                // Persist the file and version before reporting success to any caller.
                const image = await accept(job, png, request.parameters.seed);
                job.images.push(image);
                job.completed++;
              } catch (error) {
                job.state = 'failed';
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
            job.state = 'failed';
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
    status(id) {
      return id ? publicJob(find(id)) : jobs.map(publicJob);
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
