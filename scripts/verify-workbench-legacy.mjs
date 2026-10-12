import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../electron/database.js';
import { project } from './data-layer/fixture.mjs';

// Runs the fixed pre-native implementation with its actual sql.js package.
// Both arguments are prepared outside the product tree; all data is synthetic.
const [sourcePath, legacyPackagePath] = process.argv.slice(2);
if (!sourcePath || !legacyPackagePath)
  throw Error('Expected old-database.js and legacy package.json');
const base = new URL('../electron/database.js', import.meta.url);
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
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-wb-legacy-'));
let api;
try {
  const image = project(0);
  const raw = 'sky, river\n\nA small boat travels across the still water beside a stone bridge.';
  image.prompt_structure.base_prompt_raw = raw;
  image.metadata.prompt_raw = raw;
  image.prompt_structure.block_annotations = {
    'base:prompt': [{ raw, start: 0, type: 'paragraph', translation: '合成段落译文' }],
  };
  api = await openDatabase(directory);
  api.insertProject(image);
  api.close();
  const legacy = await old.openDatabase(directory);
  const loaded = legacy.loadProject(image.id);
  assert.equal(loaded.prompt_structure.base_prompt_raw, raw);
  assert.deepEqual(
    loaded.prompt_structure.block_annotations,
    image.prompt_structure.block_annotations,
  );
  legacy.updateProjectName(image.id, '兼容性合成图片');
  legacy.persist();
  legacy.close?.();
  api = await openDatabase(directory);
  assert.deepEqual(
    api.loadProject(image.id).prompt_structure.block_annotations,
    image.prompt_structure.block_annotations,
  );
  console.log(
    'PASS: actual legacy sql.js opens, reads, renames and persists block type/paragraph annotations without changing prompt text',
  );
} finally {
  api?.close();
  // directory comes directly from mkdtemp under the named task prefix.
  fs.rmSync(directory, { recursive: true, force: true });
}
