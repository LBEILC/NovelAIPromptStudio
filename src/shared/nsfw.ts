import { parsePrompt } from '../lib/prompt.js';
import type { StoredPromptStructure, PromptStructure } from './types';

export interface NsfwState {
  value: boolean;
  source: 'auto' | 'manual';
  tag?: string;
}

export const DEFAULT_NSFW_TAGS: string[] = (
  'nsfw, explicit, rating:explicit, questionable, rating:questionable, ' +
  'nude, completely nude, nudity, naked, topless, bottomless, nipples, areola, areolae, ' +
  'pussy, vagina, penis, testicles, anus, sex, vaginal, anal, oral, fellatio, cunnilingus, ' +
  'paizuri, handjob, masturbation, cum, cum in pussy, ejaculation, pubic hair, uncensored, censored'
).split(', ');

export function normalizeNsfwWord(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^[\s\[\]{}()]+|[\s\[\]{}()]+$/g, '')
    .replace(/\s*:\s*/g, ':')
    .trim();
}

export function normalizeNsfwWords(words: string[]): string[] {
  return [...new Set(words.map(normalizeNsfwWord).filter(Boolean))];
}

/** Compact reusable input for the persistent library-card cache. */
export function positiveNsfwTags(structure: StoredPromptStructure | PromptStructure): string[] {
  const found = new Set<string>();
  for (const raw of [
    structure?.base_prompt_raw,
    ...(structure?.characters || []).map((c) => c.prompt_raw),
  ]) {
    for (const tag of parsePrompt(raw || '', () => '')) {
      if (!(tag.weight * Math.pow(1.05, tag.brace_depth || 0) > 0)) continue;
      const parts = tag.segment_type === 'text_block' ? tag.tag.split(/[,，]/) : [tag.tag];
      for (const part of parts) found.add(normalizeNsfwWord(part));
    }
  }
  return [...found];
}

export function judgeNsfw(
  structure: StoredPromptStructure | PromptStructure,
  words: string[],
): { value: boolean; tag?: string } {
  if (!words.length) return { value: false };
  const vocabulary = new Map<string, string>();
  for (const word of words) {
    const key = normalizeNsfwWord(word);
    if (key && !vocabulary.has(key)) vocabulary.set(key, word);
  }
  for (const token of positiveNsfwTags(structure)) {
    const tag = vocabulary.get(token);
    if (tag !== undefined) return { value: true, tag };
  }
  return { value: false };
}
