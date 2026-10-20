import type * as Types from './types';
import type * as IPC from './ipc';
import type {
  ImageProject,
  WorkbenchSource,
  GalleryFilters,
  LibraryCard,
  Collection,
  TagDictionaryEntry,
  TagCategory,
} from './types';
import type { PromptDocument } from '../lib/promptDocument';
import type { normalizeWorkbenchViewState } from '../lib/workbenchSession.js';

export type CommandErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'forbidden'
  | 'app_busy';
export type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: CommandErrorCode; message: string } };
export interface CommandTab {
  id: string;
  identity: string;
  displayName: string;
  source: WorkbenchSource;
  project: ImageProject | null;
  originalProject: ImageProject | null;
  savedDraft?: { tags: ImageProject['tags']; prompt_structure: ImageProject['prompt_structure'] };
  viewState: ReturnType<typeof normalizeWorkbenchViewState>;
  updatedAt: string;
  error: string;
  revision?: number;
}
export interface CommandSession {
  version: number;
  tabs: CommandTab[];
  activeTabId: string;
}
export interface Revision {
  expectedRevision?: number;
}
export interface TabInput extends Revision {
  tabId: string;
}
export interface ScopeInput extends TabInput {
  scope: string;
}
export interface BlockInput extends ScopeInput {
  block: number;
}
export interface TagInput extends BlockInput {
  index: number;
}
export interface TabDocument {
  tab: CommandTab;
  document: PromptDocument;
  revision: number;
}
export interface EditingTarget {
  tabId: string;
  scope?: string;
  block?: number;
}
export interface WorkbenchCommandEvent {
  type: 'workbench';
  session: CommandSession;
  source: 'ui' | 'agent';
  tabId?: string;
  undoId?: string;
  libraryChanged?: boolean;
  dictionaryChanged?: boolean;
}
export interface ProgressTopics {
  'library:cards-progress': IPC.LibraryCardCacheProgress;
  'library:storage-progress': Types.LibraryStorageProgress;
  'library:import-progress': Types.ImportProgress;
  'library:import-preview': Types.PreparedImportPreview;
  'tag-cache:retranslate:progress': IPC.DictionaryTranslationProgress;
}
export type ProgressCommandEvent = {
  [K in keyof ProgressTopics]: { type: 'progress'; topic: K; data: ProgressTopics[K] };
}[keyof ProgressTopics];
export type CommandEvent =
  | WorkbenchCommandEvent
  | ProgressCommandEvent
  | { type: 'updates'; data: Types.UpdateState }
  | { type: 'navigate'; destination: string };
export interface CommandDefinitions {
  'agent.setup': {
    input: Record<string, never>;
    output: IPC.Result<{
      installed: boolean;
      path: string;
      onPath: boolean;
      skillPath: string;
      platform: string;
    }>;
  };
  'agent.install': {
    input: Record<string, never>;
    output: IPC.Result<{
      installed: boolean;
      path: string;
      onPath: boolean;
      skillPath: string;
      platform: string;
      pathFailed?: boolean;
    }>;
  };
  'agent.skill': { input: Record<string, never>; output: IPC.Result<{ text: string }> };
  'agent.reveal': { input: Record<string, never>; output: IPC.Result };
  'image.copy': { input: { id?: string; path?: string }; output: IPC.Result };
  'image.save-as': {
    input: { id?: string; path?: string; name?: string };
    output: IPC.DownloadResult;
  };
  'file.reveal': {
    input: {
      path?: string;
      vibe?: Pick<Types.Vibe, 'encoding'> & Partial<Omit<Types.Vibe, 'encoding'>>;
    };
    output: IPC.Result<{ filePath: string }>;
  };
  'workbench.open-many': {
    input: { paths: string[] };
    output: { ok: boolean; items: IPC.DroppedWorkbenchItem[]; error?: string };
  };
  'import.prepare': { input: { paths?: string[] }; output: IPC.PreparedImportResult };
  'import.files': {
    input: { paths?: string[]; fromClipboard?: boolean };
    output: IPC.ImportResult;
  };
  'import.cancel': { input: { id: string }; output: { ok: boolean } };
  'library.cards': {
    input: { view?: 'all' | 'favorites' | 'trash' };
    output: Types.LibraryCard[];
  };
  'library.import-days': {
    input: { view?: 'all' | 'trash'; collectionId?: string; month: string };
    output: { days: Record<string, number> };
  };
  'collection.create': {
    input: { collection: IPC.CollectionInput };
    output: IPC.Result<{ collection: Types.Collection | null }>;
  };
  'collection.update': {
    input: { id: string; patch: IPC.CollectionPatch };
    output: IPC.Result<{ collection: Types.Collection | null }>;
  };
  'collection.delete': {
    input: { id: string };
    output: IPC.Result<{ deleted: boolean }>;
  };
  'library.restore': { input: { ids: string[] }; output: IPC.BatchResult };
  'library.set-cover': {
    input: { fingerprint: string; projectId: string };
    output: IPC.Result<{ promptFingerprint: string; projectId: string }>;
  };
  'trash.delete-permanently': {
    input: { ids?: string[] };
    output: IPC.BatchResult;
  };
  'trash.summary': {
    input: Record<string, never>;
    output: IPC.Result<{
      projects: Pick<
        Types.ImageRecord,
        'id' | 'name' | 'image_path' | 'thumbnail_path' | 'is_favorite' | 'deleted_at'
      >[];
      count: number;
      totalBytes: number | null;
    }>;
  };
  'workbench.temp-sync': {
    input: { paths: string[] };
    output: IPC.Result<{ removed: string[] }>;
  };
  'workbench.save-structure': {
    input: { filePath: string; structure: import('./types').PromptStructure; projectId?: string };
    output: IPC.Result;
  };
  'workbench.open-clipboard': {
    input: Record<string, never>;
    output: Exclude<IPC.WorkbenchResult, { canceled: true }>;
  };
  'dictionary.retranslate': {
    input: { id: string; tags: string[] };
    output: IPC.Result<IPC.DictionaryTranslationProgress>;
  };
  'dictionary.retranslate-cancel': { input: { id: string }; output: IPC.Result };
  'dictionary.translate': {
    input: { tags: string[] };
    output: IPC.Result<IPC.TranslationResult>;
  };
  'dictionary.remove': {
    input: { tags: string[] };
    output: IPC.Result<{ deleted: number }>;
  };
  'paragraph.transform': {
    input: {
      request: {
        id: string;
        text: string;
        direction: 'translate' | 'rewrite';
      };
    };
    output: IPC.Result<{ text: string }>;
  };
  'paragraph.cancel': { input: { id: string }; output: IPC.Result };
  'import.previews': { input: { sessionId: string }; output: IPC.Result };
  'import.commit': {
    input: { sessionId: string; entryIds: string[] };
    output: IPC.ImportResult;
  };

  'clipboard.read-text': { input: Record<string, never>; output: string };
  'clipboard.write-text': { input: { text: string }; output: void };
  'settings.ai.get': { input: Record<string, never>; output: Types.AISettings };
  'settings.ai.save': {
    input: { settings: Types.AISettingsInput };
    output: Types.AISettings;
  };
  'settings.appearance.get': {
    input: Record<string, never>;
    output: Types.AppearanceSettings;
  };
  'settings.appearance.save': {
    input: { settings: Partial<Types.AppearanceSettings> };
    output: Types.AppearanceSettings;
  };
  'settings.productivity.get': {
    input: Record<string, never>;
    output: Types.ProductivitySettings;
  };
  'settings.productivity.save': {
    input: { settings: Partial<Types.ProductivitySettings> };
    output: Types.ProductivitySettings;
  };
  'updates.status': {
    input: Record<string, never>;
    output: { ok: true } & Types.UpdateState;
  };
  'updates.check': {
    input: Record<string, never>;
    output:
      | ({ ok: true } & Types.UpdateState)
      | (IPC.Failure & Types.UpdateCapabilities & { currentVersion: string });
  };
  'updates.download': { input: Record<string, never>; output: IPC.Result };
  'updates.install': { input: Record<string, never>; output: IPC.Result };
  'updates.open-release': { input: { url?: string }; output: { ok: true } };
  'fonts.list': {
    input: Record<string, never>;
    output:
      | { ok: true; fonts: { family: string; monospace: boolean }[] }
      | (IPC.Failure & { fonts: [] });
  };
  'ai.models': {
    input: Record<string, never>;
    output: IPC.Result<{ models: string[] }>;
  };
  'ai.test': {
    input: Record<string, never>;
    output: IPC.Result<{ model: string; latencyMs: number; response: string }>;
  };
  'storage.get': {
    input: Record<string, never>;
    output: IPC.Result<IPC.StorageDetails>;
  };
  'storage.database': {
    input: Record<string, never>;
    output: IPC.Result<IPC.DatabaseStorageLocation>;
  };
  'storage.backups': {
    input: Record<string, never>;
    output: IPC.Result<{ backups: IPC.DatabaseBackup[] }>;
  };
  'storage.reveal-backup': { input: { fileName: string }; output: IPC.Result };
  'storage.change': {
    input: Record<string, never>;
    output: IPC.StorageChangeResult;
  };
  'storage.reveal': { input: Record<string, never>; output: IPC.Result };

  'app.status': {
    input: Record<string, never>;
    output: { version: string; libraryCount: number; workbenchTabs: number; revision: number };
  };
  'image.read': {
    input: { path: string };
    output: { project: ImageProject; document: PromptDocument };
  };
  'workbench.list': {
    input: Record<string, never>;
    output: {
      tabs: {
        id: string;
        name: string;
        revision: number;
        dirty: boolean;
        source: WorkbenchSource;
      }[];
      activeTabId: string;
    };
  };
  'workbench.open': {
    input: Revision & { path?: string; libraryId?: string; source?: WorkbenchSource };
    output: TabDocument | { canceled: true };
  };
  'workbench.get': { input: { tabId: string }; output: TabDocument };
  'workbench.close': { input: TabInput; output: { closed: string } };
  'workbench.save-to-library': {
    input: TabInput;
    output: { project: ImageProject; revision: number };
  };
  'prompt.set': { input: ScopeInput & { text: string }; output: TabDocument };
  'block.set-text': { input: BlockInput & { text: string }; output: TabDocument };
  'block.set-type': { input: BlockInput & { type: 'tags' | 'paragraph' }; output: TabDocument };
  'tag.add': { input: BlockInput & { text: string; before?: number }; output: TabDocument };
  'tag.remove': { input: TagInput; output: TabDocument };
  'tag.set': { input: TagInput & { text?: string; weight?: number }; output: TabDocument };
  'character.add': { input: TabInput & { name?: string }; output: TabDocument };
  'character.remove': { input: TabInput & { characterId: string }; output: TabDocument };
  'prompt.copy': {
    input: { tabId: string; scope?: string; includeAutomatic?: boolean };
    output: { text: string; revision: number };
  };
  'library.search': {
    input: {
      query?: string;
      filters?: Partial<GalleryFilters>;
      collectionId?: string;
      view?: 'all' | 'trash';
      offset?: number;
      limit?: number;
    };
    output: { items: LibraryCard[]; total: number; revision: number };
  };
  'library.get': {
    input: { id: string };
    output: { project: Types.ImageRecord; revision: number };
  };
  'library.import': {
    input: Revision & { path: string };
    output: { project: ImageProject; revision: number };
  };
  'library.rename': {
    input: Revision & { id: string; name: string };
    output: { project: ImageProject; revision: number };
  };
  'library.trash': {
    input: Revision & { ids: string[] };
    output: {
      ids: string[];
      revision: number;
      results: Types.BatchResults;
      summary: Types.BatchSummary;
    };
  };
  'library.rename-many': {
    input: Revision & { changes: { id: string; name: string; has_custom_name?: boolean }[] };
    output: {
      previous: { id: string; name: string; has_custom_name: boolean }[];
      revision: number;
    };
  };
  'dictionary.list': {
    input: {
      query?: string;
      category?: TagCategory;
      source?: string;
      limit?: number;
      offset?: number;
      all?: boolean;
    };
    output: { items: TagDictionaryEntry[]; total: number; limit: number; offset: number };
  };
  'dictionary.suggest': {
    input: { query: string };
    output: { items: { tag: string; translation: string; category: string; count: number }[] };
  };
  'dictionary.set-many': {
    input: Revision & { entries: { tag: string; translation?: string; category?: TagCategory }[] };
    output: { items: TagDictionaryEntry[]; revision: number };
  };
  'collection.list': {
    input: Record<string, never>;
    output: { items: Collection[]; revision: number };
  };
  'collection.add': {
    input: Revision & { collectionId: string; ids: string[] };
    output: { revision: number; results: Types.BatchResults; summary: Types.BatchSummary };
  };
  'collection.remove': {
    input: Revision & { collectionId: string; ids: string[] };
    output: { revision: number; results: Types.BatchResults; summary: Types.BatchSummary };
  };
  'dictionary.lookup': {
    input: { tags: string[] };
    output: { items: TagDictionaryEntry[]; revision: number };
  };
  'dictionary.set': {
    input: Revision & { tag: string; translation?: string; category?: TagCategory };
    output: { items: TagDictionaryEntry[]; revision: number };
  };
  // Renderer-only lifecycle commands share validation and dispatch, but never
  // grant the CLI authority to import arbitrary session objects or undo tokens.
  'workbench.session': { input: { legacyV1?: string; legacyV2?: string }; output: CommandSession };
  'workbench.commit': {
    input: { base: CommandSession; next: CommandSession };
    output: CommandSession;
  };
  'workbench.editing': { input: { targets: EditingTarget[] }; output: { updated: true } };
  'workbench.undo': { input: { undoId: string }; output: CommandSession };
}
export type CommandName = keyof CommandDefinitions;
export type CommandInput<N extends CommandName> = CommandDefinitions[N]['input'];
export type CommandOutput<N extends CommandName> = CommandDefinitions[N]['output'];
export type InvokeCommand = <N extends CommandName>(
  name: N,
  input: CommandInput<N>,
) => Promise<CommandResult<CommandOutput<N>>>;
