import { parsePrompt, parsePromptPreservingEdits, promptTagRanges } from './prompt.js';
import {
  getPromptScopes,
  normalizePromptStructure,
  formatPositivePromptForCopy,
  positivePromptCopyOptions,
  formatPositiveScopeForCopy,
} from './promptStructure.js';
import {
  overviewCopyContext,
  filterOverviewScopes,
  filterCollapsedAutomaticScopes,
  DEFAULT_OVERVIEW_FILTERS,
} from './promptOverview.js';
import type { GenerationParameters, PromptStructure, Tag, PromptScope } from '../shared/types';

export type BlockType = 'tags' | 'paragraph';
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
}
export type ParsedTag = ReturnType<typeof parsePrompt>[number];
export interface PromptBlock {
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

function makeBlock(raw: string, start: number, options: ParseBlockOptions): PromptBlock {
  const prefix = raw.match(/^\s*/)?.[0] || '';
  const suffix = raw.slice(prefix.length).match(/\s*$/)?.[0] || '';
  const body = raw.slice(prefix.length, raw.length - suffix.length);
  const label = blockLabel(body);
  const labelSpacing = label ? body.slice(label.length).match(/^\s*/)?.[0] || '' : '';
  const content = body.slice(label.length + labelSpacing.length);
  const range = { start, end: start + raw.length };
  const override =
    options.overrides?.find(
      (item) => item.range?.start === range.start && item.range.end === range.end,
    ) ?? options.overrides?.find((item) => item.raw === raw);
  const type = override?.type ?? classifyPromptBlock(content);
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
      blockStart ??= line.index;
      blockEnd = line.index + body.length;
    }
  }
  finish();
  separators.push(source.slice(previousEnd));
  return { blocks, separators };
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
  return replaceBlockContent(section, index, section.blocks[index]?.content ?? '', type);
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

export function editPromptTag(
  section: PromptSection,
  blockIndex: number,
  tagIndex: number,
  edit: { weight: number } | { delete: true },
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
  // Deletion intentionally leaves separators and empty wrappers; the legacy parser ignores them.
  const content = block.content.slice(0, start) + replacement + block.content.slice(end);
  const expected = block.tags.flatMap((item, index) =>
    index === tagIndex ? ('delete' in edit ? [] : [{ ...item, weight: edit.weight }]) : [item],
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

export function createPromptDocument(
  source: PromptDocumentSource,
  overrides: Record<string, readonly BlockTypeOverride[]> = {},
): PromptDocument {
  const structure = normalizePromptStructure(source.prompt_structure, source.metadata);
  const project = {
    ...source,
    prompt_structure: structure,
    tags: source.tags ?? parsePrompt(structure.base_prompt_raw),
  };
  return {
    project,
    scopes: (getPromptScopes(project) as PromptScope[]).map((scope) => ({
      scope,
      ...parsePromptSection(scope.raw_prompt, { overrides: overrides[scope.key] }),
    })),
  };
}

/** Reuse legacy copy policy, deriving edited raw text from blocks; unchanged annotations stay intact. */
export function promptDocumentProject(document: PromptDocument) {
  const structure = normalizePromptStructure(
    document.project.prompt_structure,
    document.project.metadata,
  );
  let tags = document.project.tags;
  for (const section of document.scopes) {
    const raw = serializePromptSection(section);
    const scope = section.scope;
    let nextId = 0;
    const nextTags =
      raw === scope.raw_prompt
        ? scope.tags
        : parsePromptPreservingEdits(raw, scope.tags, () => `${scope.key}:edited:${nextId++}`);
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
  return formatPositiveScopeForCopy(promptDocumentProject(document), key);
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
  const visible = filterCollapsedAutomaticScopes(
    filterOverviewScopes(project, options.filters),
    options.expandedScopeKeys,
  );
  return overviewCopyContext(project, visible, options.selectedKeys);
}
