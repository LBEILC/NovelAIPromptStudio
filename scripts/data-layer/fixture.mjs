import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../../electron/database.js';
import { DatabaseSync } from 'node:sqlite';

const jsonOfSize = (bytes) => JSON.stringify({ padding: 'x'.repeat(bytes - 14) });

export function project(index) {
  const id = `image-${index}`;
  // One large value in every hundred; the remaining values preserve the mean.
  const extraBytes = index % 100 === 0 ? 271 * 1024 : Math.round(((6200 - 271) * 1024) / 99);
  const structureBytes = index % 100 === 0 ? 41 * 1024 : Math.round(((2100 - 41) * 1024) / 99);
  return {
    id,
    name: `Synthetic ${index}`,
    image_path: `${id}.png`,
    thumbnail_path: `${id}.webp`,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    tags: Array.from({ length: 59 }, (_, position) => ({
      id: `${id}-${position}`,
      tag:
        index === 0 && position === 0
          ? 'benchmark_unique'
          : position === 1 && index % 5 !== 4
            ? '1girl'
            : `synthetic_${(index * 59 + position) % 2400}`,
      category: 'Unsorted',
      weight: 1,
    })),
    prompt_structure: JSON.parse(jsonOfSize(structureBytes)),
    metadata: { model: 'synthetic', seed: String(index), extra_json: jsonOfSize(extraBytes) },
  };
}

// Upgrade only explicitly supplied synthetic fixtures from 010a. Keep 59 tags
// per image and the original metadata sizes; never modify the source fixture.
export function ensureCardBenchmarkTags(directory, count) {
  const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'));
  try {
    raw.exec('BEGIN');
    const update = raw.prepare(
      'UPDATE prompt_tags SET tag = ? WHERE project_id = ? AND position = ? AND tag != ?',
    );
    update.run('benchmark_unique', 'image-0', 0, 'benchmark_unique');
    for (let i = 0; i < count; i++) if (i % 5 !== 4) update.run('1girl', `image-${i}`, 1, '1girl');
    raw.exec('COMMIT');
    const uses = raw.prepare(
      'SELECT count(DISTINCT project_id) AS n FROM prompt_tags WHERE tag = ?',
    );
    if (uses.get('benchmark_unique').n !== 1 || uses.get('1girl').n !== Math.ceil(count * 0.8))
      throw Error('Benchmark unique/common tag distribution mismatch');
  } finally {
    raw.close();
  }
}

function query(raw, sql) {
  return raw.prepare(sql).all();
}

export async function seed(directory, count, progress = () => {}, { compact = false } = {}) {
  // Compatibility checks need table/row semantics, not benchmark-sized padding
  // or thousands of cache entries. Benchmark callers retain the original data.
  const sample = (index) => {
    const value = project(index);
    if (compact) {
      value.metadata.extra_json = '{}';
      value.prompt_structure = {};
    }
    return value;
  };
  fs.mkdirSync(directory, { recursive: true });
  const api = await openDatabase(directory);
  try {
    for (let index = 0; index < count; index += 25) {
      const results = api.insertProjects(
        Array.from({ length: Math.min(25, count - index) }, (_, offset) => sample(index + offset)),
      );
      if (results.some((result) => result.error)) throw Error('Fixture insert failed');
      if (index % 100 === 0) progress(`seed:${index}/${count}`);
    }
  } finally {
    api.close();
  }
  const connection = new DatabaseSync(path.join(directory, 'studio.sqlite'));
  const raw = {
    prepare: (sql) => connection.prepare(sql),
    run(sql, params) {
      return params ? connection.prepare(sql).run(...params) : connection.exec(sql);
    },
  };
  try {
    raw.run('PRAGMA foreign_keys=OFF');
    // Recreate the pre-generation schema for migration and compatibility checks.
    for (const table of ['version_images', 'work_versions', 'work_branch_names', 'works'])
      raw.run(`DROP TABLE IF EXISTS ${table}`);
    raw.run('DROP TABLE IF EXISTS materials');
    raw.run('DROP TABLE IF EXISTS reference_vibes');
    raw.run("DELETE FROM app_meta WHERE key IN ('generation_versions_v1','materials_v1')");
    progress('seed:orphan-metadata');
    raw.run('BEGIN');
    for (let index = 0; index < Math.round((count * 147) / 159); index++) {
      const value = sample(index);
      raw.run(
        'INSERT INTO generation_metadata (project_id, extra_json, prompt_structure_json) VALUES (?, ?, ?)',
        [`orphan-${index}`, value.metadata.extra_json, JSON.stringify(value.prompt_structure)],
      );
      if (index % 100 === 0) {
        progress(`seed:orphan-${index}`);
        raw.run('COMMIT');
        raw.run('BEGIN');
      }
    }
    for (let index = 0; index < (compact ? 3 : 2400); index++)
      raw.run("INSERT OR IGNORE INTO tag_dictionary (tag, updated_at) VALUES (?, '')", [
        `synthetic_${index}`,
      ]);
    for (let index = 0; index < (compact ? 3 : 750); index++)
      raw.run("INSERT INTO danbooru_tag_cache (tag, checked_at) VALUES (?, '')", [
        `synthetic_${index}`,
      ]);
    raw.run(fs.readFileSync(new URL('./legacy-schema.sql', import.meta.url), 'utf8'));
    const legacy = query(raw, "SELECT name FROM sqlite_master WHERE type='table'")
      .map((row) => row.name)
      .filter(
        (name) =>
          ![
            'projects',
            'prompt_tags',
            'generation_metadata',
            'tag_dictionary',
            'danbooru_tag_cache',
            'app_meta',
          ].includes(name),
      );
    for (const table of legacy) {
      const columns = query(raw, `PRAGMA table_info("${table}")`);
      for (let index = 0; index < 3; index++) {
        const values = columns.map((column) => {
          if (column.name === 'kind') return 'manual';
          if (column.name === 'parent_branch_id') return null;
          if (column.name === 'project_id' || column.name.endsWith('_project_id'))
            return `image-${index % count}`;
          if (
            ['collection_id', 'series_id', 'experiment_id', 'library_id', 'branch_id'].includes(
              column.name,
            )
          )
            return `id-${index}`;
          if (column.name.endsWith('_json')) return JSON.stringify({ fixture: index });
          if (column.type.includes('INT') || column.type.includes('REAL')) return index;
          return `${column.name}-${index}`;
        });
        raw.run(`INSERT INTO "${table}" VALUES (${values.map(() => '?').join(',')})`, values);
      }
    }
    raw.run('COMMIT');
    const snapshot =
      count <= 10
        ? Object.fromEntries(
            query(raw, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(
              ({ name }) => [name, query(raw, `SELECT * FROM "${name}" ORDER BY rowid`)],
            ),
          )
        : null;
    // The full snapshot is only needed by small compatibility fixtures.
    return count <= 10 ? snapshot : null;
  } finally {
    connection.close();
  }
}
