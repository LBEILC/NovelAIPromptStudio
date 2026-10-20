import { createPromptDocument } from './promptDocument.ts';
import type { ImageProject } from '../shared/types';
export interface VersionChange {
  kind: 'add' | 'rem' | 'w';
  en: string;
  pre: string;
  label: string;
  from?: string;
  to?: string;
}
export interface VersionDiff {
  items: VersionChange[];
  paras: { label: string; old: string; now: string }[];
  size: { from: number[]; to: number[] } | null;
  order: boolean;
  empty: boolean;
}
export function versionDiff(before: ImageProject, after: ImageProject): VersionDiff {
  const a = createPromptDocument(before),
    b = createPromptDocument(after),
    items: VersionChange[] = [],
    paras: VersionDiff['paras'] = [];
  const scopes = (doc: typeof a) =>
    doc.scopes.map((section) => ({
      id: section.scope.key,
      pre:
        section.scope.kind === 'character'
          ? `${section.scope.label} `
          : section.scope.polarity === 'undesired'
            ? '负面 '
            : '',
      tags: section.blocks
        .filter((x) => x.type === 'tags')
        .flatMap((block) =>
          block.tags.map((tag) => ({ tag, label: block.label || section.scope.label })),
        ),
      paragraphs: section.blocks.filter((x) => x.type === 'paragraph'),
    }));
  const A = scopes(a),
    B = scopes(b);
  for (const sb of B) {
    const sa = A.find((x) => x.id === sb.id),
      old = new Map(sa?.tags.map((x) => [x.tag.tag, x]) || []),
      now = new Map(sb.tags.map((x) => [x.tag.tag, x]));
    for (const x of sa?.tags || [])
      if (!now.has(x.tag.tag))
        items.push({ kind: 'rem', en: x.tag.tag, pre: sb.pre, label: x.label });
    for (const x of sb.tags) {
      const o = old.get(x.tag.tag);
      if (!o) items.push({ kind: 'add', en: x.tag.tag, pre: sb.pre, label: x.label });
      else if (o.tag.weight !== x.tag.weight)
        items.push({
          kind: 'w',
          en: x.tag.tag,
          pre: sb.pre,
          label: x.label,
          from: Number(o.tag.weight || 1).toFixed(1),
          to: String(x.tag.weight),
        });
    }
    const count = Math.max(sa?.paragraphs.length || 0, sb.paragraphs.length);
    for (let i = 0; i < count; i++) {
      const old = sa?.paragraphs[i],
        now = sb.paragraphs[i];
      if (old?.content !== now?.content)
        paras.push({
          label: (now?.label || old?.label || '').replace(/[:：]$/, ''),
          old: old?.content || '',
          now: now?.content || '',
        });
    }
  }
  for (const sa of A)
    if (!B.some((x) => x.id === sa.id)) {
      for (const x of sa.tags)
        items.push({ kind: 'rem', en: x.tag.tag, pre: sa.pre, label: x.label });
      for (const x of sa.paragraphs) paras.push({ label: x.label, old: x.content, now: '' });
    }
  const size =
    before.metadata.width !== after.metadata.width ||
    before.metadata.height !== after.metadata.height
      ? {
          from: [before.metadata.width, before.metadata.height],
          to: [after.metadata.width, after.metadata.height],
        }
      : null;
  const sequence = (p: ImageProject) =>
    JSON.stringify([
      p.metadata.prompt_raw,
      p.metadata.negative_prompt,
      p.prompt_structure.characters.map((c) => [c.prompt_raw, c.undesired_raw]),
    ]);
  const order = !items.length && !paras.length && !size && sequence(before) !== sequence(after);
  return { items, paras, size, order, empty: !items.length && !paras.length && !size && !order };
}
export const changeText = (x: VersionChange) =>
  x.kind === 'w'
    ? `${x.pre}${x.en} ${x.from}→${x.to}`
    : `${x.pre}${x.kind === 'add' ? '+' : '−'}${x.en}`;
const width = (text: string) =>
  [...text].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
function fitCount(items: VersionChange[], lines: number, cols = 27) {
  const tail = width(`等 ${items.length} 处`) + 1;
  for (let k = items.length; k > 1; k--) {
    let line = 1,
      col = 0;
    for (let i = 0; i < k; i++) {
      const w = Math.min(width(changeText(items[i])), cols);
      if (col && col + 1 + w > cols) {
        line++;
        col = w;
      } else col = col ? col + 1 + w : w;
    }
    if (k < items.length && col + tail > cols) line++;
    if (line <= lines) return k;
  }
  return 1;
}
const paragraphText = (d: VersionDiff) =>
  d.paras.length === 1 && d.paras[0].label
    ? `改写了“${d.paras[0].label}”段落`
    : `改写了 ${d.paras.length} 个段落`;
const sizeText = (d: VersionDiff) =>
  d.size ? `尺寸 ${d.size.from.join('×')}→${d.size.to.join('×')}` : '';
function tags(d: VersionDiff, lines: number, cols = 27) {
  const k = fitCount(d.items, lines, cols);
  return (
    d.items.slice(0, k).map(changeText).join(' ') +
    (k < d.items.length ? ` 等 ${d.items.length} 处` : '')
  );
}
export function diffSummary(d: VersionDiff) {
  const para = d.paras.length ? paragraphText(d) : '',
    sz = sizeText(d),
    head = sz && para && d.items.length ? `${sz} · ${para}` : sz,
    tail = head.includes(para) ? '' : para;
  if (!d.items.length)
    return [head, tail].filter(Boolean).join('\n') || (d.order ? '调整了顺序' : '');
  return [head, tags(d, 2 - (head ? 1 : 0) - (tail ? 1 : 0) || 1), tail].filter(Boolean).join('\n');
}
export function oneLine(d: VersionDiff) {
  return (
    sizeText(d) ||
    (d.items.length
      ? tags(d, 1, 23)
      : d.paras.length
        ? paragraphText(d)
        : d.order
          ? '调整了顺序'
          : '没有改动')
  );
}
