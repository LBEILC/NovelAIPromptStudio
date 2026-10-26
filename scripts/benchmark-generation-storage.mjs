import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createGenerationStorage } from '../electron/generationStorage.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'generation-benchmark-'));
try {
  const image = `data:image/png;base64,${'A'.repeat(8 * 1024 * 1024)}`;
  const jobs = Array.from({ length: 50 }, (_, i) => ({
    id: String(i),
    state: 'completed',
    createdAt: new Date(i * 1000).toISOString(),
    request: { parameters: { seed: i } },
    project: { references: { precise: [{ thumbnail: image }] } },
  }));
  const file = path.join(directory, 'generation-queue.json');
  let start = performance.now();
  // The previous implementation serialized the entire queue and wrote it synchronously.
  syncFs.writeFileSync(`${file}.tmp`, JSON.stringify(jobs));
  syncFs.renameSync(`${file}.tmp`, file);
  const before = { ms: performance.now() - start, bytes: (await fs.stat(file)).size };
  start = performance.now();
  await createGenerationStorage(directory).write(jobs);
  const after = {
    ms: performance.now() - start,
    bytes: (await fs.stat(file)).size,
    assets: (await fs.readdir(path.join(directory, 'generation-assets'))).length,
  };
  // Stream the synthetic legacy file to exactly 387 MiB without a second giant JS string.
  const target = 387 * 1024 * 1024;
  const payload = 'A'.repeat(Math.floor((target - 20000) / 50));
  const handle = await fs.open(file, 'w');
  await handle.write('[');
  for (let i = 0; i < 50; i++)
    await handle.write(
      (i ? ',' : '') +
        JSON.stringify({
          ...jobs[i],
          project: { references: { precise: [{ thumbnail: `data:image/png;base64,${payload}` }] } },
        }),
    );
  await handle.write(']');
  await handle.close();
  const legacyBytes = (await fs.stat(file)).size;
  let ticks = 0;
  const heartbeat = setInterval(() => ticks++, 10);
  start = performance.now();
  const migrated = await createGenerationStorage(directory).load();
  const migration = {
    ms: performance.now() - start,
    legacyBytes,
    bytes: (await fs.stat(file)).size,
    jobs: migrated.length,
    mainThreadHeartbeats: ticks,
  };
  clearInterval(heartbeat);
  console.log(JSON.stringify({ before, after, migration }, null, 2));
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
