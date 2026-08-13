import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database.js';

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
  it('stores image, prompt structure, metadata, and no library concepts', async () => {
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

  it('groups seed variants with a stable Prompt fingerprint and persists a valid cover', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-core-db-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    database.insertProject(project('project-1'));
    database.insertProject({ ...project('project-2'), metadata: { ...project('project-2').metadata, seed: '999' } });
    const loaded = database.loadLibrary();
    expect(loaded[0].prompt_fingerprint).toBeTruthy();
    expect(loaded[0].prompt_fingerprint).toBe(loaded[1].prompt_fingerprint);
    database.setGroupCover(loaded[0].prompt_fingerprint, 'project-1');
    expect(database.loadLibrary().every((entry) => entry.group_cover_id === 'project-1')).toBe(true);
    database.deleteProject('project-1');
    expect(database.loadLibrary()[0].group_cover_id).toBe('');
  });
});
