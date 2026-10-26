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
  // TODO(design): Confirm whether interrupted requests need a distinct recovery message.
  jobs = recentJobs(
    jobs.map((job) => ({ ...job, state: job.state === 'generating' ? 'pending' : job.state })),
    100,
  );
  const compact = await createGenerationStorage(directory).write(jobs);
  parentPort.postMessage({ jobs: compact, warning });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
