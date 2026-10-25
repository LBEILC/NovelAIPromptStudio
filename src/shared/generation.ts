import type { ImageProject } from './types';
export interface GenerationSettings {
  blankModel?: 'last' | import('./params').ModelId;
  connection: 'official' | 'relay';
  officialToken: boolean;
  relay: { baseUrl: string; hasKey: boolean; models: import('./params').ModelId[] | null };
  dailyImageLimit: number;
  spentImagesToday?: number;
  hasToken: boolean;
  continuous: boolean;
  agentMode: 'confirm' | 'direct';
  limitEnabled: boolean;
  dailyLimit: number;
  spentDate?: string;
  spentToday?: number;
}
export interface NovelAISubscription {
  tier: number;
  active: boolean;
  trainingStepsLeft?: { fixedTrainingStepsLeft?: number; purchasedTrainingSteps?: number };
  usage?: { percent: number; isNegative?: boolean; timeUntilNextPercent?: number };
}
export interface GenerationEstimate {
  relay?: boolean;
  anlas: number;
  perImage: number;
  free: boolean;
  count: number;
  /** 费用拆开（1.4）：基础、首次或重新编码 Vibe（一次性）、超过 4 个 Vibe 的附加、精确参考的附加；都是这次一共多少 */
  /** 本次 count 张的总费用分项；encode 仅计尚未缓存的编码，一次收取。 */
  parts?: { base: number; encode: number; vibeExtra: number; precise: number };
  unavailable?: string;
  balance?: number;
  usage?: number;
}
export interface VersionImage {
  id: string;
  projectId: string;
  seed: string;
  deleted: boolean;
  createdAt: string;
}
export type EnhanceScale = 1 | 1.5 | 2 | 'max';
export interface ImageOperation {
  kind: 'upscale' | 'enhance' | 'img2img';
  sourceProjectId?: string;
  strength?: number;
  noise?: number;
  magnitude?: number;
  scale?: EnhanceScale;
}
export interface WorkVersion {
  operation?: ImageOperation;
  isStart?: boolean;
  /**
   * 只在根版本上（1.5.1，doc/design.md 2.23"不满意原图"）：原图在图片库里 / 从文件打开的 /
   * 原图移入了回收站 / 已从作品里去掉。后两种时这一行是"起点"，提示词和参数照旧
   */
  originState?: 'library' | 'file' | 'trashed' | 'removed';
  id: string;
  workId: string;
  parentId: string | null;
  number: number;
  branchId: string;
  branchNumber: number;
  branchName: string;
  project: ImageProject;
  source: 'user' | 'agent';
  createdAt: string;
  images: VersionImage[];
}
export interface WorkOrigin {
  workId: string;
  versionId: string;
  projectId: string;
  name?: string;
  number?: number;
  /** 另起它的那个作品已经删掉了：界面写"来自的作品已删除"，不能点 */
  deleted?: true;
}
export interface GenerationJob {
  operation?: ImageOperation['kind'];
  progress?: number | null;
  branchNotice?: string;
  limitReached?: boolean;
  parentNumber?: number;
  summary?: string;
  estimate?: number;
  id: string;
  tabId: string;
  workId: string;
  parentId: string;
  versionId?: string;
  source: 'user' | 'agent';
  name: string;
  count: number;
  continuous?: boolean;
  fixedSeed?: boolean;
  pending?: boolean;
  state: 'pending' | 'queued' | 'generating' | 'completed' | 'failed' | 'canceled';
  images: string[];
  completed: number;
  index: number;
  spent: number;
  spentKnown: boolean;
  stop: boolean;
  error: string;
  errorCode?: import('./commands').CommandErrorCode;
  errorDetails?: { status?: number; machineCode?: string };
  createdAt: string;
  project: ImageProject;
}
export interface GenerationStatus {
  jobs: GenerationJob[];
  settings: GenerationSettings;
  subscription: NovelAISubscription | null;
  balance: number;
  accountError: string;
}
