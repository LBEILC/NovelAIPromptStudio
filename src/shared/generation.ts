import type { ImageProject } from './types';
export interface GenerationSettings {
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
  anlas: number;
  perImage: number;
  free: boolean;
  count: number;
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
export interface WorkVersion {
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
}
export interface GenerationJob {
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
