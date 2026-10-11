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
      tag: `synthetic_${(index * 59 + position) % 2400}`,
      category: 'Unsorted',
      weight: 1,
    })),
    prompt_structure: JSON.parse(jsonOfSize(structureBytes)),
    metadata: { model: 'synthetic', seed: String(index), extra_json: jsonOfSize(extraBytes) },
  };
}

function query(raw, sql) {
  return raw.prepare(sql).all();
}

export async function seed(directory, count, progress = () => {}) {
  fs.mkdirSync(directory, { recursive: true });
  const api = await openDatabase(directory);
  try {
    for (let index = 0; index < count; index += 25) {
      const results = api.insertProjects(
        Array.from({ length: Math.min(25, count - index) }, (_, offset) => project(index + offset)),
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
    progress('seed:orphan-metadata');
    raw.run('BEGIN');
    for (let index = 0; index < Math.round((count * 147) / 159); index++) {
      const value = project(index);
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
    for (let index = 0; index < 2400; index++)
      raw.run("INSERT OR IGNORE INTO tag_dictionary (tag, updated_at) VALUES (?, '')", [
        `synthetic_${index}`,
      ]);
    for (let index = 0; index < 750; index++)
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
