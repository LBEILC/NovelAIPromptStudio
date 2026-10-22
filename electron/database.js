import { migrateWorkOriginals } from './workOriginals.js';
import fs from 'node:fs';
import { migrateMaterials, createMaterialStore } from './materials.js';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { CATEGORY_OPTIONS, inferCategory, normalizeCategory } from '../src/lib/prompt.js';
import {
  galleryProjectGroupingFingerprints,
  normalizedSimilarityTag,
  similarityTagMap,
} from '../src/lib/galleryGrouping.js';
import { extractV4PromptData, normalizePromptStructure } from '../src/lib/promptStructure.js';
import { danbooruLookupName } from './danbooru.js';
import { hydrateParameters } from './params.js';
import { createVibeLibrary } from './vibeLibrary.js';
import { extractEmbeddedVibes, fingerprintVibes } from './vibes.js';
import { imageFileName } from '../src/lib/imageNaming.js';
import { migrateGenerationVersions, createVersionStore } from './versions.js';

const TAG_CATEGORIES = new Set(CATEGORY_OPTIONS);
export const DEFAULT_GALLERY_COLLECTION_ID = 'default-gallery-collection';
const FAVORITES_COLLECTION_MIGRATION_KEY = 'gallery_favorites_collection_v1';

const CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image_path TEXT NOT NULL,
  thumbnail_path TEXT NOT NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  prompt_fingerprint TEXT NOT NULL DEFAULT '',
  base_prompt_fingerprint TEXT NOT NULL DEFAULT '',
  vibe_fingerprint TEXT NOT NULL DEFAULT '',
  exact_group_fingerprint TEXT NOT NULL DEFAULT '',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT NOT NULL DEFAULT '',
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
  note TEXT NOT NULL DEFAULT '',
  raw_segment TEXT NOT NULL DEFAULT '',
  syntax_issue TEXT NOT NULL DEFAULT '',
  brace_depth INTEGER NOT NULL DEFAULT 0,
  brace_group TEXT NOT NULL DEFAULT '',
  brace_trailing_comma INTEGER NOT NULL DEFAULT 0
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
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  generation_mode TEXT NOT NULL DEFAULT 'unknown',
  extra_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS tag_dictionary (
  tag TEXT PRIMARY KEY,
  display_tag TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Unsorted',
  has_translation INTEGER NOT NULL DEFAULT 0,
  has_classification INTEGER NOT NULL DEFAULT 0,
  translation_source TEXT NOT NULL DEFAULT '',
  category_source TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tag_dictionary_category ON tag_dictionary(category);
CREATE TABLE IF NOT EXISTS danbooru_tag_cache (
  tag TEXT PRIMARY KEY,
  canonical_tag TEXT NOT NULL DEFAULT '',
  category INTEGER NOT NULL DEFAULT -1,
  is_deprecated INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prompt_group_covers (
  prompt_fingerprint TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS gallery_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('manual', 'smart')),
  filter_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gallery_collection_projects (
  collection_id TEXT NOT NULL REFERENCES gallery_collections(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_gallery_collection_projects_project ON gallery_collection_projects(project_id);
`;

function safeJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function dictionaryKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('en-US');
}

function projectTags(project) {
  const structure = project.prompt_structure || {};
  return [
    ...(project.tags || []),
    ...(structure.base_undesired_tags || []),
    ...(structure.characters || []).flatMap((character) => [
      ...(character.prompt_tags || []),
      ...(character.undesired_tags || []),
    ]),
  ];
}

function tableColumns(database, table) {
  return database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => row.name);
}

function ensureColumn(database, table, columns, name, definition) {
  if (!columns.includes(name))
    database.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

export async function openDatabase(dataDirectory, { cardBuildSchedule } = {}) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const filePath = path.join(dataDirectory, 'studio.sqlite');
  const backupPath = path.join(dataDirectory, 'studio.pre-phase2.sqlite');
  if (fs.existsSync(filePath) && !fs.existsSync(backupPath))
    fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);

  const engineBackupPath = path.join(dataDirectory, 'studio.pre-node-sqlite.sqlite');
  if (fs.existsSync(filePath) && !fs.existsSync(engineBackupPath)) {
    // Never open the original if its first native-engine backup cannot be completed.
    const temporaryBackup = `${engineBackupPath}.${process.pid}.tmp`;
    try {
      fs.copyFileSync(filePath, temporaryBackup, fs.constants.COPYFILE_EXCL);
      const handle = fs.openSync(temporaryBackup, 'r+');
      try {
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
      // Publish the completed copy without overwriting another process's backup.
      // This links the temporary COPY, never the live database, then removes its old name.
      fs.linkSync(temporaryBackup, engineBackupPath);
      fs.unlinkSync(temporaryBackup);
    } catch (error) {
      fs.rmSync(temporaryBackup, { force: true });
      throw error;
    }
  }
  // The previous engine's export/reopen reset foreign_keys to OFF. Enabling native
  // cascades here would delete historical rows in retired tables on project removal.
  const connection = new DatabaseSync(filePath, { enableForeignKeyConstraints: false });
  try {
    return initializeDatabase(
      connection,
      filePath,
      backupPath,
      engineBackupPath,
      cardBuildSchedule,
    );
  } catch (error) {
    connection.close();
    throw error;
  }
}

function initializeDatabase(connection, filePath, backupPath, engineBackupPath, cardBuildSchedule) {
  const transactions = [];
  let sequence = 0;
  let closed = false;
  const begin = () => {
    const name = `operation_${sequence++}`;
    connection.exec(`SAVEPOINT ${name}`);
    transactions.push(name);
  };
  const commit = () => {
    connection.exec(`RELEASE ${transactions.at(-1)}`);
    transactions.pop();
  };
  const rollback = () => {
    const name = transactions.pop();
    connection.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
  };
  const atomic =
    (operation) =>
    (...args) => {
      begin();
      try {
        const result = operation(...args);
        commit();
        return result;
      } catch (error) {
        rollback();
        throw error;
      }
    };
  const database = {
    prepare: (sql) => connection.prepare(sql),
    run(sql, params) {
      if (sql === 'BEGIN') return begin();
      if (sql === 'COMMIT') return commit();
      if (sql === 'ROLLBACK') return rollback();
      if (params) return connection.prepare(sql).run(params);
      connection.exec(sql);
    },
  };
  const close = () => {
    if (closed) return;
    connection.close();
    closed = true;
  };
  // EXTRA also syncs the directory after deleting a rollback journal. No WAL sidecars.
  connection.exec(
    'PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON; PRAGMA foreign_keys=OFF',
  );
  migrateGenerationVersions(connection, filePath);
  migrateMaterials(connection, filePath);
  begin();
  database.run(CORE_SCHEMA);

  const projectColumns = tableColumns(database, 'projects');
  ensureColumn(database, 'projects', projectColumns, 'content_hash', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(
    database,
    'projects',
    projectColumns,
    'prompt_fingerprint',
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(
    database,
    'projects',
    projectColumns,
    'base_prompt_fingerprint',
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(
    database,
    'projects',
    projectColumns,
    'vibe_fingerprint',
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(
    database,
    'projects',
    projectColumns,
    'exact_group_fingerprint',
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(database, 'projects', projectColumns, 'is_favorite', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'projects', projectColumns, 'deleted_at', "TEXT NOT NULL DEFAULT ''");
  // Cover the calendar query without reading image paths and other project fields.
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_projects_import_dates_active ON projects(created_at, id) WHERE deleted_at = ''",
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_projects_import_dates_trash ON projects(created_at, id) WHERE deleted_at != ''",
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_projects_content_hash ON projects(content_hash) WHERE content_hash != ''",
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_projects_prompt_fingerprint ON projects(prompt_fingerprint) WHERE prompt_fingerprint != ''",
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_projects_base_prompt_fingerprint ON projects(base_prompt_fingerprint) WHERE base_prompt_fingerprint != ''",
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_projects_exact_group_fingerprint ON projects(exact_group_fingerprint) WHERE exact_group_fingerprint != ''",
  );
  const tagColumns = tableColumns(database, 'prompt_tags');
  ensureColumn(database, 'prompt_tags', tagColumns, 'raw_segment', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'prompt_tags', tagColumns, 'syntax_issue', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'prompt_tags', tagColumns, 'brace_depth', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'prompt_tags', tagColumns, 'brace_group', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(
    database,
    'prompt_tags',
    tagColumns,
    'brace_trailing_comma',
    'INTEGER NOT NULL DEFAULT 0',
  );
  const metadataColumns = tableColumns(database, 'generation_metadata');
  ensureColumn(
    database,
    'generation_metadata',
    metadataColumns,
    'prompt_structure_json',
    "TEXT NOT NULL DEFAULT '{}'",
  );
  ensureColumn(
    database,
    'generation_metadata',
    metadataColumns,
    'width',
    'INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    database,
    'generation_metadata',
    metadataColumns,
    'height',
    'INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    database,
    'generation_metadata',
    metadataColumns,
    'generation_mode',
    "TEXT NOT NULL DEFAULT 'unknown'",
  );
  const dictionaryColumns = tableColumns(database, 'tag_dictionary');
  ensureColumn(
    database,
    'tag_dictionary',
    dictionaryColumns,
    'display_tag',
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(
    database,
    'tag_dictionary',
    dictionaryColumns,
    'has_translation',
    'INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    database,
    'tag_dictionary',
    dictionaryColumns,
    'has_classification',
    'INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    database,
    'tag_dictionary',
    dictionaryColumns,
    'translation_source',
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(
    database,
    'tag_dictionary',
    dictionaryColumns,
    'category_source',
    "TEXT NOT NULL DEFAULT ''",
  );
  database.run(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('runtime_schema', 'phase2-core')",
  );

  // Writes commit before their public API returns. Kept for existing callers.
  const persist = () => {};
  const query = (sql, params = {}) => {
    const statement = database.prepare(sql);
    // Preserve the previous Number-valued API even for legacy 64-bit integers;
    // the native default would throw when an integer exceeds Number's safe range.
    statement.setReadBigInts(true);
    return statement.all(params).map((row) => {
      const result = { ...row };
      for (const key of Object.keys(result))
        if (typeof result[key] === 'bigint') result[key] = Number(result[key]);
      return result;
    });
  };

  const lookupTagDictionary = (tags = []) => {
    const found = new Map();
    const requested = new Map();
    for (const tag of tags) {
      const key = dictionaryKey(tag);
      if (key && !requested.has(key)) requested.set(key, tag);
    }
    const keys = [...requested.keys()];
    for (let offset = 0; offset < keys.length; offset += 400) {
      const chunk = keys.slice(offset, offset + 400);
      const params = {};
      const placeholders = chunk.map((key, index) => {
        const parameter = `$tag${index}`;
        params[parameter] = key;
        return parameter;
      });
      for (const row of query(
        `SELECT * FROM tag_dictionary WHERE tag IN (${placeholders.join(', ')})`,
        params,
      )) {
        const original = requested.get(row.tag) || row.display_tag || row.tag;
        found.set(row.tag, { ...row, category: normalizeCategory(row.category, original) });
      }
    }
    return found;
  };

  const lookupDanbooruTagCache = (tags = []) => {
    const found = new Map();
    for (const tag of tags) {
      const key = danbooruLookupName(tag);
      if (!key || found.has(key)) continue;
      const row = query('SELECT * FROM danbooru_tag_cache WHERE tag = $tag', { $tag: key })[0];
      if (row) found.set(key, row);
    }
    return found;
  };

  const upsertDanbooruTagCache = (entries = []) => {
    for (const entry of entries) {
      const key = danbooruLookupName(entry.tag);
      if (!key) continue;
      database.run(
        `INSERT INTO danbooru_tag_cache (tag, canonical_tag, category, is_deprecated, post_count, checked_at)
         VALUES ($tag, $canonical_tag, $category, $is_deprecated, $post_count, $checked_at)
         ON CONFLICT(tag) DO UPDATE SET canonical_tag = excluded.canonical_tag, category = excluded.category,
          is_deprecated = excluded.is_deprecated, post_count = excluded.post_count, checked_at = excluded.checked_at`,
        {
          $tag: key,
          $canonical_tag: String(entry.canonical_tag || key),
          $category: Number(entry.category ?? -1),
          $is_deprecated: entry.is_deprecated ? 1 : 0,
          $post_count: Number(entry.post_count || 0),
          $checked_at: String(entry.checked_at || new Date().toISOString()),
        },
      );
    }
  };

  const knowledgePriority = (source) =>
    ({ manual: 5, danbooru: 4, dso: 3, rule: 2, ai: 1, cache: 0, builtin: 0, heuristic: 0 })[
      source
    ] || 0;
  const upsertTagDictionary = (entries = [], updatedAt = new Date().toISOString()) => {
    for (const entry of entries) {
      const key = dictionaryKey(entry.tag);
      if (!key) continue;
      const current =
        query('SELECT * FROM tag_dictionary WHERE tag = $tag', { $tag: key })[0] || {};
      const incomingTranslation = String(entry.translation || '').trim();
      const incomingCategory = normalizeCategory(entry.category, entry.tag);
      const incomingTranslationSource = String(
        entry.translation_source || (entry.has_translation ? 'ai' : ''),
      );
      const incomingCategorySource = String(
        entry.category_source || (entry.has_classification ? 'ai' : ''),
      );
      const hasIncomingTranslation = entry.has_translation ?? Boolean(incomingTranslation);
      const hasIncomingClassification = entry.has_classification ?? Boolean(entry.category);
      const replaceTranslation =
        hasIncomingTranslation &&
        (!current.has_translation ||
          knowledgePriority(incomingTranslationSource) >=
            knowledgePriority(current.translation_source));
      const replaceClassification =
        hasIncomingClassification &&
        (!current.has_classification ||
          knowledgePriority(incomingCategorySource) >= knowledgePriority(current.category_source));
      const translation = replaceTranslation
        ? incomingTranslation
        : String(current.translation || '');
      const category = replaceClassification
        ? incomingCategory
        : normalizeCategory(current.category, entry.tag);
      const hasTranslation = Boolean(current.has_translation || hasIncomingTranslation);
      const hasClassification = Boolean(current.has_classification || hasIncomingClassification);
      if (!hasTranslation && !hasClassification) continue;
      database.run(
        `INSERT INTO tag_dictionary (tag, display_tag, translation, category, has_translation, has_classification, translation_source, category_source, updated_at)
         VALUES ($tag, $display_tag, $translation, $category, $has_translation, $has_classification, $translation_source, $category_source, $updated_at)
         ON CONFLICT(tag) DO UPDATE SET display_tag = CASE WHEN tag_dictionary.display_tag = '' THEN excluded.display_tag ELSE tag_dictionary.display_tag END,
          translation = excluded.translation, category = excluded.category, has_translation = excluded.has_translation,
          has_classification = excluded.has_classification, translation_source = excluded.translation_source,
          category_source = excluded.category_source, updated_at = excluded.updated_at`,
        {
          $tag: key,
          $display_tag: String(current.display_tag || entry.tag || '').trim(),
          $translation: translation,
          $category: category,
          $has_translation: hasTranslation ? 1 : 0,
          $has_classification: hasClassification ? 1 : 0,
          $translation_source: replaceTranslation
            ? incomingTranslationSource
            : String(current.translation_source || ''),
          $category_source: replaceClassification
            ? incomingCategorySource
            : String(current.category_source || ''),
          $updated_at: updatedAt,
        },
      );
    }
  };

  const updateTagDictionary = (tag, patch = {}) => {
    const key = dictionaryKey(tag);
    if (!key) throw new Error('Tag 不能为空');
    const current = query('SELECT * FROM tag_dictionary WHERE tag = $tag', { $tag: key })[0] || {};
    const translation =
      patch.translation === undefined
        ? String(current.translation || '')
        : String(patch.translation || '').trim();
    const category =
      patch.category === undefined
        ? normalizeCategory(current.category, tag)
        : String(patch.category || 'Unsorted');
    if (patch.category !== undefined && !TAG_CATEGORIES.has(category))
      throw new Error('Tag 分类无效');
    if (translation.length > 240) throw new Error('Tag 翻译不能超过 240 个字符');
    database.run(
      `INSERT INTO tag_dictionary (tag, display_tag, translation, category, has_translation, has_classification, translation_source, category_source, updated_at)
       VALUES ($tag, $display_tag, $translation, $category, $has_translation, $has_classification, $translation_source, $category_source, $updated_at)
       ON CONFLICT(tag) DO UPDATE SET translation = excluded.translation, category = excluded.category,
        has_translation = excluded.has_translation, has_classification = excluded.has_classification,
        translation_source = excluded.translation_source, category_source = excluded.category_source, updated_at = excluded.updated_at`,
      {
        $tag: key,
        $display_tag: String(current.display_tag || tag).trim(),
        $translation: translation,
        $category: category,
        $has_translation:
          patch.translation === undefined
            ? Number(current.has_translation || 0)
            : translation
              ? 1
              : 0,
        $has_classification:
          patch.category === undefined ? Number(current.has_classification || 0) : 1,
        $translation_source:
          patch.translation === undefined
            ? String(current.translation_source || '')
            : translation
              ? 'manual'
              : '',
        $category_source:
          patch.category === undefined ? String(current.category_source || '') : 'manual',
        $updated_at: new Date().toISOString(),
      },
    );
    persist();
    return query('SELECT * FROM tag_dictionary WHERE tag = $tag', { $tag: key })[0] || null;
  };

  const listTagDictionary = (filters = {}) => {
    const search = String(filters.query || '')
      .trim()
      .toLowerCase()
      .slice(0, 240);
    const category = TAG_CATEGORIES.has(filters.category) ? filters.category : '';
    const allowedSources = new Set([
      'manual',
      'danbooru',
      'dso',
      'rule',
      'ai',
      'cache',
      'builtin',
      'heuristic',
    ]);
    const source = allowedSources.has(filters.source) ? filters.source : '';
    const limit = Math.min(200, Math.max(1, Number.parseInt(filters.limit, 10) || 50));
    const offset = Math.max(0, Number.parseInt(filters.offset, 10) || 0);
    const clauses = [];
    const params = {};

    if (search) {
      clauses.push(`(
        instr(lower(tag), $search) > 0
        OR instr(lower(display_tag), $search) > 0
        OR instr(lower(translation), $search) > 0
      )`);
      params.$search = search;
    }
    if (category) {
      clauses.push('category = $category');
      params.$category = category;
    }
    if (source) {
      clauses.push('(translation_source = $source OR category_source = $source)');
      params.$source = source;
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [{ total = 0 } = {}] = query(
      `SELECT COUNT(*) AS total FROM tag_dictionary ${whereClause}`,
      params,
    );
    const items = query(
      `SELECT *
       FROM tag_dictionary
       ${whereClause}
       ORDER BY updated_at DESC, tag ASC
       ${filters.all === true ? '' : 'LIMIT $limit OFFSET $offset'}`,
      filters.all === true ? params : { ...params, $limit: limit, $offset: offset },
    );

    return { items, total: Number(total) || 0, limit, offset };
  };

  const updateTagDictionaryCategory = (tags = [], category) => {
    if (!TAG_CATEGORIES.has(category)) throw new Error('Tag 分类无效');
    const keys = [...new Set(tags.map(dictionaryKey).filter(Boolean))];
    const existing = lookupTagDictionary(keys);
    const updatedAt = new Date().toISOString();
    database.run('BEGIN');
    try {
      for (const key of keys) {
        if (!existing.has(key)) continue;
        database.run(
          `UPDATE tag_dictionary
           SET category = $category, has_classification = 1, category_source = 'manual', updated_at = $updated_at
           WHERE tag = $tag`,
          { $category: category, $tag: key, $updated_at: updatedAt },
        );
      }
      database.run('COMMIT');
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
    if (existing.size) persist();
    return [...lookupTagDictionary(keys).values()];
  };

  const deleteTagDictionaries = (tags = []) => {
    const keys = [...new Set(tags.map(dictionaryKey).filter(Boolean))];
    const existing = lookupTagDictionary(keys);
    if (!existing.size) return 0;
    database.run('BEGIN');
    try {
      for (const key of existing.keys()) {
        database.run('DELETE FROM tag_dictionary WHERE tag = $tag', { $tag: key });
        const danbooruTag = danbooruLookupName(key);
        if (danbooruTag)
          database.run('DELETE FROM danbooru_tag_cache WHERE tag = $tag', { $tag: danbooruTag });
      }
      database.run('COMMIT');
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
    persist();
    return existing.size;
  };

  const deleteTagDictionary = (tag) => deleteTagDictionaries([tag]) > 0;

  const replaceTagDictionaryAI = (tag, annotation, expected) => {
    const key = dictionaryKey(tag);
    const current = lookupTagDictionary([key]).get(key);
    if (
      !current ||
      [
        'updated_at',
        'translation',
        'category',
        'translation_source',
        'category_source',
        'has_translation',
        'has_classification',
      ].some((field) => current[field] !== expected[field])
    )
      return false;
    database.run(
      `UPDATE tag_dictionary SET translation = $translation, category = $category,
      has_translation = 1, has_classification = 1, translation_source = 'ai', category_source = 'ai', updated_at = $updated_at
      WHERE tag = $tag`,
      {
        $tag: key,
        $translation: annotation.translation,
        $category: annotation.category,
        $updated_at: new Date().toISOString(),
      },
    );
    persist();
    return true;
  };

  const imageTagKeys = new WeakMap();
  const tagImageCounts = async () => {
    const counts = new Map();
    for (const card of await loadLibraryCards('all')) {
      let keys = imageTagKeys.get(card.filter_tags);
      if (!keys) {
        keys = new Set(card.filter_tags.map((tag) => dictionaryKey(tag.tag).replaceAll('_', ' ')));
        imageTagKeys.set(card.filter_tags, keys);
      }
      for (const key of keys) if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  };

  const enrichProjectTags = (project, cachedEntries = null) => {
    const cached = cachedEntries || lookupTagDictionary(projectTags(project).map((tag) => tag.tag));
    const enrich = (tag) => {
      const entry = cached.get(dictionaryKey(tag.tag));
      const normalizedCategory = normalizeCategory(tag.category, tag.tag);
      const ruleCategory = inferCategory(tag.tag);
      const useRule = tag.category_source !== 'manual' && ruleCategory !== 'Unsorted';
      const category = useRule ? ruleCategory : normalizedCategory;
      const migrated =
        category === tag.category
          ? tag
          : {
              ...tag,
              category,
              category_source: useRule ? 'rule' : tag.category_source || 'migration',
            };
      if (!entry) return migrated;
      const cachedCategoryWins =
        entry.has_classification &&
        (entry.category_source === 'manual' ||
          entry.category_source === 'danbooru' ||
          entry.category_source === 'dso' ||
          !useRule);
      return {
        ...migrated,
        ...(entry.has_translation
          ? {
              translation: entry.translation,
              translation_source: entry.translation_source || 'cache',
            }
          : {}),
        ...(cachedCategoryWins
          ? {
              category: normalizeCategory(entry.category, tag.tag),
              category_source: entry.category_source || 'cache',
            }
          : {}),
      };
    };
    const structure = project.prompt_structure || {};
    return {
      ...project,
      tags: (project.tags || []).map(enrich),
      prompt_structure: {
        ...structure,
        base_undesired_tags: (structure.base_undesired_tags || []).map(enrich),
        characters: (structure.characters || []).map((character) => ({
          ...character,
          prompt_tags: (character.prompt_tags || []).map(enrich),
          undesired_tags: (character.undesired_tags || []).map(enrich),
        })),
      },
    };
  };

  const generatedFields = (id) => {
    const row = query(
      'SELECT v.work_id, v.number, v.source FROM version_images vi JOIN work_versions v ON v.id=vi.version_id WHERE vi.project_id=$id ORDER BY (v.id IN (SELECT version_id FROM deleted_versions)), vi.rowid DESC LIMIT 1',
      { $id: id },
    )[0];
    return row
      ? {
          generated_work_id: row.work_id,
          version_number: row.number,
          generation_source: row.source,
        }
      : {};
  };
  const hydrateProject = (project) => {
    if (!project) return null;
    const metadata =
      query('SELECT * FROM generation_metadata WHERE project_id = $id', { $id: project.id })[0] ||
      {};
    const hydrated = enrichProjectTags({
      ...project,
      tags: query('SELECT * FROM prompt_tags WHERE project_id = $id ORDER BY position', {
        $id: project.id,
      }),
      metadata,
      prompt_structure: safeJson(metadata.prompt_structure_json),
    });
    return hydrateParameters({
      ...hydrated,
      ...generatedFields(project.id),
      work_refs: versionStore.workRefs(project.id).get(project.id) || [],
      ...namingFields(project, metadata),
      group_cover_id: '',
    });
  };

  const namingFields = (project, metadata) => {
    const saved = query('SELECT value FROM app_meta WHERE key = $key', {
      $key: 'image_naming:' + project.id,
    })[0];
    const naming = saved
      ? safeJson(saved.value)
      : safeJson(metadata.extra_json).studio_naming || {};
    return {
      original_filename: naming.original_filename || imageFileName(project),
      has_custom_name: naming.has_custom_name === true,
    };
  };

  const loadProject = (projectId) =>
    hydrateProject(
      query('SELECT * FROM projects WHERE id = $id', { $id: String(projectId || '') })[0],
    );
  const loadLibrary = (view = 'all') => {
    const where =
      view === 'trash'
        ? "projects.deleted_at != ''"
        : view === 'favorites'
          ? "projects.deleted_at = '' AND projects.is_favorite = 1"
          : "projects.deleted_at = ''";
    const projects = query(
      `SELECT projects.* FROM projects WHERE ${where} ORDER BY projects.created_at DESC, projects.rowid ASC`,
    );
    if (!projects.length) return [];

    const metadataByProject = new Map(
      query(
        `SELECT generation_metadata.* FROM generation_metadata
       JOIN projects ON projects.id = generation_metadata.project_id
       WHERE ${where}`,
      ).map((metadata) => [metadata.project_id, metadata]),
    );
    const tagsByProject = new Map();
    for (const tag of query(
      `SELECT prompt_tags.* FROM prompt_tags
       JOIN projects ON projects.id = prompt_tags.project_id
       WHERE ${where}
       ORDER BY prompt_tags.project_id, prompt_tags.position`,
    )) {
      if (!tagsByProject.has(tag.project_id)) tagsByProject.set(tag.project_id, []);
      tagsByProject.get(tag.project_id).push(tag);
    }
    const refs = versionStore.workRefs();
    const hydrated = projects.map((project) => {
      const metadata = metadataByProject.get(project.id) || {};
      return {
        ...project,
        tags: tagsByProject.get(project.id) || [],
        metadata,
        prompt_structure: safeJson(metadata.prompt_structure_json),
        work_refs: refs.get(project.id) || [],
        ...namingFields(project, metadata),
        group_cover_id: '',
      };
    });
    const cached = lookupTagDictionary(
      hydrated.flatMap((project) => projectTags(project).map((tag) => tag.tag)),
    );
    return hydrated.map((project) => hydrateParameters(enrichProjectTags(project, cached)));
  };

  const cardDirtyPrefix = 'library_cards_dirty:';
  const cardCacheVersionKey = 'library_cards_version';
  const cardMemory = new Map();
  const sharedCardTags = new Map();
  const sharedUndesired = new Map();
  const sharedCardProjections = new Map();
  const sharedSimilarityTags = new Map();
  const sharedCardMetadata = new Map();
  const sharedSearchPrompts = new Map();
  let cardDictionary = new Map();
  let cardDictionarySignature = '';
  let cardDictionaryRevision = 0;
  let cardInputId = 0;
  const clearCardMemory = () => {
    for (const cache of [
      cardMemory,
      sharedCardTags,
      sharedUndesired,
      sharedCardProjections,
      sharedSimilarityTags,
      sharedCardMetadata,
      sharedSearchPrompts,
    ])
      cache.clear();
    cardInputId = 0;
  };
  const sharedValue = (cache, key, parse = JSON.parse) => {
    if (!cache.has(key)) cache.set(key, parse(key));
    return cache.get(key);
  };
  // Persist only original enrichment inputs. Dictionary changes never rewrite
  // image projections, and old engines need no knowledge of this cache format.
  const cardTagDefaults = [undefined, '', 'Unsorted', null, 1, false, 0];
  const encodeCardTag = (tag) => {
    const values = [
      tag.tag,
      tag.translation || '',
      tag.category,
      tag.category_source || null,
      typeof tag.weight === 'number' && !Number.isFinite(tag.weight)
        ? String(tag.weight)
        : tag.weight,
      tag.tag === undefined,
      tag.brace_depth ?? 0,
    ];
    // Omit only trailing defaults; explicit nulls and missing-tag markers keep
    // their meaning. Common unannotated tags become a one-element tuple.
    while (values.length > 1 && values.at(-1) === cardTagDefaults[values.length - 1]) values.pop();
    return JSON.stringify(values);
  };
  const decodeCardTag = (key) =>
    sharedValue(sharedCardTags, key, (value) => {
      const [
        tag,
        translation = '',
        category = 'Unsorted',
        category_source = null,
        weight = 1,
        missing = false,
        brace_depth = 0,
      ] = JSON.parse(value);
      const source = {
        tag: missing ? undefined : tag,
        translation,
        category,
        category_source,
        weight,
        brace_depth,
      };
      return { source, key: dictionaryKey(source.tag), revision: -1, id: cardInputId++ };
    });
  const refreshCardTag = (input) => {
    if (input.revision === cardDictionaryRevision) return;
    const entry = cardDictionary.get(input.key);
    if (input.revision < 0 || input.dictionary !== entry) {
      const tag = enrichProjectTags({ tags: [input.source] }, cardDictionary).tags[0];
      input.enriched = tag;
      input.filter = { tag: tag.tag, translation: tag.translation || '', category: tag.category };
      input.similarity = normalizedSimilarityTag(tag);
      input.pair = input.similarity
        ? sharedValue(
            sharedSimilarityTags,
            JSON.stringify([input.similarity.key, input.similarity.value]),
          )
        : null;
      input.changed = cardDictionaryRevision;
      input.dictionary = entry;
    }
    input.revision = cardDictionaryRevision;
  };
  const similarityPairs = (values) =>
    [...values].map((pair) => sharedValue(sharedSimilarityTags, JSON.stringify(pair)));
  const refreshUndesired = (input) => {
    if (input.revision === cardDictionaryRevision) return;
    for (const tag of input.tags || []) refreshCardTag(tag);
    if (input.revision < 0 || input.tags?.some((tag) => tag.changed > input.revision)) {
      // Enrichment precedes legacy-fragment repair, just as in the full reader.
      // Raw fallback tags are deliberately not dictionary-enriched afterwards.
      const structure = normalizePromptStructure(
        { base_undesired_tags: input.tags?.map((tag) => tag.enriched) },
        { negative_prompt: input.raw },
        () => '',
      );
      input.pairs = similarityPairs(similarityTagMap(structure.base_undesired_tags));
      input.changed = cardDictionaryRevision;
    }
    input.revision = cardDictionaryRevision;
  };
  const refreshCardProjection = (entry) => {
    if (entry.revision === cardDictionaryRevision) return;
    for (const tag of entry.inputs) refreshCardTag(tag);
    refreshUndesired(entry.undesired);
    if (
      entry.revision < 0 ||
      entry.undesired.changed > entry.revision ||
      entry.inputs.some((tag) => tag.changed > entry.revision)
    ) {
      const prompt = new Map();
      for (let i = 0; i < entry.promptCount; i++) {
        const pair = entry.inputs[i].pair;
        if (pair && (!prompt.has(pair[0]) || pair[1] > prompt.get(pair[0])[1]))
          prompt.set(pair[0], pair);
      }
      entry.card.filter_tags = entry.inputs.map((tag) => tag.filter);
      entry.card.base_prompt_similarity = {
        prompt: [...prompt.values()],
        undesired: entry.undesired.pairs,
      };
    }
    entry.revision = cardDictionaryRevision;
  };
  const refreshCard = (entry) => {
    if (entry.revision === cardDictionaryRevision) return;
    refreshCardProjection(entry.projection);
    entry.card.filter_tags = entry.projection.card.filter_tags;
    entry.card.base_prompt_similarity = entry.projection.card.base_prompt_similarity;
    entry.revision = cardDictionaryRevision;
  };
  const syncCardDictionary = () => {
    const dictionary = query(`SELECT tag, translation, category, has_translation,
      has_classification, translation_source, category_source FROM tag_dictionary ORDER BY tag`);
    const signature = JSON.stringify(dictionary);
    if (signature === cardDictionarySignature) return false;
    const next = new Map();
    for (const row of dictionary) {
      const previous = cardDictionary.get(row.tag);
      next.set(
        row.tag,
        previous && JSON.stringify(previous) === JSON.stringify(row) ? previous : row,
      );
    }
    cardDictionary = next;
    cardDictionarySignature = signature;
    cardDictionaryRevision++;
    return true;
  };
  const decodeCardCache = (row) => {
    const {
      inputs: encodedInputs,
      undesired: encodedUndesired,
      promptCount,
      ...entry
    } = JSON.parse(row.payload);
    // Fingerprints are already serialized strings. Separate columns avoid
    // decoding an additional JSON escaping layer on every cold read.
    entry.card.prompt_fingerprint = row.prompt_fingerprint;
    entry.card.base_prompt_fingerprint = row.base_prompt_fingerprint;
    entry.card.vibe_fingerprint = row.vibe_fingerprint;
    entry.card.metadata = sharedValue(sharedCardMetadata, entry.card.metadata);
    entry.card.search_prompts = sharedValue(sharedSearchPrompts, entry.card.search_prompts);
    const inputs = encodedInputs.map(decodeCardTag);
    const undesired = sharedValue(sharedUndesired, encodedUndesired, (value) => {
      const recipe = JSON.parse(value);
      return {
        raw: recipe.raw,
        tags: recipe.tags?.map(decodeCardTag),
        revision: -1,
        id: cardInputId++,
      };
    });
    // Identical prompt inputs share the complete projection, not just its tags.
    // This also reduces Electron's structured clone work without changing values.
    const key = `${inputs.map((input) => input.id).join(',')}|${promptCount}|${undesired.id}`;
    entry.projection = sharedValue(sharedCardProjections, key, () => ({
      inputs,
      undesired,
      promptCount,
      card: {},
      revision: -1,
    }));
    entry.revision = -1;
    refreshCard(entry);
    return entry;
  };
  const coverKey = (fingerprint) =>
    createHash('sha256')
      .update(String(fingerprint || ''))
      .digest('hex');
  let cardSchemaVersion;
  const hasCardCache = () =>
    query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'library_card_cache'")
      .length > 0;
  const invalidateCards = (full = false, includeFingerprints = false, consume = true) => {
    const dirty = query(`SELECT substr(key, ${cardDirtyPrefix.length + 1}) AS id
      FROM app_meta WHERE key GLOB '${cardDirtyPrefix}*'
      ${includeFingerprints ? `UNION SELECT substr(key, ${fingerprintDirtyPrefix.length + 1}) FROM app_meta WHERE key GLOB '${fingerprintDirtyPrefix}*'` : ''}`);
    if (full) clearCardMemory();
    else for (const { id } of dirty) cardMemory.delete(id);
    if (hasCardCache()) {
      if (full) database.run('DELETE FROM library_card_cache');
      else {
        const remove = database.prepare('DELETE FROM library_card_cache WHERE project_id = $id');
        for (const { id } of dirty) remove.run({ $id: id });
      }
    }
    database.run(`DELETE FROM app_meta WHERE key GLOB '${cardDirtyPrefix}*'
      ${consume ? '' : `AND NOT EXISTS (SELECT 1 FROM projects WHERE id = substr(key, ${cardDirtyPrefix.length + 1}))`}`);
  };

  const prepareCardCache = () => {
    const version = '6:image-naming';
    const previousVersion = query('SELECT value FROM app_meta WHERE key = $key', {
      $key: cardCacheVersionKey,
    })[0]?.value;
    if (version !== previousVersion) database.run('DROP TABLE IF EXISTS library_card_cache');
    database.run(`CREATE TABLE IF NOT EXISTS library_card_cache (
      project_id TEXT PRIMARY KEY, project_order INTEGER NOT NULL,
      created_at TEXT NOT NULL, is_favorite INTEGER NOT NULL,
      deleted_at TEXT NOT NULL, payload TEXT NOT NULL,
      prompt_fingerprint TEXT NOT NULL, base_prompt_fingerprint TEXT,
      vibe_fingerprint TEXT NOT NULL
    )`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_library_card_order ON library_card_cache
      (created_at DESC, project_order, project_id, is_favorite, deleted_at)`);
    const schemaVersion = query('PRAGMA schema_version')[0].schema_version;
    if (schemaVersion !== cardSchemaVersion) clearCardMemory();
    cardSchemaVersion = schemaVersion;
    invalidateCards(version !== previousVersion, false, false);
    if (version !== previousVersion)
      database.run('INSERT OR REPLACE INTO app_meta(key, value) VALUES ($key, $value)', {
        $key: cardCacheVersionKey,
        $value: version,
      });
    return query(`SELECT p.id, p.rowid AS project_order FROM projects p
      WHERE NOT EXISTS (SELECT 1 FROM library_card_cache c WHERE c.project_id = p.id)`);
  };
  const buildCardBatch = (rebuild, offset) => {
    // Optional acceptance scheduler controls work size, not the process clock.
    const fixedRows = cardBuildSchedule?.rowsPerBatch;
    const start = performance.now();
    const save = database.prepare(
      `INSERT OR REPLACE INTO library_card_cache(project_id, project_order, created_at,
        is_favorite, deleted_at, payload, prompt_fingerprint, base_prompt_fingerprint, vibe_fingerprint)
        VALUES ($id, $order, $created, $favorite, $deleted, $payload, $prompt, $base, $vibe)`,
    );
    let index = offset;
    for (; index < rebuild.length && index < offset + (fixedRows ?? 25); index++) {
      if (fixedRows === undefined && index > offset && performance.now() - start >= 12) break;
      const row = rebuild[index];
      const fingerprints = query(
        `SELECT rowid AS project_order, id, name, image_path, thumbnail_path, created_at, is_favorite, deleted_at,
        prompt_fingerprint, base_prompt_fingerprint, vibe_fingerprint, exact_group_fingerprint
        FROM projects WHERE id = $id`,
        { $id: row.id },
      )[0];
      if (!fingerprints) continue;
      // Legacy prompt repair needs extra_json only when this image is dirty.
      const metadata =
        query(
          `SELECT model, width, height, prompt_raw, negative_prompt,
        prompt_structure_json, extra_json FROM generation_metadata WHERE project_id = $id`,
          { $id: row.id },
        )[0] || {};
      const project = {
        tags: query('SELECT * FROM prompt_tags WHERE project_id = $id ORDER BY position', {
          $id: row.id,
        }),
        metadata,
        prompt_structure: safeJson(metadata.prompt_structure_json),
      };
      const structure = project.prompt_structure;
      // Full fingerprints already embed their base payload. Use a lossless alias
      // only after proving it equals the separately stored base fingerprint.
      const embeddedBase = JSON.stringify(safeJson(fingerprints.prompt_fingerprint).base);
      const {
        exact_group_fingerprint,
        project_order,
        prompt_fingerprint,
        base_prompt_fingerprint,
        vibe_fingerprint,
        ...cardFields
      } = fingerprints;
      const baseFingerprint =
        base_prompt_fingerprint && base_prompt_fingerprint === embeddedBase
          ? null
          : base_prompt_fingerprint;
      const payload = {
        ...cardFields,
        ...namingFields(cardFields, metadata),
        metadata: {
          model: metadata.model || '',
          width: metadata.width || 0,
          height: metadata.height || 0,
        },
        search_prompts: [
          ...new Set(
            [
              metadata.prompt_raw,
              metadata.negative_prompt,
              structure.base_prompt_raw,
              structure.base_undesired_raw,
              ...(structure.characters || []).flatMap((character) => [
                character.prompt_raw,
                character.undesired_raw,
              ]),
            ].filter(Boolean),
          ),
        ],
      };
      const raw =
        extractV4PromptData(
          safeJson(metadata.extra_json).parsed || {},
          metadata.prompt_raw,
          metadata.negative_prompt,
          metadata.model,
        ).base_undesired_raw ||
        metadata.negative_prompt ||
        '';
      const serialized = JSON.stringify({
        card: {
          ...payload,
          metadata: JSON.stringify(payload.metadata),
          search_prompts: JSON.stringify(payload.search_prompts),
        },
        coverKey: coverKey(exact_group_fingerprint),
        inputs: projectTags(project).map(encodeCardTag),
        promptCount: project.tags.length,
        undesired: JSON.stringify({
          raw,
          tags: (structure.base_undesired_tags || []).map(encodeCardTag),
        }),
      });
      save.run({
        $id: row.id,
        $order: project_order,
        $created: payload.created_at,
        $favorite: payload.is_favorite,
        $deleted: payload.deleted_at,
        $payload: serialized,
        $prompt: prompt_fingerprint,
        $base: baseFingerprint,
        $vibe: vibe_fingerprint,
      });
      database.run('DELETE FROM app_meta WHERE key = $key', { $key: cardDirtyPrefix + row.id });
      cardMemory.set(
        row.id,
        decodeCardCache({
          payload: serialized,
          prompt_fingerprint,
          base_prompt_fingerprint: baseFingerprint,
          vibe_fingerprint,
        }),
      );
    }
    return index;
  };
  let cardBuild;
  let cardCompleted = 0;
  const cardProgressListeners = new Map();
  const reportCardProgress = () => {
    const { total, completed } = query(`SELECT count(*) AS total,
      count(c.project_id) AS completed FROM projects p
      LEFT JOIN library_card_cache c ON c.project_id = p.id`)[0];
    // Deletions and dirty-row invalidation can lower the live cache count.
    // Progress is advisory and monotonic within a build, even if total shrinks.
    cardCompleted = Math.max(cardCompleted, completed);
    for (const listener of cardProgressListeners.keys())
      listener({ completed: cardCompleted, total });
  };
  const yieldCardBuild = () => new Promise((resolve) => setImmediate(resolve));
  const ensureLibraryCards = async () => {
    cardCompleted = 0;
    let worked = false;
    try {
      for (;;) {
        if (closed) throw Error('Database closed during card cache build');
        const rebuild = atomic(prepareCardCache)();
        syncCardDictionary();
        if (rebuild.length) {
          worked = true;
          reportCardProgress();
          for (let offset = 0; offset < rebuild.length; ) {
            if (closed) throw Error('Database closed during card cache build');
            offset = atomic(buildCardBatch)(rebuild, offset);
            reportCardProgress();
            await yieldCardBuild();
          }
          // Writes between batches have durable dirty markers. Consume them in
          // a new transaction, including rows already built in an earlier batch.
          continue;
        }
        const missing = query('SELECT project_id FROM library_card_cache').filter(
          (row) => !cardMemory.has(row.project_id),
        );
        let decodeStart = performance.now();
        for (let offset = 0; offset < missing.length; offset += 100) {
          if (closed) throw Error('Database closed during card cache build');
          const params = Object.fromEntries(
            missing.slice(offset, offset + 100).map((row, i) => [`$id${i}`, row.project_id]),
          );
          for (const entry of query(
            `SELECT project_id, payload, prompt_fingerprint, base_prompt_fingerprint, vibe_fingerprint FROM library_card_cache
            WHERE project_id IN (${Object.keys(params).join(',')})`,
            params,
          ))
            cardMemory.set(entry.project_id, decodeCardCache(entry));
          // Reopening a cache is much cheaper than building it. Yield by work
          // time, not every small SQL read: Electron's event-loop handoff can
          // otherwise dominate the cold request's total latency.
          if (offset + 100 < missing.length && performance.now() - decodeStart >= 48) {
            await yieldCardBuild();
            decodeStart = performance.now();
          }
        }
        let start = performance.now();
        for (const entry of cardMemory.values()) {
          refreshCard(entry);
          if (performance.now() - start >= 12) {
            await yieldCardBuild();
            if (closed) throw Error('Database closed during card cache build');
            start = performance.now();
          }
        }
        // A final synchronous fence covers imports, renames, deletions and
        // dictionary edits that arrived while decoding or refreshing cards.
        // Give the IPC reply its own turn: its structured clone must not share
        // the last build batch's time budget.
        if (worked) await yieldCardBuild();
        if (closed) throw Error('Database closed during card cache build');
        if (worked) reportCardProgress();
        if (
          syncCardDictionary() ||
          query(`SELECT 1 FROM app_meta
          WHERE key GLOB '${cardDirtyPrefix}*' LIMIT 1`).length
        )
          continue;
        return;
      }
    } catch (error) {
      // Committed batches remain reusable after interruption; the failed batch
      // rolls back and missing rows/dirty markers guarantee a safe retry.
      clearCardMemory();
      throw error;
    }
  };
  const loadLibraryCards = async (view = 'all', onProgress) => {
    // Resolution is the completion signal. Consumers must not wait for a final
    // progress event: IPC delivery can lag the reply, and hot reads emit none.
    if (onProgress)
      cardProgressListeners.set(onProgress, (cardProgressListeners.get(onProgress) || 0) + 1);
    try {
      if (!cardBuild)
        cardBuild = ensureLibraryCards().finally(() => {
          cardBuild = null;
        });
      await cardBuild;
      const cards = readLibraryCards(view);
      // Return the complete snapshot on a fresh turn so IPC serialization does
      // not extend the synchronous database/read work, including hot reads.
      await yieldCardBuild();
      return cards;
    } finally {
      if (onProgress) {
        const remaining = cardProgressListeners.get(onProgress) - 1;
        if (remaining) cardProgressListeners.set(onProgress, remaining);
        else cardProgressListeners.delete(onProgress);
      }
    }
  };
  const readLibraryCards = (view) => {
    const where =
      view === 'trash'
        ? "deleted_at != ''"
        : view === 'favorites'
          ? "deleted_at = '' AND is_favorite = 1"
          : "deleted_at = ''";
    // Original ORDER BY created_at ties followed the projects table's row order.
    const rows = query(`SELECT project_id FROM library_card_cache WHERE ${where}
      ORDER BY created_at DESC, project_order`);
    const generated = new Map(
      query(
        'SELECT vi.project_id,v.work_id,v.number,v.source FROM version_images vi JOIN work_versions v ON v.id=vi.version_id ORDER BY (v.id IN (SELECT version_id FROM deleted_versions)) DESC, vi.rowid',
      ).map((row) => [
        row.project_id,
        {
          generated_work_id: row.work_id,
          version_number: row.number,
          generation_source: row.source,
        },
      ]),
    );
    const refs = versionStore.workRefs();
    return rows.map((row) => {
      const entry = cardMemory.get(row.project_id);
      return {
        ...entry.card,
        ...generated.get(row.project_id),
        work_refs: refs.get(row.project_id) || [],
        group_cover_id: '',
      };
    });
  };

  const cleanCollectionName = (name) => {
    const cleaned = String(name || '').trim();
    if (!cleaned) throw new Error('收藏集名称不能为空');
    if (cleaned.length > 80) throw new Error('收藏集名称不能超过 80 个字符');
    return cleaned;
  };
  const collectionFilters = (value) => {
    const filters = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const serialized = JSON.stringify(filters);
    if (serialized.length > 20_000) throw new Error('智能收藏集筛选条件过大');
    return serialized;
  };
  const migrateLegacyFavorites = () => {
    const migrated = query('SELECT value FROM app_meta WHERE key = $key', {
      $key: FAVORITES_COLLECTION_MIGRATION_KEY,
    })[0];
    if (migrated?.value === 'complete') return { migrated: false, projectIds: [] };
    const favoriteIds = query(
      'SELECT id FROM projects WHERE is_favorite = 1 ORDER BY created_at ASC',
    ).map((project) => project.id);
    const nowValue = new Date().toISOString();
    database.run('BEGIN');
    try {
      database.run(
        `INSERT OR IGNORE INTO gallery_collections (id, name, kind, filter_json, created_at, updated_at)
         VALUES ($id, $name, 'manual', '{}', $created_at, $updated_at)`,
        {
          $id: DEFAULT_GALLERY_COLLECTION_ID,
          $name: '默认收藏夹',
          $created_at: nowValue,
          $updated_at: nowValue,
        },
      );
      for (const projectId of favoriteIds)
        database.run(
          `INSERT OR IGNORE INTO gallery_collection_projects (collection_id, project_id, created_at)
         VALUES ($collection_id, $project_id, $created_at)`,
          {
            $collection_id: DEFAULT_GALLERY_COLLECTION_ID,
            $project_id: projectId,
            $created_at: nowValue,
          },
        );
      database.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES ($key, $value)', {
        $key: FAVORITES_COLLECTION_MIGRATION_KEY,
        $value: 'complete',
      });
      database.run('COMMIT');
      persist();
      return { migrated: true, projectIds: favoriteIds };
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };
  const listCollections = () => {
    migrateLegacyFavorites();
    return query(
      `SELECT gallery_collections.*,
      (SELECT COUNT(*) FROM gallery_collection_projects
       JOIN projects ON projects.id = gallery_collection_projects.project_id
       WHERE gallery_collection_projects.collection_id = gallery_collections.id AND projects.deleted_at = '') AS active_member_count
     FROM gallery_collections
     ORDER BY CASE WHEN id = '${DEFAULT_GALLERY_COLLECTION_ID}' THEN 0 ELSE 1 END, created_at ASC`,
    ).map((collection) => ({
      ...collection,
      filters: safeJson(collection.filter_json),
      member_ids:
        collection.kind === 'manual'
          ? query(
              'SELECT project_id FROM gallery_collection_projects WHERE collection_id = $id ORDER BY created_at ASC',
              { $id: collection.id },
            ).map((row) => row.project_id)
          : [],
    }));
  };
  const loadCollection = (id) =>
    listCollections().find((collection) => collection.id === String(id || '')) || null;
  const createCollection = (value = {}) => {
    const id = String(value.id || '').trim();
    if (!id) throw new Error('收藏集 ID 不能为空');
    const kind = value.kind === 'smart' ? 'smart' : 'manual';
    const name = cleanCollectionName(value.name);
    const nowValue = new Date().toISOString();
    database.run(
      `INSERT INTO gallery_collections (id, name, kind, filter_json, created_at, updated_at)
       VALUES ($id, $name, $kind, $filter_json, $created_at, $updated_at)`,
      {
        $id: id,
        $name: name,
        $kind: kind,
        $filter_json: kind === 'smart' ? collectionFilters(value.filters) : '{}',
        $created_at: nowValue,
        $updated_at: nowValue,
      },
    );
    persist();
    return loadCollection(id);
  };
  const updateCollection = (id, patch = {}) => {
    const collection = query('SELECT * FROM gallery_collections WHERE id = $id', {
      $id: String(id || ''),
    })[0];
    if (!collection) throw new Error('收藏集不存在');
    const name = patch.name === undefined ? collection.name : cleanCollectionName(patch.name);
    const filterJson =
      collection.kind === 'smart' && patch.filters !== undefined
        ? collectionFilters(patch.filters)
        : collection.filter_json;
    database.run(
      `UPDATE gallery_collections SET name = $name, filter_json = $filter_json, updated_at = $updated_at WHERE id = $id`,
      {
        $id: collection.id,
        $name: name,
        $filter_json: filterJson,
        $updated_at: new Date().toISOString(),
      },
    );
    persist();
    return loadCollection(collection.id);
  };
  const deleteCollection = (id) => {
    const collectionId = String(id || '');
    const exists = Boolean(
      query('SELECT id FROM gallery_collections WHERE id = $id', { $id: collectionId })[0],
    );
    if (!exists) return false;
    database.run('DELETE FROM gallery_collection_projects WHERE collection_id = $id', {
      $id: collectionId,
    });
    database.run('DELETE FROM gallery_collections WHERE id = $id', { $id: collectionId });
    persist();
    return true;
  };
  const updateCollectionProjects = (collectionId, projectIds = [], action = 'add') => {
    const id = String(collectionId || '');
    const collection = query('SELECT id, kind FROM gallery_collections WHERE id = $id', {
      $id: id,
    })[0];
    if (!collection) throw new Error('收藏集不存在');
    if (collection.kind !== 'manual') throw new Error('智能收藏集由筛选条件自动管理');
    const uniqueIds = [...new Set(projectIds.map(String).filter(Boolean))];
    const results = { success: [], skipped: [], failed: [] };
    database.run('BEGIN');
    try {
      for (const projectId of uniqueIds) {
        const project = query('SELECT id FROM projects WHERE id = $id', { $id: projectId })[0];
        if (!project) {
          results.failed.push({ id: projectId, error: '图片不存在' });
          continue;
        }
        const membership = query(
          'SELECT project_id FROM gallery_collection_projects WHERE collection_id = $collection_id AND project_id = $project_id',
          { $collection_id: id, $project_id: projectId },
        )[0];
        if (action === 'remove') {
          if (!membership) {
            results.skipped.push(projectId);
            continue;
          }
          database.run(
            'DELETE FROM gallery_collection_projects WHERE collection_id = $collection_id AND project_id = $project_id',
            { $collection_id: id, $project_id: projectId },
          );
        } else {
          if (membership) {
            results.skipped.push(projectId);
            continue;
          }
          database.run(
            `INSERT INTO gallery_collection_projects (collection_id, project_id, created_at)
             VALUES ($collection_id, $project_id, $created_at)`,
            { $collection_id: id, $project_id: projectId, $created_at: new Date().toISOString() },
          );
        }
        results.success.push(projectId);
      }
      database.run('COMMIT');
      persist();
      return results;
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };

  const insertProject = (project) => {
    database.run('BEGIN');
    try {
      const groupingFingerprints = galleryProjectGroupingFingerprints(project);
      database.run(
        `INSERT INTO projects (id, name, image_path, thumbnail_path, content_hash, prompt_fingerprint, base_prompt_fingerprint, vibe_fingerprint, exact_group_fingerprint, is_favorite, deleted_at, created_at, updated_at)
         VALUES ($id, $name, $image_path, $thumbnail_path, $content_hash, $prompt_fingerprint, $base_prompt_fingerprint, $vibe_fingerprint, $exact_group_fingerprint, 0, '', $created_at, $updated_at)`,
        {
          $id: project.id,
          $name: String(project.name || 'Untitled'),
          $image_path: String(project.image_path || ''),
          $thumbnail_path: String(project.thumbnail_path || ''),
          $content_hash: String(project.content_hash || ''),
          $prompt_fingerprint: groupingFingerprints.promptFingerprint,
          $base_prompt_fingerprint: groupingFingerprints.basePromptFingerprint,
          $vibe_fingerprint: String(project.metadata?.vibe_fingerprint || ''),
          $exact_group_fingerprint: groupingFingerprints.exactGroupFingerprint,
          $created_at: String(project.created_at || new Date().toISOString()),
          $updated_at: String(project.updated_at || project.created_at || new Date().toISOString()),
        },
      );
      for (const [position, tag] of (project.tags || []).entries()) {
        database.run(
          `INSERT INTO prompt_tags (id, project_id, tag, translation, category, weight, position, note, raw_segment, syntax_issue, brace_depth, brace_group, brace_trailing_comma)
           VALUES ($id, $project_id, $tag, $translation, $category, $weight, $position, '', $raw_segment, $syntax_issue, $brace_depth, $brace_group, $brace_trailing_comma)`,
          {
            $id: tag.id,
            $project_id: project.id,
            $tag: String(tag.tag || ''),
            $translation: String(tag.translation || ''),
            $category: normalizeCategory(tag.category, tag.tag),
            $weight: Number(tag.weight ?? 1),
            $position: position,
            $raw_segment: String(tag.raw_segment || ''),
            $syntax_issue: String(tag.syntax_issue || ''),
            $brace_depth: Math.trunc(Number(tag.brace_depth) || 0),
            $brace_group: String(tag.brace_group || ''),
            $brace_trailing_comma: tag.brace_trailing_comma ? 1 : 0,
          },
        );
      }
      const metadata = project.metadata || {};
      database.run(
        `INSERT INTO generation_metadata (project_id, prompt_raw, negative_prompt, prompt_structure_json, model, seed, steps, sampler, guidance, width, height, generation_mode, extra_json)
         VALUES ($project_id, $prompt_raw, $negative_prompt, $prompt_structure_json, $model, $seed, $steps, $sampler, $guidance, $width, $height, $generation_mode, $extra_json)`,
        {
          $project_id: project.id,
          $prompt_raw: String(metadata.prompt_raw || ''),
          $negative_prompt: String(metadata.negative_prompt || ''),
          $prompt_structure_json: JSON.stringify(project.prompt_structure || {}),
          $model: String(metadata.model || ''),
          $seed: String(metadata.seed || ''),
          $steps: Number.isFinite(Number(metadata.steps)) ? Number(metadata.steps) : null,
          $sampler: String(metadata.sampler || ''),
          $guidance: Number.isFinite(Number(metadata.guidance)) ? Number(metadata.guidance) : null,
          $width: Math.max(0, Math.round(Number(metadata.width || 0))),
          $height: Math.max(0, Math.round(Number(metadata.height || 0))),
          $generation_mode: String(metadata.generation_mode || 'unknown'),
          $extra_json: String(metadata.extra_json || '{}'),
        },
      );
      upsertTagDictionary(projectTags(project));
      database.run('COMMIT');
      persist();
      return loadProject(project.id);
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };

  const findProjectByContentHash = (contentHash) =>
    query(
      'SELECT id, name, image_path, thumbnail_path, deleted_at FROM projects WHERE content_hash = $content_hash LIMIT 1',
      { $content_hash: String(contentHash || '') },
    )[0] || null;

  // An explicit workbench save changes the library's prompt record, never the
  // original image bytes. Keep collection membership and the asset identity.
  const saveProjectPrompt = (id, draft) => {
    const existing = loadProject(id);
    if (!existing) throw new Error('图片不存在');
    const next = {
      ...existing,
      tags: draft.tags,
      prompt_structure: draft.prompt_structure,
      metadata: {
        ...existing.metadata,
        prompt_raw: draft.metadata.prompt_raw,
        negative_prompt: draft.metadata.negative_prompt,
      },
    };
    const fingerprints = galleryProjectGroupingFingerprints(next);
    database.run('BEGIN');
    try {
      database.run('DELETE FROM prompt_tags WHERE project_id = $id', { $id: id });
      for (const [position, tag] of next.tags.entries())
        database.run(
          `INSERT INTO prompt_tags (id, project_id, tag, translation, category, weight, position, note, raw_segment, syntax_issue, brace_depth, brace_group, brace_trailing_comma)
         VALUES ($tag_id, $id, $tag, $translation, $category, $weight, $position, $note, $raw_segment, $syntax_issue, $brace_depth, $brace_group, $brace_trailing_comma)`,
          {
            $tag_id: `${id}:saved:${position}`,
            $id: id,
            $tag: tag.tag,
            $translation: tag.translation || '',
            $category: normalizeCategory(tag.category, tag.tag),
            $weight: tag.weight ?? 1,
            $position: position,
            $note: tag.note || '',
            $raw_segment: tag.raw_segment || '',
            $syntax_issue: tag.syntax_issue || '',
            $brace_depth: tag.brace_depth || 0,
            $brace_group: tag.brace_group || '',
            $brace_trailing_comma: tag.brace_trailing_comma ? 1 : 0,
          },
        );
      database.run(
        'UPDATE generation_metadata SET prompt_raw=$prompt, negative_prompt=$negative, prompt_structure_json=$structure, extra_json=$extra WHERE project_id=$id',
        {
          $id: id,
          $prompt: next.metadata.prompt_raw,
          $negative: next.metadata.negative_prompt,
          $structure: JSON.stringify(next.prompt_structure),
          $extra: JSON.stringify({
            ...safeJson(existing.metadata.extra_json),
            studio_generation: {
              params: draft.params,
              references: draft.references,
              keptParameters: draft.keptParameters,
            },
          }),
        },
      );
      database.run(
        'UPDATE projects SET prompt_fingerprint=$prompt, base_prompt_fingerprint=$base, exact_group_fingerprint=$exact, updated_at=$time WHERE id=$id',
        {
          $id: id,
          $prompt: fingerprints.promptFingerprint,
          $base: fingerprints.basePromptFingerprint,
          $exact: fingerprints.exactGroupFingerprint,
          $time: new Date().toISOString(),
        },
      );
      clearInvalidGroupCovers();
      database.run('COMMIT');
      persist();
      return loadProject(id);
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };
  const projectHashCandidates = () =>
    query("SELECT id, image_path FROM projects WHERE content_hash = '' AND deleted_at = ''");
  const projectDimensionCandidates = () =>
    query(
      `SELECT projects.id, projects.image_path FROM projects JOIN generation_metadata ON generation_metadata.project_id = projects.id
     WHERE projects.deleted_at = '' AND (generation_metadata.width <= 0 OR generation_metadata.height <= 0)`,
    );
  const setProjectContentHashes = (items = []) => {
    database.run('BEGIN');
    try {
      for (const item of items)
        database.run(
          "UPDATE projects SET content_hash = $hash WHERE id = $id AND content_hash = ''",
          { $id: String(item.id || ''), $hash: String(item.content_hash || '') },
        );
      database.run('COMMIT');
      persist();
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };
  const setProjectDimensions = (items = []) => {
    database.run('BEGIN');
    try {
      for (const item of items)
        database.run(
          'UPDATE generation_metadata SET width = $width, height = $height WHERE project_id = $id AND (width <= 0 OR height <= 0)',
          {
            $id: String(item.id || ''),
            $width: Math.max(0, Math.round(Number(item.width || 0))),
            $height: Math.max(0, Math.round(Number(item.height || 0))),
          },
        );
      database.run('COMMIT');
      persist();
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };
  const relocateAssetPaths = (sourceDirectory, targetDirectory) => {
    const source = path.resolve(String(sourceDirectory || ''));
    const target = path.resolve(String(targetDirectory || ''));
    const relocate = (filePath) => {
      const absolutePath = path.resolve(String(filePath || ''));
      const relative = path.relative(source, absolutePath);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
        return String(filePath || '');
      return path.join(target, relative);
    };
    let updated = 0;
    database.run('BEGIN');
    try {
      for (const project of query('SELECT id, image_path, thumbnail_path FROM projects')) {
        const imagePath = relocate(project.image_path);
        const thumbnailPath = relocate(project.thumbnail_path);
        if (imagePath === project.image_path && thumbnailPath === project.thumbnail_path) continue;
        database.run(
          'UPDATE projects SET image_path = $image_path, thumbnail_path = $thumbnail_path WHERE id = $id',
          { $id: project.id, $image_path: imagePath, $thumbnail_path: thumbnailPath },
        );
        updated += 1;
      }
      database.run('COMMIT');
      persist();
      return updated;
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };
  const versionStore = createVersionStore(connection);
  const deleteProject = (id) => {
    const projectId = String(id || '');
    versionStore.discardDetachedImage(projectId);
    versionStore.purgeImage(projectId);
    database.run('DELETE FROM gallery_collection_projects WHERE project_id = $id', {
      $id: projectId,
    });
    database.run('DELETE FROM prompt_group_covers WHERE project_id = $id', { $id: projectId });
    database.run('DELETE FROM projects WHERE id = $id', { $id: projectId });
    database.run('DELETE FROM app_meta WHERE key = $key', { $key: 'image_naming:' + projectId });
    persist();
  };

  const updateProjectName = (id, name, hasCustomName = true, restoring = false) => {
    const cleaned = restoring ? String(name || '') : String(name || '').trim();
    if (!cleaned) throw new Error('图片名称不能为空');
    if (!restoring && cleaned.length > 160) throw new Error('图片名称不能超过 160 个字符');
    const project = query('SELECT id, deleted_at FROM projects WHERE id = $id', {
      $id: String(id || ''),
    })[0];
    if (!project) throw new Error('图片不存在');
    if (project.deleted_at) throw new Error('请先从回收站恢复图片');
    const previous = loadProject(project.id);
    database.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES ($key, $value)', {
      $key: 'image_naming:' + project.id,
      $value: JSON.stringify({
        original_filename: previous.original_filename,
        has_custom_name: hasCustomName,
      }),
    });
    database.run('UPDATE projects SET name = $name, updated_at = $updated_at WHERE id = $id', {
      $id: project.id,
      $name: cleaned,
      $updated_at: new Date().toISOString(),
    });
    persist();
    return loadProject(project.id);
  };

  const updateProjects = (ids = [], patch = {}, afterUpdate = (_results) => {}) => {
    const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
    const results = { success: [], skipped: [], failed: [] };
    const nowValue = new Date().toISOString();
    database.run('BEGIN');
    try {
      for (const id of uniqueIds) {
        const project = query('SELECT id, is_favorite, deleted_at FROM projects WHERE id = $id', {
          $id: id,
        })[0];
        if (!project) {
          results.failed.push({ id, error: '图片不存在' });
          continue;
        }
        const favorite =
          patch.isFavorite === undefined ? Number(project.is_favorite) : patch.isFavorite ? 1 : 0;
        const deletedAt =
          patch.deleted === undefined
            ? String(project.deleted_at || '')
            : patch.deleted
              ? String(project.deleted_at || nowValue)
              : '';
        if (
          favorite === Number(project.is_favorite) &&
          deletedAt === String(project.deleted_at || '')
        ) {
          results.skipped.push(id);
          continue;
        }
        database.run(
          'UPDATE projects SET is_favorite = $favorite, deleted_at = $deleted_at, updated_at = $updated_at WHERE id = $id',
          { $id: id, $favorite: favorite, $deleted_at: deletedAt, $updated_at: nowValue },
        );
        if (patch.deleted === false) versionStore.restoreImage(id);
        results.success.push(id);
      }
      afterUpdate(results);
      database.run('COMMIT');
      persist();
      return results;
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };

  const clearInvalidGroupCovers = () => {
    database.run(
      `DELETE FROM prompt_group_covers
       WHERE NOT EXISTS (
         SELECT 1 FROM projects
         WHERE projects.id = prompt_group_covers.project_id
           AND projects.exact_group_fingerprint = prompt_group_covers.prompt_fingerprint
       )`,
    );
  };

  const fingerprintVersionKey = 'prompt_fingerprints_version';
  const fingerprintDirtyPrefix = 'prompt_fingerprints_dirty:';
  const fingerprintVersion = '1';
  // Persistent triggers also run when an older application writes this database.
  // Markers share the writer's transaction, including rollback and crash recovery.
  const trackingTriggers = [];
  for (const [table, idColumn] of [
    ['projects', 'id'],
    ['prompt_tags', 'project_id'],
    ['generation_metadata', 'project_id'],
  ]) {
    for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
      const name = `track_prompt_${table}_${event.toLowerCase()}`;
      const references = event === 'UPDATE' ? ['OLD', 'NEW'] : [event === 'DELETE' ? 'OLD' : 'NEW'];
      const update =
        table === 'projects' && event === 'UPDATE'
          ? 'UPDATE OF id, prompt_fingerprint, base_prompt_fingerprint, vibe_fingerprint, exact_group_fingerprint'
          : event;
      trackingTriggers.push({
        name,
        sql: `CREATE TRIGGER IF NOT EXISTS ${name} AFTER ${update} ON ${table} BEGIN
        ${references.map((reference) => [fingerprintDirtyPrefix, cardDirtyPrefix].map((prefix) => `INSERT OR REPLACE INTO app_meta(key, value) VALUES ('${prefix}' || ${reference}.${idColumn}, '1');`).join('\n')).join('\n')}
        END`,
      });
    }
  }
  const existingTriggers = new Set(
    query("SELECT name FROM sqlite_master WHERE type = 'trigger'").map((row) => row.name),
  );
  const trackingMissing = trackingTriggers.some(({ name }) => !existingTriggers.has(name));
  const cardTrackingMissing = !existingTriggers.has('track_library_projects_update');
  // These fields do not affect prompt fingerprints, but they do affect a card.
  database.run(`CREATE TRIGGER IF NOT EXISTS track_library_projects_update
    AFTER UPDATE OF name, image_path, thumbnail_path, created_at, is_favorite, deleted_at ON projects BEGIN
      INSERT OR REPLACE INTO app_meta(key, value) VALUES ('${cardDirtyPrefix}' || NEW.id, '1');
    END`);
  for (const { name, sql } of trackingTriggers) {
    const previous = query(
      "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = $name",
      { $name: name },
    )[0]?.sql;
    if (previous && !previous.includes(cardDirtyPrefix)) database.run(`DROP TRIGGER ${name}`);
    database.run(sql);
  }

  const backfillPromptFingerprints = (force = true) => {
    let changed = 0;
    const full =
      force ||
      trackingMissing ||
      query('SELECT value FROM app_meta WHERE key = $key', { $key: fingerprintVersionKey })[0]
        ?.value !== fingerprintVersion;
    for (const row of query(
      `SELECT id, prompt_fingerprint, base_prompt_fingerprint, vibe_fingerprint, exact_group_fingerprint FROM projects
       ${full ? '' : 'WHERE id IN (SELECT substr(key, ' + (fingerprintDirtyPrefix.length + 1) + ") FROM app_meta WHERE key GLOB '" + fingerprintDirtyPrefix + "*')"}`,
    )) {
      const project = hydrateProject(row);
      const raw = safeJson(project.metadata?.extra_json);
      const vibeFingerprint = fingerprintVibes(
        extractEmbeddedVibes(raw.parsed || raw, project.metadata?.model),
      );
      const fingerprints = galleryProjectGroupingFingerprints({
        ...project,
        vibe_fingerprint: vibeFingerprint,
      });
      if (
        fingerprints.promptFingerprint === row.prompt_fingerprint &&
        fingerprints.basePromptFingerprint === row.base_prompt_fingerprint &&
        vibeFingerprint === row.vibe_fingerprint &&
        fingerprints.exactGroupFingerprint === row.exact_group_fingerprint
      )
        continue;
      database.run(
        `UPDATE projects
         SET prompt_fingerprint = $prompt_fingerprint,
             base_prompt_fingerprint = $base_prompt_fingerprint,
             vibe_fingerprint = $vibe_fingerprint,
             exact_group_fingerprint = $exact_group_fingerprint
         WHERE id = $id`,
        {
          $id: row.id,
          $prompt_fingerprint: fingerprints.promptFingerprint,
          $base_prompt_fingerprint: fingerprints.basePromptFingerprint,
          $vibe_fingerprint: vibeFingerprint,
          $exact_group_fingerprint: fingerprints.exactGroupFingerprint,
        },
      );
      changed += 1;
    }
    for (const cover of query('SELECT prompt_fingerprint, project_id FROM prompt_group_covers')) {
      const project = query(
        'SELECT prompt_fingerprint, exact_group_fingerprint FROM projects WHERE id = $id',
        { $id: cover.project_id },
      )[0];
      if (!project || cover.prompt_fingerprint === project.exact_group_fingerprint) continue;
      if (
        cover.prompt_fingerprint === project.prompt_fingerprint &&
        project.exact_group_fingerprint
      ) {
        database.run(
          `INSERT INTO prompt_group_covers (prompt_fingerprint, project_id) VALUES ($fingerprint, $project_id)
           ON CONFLICT(prompt_fingerprint) DO NOTHING`,
          { $fingerprint: project.exact_group_fingerprint, $project_id: cover.project_id },
        );
      }
      database.run('DELETE FROM prompt_group_covers WHERE prompt_fingerprint = $fingerprint', {
        $fingerprint: cover.prompt_fingerprint,
      });
    }
    clearInvalidGroupCovers();
    database.run('INSERT OR REPLACE INTO app_meta(key, value) VALUES ($key, $value)', {
      $key: fingerprintVersionKey,
      $value: fingerprintVersion,
    });
    // Consume the old fingerprint markers only after invalidating their cached
    // derivations. This also handles writes made by the original 010 triggers.
    invalidateCards(full || cardTrackingMissing, true);
    database.run(`DELETE FROM app_meta WHERE key GLOB '${fingerprintDirtyPrefix}*'`);
    if (changed) persist();
    return changed;
  };

  const loadTrashSummary = () =>
    query(
      `SELECT id, name, image_path, thumbnail_path, is_favorite, deleted_at
     FROM projects WHERE deleted_at != '' ORDER BY deleted_at DESC`,
    );

  backfillPromptFingerprints(false);
  commit();
  const workOriginalsMigration = migrateWorkOriginals(
    connection,
    filePath,
    versionStore,
    loadProject,
  );
  return {
    workOriginalsMigration,
    versions: versionStore,
    vibeLibrary: createVibeLibrary(connection),
    materials: createMaterialStore(connection),
    loadLibrary,
    loadLibraryCards,
    listImportDates: (view = 'all') =>
      query(
        `SELECT id, created_at FROM projects WHERE deleted_at ${view === 'trash' ? '!=' : '='} ''`,
      ),
    loadProject,
    listCollections: atomic(listCollections),
    migrateLegacyFavorites: atomic(migrateLegacyFavorites),
    createCollection: atomic(createCollection),
    updateCollection: atomic(updateCollection),
    deleteCollection: atomic(deleteCollection),
    updateCollectionProjects: atomic(updateCollectionProjects),
    findProjectByContentHash,
    projectHashCandidates,
    projectDimensionCandidates,
    setProjectContentHashes: atomic(setProjectContentHashes),
    setProjectDimensions: atomic(setProjectDimensions),
    relocateAssetPaths: atomic(relocateAssetPaths),
    lookupTagDictionary,
    lookupDanbooruTagCache,
    upsertTagDictionary: atomic(upsertTagDictionary),
    upsertDanbooruTagCache: atomic(upsertDanbooruTagCache),
    updateTagDictionary: atomic(updateTagDictionary),
    updateTagDictionaries: atomic((entries) =>
      entries.map(({ tag, ...patch }) => updateTagDictionary(tag, patch)),
    ),
    listTagDictionary,
    tagImageCounts,
    replaceTagDictionaryAI: atomic(replaceTagDictionaryAI),
    deleteTagDictionary: atomic(deleteTagDictionary),
    updateTagDictionaryCategory: atomic(updateTagDictionaryCategory),
    deleteTagDictionaries: atomic(deleteTagDictionaries),
    enrichProjectTags,
    insertProject: atomic(insertProject),
    saveProjectPrompt: atomic(saveProjectPrompt),
    deleteProject: atomic(deleteProject),
    updateProjectName: atomic(updateProjectName),
    loadWorkbenchStructure: (filePath) => {
      const key = 'workbench_structure:' + path.resolve(String(filePath || ''));
      return safeJson(query('SELECT value FROM app_meta WHERE key = $key', { $key: key })[0]?.value)
        .prompt_structure;
    },
    rememberWorkbenchStructure: atomic((filePath, structure, projectId = '') => {
      // TODO(design): External images have no library row; retain their existing structure in app_meta, keyed by path.
      const normalized = normalizePromptStructure(structure);
      database.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES ($key, $value)', {
        $key: 'workbench_structure:' + path.resolve(String(filePath || '')),
        $value: JSON.stringify({ prompt_structure: normalized }),
      });
      if (projectId) {
        const project = loadProject(projectId);
        if (project)
          database.run(
            'UPDATE generation_metadata SET prompt_structure_json = $structure WHERE project_id = $id',
            {
              $id: projectId,
              $structure: JSON.stringify({
                ...project.prompt_structure,
                block_annotations: normalized.block_annotations || {},
              }),
            },
          );
      }
      persist();
    }),
    updateProjectNames: atomic((changes) => {
      if (
        !Array.isArray(changes) ||
        !changes.length ||
        new Set(changes.map((c) => c.id)).size !== changes.length
      )
        throw new Error('图片名称没有修改');
      const previous = changes.map(({ id }) => {
        const record = loadProject(id);
        if (!record) throw new Error('图片不存在');
        return { id, name: record.name, has_custom_name: record.has_custom_name };
      });
      for (const change of changes)
        updateProjectName(
          change.id,
          change.name,
          change.has_custom_name !== false,
          typeof change.has_custom_name === 'boolean',
        );
      return previous;
    }),
    updateProjects: atomic(updateProjects),
    removeWorkOriginal: atomic((workId) =>
      versionStore.removeOriginal(workId, (id, deleted) => {
        const result = updateProjects([id], { deleted });
        if (result.failed.length) throw new Error('原图状态更新失败');
      }),
    ),
    restoreWorkOriginal: atomic((undo) =>
      versionStore.restoreOriginal(undo, (id, deleted) => {
        const result = updateProjects([id], { deleted });
        if (result.failed.length) throw new Error('原图状态更新失败');
      }),
    ),
    trashProjects: atomic((ids) => {
      let versions = [];
      const results = updateProjects(ids, { deleted: true }, (result) => {
        versions = versionStore.pruneImages(result.success);
      });
      return { results, versions };
    }),
    loadTrashSummary,
    backfillPromptFingerprints: atomic(backfillPromptFingerprints),
    // One synchronous chunk, with an independent savepoint for each image.
    insertProjects: atomic((projects) =>
      projects.map((project) => {
        try {
          return { project: atomic(insertProject)(project) };
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      }),
    ),
    close,
    persist,
    filePath,
    backupPath,
    engineBackupPath,
    refreshGeneratedCards: () => invalidateCards(true),
  };
}
