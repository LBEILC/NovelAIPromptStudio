import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../electron/database.js';
import { galleryFilterOptions } from '../../src/lib/galleryFilters.js';
import { galleryBasePromptSimilarity } from '../../src/lib/galleryGrouping.js';
import { project } from './fixture.mjs';

// Optional local regression: use the actual pre-native database source and an
// isolated installation of its sql.js dependency, never a user's database.
const [sourcePath, legacyPackagePath] = process.argv.slice(2);
if (!sourcePath || !legacyPackagePath)
  throw Error(
    'Usage: node scripts/data-layer/verify-legacy-card-cache.mjs <old-database.js> <legacy-package.json>',
  );
const base = new URL('../../electron/database.js', import.meta.url);
const require = createRequire(path.resolve(legacyPackagePath));
const source = fs
  .readFileSync(sourcePath, 'utf8')
  .replaceAll('\r\n', '\n')
  .replace(
    /from '([^']+)'/g,
    (_, value) =>
      `from '${value.startsWith('.') ? new URL(value, base).href : value === 'sql.js' ? pathToFileURL(require.resolve(value)).href : value}'`,
  )
  .replace(
    'createRequire(import.meta.url)',
    `createRequire(${JSON.stringify(pathToFileURL(path.resolve(legacyPackagePath)).href)})`,
  );
const old = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-legacy-cards-'));
let api;
try {
  api = await openDatabase(directory);
  api.insertProject(project(0));
  api.insertProject(project(1));
  api.backfillPromptFingerprints();
  const before = structuredClone(await api.loadLibraryCards());
  api.close();
  const oldApi = await old.openDatabase(directory);
  oldApi.insertProject(project(2));
  oldApi.updateProjectName('image-0', 'Old writer renamed');
  oldApi.updateProjects(['image-1'], { deleted: true });
  oldApi.updateTagDictionary('benchmark_unique', {
    translation: '旧引擎译文',
    category: 'ArtistEra',
  });
  oldApi.persist();
  oldApi.close?.();
  const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'));
  let markers;
  try {
    markers = raw.prepare("SELECT * FROM app_meta WHERE key GLOB 'library_cards_dirty:*'").all();
    assert(markers.some((row) => row.key === 'library_cards_dirty:image-2'));
    assert.equal(
      raw
        .prepare(
          "SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name GLOB 'track_prompt_*'",
        )
        .get().n,
      9,
    );
    assert.equal(raw.prepare('SELECT count(*) n FROM library_card_cache').get().n, 2);
  } finally {
    raw.close();
  }
  api = await openDatabase(directory);
  const cards = await api.loadLibraryCards();
  assert.equal(cards.length, 2);
  assert.equal(cards.find((p) => p.id === 'image-0').name, 'Old writer renamed');
  assert.equal(cards.find((p) => p.id === 'image-0').filter_tags[0].translation, '旧引擎译文');
  assert.notDeepEqual(
    cards.find((p) => p.id === 'image-0').base_prompt_similarity,
    before.find((p) => p.id === 'image-0').base_prompt_similarity,
  );
  for (const view of ['all', 'favorites', 'trash']) {
    const full = api.loadLibrary(view);
    const compact = await api.loadLibraryCards(view);
    assert.deepEqual(
      compact.map((p) => p.id),
      full.map((p) => p.id),
    );
    assert.deepEqual(galleryFilterOptions(compact), galleryFilterOptions(full));
    for (let i = 0; i < full.length; i++)
      for (let j = 0; j < full.length; j++)
        assert.equal(
          galleryBasePromptSimilarity(compact[i], compact[j]),
          galleryBasePromptSimilarity(full[i], full[j]),
        );
  }
  assert.equal(api.backfillPromptFingerprints(), 0);
  assert.deepEqual(await api.loadLibraryCards(), cards);
  const output = path.resolve('.codex-runs/data-layer/legacy-card-cache.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    JSON.stringify(
      { ok: true, engine: 'actual legacy sql.js', markers, ids: cards.map((p) => p.id) },
      null,
      2,
    ),
  );
  console.log(
    'PASS: actual sql.js writer preserves the derived table and invalidates imports/dictionary results; all views and scores match',
  );
} finally {
  api?.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
