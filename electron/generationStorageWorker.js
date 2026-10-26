import fs from 'node:fs/promises';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { createGenerationStorage, recentJobs } from './generationStorage.js';

const directory = workerData.directory;
const file = path.join(directory, 'generation-queue.json');
try {
  let jobs = [],
    warning;
  try {
    jobs = JSON.parse(await fs.readFile(file, 'utf8'));
    if (
      !Array.isArray(jobs) ||
      jobs.some((j) => !j || typeof j.id !== 'string' || typeof j.state !== 'string')
    )
      throw new Error('Invalid generation queue');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      const broken = path.join(directory, `generation-queue.broken-${Date.now()}.json`);
      await fs.rename(file, broken);
      warning = `Generation queue preserved at ${broken}: ${error.message}`;
    }
    jobs = [];
  }
  // An interrupted paid request is not safe to replay automatically.
  jobs = recentJobs(
    jobs.map((job) => ({
      ...job,
      undoAvailable: false,
      state:
        job.state === 'generating'
          ? job.operation === 'director'
            ? 'failed'
            : 'queued'
          : job.state,
      ...(job.state === 'generating' && job.operation === 'director'
        ? { error: '导演工具请求中断，可能已扣费，请检查结果后再决定是否重试' }
        : {}),
      resumedAfterExit: job.state === 'generating' || !!job.resumedAfterExit,
    })),
    100,
  );
  const compact = await createGenerationStorage(directory).write(jobs);
  parentPort.postMessage({ jobs: compact, warning });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
