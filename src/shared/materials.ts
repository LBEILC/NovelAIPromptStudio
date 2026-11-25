import type { PromptBlock } from '../lib/promptDocument';
import type { PromptCharacter } from './types';

export interface Material {
  id: string;
  kind: 'block' | 'character' | 'pool' | 'set';
  entries?: import('../lib/randomPrompt').PoolEntry[];
  name: string;
  uses: number;
  blocks: PromptBlock[];
  character?: PromptCharacter;
  negative?: boolean;
  negativeBlocks?: PromptBlock[];
  /** 整套提示词（2.25）：blocks、negativeBlocks 是基础提示词和负面，这里是每个角色 */
  characters?: {
    character: PromptCharacter;
    blocks: PromptBlock[];
    negativeBlocks: PromptBlock[];
  }[];
  useCoords?: boolean;
  useOrder?: boolean;
  examples: string[];
}
export interface TidyChange {
  id: string;
  scope: string;
  block: number;
  before: string;
  after: string;
  type: 'tags' | 'paragraph';
  title: string;
  reason: string;
}
