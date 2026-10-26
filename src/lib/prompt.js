export const CATEGORY_OPTIONS = [
  'ArtistEra',
  'Subject',
  'Identity',
  'Body',
  'Clothing',
  'Action',
  'Environment',
  'Composition',
  'StyleQuality',
  'Unsorted',
];
export const CATEGORY_LABELS = {
  ArtistEra: '画师年代',
  Subject: '角色组成',
  Identity: '身份物种',
  Body: '外貌身体',
  Clothing: '服装配饰',
  Action: '动作表情',
  Environment: '环境背景',
  Composition: '镜头光影',
  StyleQuality: '风格质量',
  Unsorted: '未分类',
};

const categoryRules = [
  [
    'ArtistEra',
    /(?:^|[\s{[(,:])(?:artist\s*[:_]|by\s+artist\b|artist\b)|\byear\s*\d{4}\b|\b(?:19|20)\d0s\s*\(style\)/i,
  ],
  [
    'Subject',
    /\b(?:\d+girls?|\d+boys?|\d+others?|girl|boy|woman|man|male|female|other|solo|multiple girls|multiple boys)\b/i,
  ],
  [
    'Identity',
    /\b(?:elf|demon|angel|human|android|robot|catgirl|doggirl|kemonomimi|witch|magical girl|maid|nurse|knight|warrior|student|original character)\b/i,
  ],
  [
    'Clothing',
    /\b(?:clothing|clothes|outfit|attire|dress(?:es)?|shirts?|blouses?|tops?(?!(?:\s+|-)(?:view|down|angle)\b)|tank tops?|crop tops?|tube tops?|halter tops?|sweaters?|turtlenecks?|hoodies?|jackets?|coats?|cardigans?|vests?|waistcoats?|uniforms?|robes?|kimonos?|yukatas?|cheongsams?|qipaos?|bodysuits?|leotards?|swimsuits?|bikinis?|lingerie|underwear|bras?|pant(?:ie)?s|skirts?|trousers?|shorts?|leggings?|stockings?|socks?|tights?|shoes?|boots?|sandals?|heels?|hats?|caps?|headwear|gloves?|scarves?|ties?|bowties?|belts?|bags?|purses?|backpacks?|armor|necklaces?|earrings?|bracelets?|wristbands?|chokers?|collars?|sleeveless|short sleeves?|long sleeves?|off shoulder|ribbed knit)\b/i,
  ],
  [
    'Action',
    /\b(?:smile|frown|crying|laughing|blush|expression|pose|looking|standing|sitting|lying|kneeling|walking|running|jumping|dancing|holding|pointing|hugging|kissing|hand up|arms crossed|open mouth|closed mouth)\b/i,
  ],
  [
    'Environment',
    /\b(?:city|street|room|forest|beach|sky|background|location|indoors|outdoors|weather|rain|snow|night|day|sunset|ocean|sea|mountain|building|furniture|vehicle|weapon|tree|flower|water|wave)\b/i,
  ],
  [
    'Composition',
    /\b(?:lighting|camera|lens|angle|perspective|pov|view|from above|from below|from behind|from side|close-up|portrait|landscape|full body|upper body|cowboy shot|depth of field|bokeh|focus|backlighting|rim light|light rays?|foreshortening|dutch angle|fisheye)\b/i,
  ],
  [
    'Body',
    /\b(?:hair|eyes?|face|skin|body|hands?|fingers?|arms?|legs?|feet|breasts?|hips?|waist|navel|anatomy|proportions?|muscles?|fangs?|horns?|wings?|tail|detailed face|detailed hands?)\b/i,
  ],
  [
    'StyleQuality',
    /\b(?:chibi|lineart|line art|style|illustration|anime|cinematic|rendering|medium|watercolor|oil painting|graphite|3d|2d|flat color|masterpiece|quality|aesthetic|highres|absurdres|lowres|artifact|error|blurry|detailed)\b/i,
  ],
];

const legacyCategoryMap = {
  Artist: 'ArtistEra',
  Clothing: 'Clothing',
  Scene: 'Environment',
};

const dictionary = {
  '1girl': '1名女孩',
  '1boy': '1名男孩',
  'silver hair': '银色头发',
  'white hair': '白色头发',
  'long silver hair': '银色长发',
  'red eyes': '红色眼睛',
  'blue eyes': '蓝色眼睛',
  'black military uniform': '黑色军装',
  'futuristic city': '未来城市',
  'cinematic lighting': '电影感光照',
  'ribbed knit sweater': '罗纹针织毛衣',
  solo: '单人',
  chibi: 'Q版',
  'chibi only': '仅Q版',
  'thick lineart': '粗线稿',
  'simple background': '简单背景',
  'white background': '白色背景',
  'cherry blossom petals': '樱花花瓣',
  'motion lines': '速度线',
  'motion blur': '运动模糊',
  'shiny skin': '光泽皮肤',
};

export function inferCategory(tag) {
  return categoryRules.find(([, expression]) => expression.test(tag))?.[0] || 'Unsorted';
}

export function normalizeCategory(category, tag = '') {
  if (CATEGORY_OPTIONS.includes(category)) return category;
  if (category === 'Character') {
    const inferred = inferCategory(tag);
    return inferred === 'Unsorted' ? 'Identity' : inferred;
  }
  if (category === 'Style') {
    const inferred = inferCategory(tag);
    return inferred === 'Unsorted' ? 'StyleQuality' : inferred;
  }
  return legacyCategoryMap[category] || 'Unsorted';
}

// 括号强调：{} 每层 ×1.05，[] 每层 ÷1.05（用户 10-21 补上 []）。层数是带符号的：[] 记成负数
const BRACKETS = { '{': '}', '[': ']' };
function braceGroupAt(source, cursor) {
  const opener = source[cursor];
  const closer = BRACKETS[opener];
  if (!closer) return null;
  let depth = 0;
  while (source[cursor + depth] === opener) depth += 1;
  const closing = closer.repeat(depth);
  const close = source.indexOf(closing, cursor + depth);
  if (close === -1) return null;
  return {
    depth,
    signed: opener === '{' ? depth : -depth,
    open: opener.repeat(depth),
    closing,
    close,
    end: close + depth,
    content: source.slice(cursor + depth, close),
  };
}
/** 带符号的括号层数写成括号：2 是 {{}}，-1 是 [] */
function bracketText(depth, content) {
  return depth > 0
    ? `${'{'.repeat(depth)}${content}${'}'.repeat(depth)}`
    : depth < 0
      ? `${'['.repeat(-depth)}${content}${']'.repeat(-depth)}`
      : content;
}

const QUOTE_PAIRS = new Map([
  ['"', '"'],
  ["'", "'"],
  ['`', '`'],
  ['“', '”'],
  ['‘', '’'],
  ['「', '」'],
  ['『', '』'],
]);

function isEscaped(source, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function openingQuoteAt(source, index) {
  const character = source[index];
  const closingQuote = QUOTE_PAIRS.get(character);
  if (!closingQuote || isEscaped(source, index)) return '';

  // ASCII apostrophes inside or after words are punctuation, not quote openers.
  // This covers contractions and possessives such as "don't", "another's", and "girls' hands".
  if (character === "'" && /[\p{L}\p{N}]/u.test(source[index - 1] || '')) return '';

  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === closingQuote && !isEscaped(source, cursor)) return closingQuote;
  }
  return '';
}

function scanPromptBoundary(source, cursor) {
  let closingQuote = '';
  for (let index = cursor; index < source.length; index += 1) {
    const character = source[index];
    if (closingQuote) {
      if (character === closingQuote && !isEscaped(source, index)) closingQuote = '';
      continue;
    }
    const openedQuote = openingQuoteAt(source, index);
    if (openedQuote) {
      closingQuote = openedQuote;
      continue;
    }
    if (character === ',' || character === '\n') return index;
  }
  return source.length;
}

function textBlockStart(source, cursor) {
  let closingQuote = '';
  let braceDepth = 0;
  for (let index = cursor; index < source.length; index += 1) {
    const character = source[index];
    if (closingQuote) {
      if (character === closingQuote && !isEscaped(source, index)) closingQuote = '';
      continue;
    }
    const openedQuote = openingQuoteAt(source, index);
    if (openedQuote) {
      closingQuote = openedQuote;
      continue;
    }
    if (character === '{' || character === '[') braceDepth += 1;
    else if ((character === '}' || character === ']') && braceDepth > 0) braceDepth -= 1;
    if (braceDepth > 0 || (index > cursor && !/\s/.test(source[index - 1]))) continue;
    if (/^text\s*:/i.test(source.slice(index))) return index;
  }
  return -1;
}

export function findPromptTextBlockStart(source = '') {
  return textBlockStart(String(source || ''), 0);
}

// A numeric weight runs to the next "::". When another "number::" opener starts a tag
// first (e.g. "0.8::a,b,0.8::c::"), that opener starts the next group and this one ends
// just before it without a closer of its own. Inside an unclosed {} or [] the old reading stays.
function weightGroupEnd(source, from) {
  for (let at = source.indexOf('::', from); at !== -1; at = source.indexOf('::', at + 2)) {
    const before = source.slice(from, at);
    const opener = before.match(/(?:^|,)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
    const open = (before.match(/[{[]/g) || []).length - (before.match(/[}\]]/g) || []).length;
    if (!opener || open > 0) return { end: at, closer: 2 };
    return { end: at - opener[1].length, closer: 0 };
  }
  return null;
}

function scanPromptSegments(source, state, offset = 0, wrappers = []) {
  const segments = [];
  let cursor = 0;
  // Where the previous weight group ended at a new opener instead of its own "::"
  let unclosedAt = -1;
  while (cursor < source.length) {
    while (cursor < source.length && /[\s,]/.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) break;

    const weighted = source.slice(cursor).match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))::/);
    if (weighted) {
      const contentStart = cursor + weighted[0].length;
      const group = weightGroupEnd(source, contentStart);
      if (group) {
        const contentEnd = group.end;
        const weight = Number(weighted[1]);
        // close stays "::" even when the group ends at the next opener: inserting a tag
        // in the middle of the group has to close it explicitly.
        const wrapper = {
          kind: 'weight',
          start: offset + cursor,
          end: offset + contentEnd + group.closer,
          open: weighted[0],
          close: '::',
        };
        // V5 starts a new group here; V4.5 reads it differently (doc/design.md 2.38), so the
        // first tag after a missing closer carries a diagnostic and can be fixed in one click.
        const afterUnclosed = unclosedAt === cursor;
        scanPromptSegments(source.slice(contentStart, contentEnd), state, offset + contentStart, [
          ...wrappers,
          wrapper,
        ]).forEach((segment, i) =>
          segments.push({
            ...segment,
            weight,
            ...(afterUnclosed && i === 0 && !segment.syntax_issue
              ? { syntax_issue: 'unclosed_weight' }
              : {}),
          }),
        );
        unclosedAt = group.closer ? -1 : contentEnd;
        cursor = contentEnd + group.closer;
        continue;
      }
    }

    const braceGroup = braceGroupAt(source, cursor);
    if (braceGroup) {
      const group = `brace-${state.nextGroup++}`;
      const trailingComma = /,\s*$/.test(braceGroup.content);
      const wrapper = {
        kind: 'brace',
        start: offset + cursor,
        end: offset + braceGroup.end,
        open: braceGroup.open,
        close: braceGroup.closing,
      };
      scanPromptSegments(braceGroup.content, state, offset + cursor + braceGroup.depth, [
        ...wrappers,
        wrapper,
      ]).forEach((segment) =>
        segments.push({
          ...segment,
          brace_depth: braceGroup.signed + Number(segment.brace_depth || 0),
          brace_group: group,
          brace_trailing_comma: trailingComma,
        }),
      );
      cursor = braceGroup.end;
      continue;
    }

    const textStart = textBlockStart(source, cursor);
    if (textStart === cursor) {
      const rawSegment = source.slice(cursor).trim();
      if (rawSegment)
        segments.push({
          tag: rawSegment,
          weight: 1,
          raw_segment: rawSegment,
          segment_type: 'text_block',
          source_range: { start: offset + cursor, end: offset + source.trimEnd().length, wrappers },
        });
      break;
    }

    const regularBoundary = scanPromptBoundary(source, cursor);
    const end = textStart > cursor ? Math.min(regularBoundary, textStart) : regularBoundary;
    const rawSegment = source.slice(cursor, end).trim();
    const source_range = {
      start: offset + cursor,
      end:
        offset +
        end -
        (source.slice(cursor, end).length - source.slice(cursor, end).trimEnd().length),
      wrappers,
    };
    if (rawSegment) {
      if (rawSegment === '::') {
        segments.push({
          tag: '::',
          weight: 1,
          raw_segment: rawSegment,
          syntax_issue: 'control_only',
          source_range,
        });
      } else {
        const leadingCloser = rawSegment.startsWith('::');
        const trailingCloser = rawSegment.endsWith('::');
        const tag = rawSegment
          .replace(/^::\s*/, '')
          .replace(/\s*::$/, '')
          .trim();
        if (tag)
          segments.push({
            tag,
            weight: 1,
            source_range,
            ...(leadingCloser || trailingCloser
              ? { raw_segment: rawSegment, syntax_issue: 'emphasis_closer' }
              : {}),
          });
      }
    }
    cursor = end === textStart ? end : end + 1;
  }
  return segments;
}

function promptSegments(prompt) {
  const source = String(prompt || '')
    .replace(/\r\n?/g, '\n')
    .replace(/，/g, ',');
  return scanPromptSegments(source, { nextGroup: 0 });
}

// Ranges use UTF-16 offsets into the original string, including CRLF and fullwidth commas.
// Keep range collection in the same scanner as parsePrompt so editing cannot drift from parsing.
export function promptTagRanges(prompt = '') {
  const original = String(prompt || '');
  const boundaries = [0];
  let source = '';
  for (let index = 0; index < original.length; index += 1) {
    let character = original[index];
    if (character === '\r') {
      if (original[index + 1] === '\n') index += 1;
      character = '\n';
    }
    source += character === '，' ? ',' : character;
    boundaries.push(index + 1);
  }
  return scanPromptSegments(source, { nextGroup: 0 }).map(({ source_range: range }) => ({
    start: boundaries[range.start],
    end: boundaries[range.end],
    wrappers: range.wrappers.map((wrapper) => ({
      ...wrapper,
      start: boundaries[wrapper.start],
      end: boundaries[wrapper.end],
    })),
  }));
}

function hasBraceGroups(value) {
  const source = String(value || '');
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    if (braceGroupAt(source, cursor)) return true;
  }
  return false;
}

/** @param {string} prompt @param {() => string} createId @returns {import('../shared/types').Tag[]} */
export function parsePrompt(prompt = '', createId = () => crypto.randomUUID()) {
  return promptSegments(prompt).map(
    (
      {
        tag,
        weight,
        raw_segment = '',
        syntax_issue = '',
        segment_type = 'tag',
        brace_depth = 0,
        brace_group = '',
        brace_trailing_comma = false,
      },
      position,
    ) => {
      return {
        id: createId(),
        tag,
        translation: dictionary[tag.toLowerCase()] || '',
        translation_source: dictionary[tag.toLowerCase()] ? 'builtin' : '',
        category: inferCategory(tag),
        category_source: 'heuristic',
        weight,
        raw_segment,
        segment_type,
        syntax_issue,
        brace_depth,
        brace_group,
        brace_trailing_comma,
        position,
        note: '',
      };
    },
  );
}

/** @param {string} prompt @param {import('../shared/types').Tag[]} existingTags @param {() => string} createId */
export function parsePromptPreservingEdits(
  prompt = '',
  existingTags = [],
  createId = () => crypto.randomUUID(),
) {
  const existingByTag = new Map();
  for (const existing of existingTags) {
    const key = String(existing.tag || '')
      .trim()
      .toLocaleLowerCase('en-US');
    if (!key) continue;
    if (!existingByTag.has(key)) existingByTag.set(key, []);
    existingByTag.get(key).push(existing);
  }

  return parsePrompt(prompt, createId).map((parsed) => {
    const key = parsed.tag.trim().toLocaleLowerCase('en-US');
    const existing = existingByTag.get(key)?.shift();
    if (!existing) return parsed;
    return {
      ...parsed,
      id: existing.id || parsed.id,
      translation: Object.hasOwn(existing, 'translation')
        ? existing.translation
        : parsed.translation,
      translation_source: Object.hasOwn(existing, 'translation_source')
        ? existing.translation_source
        : parsed.translation_source,
      category: normalizeCategory(existing.category, parsed.tag) || parsed.category,
      category_source: Object.hasOwn(existing, 'category_source')
        ? existing.category_source
        : parsed.category_source,
      note: Object.hasOwn(existing, 'note') ? existing.note : parsed.note,
    };
  });
}

export function repairLegacyPromptTags(
  tags = [],
  prompt = '',
  createId = () => crypto.randomUUID(),
) {
  const hasLegacyFragments =
    tags.some(
      (item) =>
        /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)::/.test(item.tag) ||
        /::$/.test(item.tag) ||
        /[{}[\]]/.test(item.tag),
    ) ||
    (hasBraceGroups(prompt) && !tags.some((item) => Number(item.brace_depth) !== 0));
  if (!hasLegacyFragments || !prompt.trim()) return tags;

  const existingByTag = new Map();
  for (const item of tags) {
    const key = item.tag
      .trim()
      .replace(/^\{+\s*/, '')
      .replace(/\s*\}+$/, '')
      .toLowerCase();
    if (!existingByTag.has(key)) existingByTag.set(key, []);
    existingByTag.get(key).push(item);
  }
  return parsePrompt(prompt, createId).map((parsed) => {
    const existing =
      existingByTag.get(String(parsed.raw_segment || parsed.tag).toLowerCase())?.shift() ||
      existingByTag.get(parsed.tag.toLowerCase())?.shift();
    if (!existing) return parsed;
    return {
      ...parsed,
      id: existing.id,
      translation: existing.translation || parsed.translation,
      category:
        existing.category && existing.category !== 'Unsorted'
          ? normalizeCategory(existing.category, parsed.tag)
          : parsed.category,
      note: existing.note || '',
    };
  });
}

function formatTagContent(tag) {
  const parsedWeight = Number(tag.weight);
  const value = Number.isFinite(parsedWeight) ? parsedWeight : 1;
  const hasNumericWeight = Math.abs(value - 1) >= 0.001;
  if (
    tag.syntax_issue &&
    tag.raw_segment &&
    !(tag.syntax_issue === 'emphasis_closer' && hasNumericWeight)
  )
    return tag.raw_segment.trim();
  return Math.abs(value - 1) < 0.001
    ? tag.tag.trim()
    : `${Number(value.toFixed(2))}::${tag.tag.trim()} ::`;
}

export function formatTagLabel(tag, value = tag.tag) {
  const depth = Math.trunc(Number(tag.brace_depth) || 0);
  return bracketText(depth, String(value || '').trim());
}

export function formatTag(tag) {
  return formatTagLabel(tag, formatTagContent(tag));
}

export function formatPrompt(tags = []) {
  return tags
    .filter((tag) => tag.tag.trim())
    .map(formatTag)
    .join(',\n');
}

export function analyzePromptBatch(
  prompt = '',
  existingTags = [],
  createId = () => crypto.randomUUID(),
) {
  const tags = parsePrompt(prompt, createId);
  const seen = new Set(
    existingTags
      .map((item) =>
        String(item?.tag ?? item)
          .trim()
          .toLocaleLowerCase('en-US'),
      )
      .filter(Boolean),
  );
  let duplicateCount = 0;
  for (const tag of tags) {
    const key = tag.tag.trim().toLocaleLowerCase('en-US');
    if (seen.has(key)) duplicateCount += 1;
    seen.add(key);
  }
  return {
    tags,
    duplicateCount,
    syntaxIssueCount: tags.filter((tag) => tag.syntax_issue).length,
  };
}

export function formatPromptInline(tags = []) {
  return tags
    .filter((tag) => tag.tag.trim())
    .map(formatTag)
    .join(', ');
}

export function formatPromptGroupedInline(tags = []) {
  const values = [];
  for (let index = 0; index < tags.length; ) {
    const tag = tags[index];
    if (!tag.tag.trim()) {
      index += 1;
      continue;
    }
    const depth = Math.trunc(Number(tag.brace_depth) || 0);
    if (!depth || !tag.brace_group) {
      values.push(formatTag(tag));
      index += 1;
      continue;
    }
    const members = [];
    let cursor = index;
    while (
      cursor < tags.length &&
      tags[cursor].brace_group === tag.brace_group &&
      Number(tags[cursor].brace_depth) === depth
    ) {
      if (tags[cursor].tag.trim()) members.push(formatTagContent(tags[cursor]));
      cursor += 1;
    }
    const trailing = tag.brace_trailing_comma && members.length ? ', ' : '';
    values.push(bracketText(depth, `${members.join(', ')}${trailing}`));
    index = cursor;
  }
  return values.join(', ');
}

export function normalizeSearch(value = '') {
  return value.trim().toLocaleLowerCase();
}

const searchAliases = {
  银发: ['银色头发', '白色头发', 'silver hair', 'white hair'],
  白发: ['银色头发', '白色头发', 'silver hair', 'white hair'],
  军装: ['military uniform', '军服', '制服'],
  夜景: ['night', 'nighttime', '夜晚', '夜间'],
};

export function expandSearch(value = '') {
  const normalized = normalizeSearch(value);
  return [normalized, ...(searchAliases[normalized] || [])].map(normalizeSearch).filter(Boolean);
}
