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
  prompt_structure_json TEXT NOT NULL DEFAULT '{}',
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
  library_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL DEFAULT 'image',
  reference_image TEXT NOT NULL,
  vibe_file TEXT NOT NULL DEFAULT '',
  thumbnail_path TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  strength REAL NOT NULL DEFAULT 0.6,
  information_extracted REAL NOT NULL DEFAULT 0.7,
  information_extracted_known INTEGER NOT NULL DEFAULT 1,
  encoded_values_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vibe_library (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  original_vibe_id TEXT NOT NULL DEFAULT '',
  reference_image TEXT NOT NULL DEFAULT '',
  vibe_file TEXT NOT NULL DEFAULT '',
  thumbnail_path TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  strength REAL NOT NULL DEFAULT 0.6,
  information_extracted REAL NOT NULL DEFAULT 0.7,
  information_extracted_known INTEGER NOT NULL DEFAULT 1,
  encoded_values_json TEXT NOT NULL DEFAULT '[]',
  encoding_variants_json TEXT NOT NULL DEFAULT '[]',
  encoding_count INTEGER NOT NULL DEFAULT 0,
  has_source_image INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vibe_encoding_index (
  fingerprint TEXT PRIMARY KEY,
  library_id TEXT NOT NULL REFERENCES vibe_library(id) ON DELETE CASCADE
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

function safeJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
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
  const metadataColumns = database.exec('PRAGMA table_info(generation_metadata)')[0]?.values.map((row) => row[1]) || [];
  if (!metadataColumns.includes('prompt_structure_json')) {
    database.run("ALTER TABLE generation_metadata ADD COLUMN prompt_structure_json TEXT NOT NULL DEFAULT '{}'");
  }
  const vibeColumns = database.exec('PRAGMA table_info(vibe_transfers)')[0]?.values.map((row) => row[1]) || [];
  const vibeMigrations = [
    ['library_id', "TEXT NOT NULL DEFAULT ''"],
    ['name', "TEXT NOT NULL DEFAULT ''"],
    ['source_kind', "TEXT NOT NULL DEFAULT 'image'"],
    ['vibe_file', "TEXT NOT NULL DEFAULT ''"],
    ['model', "TEXT NOT NULL DEFAULT ''"],
    ['information_extracted_known', 'INTEGER NOT NULL DEFAULT 1'],
    ['encoded_values_json', "TEXT NOT NULL DEFAULT '[]'"],
  ];
  for (const [column, definition] of vibeMigrations) {
    if (!vibeColumns.includes(column)) database.run(`ALTER TABLE vibe_transfers ADD COLUMN ${column} ${definition}`);
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
    return projects.map((project) => {
      const metadata = query('SELECT * FROM generation_metadata WHERE project_id = $id', { $id: project.id })[0] || {};
      return {
        ...project,
        tags: query('SELECT * FROM prompt_tags WHERE project_id = $id ORDER BY position', { $id: project.id }),
        metadata,
        prompt_structure: safeJson(metadata.prompt_structure_json),
        vibes: query('SELECT * FROM vibe_transfers WHERE project_id = $id ORDER BY position', { $id: project.id }),
        versions: query('SELECT * FROM prompt_versions WHERE project_id = $id ORDER BY created_at DESC', { $id: project.id }),
      };
    });
  };

  const loadVibeLibrary = () => query('SELECT * FROM vibe_library ORDER BY created_at DESC');

  const upsertVibeLibrary = (entries = []) => {
    for (const entry of entries) {
      let variants = [];
      try { variants = JSON.parse(entry.encoding_variants_json || '[]'); } catch { variants = []; }
      const fingerprints = [...new Set([entry.id, ...variants.map((variant) => variant.fingerprint)].filter(Boolean))];
      let libraryId = entry.id;
      for (const encodingFingerprint of fingerprints) {
        const indexed = query('SELECT library_id FROM vibe_encoding_index WHERE fingerprint = $fingerprint', { $fingerprint: encodingFingerprint })[0];
        if (indexed?.library_id) {
          libraryId = indexed.library_id;
          break;
        }
      }
      database.run(
        `INSERT INTO vibe_library (id, name, source_kind, original_vibe_id, reference_image, vibe_file, thumbnail_path, model,
          strength, information_extracted, information_extracted_known, encoded_values_json, encoding_variants_json,
          encoding_count, has_source_image, created_at)
         VALUES ($id, $name, $source_kind, $original_vibe_id, $reference_image, $vibe_file, $thumbnail_path, $model,
          $strength, $information_extracted, $information_extracted_known, $encoded_values_json, $encoding_variants_json,
          $encoding_count, $has_source_image, $created_at)
         ON CONFLICT(id) DO UPDATE SET
          name = CASE WHEN (excluded.has_source_image = 1 AND vibe_library.has_source_image = 0)
            OR (vibe_library.source_kind = 'metadata' AND excluded.source_kind = 'metadata') THEN excluded.name ELSE vibe_library.name END,
          source_kind = CASE WHEN vibe_library.source_kind = 'metadata' AND excluded.source_kind != 'metadata' THEN excluded.source_kind ELSE vibe_library.source_kind END,
          original_vibe_id = COALESCE(NULLIF(excluded.original_vibe_id, ''), vibe_library.original_vibe_id),
          reference_image = COALESCE(NULLIF(excluded.reference_image, ''), vibe_library.reference_image),
          vibe_file = COALESCE(NULLIF(excluded.vibe_file, ''), vibe_library.vibe_file),
          thumbnail_path = CASE WHEN excluded.has_source_image = 1 OR vibe_library.thumbnail_path = '' THEN excluded.thumbnail_path ELSE vibe_library.thumbnail_path END,
          model = COALESCE(NULLIF(excluded.model, ''), vibe_library.model),
          strength = excluded.strength,
          information_extracted = CASE WHEN excluded.information_extracted_known = 1 THEN excluded.information_extracted ELSE vibe_library.information_extracted END,
          information_extracted_known = MAX(vibe_library.information_extracted_known, excluded.information_extracted_known),
          encoded_values_json = CASE WHEN excluded.encoding_count >= vibe_library.encoding_count THEN excluded.encoded_values_json ELSE vibe_library.encoded_values_json END,
          encoding_variants_json = CASE WHEN excluded.encoding_count >= vibe_library.encoding_count THEN excluded.encoding_variants_json ELSE vibe_library.encoding_variants_json END,
          encoding_count = MAX(vibe_library.encoding_count, excluded.encoding_count),
          has_source_image = MAX(vibe_library.has_source_image, excluded.has_source_image)`,
        {
          $id: libraryId,
          $name: entry.name || libraryId.slice(0, 12),
          $source_kind: entry.source_kind || 'metadata',
          $original_vibe_id: entry.original_vibe_id || '',
          $reference_image: entry.reference_image || '',
          $vibe_file: entry.vibe_file || '',
          $thumbnail_path: entry.thumbnail_path || '',
          $model: entry.model || '',
          $strength: Number(entry.strength ?? 0.6),
          $information_extracted: Number(entry.information_extracted ?? 0.7),
          $information_extracted_known: entry.information_extracted_known ? 1 : 0,
          $encoded_values_json: entry.encoded_values_json || '[]',
          $encoding_variants_json: entry.encoding_variants_json || '[]',
          $encoding_count: Number(entry.encoding_count || 0),
          $has_source_image: entry.has_source_image ? 1 : 0,
          $created_at: entry.created_at || new Date().toISOString(),
        },
      );
      for (const encodingFingerprint of fingerprints) {
        database.run(
          `INSERT INTO vibe_encoding_index (fingerprint, library_id) VALUES ($fingerprint, $library_id)
           ON CONFLICT(fingerprint) DO UPDATE SET library_id = excluded.library_id`,
          { $fingerprint: encodingFingerprint, $library_id: libraryId },
        );
      }
    }
    persist();
    return loadVibeLibrary();
  };

  const resolveVibeLibraryId = (fingerprint) => query(
    'SELECT library_id FROM vibe_encoding_index WHERE fingerprint = $fingerprint',
    { $fingerprint: fingerprint },
  )[0]?.library_id || fingerprint;

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
      `INSERT INTO generation_metadata (project_id, prompt_raw, negative_prompt, prompt_structure_json, model, seed, steps, sampler, guidance, extra_json)
       VALUES ($project_id, $prompt_raw, $negative_prompt, $prompt_structure_json, $model, $seed, $steps, $sampler, $guidance, $extra_json)
       ON CONFLICT(project_id) DO UPDATE SET prompt_raw = excluded.prompt_raw, negative_prompt = excluded.negative_prompt,
       prompt_structure_json = excluded.prompt_structure_json,
       model = excluded.model, seed = excluded.seed, steps = excluded.steps, sampler = excluded.sampler,
       guidance = excluded.guidance, extra_json = excluded.extra_json`,
      {
        $project_id: project.id,
        $prompt_raw: metadata.prompt_raw || '',
        $negative_prompt: metadata.negative_prompt || '',
        $prompt_structure_json: JSON.stringify(project.prompt_structure || {}),
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
        `INSERT INTO vibe_transfers (id, project_id, library_id, name, source_kind, reference_image, vibe_file, thumbnail_path,
          model, strength, information_extracted, information_extracted_known, encoded_values_json, enabled, position)
         VALUES ($id, $project_id, $library_id, $name, $source_kind, $reference_image, $vibe_file, $thumbnail_path,
          $model, $strength, $information_extracted, $information_extracted_known, $encoded_values_json, $enabled, $position)`,
        {
          $id: vibe.id,
          $project_id: project.id,
          $library_id: vibe.library_id || '',
          $name: vibe.name || '',
          $source_kind: vibe.source_kind || 'image',
          $reference_image: vibe.reference_image || '',
          $vibe_file: vibe.vibe_file || '',
          $thumbnail_path: vibe.thumbnail_path || '',
          $model: vibe.model || '',
          $strength: Number(vibe.strength),
          $information_extracted: Number(vibe.information_extracted),
          $information_extracted_known: vibe.information_extracted_known ? 1 : 0,
          $encoded_values_json: vibe.encoded_values_json || '[]',
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

  return { loadLibrary, loadVibeLibrary, upsertVibeLibrary, resolveVibeLibraryId, insertProject, updateProject, deleteProject, persist, filePath };
}
