import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recoverEmbeddedVibes } from './assets.js';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('embedded Vibe recovery', () => {
  it('migrates encoded PNG metadata into a reusable project Vibe', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-vibe-assets-'));
    temporaryDirectories.push(directory);
    const project = {
      id: 'project', name: 'Generated image', image_path: 'generated.png', vibes: [],
      metadata: {
        model: 'NovelAI Diffusion V4.5',
        extra_json: JSON.stringify({ parsed: { reference_image_multiple: ['z'.repeat(1000)], reference_strength_multiple: [0.4] } }),
      },
    };
    const recovered = await recoverEmbeddedVibes(project, directory);
    expect(recovered.libraryEntries).toHaveLength(1);
    expect(recovered.project.vibes[0]).toMatchObject({ strength: 0.4, information_extracted_known: 0, source_kind: 'metadata' });
    expect(fs.existsSync(recovered.project.vibes[0].vibe_file)).toBe(true);
  });
});
