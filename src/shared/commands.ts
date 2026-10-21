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
import type {
  GenerationSettings,
  GenerationEstimate,
  GenerationStatus,
  GenerationJob,
  WorkVersion,
  WorkOrigin,
} from './generation';

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
  workId?: string;
  versionId?: string;
  versionImageId?: string;
  workOrigin?: WorkOrigin;
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
  | { type: 'generation'; data: GenerationStatus }
  | { type: 'navigate'; destination: string };
/**
 * 技能在某个 Agent 里的情况：installed 已装且和软件里的一样；outdated 已装但和软件里的不一样（软件升级后）；
 * missing 这个 Agent 装了但还没有技能；unavailable 这台电脑上没找到这个 Agent（没有 ~/.claude 或 ~/.codex）。
 */
export type AgentSkillState = 'installed' | 'outdated' | 'missing' | 'unavailable';
export interface AgentSkills {
  claude: { state: AgentSkillState; path: string };
  codex: { state: AgentSkillState; path: string };
}
export interface CommandDefinitions {
  'prompt.tidy': {
    input: TabInput & { requestId: string };
    output: { changes: import('./materials').TidyChange[]; revision: number };
  };
  'ai.cancel': { input: { requestId: string }; output: Record<string, never> };
  'library.suggest-names': {
    input: { requestId: string; groups: string[][] };
    output: { changes: { id: string; name: string; original: string; thumbnail: string }[] };
  };
  'material.vibes': {
    input: Record<string, never>;
    output: {
      items: {
        id: string;
        name: string;
        sources: { id: string; name: string; thumbnail: string }[];
      }[];
    };
  };
  'material.list': {
    input: Record<string, never>;
    output: { items: import('./materials').Material[] };
  };
  'material.save': {
    input: ScopeInput & { block?: number; name: string };
    output: { item: import('./materials').Material };
  };
  'material.insert': {
    input: TabInput & { id: string; scope?: string; before?: number };
    output: TabDocument;
  };
  'material.rename': {
    input: { id: string; name: string };
    output: { item: import('./materials').Material };
  };
  /**
   * 改一块素材的内容（素材是模板：只影响以后插入的地方）。常用块不写 block；角色写 block（第几块），负面提示词写 negative: true。
   * text 是这一块的文字（Tag 块按逗号分开、可以带 1.2::tag:: 权重；段落是原文），块的类型不变，段落改了以后译文清空。
   * 负面提示词的 text 是全部负面 Tag（按逗号分开），保存后负面提示词变成这一个 Tag 块。
   * asNew 为 true 时原来那份不动，另存一份新的（名称加"副本"，用过次数从 0 开始，示例图片沿用），返回新的那一份。
   */
  'material.update': {
    input: { id: string; block?: number; negative?: boolean; text: string; asNew?: boolean };
    output: { item: import('./materials').Material };
  };
  'material.delete': { input: { id: string }; output: Record<string, never> };

  /**
   * 改第二层参数（1.4）。patch 只写要改的项。换模型时：
   * - 目标模型角色数不够：invalid_input，不改；
   * - 目标模型不支持参考图而草稿里有参考图：没写 dropReferences 时返回 needs_confirm（界面先确认），写了就去掉参考图；
   * - 目标模型没有的质量档位或负面预设改成 Standard / Heavy，只对这个模型有效的参数（Effort、Rescale、噪声计划）跟着换，
   *   改了什么写进 notes（"负面预设改成了 Heavy（V4 Full 没有 Furry Focus）"），界面放进通知。
   */
  'params.set': {
    input: TabInput & {
      patch: Partial<import('./params').GenerationSettings>;
      dropReferences?: boolean;
    };
    output: TabDocument & { notes: string[] };
  };
  /** 加一个 Vibe：从 Vibe 库（libraryId），或者从一张图片（图片库里的 imageId，或者文件 path；没有就弹出选择框） */
  'reference.add-vibe': {
    input: TabInput & { libraryId?: string; imageId?: string; path?: string };
    output: TabDocument;
  };
  /** 加一个精确参考：图片库里的 imageId，或者文件 path；没有就弹出选择框 */
  'reference.add-precise': {
    input: TabInput & { imageId?: string; path?: string };
    output: TabDocument;
  };
  /** 改一个 Vibe 或精确参考：Vibe 改 strength、information；精确参考改 type、strength、fidelity */
  'reference.set': {
    input: TabInput & {
      id: string;
      strength?: number;
      information?: number;
      type?: import('./params').PreciseReferenceType;
      fidelity?: number;
    };
    output: TabDocument;
  };
  'reference.remove': { input: TabInput & { id: string }; output: TabDocument };
  /** Vibe 库：编码过的 Vibe（生成时编码的会自动存进来） */
  'vibe.library': {
    input: Record<string, never>;
    output: { items: import('./params').VibeLibraryItem[] };
  };
  'generate.estimate': {
    input: TabInput & { count: number; width?: number; height?: number };
    output: GenerationEstimate;
  };
  'generate.start': {
    input: TabInput & { count: number; continuous?: boolean; fixedSeed?: boolean; seed?: number };
    output: GenerationJob;
  };
  'generate.status': { input: { id?: string }; output: GenerationStatus };
  'generate.confirm': { input: { ids: string[] }; output: GenerationStatus };
  'generate.cancel': { input: { ids: string[] }; output: GenerationStatus };
  'generate.stop': { input: { id: string }; output: GenerationStatus };
  'generate.retry': { input: { id: string }; output: GenerationJob };
  'account.get': { input: Record<string, never>; output: GenerationStatus };
  'account.save': { input: { token: string }; output: GenerationStatus };
  'account.refresh': { input: Record<string, never>; output: GenerationStatus };
  'settings.generation.save': {
    input: Partial<Omit<GenerationSettings, 'hasToken' | 'spentDate' | 'spentToday'>>;
    output: GenerationStatus;
  };
  'version.list': {
    input: { tabId: string };
    output: {
      versions: WorkVersion[];
      origin: WorkOrigin | null;
      derived: { workId: string; source: WorkOrigin }[];
    };
  };
  'work.open': {
    input: { workId: string; versionId?: string; imageId?: string };
    output: TabDocument;
  };
  'version.open': {
    input: TabInput & { versionId: string; imageId?: string };
    output: TabDocument;
  };
  'prompt.set-size': { input: TabInput & { width: number; height: number }; output: TabDocument };
  'branch.rename': { input: { branchId: string; name: string }; output: { name: string } };
  'work.open-from-image': {
    input: TabInput & { versionId: string; imageId: string };
    output: TabDocument;
  };
  'agent.setup': {
    input: Record<string, never>;
    output: IPC.Result<{
      installed: boolean;
      path: string;
      onPath: boolean;
      skillPath: string;
      platform: string;
      /** 技能装到各个 Agent 的全局技能目录的情况 */
      skills?: AgentSkills;
    }>;
  };
  /**
   * 卸载命令行工具：删掉软件装的启动脚本（nai-studio、nai-studio.cmd）和软件数据目录里的运行文件；
   * 不改 PATH（那个文件夹里可能还有别的工具）。返回和 agent.setup 一样的状态。
   */
  'agent.uninstall': {
    input: Record<string, never>;
    output: IPC.Result<{
      installed: boolean;
      path: string;
      onPath: boolean;
      skillPath: string;
      platform: string;
      skills?: AgentSkills;
    }>;
  };
  /** 从 Claude Code 或 Codex 里删掉这个技能（只删 skills/nai-studio 这一个文件夹） */
  'agent.skill-uninstall': {
    input: { target: 'claude' | 'codex' };
    output: IPC.Result<{ skills: AgentSkills }>;
  };
  /** 把技能装进 Claude Code（~/.claude/skills/nai-studio）或 Codex（~/.codex/skills/nai-studio），已有的直接覆盖 */
  'agent.skill-install': {
    input: { target: 'claude' | 'codex' };
    output: IPC.Result<{ skills: AgentSkills }>;
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
      skills?: AgentSkills;
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
