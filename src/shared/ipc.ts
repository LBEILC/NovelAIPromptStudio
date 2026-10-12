import type {
  AISettings,
  AISettingsInput,
  AppearanceSettings,
  BatchResults,
  BatchSummary,
  Collection,
  GalleryFilters,
  ImageRecord,
  ImportedImage,
  ImportProgress,
  ImportSummary,
  LibrarySettings,
  LibraryCard,
  LibraryStorageProgress,
  PreparedImportEntry,
  PreparedImportPreview,
  ProductivitySettings,
  TagAnnotation,
  TagCategory,
  TagDictionaryEntry,
  UpdateCapabilities,
  UpdateState,
  Vibe,
  WorkbenchImage,
  WorkbenchSource,
} from './types';

export interface Failure {
  ok: false;
  error: string;
}
/**
 * Advisory build progress: loadLibraryCards resolving is the completion signal;
 * hide progress then, without waiting for a completed === total event. Events
 * and the IPC reply have no ordering guarantee at the renderer. A fast build
 * may emit no events. Within one build completed never decreases; total may
 * change after imports/deletions (and can fall below completed).
 */
export interface LibraryCardCacheProgress {
  readonly completed: number;
  readonly total: number;
}
export type Result<T = object> = ({ ok: true } & T) | Failure;
export type BatchResult = Result<{ results: BatchResults; summary: BatchSummary }>;
export type DownloadResult = Result<{ canceled: true } | { filePath: string }>;
export type WorkbenchResult =
  | {
      ok: true;
      project: WorkbenchImage;
      source: WorkbenchSource & { path: string };
      metadataMissing?: boolean;
    }
  | { ok: true; canceled: true; project: null }
  | (Failure & { project: null });
export type DroppedWorkbenchItem =
  | { ok: true; project: WorkbenchImage; source: { type: 'file'; path: string } }
  | (Failure & { filePath: string });
export interface ImportResult {
  ok: boolean;
  imported: ImportedImage[];
  duplicates: { file: string; projectId: string; projectName: string }[];
  errors: { file: string; error: string }[];
  summary?: ImportSummary | null;
  batchId?: string;
  error?: string;
  canceled?: true;
  metadataMissing?: boolean;
}
export type PreparedImportResult = Result<
  | { canceled: true }
  | {
      sessionId: string;
      requiresSelection: boolean;
      directImageCount: number;
      skippedCount: number;
      problemCount: number;
      archives: { id: string; name: string; count: number }[];
      entries: PreparedImportEntry[];
    }
>;
export type StorageDetails = LibrarySettings & { fileCount: number; totalBytes: number };
export interface DatabaseStorageLocation {
  directory: string;
  fileName: string;
}
export interface DatabaseBackup {
  fileName: string;
  size: number;
  modifiedAt: string;
}
export type StorageChangeResult = Result<
  | { canceled: true; noChange?: true }
  | (StorageDetails & { noChange: boolean; cleanupWarning: string })
>;
export interface CollectionInput {
  name: string;
  kind?: 'manual' | 'smart';
  filters?: Partial<GalleryFilters>;
}
export interface CollectionPatch {
  name?: string;
  filters?: Partial<GalleryFilters>;
}
export interface TagCacheRequest {
  query?: string;
  category?: TagCategory | '';
  source?: Exclude<TagDictionaryEntry['translation_source'], 'migration'>;
  limit?: number;
  offset?: number;
}
export interface TagCachePatch {
  translation?: string;
  category?: TagCategory;
}
export interface TagAnnotationInput extends Partial<TagAnnotation> {
  tag: string;
}
export interface TranslationResult {
  model: string;
  items: Required<TagAnnotation>[];
  translations: string[];
  categories: TagCategory[];
  cache_hits: number;
  ai_count: number;
  dso_translation_count: number;
  dso_category_count: number;
  unresolved_count: number;
  danbooru_category_count: number;
  danbooru_artist_count: number;
}
export type DroppedFiles = Iterable<File> | ArrayLike<File> | null;

// Each signature corresponds to one property in electron/preload.cjs.
// Event unsubscriptions return ipcRenderer in the preload implementation.
export interface StudioApi {
  loadLibrary(view?: 'all' | 'favorites' | 'trash'): Promise<ImageRecord[]>;
  loadLibraryCards(view?: 'all' | 'favorites' | 'trash'): Promise<LibraryCard[]>;
  onLibraryCardCacheProgress(callback: (progress: LibraryCardCacheProgress) => void): void;
  offLibraryCardCacheProgress(): Electron.IpcRenderer;
  loadLibraryDetail(id: string): Promise<ImageRecord | null>;
  loadCollections(): Promise<
    { ok: true; collections: Collection[] } | (Failure & { collections: Collection[] })
  >;
  createCollection(collection: CollectionInput): Promise<Result<{ collection: Collection | null }>>;
  updateCollection(
    id: string,
    patch: CollectionPatch,
  ): Promise<Result<{ collection: Collection | null }>>;
  deleteCollection(id: string): Promise<Result<{ deleted: boolean }>>;
  updateCollectionProjects(
    id: string,
    projectIds: string[],
    action?: 'add' | 'remove',
  ): Promise<BatchResult>;
  getLibraryStorage(): Promise<Result<StorageDetails>>;
  getDatabaseStorage(): Promise<Result<DatabaseStorageLocation>>;
  listDatabaseBackups(): Promise<Result<{ backups: DatabaseBackup[] }>>;
  revealDatabaseFile(fileName: string): Promise<Result>;
  changeLibraryStorage(): Promise<StorageChangeResult>;
  revealLibraryStorage(): Promise<Result>;
  onLibraryStorageProgress(callback: (progress: LibraryStorageProgress) => void): void;
  offLibraryStorageProgress(): Electron.IpcRenderer;
  openWorkbenchImage(filePath?: string, source?: WorkbenchSource | null): Promise<WorkbenchResult>;
  openClipboardWorkbenchImage(): Promise<Exclude<WorkbenchResult, { canceled: true }>>;
  syncWorkbenchTemporaryImages(referencedPaths: string[]): Promise<Result<{ removed: string[] }>>;
  openDroppedWorkbenchImages(
    files: DroppedFiles,
  ): Promise<{ ok: boolean; items: DroppedWorkbenchItem[]; error: string | undefined }>;
  importImages(): Promise<ImportResult>;
  importClipboardImage(): Promise<ImportResult>;
  importDroppedFiles(files: DroppedFiles): Promise<ImportResult>;
  prepareImport(): Promise<PreparedImportResult>;
  prepareDroppedImport(files: DroppedFiles): Promise<PreparedImportResult>;
  startPreparedImportPreviews(sessionId: string): Promise<Result>;
  cancelPreparedImport(sessionId: string): Promise<{ ok: boolean }>;
  commitPreparedImport(sessionId: string, entryIds: string[]): Promise<ImportResult>;
  onPreparedImportPreview(callback: (update: PreparedImportPreview) => void): void;
  offPreparedImportPreview(): Electron.IpcRenderer;
  cancelImport(batchId: string): Promise<{ ok: boolean }>;
  onImportProgress(callback: (progress: ImportProgress) => void): void;
  offImportProgress(): Electron.IpcRenderer;
  updateProjectName(id: string, name: string): Promise<Result<{ project: ImageRecord | null }>>;
  updateProjectNames(
    changes: { id: string; name: string; has_custom_name?: boolean }[],
  ): Promise<Result<{ previous: { id: string; name: string; has_custom_name: boolean }[] }>>;
  moveProjectsToTrash(ids: string[]): Promise<BatchResult>;
  restoreProjects(ids: string[]): Promise<BatchResult>;
  permanentlyDeleteProjects(ids?: string[]): Promise<BatchResult>;
  getTrashSummary(): Promise<
    Result<{
      projects: Pick<
        ImageRecord,
        'id' | 'name' | 'image_path' | 'thumbnail_path' | 'is_favorite' | 'deleted_at'
      >[];
      count: number;
      totalBytes: number | null;
    }>
  >;
  setGroupCover(
    fingerprint: string,
    projectId: string,
  ): Promise<Result<{ promptFingerprint: string; projectId: string }>>;
  copyProjectImage(id: string): Promise<Result>;
  downloadProjectImage(id: string): Promise<DownloadResult>;
  copyWorkbenchImage(filePath: string): Promise<Result>;
  downloadWorkbenchImage(filePath: string, name?: string): Promise<DownloadResult>;
  saveTagAnnotations(entries?: TagAnnotationInput[]): Promise<Result>;
  listTagCache(
    request?: TagCacheRequest,
  ): Promise<Result<{ items: TagDictionaryEntry[]; total: number; limit: number; offset: number }>>;
  updateTagCache(
    tag: string,
    patch: TagCachePatch,
  ): Promise<Result<{ item: TagDictionaryEntry | null }>>;
  updateTagCacheMany(
    tags: string[],
    category: TagCategory,
  ): Promise<Result<{ items: TagDictionaryEntry[] }>>;
  deleteTagCache(tag: string): Promise<Result<{ deleted: boolean }>>;
  deleteTagCacheMany(tags: string[]): Promise<Result<{ deleted: number }>>;
  revealEmbeddedVibe(
    vibe: Pick<Vibe, 'encoding'> & Partial<Omit<Vibe, 'encoding'>>,
  ): Promise<Result<{ filePath: string }>>;
  revealFile(filePath: string): Promise<void>;
  getAISettings(): Promise<AISettings>;
  saveAISettings(settings: AISettingsInput): Promise<AISettings>;
  getAppearanceSettings(): Promise<AppearanceSettings>;
  saveAppearanceSettings(settings: Partial<AppearanceSettings>): Promise<AppearanceSettings>;
  getProductivitySettings(): Promise<ProductivitySettings>;
  saveProductivitySettings(settings: Partial<ProductivitySettings>): Promise<ProductivitySettings>;
  getUpdateStatus(): Promise<{ ok: true } & UpdateState>;
  checkForUpdates(): Promise<
    ({ ok: true } & UpdateState) | (Failure & UpdateCapabilities & { currentVersion: string })
  >;
  downloadUpdate(): Promise<Result>;
  installUpdate(): Promise<Result>;
  openReleasePage(url?: string): Promise<{ ok: true }>;
  onUpdateState(callback: (state: UpdateState) => void): void;
  offUpdateState(): Electron.IpcRenderer;
  listSystemFonts(): Promise<
    { ok: true; fonts: { family: string; monospace: boolean }[] } | (Failure & { fonts: [] })
  >;
  listAIModels(): Promise<Result<{ models: string[] }>>;
  testAIModel(): Promise<Result<{ model: string; latencyMs: number; response: string }>>;
  translateTags(tags: string[]): Promise<Result<TranslationResult>>;
  suggestTags(
    query: string,
  ): Promise<Result<{ items: { tag: string; translation: string; category: TagCategory }[] }>>;
}
