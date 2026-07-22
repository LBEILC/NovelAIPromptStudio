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
    tags: [{ id: `${id}-tag`, tag: 'artist:ciloranko', translation: '', category: 'Artist', weight: 1.1, raw_segment: '', syntax_issue: '', brace_depth: 2, brace_group: 'artists', brace_trailing_comma: true }],
    prompt_structure: {
      base_undesired_tags: [{ id: `${id}-uc`, tag: 'lowres', translation: '', category: 'Unsorted', weight: 1 }],
      use_coords: true,
      use_order: true,
      characters: [{ id: `${id}-character`, label: 'Character 1', prompt_tags: [{ id: `${id}-char-tag`, tag: 'girl', translation: '', category: 'Character', weight: 1 }], undesired_tags: [], center: { x: 0.3, y: 0.5 } }],
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
    database.updateTagDictionary('artist:ciloranko', { translation: '画师 Ciloranko', category: 'Artist' });
    const enriched = database.enrichProjectTags(project('fresh'));
    expect(enriched.tags[0]).toMatchObject({ translation: '画师 Ciloranko', category: 'Artist', translation_source: 'manual', category_source: 'manual' });
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
});
