import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database.js';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('prompt structure persistence', () => {
  it('stores base undesired content, character prompts, and positions', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-database-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    const now = new Date().toISOString();
    const project = {
      id: 'project-1',
      name: 'Structured prompt',
      image_path: 'image.png',
      thumbnail_path: 'thumb.webp',
      created_at: now,
      updated_at: now,
      tags: [{ id: 'base-tag', tag: 'year2025', translation: '', category: 'Character', weight: 1, note: '', raw_segment: '::year2025 ::', syntax_issue: 'emphasis_closer' }],
      prompt_structure: {
        base_undesired_tags: [{ id: 'base-uc', tag: 'lowres', translation: '', category: 'Unsorted', weight: 1, note: '' }],
        use_coords: true,
        use_order: true,
        characters: [{
          id: 'character-1',
          label: 'Character 1',
          prompt_tags: [{ id: 'char-tag', tag: 'girl', translation: '', category: 'Character', weight: 1, note: '' }],
          undesired_tags: [{ id: 'char-uc', tag: 'blue hair', translation: '', category: 'Character', weight: 1, note: '' }],
          center: { x: 0.3, y: 0.5 },
        }],
      },
      metadata: {
        prompt_raw: '2girls',
        negative_prompt: 'lowres',
        generation_mode: 'inpainting',
        extra_json: JSON.stringify({ parsed: { request_type: 'NativeInfillingRequest' } }),
      },
      vibes: [],
      versions: [],
    };

    database.insertProject(project);
    const loaded = database.loadLibrary()[0];
    expect(loaded.prompt_structure).toMatchObject({
      use_coords: true,
      characters: [{ center: { x: 0.3, y: 0.5 }, prompt_tags: [{ tag: 'girl' }], undesired_tags: [{ tag: 'blue hair' }] }],
    });
    expect(loaded.tags[0]).toMatchObject({ raw_segment: '::year2025 ::', syntax_issue: 'emphasis_closer' });
    expect(loaded.metadata.generation_mode).toBe('inpainting');
  });

  it('stores reusable encoded Vibes and project links', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-database-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    const now = new Date().toISOString();
    const libraryEntry = {
      id: 'encoding-fingerprint',
      name: 'Reusable style',
      source_kind: 'naiv4vibe',
      original_vibe_id: 'original',
      reference_image: 'reference.png',
      vibe_file: 'style.naiv4vibe',
      thumbnail_path: 'thumb.webp',
      model: 'nai-diffusion-4-5-full',
      strength: 0.4,
      information_extracted: 0.7,
      information_extracted_known: 1,
      encoded_values_json: '[0.7]',
      encoding_variants_json: '[]',
      encoding_count: 1,
      has_source_image: 1,
      source_image_hash: 'shared-png-hash',
      created_at: now,
    };
    database.upsertVibeLibrary([libraryEntry]);
    database.upsertVibeLibrary([{
      ...libraryEntry,
      id: 'second-information-encoding',
      encoded_values_json: '[0.7,1]',
      encoding_variants_json: JSON.stringify([
        { fingerprint: 'encoding-fingerprint', information_extracted: 0.7 },
        { fingerprint: 'second-information-encoding', information_extracted: 1 },
      ]),
      encoding_count: 2,
    }]);
    database.insertProject({
      id: 'project-vibe', name: 'Vibe project', image_path: 'image.png', thumbnail_path: 'thumb.webp', created_at: now, updated_at: now,
      tags: [], prompt_structure: { base_undesired_tags: [], use_coords: false, use_order: true, characters: [] }, metadata: { extra_json: '{}' }, versions: [],
      vibes: [{ ...libraryEntry, id: 'project-vibe-link', library_id: libraryEntry.id, enabled: true }],
    });

    expect(database.loadVibeLibrary()[0]).toMatchObject({ id: 'encoding-fingerprint', information_extracted_known: 1, source_image_hash: 'shared-png-hash' });
    expect(database.loadVibeLibrary()).toHaveLength(1);
    expect(database.resolveVibeLibraryId('second-information-encoding')).toBe('encoding-fingerprint');
    expect(database.loadLibrary()[0].vibes[0]).toMatchObject({ library_id: 'encoding-fingerprint', vibe_file: 'style.naiv4vibe', source_kind: 'naiv4vibe' });
  });

  it('reuses AI and manual tag knowledge across prompt scopes and projects', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-database-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    const now = new Date().toISOString();
    const common = {
      image_path: 'image.png', thumbnail_path: 'thumb.webp', created_at: now, updated_at: now,
      metadata: { extra_json: '{}' }, vibes: [], versions: [],
    };
    database.insertProject({
      ...common,
      id: 'dictionary-source', name: 'Dictionary source', tags: [],
      prompt_structure: {
        base_undesired_tags: [], use_coords: false, use_order: true,
        characters: [{
          id: 'character', label: 'Character 1', undesired_tags: [], center: { x: 0.5, y: 0.5 },
          prompt_tags: [{ id: 'artist-source', tag: 'Artist:Ciloranko', translation: '画师 Ciloranko', translation_source: 'manual', category: 'Artist', category_source: 'manual', weight: 1, note: '' }],
        }],
      },
    });
    database.insertProject({
      ...common,
      id: 'dictionary-target', name: 'Dictionary target',
      tags: [{ id: 'artist-target', tag: 'artist:ciloranko', translation: '', category: 'Unsorted', category_source: 'heuristic', weight: 1, note: '' }],
      prompt_structure: { base_undesired_tags: [], use_coords: false, use_order: true, characters: [] },
    });

    const target = database.loadLibrary().find((project) => project.id === 'dictionary-target');
    expect(target.tags[0]).toMatchObject({ translation: '画师 Ciloranko', translation_source: 'cache', category: 'Artist', category_source: 'cache' });
  });

  it('keeps collection membership through trash and restore operations', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-database-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    const now = new Date().toISOString();
    const project = (id) => ({
      id,
      name: id,
      image_path: `${id}.png`,
      thumbnail_path: `${id}.webp`,
      created_at: now,
      updated_at: now,
      tags: [],
      prompt_structure: { base_undesired_tags: [], use_coords: false, use_order: true, characters: [] },
      metadata: { extra_json: '{}' },
      vibes: [],
      versions: [],
    });
    database.insertProject(project('project-a'));
    database.insertProject(project('project-b'));

    let organization = database.createCollection('角色测试');
    const collectionId = organization.collections[0].id;
    organization = database.addProjectsToCollection(collectionId, ['project-a', 'project-b', 'project-b']);
    expect(organization.collections[0].project_count).toBe(2);
    expect(organization.projects.find((item) => item.id === 'project-a').collection_ids).toEqual([collectionId]);

    organization = database.setProjectsFavorite(['project-a'], true);
    expect(organization.projects.find((item) => item.id === 'project-a').is_favorite).toBe(1);

    organization = database.setProjectsDeleted(['project-b'], true);
    expect(organization.collections[0].project_count).toBe(1);
    expect(organization.projects.find((item) => item.id === 'project-b').deleted_at).not.toBe('');
    expect(organization.projects.find((item) => item.id === 'project-b').collection_ids).toEqual([collectionId]);

    organization = database.setProjectsDeleted(['project-b'], false);
    expect(organization.collections[0].project_count).toBe(2);
    expect(organization.projects.find((item) => item.id === 'project-b').collection_ids).toEqual([collectionId]);

    organization = database.removeProjectsFromCollection(collectionId, ['project-a']);
    expect(organization.collections[0].project_count).toBe(1);
    expect(organization.projects.find((item) => item.id === 'project-a').collection_ids).toEqual([]);

    organization = database.deleteCollection(collectionId);
    expect(organization.collections).toEqual([]);
    expect(database.loadLibrary()).toHaveLength(2);
  });

  it('stores branch recipes separately from immutable result metadata', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-database-'));
    temporaryDirectories.push(directory);
    const database = await openDatabase(directory);
    const now = new Date().toISOString();
    database.insertProject({
      id: 'immutable-result',
      name: 'Result',
      image_path: 'result.png',
      thumbnail_path: 'result.webp',
      created_at: now,
      updated_at: now,
      tags: [],
      prompt_structure: { base_undesired_tags: [], use_coords: false, use_order: true, characters: [] },
      metadata: { seed: '10', extra_json: '{}' },
      vibes: [],
      versions: [],
    });
    const created = database.createBranch({
      id: 'branch-1',
      source_project_id: 'immutable-result',
      name: '分支 1',
      status: 'draft',
      snapshot_json: JSON.stringify({ metadata: { seed: '20' } }),
      change_summary: 'Seed',
      created_at: now,
      updated_at: now,
    });
    expect(created).toMatchObject({ id: 'branch-1', source_project_id: 'immutable-result', status: 'draft' });
    expect(database.loadProject('immutable-result')).toMatchObject({ metadata: { seed: '10' }, branches: [{ id: 'branch-1' }] });

    database.updateBranch({ ...created, status: 'waiting', updated_at: new Date().toISOString() });
    expect(() => database.deleteBranch('branch-1')).toThrow('只有草稿分支可以放弃');
    expect(() => database.updateBranch({ ...created, status: 'draft', updated_at: new Date().toISOString() })).toThrow('只有草稿分支可以修改');
    database.insertProject({
      id: 'branch-result',
      name: 'Branch result',
      image_path: 'branch-result.png',
      thumbnail_path: 'branch-result.webp',
      created_at: now,
      updated_at: now,
      tags: [],
      prompt_structure: { base_undesired_tags: [], use_coords: false, use_order: true, characters: [] },
      metadata: { seed: '20', extra_json: '{}' },
      vibes: [],
      versions: [],
    });
    expect(database.attachBranchResult('branch-1', 'branch-result', { status: 'mismatch', differences: ['Prompt'] })).toMatchObject({
      status: 'mismatch',
      results: [{ project_id: 'branch-result', match_status: 'mismatch', differences: ['Prompt'] }],
    });
    expect(database.attachBranchResult('branch-1', 'branch-result', { status: 'matched', differences: [] })).toMatchObject({ status: 'result', results: [{ match_status: 'matched' }] });
    const disposable = database.createBranch({ ...created, id: 'branch-2', name: '可放弃草稿' });
    database.deleteBranch(disposable.id);
    expect(database.loadProject('immutable-result').branches).toMatchObject([{ id: 'branch-1', status: 'result', results: [{ project_id: 'branch-result' }] }]);
    expect(database.loadProject('immutable-result').metadata.seed).toBe('10');
  });
});
