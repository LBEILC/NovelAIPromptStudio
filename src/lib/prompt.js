export const CATEGORY_OPTIONS = ['ArtistEra', 'Subject', 'Identity', 'Body', 'Clothing', 'Action', 'Environment', 'Composition', 'StyleQuality', 'Unsorted'];
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
  ['ArtistEra', /(?:^|[\s{[(,:])(?:artist\s*[:_]|by\s+artist\b|artist\b)|\byear\s*\d{4}\b|\b(?:19|20)\d0s\s*\(style\)/i],
  ['Subject', /\b(?:\d+girls?|\d+boys?|\d+others?|girl|boy|woman|man|male|female|other|solo|multiple girls|multiple boys)\b/i],
  ['Identity', /\b(?:elf|demon|angel|human|android|robot|catgirl|doggirl|kemonomimi|witch|magical girl|maid|nurse|knight|warrior|student|original character)\b/i],
  ['Clothing', /\b(dress|shirt|sweater|jacket|uniform|skirt|pants|shorts|shoes|boots|hat|gloves|armor|necklace|earrings?)\b/i],
  ['Action', /\b(?:smile|frown|crying|laughing|blush|expression|pose|looking|standing|sitting|lying|kneeling|walking|running|jumping|dancing|holding|pointing|hugging|kissing|hand up|arms crossed|open mouth|closed mouth)\b/i],
  ['Environment', /\b(?:city|street|room|forest|beach|sky|background|location|indoors|outdoors|weather|rain|snow|night|day|sunset|ocean|sea|mountain|building|furniture|vehicle|weapon|tree|flower|water|wave)\b/i],
  ['Composition', /\b(?:lighting|camera|lens|angle|perspective|pov|view|from above|from below|from behind|from side|close-up|portrait|landscape|full body|upper body|cowboy shot|depth of field|bokeh|focus|backlighting|rim light|light rays?|foreshortening|dutch angle|fisheye)\b/i],
  ['Body', /\b(?:hair|eyes?|face|skin|body|hands?|fingers?|arms?|legs?|feet|breasts?|hips?|waist|navel|anatomy|proportions?|muscles?|fangs?|horns?|wings?|tail|detailed face|detailed hands?)\b/i],
  ['StyleQuality', /\b(?:chibi|lineart|line art|style|illustration|anime|cinematic|rendering|medium|watercolor|oil painting|graphite|3d|2d|flat color|masterpiece|quality|aesthetic|highres|absurdres|lowres|artifact|error|blurry|detailed)\b/i],
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
  'solo': '单人',
  'chibi': 'Q版',
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

function braceGroupAt(source, cursor) {
  if (source[cursor] !== '{') return null;
  let depth = 0;
  while (source[cursor + depth] === '{') depth += 1;
  const closing = '}'.repeat(depth);
  const close = source.indexOf(closing, cursor + depth);
  if (close === -1) return null;
  return {
    depth,
    close,
    end: close + depth,
    content: source.slice(cursor + depth, close),
  };
}

function scanPromptSegments(source, state) {
  const segments = [];
  let cursor = 0;
  while (cursor < source.length) {
    while (cursor < source.length && /[\s,]/.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) break;

    const weighted = source.slice(cursor).match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))::/);
    if (weighted) {
      const contentStart = cursor + weighted[0].length;
      const contentEnd = source.indexOf('::', contentStart);
      if (contentEnd !== -1) {
        const weight = Number(weighted[1]);
        scanPromptSegments(source.slice(contentStart, contentEnd), state)
          .forEach((segment) => segments.push({ ...segment, weight }));
        cursor = contentEnd + 2;
        continue;
      }
    }

    const braceGroup = braceGroupAt(source, cursor);
    if (braceGroup) {
      const group = `brace-${state.nextGroup++}`;
      const trailingComma = /,\s*$/.test(braceGroup.content);
      scanPromptSegments(braceGroup.content, state).forEach((segment) => segments.push({
        ...segment,
        brace_depth: braceGroup.depth + Number(segment.brace_depth || 0),
        brace_group: group,
        brace_trailing_comma: trailingComma,
      }));
      cursor = braceGroup.end;
      continue;
    }

    const comma = source.indexOf(',', cursor);
    const newline = source.indexOf('\n', cursor);
    const boundaries = [comma, newline].filter((value) => value !== -1);
    const end = boundaries.length ? Math.min(...boundaries) : source.length;
    const rawSegment = source.slice(cursor, end).trim();
    if (rawSegment) {
      if (rawSegment === '::') {
        segments.push({ tag: '::', weight: 1, raw_segment: rawSegment, syntax_issue: 'control_only' });
      } else {
        const leadingCloser = rawSegment.startsWith('::');
        const trailingCloser = rawSegment.endsWith('::');
        const tag = rawSegment
          .replace(/^::\s*/, '')
          .replace(/\s*::$/, '')
          .trim();
        if (tag) segments.push({
          tag,
          weight: 1,
          ...(leadingCloser || trailingCloser ? { raw_segment: rawSegment, syntax_issue: 'emphasis_closer' } : {}),
        });
      }
    }
    cursor = end + 1;
  }
  return segments;
}

function promptSegments(prompt) {
  const source = String(prompt || '').replace(/\r\n?/g, '\n').replace(/，/g, ',');
  return scanPromptSegments(source, { nextGroup: 0 });
}

function hasBraceGroups(value) {
  const source = String(value || '');
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    if (braceGroupAt(source, cursor)) return true;
  }
  return false;
}

export function parsePrompt(prompt = '', createId = () => crypto.randomUUID()) {
  return promptSegments(prompt)
    .map(({ tag, weight, raw_segment = '', syntax_issue = '', brace_depth = 0, brace_group = '', brace_trailing_comma = false }, position) => {
      return {
        id: createId(),
        tag,
        translation: dictionary[tag.toLowerCase()] || '',
        translation_source: dictionary[tag.toLowerCase()] ? 'builtin' : '',
        category: inferCategory(tag),
        category_source: 'heuristic',
        weight,
        raw_segment,
        syntax_issue,
        brace_depth,
        brace_group,
        brace_trailing_comma,
        position,
        note: '',
      };
    });
}

export function parsePromptPreservingEdits(prompt = '', existingTags = [], createId = () => crypto.randomUUID()) {
  const existingByTag = new Map();
  for (const existing of existingTags) {
    const key = String(existing.tag || '').trim().toLocaleLowerCase('en-US');
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
      translation: Object.hasOwn(existing, 'translation') ? existing.translation : parsed.translation,
      translation_source: Object.hasOwn(existing, 'translation_source') ? existing.translation_source : parsed.translation_source,
      category: normalizeCategory(existing.category, parsed.tag) || parsed.category,
      category_source: Object.hasOwn(existing, 'category_source') ? existing.category_source : parsed.category_source,
      note: Object.hasOwn(existing, 'note') ? existing.note : parsed.note,
    };
  });
}

export function repairLegacyPromptTags(tags = [], prompt = '', createId = () => crypto.randomUUID()) {
  const hasLegacyFragments = tags.some((item) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)::/.test(item.tag) || /::$/.test(item.tag) || /[{}]/.test(item.tag))
    || (hasBraceGroups(prompt) && !tags.some((item) => Number(item.brace_depth) > 0));
  if (!hasLegacyFragments || !prompt.trim()) return tags;

  const existingByTag = new Map();
  for (const item of tags) {
    const key = item.tag.trim().replace(/^\{+\s*/, '').replace(/\s*\}+$/, '').toLowerCase();
    if (!existingByTag.has(key)) existingByTag.set(key, []);
    existingByTag.get(key).push(item);
  }
  return parsePrompt(prompt, createId).map((parsed) => {
    const existing = existingByTag.get(String(parsed.raw_segment || parsed.tag).toLowerCase())?.shift()
      || existingByTag.get(parsed.tag.toLowerCase())?.shift();
    if (!existing) return parsed;
    return {
      ...parsed,
      id: existing.id,
      translation: existing.translation || parsed.translation,
      category: existing.category && existing.category !== 'Unsorted' ? normalizeCategory(existing.category, parsed.tag) : parsed.category,
      note: existing.note || '',
    };
  });
}

function formatTagContent(tag) {
  const parsedWeight = Number(tag.weight);
  const value = Number.isFinite(parsedWeight) ? parsedWeight : 1;
  const hasNumericWeight = Math.abs(value - 1) >= 0.001;
  if (tag.syntax_issue && tag.raw_segment && !(tag.syntax_issue === 'emphasis_closer' && hasNumericWeight)) return tag.raw_segment.trim();
  return Math.abs(value - 1) < 0.001 ? tag.tag.trim() : `${Number(value.toFixed(2))}::${tag.tag.trim()} ::`;
}

export function formatTagLabel(tag, value = tag.tag) {
  const depth = Math.max(0, Math.trunc(Number(tag.brace_depth) || 0));
  const content = String(value || '').trim();
  return depth ? `${'{'.repeat(depth)}${content}${'}'.repeat(depth)}` : content;
}

export function formatTag(tag) {
  return formatTagLabel(tag, formatTagContent(tag));
}

export function formatPrompt(tags = []) {
  return tags.filter((tag) => tag.tag.trim()).map(formatTag).join(',\n');
}

export function analyzePromptBatch(prompt = '', existingTags = [], createId = () => crypto.randomUUID()) {
  const tags = parsePrompt(prompt, createId);
  const seen = new Set(existingTags.map((item) => String(item?.tag ?? item).trim().toLocaleLowerCase('en-US')).filter(Boolean));
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
  return tags.filter((tag) => tag.tag.trim()).map(formatTag).join(', ');
}

export function formatPromptGroupedInline(tags = []) {
  const values = [];
  for (let index = 0; index < tags.length;) {
    const tag = tags[index];
    if (!tag.tag.trim()) {
      index += 1;
      continue;
    }
    const depth = Math.max(0, Math.trunc(Number(tag.brace_depth) || 0));
    if (!depth || !tag.brace_group) {
      values.push(formatTag(tag));
      index += 1;
      continue;
    }
    const members = [];
    let cursor = index;
    while (cursor < tags.length && tags[cursor].brace_group === tag.brace_group && Number(tags[cursor].brace_depth) === depth) {
      if (tags[cursor].tag.trim()) members.push(formatTagContent(tags[cursor]));
      cursor += 1;
    }
    const trailing = tag.brace_trailing_comma && members.length ? ', ' : '';
    values.push(`${'{'.repeat(depth)}${members.join(', ')}${trailing}${'}'.repeat(depth)}`);
    index = cursor;
  }
  return values.join(', ');
}

export function normalizeSearch(value = '') {
  return value.trim().toLocaleLowerCase();
}

const searchAliases = {
  '银发': ['银色头发', '白色头发', 'silver hair', 'white hair'],
  '白发': ['银色头发', '白色头发', 'silver hair', 'white hair'],
  '军装': ['military uniform', '军服', '制服'],
  '夜景': ['night', 'nighttime', '夜晚', '夜间'],
};

export function expandSearch(value = '') {
  const normalized = normalizeSearch(value);
  return [normalized, ...(searchAliases[normalized] || [])].map(normalizeSearch).filter(Boolean);
}
