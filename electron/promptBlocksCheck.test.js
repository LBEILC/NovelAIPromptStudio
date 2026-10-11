import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { checkPromptBlocks, promptModelCode } from '../scripts/check-prompt-blocks.mjs';

const script = fileURLToPath(new URL('../scripts/check-prompt-blocks.mjs', import.meta.url));
function run(databasePath) {
  return spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', script, databasePath],
    { encoding: 'utf8', timeout: 30000 },
  );
}
function numbersOnly(value) {
  return typeof value === 'number'
    ? Number.isFinite(value)
    : value !== null && typeof value === 'object' && Object.values(value).every(numbersOnly);
}

describe('private read-only prompt block statistics', () => {
  // Real CLI startup and durable file I/O can exceed 5s on shared Windows runners.
  it(
    'runs the CLI against a synthetic database, emits only numeric aggregates, and changes no file',
    { timeout: 30000 },
    () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-blocks-'));
      const filename = path.join(directory, 'private-name.sqlite');
      try {
        const database = new DatabaseSync(filename);
        database.exec(`BEGIN; CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, image_path TEXT);
        CREATE TABLE generation_metadata (project_id TEXT, prompt_raw TEXT, negative_prompt TEXT, model TEXT, prompt_structure_json TEXT, extra_json TEXT);`);
        const image = database.prepare('INSERT INTO projects VALUES (?, ?, ?)');
        const metadata = database.prepare(
          'INSERT INTO generation_metadata VALUES (?, ?, ?, ?, ?, ?)',
        );
        const rows = [
          ['a', 'sky, river', 'blur', 'nai-diffusion-4-full', {}],
          [
            'b',
            'PRIVATE_PROMPT_MARKER\r\n\r\nThe traveler carries a wooden box along the river in the morning.',
            'noise',
            'nai-diffusion-5-full',
            {},
          ],
          [
            'c',
            'fallback',
            '',
            'nai-diffusion-4-5-full',
            {
              base_prompt_raw: 'sky, river',
              base_undesired_raw: 'blur',
              characters: [{ prompt_raw: 'hat, coat', undesired_raw: 'umbrella' }],
            },
          ],
          ['d', '<style> watercolor, soft light', '', 'PRIVATE_MODEL_MARKER', {}],
        ];
        for (const [id, prompt, negative, model, structure] of rows) {
          image.run(id, 'PRIVATE_FILENAME_MARKER', '/PRIVATE_PATH_MARKER');
          metadata.run(id, prompt, negative, model, JSON.stringify(structure), '{}');
        }
        image.run('empty', 'PRIVATE_FILENAME_MARKER', '/PRIVATE_PATH_MARKER');
        database.exec('COMMIT');
        database.close();
        const before = fs.readFileSync(filename);
        const mtime = fs.statSync(filename).mtimeMs;
        const files = fs.readdirSync(directory);
        const direct = checkPromptBlocks(filename);
        const result = run(filename);
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        const statistics = JSON.parse(result.stdout);
        expect(statistics).toEqual(direct);
        expect(numbersOnly(statistics)).toBe(true);
        expect(statistics).toMatchObject({
          images: 5,
          sections: 12,
          blocks: 10,
          labeledBlocks: 1,
          roundTripFailures: 0,
          legacySingleBlockMismatches: 0,
        });
        expect(statistics.types).toEqual({
          tags: { count: 9, ratio: 0.9 },
          paragraph: { count: 1, ratio: 0.1 },
        });
        expect(statistics.models['45']).toEqual({ images: 1, blockCounts: { 4: 1 } });
        for (const secret of [
          'PRIVATE',
          filename,
          directory,
          'sky',
          'river',
          'traveler',
          'watercolor',
        ])
          expect(result.stdout + result.stderr).not.toContain(secret);
        expect(fs.readFileSync(filename)).toEqual(before);
        expect(fs.statSync(filename).mtimeMs).toBe(mtime);
        expect(fs.readdirSync(directory)).toEqual(files);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('redacts failures and never creates a missing database', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-blocks-error-'));
    try {
      const filename = path.join(directory, 'PRIVATE_PATH.sqlite');
      for (const setup of [() => {}, () => fs.writeFileSync(filename, 'PRIVATE_CONTENT')]) {
        setup();
        const before = fs.existsSync(filename) ? fs.readFileSync(filename) : null;
        const result = run(filename);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('{"errors":1}\n');
        expect(result.stderr).toBe('');
        expect(fs.existsSync(filename) ? fs.readFileSync(filename) : null).toEqual(before);
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('normalizes model identifiers without leaking arbitrary names', () => {
    expect(
      [
        'nai-diffusion-4-5-full',
        'NovelAI Diffusion V4.5',
        'nai-diffusion-5-full',
        'nai-diffusion-4-curated',
        'nai-diffusion-3',
        'PRIVATE',
      ].map(promptModelCode),
    ).toEqual([45, 45, 5, 4, 3, 0]);
  });
});
