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
export interface CommandEvent {
  session: CommandSession;
  source: 'ui' | 'agent';
  tabId?: string;
  undoId?: string;
  libraryChanged?: boolean;
  dictionaryChanged?: boolean;
}
export interface CommandDefinitions {
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
    input: Revision & { path?: string; libraryId?: string };
    output: TabDocument;
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
  'library.get': { input: { id: string }; output: { project: ImageProject; revision: number } };
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
    output: { ids: string[]; revision: number };
  };
  'collection.list': {
    input: Record<string, never>;
    output: { items: Collection[]; revision: number };
  };
  'collection.add': {
    input: Revision & { collectionId: string; ids: string[] };
    output: { revision: number };
  };
  'collection.remove': {
    input: Revision & { collectionId: string; ids: string[] };
    output: { revision: number };
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
