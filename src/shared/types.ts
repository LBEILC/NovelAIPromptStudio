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
  block_annotations?: Record<
    string,
    {
      raw: string;
      textLayout?: boolean;
      type?: 'tags' | 'paragraph';
      translation?: string;
      displayLabel?: string;
      start: number;
    }[]
  >;
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
  template?: string;
  virtual?: boolean;
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
/** 一张图属于哪几个作品（1.5.6，doc/design.md 2.0）：作品的原图（origin），或某一版的图（version） */
export interface WorkRef {
  workId: string;
  role: 'origin' | 'version';
  versionId?: string;
  number?: number;
  workName: string;
}
/**
 * 回收站里"只从某个作品去掉"的一条记录（1.5.6，doc/design.md 2.0）：图本身还在别的作品或图片库里，
 * 放回就是重新放进这个作品。
 */
export interface DetachedRecord {
  /** work.detach-images 给的撤销令牌，放回和不再恢复都用它 */
  undo: string;
  workId: string;
  workName: string;
  role: 'origin' | 'version';
  number?: number;
  detachedAt: string;
  image: LibraryCard;
}
export interface ImageProject {
  blank?: true;
  work_refs?: WorkRef[];
  paramsSource?: 'last' | 'defaults';
  generated_work_id?: string;
  version_number?: number;
  generation_source?: 'user' | 'agent';
  original_filename?: string;
  has_custom_name?: boolean;
  id: string;
  name: string;
  image_path: string;
  thumbnail_path: string;
  created_at: string;
  updated_at: string;
  metadata: GenerationParameters;
  tags: Tag[];
  prompt_structure: PromptStructure;
  /** 第二层参数（1.4）：工作台的草稿和每一版都带；从原图元数据读出，改了以后生成用它 */
  params?: import('./params').GenerationSettings;
  /** Vibe 和精确参考（1.4） */
  references?: import('./params').References;
  /** 原图里有、界面不能改的参数，原样带上（只读） */
  keptParameters?: import('./params').KeptParameter[];
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
    | 'original_filename'
    | 'has_custom_name'
    | 'image_path'
    | 'thumbnail_path'
    | 'created_at'
    | 'is_favorite'
    | 'deleted_at'
    | 'prompt_fingerprint'
    | 'vibe_fingerprint'
    | 'group_cover_id'
  > {
  generated_work_id?: string;
  version_number?: number;
  generation_source?: 'user' | 'agent';
  work_refs?: WorkRef[];
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
  image_count?: number;
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
  hasApiKey: boolean;
  encryptionAvailable: boolean;
  /** 1.5：内置 AI 用哪一种（doc/design.md 2.27）。没登录 ChatGPT、也没填 API Key 时是 'chatgpt' */
  provider: 'chatgpt' | 'apiKey';
  chatgpt: ChatGPTAccount;
}
/** ChatGPT 账号（1.5）。两种登录方式各自登录、各自保存令牌；这里是当前方式的状态 */
export interface ChatGPTAccount {
  /** 'official' 是 OpenAI 开放的 Sign in with ChatGPT；'codex' 是非官方的 Codex 方式，默认关闭 */
  mode: 'official' | 'codex';
  signedIn: boolean;
  /** 只用来显示；不是稳定身份 */
  email: string | null;
  /** 选中的模型 slug；没选过时是模型列表的第一个 */
  model: string;
  /** 第一次登录成功后的说明弹过了 */
  introShown: boolean;
  /** 剩余额度：Codex 方式才有（官方方式响应里有额度信息时也填）；取不到是 null */
  quota: ChatGPTQuota | null;
  /** 最近一次 AI 请求因为额度用完被拒：界面出"已达到用量上限"横幅 */
  limited: { resetsAt: string | null } | null;
}
export interface ChatGPTQuota {
  /** 每个窗口一行；Pro 没有 5 小时的窗口。label 是界面上的名字（"5 小时内""本周"） */
  windows: { label: string; remainingPercent: number; resetsAt: string | null }[];
  updatedAt: string;
  /** 上次刷新失败的原因；windows 仍是上一次成功的值 */
  error?: string;
}
export interface AISettingsInput {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  provider?: 'chatgpt' | 'apiKey';
  /** 选 ChatGPT 的模型 */
  chatgptModel?: string;
  /** 打开或关上 Codex 方式；关上时清掉 Codex 方式的令牌 */
  codexMode?: boolean;
  introShown?: true;
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
  /** 关闭主窗口时（doc/design.md 2.28，只在 Windows）：每次询问 / 最小化到托盘 / 退出 */
  closeAction: 'ask' | 'tray' | 'quit';
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
  checkedAt?: string;
  structuredNotes?: import('../lib/releaseNotes.js').ReleaseNotes | null;
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
/** Application-owned external HTTP traffic; manual proxies are local and unauthenticated. */
export type NetworkSettings =
  | { mode: 'system' | 'direct' }
  | {
      mode: 'manual';
      protocol: 'http' | 'socks5';
      host: 'localhost' | '127.0.0.1' | '[::1]';
      port: number;
    };
export interface NetworkState {
  settings: NetworkSettings | null;
  pending: NetworkSettings | null;
  phase: 'ready' | 'pending' | 'applying' | 'error' | 'blocked';
  error: 'initialization_failed' | 'apply_failed' | 'rollback_failed' | null;
  active: number;
}
export interface NetworkTestResult {
  reachable: boolean;
  status: number | null;
  failure: 'proxy' | 'proxy_auth' | 'timeout' | 'dns' | 'tls' | 'network' | null;
  elapsedMs: number;
}
