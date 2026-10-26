import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { setImmediate as yieldTurn } from 'node:timers/promises';

export const activeJob = (job) => ['pending', 'queued', 'generating'].includes(job.state);
export function recentJobs(jobs, limit) {
  const keep = new Set(
    jobs
      .filter((j) => !activeJob(j))
      .reverse()
      .sort((a, b) =>
        String(b.finishedAt || b.createdAt || '').localeCompare(
          String(a.finishedAt || a.createdAt || ''),
        ),
      )
      .slice(0, limit),
  );
  return jobs.filter((j) => activeJob(j) || keep.has(j));
}
const assetPattern = /^nps-asset:([a-f0-9]{64})$/;
const binary = (s) =>
  s.startsWith('data:') || (s.length >= 1024 && /^[A-Za-z0-9+/\r\n]+={0,2}$/.test(s));
const snapshot = (value) => {
  if (Array.isArray(value)) return value.map(snapshot);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)]));
  return value;
};

// Includes nested metadata JSON, so new image fields cannot silently enlarge the queue.
export function mapPayload(value, mapString, memo = new Map()) {
  if (typeof value === 'string') {
    if (memo.has(value)) return memo.get(value);
    if ((value.length > 1024 || value.includes('nps-asset:')) && /^[\[{]/.test(value)) {
      try {
        const mapped = JSON.stringify(mapPayload(JSON.parse(value), mapString, memo));
        memo.set(value, mapped);
        return mapped;
      } catch {
        /* plain text */
      }
    }
    const mapped = mapString(value);
    memo.set(value, mapped);
    return mapped;
  }
  if (Array.isArray(value)) return value.map((v) => mapPayload(v, mapString, memo));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapPayload(v, mapString, memo)]),
    );
  return value;
}
export function publicGenerationJob(job, memo = new Map()) {
  const { request, inpaintMask, ...view } = job;
  return mapPayload(view, (s) => (binary(s) ? undefined : s), memo);
}

export function createGenerationStorage(directory, { delay = 250, log = console.warn } = {}) {
  const file = path.join(directory, 'generation-queue.json');
  const assets = path.join(directory, 'generation-assets');
  let timer,
    pending,
    chain = Promise.resolve(),
    failure;
  // Cache only the last committed snapshot. Shared images are hashed once per batch.
  let cached = new Map();
  async function write(jobs) {
    await fs.mkdir(assets, { recursive: true });
    const strings = new Map(),
      writes = [],
      used = new Set();
    let assetFailure;
    const requestMemo = new Map(),
      snapshotMemo = new Map();
    const externalize = (s) => {
      let ref = assetPattern.exec(s);
      if (ref) {
        used.add(ref[1]);
        return s;
      }
      if (!binary(s)) return s;
      let id = strings.get(s) || cached.get(s);
      if (!id) {
        id = crypto.createHash('sha256').update(s).digest('hex');
        // Store the exact original string, including MIME prefix and base64 padding.
        writes.push(
          (async () => {
            const target = path.join(assets, `${id}.txt`);
            try {
              await fs.access(target);
            } catch (error) {
              if (error.code !== 'ENOENT') throw error;
              await fs.writeFile(`${target}.tmp`, s);
              await fs.rename(`${target}.tmp`, target);
            }
          })().catch((error) => {
            assetFailure ||= error;
          }),
        );
      }
      strings.set(s, id);
      used.add(id);
      return `nps-asset:${id}`;
    };
    const compact = [];
    for (const job of jobs) {
      // Requests are rebuilt from the snapshot; retain scalar options (especially seed).
      const request = mapPayload(job.request, (s) => (binary(s) ? undefined : s), requestMemo);
      compact.push({
        ...mapPayload({ ...job, request: undefined }, externalize, snapshotMemo),
        request,
      });
      await yieldTurn();
    }
    await Promise.all(writes);
    if (assetFailure) throw assetFailure;
    await fs.writeFile(`${file}.tmp`, JSON.stringify(compact));
    await fs.rename(`${file}.tmp`, file);
    cached = strings;
    // Only collect after the referencing queue has been atomically committed.
    for (const name of await fs.readdir(assets))
      if (
        /^[a-f0-9]{64}\.txt(?:\.tmp)?$/.test(name) &&
        (name.endsWith('.tmp') || !used.has(name.slice(0, 64)))
      )
        await fs.unlink(path.join(assets, name));
    return compact;
  }
  function commit() {
    clearTimeout(timer);
    if (!pending) return chain;
    const batch = pending;
    pending = null;
    chain = chain
      .then(() => write(batch))
      .catch((error) => {
        failure = error;
        log(error);
      });
    return chain;
  }
  return {
    write,
    async load() {
      try {
        await fs.access(file);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return write([]);
      }
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./generationStorageWorker.js', import.meta.url), {
          workerData: { directory },
        });
        worker.once('message', (result) => {
          if (result.warning) log(result.warning);
          if (result.error) reject(new Error(result.error));
          else resolve(result.jobs);
        });
        worker.once('error', reject);
        worker.once('exit', (code) => {
          if (code) reject(new Error(`Queue loader exited: ${code}`));
        });
      });
    },
    schedule(jobs) {
      // Snapshot the object graph, but immutable strings stay shared until the write.
      pending = snapshot(jobs);
      clearTimeout(timer);
      timer = setTimeout(commit, delay);
    },
    async flush() {
      await commit();
      if (failure) throw failure;
    },
    async hydrate(job) {
      const values = new Map();
      mapPayload(job, (s) => {
        if (assetPattern.test(s)) values.set(s, null);
        return s;
      });
      await Promise.all(
        [...values.keys()].map(async (ref) => {
          values.set(ref, await fs.readFile(path.join(assets, `${ref.slice(10)}.txt`), 'utf8'));
        }),
      );
      return mapPayload(job, (s) => values.get(s) ?? s);
    },
  };
}
