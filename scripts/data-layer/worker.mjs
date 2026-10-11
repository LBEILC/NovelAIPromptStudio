import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { openDatabase } from '../../electron/database.js';
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
    let api = await openDatabase(directory);
    result.openMs = performance.now() - start;
    api.close();
    await new Promise((resolve) => setImmediate(resolve));
    progress('second open');
    start = performance.now();
    api = await openDatabase(directory);
    result.secondOpenMs = performance.now() - start;
    await new Promise((resolve) => setImmediate(resolve));
    progress('loadLibraryCards');
    start = performance.now();
    let cards = api.loadLibraryCards();
    result.cardsMs = performance.now() - start;
    start = performance.now();
    result.cardsBytes = 2 + Math.max(0, cards.length - 1);
    for (const card of cards) result.cardsBytes += Buffer.byteLength(JSON.stringify(card));
    result.cardsSerializationMs = performance.now() - start;
    const detailId = cards[0]?.id;
    cards = null;
    global.gc?.();
    await new Promise((resolve) => setImmediate(resolve));
    progress('loadLibraryDetail');
    start = performance.now();
    api.loadProject(detailId);
    result.detailMs = performance.now() - start;
    result.maxBlockingMs = Math.max(
      result.openMs,
      result.secondOpenMs,
      result.cardsMs + result.cardsSerializationMs,
      result.detailMs,
    );
    await new Promise((resolve) => setImmediate(resolve));
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
    for (let i = count; i < count + 100; i += 25) {
      const results = api.insertProjects(
        Array.from({ length: 25 }, (_, offset) => project(i + offset)),
      );
      if (results.some((result) => result.error)) throw Error('Benchmark import failed');
    }
    result.importMs = performance.now() - start;
    result.diskBytesAfterImport = ['', '-wal', '-shm'].reduce(
      (sum, suffix) =>
        sum +
        (fs.existsSync(`${api.filePath}${suffix}`)
          ? fs.statSync(`${api.filePath}${suffix}`).size
          : 0),
      0,
    );
    api.close();
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
