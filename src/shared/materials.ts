import type { PromptBlock } from '../lib/promptDocument';
import type { PromptCharacter } from './types';

export interface Material {
  id: string;
  kind: 'block' | 'character' | 'pool';
  entries?: import('../lib/randomPrompt').PoolEntry[];
  name: string;
  uses: number;
  blocks: PromptBlock[];
  character?: PromptCharacter;
  negativeBlocks?: PromptBlock[];
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
