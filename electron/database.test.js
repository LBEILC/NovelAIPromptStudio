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
      tags: [{ id: 'base-tag', tag: '2girls', translation: '', category: 'Character', weight: 1, note: '' }],
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
      metadata: { prompt_raw: '2girls', negative_prompt: 'lowres', extra_json: '{}' },
      vibes: [],
      versions: [],
    };

    database.insertProject(project);
    const loaded = database.loadLibrary()[0];
    expect(loaded.prompt_structure).toMatchObject({
      use_coords: true,
      characters: [{ center: { x: 0.3, y: 0.5 }, prompt_tags: [{ tag: 'girl' }], undesired_tags: [{ tag: 'blue hair' }] }],
    });
  });
});
