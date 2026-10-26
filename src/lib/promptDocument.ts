import {
  randomMarkers,
  parseRandomMarker,
  randomSyntaxNote,
  type RandomOptions,
} from './randomPrompt.ts';
import { parsePrompt, parsePromptPreservingEdits, promptTagRanges, formatTag } from './prompt.js';
import {
  getPromptScopes,
  promptForTransmission,
  normalizePromptStructure,
  formatPositivePromptForCopy,
  positivePromptCopyOptions,
} from './promptStructure.js';
import {
  overviewCopyContext,
  overviewEntries,
  filterOverviewScopes,
  filterCollapsedAutomaticScopes,
  DEFAULT_OVERVIEW_FILTERS,
} from './promptOverview.js';
import type {
  GenerationParameters,
  PromptStructure,
  Tag,
  PromptScope,
  PromptAutomation,
} from '../shared/types';

export type BlockType = 'tags' | 'paragraph' | 'random';
/** Half-open UTF-16 offsets, suitable for String.slice (not encoded byte offsets). */
export interface TextRange {
  start: number;
  end: number;
}
export interface BlockTypeOverride {
  type: BlockType;
  raw?: string;
  range?: TextRange;
}
export interface ParseBlockOptions {
  overrides?: readonly BlockTypeOverride[];
  createId?: () => string;
  pools?: readonly { name: string; entries?: import('./randomPrompt').PoolEntry[] }[];
  negative?: boolean;
}
export type ParsedTag = ReturnType<typeof parsePrompt>[number];
export interface PromptBlock {
  random?: RandomOptions;
  syntaxNote?: string;
  textLayout?: boolean;
  displayLabel?: string;
  userType?: boolean;
  translation?: string;
  type: BlockType;
  range: TextRange;
  raw: string;
  label: string;
  /** Exact whitespace before the label, after it, and after content. */
  prefix: string;
  labelSpacing: string;
  suffix: string;
  content: string;
  contentRange: TextRange;
  tags: ParsedTag[];
}
export interface PromptSection {
  blocks: PromptBlock[];
  /** N + 1 exact separators: before, between, and after N blocks. */
  separators: string[];
}

export const MAX_BLOCK_LABEL_CHARACTERS = 32;
export const MAX_TAG_PHRASE_WORDS = 12;
export const MAX_TAG_PHRASE_CHARACTERS = 100;
export const MIN_SENTENCE_CLAUSE_WORDS = 8;
export const MIN_PARAGRAPH_HAN_CHARACTERS = 16;
export const MIN_PARAGRAPH_HAN_CHARACTERS_PER_ITEM = 4;
export const MIN_PARAGRAPH_FUNCTION_WORD_ITEMS = 3;
export const MIN_PARAGRAPH_FUNCTION_WORD_RATIO = 0.3;
export const MIN_LONG_TAG_LIST_ITEMS = 20;
export const MAX_LONG_TAG_LIST_OUTLIER_RATIO = 0.1;
export const MIN_LONG_TAG_LIST_ALLOWED_OUTLIERS = 1;
export const MAX_LONG_TAG_LIST_ITEM_WORDS = MAX_TAG_PHRASE_WORDS * 2;
export const MAX_LONG_TAG_LIST_FUNCTION_WORD_RATIO = 0.2;
const ENGLISH_FUNCTION_WORDS =
  /\b(?:a|an|the|she|he|her|his|him|they|them|their|it|its|i|my|we|our|you|your|is|are|was|were)\b/i;

function blockLabel(content: string): string {
  const angle = content.match(/^<[\p{L}][\p{L}\p{N}_ -]*>/u)?.[0];
  if (angle && angle.length <= MAX_BLOCK_LABEL_CHARACTERS) return angle;
  // A single colon followed by whitespace avoids artist:xxx, rating:general and numeric weights.
  const colon = content.match(/^([\p{L}][\p{L}\p{N}_ -]*):(?!:)(?=\s|$)/u);
  if (!colon || /^(artist|rating|text)$/i.test(colon[1])) return '';
  return colon[0].length <= MAX_BLOCK_LABEL_CHARACTERS ? colon[0] : '';
}

export function classifyPromptBlock(content: string): BlockType {
  // Weight groups count as one item regardless of the number of inner commas.
  const items = content.replace(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)::[\s\S]*?::/g, 'weighted_group');
  const commaItems = items
    .split(/[,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const hanCharacters = (content.match(/\p{Script=Han}/gu) || []).length;
  const functionWordItems = commaItems.filter((item) => ENGLISH_FUNCTION_WORDS.test(item)).length;
  if (
    commaItems.length >= MIN_LONG_TAG_LIST_ITEMS &&
    commaItems.every((item) => item.split(/\s+/).length <= MAX_LONG_TAG_LIST_ITEM_WORDS) &&
    hanCharacters < MIN_PARAGRAPH_HAN_CHARACTERS &&
    functionWordItems < commaItems.length * MAX_LONG_TAG_LIST_FUNCTION_WORD_RATIO
  ) {
    const outliers = commaItems.filter((item) => {
      const words = item.split(/\s+/).length;
      return (
        words > MAX_TAG_PHRASE_WORDS ||
        item.length > MAX_TAG_PHRASE_CHARACTERS ||
        (/[.!?。！？](?:["'”’)]|\s|$)/.test(item) && words >= MIN_SENTENCE_CLAUSE_WORDS)
      );
    }).length;
    if (
      outliers <=
      Math.max(
        MIN_LONG_TAG_LIST_ALLOWED_OUTLIERS,
        Math.floor(commaItems.length * MAX_LONG_TAG_LIST_OUTLIER_RATIO),
      )
    )
      return 'tags';
  }
  const hanItemCounts = commaItems
    .map((item) => (item.match(/\p{Script=Han}/gu) || []).length)
    .filter((count) => count > 0);
  if (
    (hanCharacters >= MIN_PARAGRAPH_HAN_CHARACTERS &&
      hanItemCounts.length > 0 &&
      hanItemCounts.reduce((sum, count) => sum + count, 0) >=
        hanItemCounts.length * MIN_PARAGRAPH_HAN_CHARACTERS_PER_ITEM) ||
    (functionWordItems >= MIN_PARAGRAPH_FUNCTION_WORD_ITEMS &&
      functionWordItems >= commaItems.length * MIN_PARAGRAPH_FUNCTION_WORD_RATIO)
  )
    return 'paragraph';
  const phrases = items
    .split(/[,，\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const hanClauses = items.split(/[,，\r\n。！？!?]/);
  if (
    (/[。！？]/.test(items) &&
      (items.match(/\p{Script=Han}/gu) || []).length >= MIN_PARAGRAPH_HAN_CHARACTERS) ||
    hanClauses.some(
      (clause) => (clause.match(/\p{Script=Han}/gu) || []).length >= MIN_PARAGRAPH_HAN_CHARACTERS,
    )
  )
    return 'paragraph';
  if (
    phrases.some(
      (phrase) =>
        /[.!?。！？](?:["'”’)]|\s|$)/.test(phrase) &&
        phrase.split(/\s+/).length >= MIN_SENTENCE_CLAUSE_WORDS,
    )
  )
    return 'paragraph';
  if (
    phrases.length &&
    phrases.every(
      (phrase) =>
        phrase.length <= MAX_TAG_PHRASE_CHARACTERS &&
        phrase.split(/\s+/).length <= MAX_TAG_PHRASE_WORDS,
    )
  )
    return 'tags';
  return 'paragraph';
}

const CLOSING_LINE = /^\s*<\/[\p{L}][\p{L}\p{N}_ -]*>\s*$/u;
function makeBlock(raw: string, start: number, options: ParseBlockOptions): PromptBlock {
  const prefix = raw.match(/^\s*/)?.[0] || '';
  const trailing = raw.slice(prefix.length).match(/\s*$/)?.[0] || '';
  const body = raw.slice(prefix.length, raw.length - trailing.length);
  const label = blockLabel(body);
  // 块名是 <artist> 时，结尾配对的 </artist> 算块的结尾标记，不当成 Tag；原文一个字节都不改
  let closing = '';
  const tag = label.startsWith('<') ? `</${label.slice(1)}` : '';
  if (tag && body.length >= label.length + tag.length && body.endsWith(tag)) {
    let at = body.length - tag.length;
    while (at > label.length && /\s/.test(body[at - 1])) at--;
    closing = body.slice(at);
  }
  const suffix = closing + trailing;
  const inner = body.slice(0, body.length - closing.length);
  const labelSpacing = label ? inner.slice(label.length).match(/^\s*/)?.[0] || '' : '';
  const content = inner.slice(label.length + labelSpacing.length);
  const range = { start, end: start + raw.length };
  const override =
    options.overrides?.find(
      (item) => item.range?.start === range.start && item.range.end === range.end,
    ) ?? options.overrides?.find((item) => item.raw === raw);
  const marker = content.startsWith('__');
  const type = marker
    ? options.negative
      ? 'paragraph'
      : 'random'
    : (override?.type ?? classifyPromptBlock(content));
  const syntaxNote = marker
    ? randomSyntaxNote(content, options.pools, options.negative)
    : undefined;
  const contentStart = start + prefix.length + label.length + labelSpacing.length;
  return {
    type,
    range,
    raw,
    prefix,
    suffix,
    label,
    labelSpacing,
    content,
    ...(marker
      ? { syntaxNote, ...(!syntaxNote ? { random: parseRandomMarker(content) } : {}) }
      : {}),
    contentRange: { start: contentStart, end: contentStart + content.length },
    tags: type === 'tags' ? parsePrompt(content, options.createId) : [],
  };
}

export function parsePromptSection(source: string, options: ParseBlockOptions = {}): PromptSection {
  const blocks: PromptBlock[] = [];
  const separators: string[] = [];
  // Split physical lines first so lone CR and whitespace-only edge lines are lossless too.
  const lines = [...source.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)].filter((line) => line[0]);
  let blockStart: number | undefined;
  let blockEnd = 0;
  let previousEnd = 0;
  const finish = () => {
    if (blockStart === undefined) return;
    separators.push(source.slice(previousEnd, blockStart));
    blocks.push(makeBlock(source.slice(blockStart, blockEnd), blockStart, options));
    previousEnd = blockEnd;
    blockStart = undefined;
  };
  for (const line of lines) {
    const body = line[0].replace(/(?:\r\n|\r|\n)$/, '');
    if (!body.trim()) finish();
    else {
      const closes = blockStart !== undefined && CLOSING_LINE.test(body);
      blockStart ??= line.index;
      blockEnd = line.index + body.length;
      // 单独一行的 </artist> 结束这一块（社区常见的 <artist>…</artist> 写法，后面不空行也另起一块）
      if (closes) finish();
    }
  }
  finish();
  separators.push(source.slice(previousEnd));
  const split: PromptBlock[] = [];
  for (const block of blocks) {
    const markers = randomMarkers(block.raw);
    if (!markers.length) {
      split.push(block);
      continue;
    }
    let at = 0;
    for (const marker of markers) {
      if (marker.index! > at)
        split.push(makeBlock(block.raw.slice(at, marker.index), block.range.start + at, options));
      split.push(
        makeBlock(marker[0], block.range.start + marker.index!, {
          pools: options.pools,
          negative: options.negative,
        }),
      );
      at = marker.index! + marker[0].length;
    }
    if (at < block.raw.length)
      split.push(makeBlock(block.raw.slice(at), block.range.start + at, options));
  }
  return {
    blocks: split,
    separators: split.length
      ? [
          source.slice(0, split[0].range.start),
          ...split.map((b, i) =>
            source.slice(b.range.end, split[i + 1]?.range.start ?? source.length),
          ),
        ]
      : [source],
  };
}

export function serializePromptSection(section: PromptSection): string {
  return section.blocks.reduce(
    (text, block, index) => text + block.raw + section.separators[index + 1],
    section.separators[0],
  );
}

/** Immutable edits; all ranges are rebased and explicit block types survive edits. */
function replaceBlockContent(
  section: PromptSection,
  index: number,
  content: string,
  type?: BlockType,
): PromptSection {
  if (!section.blocks[index]) throw new RangeError('Unknown prompt block');
  let offset = section.separators[0].length;
  const blocks = section.blocks.map((block, cursor) => {
    const nextContent = cursor === index ? content : block.content;
    const raw = block.prefix + block.label + block.labelSpacing + nextContent + block.suffix;
    const nextType = cursor === index ? (type ?? block.type) : block.type;
    const contentStart =
      offset + block.prefix.length + block.label.length + block.labelSpacing.length;
    const next = {
      ...block,
      type: nextType,
      raw,
      content: nextContent,
      range: { start: offset, end: offset + raw.length },
      contentRange: { start: contentStart, end: contentStart + nextContent.length },
      tags: nextType === 'tags' ? (cursor === index ? parsePrompt(nextContent) : block.tags) : [],
    };
    offset += raw.length + section.separators[cursor + 1].length;
    return next;
  });
  return { blocks, separators: [...section.separators] };
}

export function setPromptBlockType(
  section: PromptSection,
  index: number,
  type: BlockType,
): PromptSection {
  if (section.blocks[index]?.type === 'random') throw new TypeError('随机块不能改为普通块');
  const next = replaceBlockContent(section, index, section.blocks[index]?.content ?? '', type);
  return {
    ...next,
    blocks: next.blocks.map((block, i) => (i === index ? { ...block, userType: true } : block)),
  };
}

export function editPromptParagraph(
  section: PromptSection,
  index: number,
  content: string,
): PromptSection {
  if (section.blocks[index]?.type !== 'paragraph')
    throw new TypeError('Expected a paragraph block');
  return replaceBlockContent(section, index, content);
}

/** Replace only the chosen block content, retaining surrounding bytes and its chosen type. */
export function editPromptBlockText(
  section: PromptSection,
  index: number,
  content: string,
): PromptSection {
  if (section.blocks[index]?.type === 'random' || randomMarkers(content).length) {
    const block = section.blocks[index];
    if (!block) throw new RangeError('Unknown prompt block');
    const raw = serializePromptSection(section);
    return parsePromptSection(
      raw.slice(0, block.contentRange.start) + content + raw.slice(block.contentRange.end),
      {
        overrides: section.blocks
          .filter((b) => b.userType && b.type !== 'random')
          .map((b) => ({ raw: b.raw, type: b.type })),
      },
    );
  }
  return replaceBlockContent(section, index, content);
}

function decimalWeight(value: number): string {
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const [mantissa, power] = text.toLowerCase().split('e');
  const sign = mantissa.startsWith('-') ? '-' : '';
  const unsigned = mantissa.replace(/^-/, '');
  const digits = unsigned.replace('.', '');
  const decimal =
    (unsigned.indexOf('.') < 0 ? unsigned.length : unsigned.indexOf('.')) + Number(power);
  return (
    sign +
    (decimal <= 0
      ? '0.' + '0'.repeat(-decimal) + digits
      : decimal >= digits.length
        ? digits + '0'.repeat(decimal - digits.length)
        : digits.slice(0, decimal) + '.' + digits.slice(decimal))
  );
}

/**
 * 删除、移动、插入 Tag 以后收拾文本：合并连续的逗号、去掉开头和多出来的结尾逗号、去掉变空的权重组和括号、
 * 去掉组结尾前多出的空格。不改其余写法。original 是改之前的内容，用来判断原来末尾有没有逗号
 */
export function tidyTagSeparators(content: string, original: string) {
  let s = content,
    last = '';
  while (s !== last) {
    last = s;
    s = s
      .replace(/(^|[\s,{[(])-?\d+(?:\.\d+)?::[\s,]*::/g, '$1') // 空的权重组
      .replace(/\{[\s,]*\}|\[[\s,]*\]/g, '') // 空括号
      .replace(/((?:^|[\s,{[])-?\d+(?:\.\d+)?::)\s*,\s*/g, '$1') // 组开头紧跟的逗号
      .replace(/([{[])\s*,\s*/g, '$1')
      .replace(/,\s*(::)(?=\s*(?:,|$))/g, '$1') // 组结尾前的逗号
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/,(\s*\n[ \t]*),[ \t]*/g, ',$1') // 跨行的空项，保留换行
      .replace(/,[ \t]*(?=,)/g, '') // 同一行的空项
      .replace(/^\s*,[ \t]*/, '');
  }
  if (!/,\s*$/.test(original)) s = s.replace(/[\s,]*,\s*$/, '');
  return s;
}
export function editPromptTag(
  section: PromptSection,
  blockIndex: number,
  tagIndex: number,
  edit: { weight: number } | { delete: true } | { tag: string },
): PromptSection {
  const block = section.blocks[blockIndex];
  if (block?.type !== 'tags') throw new TypeError('Expected a tag block');
  const ranges = promptTagRanges(block.content);
  const range = ranges[tagIndex];
  const tag = block.tags[tagIndex];
  if (!range || !tag) throw new RangeError('Unknown prompt tag');
  let start = range.start;
  let end = range.end;
  let replacement = '';
  if ('tag' in edit) replacement = edit.tag;
  if ('weight' in edit) {
    if (!Number.isFinite(edit.weight)) throw new TypeError('Expected a finite weight');
    if (edit.weight === tag.weight) return section;
    const weight = decimalWeight(edit.weight);
    const outerWeight = range.wrappers.find((wrapper) => wrapper.kind === 'weight');
    if (
      outerWeight &&
      ranges.filter((item) => item.start >= outerWeight.start && item.end <= outerWeight.end)
        .length === 1
    ) {
      start = outerWeight.start;
      end = start + outerWeight.open.length - 2;
      replacement = weight;
    } else if (outerWeight) {
      // Split shared wrappers around this leaf. Unchanged leaves and their whitespace are untouched.
      const wrappers = range.wrappers.slice(range.wrappers.indexOf(outerWeight));
      const close = [...wrappers]
        .reverse()
        .map((wrapper) => wrapper.close)
        .join('');
      const open = wrappers.map((wrapper) => wrapper.open).join('');
      const braces = wrappers.filter((wrapper) => wrapper.kind === 'brace');
      replacement =
        close +
        ', ' +
        weight +
        '::' +
        braces.map((wrapper) => wrapper.open).join('') +
        tag.tag +
        [...braces]
          .reverse()
          .map((wrapper) => wrapper.close)
          .join('') +
        '::, ' +
        open;
    } else {
      replacement = `${weight}::${tag.tag}::`;
    }
  }
  const spliced = block.content.slice(0, start) + replacement + block.content.slice(end);
  // 删掉以后收拾留下的分隔符和空的权重组、括号（用户 10-21：拖动 Tag 后会留下 ", ,"）
  const content = 'delete' in edit ? tidyTagSeparators(spliced, block.content) : spliced;
  const expected = block.tags.flatMap((item, index) =>
    index === tagIndex
      ? 'delete' in edit
        ? []
        : ['tag' in edit ? { ...item, tag: edit.tag } : { ...item, weight: edit.weight }]
      : [item],
  );
  const actual = parsePrompt(content);
  // Malformed control tokens sometimes cannot be reweighted in the legacy grammar.
  // Fail atomically rather than silently reinterpret a neighboring leaf.
  if (
    actual.length !== expected.length ||
    actual.some(
      (item, index) =>
        item.tag !== expected[index].tag ||
        item.weight !== expected[index].weight ||
        item.brace_depth !== expected[index].brace_depth,
    )
  ) {
    throw new RangeError('This edit cannot preserve the surrounding prompt syntax');
  }
  return replaceBlockContent(section, blockIndex, content);
}

export interface PromptDocumentScope extends PromptSection {
  scope: PromptScope;
}
export interface PromptDocumentSource {
  metadata?: Partial<GenerationParameters>;
  prompt_structure?: Partial<PromptStructure> | string | null;
  tags?: Tag[];
}
export interface PromptDocument {
  scopes: PromptDocumentScope[];
  /** Compatibility context: annotations, character positions and automatic-tag settings. */
  project: PromptDocumentSource;
}

/**
 * 同一节里重复的 Tag id 换成新的（1.5.0 及以前，新加的 Tag 按位置编号，几次编辑后会撞号；
 * 撞号会让界面上的 Tag 对不上号、乱跳）。新 id 由原 id 派生，同一份数据每次得到同样的结果，保存时写回去。
 */
function uniqueTagIds<T extends { tags: { id?: string }[] }>(scope: T): T {
  const seen = new Set<string>();
  let changed = false;
  const tags = scope.tags.map((tag) => {
    if (!tag?.id || !seen.has(tag.id)) {
      if (tag?.id) seen.add(tag.id);
      return tag;
    }
    changed = true;
    let n = 1,
      id = '';
    do id = `${tag.id}~${n++}`;
    while (seen.has(id));
    seen.add(id);
    return { ...tag, id };
  });
  return changed ? { ...scope, tags } : scope;
}

export function createPromptDocument(
  source: PromptDocumentSource,
  overrides: Record<string, readonly BlockTypeOverride[]> = {},
  pools?: ParseBlockOptions['pools'],
): PromptDocument {
  const structure = normalizePromptStructure(source.prompt_structure, source.metadata);
  const project = {
    ...source,
    prompt_structure: structure,
    tags: source.tags ?? parsePrompt(structure.base_prompt_raw),
  };
  return {
    project,
    scopes: (getPromptScopes(project) as PromptScope[]).map(uniqueTagIds).map((scope) => {
      const section = parsePromptSection(scope.raw_prompt, {
        overrides: overrides[scope.key],
        pools,
        negative: scope.polarity === 'undesired',
      });
      const annotations = [...(structure.block_annotations?.[scope.key] || [])];
      section.blocks = section.blocks.map((block) => {
        let index = annotations.findIndex(
          (entry) => entry.raw === block.raw && entry.start === block.range.start,
        );
        if (index < 0) index = annotations.findIndex((entry) => entry.raw === block.raw);
        if (index < 0) return block;
        const [entry] = annotations.splice(index, 1);
        return {
          ...block,
          ...(entry.type && block.type !== 'random' && !block.syntaxNote
            ? {
                type: entry.type,
                userType: true,
                tags: entry.type === 'tags' ? parsePrompt(block.content) : [],
              }
            : {}),
          translation: entry.translation,
          displayLabel: entry.displayLabel,
          textLayout: entry.textLayout,
        };
      });
      return { scope, ...section };
    }),
  };
}

/** Reuse legacy copy policy, deriving edited raw text from blocks; unchanged annotations stay intact. */
export function promptDocumentProject(document: PromptDocument) {
  const structure = normalizePromptStructure(
    document.project.prompt_structure,
    document.project.metadata,
  );
  let tags = document.project.tags;
  const annotations: NonNullable<PromptStructure['block_annotations']> = {};
  for (const section of document.scopes) {
    const saved = section.blocks
      .filter(
        (block) => block.userType || block.translation || block.displayLabel || block.textLayout,
      )
      .map((block) => ({
        raw: block.raw,
        ...(block.textLayout ? { textLayout: true } : {}),
        ...(block.displayLabel ? { displayLabel: block.displayLabel } : {}),
        start: block.range.start,
        ...(block.userType ? { type: block.type } : {}),
        ...(block.translation ? { translation: block.translation } : {}),
      }));
    if (saved.length) annotations[section.scope.key] = saved;
    const raw = serializePromptSection(section);
    const scope = section.scope;
    let nextId = 0;
    // 新 Tag 的 id 跳过这一节已经用掉的：每次编辑都从 0 数，会和上次编辑新加的撞号
    const used = new Set(scope.tags.map((tag: { id?: string }) => tag.id));
    const createId = () => {
      let id = '';
      do id = `${scope.key}:edited:${nextId++}`;
      while (used.has(id));
      used.add(id);
      return id;
    };
    const nextTags =
      raw === scope.raw_prompt ? scope.tags : parsePromptPreservingEdits(raw, scope.tags, createId);
    if (scope.kind === 'base') {
      if (scope.polarity === 'prompt') {
        structure.base_prompt_raw = raw;
        tags = nextTags as typeof tags;
      } else {
        structure.base_undesired_raw = raw;
        structure.base_undesired_tags = nextTags;
      }
    } else {
      const character = structure.characters.find(
        (item: { id: string }) => item.id === scope.characterId,
      );
      if (character) {
        character[scope.polarity === 'prompt' ? 'prompt_raw' : 'undesired_raw'] = raw;
        character[scope.polarity === 'prompt' ? 'prompt_tags' : 'undesired_tags'] = nextTags;
      }
    }
  }
  if (Object.keys(annotations).length) structure.block_annotations = annotations;
  else delete structure.block_annotations;
  return { ...document.project, tags, prompt_structure: structure };
}

export function copyPromptDocument(
  document: PromptDocument,
  options: { includeAutomatic?: boolean } = {},
) {
  return formatPositivePromptForCopy(promptDocumentProject(document), options);
}
export function promptDocumentCopyOptions(
  document: PromptDocument,
  options: { includeAutomatic?: boolean } = {},
) {
  return positivePromptCopyOptions(promptDocumentProject(document), options);
}
export function copyPromptDocumentScope(document: PromptDocument, key: string) {
  const section = document.scopes.find((section) => section.scope.key === key);
  return section
    ? promptForTransmission(
        ['confirmed', 'inferred'].includes(section.scope.automation?.status || '')
          ? section.scope.automation!.cleanedRaw
          : serializePromptSection(section),
        promptDocumentProject(document),
        key,
      )
    : '';
}
/** Visible/selected entries retain the established category ordering and automatic/negative exclusions. */
export function copyVisiblePromptDocument(
  document: PromptDocument,
  options: {
    filters?: typeof DEFAULT_OVERVIEW_FILTERS;
    expandedScopeKeys?: string[];
    selectedKeys?: string[];
  } = {},
) {
  const project = promptDocumentProject(document);
  const filters = { ...DEFAULT_OVERVIEW_FILTERS, ...options.filters };
  // A filter is a view of the block document: prose must not be flattened into
  // comma-separated pseudo tags, and a fully visible block keeps its raw text.
  if (
    !options.selectedKeys?.length &&
    (filters.query ||
      filters.category !== 'All' ||
      filters.polarity !== 'all' ||
      filters.domain !== 'all')
  ) {
    type CopyEntry = {
      key: string;
      scopeKey: string;
      scopePolarity: string;
      tag: Tag;
      automation: PromptAutomation | null;
    };
    const all: CopyEntry[] = overviewEntries(getPromptScopes(project));
    const visibleKeys = new Set(
      overviewEntries(
        filterCollapsedAutomaticScopes(
          filterOverviewScopes(project, filters),
          options.expandedScopeKeys,
        ),
      ).map((entry: CopyEntry) => entry.key),
    );
    const parts = document.scopes.flatMap((section) => {
      if (
        (filters.polarity !== 'all' && filters.polarity !== section.scope.polarity) ||
        (filters.domain !== 'all' && filters.domain !== section.scope.kind)
      )
        return [];
      const ranges = promptTagRanges(serializePromptSection(section));
      return section.blocks.flatMap((block) => {
        if (block.type === 'paragraph' || block.type === 'random') {
          if (
            filters.category !== 'All' ||
            !`${block.content}\n${block.translation || ''}`
              .toLocaleLowerCase()
              .includes(filters.query.trim().toLocaleLowerCase())
          )
            return [];
          return [
            {
              polarity: section.scope.polarity,
              scope: section.scope.key,
              text: block.raw,
              entries: [] as typeof all,
            },
          ];
        }
        const local = promptTagRanges(block.content);
        const entries = local.flatMap((range) => {
          const tag =
            section.scope.tags[
              ranges.findIndex((item) => item.start === block.contentRange.start + range.start)
            ];
          const entry = all.find(
            (item) => item.scopeKey === section.scope.key && item.tag.id === tag?.id,
          );
          return entry &&
            visibleKeys.has(entry.key) &&
            !['confirmed', 'inferred'].includes(entry.automation?.status || '')
            ? [entry]
            : [];
        });
        if (!entries.length) return [];
        return [
          {
            polarity: section.scope.polarity,
            scope: section.scope.key,
            text:
              entries.length === block.tags.length
                ? block.raw
                : entries.map((entry) => formatTag(entry.tag)).join(', '),
            entries,
          },
        ];
      });
    });
    const polarity = parts.some((part) => part.polarity === 'prompt') ? 'prompt' : 'undesired';
    const copied = parts.filter((part) => part.polarity === polarity);
    const entries = copied.flatMap((part) => part.entries);
    const scopes = [...new Set(copied.map((part) => part.scope))];
    return {
      text: scopes
        .map((scope) =>
          copied
            .filter((part) => part.scope === scope)
            .map((part) => part.text)
            .join('\n\n'),
        )
        .join(polarity === 'prompt' ? '\n|\n' : '\n'),
      count: entries.length,
      ignored: parts
        .filter((part) => part.polarity !== polarity)
        .reduce((sum, part) => sum + part.entries.length, 0),
      automaticIgnored: all.filter(
        (entry) =>
          visibleKeys.has(entry.key) &&
          entry.scopePolarity === polarity &&
          ['confirmed', 'inferred'].includes(entry.automation?.status || ''),
      ).length,
      selected: false,
      categoryCount: 0,
      entries,
    };
  }
  const visible = filterCollapsedAutomaticScopes(
    filterOverviewScopes(project, options.filters),
    options.expandedScopeKeys,
  );
  const selected = new Set(options.selectedKeys || []);
  const allEntries: {
    key: string;
    scopePolarity: string;
    tag: Tag;
    automation: PromptAutomation | null;
  }[] = overviewEntries(selected.size ? getPromptScopes(project) : visible);
  const entries = allEntries.filter((entry) => !selected.size || selected.has(entry.key));
  if (entries.length && entries.every((entry) => entry.scopePolarity === 'undesired')) {
    const copyable = entries.filter(
      (entry) => !['confirmed', 'inferred'].includes(entry.automation?.status || ''),
    );
    return {
      text: copyable.map((entry) => formatTag(entry.tag)).join(', '),
      count: copyable.length,
      ignored: 0,
      automaticIgnored: entries.length - copyable.length,
      selected: selected.size > 0,
      categoryCount: 0,
      entries: copyable,
    };
  }
  return overviewCopyContext(project, visible, options.selectedKeys);
}
