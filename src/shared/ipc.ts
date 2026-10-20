import type {
  BatchResults,
  BatchSummary,
  GalleryFilters,
  ImportedImage,
  ImportSummary,
  LibrarySettings,
  PreparedImportEntry,
  TagAnnotation,
  TagCategory,
  WorkbenchImage,
  WorkbenchSource,
} from './types';
import type { InvokeCommand, CommandEvent } from './commands';

export interface Failure {
  ok: false;
  error: string;
}
/**
 * Advisory build progress: library.cards resolving is the completion signal;
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

export interface TagCachePatch {
  translation?: string;
  category?: TagCategory;
}
export interface DictionaryTranslationProgress {
  id: string;
  total: number;
  completed: number;
  translated: number;
  failed: { tag: string; error: string }[];
  canceled: boolean;
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
// Event subscriptions return independent cleanup callbacks.
export interface StudioApi {
  invoke: InvokeCommand;
  onCommandEvent(callback: (event: CommandEvent) => void): () => void;
  onCommandPrepare(callback: () => Promise<void>): () => void;
  pathsForFiles(files: DroppedFiles): string[];
}
