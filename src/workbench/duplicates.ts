// 重复的 Tag（2.0.9，doc/design.md 2.14、2.24，#21）：只在同一节里比；不管大小写、下划线和空格、
// 括号和权重写法。后出现的算重复；和第一次权重一样的能一键去掉，权重不同的只标不删。段落、随机块不参与。
import { singleTagCore } from '../lib/singleTag.js';
import type { PromptDocument } from '../lib/promptDocument';
import type { DocumentTag } from './model';

export const tagKey = (tag: string) =>
  tag.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

export interface Duplicate {
  /** 第一次出现的那个 */
  first: DocumentTag;
  /** 权重和第一次一样，可以去掉 */
  removable: boolean;
  /** 悬停说明 */
  note: string;
}

/** 块方式：entries 是 documentTags(doc)，返回 key → 重复信息（只含后出现的） */
export function blockDuplicates(doc: PromptDocument, entries: DocumentTag[]) {
  const out = new Map<string, Duplicate>();
  const seen = new Map<string, DocumentTag>();
  for (const e of entries) {
    if (e.automatic) continue;
    const block = doc.scopes[e.section]?.blocks[e.block];
    if (!block || block.type !== 'tags') continue;
    const k = `${e.section}\u0000${tagKey(e.tag.tag)}`;
    if (!tagKey(e.tag.tag)) continue;
    const first = seen.get(k);
    if (!first) {
      seen.set(k, e);
      continue;
    }
    const removable =
      first.tag.weight === e.tag.weight &&
      (first.tag.brace_depth || 0) === (e.tag.brace_depth || 0);
    const at = doc.scopes[first.section].blocks[first.block];
    const label = at?.displayLabel || at?.label;
    const where =
      first.block === e.block
        ? '这一块前面已经有'
        : label
          ? `和「${label}」块重复`
          : `和第 ${first.block + 1} 块重复`;
    out.set(e.key, {
      first,
      removable,
      note: removable ? where : `${where}（权重不同，不会被去掉）`,
    });
  }
  return out;
}

export interface TextDuplicate {
  /** 这一项在文字里的范围（不含分隔的逗号） */
  start: number;
  end: number;
  tag: string;
  line: number;
  removable: boolean;
}

/** 文本方式：按文字找重复。空一行是新的一块；没有逗号、超过 8 个词的块是段落，不参与 */
export function textDuplicates(value: string): TextDuplicate[] {
  const out: TextDuplicate[] = [];
  const seen = new Map<string, string>();
  const blocks = value.split(/(\n[ \t]*\n)/);
  let offset = 0;
  for (const block of blocks) {
    const begin = offset;
    offset += block.length;
    if (!block.trim() || /^\n[ \t]*\n$/.test(block)) continue;
    if (!block.includes(',') && block.trim().split(/\s+/).length > 8) continue;
    let at = begin;
    for (const part of block.split(/([,\n])/)) {
      const start = at;
      at += part.length;
      if (part === ',' || part === '\n' || part.trim().startsWith('__')) continue;
      const core = singleTagCore(part);
      const key = tagKey(core);
      if (!key) continue;
      const trimmed = part.trim();
      const weight = trimmed.replace(core, '');
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, weight);
        continue;
      }
      const lead = part.length - part.trimStart().length;
      out.push({
        start: start + lead,
        end: start + lead + trimmed.length,
        tag: core,
        line: value.slice(0, start + lead).split('\n').length,
        removable: first === weight,
      });
    }
  }
  return out;
}

/** 去掉能去掉的重复：连同后面的逗号（没有就连同前面的逗号）一起删 */
export function removeTextDuplicates(value: string, list = textDuplicates(value)) {
  let next = value;
  for (const d of [...list].filter((d) => d.removable).sort((a, b) => b.start - a.start)) {
    let start = d.start,
      end = d.end;
    // 前面的空白一起删
    while (start > 0 && /[ \t]/.test(next[start - 1])) start--;
    if (next[end] === ',') end++;
    else if (start > 0 && next[start - 1] === ',') start--;
    // 删的是一行开头的一项：留下的逗号后面的空格也删掉
    if ((start === 0 || next[start - 1] === '\n') && next[end] === ' ') end++;
    next = next.slice(0, start) + next.slice(end);
  }
  return next;
}
