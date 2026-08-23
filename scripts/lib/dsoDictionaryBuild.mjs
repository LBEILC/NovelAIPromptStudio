const CATEGORY_CODES = Object.freeze({
  Unsorted: 0,
  ArtistEra: 1,
  Subject: 2,
  Identity: 3,
  Body: 4,
  Clothing: 5,
  Action: 6,
  Environment: 7,
  Composition: 8,
  StyleQuality: 9,
});

const GROUP_RULES = Object.freeze({
  'tag_group:year_tags': ['ArtistEra', 90],

  'tag_group:character_count': ['Subject', 110],
  'tag_group:groups': ['Subject', 105],

  'tag_group:jobs': ['Identity', 110],
  'tag_group:legendary_creatures': ['Identity', 105],
  'tag_group:gender_nonconformity': ['Identity', 100],
  'tag_group:transgender': ['Identity', 100],
  'tag_group:family_relationships': ['Identity', 90],
  'tag_group:people': ['Identity', 85],
  'tag_group:birds': ['Identity', 70],
  'tag_group:cats': ['Identity', 70],
  'tag_group:dogs': ['Identity', 70],

  'tag_group:body_parts': ['Body', 100],
  'tag_group:ass': ['Body', 100],
  'tag_group:breasts_tags': ['Body', 100],
  'tag_group:ears_tags': ['Body', 100],
  'tag_group:eyes_tags': ['Body', 100],
  'tag_group:feet': ['Body', 100],
  'tag_group:hair_color': ['Body', 100],
  'tag_group:hair_styles': ['Body', 100],
  'tag_group:hands': ['Body', 100],
  'tag_group:makeup': ['Body', 95],
  'tag_group:piercings': ['Body', 95],
  'tag_group:pussy': ['Body', 100],
  'tag_group:shoulders': ['Body', 100],
  'tag_group:skin_color': ['Body', 100],
  'tag_group:wings': ['Body', 90],

  'tag_group:accessories': ['Clothing', 90],
  'tag_group:attire': ['Clothing', 90],
  'tag_group:eyewear': ['Clothing', 100],
  'tag_group:fashion_style': ['Clothing', 95],
  'tag_group:handwear': ['Clothing', 100],
  'tag_group:headwear': ['Clothing', 100],
  'tag_group:legwear': ['Clothing', 100],
  'tag_group:neck_and_neckwear': ['Clothing', 100],
  'tag_group:nudity': ['Clothing', 80],
  'tag_group:sexual_attire': ['Clothing', 100],
  'tag_group:sleeves': ['Clothing', 100],

  'tag_group:face_tags': ['Action', 105],
  'tag_group:bdsm_and_torture': ['Action', 95],
  'tag_group:covering': ['Action', 100],
  'tag_group:dances': ['Action', 100],
  'tag_group:gestures': ['Action', 105],
  'tag_group:holding_tags': ['Action', 105],
  'tag_group:posture': ['Action', 105],
  'tag_group:sex_acts': ['Action', 100],
  'tag_group:sexual_positions': ['Action', 100],
  'tag_group:simulated_sex_acts': ['Action', 100],
  'tag_group:sports': ['Action', 75],
  'tag_group:verbs_and_gerunds': ['Action', 90],

  'tag_group:backgrounds': ['Environment', 105],
  'tag_group:locations': ['Environment', 105],
  'tag_group:real_world_locations': ['Environment', 105],
  'tag_group:board_games': ['Environment', 65],
  'tag_group:cards': ['Environment', 65],
  'tag_group:doors_and_gates': ['Environment', 90],
  'tag_group:fire': ['Environment', 80],
  'tag_group:flowers': ['Environment', 80],
  'tag_group:food_tags': ['Environment', 55],
  'tag_group:holidays_and_celebrations': ['Environment', 75],
  'tag_group:sex_objects': ['Environment', 70],
  'tag_group:technology': ['Environment', 70],
  'tag_group:water': ['Environment', 80],

  'tag_group:focus_tags': ['Composition', 100],
  'tag_group:image_composition': ['Composition', 110],
  'tag_group:lighting': ['Composition', 110],

  'tag_group:artistic_license': ['StyleQuality', 95],
  'tag_group:censorship': ['StyleQuality', 80],
  'tag_group:drawing_software': ['StyleQuality', 90],
  'tag_group:embellishment': ['StyleQuality', 80],
  'tag_group:fine_art_parody': ['StyleQuality', 90],
  'tag_group:patterns': ['StyleQuality', 75],
  'tag_group:prints': ['StyleQuality', 75],
  'tag_group:subjective': ['StyleQuality', 80],
  'tag_group:theme': ['StyleQuality', 85],
  'tag_group:visual_aesthetic': ['StyleQuality', 100],
});

export function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += character;
      continue;
    }
    if (character === '"' && field === '') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') field += character;
  }
  if (quoted) throw new Error('DSO CSV 包含未闭合的引号');
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
  }
  return rows;
}

function primaryTranslation(value) {
  return String(value || '').split(',').map((item) => item.trim()).find(Boolean) || '';
}

function groupCategory(groups = []) {
  return groups
    .map((group) => ({ group, rule: GROUP_RULES[group] }))
    .filter((entry) => entry.rule)
    .sort((left, right) => right.rule[1] - left.rule[1] || left.group.localeCompare(right.group))[0]?.rule[0] || 'Unsorted';
}

function studioCategory(danbooruCategory, groups) {
  if (danbooruCategory === 3 || danbooruCategory === 4) return 'Identity';
  return groupCategory(groups);
}

export function buildDsoDictionary(csvSource, groupsSource, sourceMetadata) {
  const rows = parseCsv(csvSource);
  const header = rows.shift();
  const expectedHeader = ['name', 'cn_name', 'wiki', 'post_count', 'category', 'nsfw'];
  if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) throw new Error(`无法识别 DSO CSV 字段：${header?.join(',') || '空文件'}`);
  const groups = typeof groupsSource === 'string' ? JSON.parse(groupsSource) : groupsSource;
  if (!groups?.tag_to_groups || !groups?.group_to_tags || !groups?.group_cn_names) throw new Error('DSO Tag Group 数据结构无效');

  const entries = {};
  const categoryCounts = Object.fromEntries(Object.keys(CATEGORY_CODES).map((category) => [category, 0]));
  let translated = 0;
  let duplicateRows = 0;
  for (const row of rows) {
    if (row.length !== expectedHeader.length) throw new Error(`DSO CSV 行字段数量无效：${row[0] || '未知 Tag'}`);
    const [name, cnName, , , rawCategory] = row;
    const tag = String(name || '').trim().toLocaleLowerCase('en-US');
    if (!tag) throw new Error('DSO Tag 不能为空');
    if (Object.hasOwn(entries, tag)) {
      duplicateRows += 1;
      continue;
    }
    const translation = primaryTranslation(cnName);
    const category = studioCategory(Number(rawCategory), groups.tag_to_groups[tag] || []);
    if (translation) translated += 1;
    categoryCounts[category] += 1;
    entries[tag] = [translation, CATEGORY_CODES[category]];
  }

  return {
    schema_version: 1,
    source: sourceMetadata,
    categories: Object.keys(CATEGORY_CODES),
    stats: {
      entries: Object.keys(entries).length,
      source_rows: rows.length,
      duplicate_rows: duplicateRows,
      translated,
      grouped_tags: Object.keys(groups.tag_to_groups).length,
      groups: Object.keys(groups.group_to_tags).length,
      category_counts: categoryCounts,
    },
    entries,
  };
}

export { CATEGORY_CODES, GROUP_RULES };
