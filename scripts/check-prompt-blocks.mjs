import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parsePrompt } from '../src/lib/prompt.js';
import { getPromptScopes, normalizePromptStructure } from '../src/lib/promptStructure.js';
import { parsePromptSection, serializePromptSection } from '../src/lib/promptDocument.ts';

// Never echo database model strings: even that column can contain private text.
export function promptModelCode(model) {
  const value = String(model || '').toLowerCase();
  if (/(?:v|diffusion[- ]?)4[._-]5/.test(value)) return 45;
  if (/(?:v|diffusion[- ]?)5/.test(value)) return 5;
  if (/(?:v|diffusion[- ]?)4/.test(value)) return 4;
  if (/(?:v|diffusion[- ]?)3/.test(value)) return 3;
  return 0;
}

function objectJson(value) {
  if (!value) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid data');
  return parsed;
}

export function checkPromptBlocks(databasePath) {
  // Do not call the application database initializer: it performs migrations and writes.
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    database.exec('PRAGMA query_only = ON; BEGIN');
    const statistics = {
      images: 0,
      sections: 0,
      blocks: 0,
      types: { tags: { count: 0, ratio: 0 }, paragraph: { count: 0, ratio: 0 } },
      labeledBlocks: 0,
      roundTripFailures: 0,
      legacySingleBlockMismatches: 0,
      models: Object.fromEntries(
        [0, 3, 4, 45, 5].map((code) => [code, { images: 0, blockCounts: {} }]),
      ),
    };
    // Include images without a metadata row; never select names or filesystem paths.
    const rows = database.prepare(`SELECT m.prompt_raw, m.negative_prompt,
      m.prompt_structure_json, m.model, m.extra_json
      FROM projects AS p LEFT JOIN generation_metadata AS m ON m.project_id = p.id`);
    for (const row of rows.iterate()) {
      statistics.images += 1;
      const model = promptModelCode(row.model);
      const structure = normalizePromptStructure(
        objectJson(row.prompt_structure_json),
        row,
        () => 'stat',
      );
      const scopes = getPromptScopes({ metadata: row, prompt_structure: structure, tags: [] });
      let blocks = 0;
      for (const scope of scopes) {
        statistics.sections += 1;
        const section = parsePromptSection(scope.raw_prompt, { createId: () => 'stat' });
        blocks += section.blocks.length;
        if (serializePromptSection(section) !== scope.raw_prompt) statistics.roundTripFailures += 1;
        for (const block of section.blocks) {
          statistics.types[block.type].count += 1;
          if (block.label) statistics.labeledBlocks += 1;
        }
        if ([4, 45].includes(model) && section.blocks.length === 1) {
          const block = section.blocks[0];
          if (
            block.type !== 'tags' ||
            !isDeepStrictEqual(
              block.tags,
              parsePrompt(scope.raw_prompt, () => 'stat'),
            )
          )
            statistics.legacySingleBlockMismatches += 1;
        }
      }
      statistics.blocks += blocks;
      const group = statistics.models[model];
      group.images += 1;
      group.blockCounts[blocks] = (group.blockCounts[blocks] || 0) + 1;
    }
    for (const type of Object.values(statistics.types))
      type.ratio = statistics.blocks ? type.count / statistics.blocks : 0;
    database.exec('ROLLBACK');
    return statistics;
  } finally {
    database.close();
  }
}

// Only fixed keys and numbers leave this process, including on errors.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Invalid arguments');
    process.stdout.write(JSON.stringify(checkPromptBlocks(process.argv[2])) + '\n');
  } catch {
    process.stdout.write('{"errors":1}\n');
    process.exitCode = 1;
  }
}
