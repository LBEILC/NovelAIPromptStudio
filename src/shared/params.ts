// 第二层：参数与参考（1.4，doc/design.md 2.26；事实依据 doc/research/1.4-1.5-接口调研.md 第 1–5、7 节）。
// 界面和命令层共用这一份：模型能力表、参数和参考图的数据形状。只放数据，不放逻辑。

/** 能生成的六个模型（API 名称）。V5 Full 的 Effort Medium 不是单独的一项，是 effort: 'Medium' */
export type ModelId =
  | 'nai-diffusion-5-full'
  | 'nai-diffusion-5-curated'
  | 'nai-diffusion-4-5-full'
  | 'nai-diffusion-4-5-curated'
  | 'nai-diffusion-4-full'
  | 'nai-diffusion-4-curated-preview';
export type Effort = 'High' | 'Medium';
export type Sampler =
  | 'k_euler_ancestral'
  | 'k_euler'
  | 'k_dpmpp_2s_ancestral'
  | 'k_dpmpp_2m_sde'
  | 'k_dpmpp_2m'
  | 'k_dpmpp_sde';
export type NoiseSchedule = 'karras' | 'exponential' | 'polyexponential';
export type QualityPreset = 'None' | 'Standard' | 'Light';
export type UcPreset = 'Heavy' | 'Light' | 'Furry Focus' | 'Human Focus' | 'None';
/** 角色位置：5×5 的格子，A1 到 E5（列 A–E 从左到右，行 1–5 从上到下） */
export type GridCell = `${'A' | 'B' | 'C' | 'D' | 'E'}${1 | 2 | 3 | 4 | 5}`;

export interface ModelCaps {
  id: ModelId;
  /** 界面上的名字 */
  name: string;
  /** 只有 V5 Full 有 Effort（Medium 固定 14 步、Euler Ancestral、负面预设 Heavy，不用自定义负面提示词，没有 Rescale） */
  effort: boolean;
  /** 噪声计划能不能调（V5 不能调，请求固定 karras） */
  noise: boolean;
  qualities: QualityPreset[];
  ucPresets: UcPreset[];
  /** 角色上限。V5 的 22 和官方客户端的 32 有冲突，先按 22（待实测） */
  maxCharacters: number;
  /** Vibe 和精确参考：产品只在 V4.5 上提供（2.26） */
  references: boolean;
  defaults: { steps: number; scale: number };
}
export const SAMPLERS: { id: Sampler; name: string }[] = [
  { id: 'k_euler_ancestral', name: 'Euler Ancestral' },
  { id: 'k_euler', name: 'Euler' },
  { id: 'k_dpmpp_2s_ancestral', name: 'DPM++ 2S Ancestral' },
  { id: 'k_dpmpp_2m_sde', name: 'DPM++ 2M SDE' },
  { id: 'k_dpmpp_2m', name: 'DPM++ 2M' },
  { id: 'k_dpmpp_sde', name: 'DPM++ SDE' },
];
export const NOISE_SCHEDULES: NoiseSchedule[] = ['karras', 'exponential', 'polyexponential'];
const UC_ALL: UcPreset[] = ['Heavy', 'Light', 'Furry Focus', 'Human Focus', 'None'];
const UC_V4: UcPreset[] = ['Heavy', 'Light', 'None'];
export const MODEL_CAPS: Record<ModelId, ModelCaps> = {
  'nai-diffusion-5-full': {
    id: 'nai-diffusion-5-full',
    name: 'V5 Full',
    effort: true,
    noise: false,
    qualities: ['None', 'Standard', 'Light'],
    ucPresets: UC_ALL,
    maxCharacters: 22,
    references: false,
    defaults: { steps: 23, scale: 7 },
  },
  'nai-diffusion-5-curated': {
    id: 'nai-diffusion-5-curated',
    name: 'V5 Curated',
    effort: false,
    noise: false,
    qualities: ['None', 'Standard', 'Light'],
    ucPresets: UC_ALL,
    maxCharacters: 22,
    references: false,
    defaults: { steps: 23, scale: 7 },
  },
  'nai-diffusion-4-5-full': {
    id: 'nai-diffusion-4-5-full',
    name: 'V4.5 Full',
    effort: false,
    noise: true,
    qualities: ['None', 'Standard'],
    ucPresets: UC_ALL,
    maxCharacters: 6,
    references: true,
    defaults: { steps: 23, scale: 5 },
  },
  'nai-diffusion-4-5-curated': {
    id: 'nai-diffusion-4-5-curated',
    name: 'V4.5 Curated',
    effort: false,
    noise: true,
    qualities: ['None', 'Standard'],
    ucPresets: ['Heavy', 'Light', 'Human Focus', 'None'],
    maxCharacters: 6,
    references: true,
    defaults: { steps: 23, scale: 5 },
  },
  'nai-diffusion-4-full': {
    id: 'nai-diffusion-4-full',
    name: 'V4 Full',
    effort: false,
    noise: true,
    qualities: ['None', 'Standard'],
    ucPresets: UC_V4,
    maxCharacters: 6,
    references: false,
    defaults: { steps: 23, scale: 5.5 },
  },
  'nai-diffusion-4-curated-preview': {
    id: 'nai-diffusion-4-curated-preview',
    name: 'V4 Curated',
    effort: false,
    noise: true,
    qualities: ['None', 'Standard'],
    ucPresets: UC_V4,
    maxCharacters: 6,
    references: false,
    defaults: { steps: 23, scale: 5.5 },
  },
};
export const MODEL_ORDER: ModelId[] = [
  'nai-diffusion-5-full',
  'nai-diffusion-5-curated',
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-full',
  'nai-diffusion-4-curated-preview',
];
/** Medium 锁住的值 */
export const MEDIUM_FIXED = {
  steps: 14,
  sampler: 'k_euler_ancestral' as Sampler,
  uc: 'Heavy' as UcPreset,
};
/** 免费范围的步数上限 */
export const FREE_STEPS = 28;

export const PARAMETER_LIMITS = {
  steps: { min: 1, max: 50, integer: true },
  scale: { min: 0, max: 10, integer: false },
  rescale: { min: 0, max: 1, integer: false },
} as const;

export function validParameterNumber(
  key: keyof typeof PARAMETER_LIMITS,
  value: unknown,
): value is number {
  const rule = PARAMETER_LIMITS[key];
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= rule.min &&
    value <= rule.max &&
    (!rule.integer || Number.isInteger(value))
  );
}

/** 新建空白作品和没有生成信息的导入共用的参数（设计 10-23 确认） */
export const NEW_WORK_DEFAULTS = { steps: 28, scale: 5, quality: 'Standard', uc: 'Heavy' } as const;

/** 一版的第二层参数（尺寸、Seed、张数不在这里） */
export interface GenerationSettings {
  model: ModelId;
  /** 只有 V5 Full 有，其他模型是 null */
  effort: Effort | null;
  steps: number;
  scale: number;
  /** 六个基础模型支持 Rescale；Medium 是 null */
  rescale: number | null;
  sampler: Sampler;
  /** V5 是 null（不能调） */
  noise: NoiseSchedule | null;
  quality: QualityPreset;
  uc: UcPreset;
  /** 由 AI 选择角色位置 */
  aiPositions: boolean;
  /** 关掉 aiPositions 后每个角色的格子，键是角色 id */
  positions: Record<string, GridCell>;
}

/** 一个 Vibe（参考图的气氛） */
export interface VibeReference {
  id: string;
  name: string;
  /** 参考图的缩略图路径；原图里只有编码、没有参考图时是 null（信息提取不能改） */
  thumbnail: string | null;
  /** 编码文件名（.naiv4vibe）；还没编码时是 null */
  file: string | null;
  /** 0–1 */
  strength: number;
  /** 0–1；原图里没有记录时是 null（界面写"未知"） */
  information: number | null;
  /**
   * 生成前要不要编码、为什么：'new' 首次编码；'changed' 改了信息提取，要重新编码；null 不用。
   * 已经有对应模型、对应信息提取的编码时是 null（不再收费）
   */
  encode: 'new' | 'changed' | null;
  /** 来自 Vibe 库的那一项 */
  libraryId?: string;
  /** 从 PNG 恢复或生成前取得的编码；仅适用于记录的模型。 */
  encoding?: string;
  model?: ModelId;
}
export type PreciseReferenceType = 'character' | 'style' | 'character&style';
/** 一个精确参考（指定角色或画风） */
export interface PreciseReference {
  id: string;
  name: string;
  thumbnail: string;
  type: PreciseReferenceType;
  /** 0–1 */
  strength: number;
  /** 0–1；请求里发 1 - fidelity */
  fidelity: number;
}
export interface References {
  vibes: VibeReference[];
  precise: PreciseReference[];
}
export const MAX_VIBES = 16;
export const MAX_PRECISE = 16;
/** 超过 4 个 Vibe 以后每多 1 个每张加的 Anlas */
export const VIBE_EXTRA_FREE = 4;
export const VIBE_EXTRA_COST = 2;
export const VIBE_ENCODE_COST = 2;
export const PRECISE_COST = 5;

/** Vibe 库的一项 */
export interface VibeLibraryItem {
  id: string;
  name: string;
  thumbnail: string | null;
  /** 有编码的模型 */
  models: ModelId[];
  /** 每个模型已有编码的信息提取值（不在里面的值要重新编码） */
  informations: Partial<Record<ModelId, number[]>>;
  createdAt: string;
}

/** 原图里有、界面不能改的参数：原样带上，只读列出 */
export type KeptParameter = [key: string, value: string];
