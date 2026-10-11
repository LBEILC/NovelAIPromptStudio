import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { openDatabase } from '../../electron/database.js';
import { openNative, researchDatabase } from './adapters.mjs';
import { project, seed } from './fixture.mjs';

const [mode, kind, directory, size] = process.argv.slice(2);
const count = Number(size);
let phase = 'start';
const progress = (value) => {
  phase = value;
  process.send?.({ phase });
};
const result = { kind, count };
try {
  if (mode === 'seed') {
    await seed(directory, count, progress, kind);
  } else {
    result.fileBytes = fs.statSync(path.join(directory, 'studio.sqlite')).size;
    progress('open');
    let start = performance.now();
    const native =
      kind === 'sql.js' ? null : await openNative(kind, path.join(directory, 'studio.sqlite'));
    const api = native
      ? await researchDatabase(directory, { native })
      : await openDatabase(directory);
    result.openMs = performance.now() - start;
    result.fileBytes = fs.statSync(path.join(directory, 'studio.sqlite')).size;
    progress('loadLibrary');
    start = performance.now();
    let library = api.loadLibrary();
    result.loadMs = performance.now() - start;
    // Count the equivalent JSON array incrementally to avoid V8's string length
    // ceiling; this is a byte-size measurement, not an IPC latency benchmark.
    result.payloadBytes = 2 + Math.max(0, library.length - 1);
    for (const item of library) result.payloadBytes += Buffer.byteLength(JSON.stringify(item));
    library = null;
    global.gc?.();
    progress('translation');
    result.writeSamples = [];
    for (let i = 0; i < 7; i++) {
      start = performance.now();
      api.updateTagDictionary('synthetic_0', { translation: `翻译 ${i}` });
      result.writeSamples.push(performance.now() - start);
    }
    const sorted = [...result.writeSamples].sort((a, b) => a - b);
    result.writeMedianMs = sorted[3];
    result.writeMaxMs = sorted[6];
    progress('import100');
    start = performance.now();
    for (let i = count; i < count + 100; i++) api.insertProject(project(i));
    result.importMs = performance.now() - start;
    result.diskBytesAfterImport = ['', '-wal', '-shm'].reduce(
      (sum, suffix) =>
        sum +
        (fs.existsSync(`${api.filePath}${suffix}`)
          ? fs.statSync(`${api.filePath}${suffix}`).size
          : 0),
      0,
    );
    native?.close();
  }
  result.peakRssBytes = process.resourceUsage().maxRSS * 1024;
  process.send?.({ result });
} catch (error) {
  process.send?.({
    result: {
      ...result,
      phase,
      error: error instanceof Error ? error.stack || error.message : String(error),
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    },
  });
  process.exitCode = 1;
}
