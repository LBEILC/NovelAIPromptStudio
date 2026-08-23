import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_GALLERY_COLLECTION_ID, openDatabase } from './database.js';

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function project(id = 'project-1') {
  const now = new Date().toISOString();
  return {
    id,
    name: 'Structured prompt',
    image_path: `${id}.png`,
    thumbnail_path: `${id}.webp`,
    content_hash: `hash-${id}`,
    created_at: now,
    updated_at: now,
    tags: [{ id: `${id}-tag`, tag: 'artist:ciloranko', translation: '', category: 'ArtistEra', weight: 1.1, raw_segment: '', syntax_issue: '', brace_depth: 2, brace_group: 'artists', brace_trailing_comma: true }],
    prompt_structure: {
      base_undesired_tags: [{ id: `${id}-uc`, tag: 'lowres', translation: '', category: 'Unsorted', weight: 1 }],
      use_coords: true,
      use_order: true,
      characters: [{ id: `${id}-character`, label: 'Character 1', prompt_tags: [{ id: `${id}-char-tag`, tag: 'girl', translation: '', category: 'Subject', weight: 1 }], undesired_tags: [], center: { x: 0.3, y: 0.5 } }],
    },
    metadata: { prompt_raw: 'artist:ciloranko', negative_prompt: 'lowres', model: 'nai-v4.5', seed: '42', width: 832, height: 1216, extra_json: '{"source":"test"}' },
  };
}

describe('phase 2 core database', () => {
  it('stores image, prompt structure, metadata, and excludes retired branch concepts', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.insertProject(project());
    const loaded = database.loadLibrary()[0];
    expect(loaded).toMatchObject({ name: 'Structured prompt', content_hash: 'hash-project-1' });
    expect(loaded.tags[0]).toMatchObject({ tag: 'artist:ciloranko', weight: 1.1, brace_depth: 2, brace_group: 'artists', brace_trailing_comma: 1 });
    expect(loaded.prompt_structure.characters[0]).toMatchObject({ center: { x: 0.3, y: 0.5 }, prompt_tags: [{ tag: 'girl' }] });
    expect(loaded.metadata).toMatchObject({ seed: '42', width: 832, height: 1216 });
    expect(database.loadVibeLibrary).toBeUndefined();
    expect(database.createBranch).toBeUndefined();
  });

  it('reuses manual translation and classification across workbench images', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.updateTagDictionary('artist:ciloranko', { translation: '画师 Ciloranko', category: 'ArtistEra' });
    const enriched = database.enrichProjectTags(project('fresh'));
    expect(enriched.tags[0]).toMatchObject({ translation: '画师 Ciloranko', category: 'ArtistEra', translation_source: 'manual', category_source: 'manual' });
  });

  it('persists positive and negative Danbooru tag checks by normalized name', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.upsertDanbooruTagCache([
      { tag: 'yamamoto souichirou', canonical_tag: 'yamamoto_souichirou', category: 1, post_count: 2028, checked_at: '2026-08-13T00:00:00.000Z' },
      { tag: 'not an artist', canonical_tag: 'not_an_artist', category: -1, checked_at: '2026-08-13T00:00:00.000Z' },
    ]);
    database.persist();
    const reopened = await openDatabase(directory);
    const cached = reopened.lookupDanbooruTagCache(['Yamamoto_Souichirou', 'not an artist']);
    expect(cached.get('yamamoto_souichirou')).toMatchObject({ category: 1, canonical_tag: 'yamamoto_souichirou', post_count: 2028 });
    expect(cached.get('not_an_artist')).toMatchObject({ category: -1 });
  });

  it('searches, filters, edits, paginates, and deletes Tag cache entries', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.upsertTagDictionary([
      {
        tag: 'light gray ribbed knit sleeveless turtleneck top',
        translation: '浅灰色罗纹针织无袖高领上衣',
        category: 'Clothing',
        has_translation: true,
        has_classification: true,
        translation_source: 'ai',
        category_source: 'rule',
      },
      {
        tag: 'bagpipe (arknights)',
        translation: '风笛（明日方舟）',
        category: 'Identity',
        has_translation: true,
        has_classification: true,
        translation_source: 'ai',
        category_source: 'danbooru',
      },
      {
        tag: 'yamamoto souichirou',
        translation: '画师:yamamoto souichirou',
        category: 'ArtistEra',
        has_translation: true,
        has_classification: true,
        translation_source: 'danbooru',
        category_source: 'danbooru',
      },
    ]);

    expect(database.listTagDictionary({ query: '浅灰色' })).toMatchObject({
      total: 1,
      items: [{ tag: 'light gray ribbed knit sleeveless turtleneck top', category: 'Clothing' }],
    });
    expect(database.listTagDictionary({ category: 'Identity' })).toMatchObject({
      total: 1,
      items: [{ tag: 'bagpipe (arknights)' }],
    });
    expect(database.listTagDictionary({ source: 'danbooru' }).total).toBe(2);
    expect(database.listTagDictionary({ limit: 1, offset: 1 })).toMatchObject({ total: 3, limit: 1, offset: 1 });

    expect(database.updateTagDictionary('bagpipe (arknights)', {
      translation: '风笛',
      category: 'Identity',
    })).toMatchObject({ translation: '风笛', translation_source: 'manual', category_source: 'manual' });
    expect(database.updateTagDictionaryCategory([
      'light gray ribbed knit sleeveless turtleneck top',
      'bagpipe (arknights)',
      'missing tag',
    ], 'Body')).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'light gray ribbed knit sleeveless turtleneck top', category: 'Body', category_source: 'manual' }),
      expect.objectContaining({ tag: 'bagpipe (arknights)', category: 'Body', category_source: 'manual' }),
    ]));

    database.upsertDanbooruTagCache([{
      tag: 'bagpipe (arknights)',
      canonical_tag: 'bagpipe_(arknights)',
      category: 4,
      checked_at: '2026-08-13T00:00:00.000Z',
    }]);
    expect(database.deleteTagDictionary('bagpipe (arknights)')).toBe(true);
    expect(database.lookupTagDictionary(['bagpipe (arknights)']).size).toBe(0);
    expect(database.lookupDanbooruTagCache(['bagpipe (arknights)']).size).toBe(0);
    expect(database.deleteTagDictionary('bagpipe (arknights)')).toBe(false);
    expect(database.deleteTagDictionaries([
      'light gray ribbed knit sleeveless turtleneck top',
      'yamamoto souichirou',
      'missing tag',
    ])).toBe(2);
    expect(database.listTagDictionary().total).toBe(0);
  });

  it('keeps manual and Danbooru knowledge above DSO, and DSO above local rules and AI', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    const tag = 'red hair';
    database.upsertTagDictionary([{
      tag,
      translation: '红色头发（AI）',
      category: 'Body',
      has_translation: true,
      has_classification: true,
      translation_source: 'ai',
      category_source: 'ai',
    }]);
    database.upsertTagDictionary([{
      tag,
      translation: '红发',
      category: 'Clothing',
      has_translation: true,
      has_classification: true,
      translation_source: 'dso',
      category_source: 'dso',
    }]);
    database.upsertTagDictionary([{
      tag,
      translation: '规则译名',
      category: 'Body',
      has_translation: true,
      has_classification: true,
      translation_source: 'rule',
      category_source: 'rule',
    }]);
    expect(database.lookupTagDictionary([tag]).get(tag)).toMatchObject({
      translation: '红发',
      category: 'Clothing',
      translation_source: 'dso',
      category_source: 'dso',
    });
    const clothingProject = project('dso-priority');
    clothingProject.tags = [{ ...clothingProject.tags[0], tag, category: 'Body', category_source: 'rule' }];
    expect(database.enrichProjectTags(clothingProject).tags[0]).toMatchObject({ category: 'Clothing', category_source: 'dso' });

    database.updateTagDictionary(tag, { translation: '我的红发', category: 'StyleQuality' });
    database.upsertTagDictionary([{
      tag,
      translation: 'DSO 新译名',
      category: 'Body',
      has_translation: true,
      has_classification: true,
      translation_source: 'dso',
      category_source: 'dso',
    }]);
    expect(database.lookupTagDictionary([tag]).get(tag)).toMatchObject({
      translation: '我的红发',
      category: 'StyleQuality',
      translation_source: 'manual',
      category_source: 'manual',
    });
    expect(database.listTagDictionary({ source: 'dso' }).total).toBe(0);
  });

  it('does not let an old AI Unsorted cache override a clear clothing rule', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    const tag = 'light gray ribbed knit sleeveless turtleneck top';
    database.upsertTagDictionary([{
      tag,
      translation: '浅灰色罗纹针织无袖高领上衣',
      category: 'Unsorted',
      has_translation: true,
      has_classification: true,
      translation_source: 'ai',
      category_source: 'ai',
    }]);
    const clothingProject = project('clothing');
    clothingProject.tags = [{ ...clothingProject.tags[0], tag, category: 'Unsorted', category_source: 'heuristic' }];
    const enriched = database.enrichProjectTags(clothingProject);
    expect(enriched.tags[0]).toMatchObject({
      translation: '浅灰色罗纹针织无袖高领上衣',
      category: 'Clothing',
      category_source: 'rule',
    });
    database.upsertTagDictionary([{
      tag,
      translation: enriched.tags[0].translation,
      category: enriched.tags[0].category,
      has_translation: true,
      has_classification: true,
      translation_source: 'cache',
      category_source: 'rule',
    }]);
    expect(database.lookupTagDictionary([tag]).get(tag)).toMatchObject({ category: 'Clothing', category_source: 'rule' });
  });

  it('creates one immutable pre-phase2 backup before reopening an existing database', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const first = await openDatabase(directory);
    first.insertProject(project());
    const expected = fs.readFileSync(first.filePath);
    const second = await openDatabase(directory);
    expect(fs.existsSync(second.backupPath)).toBe(true);
    expect(fs.readFileSync(second.backupPath)).toEqual(expected);
    second.insertProject(project('project-2'));
    expect(fs.readFileSync(second.backupPath)).toEqual(expected);
  });

  it('supports hash and dimension repair and permanent library removal', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    const missing = { ...project(), content_hash: '', metadata: { ...project().metadata, width: 0, height: 0 } };
    database.insertProject(missing);
    expect(database.projectHashCandidates()).toEqual([{ id: 'project-1', image_path: 'project-1.png' }]);
    expect(database.projectDimensionCandidates()).toEqual([{ id: 'project-1', image_path: 'project-1.png' }]);
    database.setProjectContentHashes([{ id: 'project-1', content_hash: 'repaired' }]);
    database.setProjectDimensions([{ id: 'project-1', width: 640, height: 960 }]);
    expect(database.loadProject('project-1')).toMatchObject({ content_hash: 'repaired', metadata: { width: 640, height: 960 } });
    database.deleteProject('project-1');
    expect(database.loadLibrary()).toEqual([]);
  });

  it('relocates only project asset paths inside the previous asset directory', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const oldAssets = path.join(directory, 'old-assets');
    const newAssets = path.join(directory, 'new-assets');
    const database = await openDatabase(directory);
    database.insertProject({
      ...project(),
      image_path: path.join(oldAssets, 'images', 'project-1.png'),
      thumbnail_path: path.join(oldAssets, 'thumbnails', 'project-1.webp'),
    });

    expect(database.relocateAssetPaths(oldAssets, newAssets)).toBe(1);
    expect(database.loadProject('project-1')).toMatchObject({
      image_path: path.join(newAssets, 'images', 'project-1.png'),
      thumbnail_path: path.join(newAssets, 'thumbnails', 'project-1.webp'),
    });
  });

  it('supports favorites, rename, soft deletion, restoration, and view queries', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.insertProject(project());
    expect(database.updateProjectName('project-1', '  新名称  ')).toMatchObject({ name: '新名称' });
    expect(database.updateProjects(['project-1'], { isFavorite: true }).success).toEqual(['project-1']);
    expect(database.loadLibrary('favorites')).toHaveLength(1);
    expect(database.updateProjects(['project-1'], { deleted: true }).success).toEqual(['project-1']);
    expect(database.loadLibrary('all')).toEqual([]);
    expect(database.loadLibrary('favorites')).toEqual([]);
    expect(database.loadLibrary('trash')[0]).toMatchObject({ id: 'project-1', is_favorite: 1 });
    expect(() => database.updateProjectName('project-1', 'trashed')).toThrow('恢复');
    database.updateProjects(['project-1'], { deleted: false });
    expect(database.loadLibrary('favorites')).toHaveLength(1);
  });

  it('persists manual and smart collections without copying image records', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.insertProject(project('project-1'));
    database.insertProject(project('project-2'));

    expect(database.createCollection({ id: 'manual-1', name: '  灵感图  ', kind: 'manual' })).toMatchObject({
      id: 'manual-1',
      kind: 'manual',
      name: '灵感图',
      member_ids: [],
    });
    expect(database.updateCollectionProjects('manual-1', ['project-1', 'project-2'], 'add').success).toEqual(['project-1', 'project-2']);
    expect(database.updateCollectionProjects('manual-1', ['project-2'], 'remove').success).toEqual(['project-2']);
    expect(database.createCollection({
      id: 'smart-1',
      name: '风笛',
      kind: 'smart',
      filters: { includeTags: ['girl'], tagMatch: 'all' },
    })).toMatchObject({
      id: 'smart-1',
      kind: 'smart',
      filters: { includeTags: ['girl'], tagMatch: 'all' },
      member_ids: [],
    });
    expect(() => database.updateCollectionProjects('smart-1', ['project-1'], 'add')).toThrow('自动管理');

    const reopened = await openDatabase(directory);
    expect(reopened.listCollections()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'manual-1', member_ids: ['project-1'], active_member_count: 1 }),
      expect.objectContaining({ id: 'smart-1', filters: expect.objectContaining({ includeTags: ['girl'] }) }),
    ]));
    expect(reopened.updateCollection('smart-1', { name: '角色图', filters: { models: ['nai-v4.5'] } })).toMatchObject({
      name: '角色图',
      filters: { models: ['nai-v4.5'] },
    });
  });

  it('migrates every legacy favorite into the default collection exactly once', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.insertProject(project('active-favorite'));
    database.insertProject(project('trashed-favorite'));
    database.insertProject(project('ordinary'));
    database.updateProjects(['active-favorite', 'trashed-favorite'], { isFavorite: true });
    database.updateProjects(['trashed-favorite'], { deleted: true });

    const defaultCollection = database.listCollections().find((collection) => collection.id === DEFAULT_GALLERY_COLLECTION_ID);
    expect(defaultCollection).toMatchObject({
      name: '默认收藏夹',
      kind: 'manual',
      active_member_count: 1,
    });
    expect(defaultCollection.member_ids.sort()).toEqual(['active-favorite', 'trashed-favorite']);

    database.updateCollectionProjects(DEFAULT_GALLERY_COLLECTION_ID, ['active-favorite'], 'remove');
    const reopened = await openDatabase(directory);
    expect(reopened.listCollections().find((collection) => collection.id === DEFAULT_GALLERY_COLLECTION_ID)?.member_ids).toEqual(['trashed-favorite']);
    expect(reopened.loadProject('active-favorite')).toMatchObject({ is_favorite: 1 });
  });

  it('keeps collection membership through trash and cascades it on permanent deletion', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.insertProject(project());
    database.createCollection({ id: 'manual-1', name: '保留', kind: 'manual' });
    database.updateCollectionProjects('manual-1', ['project-1'], 'add');

    database.updateProjects(['project-1'], { deleted: true });
    const manualCollection = () => database.listCollections().find((collection) => collection.id === 'manual-1');
    expect(manualCollection()).toMatchObject({ member_ids: ['project-1'], active_member_count: 0 });
    database.updateProjects(['project-1'], { deleted: false });
    expect(manualCollection().active_member_count).toBe(1);
    database.deleteProject('project-1');
    expect(manualCollection().member_ids).toEqual([]);
    expect(database.deleteCollection('manual-1')).toBe(true);
    expect(database.listCollections().map((collection) => collection.id)).toEqual([DEFAULT_GALLERY_COLLECTION_ID]);
  });

  it('groups seed variants with a stable Prompt fingerprint and persists a valid cover', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.insertProject(project('project-1'));
    database.insertProject({ ...project('project-2'), metadata: { ...project('project-2').metadata, seed: '999' } });
    const loaded = database.loadLibrary();
    expect(loaded[0].prompt_fingerprint).toBeTruthy();
    expect(loaded[0].prompt_fingerprint).toBe(loaded[1].prompt_fingerprint);
    expect(loaded[0].base_prompt_fingerprint).toBeTruthy();
    expect(loaded[0].exact_group_fingerprint).toBe(loaded[1].exact_group_fingerprint);
    database.setGroupCover(loaded[0].exact_group_fingerprint, 'project-1');
    expect(database.loadLibrary().every((entry) => entry.group_cover_id === 'project-1')).toBe(true);
    database.deleteProject('project-1');
    expect(database.loadLibrary()[0].group_cover_id).toBe('');
  });

  it('keeps Vibe and generation model inside the persistent exact-group boundary', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.insertProject({ ...project('vibe-a'), metadata: { ...project('vibe-a').metadata, vibe_fingerprint: 'vibe-a' } });
    database.insertProject({ ...project('vibe-b'), metadata: { ...project('vibe-b').metadata, vibe_fingerprint: 'vibe-b' } });
    database.insertProject({ ...project('model-b'), metadata: { ...project('model-b').metadata, model: 'nai-v4.5-curated', vibe_fingerprint: 'vibe-a' } });
    const loaded = database.loadLibrary();
    const first = loaded.find((entry) => entry.id === 'vibe-a');
    const differentVibe = loaded.find((entry) => entry.id === 'vibe-b');
    const differentModel = loaded.find((entry) => entry.id === 'model-b');

    expect(first.prompt_fingerprint).toBe(differentVibe.prompt_fingerprint);
    expect(first.exact_group_fingerprint).not.toBe(differentVibe.exact_group_fingerprint);
    expect(first.exact_group_fingerprint).not.toBe(differentModel.exact_group_fingerprint);
    expect(() => database.setGroupCover(first.exact_group_fingerprint, differentVibe.id)).toThrow('图片不属于当前图片组');
  });
});
