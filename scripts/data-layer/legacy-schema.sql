-- Source: git show 18386b7^:electron/database.js (retired tables only)
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'amber',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_members (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, project_id)
);
CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'copper',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS series_members (
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  PRIMARY KEY (series_id, project_id)
);
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  baseline_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  analysis_status TEXT NOT NULL DEFAULT 'incomplete',
  fixed_fields_json TEXT NOT NULL DEFAULT '[]',
  variable_fields_json TEXT NOT NULL DEFAULT '[]',
  incomplete_fields_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS experiment_members (
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  PRIMARY KEY (experiment_id, project_id)
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
  information_extracted_source TEXT NOT NULL DEFAULT 'verified',
  information_extracted_dirty INTEGER NOT NULL DEFAULT 0,
  information_extracted_origin REAL NOT NULL DEFAULT 0.7,
  encoded_values_json TEXT NOT NULL DEFAULT '[]',
  source_image_hash TEXT NOT NULL DEFAULT '',
  has_source_image INTEGER NOT NULL DEFAULT 0,
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
  information_extracted_source TEXT NOT NULL DEFAULT 'verified',
  encoded_values_json TEXT NOT NULL DEFAULT '[]',
  encoding_variants_json TEXT NOT NULL DEFAULT '[]',
  encoding_count INTEGER NOT NULL DEFAULT 0,
  has_source_image INTEGER NOT NULL DEFAULT 0,
  source_image_hash TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  archived_at TEXT NOT NULL DEFAULT '',
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
CREATE TABLE IF NOT EXISTS branch_recipes (
  id TEXT PRIMARY KEY,
  source_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_branch_id TEXT REFERENCES branch_recipes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  snapshot_json TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS branch_results (
  branch_id TEXT NOT NULL REFERENCES branch_recipes(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  match_status TEXT NOT NULL,
  differences_json TEXT NOT NULL DEFAULT '[]',
  details_json TEXT NOT NULL DEFAULT '[]',
  actual_branch_id TEXT NOT NULL DEFAULT '',
  linked_at TEXT NOT NULL,
  PRIMARY KEY (branch_id, project_id)
);
