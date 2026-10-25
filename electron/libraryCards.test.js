import fs from 'node:fs';
import './fixtures/databaseTestBudget.js';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { openDatabase } from './database.js';
import { galleryViewGroups } from '../src/lib/gallery.js';
import {
  galleryBasePromptSimilarity,
  galleryBasePromptSimilarityPayload,
  galleryProjectGroupingFingerprints,
} from '../src/lib/galleryGrouping.js';
import { extractEmbeddedVibes, fingerprintVibes } from './vibes.js';
import { filterGalleryProjects, galleryFilterOptions } from '../src/lib/galleryFilters.js';
import { galleryCollectionScope } from '../src/lib/galleryCollections.js';

const directories = [];
const connections = [];
async function open(directory, options) {
  const api = await openDatabase(directory, options);
  connections.push(api);
  return api;
}
function temporary() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-cards-'));
  directories.push(directory);
  return directory;
}
function edit(directory, operation) {
  const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'));
  try {
    return operation(raw);
  } finally {
    raw.close();
  }
}
function sample(index) {
  let sequence = 0;
  const tag = (text, weight = 1) => ({
    id: `${index}-${sequence++}-${text}`,
    tag: text,
    category: 'Unsorted',
    weight,
  });
  return {
    id: `p${index}`,
    name: `Image ${index}`,
    created_at: `2026-01-${String(index + 1).padStart(2, '0')}`,
    tags:
      index === 6
        ? []
        : [tag('landscape'), tag(index % 2 ? 'blue_hair' : 'red_hair', -1.2), tag('landscape', 2)],
    prompt_structure: {
      base_undesired_tags: [tag(index % 3 ? 'lowres' : 'blurry')],
      characters: [
        {
          id: 'character',
          prompt_raw: 'character prose',
          prompt_tags: [tag('coat')],
          undesired_tags: [tag('hat')],
        },
      ],
    },
    metadata: {
      model: index === 4 ? 'other' : 'test',
      width: 832 + index,
      height: 1216,
      prompt_raw: 'A paragraph containing zephyr.',
      negative_prompt: 'unwanted prose',
      extra_json: JSON.stringify({
        parsed: { v4_negative_prompt: { caption: { base_caption: 'legacy fallback' } } },
      }),
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const api of connections.splice(0)) api.close();
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

it('preserves every grouping, score, filter, collection, view and detail with compact cards', async () => {
  const api = await open(temporary());
  const samples = Array.from({ length: 10 }, (_, i) => sample(i));
  samples[7].tags = [];
  samples[7].prompt_structure = {};
  samples[7].metadata = {};
  // Exercise raw metadata fallback, weighted duplicates, character tags and dictionary enrichment.
  samples[5].prompt_structure.base_undesired_tags = [{ tag: '{blurry}', raw_segment: '{blurry}' }];
  samples[5].metadata.extra_json = JSON.stringify({
    parsed: { v4_negative_prompt: { caption: { base_caption: '{blurry}' } } },
  });
  samples[1] = {
    ...samples[0],
    id: 'p1',
    tags: samples[0].tags.map((t) => ({ ...t, id: `copy-${t.id}` })),
  };
  for (const index of [8, 9]) {
    samples[index] = {
      ...samples[0],
      id: `p${index}`,
      tags: samples[0].tags.map((t) => ({ ...t, id: `${index}-${t.id}` })),
      metadata: {
        ...samples[0].metadata,
        width: index === 8 ? 1216 : 1024,
        height: index === 8 ? 832 : 1024,
        extra_json: JSON.stringify({
          parsed: { reference_image_multiple: [String(index).repeat(128)] },
        }),
      },
    };
  }
  for (const project of samples) api.insertProject(project);
  api.updateTagDictionary('coat', { translation: '外套', category: 'Clothing' });
  api.backfillPromptFingerprints();
  api.updateProjects(['p2'], { isFavorite: true });
  api.updateProjects(['p3'], { deleted: true });
  const projectIds = (items) => items.map((p) => p.id);
  const groupShape = (groups) =>
    groups.map((g) => ({ ...g, members: projectIds(g.members), cover: g.cover.id }));
  for (const view of ['all', 'favorites', 'trash']) {
    const full = api.loadLibrary(view);
    const cards = structuredClone(await api.loadLibraryCards(view));
    expect(projectIds(cards)).toEqual(projectIds(full));
    expect(galleryFilterOptions(cards)).toEqual(galleryFilterOptions(full));
    for (const item of full) {
      expect(api.loadProject(item.id)).toEqual(item);
      const card = cards.find((p) => p.id === item.id);
      expect(card.metadata.width).toBe(item.metadata.width);
      expect(card.metadata.height).toBe(item.metadata.height);
      expect(card).not.toHaveProperty('prompt_structure');
      expect(card.metadata).not.toHaveProperty('extra_json');
      for (const other of full)
        expect(
          galleryBasePromptSimilarity(
            card,
            cards.find((p) => p.id === other.id),
          ),
        ).toBe(galleryBasePromptSimilarity(item, other));
    }
    for (const filters of [
      {},
      { query: '外套' },
      { includeTags: ['coat'] },
      { excludeTags: ['hat'] },
      { models: ['test'] },
      { vibes: [api.loadProject('p8').vibe_fingerprint] },
      { datePreset: 'custom', dateFrom: '2026-01-03' },
    ]) {
      expect(projectIds(filterGalleryProjects(cards, filters))).toEqual(
        projectIds(filterGalleryProjects(full, filters)),
      );
      for (const promptScope of ['separate', 'full', 'base', 'similar'])
        for (const mergeVibes of [false, true])
          for (const similarityThreshold of [70, 85, 95])
            for (const sort of ['recent', 'oldest', 'name']) {
              const grouping = { promptScope, mergeVibes, similarityThreshold };
              expect(groupShape(galleryViewGroups(cards, filters, grouping, sort))).toEqual(
                groupShape(galleryViewGroups(full, filters, grouping, sort)),
              );
            }
    }
    for (const collection of [
      { id: 'm', kind: 'manual', member_ids: ['p0', 'p2'] },
      { id: 's', kind: 'smart', filters: { includeTags: ['coat'] } },
    ])
      expect(projectIds(galleryCollectionScope(cards, collection))).toEqual(
        projectIds(galleryCollectionScope(full, collection)),
      );
  }
  expect(
    filterGalleryProjects(await api.loadLibraryCards(), { query: 'zephyr' }).length,
  ).toBeGreaterThan(0);
  expect(
    filterGalleryProjects(await api.loadLibraryCards(), { query: 'character prose' }).length,
  ).toBeGreaterThan(0);
  expect(api.loadProject('missing')).toBeNull();
  expect((await api.loadLibraryCards()).some((card) => card.base_prompt_fingerprint === null)).toBe(
    true,
  );
  expect(
    galleryViewGroups(await api.loadLibraryCards(), {}, { promptScope: 'full', mergeVibes: true })
      .length,
  ).toBeLessThan(
    galleryViewGroups(await api.loadLibraryCards(), {}, { promptScope: 'full', mergeVibes: false })
      .length,
  );
}, 30_000);

function hydrationSpy() {
  const prepare = DatabaseSync.prototype.prepare;
  const ids = [];
  vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (sql) {
    const statement = prepare.call(this, sql);
    if (sql.endsWith(' FROM generation_metadata WHERE project_id = $id')) {
      const all = statement.all.bind(statement);
      statement.all = (params) => {
        ids.push(params.$id);
        return all(params);
      };
    }
    return statement;
  });
  return ids;
}

it('repairs fingerprints with the same semantics as full hydration for legacy and structured prompts', async () => {
  const directory = temporary();
  const api = await open(directory);
  for (let i = 0; i < 3; i++) api.insertProject(sample(i));
  edit(directory, (raw) => {
    const update = raw.prepare(
      'UPDATE generation_metadata SET prompt_structure_json = ?, extra_json = ? WHERE project_id = ?',
    );
    const extra = JSON.stringify({
      parsed: {
        reference_image_multiple: ['synthetic-vibe'],
        reference_strength_multiple: [0.7],
        reference_information_extracted_multiple: [0.6],
      },
    });
    update.run('{}', extra, 'p0');
    update.run(
      JSON.stringify({
        characters: [{ prompt_raw: 'legacy character prose', center: { x: 0.2, y: 0.7 } }],
      }),
      extra,
      'p1',
    );
    update.run(
      JSON.stringify({
        use_coords: true,
        use_order: true,
        base_undesired_tags: [{ tag: 'blurry', weight: 0.7 }],
        characters: [
          {
            center: { x: 0.1, y: 0.9 },
            prompt_tags: [{ tag: 'coat', weight: 1.4, brace_depth: 2, brace_group: 'synthetic' }],
            undesired_tags: [{ tag: 'hat' }],
          },
        ],
      }),
      extra,
      'p2',
    );
    raw.exec(
      "UPDATE prompt_tags SET raw_segment = '{landscape}', brace_depth = 2, brace_group = 'synthetic', brace_trailing_comma = 1 WHERE tag = 'landscape'",
    );
    raw.exec(
      "UPDATE projects SET prompt_fingerprint = 'stale', base_prompt_fingerprint = 'stale', vibe_fingerprint = 'stale', exact_group_fingerprint = 'stale'",
    );
  });
  api.updateTagDictionary('landscape', { category: 'ArtistEra', translation: '风景' });
  const expected = [0, 1, 2].map((i) => {
    const project = api.loadProject(`p${i}`);
    const raw = JSON.parse(project.metadata.extra_json);
    const vibe = fingerprintVibes(extractEmbeddedVibes(raw.parsed || raw, project.metadata.model));
    return { ...galleryProjectGroupingFingerprints({ ...project, vibe_fingerprint: vibe }), vibe };
  });
  expect(api.backfillPromptFingerprints()).toBe(3);
  for (let i = 0; i < 3; i++) {
    const project = api.loadProject(`p${i}`);
    expect([
      project.prompt_fingerprint,
      project.base_prompt_fingerprint,
      project.exact_group_fingerprint,
      project.vibe_fingerprint,
    ]).toEqual([
      expected[i].promptFingerprint,
      expected[i].basePromptFingerprint,
      expected[i].exactGroupFingerprint,
      expected[i].vibe,
    ]);
  }
  expect(api.backfillPromptFingerprints()).toBe(0);
});

it('retains rebuilt cards across startup when only modern fingerprint markers remain', async () => {
  const directory = temporary();
  let api = await open(directory);
  api.insertProject(sample(0));
  const before = await api.loadLibraryCards();
  api.close();
  edit(directory, (raw) => {
    expect(
      raw.prepare("SELECT value FROM app_meta WHERE key = 'prompt_fingerprints_dirty:p0'").get(),
    ).toBeTruthy();
    expect(
      raw.prepare("SELECT value FROM app_meta WHERE key = 'library_cards_dirty:p0'").get(),
    ).toBeUndefined();
    raw.exec(
      "CREATE TRIGGER reject_cache_delete BEFORE DELETE ON library_card_cache BEGIN SELECT RAISE(ABORT, 'valid cache deleted'); END",
    );
  });
  api = await open(directory);
  expect(await api.loadLibraryCards()).toEqual(before);
  edit(directory, (raw) =>
    expect(
      raw.prepare("SELECT value FROM app_meta WHERE key = 'prompt_fingerprints_dirty:p0'").get(),
    ).toBeUndefined(),
  );
});

it('aliases only identical base fingerprints and preserves independent or malformed legacy values', async () => {
  const directory = temporary();
  const api = await open(directory);
  api.insertProject(sample(0));
  expect((await api.loadLibraryCards())[0].base_prompt_fingerprint).toBeNull();
  edit(directory, (raw) =>
    raw.exec(
      "UPDATE projects SET base_prompt_fingerprint = 'independent', prompt_fingerprint = 'legacy non-JSON'",
    ),
  );
  expect((await api.loadLibraryCards())[0].base_prompt_fingerprint).toBe('independent');
  for (const promptScope of ['full', 'base']) {
    expect(
      galleryViewGroups(await api.loadLibraryCards(), {}, { promptScope }).map(
        (group) => group.key,
      ),
    ).toEqual(galleryViewGroups(api.loadLibrary(), {}, { promptScope }).map((group) => group.key));
  }
  api.insertProject({ ...sample(1), tags: [], prompt_structure: {}, metadata: {} });
  expect(
    (await api.loadLibraryCards()).find((card) => card.id === 'p1').base_prompt_fingerprint,
  ).toBe('');
});

it('skips clean rows and renames, detects new imports and legacy edits, and agrees with full recomputation', async () => {
  const directory = temporary();
  let api = await open(directory);
  api.insertProject(sample(0));
  api.insertProject(sample(1));
  api.close();
  api = await open(directory);
  api.close();
  const hydrated = hydrationSpy();
  api = await open(directory);
  expect(hydrated).toEqual([]);
  api.updateProjectName('p0', 'Renamed');
  api.updateProjects(['p1'], { deleted: true, isFavorite: true });
  api.close();
  hydrated.length = 0;
  api = await open(directory);
  expect(hydrated).toEqual([]);
  api.insertProject({ ...sample(2), tags: [], prompt_structure: {} });
  api.close();
  hydrated.length = 0;
  api = await open(directory);
  expect(hydrated).toEqual(['p2']);
  api.close();
  edit(directory, (raw) => {
    raw.exec(
      "UPDATE generation_metadata SET negative_prompt = 'changed', prompt_structure_json = '{}' WHERE project_id = 'p0'",
    );
    raw.exec("UPDATE prompt_tags SET weight = 1.9 WHERE project_id = 'p0'");
    raw.exec("UPDATE projects SET prompt_fingerprint = 'nonempty stale' WHERE id = 'p0'");
    // An old writer neither knows nor updates our app_meta markers.
    raw.exec(
      "INSERT INTO projects SELECT 'legacy', name, image_path, thumbnail_path, content_hash, 'old', 'old', 'old', 'old', is_favorite, deleted_at, created_at, updated_at FROM projects WHERE id='p0'",
    );
    raw.exec(
      "INSERT INTO generation_metadata(project_id, prompt_raw, negative_prompt) VALUES ('legacy', 'legacy prose', 'blurry')",
    );
  });
  hydrated.length = 0;
  api = await open(directory);
  expect(hydrated.sort()).toEqual(['legacy', 'p0']);
  const before = [api.loadLibrary(), api.loadLibrary('trash')];
  expect(api.backfillPromptFingerprints()).toBe(0);
  expect([api.loadLibrary(), api.loadLibrary('trash')]).toEqual(before);
}, 30_000);

it('keeps dictionary enrichment live, invalidates algorithm upgrades and missing tracking, and rolls markers back', async () => {
  const directory = temporary();
  let api = await open(directory);
  api.insertProject(sample(0));
  api.insertProject(sample(1));
  api.close();
  api = await open(directory);
  api.close();
  const hydrated = hydrationSpy();
  edit(directory, (raw) => raw.exec('BEGIN; UPDATE prompt_tags SET weight = 9; ROLLBACK'));
  api = await open(directory);
  expect(hydrated).toEqual([]);
  api.updateTagDictionary('landscape', { category: 'ArtistEra', translation: '风景' });
  api.close();
  hydrated.length = 0;
  api = await open(directory);
  expect(hydrated).toEqual([]);
  expect(
    (await api.loadLibraryCards())[0].filter_tags.find((tag) => tag.tag === 'landscape')
      .translation,
  ).toBe('风景');
  expect(api.backfillPromptFingerprints()).toBe(0);
  api.close();
  for (const change of [
    () =>
      edit(directory, (raw) =>
        raw.exec(
          "UPDATE app_meta SET value = 'old-algorithm' WHERE key = 'prompt_fingerprints_version'",
        ),
      ),
    () => edit(directory, (raw) => raw.exec('DROP TRIGGER track_prompt_projects_insert')),
  ]) {
    change();
    hydrated.length = 0;
    api = await open(directory);
    expect(hydrated.sort()).toEqual(['p0', 'p1']);
    expect(api.backfillPromptFingerprints()).toBe(0);
    api.close();
  }
}, 30_000);

it(
  'preserves dirty markers and previous fingerprints when startup repair fails',
  { timeout: 20000 },
  async () => {
    const directory = temporary();
    let api = await open(directory);
    api.insertProject(sample(0));
    api.close();
    api = await open(directory);
    const original = api.loadProject('p0').prompt_fingerprint;
    api.close();
    edit(directory, (raw) =>
      raw.exec(`
    UPDATE prompt_tags SET weight = 1.8 WHERE project_id = 'p0';
    CREATE TRIGGER fail_fingerprint BEFORE UPDATE OF prompt_fingerprint ON projects
    BEGIN SELECT RAISE(ABORT, 'fingerprint failure'); END;
  `),
    );
    await expect(open(directory)).rejects.toThrow('fingerprint failure');
    edit(directory, (raw) => {
      expect(
        raw.prepare("SELECT value FROM app_meta WHERE key = 'prompt_fingerprints_dirty:p0'").get()
          .value,
      ).toBe('1');
      expect(
        raw.prepare("SELECT prompt_fingerprint FROM projects WHERE id = 'p0'").get()
          .prompt_fingerprint,
      ).toBe(original);
      raw.exec('DROP TRIGGER fail_fingerprint');
    });
    api = await open(directory);
    expect(api.loadProject('p0').prompt_fingerprint).not.toBe(original);
    expect(api.backfillPromptFingerprints()).toBe(0);
  },
);

async function expectLiveCardSemantics(api) {
  for (const view of ['all', 'favorites', 'trash']) {
    const full = api.loadLibrary(view);
    const cards = structuredClone(await api.loadLibraryCards(view));
    expect(galleryFilterOptions(cards)).toEqual(galleryFilterOptions(full));
    for (const [index, card] of cards.entries()) {
      expect(card.id).toBe(full[index].id);
      const source = full[index];
      const structure = source.prompt_structure;
      expect(card.filter_tags).toEqual(
        [
          ...source.tags,
          ...(structure.base_undesired_tags || []),
          ...(structure.characters || []).flatMap((character) => [
            ...(character.prompt_tags || []),
            ...(character.undesired_tags || []),
          ]),
        ].map(({ tag, translation, category }) => ({
          tag,
          translation: translation || '',
          category,
        })),
      );
      const similarity = galleryBasePromptSimilarityPayload(source);
      expect(card.base_prompt_similarity).toEqual({
        prompt: [...similarity.prompt],
        undesired: [...similarity.undesired],
      });
      for (let other = 0; other < cards.length; other++)
        expect(galleryBasePromptSimilarity(card, cards[other])).toBe(
          galleryBasePromptSimilarity(full[index], full[other]),
        );
    }
    for (const promptScope of ['separate', 'full', 'base', 'similar']) {
      const shape = (items) =>
        galleryViewGroups(items, {}, { promptScope }).map((group) => ({
          ...group,
          members: group.members.map((item) => item.id),
          cover: group.cover.id,
        }));
      expect(shape(cards)).toEqual(shape(full));
    }
  }
}

it(
  'rebuilds a dropped derived table without changing cards or any original rows',
  { timeout: 20000 },
  async () => {
    const directory = temporary();
    let api = await open(directory);
    for (let i = 0; i < 3; i++) api.insertProject(sample(i));
    api.backfillPromptFingerprints();
    const before = structuredClone(await api.loadLibraryCards());
    const original = () =>
      edit(directory, (raw) =>
        Object.fromEntries(
          raw
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('library_card_cache', 'app_meta') ORDER BY name",
            )
            .all()
            .map(({ name }) => [name, raw.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]),
        ),
      );
    const rows = original();
    edit(directory, (raw) => raw.exec('DROP TABLE library_card_cache'));
    expect(await api.loadLibraryCards()).toEqual(before);
    expect(original()).toEqual(rows);
    api.close();
    edit(directory, (raw) => raw.exec('DROP TABLE library_card_cache'));
    api = await open(directory);
    expect(await api.loadLibraryCards()).toEqual(before);
    expect(original()).toEqual(rows);
    await expectLiveCardSemantics(api);
  },
);

it('invalidates dictionary translations, classification weights and deletions in memory and across reopen', async () => {
  const directory = temporary();
  let api = await open(directory);
  api.insertProject(sample(0));
  api.insertProject(sample(1));
  api.backfillPromptFingerprints();
  const before = structuredClone(await api.loadLibraryCards());
  api.updateTagDictionary('landscape', { translation: '风景', category: 'ArtistEra' });
  const changed = structuredClone(await api.loadLibraryCards());
  expect(changed[0].base_prompt_similarity).not.toEqual(before[0].base_prompt_similarity);
  expect(changed[0].filter_tags.find((t) => t.tag === 'landscape').translation).toBe('风景');
  await expectLiveCardSemantics(api);
  api.close();
  edit(directory, (raw) =>
    raw.exec(
      "UPDATE tag_dictionary SET category = 'Subject', translation = '旧引擎译文' WHERE tag = 'landscape'",
    ),
  );
  api = await open(directory);
  expect(
    (await api.loadLibraryCards())[0].filter_tags.find((t) => t.tag === 'landscape').translation,
  ).toBe('旧引擎译文');
  await expectLiveCardSemantics(api);
  api.deleteTagDictionary('landscape');
  expect(await api.loadLibraryCards()).toEqual(before);
  await expectLiveCardSemantics(api);
});

it('replaces the 010a cache format without altering original rows or public card values', async () => {
  const directory = temporary();
  let api = await open(directory);
  api.insertProject(sample(0));
  api.backfillPromptFingerprints();
  const before = await api.loadLibraryCards();
  const original = api.loadLibrary();
  api.close();
  edit(directory, (raw) =>
    raw.exec(`
    DROP TABLE library_card_cache;
    CREATE TABLE library_card_cache (
      project_id TEXT PRIMARY KEY, project_order INTEGER NOT NULL,
      created_at TEXT NOT NULL, is_favorite INTEGER NOT NULL,
      deleted_at TEXT NOT NULL, payload TEXT NOT NULL
    );
    INSERT INTO library_card_cache VALUES ('p0', 1, '', 0, '', 'obsolete payload');
    UPDATE app_meta SET value = '4:old-dictionary-signature' WHERE key = 'library_cards_version';
  `),
  );
  api = await open(directory);
  expect(await api.loadLibraryCards()).toEqual(before);
  expect(api.loadLibrary()).toEqual(original);
}, 30_000);

it('recomputes only dirty derivations and keeps live fields and covers current', async () => {
  const directory = temporary();
  let api = await open(directory);
  for (let i = 0; i < 3; i++) api.insertProject(sample(i));
  api.backfillPromptFingerprints();
  await api.loadLibraryCards();
  api.close();
  api = await open(directory);
  const prepare = DatabaseSync.prototype.prepare;
  const reads = [];
  vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (sql) {
    if (/FROM (generation_metadata|prompt_tags) WHERE project_id/.test(sql)) {
      const statement = prepare.call(this, sql);
      const all = statement.all.bind(statement);
      statement.all = (params) => {
        reads.push(params.$id);
        return all(params);
      };
      return statement;
    }
    return prepare.call(this, sql);
  });
  await api.loadLibraryCards();
  await api.loadLibraryCards();
  expect(reads).toEqual([]);
  edit(directory, (raw) =>
    raw.exec(
      "UPDATE tag_dictionary SET updated_at = 'timestamp-only', display_tag = 'display-only'",
    ),
  );
  await api.loadLibraryCards();
  expect(reads).toEqual([]);
  api.insertProject(sample(3));
  reads.length = 0;
  await api.loadLibraryCards();
  expect([...new Set(reads)]).toEqual(['p3']);
  reads.length = 0;
  api.updateProjectName('p0', 'Current name');
  api.updateProjects(['p1'], { deleted: true });
  reads.length = 0;
  const cards = await api.loadLibraryCards();
  expect([...new Set(reads)].sort()).toEqual(['p0', 'p1']);
  expect(cards.find((p) => p.id === 'p0')).toMatchObject({
    name: 'Current name',
    group_cover_id: '',
  });
  expect(cards.some((p) => p.id === 'p1')).toBe(false);
  reads.length = 0;
  edit(directory, (raw) => raw.exec("UPDATE prompt_tags SET weight = 1.8 WHERE project_id = 'p0'"));
  await api.loadLibraryCards();
  expect([...new Set(reads)]).toEqual(['p0']);
  reads.length = 0;
  // Repeated changes must not be hidden by an unconsumed fingerprint marker.
  edit(directory, (raw) => raw.exec("UPDATE prompt_tags SET weight = 0.6 WHERE project_id = 'p0'"));
  await api.loadLibraryCards();
  expect([...new Set(reads)]).toEqual(['p0']);
  reads.length = 0;
  edit(directory, (raw) =>
    raw.exec("BEGIN; UPDATE prompt_tags SET weight = 9 WHERE project_id = 'p2'; ROLLBACK"),
  );
  await api.loadLibraryCards();
  expect(reads).toEqual([]);
  vi.restoreAllMocks();
  await expectLiveCardSemantics(api);
}, 30_000);

it('ignores legacy cover overrides without migrating or losing images', async () => {
  const directory = temporary();
  const api = await open(directory);
  const first = sample(0);
  api.insertProject(first);
  api.insertProject({
    ...first,
    id: 'mirror',
    tags: first.tags.map((tag) => ({ ...tag, id: `mirror-${tag.id}` })),
  });
  api.backfillPromptFingerprints();
  edit(directory, (raw) =>
    raw
      .prepare('INSERT INTO prompt_group_covers VALUES (?,?)')
      .run(api.loadProject('p0').exact_group_fingerprint, 'mirror'),
  );
  const cards = await api.loadLibraryCards();
  expect(cards).toHaveLength(2);
  expect(cards.every((card) => card.group_cover_id === '')).toBe(true);
  await expectLiveCardSemantics(api);
});

it('invalidates populated caches after old-writer changes and original 010 trigger writes', async () => {
  const directory = temporary();
  let api = await open(directory);
  api.insertProject(sample(0));
  api.insertProject(sample(1));
  api.backfillPromptFingerprints();
  const before = structuredClone(await api.loadLibraryCards());
  api.close();
  edit(directory, (raw) => {
    raw.exec(
      "UPDATE prompt_tags SET weight = 1.8 WHERE project_id = 'p0'; UPDATE projects SET name = 'Old name' WHERE id = 'p0'; DELETE FROM projects WHERE id = 'p1'",
    );
    // A database first written by 010 has fingerprint-only tracking triggers.
    raw.exec(
      "DROP TRIGGER track_prompt_generation_metadata_update; CREATE TRIGGER track_prompt_generation_metadata_update AFTER UPDATE ON generation_metadata BEGIN INSERT OR REPLACE INTO app_meta(key,value) VALUES ('prompt_fingerprints_dirty:' || NEW.project_id, '1'); END;",
    );
    raw.exec(
      "UPDATE generation_metadata SET negative_prompt = 'new negative', prompt_structure_json = '{}' WHERE project_id = 'p0'",
    );
  });
  api = await open(directory);
  expect(await api.loadLibraryCards()).not.toEqual(before);
  expect(await api.loadLibraryCards()).toHaveLength(1);
  expect((await api.loadLibraryCards())[0].name).toBe('Old name');
  await expectLiveCardSemantics(api);
  const after = structuredClone(await api.loadLibraryCards());
  api.backfillPromptFingerprints();
  expect(await api.loadLibraryCards()).toEqual(after);
}, 30_000);

it('rolls cache writes and consumed markers back on failure and retries without stale memory', async () => {
  const directory = temporary();
  const api = await open(directory);
  api.insertProject(sample(0));
  api.backfillPromptFingerprints();
  await api.loadLibraryCards();
  edit(directory, (raw) =>
    raw.exec(`
    UPDATE prompt_tags SET weight = 1.8 WHERE project_id = 'p0';
    CREATE TRIGGER fail_card BEFORE INSERT ON library_card_cache BEGIN SELECT RAISE(ABORT, 'cache failure'); END;
  `),
  );
  await expect(api.loadLibraryCards()).rejects.toThrow('cache failure');
  edit(directory, (raw) => {
    expect(
      raw.prepare("SELECT value FROM app_meta WHERE key = 'library_cards_dirty:p0'").get().value,
    ).toBe('1');
    raw.exec('DROP TRIGGER fail_card');
  });
  await expectLiveCardSemantics(api);
});

it('applies dictionary changes without reading metadata or rewriting persistent cards', async () => {
  const directory = temporary();
  const api = await open(directory);
  for (let i = 0; i < 6; i++) api.insertProject(sample(i));
  await api.loadLibraryCards();
  const payloads = () =>
    edit(directory, (raw) =>
      raw.prepare('SELECT * FROM library_card_cache ORDER BY project_id').all(),
    );
  const before = payloads();
  const statements = [];
  const prepare = DatabaseSync.prototype.prepare;
  vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (sql) {
    statements.push(sql);
    return prepare.call(this, sql);
  });
  api.updateTagDictionary('landscape', { translation: '新的译文', category: 'ArtistEra' });
  const cards = await api.loadLibraryCards();
  expect(statements.some((sql) => /FROM (generation_metadata|prompt_tags)/.test(sql))).toBe(false);
  expect(statements.some((sql) => /INSERT.*library_card_cache/.test(sql))).toBe(false);
  vi.restoreAllMocks();
  expect(payloads()).toEqual(before);
  expect(
    cards.every((card) => card.filter_tags.some((tag) => tag.translation === '新的译文')),
  ).toBe(true);
  await expectLiveCardSemantics(api);
  edit(directory, (raw) => raw.exec('DROP TABLE library_card_cache'));
  expect(await api.loadLibraryCards()).toEqual(cards);
});

it('preserves the full reader weight clamp for non-finite legacy SQLite values', async () => {
  const directory = temporary();
  const api = await open(directory);
  api.insertProject(sample(0));
  for (const weight of [Infinity, -Infinity]) {
    edit(directory, (raw) =>
      raw.prepare("UPDATE prompt_tags SET weight = ? WHERE tag = 'red_hair'").run(weight),
    );
    await expectLiveCardSemantics(api);
  }
});

it('shares one complete build across views and reconciles every write between batches', async () => {
  const directory = temporary();
  const api = await open(directory);
  api.insertProjects(Array.from({ length: 51 }, (_, i) => sample(i)));
  const insertions = [];
  const prepare = DatabaseSync.prototype.prepare;
  vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (sql) {
    const statement = prepare.call(this, sql);
    if (sql.includes('INSERT OR REPLACE INTO library_card_cache')) {
      const run = statement.run.bind(statement);
      statement.run = (params) => {
        insertions.push(params.$id);
        return run(params);
      };
    }
    return statement;
  });
  const progress = [];
  let scheduled = false;
  let wrote = false;
  const first = api
    .loadLibraryCards('all', (value) => {
      progress.push(value);
      if (!scheduled && value.completed > 0 && value.completed < value.total) {
        scheduled = true;
        setImmediate(() => {
          api.insertProject(sample(100));
          api.updateProjectName('p0', 'Changed during build');
          api.updateProjects(['p2'], { deleted: true });
          edit(directory, (raw) => {
            raw.exec("DELETE FROM projects WHERE id = 'p1'");
            raw.exec("UPDATE prompt_tags SET weight = 1.7 WHERE project_id = 'p50'");
          });
          api.updateTagDictionary('landscape', {
            category: 'ArtistEra',
            translation: '建立期间修改',
          });
          wrote = true;
        });
      }
    })
    .then((cards) => {
      expect(wrote).toBe(true);
      return cards;
    });
  const [cards, same, trash] = await Promise.all([
    first,
    api.loadLibraryCards(),
    api.loadLibraryCards('trash'),
  ]);
  expect(same).toEqual(cards);
  expect(cards).toHaveLength(50);
  expect(trash.map((card) => card.id)).toEqual(['p2']);
  expect(cards.find((card) => card.id === 'p0').name).toBe('Changed during build');
  expect(cards.find((card) => card.id === 'p100')).toBeDefined();
  expect(
    cards
      .flatMap((card) => card.filter_tags)
      .filter((tag) => tag.tag === 'landscape')
      .every((tag) => tag.translation === '建立期间修改'),
  ).toBe(true);
  expect(insertions.filter((id) => id === 'p3')).toHaveLength(1);
  expect(progress.at(-1)).toEqual({ completed: 51, total: 51 });
  expect(progress.every((value) => value.completed >= 0 && value.completed <= value.total)).toBe(
    true,
  );
  vi.restoreAllMocks();
  edit(directory, (raw) => raw.exec('DROP TABLE library_card_cache'));
  expect(await api.loadLibraryCards()).toEqual(cards);
  expect(await api.loadLibraryCards('trash')).toEqual(trash);
}, 30_000);

it('keeps completed monotonic while deletions and imports change the build total', async () => {
  const directory = temporary();
  const api = await open(directory);
  api.insertProjects(Array.from({ length: 51 }, (_, i) => sample(i)));
  const progress = [];
  let removed = false;
  let imported = false;
  const cards = await api.loadLibraryCards('all', (value) => {
    progress.push(value);
    if (!removed && value.completed >= 50) {
      removed = true;
      edit(directory, (raw) =>
        raw.exec('DELETE FROM projects WHERE id IN (SELECT project_id FROM library_card_cache)'),
      );
    } else if (removed && !imported && value.total < 51) {
      imported = true;
      api.insertProject(sample(100));
    }
  });
  expect(removed && imported).toBe(true);
  expect(progress.every((p, i) => i === 0 || p.completed >= progress[i - 1].completed)).toBe(true);
  expect(progress.some((p, i) => i > 0 && p.total < progress[i - 1].total)).toBe(true);
  expect(progress.some((p, i) => i > 0 && p.total > progress[i - 1].total)).toBe(true);
  expect(cards).toHaveLength(api.loadLibrary().length);
  expect(cards.some((p) => p.id === 'p100')).toBe(true);
}, 30_000);

it('uses the resolved list as completion even when terminal progress delivery is delayed', async () => {
  // Three one-row batches preserve intermediate and delayed terminal delivery
  // without generating dozens of unrelated cards or relying on machine speed.
  const api = await open(temporary(), { cardBuildSchedule: { rowsPerBatch: 1 } });
  api.insertProjects(Array.from({ length: 3 }, (_, i) => sample(i)));
  const received = [];
  const delayed = [];
  let listening = true;
  const cards = await api.loadLibraryCards('all', (value) => {
    if (value.completed === value.total) delayed.push(() => listening && received.push(value));
    else received.push(value);
  });
  listening = false;
  delayed.forEach((deliver) => deliver());
  expect(cards).toHaveLength(3);
  expect(delayed.length).toBeGreaterThan(0);
  expect(received.some((p) => p.completed > 0 && p.completed < p.total)).toBe(true);
  expect(received.every((p) => p.completed < p.total)).toBe(true);
}, 30_000);

it('returns complete empty and hot lists without any progress events', async () => {
  const api = await open(temporary());
  const progress = vi.fn();
  expect(await api.loadLibraryCards('all', progress)).toEqual([]);
  expect(progress).not.toHaveBeenCalled();
  api.insertProject(sample(0));
  await api.loadLibraryCards();
  expect(await api.loadLibraryCards('all', progress)).toHaveLength(1);
  expect(progress).not.toHaveBeenCalled();
});

it('rejects pending readers on close and resumes committed batches on reopen', async () => {
  const directory = temporary();
  let api = await open(directory);
  api.insertProjects(Array.from({ length: 51 }, (_, i) => sample(i)));
  let interrupted = false;
  await expect(
    api.loadLibraryCards('all', ({ completed, total }) => {
      if (completed > 0 && completed < total && !interrupted) {
        interrupted = true;
        api.close();
      }
    }),
  ).rejects.toThrow('Database closed during card cache build');
  expect(interrupted).toBe(true);
  const saved = edit(
    directory,
    (raw) => raw.prepare('SELECT count(*) AS n FROM library_card_cache').get().n,
  );
  expect(saved).toBeGreaterThan(0);
  expect(saved).toBeLessThan(51);
  api = await open(directory);
  const cards = await api.loadLibraryCards();
  expect(cards).toHaveLength(51);
  edit(directory, (raw) => raw.exec('DROP TABLE library_card_cache'));
  expect(await api.loadLibraryCards()).toEqual(cards);
}, 30_000);

it.each(['committed', 'in-flight'])(
  'recovers a cache build after its own worker is killed at %s',
  async (mode) => {
    const directory = temporary();
    let api = await open(directory);
    api.insertProjects(Array.from({ length: 60 }, (_, i) => sample(i)));
    api.close();
    await new Promise((resolve, reject) => {
      const child = fork(
        fileURLToPath(
          new URL('../scripts/data-layer/card-cache-crash-worker.mjs', import.meta.url),
        ),
        [directory, mode],
        { silent: true, execArgv: [] },
      );
      let ready = false;
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.stdout.resume();
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(Error('cache crash worker timeout'));
      }, 15000);
      child.on('message', (message) => {
        if (message.ready) {
          ready = true;
          child.kill('SIGKILL');
        }
      });
      child.on('error', reject);
      child.on('exit', () => {
        clearTimeout(timer);
        ready ? resolve() : reject(Error(stderr));
      });
    });
    api = await open(directory);
    expect(
      edit(directory, (raw) => raw.prepare('PRAGMA integrity_check').get().integrity_check),
    ).toBe('ok');
    const cards = await api.loadLibraryCards();
    expect(cards).toHaveLength(60);
    edit(directory, (raw) => raw.exec('DROP TABLE library_card_cache'));
    expect(await api.loadLibraryCards()).toEqual(cards);
  },
);

it.each([1, 25])(
  'builds fixed batches of %i rows without changing the process clock',
  async (rowsPerBatch) => {
    const clock = performance.now;
    const api = await open(temporary(), { cardBuildSchedule: { rowsPerBatch } });
    api.insertProjects(Array.from({ length: 51 }, (_, i) => sample(i)));
    const progress = [];
    const cards = await api.loadLibraryCards('all', (value) => progress.push(value));
    expect(cards).toHaveLength(51);
    const completed = [...new Set(progress.map((value) => value.completed))];
    expect(completed).toEqual([
      0,
      ...Array.from({ length: Math.ceil(51 / rowsPerBatch) }, (_, i) =>
        Math.min((i + 1) * rowsPerBatch, 51),
      ),
    ]);
    expect(performance.now).toBe(clock);
  },
);
it('keeps generated image identities without projecting an original work cover', async () => {
  const directory = temporary();
  const api = await open(directory);
  api.insertProject(sample(0));
  const original = {
    image_path: '/synthetic/original.png',
    thumbnail_path: '/synthetic/thumb.png',
    metadata: { width: 1216, height: 832 },
    prompt_raw: 'not included in cards',
  };
  edit(directory, (raw) => {
    raw
      .prepare('INSERT INTO works VALUES (?,?,?,?)')
      .run('work', JSON.stringify(original), 'null', '2026-01-01');
    raw
      .prepare('INSERT INTO work_versions VALUES (?,?,?,?,?,?,?,?,?)')
      .run('version', 'work', null, 1, 'version', 0, '{}', 'user', '2026-01-01');
    raw
      .prepare('INSERT INTO version_images VALUES (?,?,?,?,?)')
      .run('image', 'version', 'p0', '1', '2026-01-02');
  });
  const cards = await api.loadLibraryCards();
  expect(cards[0]).not.toHaveProperty('work_cover');
  expect(cards[0].id).toBe('p0');
  expect(api.loadProject('p0')).not.toHaveProperty('work_cover');
});
