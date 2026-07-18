import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image_path TEXT NOT NULL,
  thumbnail_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prompt_tags (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  translation TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Unsorted',
  weight REAL NOT NULL DEFAULT 1,
  position INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_prompt_tags_project ON prompt_tags(project_id, position);
CREATE INDEX IF NOT EXISTS idx_prompt_tags_search ON prompt_tags(tag, translation, category);
CREATE TABLE IF NOT EXISTS generation_metadata (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  prompt_raw TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  seed TEXT NOT NULL DEFAULT '',
  steps INTEGER,
  sampler TEXT NOT NULL DEFAULT '',
  guidance REAL,
  extra_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS vibe_transfers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reference_image TEXT NOT NULL,
  thumbnail_path TEXT NOT NULL,
  strength REAL NOT NULL DEFAULT 0.6,
  information_extracted REAL NOT NULL DEFAULT 0.7,
  enabled INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tag_dictionary (
  tag TEXT PRIMARY KEY,
  translation TEXT NOT NULL,
  category TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

function rows(statement) {
  const output = [];
  while (statement.step()) output.push(statement.getAsObject());
  statement.free();
  return output;
}

export async function openDatabase(dataDirectory) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const filePath = path.join(dataDirectory, 'studio.sqlite');
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const database = fs.existsSync(filePath)
    ? new SQL.Database(fs.readFileSync(filePath))
    : new SQL.Database();
  database.run(schema);
  const versionColumns = database.exec('PRAGMA table_info(prompt_versions)')[0]?.values.map((row) => row[1]) || [];
  if (!versionColumns.includes('change_summary')) {
    database.run("ALTER TABLE prompt_versions ADD COLUMN change_summary TEXT NOT NULL DEFAULT ''");
  }

  const persist = () => {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, Buffer.from(database.export()));
    fs.renameSync(temporaryPath, filePath);
  };
  persist();

  const query = (sql, params = {}) => {
    const statement = database.prepare(sql);
    statement.bind(params);
    return rows(statement);
  };

  const loadLibrary = () => {
    const projects = query('SELECT * FROM projects ORDER BY updated_at DESC');
    return projects.map((project) => ({
      ...project,
      tags: query('SELECT * FROM prompt_tags WHERE project_id = $id ORDER BY position', { $id: project.id }),
      metadata: query('SELECT * FROM generation_metadata WHERE project_id = $id', { $id: project.id })[0] || {},
      vibes: query('SELECT * FROM vibe_transfers WHERE project_id = $id ORDER BY position', { $id: project.id }),
      versions: query('SELECT * FROM prompt_versions WHERE project_id = $id ORDER BY created_at DESC', { $id: project.id }),
    }));
  };

  const insertProject = (project) => {
    database.run('BEGIN');
    try {
      database.run(
        `INSERT INTO projects (id, name, image_path, thumbnail_path, created_at, updated_at)
         VALUES ($id, $name, $image_path, $thumbnail_path, $created_at, $updated_at)`,
        Object.fromEntries(Object.entries(project).filter(([key]) => ['id', 'name', 'image_path', 'thumbnail_path', 'created_at', 'updated_at'].includes(key)).map(([key, value]) => [`$${key}`, value])),
      );
      saveProjectRelations(project);
      database.run('COMMIT');
      persist();
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };

  const saveProjectRelations = (project) => {
    database.run('DELETE FROM prompt_tags WHERE project_id = $id', { $id: project.id });
    for (const [position, tag] of (project.tags || []).entries()) {
      database.run(
        `INSERT INTO prompt_tags (id, project_id, tag, translation, category, weight, position, note)
         VALUES ($id, $project_id, $tag, $translation, $category, $weight, $position, $note)`,
        {
          $id: tag.id,
          $project_id: project.id,
          $tag: tag.tag,
          $translation: tag.translation || '',
          $category: tag.category || 'Unsorted',
          $weight: Number.isFinite(Number(tag.weight)) ? Number(tag.weight) : 1,
          $position: position,
          $note: tag.note || '',
        },
      );
      if (tag.translation) {
        database.run(
          `INSERT INTO tag_dictionary (tag, translation, category, updated_at) VALUES ($tag, $translation, $category, $updated_at)
           ON CONFLICT(tag) DO UPDATE SET translation = excluded.translation, category = excluded.category, updated_at = excluded.updated_at`,
          { $tag: tag.tag, $translation: tag.translation, $category: tag.category || 'Unsorted', $updated_at: project.updated_at },
        );
      }
    }

    const metadata = project.metadata || {};
    database.run(
      `INSERT INTO generation_metadata (project_id, prompt_raw, negative_prompt, model, seed, steps, sampler, guidance, extra_json)
       VALUES ($project_id, $prompt_raw, $negative_prompt, $model, $seed, $steps, $sampler, $guidance, $extra_json)
       ON CONFLICT(project_id) DO UPDATE SET prompt_raw = excluded.prompt_raw, negative_prompt = excluded.negative_prompt,
       model = excluded.model, seed = excluded.seed, steps = excluded.steps, sampler = excluded.sampler,
       guidance = excluded.guidance, extra_json = excluded.extra_json`,
      {
        $project_id: project.id,
        $prompt_raw: metadata.prompt_raw || '',
        $negative_prompt: metadata.negative_prompt || '',
        $model: metadata.model || '',
        $seed: String(metadata.seed || ''),
        $steps: metadata.steps === '' || metadata.steps == null ? null : Number(metadata.steps),
        $sampler: metadata.sampler || '',
        $guidance: metadata.guidance === '' || metadata.guidance == null ? null : Number(metadata.guidance),
        $extra_json: typeof metadata.extra_json === 'string' ? metadata.extra_json : JSON.stringify(metadata.extra_json || {}),
      },
    );

    database.run('DELETE FROM vibe_transfers WHERE project_id = $id', { $id: project.id });
    for (const [position, vibe] of (project.vibes || []).entries()) {
      database.run(
        `INSERT INTO vibe_transfers (id, project_id, reference_image, thumbnail_path, strength, information_extracted, enabled, position)
         VALUES ($id, $project_id, $reference_image, $thumbnail_path, $strength, $information_extracted, $enabled, $position)`,
        {
          $id: vibe.id,
          $project_id: project.id,
          $reference_image: vibe.reference_image,
          $thumbnail_path: vibe.thumbnail_path,
          $strength: Number(vibe.strength),
          $information_extracted: Number(vibe.information_extracted),
          $enabled: vibe.enabled ? 1 : 0,
          $position: position,
        },
      );
    }

    database.run('DELETE FROM prompt_versions WHERE project_id = $id', { $id: project.id });
    for (const version of project.versions || []) {
      database.run(
        `INSERT INTO prompt_versions (id, project_id, label, prompt_text, snapshot_json, change_summary, image_path, created_at)
         VALUES ($id, $project_id, $label, $prompt_text, $snapshot_json, $change_summary, $image_path, $created_at)`,
        {
          $id: version.id,
          $project_id: project.id,
          $label: version.label,
          $prompt_text: version.prompt_text,
          $snapshot_json: version.snapshot_json,
          $change_summary: version.change_summary || '',
          $image_path: version.image_path || null,
          $created_at: version.created_at,
        },
      );
    }
  };

  const updateProject = (project) => {
    database.run('BEGIN');
    try {
      database.run(
        'UPDATE projects SET name = $name, updated_at = $updated_at WHERE id = $id',
        { $id: project.id, $name: project.name, $updated_at: project.updated_at },
      );
      saveProjectRelations(project);
      database.run('COMMIT');
      persist();
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };

  const deleteProject = (id) => {
    database.run('DELETE FROM projects WHERE id = $id', { $id: id });
    persist();
  };

  return { loadLibrary, insertProject, updateProject, deleteProject, persist, filePath };
}
