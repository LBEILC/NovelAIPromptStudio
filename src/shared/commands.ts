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
  | 'canceled'
  | 'denied'
  | 'not_eligible'
  | 'network'
  | 'reauth'
  | 'usage_limit'
  | 'unavailable'
  | 'invalid_token'
  | 'request_failed'
  | 'response_failed'
  | 'response_incomplete'
  | 'stream_disconnected'
  | 'branch_generating'
  | 'needs_confirm'
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'forbidden'
  | 'app_busy';
export type CommandResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: CommandErrorCode;
        message: string;
        details?: {
          branches?: number;
          versions?: number;
          images?: number;
          status?: number | null;
          machineCode?: string | null;
          requestId?: string | null;
          param?: string | null;
        };
      };
    };
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
  /** 作品已经存进图片库（生成过，或点过"存入图片库""存为新作品"；1.5.6） */
  workSaved?: boolean;
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
  | { type: 'ai-settings' }
  | { type: 'network'; data: Types.NetworkState }
  | { type: 'updates'; data: Types.UpdateState }
  | { type: 'generation'; data: GenerationStatus }
  | { type: 'navigate'; destination: string }
  /** 主窗口要关闭、"关闭主窗口时"是每次询问（doc/design.md 2.28，只在 Windows） */
  | { type: 'close-request' }
  /** 托盘菜单每次弹出前发给菜单页面 */
  | { type: 'tray-menu-open' };
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
  'settings.network.get': { input: Record<string, never>; output: Types.NetworkState };
  'settings.network.save': { input: Types.NetworkSettings; output: Types.NetworkState };
  'settings.network.test': { input: Types.NetworkSettings; output: Types.NetworkTestResult };
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

  'workbench.new': {
    input: {
      name?: string;
      width?: number;
      height?: number;
      params?: Partial<import('./params').GenerationSettings>;
    };
    output: TabDocument;
  };
  /**
   * 不满意原图（1.5.1）：原图在图片库里时移入回收站，从文件打开的从作品里去掉（不动文件）。
   * 根版本留下来变成"起点"（originState 是 trashed / removed），提示词、参数和后面各版都不变。
   * 撤销用 work.restore-original；原图在回收站时从回收站恢复它也一样。
   */
  'work.remove-original': {
    input: TabInput;
    output: { trashed: boolean; undo: string };
  };
  'work.restore-original': { input: { undo: string }; output: { restored: boolean } };
  /** 把这个作品存进图片库：原图不在图片库就先存，再建立作品（1.5.6，"存为新作品""存入图片库"） */
  'work.save': { input: TabInput; output: TabDocument };
  /** 只从这个作品里去掉这些图（共用的图），图本身不进回收站（1.5.6） */
  'work.detach-images': {
    input: { workId: string; imageIds: string[] };
    output: {
      undo: string;
      versions?: { workName: string; number: number; branchName: string; lastOfBranch: boolean }[];
    };
  };
  'work.restore-detached': { input: { undo: string }; output: { restored: boolean } };
  /**
   * 回收站里"只从某个作品去掉"的记录（061，doc/design.md 2.0"删掉的东西都进回收站"）：一张图一条，最近的在前；
   * 图本身进了回收站或被永久删除的不列。放回用 work.restore-detached，作品已经不在时报错。
   */
  'trash.detached': { input: Record<string, never>; output: { items: Types.DetachedRecord[] } };
  /** "不再恢复"：只丢掉记录，图片和文件都不动 */
  'work.discard-detached': { input: { undos: string[] }; output: { discarded: number } };
  /**
   * 删除一版和它之后的各版（用户 10-21，doc/design.md 2.23）：整棵子树软删除，图进回收站，用 branch.restore 撤销。
   * 原图和起点不能删。子树不止这一版时，没有 confirmed 返回 needs_confirm，details 是 {versions, branches, images}。
   * 正在走的线被删掉时回到上一版，草稿保留。
   */
  'version.delete': {
    /** only：只删这一版，后面的版本接到它的上一版下面（1.5.2，doc/design.md 2.23） */
    input: { versionId: string; confirmed?: boolean; only?: boolean };
    output: {
      branches: number;
      versions: number;
      images: number;
      cancelledJobs: number;
      undo: string;
    };
  };
  'branch.delete': {
    input: { branchId: string; confirmed?: boolean };
    output: {
      branches: number;
      versions: number;
      images: number;
      cancelledJobs: number;
      undo: string;
    };
  };
  'branch.restore': { input: { undo: string }; output: { restored: boolean } };
  'generate.queue': { input: TabInput & { count: number }; output: GenerationJob };
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
    /** 只给 imageId 时（图片库里）自己找这张图所在的作品和版本（1.5.5） */
    input: Partial<TabInput> & { versionId?: string; imageId: string };
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
  /** 关闭弹框的选择；remember 为真时先把这次的选择存成"关闭主窗口时" */
  'window.close-choice': {
    input: { action: 'tray' | 'quit'; remember: boolean };
    output: Record<string, never>;
  };
  /** 托盘菜单页面报告内容尺寸（CSS 像素），主进程据此定位后显示 */
  'tray.menu-size': {
    input: { width: number; height: number };
    output: Record<string, never>;
  };
  /** 托盘菜单的操作：show 打开主窗口，quit 直接退出（不弹框），close 只关菜单 */
  'tray.action': {
    input: { action: 'show' | 'quit' | 'close' };
    output: Record<string, never>;
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
  /**
   * 用 ChatGPT 账号登录（1.5，当前方式）：在本机开回调、打开系统浏览器，等用户在网页上完成后返回。
   * 失败的错误码：canceled（用户关了网页或点了取消）、denied（拒绝授权）、
   * not_eligible（免费账号或 workspace 不允许，界面给"改用 API Key"）、network
   */
  'ai.chatgpt.sign-in': { input: Record<string, never>; output: Types.AISettings };
  /** 放弃正在等待的登录 */
  'ai.chatgpt.cancel-sign-in': { input: Record<string, never>; output: Record<string, never> };
  /** 退出登录：撤销远端令牌（没确认也清本地），remoteRevoked 告诉界面远端是否确认了 */
  'ai.chatgpt.sign-out': {
    input: Record<string, never>;
    output: Types.AISettings & { remoteRevoked: boolean };
  };
  /** 这个账号能用的模型（按服务器的顺序；name 是显示名，slug 用来请求） */
  'ai.chatgpt.models': {
    input: Record<string, never>;
    output: { models: { slug: string; name: string }[] };
  };
  /** 在浏览器里打开 ChatGPT 的"设置 → 用量"（固定地址，不接受别的网址） */
  'ai.chatgpt.manage-usage': { input: Record<string, never>; output: { ok: true } };
  /** 刷新剩余额度（Codex 方式）；取不到时 quota.error 有原因 */
  'ai.chatgpt.quota': { input: Record<string, never>; output: Types.ChatGPTQuota | null };
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
    /** 默认回到这张图所在的作品（1.5.5，doc/design.md 2.23）；fresh 为真时照旧另起新作品 */
    input: Revision & {
      path?: string;
      libraryId?: string;
      source?: WorkbenchSource;
      fresh?: boolean;
      /** 从图片库某个作品组打开时：回到这个作品（1.5.6） */
      workId?: string;
    };
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
      /**
       * 1.4.1：移走的是一版剩下的最后一张、而且这一版后面没有别的版本时，这一版跟着进回收站；
       * 这里列出跟着移走的版本（界面写进通知）。从回收站恢复那张图时它们一起回来。
       */
      versions?: { workName: string; number: number; branchName: string; lastOfBranch: boolean }[];
      /** 移走的图里有某个作品的原图：这些作品的名字（作品照旧，第一行变成起点） */
      originsOf?: string[];
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
