import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { CATEGORY_OPTIONS, inferCategory, normalizeCategory } from '../src/lib/prompt.js';
import { galleryProjectGroupingFingerprints } from '../src/lib/galleryGrouping.js';
import { danbooruLookupName } from './danbooru.js';
import { extractEmbeddedVibes, fingerprintVibes } from './vibes.js';

const require = createRequire(import.meta.url);
const TAG_CATEGORIES = new Set(CATEGORY_OPTIONS);
export const DEFAULT_GALLERY_COLLECTION_ID = 'default-gallery-collection';
const FAVORITES_COLLECTION_MIGRATION_KEY = 'gallery_favorites_collection_v1';

const CORE_SCHEMA = `
PRAGMA foreign_keys = ON;
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

function dictionaryKey(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function projectTags(project) {
  const structure = project.prompt_structure || {};
  return [
    ...(project.tags || []),
    ...(structure.base_undesired_tags || []),
    ...(structure.characters || []).flatMap((character) => [...(character.prompt_tags || []), ...(character.undesired_tags || [])]),
  ];
}

function tableColumns(database, table) {
  return database.exec(`PRAGMA table_info(${table})`)[0]?.values.map((row) => row[1]) || [];
}

function ensureColumn(database, table, columns, name, definition) {
  if (!columns.includes(name)) database.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

export async function openDatabase(dataDirectory) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const filePath = path.join(dataDirectory, 'studio.sqlite');
  const backupPath = path.join(dataDirectory, 'studio.pre-phase2.sqlite');
  if (fs.existsSync(filePath) && !fs.existsSync(backupPath)) fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);

  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const database = fs.existsSync(filePath) ? new SQL.Database(fs.readFileSync(filePath)) : new SQL.Database();
  database.run(CORE_SCHEMA);

  const projectColumns = tableColumns(database, 'projects');
  ensureColumn(database, 'projects', projectColumns, 'content_hash', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'projects', projectColumns, 'prompt_fingerprint', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'projects', projectColumns, 'base_prompt_fingerprint', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'projects', projectColumns, 'vibe_fingerprint', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'projects', projectColumns, 'exact_group_fingerprint', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'projects', projectColumns, 'is_favorite', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'projects', projectColumns, 'deleted_at', "TEXT NOT NULL DEFAULT ''");
  database.run("CREATE INDEX IF NOT EXISTS idx_projects_content_hash ON projects(content_hash) WHERE content_hash != ''");
  database.run("CREATE INDEX IF NOT EXISTS idx_projects_prompt_fingerprint ON projects(prompt_fingerprint) WHERE prompt_fingerprint != ''");
  database.run("CREATE INDEX IF NOT EXISTS idx_projects_base_prompt_fingerprint ON projects(base_prompt_fingerprint) WHERE base_prompt_fingerprint != ''");
  database.run("CREATE INDEX IF NOT EXISTS idx_projects_exact_group_fingerprint ON projects(exact_group_fingerprint) WHERE exact_group_fingerprint != ''");
  const tagColumns = tableColumns(database, 'prompt_tags');
  ensureColumn(database, 'prompt_tags', tagColumns, 'raw_segment', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'prompt_tags', tagColumns, 'syntax_issue', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'prompt_tags', tagColumns, 'brace_depth', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'prompt_tags', tagColumns, 'brace_group', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'prompt_tags', tagColumns, 'brace_trailing_comma', 'INTEGER NOT NULL DEFAULT 0');
  const metadataColumns = tableColumns(database, 'generation_metadata');
  ensureColumn(database, 'generation_metadata', metadataColumns, 'prompt_structure_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(database, 'generation_metadata', metadataColumns, 'width', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'generation_metadata', metadataColumns, 'height', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'generation_metadata', metadataColumns, 'generation_mode', "TEXT NOT NULL DEFAULT 'unknown'");
  const dictionaryColumns = tableColumns(database, 'tag_dictionary');
  ensureColumn(database, 'tag_dictionary', dictionaryColumns, 'display_tag', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'tag_dictionary', dictionaryColumns, 'has_translation', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'tag_dictionary', dictionaryColumns, 'has_classification', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'tag_dictionary', dictionaryColumns, 'translation_source', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'tag_dictionary', dictionaryColumns, 'category_source', "TEXT NOT NULL DEFAULT ''");
  database.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('runtime_schema', 'phase2-core')");

  const persist = () => {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, Buffer.from(database.export()));
    fs.renameSync(temporaryPath, filePath);
  };
  const query = (sql, params = {}) => {
    const statement = database.prepare(sql);
    statement.bind(params);
    return rows(statement);
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
      for (const row of query(`SELECT * FROM tag_dictionary WHERE tag IN (${placeholders.join(', ')})`, params)) {
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

  const knowledgePriority = (source) => ({ manual: 5, danbooru: 4, dso: 3, rule: 2, ai: 1, cache: 0, builtin: 0, heuristic: 0 }[source] || 0);
  const upsertTagDictionary = (entries = [], updatedAt = new Date().toISOString()) => {
    for (const entry of entries) {
      const key = dictionaryKey(entry.tag);
      if (!key) continue;
      const current = query('SELECT * FROM tag_dictionary WHERE tag = $tag', { $tag: key })[0] || {};
      const incomingTranslation = String(entry.translation || '').trim();
      const incomingCategory = normalizeCategory(entry.category, entry.tag);
      const incomingTranslationSource = String(entry.translation_source || (entry.has_translation ? 'ai' : ''));
      const incomingCategorySource = String(entry.category_source || (entry.has_classification ? 'ai' : ''));
      const hasIncomingTranslation = entry.has_translation ?? Boolean(incomingTranslation);
      const hasIncomingClassification = entry.has_classification ?? Boolean(entry.category);
      const replaceTranslation = hasIncomingTranslation && (!current.has_translation || knowledgePriority(incomingTranslationSource) >= knowledgePriority(current.translation_source));
      const replaceClassification = hasIncomingClassification && (!current.has_classification || knowledgePriority(incomingCategorySource) >= knowledgePriority(current.category_source));
      const translation = replaceTranslation ? incomingTranslation : String(current.translation || '');
      const category = replaceClassification ? incomingCategory : normalizeCategory(current.category, entry.tag);
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
          $translation_source: replaceTranslation ? incomingTranslationSource : String(current.translation_source || ''),
          $category_source: replaceClassification ? incomingCategorySource : String(current.category_source || ''),
          $updated_at: updatedAt,
        },
      );
    }
  };

  const updateTagDictionary = (tag, patch = {}) => {
    const key = dictionaryKey(tag);
    if (!key) throw new Error('Tag 不能为空');
    const current = query('SELECT * FROM tag_dictionary WHERE tag = $tag', { $tag: key })[0] || {};
    const translation = patch.translation === undefined ? String(current.translation || '') : String(patch.translation || '').trim();
    const category = patch.category === undefined ? normalizeCategory(current.category, tag) : String(patch.category || 'Unsorted');
    if (patch.category !== undefined && !TAG_CATEGORIES.has(category)) throw new Error('Tag 分类无效');
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
        $has_translation: patch.translation === undefined ? Number(current.has_translation || 0) : translation ? 1 : 0,
        $has_classification: patch.category === undefined ? Number(current.has_classification || 0) : 1,
        $translation_source: patch.translation === undefined ? String(current.translation_source || '') : translation ? 'manual' : '',
        $category_source: patch.category === undefined ? String(current.category_source || '') : 'manual',
        $updated_at: new Date().toISOString(),
      },
    );
    persist();
    return query('SELECT * FROM tag_dictionary WHERE tag = $tag', { $tag: key })[0] || null;
  };

  const listTagDictionary = (filters = {}) => {
    const search = String(filters.query || '').trim().toLowerCase().slice(0, 240);
    const category = TAG_CATEGORIES.has(filters.category) ? filters.category : '';
    const allowedSources = new Set(['manual', 'danbooru', 'dso', 'rule', 'ai', 'cache', 'builtin', 'heuristic']);
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
       LIMIT $limit OFFSET $offset`,
      { ...params, $limit: limit, $offset: offset },
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
        if (danbooruTag) database.run('DELETE FROM danbooru_tag_cache WHERE tag = $tag', { $tag: danbooruTag });
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

  const enrichProjectTags = (project, cachedEntries = null) => {
    const cached = cachedEntries || lookupTagDictionary(projectTags(project).map((tag) => tag.tag));
    const enrich = (tag) => {
      const entry = cached.get(dictionaryKey(tag.tag));
      const normalizedCategory = normalizeCategory(tag.category, tag.tag);
      const ruleCategory = inferCategory(tag.tag);
      const useRule = tag.category_source !== 'manual' && ruleCategory !== 'Unsorted';
      const category = useRule ? ruleCategory : normalizedCategory;
      const migrated = category === tag.category
        ? tag
        : { ...tag, category, category_source: useRule ? 'rule' : tag.category_source || 'migration' };
      if (!entry) return migrated;
      const cachedCategoryWins = entry.has_classification && (
        entry.category_source === 'manual'
        || entry.category_source === 'danbooru'
        || entry.category_source === 'dso'
        || !useRule
      );
      return {
        ...migrated,
        ...(entry.has_translation ? { translation: entry.translation, translation_source: entry.translation_source || 'cache' } : {}),
        ...(cachedCategoryWins ? { category: normalizeCategory(entry.category, tag.tag), category_source: entry.category_source || 'cache' } : {}),
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

  const hydrateProject = (project) => {
    if (!project) return null;
    const metadata = query('SELECT * FROM generation_metadata WHERE project_id = $id', { $id: project.id })[0] || {};
    const hydrated = enrichProjectTags({
      ...project,
      tags: query('SELECT * FROM prompt_tags WHERE project_id = $id ORDER BY position', { $id: project.id }),
      metadata,
      prompt_structure: safeJson(metadata.prompt_structure_json),
    });
    const cover = project.exact_group_fingerprint
      ? query('SELECT project_id FROM prompt_group_covers WHERE prompt_fingerprint = $fingerprint', { $fingerprint: project.exact_group_fingerprint })[0]
      : null;
    return { ...hydrated, group_cover_id: cover?.project_id || '' };
  };

  const loadProject = (projectId) => hydrateProject(query('SELECT * FROM projects WHERE id = $id', { $id: String(projectId || '') })[0]);
  const loadLibrary = (view = 'all') => {
    const where = view === 'trash'
      ? "projects.deleted_at != ''"
      : view === 'favorites' ? "projects.deleted_at = '' AND projects.is_favorite = 1" : "projects.deleted_at = ''";
    const projects = query(`SELECT projects.* FROM projects WHERE ${where} ORDER BY projects.created_at DESC`);
    if (!projects.length) return [];

    const metadataByProject = new Map(query(
      `SELECT generation_metadata.* FROM generation_metadata
       JOIN projects ON projects.id = generation_metadata.project_id
       WHERE ${where}`,
    ).map((metadata) => [metadata.project_id, metadata]));
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
    const covers = new Map(query(
      `SELECT prompt_group_covers.prompt_fingerprint, prompt_group_covers.project_id
       FROM prompt_group_covers
       JOIN projects ON projects.exact_group_fingerprint = prompt_group_covers.prompt_fingerprint
       WHERE ${where}`,
    ).map((cover) => [cover.prompt_fingerprint, cover.project_id]));
    const hydrated = projects.map((project) => {
      const metadata = metadataByProject.get(project.id) || {};
      return {
        ...project,
        tags: tagsByProject.get(project.id) || [],
        metadata,
        prompt_structure: safeJson(metadata.prompt_structure_json),
        group_cover_id: covers.get(project.exact_group_fingerprint) || '',
      };
    });
    const cached = lookupTagDictionary(hydrated.flatMap((project) => projectTags(project).map((tag) => tag.tag)));
    return hydrated.map((project) => enrichProjectTags(project, cached));
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
    const migrated = query('SELECT value FROM app_meta WHERE key = $key', { $key: FAVORITES_COLLECTION_MIGRATION_KEY })[0];
    if (migrated?.value === 'complete') return { migrated: false, projectIds: [] };
    const favoriteIds = query('SELECT id FROM projects WHERE is_favorite = 1 ORDER BY created_at ASC').map((project) => project.id);
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
      for (const projectId of favoriteIds) database.run(
        `INSERT OR IGNORE INTO gallery_collection_projects (collection_id, project_id, created_at)
         VALUES ($collection_id, $project_id, $created_at)`,
        { $collection_id: DEFAULT_GALLERY_COLLECTION_ID, $project_id: projectId, $created_at: nowValue },
      );
      database.run(
        'INSERT OR REPLACE INTO app_meta (key, value) VALUES ($key, $value)',
        { $key: FAVORITES_COLLECTION_MIGRATION_KEY, $value: 'complete' },
      );
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
      member_ids: collection.kind === 'manual'
        ? query(
          'SELECT project_id FROM gallery_collection_projects WHERE collection_id = $id ORDER BY created_at ASC',
          { $id: collection.id },
        ).map((row) => row.project_id)
        : [],
    }));
  };
  const loadCollection = (id) => listCollections().find((collection) => collection.id === String(id || '')) || null;
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
    const collection = query('SELECT * FROM gallery_collections WHERE id = $id', { $id: String(id || '') })[0];
    if (!collection) throw new Error('收藏集不存在');
    const name = patch.name === undefined ? collection.name : cleanCollectionName(patch.name);
    const filterJson = collection.kind === 'smart' && patch.filters !== undefined
      ? collectionFilters(patch.filters)
      : collection.filter_json;
    database.run(
      `UPDATE gallery_collections SET name = $name, filter_json = $filter_json, updated_at = $updated_at WHERE id = $id`,
      { $id: collection.id, $name: name, $filter_json: filterJson, $updated_at: new Date().toISOString() },
    );
    persist();
    return loadCollection(collection.id);
  };
  const deleteCollection = (id) => {
    const collectionId = String(id || '');
    const exists = Boolean(query('SELECT id FROM gallery_collections WHERE id = $id', { $id: collectionId })[0]);
    if (!exists) return false;
    database.run('DELETE FROM gallery_collection_projects WHERE collection_id = $id', { $id: collectionId });
    database.run('DELETE FROM gallery_collections WHERE id = $id', { $id: collectionId });
    persist();
    return true;
  };
  const updateCollectionProjects = (collectionId, projectIds = [], action = 'add') => {
    const id = String(collectionId || '');
    const collection = query('SELECT id, kind FROM gallery_collections WHERE id = $id', { $id: id })[0];
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
            $brace_depth: Math.max(0, Math.trunc(Number(tag.brace_depth) || 0)),
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

  const findProjectByContentHash = (contentHash) => query(
    "SELECT id, name, image_path, thumbnail_path, deleted_at FROM projects WHERE content_hash = $content_hash LIMIT 1",
    { $content_hash: String(contentHash || '') },
  )[0] || null;
  const projectHashCandidates = () => query("SELECT id, image_path FROM projects WHERE content_hash = '' AND deleted_at = ''");
  const projectDimensionCandidates = () => query(
    `SELECT projects.id, projects.image_path FROM projects JOIN generation_metadata ON generation_metadata.project_id = projects.id
     WHERE projects.deleted_at = '' AND (generation_metadata.width <= 0 OR generation_metadata.height <= 0)`,
  );
  const setProjectContentHashes = (items = []) => {
    database.run('BEGIN');
    try {
      for (const item of items) database.run("UPDATE projects SET content_hash = $hash WHERE id = $id AND content_hash = ''", { $id: String(item.id || ''), $hash: String(item.content_hash || '') });
      database.run('COMMIT');
      persist();
    } catch (error) { database.run('ROLLBACK'); throw error; }
  };
  const setProjectDimensions = (items = []) => {
    database.run('BEGIN');
    try {
      for (const item of items) database.run(
        'UPDATE generation_metadata SET width = $width, height = $height WHERE project_id = $id AND (width <= 0 OR height <= 0)',
        { $id: String(item.id || ''), $width: Math.max(0, Math.round(Number(item.width || 0))), $height: Math.max(0, Math.round(Number(item.height || 0))) },
      );
      database.run('COMMIT');
      persist();
    } catch (error) { database.run('ROLLBACK'); throw error; }
  };
  const relocateAssetPaths = (sourceDirectory, targetDirectory) => {
    const source = path.resolve(String(sourceDirectory || ''));
    const target = path.resolve(String(targetDirectory || ''));
    const relocate = (filePath) => {
      const absolutePath = path.resolve(String(filePath || ''));
      const relative = path.relative(source, absolutePath);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return String(filePath || '');
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
  const deleteProject = (id) => {
    const projectId = String(id || '');
    database.run('DELETE FROM gallery_collection_projects WHERE project_id = $id', { $id: projectId });
    database.run('DELETE FROM prompt_group_covers WHERE project_id = $id', { $id: projectId });
    database.run('DELETE FROM projects WHERE id = $id', { $id: projectId });
    persist();
  };

  const updateProjectName = (id, name) => {
    const cleaned = String(name || '').trim();
    if (!cleaned) throw new Error('图片名称不能为空');
    if (cleaned.length > 160) throw new Error('图片名称不能超过 160 个字符');
    const project = query('SELECT id, deleted_at FROM projects WHERE id = $id', { $id: String(id || '') })[0];
    if (!project) throw new Error('图片不存在');
    if (project.deleted_at) throw new Error('请先从回收站恢复图片');
    database.run(
      'UPDATE projects SET name = $name, updated_at = $updated_at WHERE id = $id',
      { $id: project.id, $name: cleaned, $updated_at: new Date().toISOString() },
    );
    persist();
    return loadProject(project.id);
  };

  const updateProjects = (ids = [], patch = {}) => {
    const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
    const results = { success: [], skipped: [], failed: [] };
    const nowValue = new Date().toISOString();
    database.run('BEGIN');
    try {
      for (const id of uniqueIds) {
        const project = query('SELECT id, is_favorite, deleted_at FROM projects WHERE id = $id', { $id: id })[0];
        if (!project) {
          results.failed.push({ id, error: '图片不存在' });
          continue;
        }
        const favorite = patch.isFavorite === undefined ? Number(project.is_favorite) : patch.isFavorite ? 1 : 0;
        const deletedAt = patch.deleted === undefined ? String(project.deleted_at || '') : patch.deleted ? nowValue : '';
        if (favorite === Number(project.is_favorite) && deletedAt === String(project.deleted_at || '')) {
          results.skipped.push(id);
          continue;
        }
        database.run(
          'UPDATE projects SET is_favorite = $favorite, deleted_at = $deleted_at, updated_at = $updated_at WHERE id = $id',
          { $id: id, $favorite: favorite, $deleted_at: deletedAt, $updated_at: nowValue },
        );
        results.success.push(id);
      }
      database.run('COMMIT');
      persist();
      return results;
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };

  const setGroupCover = (fingerprint, projectId) => {
    const normalizedFingerprint = String(fingerprint || '');
    const id = String(projectId || '');
    const project = query(
      'SELECT id FROM projects WHERE id = $id AND exact_group_fingerprint = $fingerprint',
      { $id: id, $fingerprint: normalizedFingerprint },
    )[0];
    if (!normalizedFingerprint || !project) throw new Error('图片不属于当前图片组');
    database.run(
      `INSERT INTO prompt_group_covers (prompt_fingerprint, project_id) VALUES ($fingerprint, $project_id)
       ON CONFLICT(prompt_fingerprint) DO UPDATE SET project_id = excluded.project_id`,
      { $fingerprint: normalizedFingerprint, $project_id: id },
    );
    persist();
    return { promptFingerprint: normalizedFingerprint, projectId: id };
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

  const backfillPromptFingerprints = () => {
    let changed = 0;
    for (const row of query('SELECT id, prompt_fingerprint, base_prompt_fingerprint, vibe_fingerprint, exact_group_fingerprint FROM projects')) {
      const project = hydrateProject(row);
      const raw = safeJson(project.metadata?.extra_json);
      const vibeFingerprint = fingerprintVibes(extractEmbeddedVibes(raw.parsed || raw, project.metadata?.model));
      const fingerprints = galleryProjectGroupingFingerprints({ ...project, vibe_fingerprint: vibeFingerprint });
      if (fingerprints.promptFingerprint === row.prompt_fingerprint
        && fingerprints.basePromptFingerprint === row.base_prompt_fingerprint
        && vibeFingerprint === row.vibe_fingerprint
        && fingerprints.exactGroupFingerprint === row.exact_group_fingerprint) continue;
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
      if (cover.prompt_fingerprint === project.prompt_fingerprint && project.exact_group_fingerprint) {
        database.run(
          `INSERT INTO prompt_group_covers (prompt_fingerprint, project_id) VALUES ($fingerprint, $project_id)
           ON CONFLICT(prompt_fingerprint) DO NOTHING`,
          { $fingerprint: project.exact_group_fingerprint, $project_id: cover.project_id },
        );
      }
      database.run('DELETE FROM prompt_group_covers WHERE prompt_fingerprint = $fingerprint', { $fingerprint: cover.prompt_fingerprint });
    }
    clearInvalidGroupCovers();
    if (changed) persist();
    return changed;
  };

  const loadTrashSummary = () => query(
    `SELECT id, name, image_path, thumbnail_path, is_favorite, deleted_at
     FROM projects WHERE deleted_at != '' ORDER BY deleted_at DESC`,
  );

  backfillPromptFingerprints();
  persist();
  return {
    loadLibrary,
    loadProject,
    listCollections,
    migrateLegacyFavorites,
    createCollection,
    updateCollection,
    deleteCollection,
    updateCollectionProjects,
    findProjectByContentHash,
    projectHashCandidates,
    projectDimensionCandidates,
    setProjectContentHashes,
    setProjectDimensions,
    relocateAssetPaths,
    lookupTagDictionary,
    lookupDanbooruTagCache,
    upsertTagDictionary,
    upsertDanbooruTagCache,
    updateTagDictionary,
    listTagDictionary,
    deleteTagDictionary,
    updateTagDictionaryCategory,
    deleteTagDictionaries,
    enrichProjectTags,
    insertProject,
    deleteProject,
    updateProjectName,
    updateProjects,
    setGroupCover,
    loadTrashSummary,
    backfillPromptFingerprints,
    persist,
    filePath,
    backupPath,
  };
}
