import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { openDatabase } from './database.js';
import { galleryViewGroups } from '../src/lib/gallery.js';
import { galleryBasePromptSimilarity } from '../src/lib/galleryGrouping.js';
import { filterGalleryProjects, galleryFilterOptions } from '../src/lib/galleryFilters.js';
import { galleryCollectionScope } from '../src/lib/galleryCollections.js';

const directories = [];
const connections = [];
async function open(directory) {
  const api = await openDatabase(directory);
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
  api.setGroupCover(api.loadProject('p0').exact_group_fingerprint, 'p0');
  const projectIds = (items) => items.map((p) => p.id);
  const groupShape = (groups) =>
    groups.map((g) => ({ ...g, members: projectIds(g.members), cover: g.cover.id }));
  for (const view of ['all', 'favorites', 'trash']) {
    const full = api.loadLibrary(view);
    const cards = structuredClone(api.loadLibraryCards(view));
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
  expect(filterGalleryProjects(api.loadLibraryCards(), { query: 'zephyr' }).length).toBeGreaterThan(
    0,
  );
  expect(
    filterGalleryProjects(api.loadLibraryCards(), { query: 'character prose' }).length,
  ).toBeGreaterThan(0);
  expect(api.loadProject('missing')).toBeNull();
  expect(api.loadLibraryCards().some((card) => card.base_prompt_fingerprint === null)).toBe(true);
  expect(
    galleryViewGroups(api.loadLibraryCards(), {}, { promptScope: 'full', mergeVibes: true }).length,
  ).toBeLessThan(
    galleryViewGroups(api.loadLibraryCards(), {}, { promptScope: 'full', mergeVibes: false })
      .length,
  );
});

function hydrationSpy() {
  const prepare = DatabaseSync.prototype.prepare;
  const ids = [];
  vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (sql) {
    const statement = prepare.call(this, sql);
    if (sql === 'SELECT * FROM generation_metadata WHERE project_id = $id') {
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

it('aliases only identical base fingerprints and preserves independent or malformed legacy values', async () => {
  const directory = temporary();
  const api = await open(directory);
  api.insertProject(sample(0));
  expect(api.loadLibraryCards()[0].base_prompt_fingerprint).toBeNull();
  edit(directory, (raw) =>
    raw.exec(
      "UPDATE projects SET base_prompt_fingerprint = 'independent', prompt_fingerprint = 'legacy non-JSON'",
    ),
  );
  expect(api.loadLibraryCards()[0].base_prompt_fingerprint).toBe('independent');
  for (const promptScope of ['full', 'base']) {
    expect(
      galleryViewGroups(api.loadLibraryCards(), {}, { promptScope }).map((group) => group.key),
    ).toEqual(galleryViewGroups(api.loadLibrary(), {}, { promptScope }).map((group) => group.key));
  }
  api.insertProject({ ...sample(1), tags: [], prompt_structure: {}, metadata: {} });
  expect(api.loadLibraryCards().find((card) => card.id === 'p1').base_prompt_fingerprint).toBe('');
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
});

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
    api.loadLibraryCards()[0].filter_tags.find((tag) => tag.tag === 'landscape').translation,
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
});

it('preserves dirty markers and previous fingerprints when startup repair fails', async () => {
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
});
