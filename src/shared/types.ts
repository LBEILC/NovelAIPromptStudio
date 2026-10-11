// Domain shapes follow the producers in electron/ and the normalization in src/lib/.
export type TagCategory =
  | 'ArtistEra'
  | 'Subject'
  | 'Identity'
  | 'Body'
  | 'Clothing'
  | 'Action'
  | 'Environment'
  | 'Composition'
  | 'StyleQuality'
  | 'Unsorted';
export type AnnotationSource =
  | ''
  | 'manual'
  | 'danbooru'
  | 'dso'
  | 'rule'
  | 'ai'
  | 'cache'
  | 'builtin'
  | 'heuristic'
  | 'migration';
export interface TagAnnotation {
  translation: string;
  category: TagCategory;
  translation_source?: AnnotationSource;
  category_source?: AnnotationSource;
}
export interface Tag extends TagAnnotation {
  id: string;
  tag: string;
  weight: number;
  note: string;
  raw_segment?: string;
  syntax_issue?: string;
  segment_type?: 'tag' | 'text_block';
  brace_depth: number;
  brace_group: string;
  brace_trailing_comma: boolean | 0 | 1;
  project_id?: string;
  position?: number;
}
export interface NovelAIAutoSettings {
  model: string;
  quality_toggle: boolean | null;
  quality_source: string;
  // Raw metadata values are not validated by the current reader.
  uc_preset: number | string | null;
  uc_preset_source: string;
  params_version: number | string | null;
}
export interface PromptCharacterRaw {
  prompt_raw: string;
  undesired_raw: string;
  center: { x: number; y: number };
}
export interface PromptCharacter extends PromptCharacterRaw {
  id: string;
  label: string;
  prompt_tags: Tag[];
  undesired_tags: Tag[];
}
export interface PromptStructureRaw {
  base_prompt_raw: string;
  base_undesired_raw: string;
  use_coords: boolean;
  use_order: boolean;
  novelai_auto: NovelAIAutoSettings;
  characters: PromptCharacterRaw[];
}
export interface PromptStructure extends PromptStructureRaw {
  base_undesired_tags: Tag[];
  characters: PromptCharacter[];
}
// Old records can contain {} in prompt_structure_json; enrichment only adds these arrays.
export type StoredPromptStructure = Partial<
  Omit<PromptStructure, 'base_undesired_tags' | 'characters'>
> & {
  base_undesired_tags: Tag[];
  characters: PromptCharacter[];
};
export interface PromptAutomation {
  cleanedRaw: string;
  kind: 'quality' | 'undesired';
  label: string;
  modelLabel: string;
  sourceLabel: string;
  status: 'unknown' | 'disabled' | 'confirmed' | 'inferred' | 'suspected' | 'mismatch';
  matchIndex?: number;
  tagCount: number;
  tagIds: string[];
}
export type PromptScope = {
  polarity: 'prompt' | 'undesired';
  label: string;
  raw_prompt: string;
  tags: Tag[];
  automation: PromptAutomation | null;
} & (
  | { key: 'base:prompt' | 'base:undesired'; kind: 'base' }
  | {
      key: `character:${string}:prompt` | `character:${string}:undesired`;
      kind: 'character';
      characterId: string;
      characterIndex: number;
      character: PromptCharacter;
    }
);
export type GenerationMode = 'text_to_image' | 'image_to_image' | 'inpainting' | 'unknown';
export interface GenerationParameters {
  prompt_raw: string;
  negative_prompt: string;
  model: string;
  seed: string;
  steps: number | string | null;
  sampler: string;
  guidance: number | string | null;
  width: number;
  height: number;
  generation_mode: GenerationMode;
  prompt_structure_raw?: PromptStructureRaw;
  extra_json?: string;
  vibe_fingerprint?: string;
}
export interface StoredGenerationParameters extends GenerationParameters {
  project_id: string;
  prompt_structure_json: string;
  steps: number | null;
  guidance: number | null;
  extra_json: string;
}
export interface ImageProject {
  id: string;
  name: string;
  image_path: string;
  thumbnail_path: string;
  created_at: string;
  updated_at: string;
  metadata: GenerationParameters;
  tags: Tag[];
  prompt_structure: PromptStructure;
}
// Import returns the pre-insert object, not the hydrated database row.
export interface ImportedImage extends ImageProject {
  content_hash: string;
}
export interface WorkbenchImage extends ImageProject {
  vibes: Vibe[];
}
export interface ImageRecord extends Omit<ImageProject, 'metadata' | 'prompt_structure'> {
  content_hash: string;
  prompt_fingerprint: string;
  base_prompt_fingerprint: string;
  vibe_fingerprint: string;
  exact_group_fingerprint: string;
  is_favorite: 0 | 1;
  deleted_at: string;
  group_cover_id: string;
  // Missing metadata rows fall back to {} in database.js.
  metadata: Partial<StoredGenerationParameters>;
  prompt_structure: StoredPromptStructure;
}
export interface LibraryCard
  extends Pick<
    ImageRecord,
    | 'id'
    | 'name'
    | 'image_path'
    | 'thumbnail_path'
    | 'created_at'
    | 'is_favorite'
    | 'deleted_at'
    | 'prompt_fingerprint'
    | 'vibe_fingerprint'
    | 'group_cover_id'
  > {
  // null reuses JSON.stringify(JSON.parse(prompt_fingerprint).base).
  // The main process only emits it when that equals the stored base fingerprint.
  base_prompt_fingerprint: string | null;
  metadata: Pick<GenerationParameters, 'model' | 'width' | 'height'>;
  filter_tags: Pick<Tag, 'tag' | 'translation' | 'category'>[];
  search_prompts: string[];
  base_prompt_similarity: { prompt: [string, number][]; undesired: [string, number][] };
}
export interface Vibe {
  id: string;
  name: string;
  encoding: string;
  model: string;
  strength: number;
  information_extracted: number | null;
}
export interface WorkbenchSource {
  type: 'file' | 'library' | 'clipboard';
  path?: string;
  projectId?: string;
  temporaryId?: string;
  fingerprint?: string;
  id?: string;
}
export interface GalleryFilters {
  query: string;
  includeTags: string[];
  excludeTags: string[];
  tagMatch: 'all' | 'any';
  models: string[];
  vibes: string[];
  datePreset: 'all' | 'today' | '7d' | '30d' | '90d' | 'year' | 'custom';
  dateFrom: string;
  dateTo: string;
}
export interface Collection {
  id: string;
  name: string;
  kind: 'manual' | 'smart';
  filter_json: string;
  filters: Partial<GalleryFilters>;
  member_ids: string[];
  active_member_count: number;
  created_at: string;
  updated_at: string;
}
export interface TagDictionaryEntry extends TagAnnotation {
  tag: string;
  display_tag: string;
  has_translation: 0 | 1;
  has_classification: 0 | 1;
  translation_source: AnnotationSource;
  category_source: AnnotationSource;
  updated_at: string;
}
export interface AISettings {
  baseUrl: string;
  model: string;
  translationPrompt: string;
  classificationPrompt: string;
  defaultPrompts: { translation: string; classification: string };
  hasApiKey: boolean;
  encryptionAvailable: boolean;
}
export interface AISettingsInput {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  translationPrompt?: string;
  classificationPrompt?: string;
  clearApiKey?: boolean;
}
export interface AppearanceSettings {
  themeMode: 'auto' | 'dark' | 'light';
  primaryColor:
    | 'blue'
    | 'cyan'
    | 'geekblue'
    | 'gold'
    | 'green'
    | 'lime'
    | 'magenta'
    | 'orange'
    | 'purple'
    | 'red'
    | 'volcano'
    | 'yellow';
  sansFont: string;
  monoFont: string;
  proseFont: string;
  motion: 'full' | 'reduced' | 'off';
}
export interface ProductivitySettings {
  recentImageDirectory: string;
  autoCheckUpdates: boolean;
}
export interface LibrarySettings {
  assetsDirectory: string;
  defaultAssetsDirectory: string;
  isDefault: boolean;
}
export interface Preferences {
  aiBaseUrl?: string;
  aiModel?: string;
  aiApiKeyEncrypted?: string;
  aiTranslationPrompt?: string;
  aiClassificationPrompt?: string;
  appearance?: Partial<AppearanceSettings>;
  library?: { assetsDirectory: string };
  productivity?: Partial<ProductivitySettings>;
}
export interface UpdateCapabilities {
  platform: NodeJS.Platform;
  updateMode: 'automatic' | 'manual';
  canDownloadUpdate: boolean;
  canInstallUpdate: boolean;
  manualUpdateReason: '' | 'development' | 'unsigned-macos' | 'unsupported-platform';
}
export interface UpdateState extends UpdateCapabilities {
  phase: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error';
  progress: number;
  currentVersion: string;
  latestVersion: string;
  error: string;
  releaseUrl: string;
  packaged: boolean;
  hasUpdate?: boolean;
  publishedAt?: string;
  notes?: string;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
}
export interface ImportSummary {
  total: number;
  processed: number;
  imported: number;
  duplicates: number;
  failed: number;
  skipped: number;
  remaining: number;
  cancelled: boolean;
}
export type ImportProgress = { batchId: string } & (
  | {
      phase: 'preparing';
      current: string;
      prepared?: number;
      sourceCount?: number;
      processed?: number;
      total?: number;
    }
  | ({ phase: 'importing'; current?: string } & Omit<ImportSummary, 'remaining' | 'cancelled'>)
  | ({ phase: 'complete' } & ImportSummary)
);
export interface LibraryStorageProgress {
  phase: 'copying' | 'switching' | 'complete';
  completed: number;
  total: number;
  bytesCopied: number;
  totalBytes: number;
}
export interface PreparedImportEntry {
  archiveId: string;
  compressedSize: number;
  fileName: string;
  id: string;
  previewHeight: number;
  previewPath: string;
  previewWidth: number;
  uncompressedSize: number;
}
export type PreparedImportPreview = {
  sessionId: string;
  completed: number;
  total: number;
} & (
  | {
      phase: 'preview';
      entryId: string;
      previewPath: string;
      previewHeight: number;
      previewWidth: number;
      error: string;
    }
  | { phase: 'complete'; error?: string }
);
export interface BatchResults {
  success: string[];
  skipped: string[];
  failed: { id: string; error: string; remainingFiles?: string[] }[];
}
export interface BatchSummary {
  success: number;
  skipped: number;
  failed: number;
}
