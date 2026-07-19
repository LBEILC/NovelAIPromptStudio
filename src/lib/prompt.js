export const CATEGORY_OPTIONS = ['Artist', 'Character', 'Clothing', 'Scene', 'Style', 'Unsorted'];
export const CATEGORY_LABELS = {
  Artist: '画师',
  Character: '角色',
  Clothing: '服装',
  Scene: '场景',
  Style: '风格',
  Unsorted: '未分类',
};

const categoryRules = [
  ['Artist', /(?:^|[\s{[(,:])(?:artist\s*[:_]|by\s+artist\b|artist\b)/i],
  ['Character', /(?:\b\d+girls?\b|\b\d+boys?\b|\b(?:girl|boy|woman|man|solo|hair|eyes?|face|smile|expression|pose|looking|standing|sitting|hands?|body)\b)/i],
  ['Clothing', /\b(dress|shirt|sweater|jacket|uniform|skirt|pants|shorts|shoes|boots|hat|gloves|armor|necklace|earrings?)\b/i],
  ['Scene', /\b(city|street|room|forest|beach|sky|background|location|indoors|outdoors|weather|rain|snow|night|day|sunset|ocean)\b/i],
  ['Style', /\b(chibi|lineart|line art|lighting|camera|lens|angle|style|illustration|anime|cinematic|detailed|masterpiece|quality|aesthetic|highres|absurdres|depth of field|bokeh)\b/i],
];

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

function promptSegments(prompt) {
  const source = String(prompt || '').replace(/\r\n?/g, '\n').replace(/，/g, ',');
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
        source.slice(contentStart, contentEnd).split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean)
          .forEach((tag) => segments.push({ tag, weight }));
        cursor = contentEnd + 2;
        continue;
      }
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

export function parsePrompt(prompt = '', createId = () => crypto.randomUUID()) {
  return promptSegments(prompt)
    .map(({ tag, weight, raw_segment = '', syntax_issue = '' }, position) => {
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
        position,
        note: '',
      };
    });
}

export function repairLegacyPromptTags(tags = [], prompt = '', createId = () => crypto.randomUUID()) {
  const hasLegacyFragments = tags.some((item) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)::/.test(item.tag) || /::$/.test(item.tag));
  if (!hasLegacyFragments || !prompt.trim()) return tags;

  const existingByTag = new Map();
  for (const item of tags) {
    const key = item.tag.trim().toLowerCase();
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
      category: existing.category && existing.category !== 'Unsorted' ? existing.category : parsed.category,
      note: existing.note || '',
    };
  });
}

export function formatTag(tag) {
  if (tag.syntax_issue && tag.raw_segment) return tag.raw_segment.trim();
  const value = Number(tag.weight);
  return Math.abs(value - 1) < 0.001 ? tag.tag.trim() : `${Number(value.toFixed(2))}::${tag.tag.trim()} ::`;
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
