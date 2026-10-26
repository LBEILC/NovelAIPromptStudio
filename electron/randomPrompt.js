import crypto from 'node:crypto';
import { syncProjectPromptMetadata } from '../src/lib/promptStructure.js';
import {
  randomMarkers,
  randomMarkerPattern,
  parseRandomMarker,
  randomSyntaxNote,
} from '../src/lib/randomPrompt.ts';
import {
  classifyPromptBlock,
  parsePromptSection,
  serializePromptSection,
  createPromptDocument,
  promptDocumentProject,
} from '../src/lib/promptDocument.ts';

const random = () => crypto.randomInt(0, 0x100000000) / 0x100000000;
export function drawRandomText(source, pools, scope, rng = random) {
  const blocks = [];
  const text = source.replace(randomMarkerPattern(), (marker, start) => {
    const error = randomSyntaxNote(marker, pools, scope.endsWith(':undesired'));
    if (error) throw new Error(error);
    const options = parseRandomMarker(marker);
    const available = [...pools.find((p) => p.name === options.pool).entries];
    const entries = [];
    for (let n = 0; n < options.count; n++) {
      // Normalize first to avoid overflow when valid chances are very large.
      const max = available.reduce((value, entry) => Math.max(value, entry.chance), 0);
      const total = available.reduce((sum, e) => sum + e.chance / max, 0);
      let value = rng() * total;
      let index = available.findIndex((e) => (value -= e.chance / max) < 0);
      if (index < 0) index = available.length - 1;
      const entry = available[index];
      // TODO(design): 池条目中的随机记号暂不递归展开，待明确嵌套规则。
      if (randomMarkers(entry.text).length) throw new Error('随机池条目不能嵌套随机块');
      if (!options.repeat) available.splice(index, 1);
      const weights = [];
      const rendered = options.weight
        ? weightText(entry.text, options.weight, rng, weights)
        : entry.text;
      entries.push({
        id: entry.id,
        text: entry.text,
        rendered,
        ...(weights.length ? { weights } : {}),
      });
    }
    const text = entries.map((e) => e.rendered).join(', ');
    blocks.push({ source: marker, pool: options.pool, scope, start, entries, text });
    return text;
  });
  if (text.includes('__')) throw new Error('随机块格式不正确');
  return { text, blocks };
}
function weightText(text, range, rng, weights) {
  const apply = (part) => {
    if (!part.trim()) return part;
    const weight = Number(
      (
        range.min +
        Math.floor(rng() * (Math.floor((range.max - range.min + 1e-9) / range.step) + 1)) *
          range.step
      ).toFixed(8),
    );
    weights.push({ text: part.trim(), weight });
    return weight === 1
      ? part
      : `${part.match(/^\s*/)[0]}${weight}::${part.trim()}::${part.match(/\s*$/)[0]}`;
  };
  // Keep explicit weight groups verbatim, including nested braces and brackets.
  const paragraph = classifyPromptBlock(text) === 'paragraph';
  let at = 0,
    result = '';
  const plain = (s) =>
    paragraph
      ? apply(s)
      : s
          .split(/(,\s*)/)
          .map((part, i) => (i % 2 ? part : apply(part)))
          .join('');
  for (let cursor = 0; cursor < text.length; cursor++) {
    const numeric = text.slice(cursor).match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)::/);
    let end;
    if (numeric) {
      const close = text.indexOf('::', cursor + numeric[0].length);
      end = close < 0 ? text.length : close + 2;
    } else if (text[cursor] === '{' || text[cursor] === '[') {
      const stack = [text[cursor] === '{' ? '}' : ']'];
      end = cursor + 1;
      while (end < text.length && stack.length) {
        const ch = text[end++];
        if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
        else if (ch === stack.at(-1)) stack.pop();
      }
    }
    if (end === undefined) continue;
    result += plain(text.slice(at, cursor)) + text.slice(cursor, end);
    at = end;
    cursor = end - 1;
  }
  return result + plain(text.slice(at));
}
export function resolveRandomProject(project, pools, rng) {
  const doc = createPromptDocument(project);
  const record = { blocks: [] };
  for (const section of doc.scopes) {
    const result = drawRandomText(serializePromptSection(section), pools, section.scope.key, rng);
    record.blocks.push(...result.blocks);
    if (result.blocks.length) Object.assign(section, parsePromptSection(result.text));
  }
  if (!record.blocks.length) return { project, record };
  const resolved = promptDocumentProject(doc);
  resolved.prompt_structure.block_annotations = project.prompt_structure?.block_annotations;
  return { project: syncProjectPromptMetadata(resolved), record };
}
