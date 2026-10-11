import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../electron/database.js';
import { project, seed } from './fixture.mjs';
import { observeTurns } from './observe-turns.mjs';

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
  } else if (mode === 'prepare-cards') {
    const api = await openDatabase(directory);
    try {
      await api.loadLibraryCards();
    } finally {
      api.close();
    }
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
    let initial = await observeTurns(() => api.loadLibraryCards());
    let cards = initial.value;
    result.firstCacheMs = initial.ms;
    result.firstCacheMaxBlockingMs = initial.maxBlockingMs;
    result.firstCacheTurns = initial.turns;
    initial = null;
    cards = null;
    api.close();
    api = await openDatabase(directory);
    global.gc?.();
    await new Promise((resolve) => setImmediate(resolve));
    start = performance.now();
    cards = await api.loadLibraryCards();
    result.cardsMs = performance.now() - start;
    start = performance.now();
    result.cardsBytes = 2 + Math.max(0, cards.length - 1);
    for (const card of cards) result.cardsBytes += Buffer.byteLength(JSON.stringify(card));
    result.cardsSerializationMs = performance.now() - start;
    const detailId = cards[0]?.id;
    cards = null;
    result.warmCardsMs = [];
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      start = performance.now();
      await api.loadLibraryCards();
      result.warmCardsMs.push(performance.now() - start);
    }
    progress('010b dictionary scenarios');
    const distribution = new DatabaseSync(api.filePath);
    try {
      const uses = distribution.prepare(
        'SELECT count(DISTINCT project_id) AS n FROM prompt_tags WHERE tag = ?',
      );
      const usedImportTags = Array.from({ length: 200 }, (_, i) =>
        i < 20 ? `synthetic_${i}` : `unused_benchmark_${i}`,
      ).filter((tag) => uses.get(tag).n > 0).length;
      result.dictionaryDistribution = {
        unique: uses.get('benchmark_unique').n,
        common: uses.get('1girl').n,
        usedImportTags,
      };
      if (
        result.dictionaryDistribution.unique !== 1 ||
        result.dictionaryDistribution.common !== Math.ceil(count * 0.8) ||
        (count >= 5000 && usedImportTags !== 20)
      )
        throw Error('010b dictionary benchmark distribution mismatch');
    } finally {
      distribution.close();
    }
    result.dictionaryScenarios = {};
    const mutations = {
      uniqueTranslation: () =>
        api.updateTagDictionary('benchmark_unique', { translation: '唯一译文' }),
      uniqueCategory: () => api.updateTagDictionary('benchmark_unique', { category: 'ArtistEra' }),
      commonCategory: () => api.updateTagDictionary('1girl', { category: 'ArtistEra' }),
      import200: () =>
        api.upsertTagDictionary(
          Array.from({ length: 200 }, (_, i) => ({
            tag: i < 20 ? `synthetic_${i}` : `unused_benchmark_${i}`,
            translation: `导入译文 ${i}`,
            category: 'Clothing',
            translation_source: 'manual',
            category_source: 'manual',
          })),
        ),
      metadataOnly: () => {
        const raw = new DatabaseSync(api.filePath);
        try {
          raw.exec(
            "UPDATE tag_dictionary SET updated_at = 'changed', display_tag = 'display only'",
          );
        } finally {
          raw.close();
        }
      },
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      await new Promise((resolve) => setImmediate(resolve));
      const measured = await observeTurns(async () => {
        mutate();
        return api.loadLibraryCards();
      });
      if (measured.value.length !== count) throw Error(`Incomplete list: ${name}`);
      result.dictionaryScenarios[name] = { ms: measured.ms, maxBlockingMs: measured.maxBlockingMs };
    }
    result.afterEditCardsMs = {};
    for (const change of ['tag', 'rename', 'trash']) {
      if (change === 'tag') {
        const raw = new DatabaseSync(api.filePath);
        try {
          raw.prepare('UPDATE prompt_tags SET weight = 1.5 WHERE project_id = ?').run(detailId);
        } finally {
          raw.close();
        }
      } else if (change === 'rename') api.updateProjectName(detailId, 'Benchmark renamed');
      else api.updateProjects([detailId], { deleted: true });
      await new Promise((resolve) => setImmediate(resolve));
      start = performance.now();
      await api.loadLibraryCards();
      result.afterEditCardsMs[change] = performance.now() - start;
    }
    api.updateProjects([detailId], { deleted: false });
    global.gc?.();
    await new Promise((resolve) => setImmediate(resolve));
    progress('loadLibraryDetail');
    start = performance.now();
    api.loadProject(detailId);
    result.detailMs = performance.now() - start;
    // Historical aggregate field; asynchronous list durations are operation
    // times, not blocking. firstCacheMaxBlockingMs/IPC probes measure blocking.
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
    // Dictionary updates are a separate invalidation scenario, not part of the
    // subsequent 100-image import measurement.
    progress('dictionary invalidation');
    start = performance.now();
    await api.loadLibraryCards();
    result.dictionaryRefreshMs = performance.now() - start;
    progress('import100');
    start = performance.now();
    for (let i = count; i < count + 100; i += 25) {
      const results = api.insertProjects(
        Array.from({ length: 25 }, (_, offset) => project(i + offset)),
      );
      if (results.some((result) => result.error)) throw Error('Benchmark import failed');
    }
    result.importMs = performance.now() - start;
    await new Promise((resolve) => setImmediate(resolve));
    start = performance.now();
    const importedCards = await api.loadLibraryCards();
    result.afterImportCardsMs = performance.now() - start;
    if (importedCards.length !== count + 100) throw Error('Import list count mismatch');
    result.maxBlockingMs = Math.max(
      result.maxBlockingMs,
      result.firstCacheMs,
      result.dictionaryRefreshMs,
      result.afterImportCardsMs,
      ...result.warmCardsMs,
      ...Object.values(result.afterEditCardsMs),
    );
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
