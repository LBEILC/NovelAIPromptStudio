import { describe, expect, it } from 'vitest';
import { buildDsoDictionary, parseCsv } from './dsoDictionaryBuild.mjs';

const groups = {
  tag_to_groups: {
    '1girl': ['tag_group:character_count', 'tag_group:focus_tags'],
    maid: ['tag_group:attire', 'tag_group:jobs', 'tag_group:food_tags'],
    smile: ['tag_group:face_tags'],
  },
  group_to_tags: {
    'tag_group:character_count': ['1girl'],
    'tag_group:focus_tags': ['1girl'],
    'tag_group:attire': ['maid'],
    'tag_group:jobs': ['maid'],
    'tag_group:food_tags': ['maid'],
    'tag_group:face_tags': ['smile'],
  },
  group_cn_names: {
    'tag_group:character_count': '角色人数',
    'tag_group:focus_tags': '焦点',
    'tag_group:attire': '服装',
    'tag_group:jobs': '职业',
    'tag_group:food_tags': '食物',
    'tag_group:face_tags': '表情',
  },
};

describe('DSO dictionary build', () => {
  it('parses quoted commas, escaped quotes, and embedded newlines', () => {
    expect(parseCsv('a,b\n"x,y","line 1\nline ""2"""\n')).toEqual([
      ['a', 'b'],
      ['x,y', 'line 1\nline "2"'],
    ]);
  });

  it('selects primary translations and deterministic Studio categories', () => {
    const csv = [
      'name,cn_name,wiki,post_count,category,nsfw',
      '1girl,"1个女孩,女孩",角色,100,0,0',
      'maid,"女仆,女佣",职业,90,0,0',
      'smile,微笑,表情,80,0,0',
      'bagpipe_(arknights),风笛,角色,70,4,0',
      'arknights,明日方舟,作品,60,3,0',
    ].join('\n');
    const dictionary = buildDsoDictionary(csv, groups, { commit: 'test' });

    expect(dictionary.entries).toMatchObject({
      '1girl': ['1个女孩', 2],
      maid: ['女仆', 3],
      smile: ['微笑', 6],
      'bagpipe_(arknights)': ['风笛', 3],
      arknights: ['明日方舟', 3],
    });
    expect(dictionary.stats).toMatchObject({ entries: 5, translated: 5, groups: 6 });
  });

  it('keeps a deterministic first row for the single duplicated upstream tag', () => {
    const csv = [
      'name,cn_name,wiki,post_count,category,nsfw',
      'same_tag,首选,说明,20,0,0',
      'same_tag,重复,说明,20,0,0',
    ].join('\n');
    const dictionary = buildDsoDictionary(csv, { tag_to_groups: {}, group_to_tags: {}, group_cn_names: {} }, {});
    expect(dictionary.entries.same_tag).toEqual(['首选', 0]);
    expect(dictionary.stats).toMatchObject({ entries: 1, source_rows: 2, duplicate_rows: 1 });
  });
});
