import { describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readNovelAIMetadata } from '../../electron/metadata.js';
import { parsePrompt, promptTagRanges } from './prompt.js';
import {
  createPromptStructure,
  getPromptScopes,
  formatPositivePromptForCopy,
  positivePromptCopyOptions,
  formatPositiveScopeForCopy,
} from './promptStructure.js';
import {
  DEFAULT_OVERVIEW_FILTERS,
  filterOverviewScopes,
  filterCollapsedAutomaticScopes,
  overviewCopyContext,
  overviewEntries,
} from './promptOverview.js';
import {
  classifyPromptBlock,
  parsePromptSection,
  serializePromptSection,
  setPromptBlockType,
  editPromptParagraph,
  editPromptTag,
  createPromptDocument,
  promptDocumentProject,
  copyPromptDocument,
  promptDocumentCopyOptions,
  copyPromptDocumentScope,
  copyVisiblePromptDocument,
} from './promptDocument';
import type { ImageProject } from '../shared/types';

const paragraphs = [
  'The traveler carries a small wooden box while walking beside the quiet river.',
  'The camera looks across the bridge toward a distant tower covered in pale morning light.',
  'Thin clouds gather above the mountains as the afternoon sun lights the old stone road.',
];
const mixed = [
  '1.3::artist:solara, watercolor::, -2::flat color::, {soft light}, [hard edges]',
  paragraphs[0],
  '1girl, solo, 米澜',
  paragraphs[1],
  'Rossi: ' + paragraphs[2],
  'Panel 1: ' + paragraphs[0],
  'Panel 2: quiet afternoon light, warm interior, soft focus background',
  '<style> watercolor, pale colors',
  '角色名: 清晨的阳光穿过窗户洒在桌面的花瓶上，远处的山峦被薄雾覆盖。',
].join('\r\n \t\r\n\r\n');

function syntheticProject(prompt = mixed, model = 'nai-diffusion-4-5-full') {
  const metadata = {
    prompt_raw: prompt,
    negative_prompt: 'blur, noise',
    model,
    prompt_structure_raw: {
      base_prompt_raw: prompt,
      base_undesired_raw: 'blur, noise',
      use_coords: true,
      use_order: false,
      characters: [
        { prompt_raw: '1girl, silver hair', undesired_raw: 'hat', center: { x: 0.2, y: 0.7 } },
      ],
    },
  };
  return {
    metadata,
    tags: parsePrompt(prompt),
    prompt_structure: createPromptStructure(metadata),
  } as unknown as Pick<ImageProject, 'metadata' | 'tags' | 'prompt_structure'>;
}

const rainyParagraph =
  '雨刚停，女孩站在候车亭下，手里握着一把透明的伞，伞面上还挂着水珠，远处的路灯一盏一盏亮起来，地上的积水映出灯光，她低头看着手机，耳机线垂在胸前，风把她的头发吹乱了，她却没有在意。';

it('copies exclusively negative selections and reports negative omissions in mixed selections', () => {
  const project = syntheticProject('sky');
  const document = createPromptDocument(project);
  const entries = overviewEntries(getPromptScopes(project));
  const negative = entries.filter(
    (entry: { scopePolarity: string }) => entry.scopePolarity === 'undesired',
  );
  const result = copyVisiblePromptDocument(document, {
    selectedKeys: negative.map((entry: { key: string }) => entry.key),
  });
  expect(result.text).toBe('blur, noise, hat');
  expect(result.count).toBe(3);
  expect(result.ignored).toBe(0);
  const mixedResult = copyVisiblePromptDocument(document, {
    selectedKeys: entries.map((entry: { key: string }) => entry.key),
  });
  expect(mixedResult.text).not.toContain('blur');
  expect(mixedResult.ignored).toBe(3);
  expect(copyPromptDocumentScope(document, 'base:undesired')).toBe('blur, noise');
});
const shortEnglishParagraph =
  'A quiet street after the rain, puddles everywhere, the girl waits under the shelter, holding a clear umbrella, droplets on its surface, streetlights turning on, one by one, reflections in the water, she looks at her phone, earphones hanging, wind in her hair.';
const syntheticParagraphCases = [
  {
    name: 'A',
    count: 24,
    han: 105,
    words: 3,
    functionItems: 0,
    punctuation: 1,
    items: [
      '清晨的阳光穿过窗户洒在桌面的花瓶上 soft light',
      ...Array(19).fill('微风拂面'),
      ...Array(4).fill('天渐暗'),
    ],
  },
  {
    name: 'B',
    count: 19,
    han: 144,
    words: 3,
    functionItems: 0,
    punctuation: 0,
    items: [
      '清晨的阳光穿过窗户洒在桌面的花瓶上 soft light',
      ...Array(17).fill('微风吹过旧窗台'),
      '远处的山渐渐暗了',
    ],
  },
  {
    name: 'C',
    count: 40,
    han: 218,
    words: 3,
    functionItems: 0,
    punctuation: 0,
    items: [
      '清晨的阳光穿过窗户洒在桌面的花瓶上 soft light',
      ...Array(33).fill('微风轻拂面'),
      ...Array(6).fill('远处山色渐暗'),
    ],
  },
  {
    name: 'D',
    count: 10,
    han: 0,
    words: 29,
    functionItems: 1,
    punctuation: 1,
    items: [
      'The traveler walks slowly beside quiet rivers carrying old wooden boxes filled with faded letters gathered from distant villages during long summer journeys beneath pale clouds drifting toward mountains',
      ...Array(9).fill('soft morning light'),
    ],
  },
  {
    name: 'E',
    count: 30,
    han: 0,
    words: 16,
    functionItems: 11,
    punctuation: 0,
    items: [
      'The traveler walks slowly beside quiet rivers carrying old wooden boxes filled with faded handwritten letters',
      ...Array(10).fill('she walks onward'),
      ...Array(19).fill('soft morning light'),
    ],
  },
  {
    name: 'F',
    count: 33,
    han: 0,
    words: 17,
    functionItems: 10,
    punctuation: 0,
    items: [
      'The traveler walks slowly beside quiet rivers carrying old wooden boxes filled with faded handwritten family letters',
      ...Array(9).fill('they follow quietly'),
      ...Array(23).fill('soft morning light'),
    ],
  },
  {
    name: 'G',
    count: 15,
    han: 0,
    words: 14,
    functionItems: 2,
    punctuation: 0,
    items: [
      'The traveler walks slowly beside quiet rivers carrying old wooden boxes filled with letters',
      'she walks onward',
      ...Array(13).fill('soft morning light'),
    ],
  },
];

describe('lossless block document', () => {
  it.each(syntheticParagraphCases)(
    'keeps synthetic paragraph $name with the specified numeric features',
    (sample) => {
      const source =
        sample.items.join(sample.han ? '，' : ', ') +
        (sample.punctuation ? (sample.han ? '。' : '.') : '');
      expect(sample.items).toHaveLength(sample.count);
      expect(source.match(/\p{Script=Han}/gu) || []).toHaveLength(sample.han);
      expect(Math.max(...sample.items.map((item) => item.split(/\s+/).length))).toBe(sample.words);
      expect(
        sample.items.filter((item) =>
          /\b(a|an|the|she|he|her|his|him|they|them|their|it|its|i|my|we|our|you|your|is|are|was|were)\b/i.test(
            item,
          ),
        ),
      ).toHaveLength(sample.functionItems);
      expect(source.match(/[.!?。！？]/g) || []).toHaveLength(sample.punctuation);
      const section = parsePromptSection(source);
      expect(section.blocks).toHaveLength(1);
      expect(section.blocks[0].type).toBe('paragraph');
      expect(section.blocks[0].tags).toEqual([]);
      expect(serializePromptSection(section)).toBe(source);
    },
  );

  it.each([rainyParagraph, rainyParagraph.slice(0, -1), shortEnglishParagraph])(
    'keeps the specified prose as a paragraph: %s',
    (source) => {
      const section = parsePromptSection(source);
      expect(section.blocks).toHaveLength(1);
      expect(section.blocks[0].type).toBe('paragraph');
      expect(serializePromptSection(section)).toBe(source);
    },
  );

  it.each([
    ['黑色长发，蓝色眼睛，校服，短裙，白袜，皮鞋，发带，微笑', 'tags'],
    ['春风拂面，细雨初停，远山渐暗，天色晚', 'tags'],
    ['春风拂面，细雨初停，远山渐暗，天色渐晚', 'paragraph'],
    ['春风拂面，细雨初停，远山渐暗，天色渐晚，云', 'tags'],
    ['春风拂面，细雨初停，远山渐暗，天色渐晚，sky，river', 'paragraph'],
  ] as const)('checks Chinese prose totals and averages: %s', (source, expected) => {
    expect(classifyPromptBlock(source)).toBe(expected);
    expect(serializePromptSection(parsePromptSection(source))).toBe(source);
  });

  it.each([
    [10, 1, 'tags'],
    [10, 2, 'tags'],
    [5, 2, 'tags'],
    [10, 3, 'paragraph'],
    [11, 3, 'tags'],
    [11, 4, 'paragraph'],
  ] as const)(
    'checks short-list prose thresholds: %i items, %i function-word items',
    (count, matches, expected) => {
      const source = [
        ...Array(matches).fill('the golden hour'),
        'warm interior',
        ...Array(count - matches - 1).fill('soft focus background'),
      ].join(', ');
      expect(classifyPromptBlock(source)).toBe(expected);
      expect(serializePromptSection(parsePromptSection(source))).toBe(source);
    },
  );

  it.each([
    [24, 'tags'],
    [25, 'paragraph'],
  ] as const)('limits a long-list item to %i words', (words, expected) => {
    expect(
      classifyPromptBlock(
        [...Array(19).fill('sky'), Array(words).fill('word').join(' ')].join(', '),
      ),
    ).toBe(expected);
  });

  it.each([
    [15, 'tags'],
    [16, 'paragraph'],
  ] as const)('limits whole-block Han characters at %i', (count, expected) => {
    const source = [
      ...Array(18).fill('sky'),
      '山'.repeat(count - 1),
      '水 ' + 'word '.repeat(13).trim(),
    ].join(', ');
    expect(classifyPromptBlock(source)).toBe(expected);
  });

  it.each([
    [20, 3, 'tags'],
    [20, 4, 'paragraph'],
    [21, 4, 'tags'],
    [21, 5, 'paragraph'],
  ] as const)(
    'checks strict function-word ratio: %i items, %i matching items',
    (count, matches, expected) => {
      const items = [
        'word '.repeat(13).trim(),
        ...Array(matches).fill('THE sky'),
        ...Array(count - matches - 1).fill('sky'),
      ];
      expect(classifyPromptBlock(items.join(', '))).toBe(expected);
    },
  );

  it.each(
    'a an the she he her his him they them their it its i my we our you your is are was were'.split(
      ' ',
    ),
  )('matches the whole function word %s case-insensitively, counting each item once', (word) => {
    const longItem = 'word '.repeat(13).trim();
    const matching = `${word.toUpperCase()} ${word}`;
    expect(
      classifyPromptBlock(
        [longItem, ...Array(3).fill(matching), ...Array(16).fill('sky')].join(', '),
      ),
    ).toBe('tags');
    expect(
      classifyPromptBlock(
        [longItem, ...Array(4).fill(matching), ...Array(15).fill('sky')].join(', '),
      ),
    ).toBe('paragraph');
    expect(classifyPromptBlock([longItem, ...Array(19).fill(`x${word}x`)].join(', '))).toBe('tags');
  });

  it('keeps a 61-item synthetic list with one 13-word item and two periods as tags', () => {
    const longItem = 'a small red kite on a thin line by an old oak tree';
    const items = Array.from({ length: 58 }, (_, index) => `synthetic detail ${index}`);
    items.push(longItem + '.', 'soft edges.', '1::paper texture, muted ink::');
    const source = items.join(', ');
    expect(items).toHaveLength(61);
    expect(longItem.split(/\s+/)).toHaveLength(13);
    expect(source.match(/\./g)).toHaveLength(2);
    expect(source.match(/1::.*?::/g)).toHaveLength(1);
    expect(source).not.toMatch(/[\r\n\p{Script=Han}]/u);
    const section = parsePromptSection(source, { createId: () => 'synthetic' });
    expect(section.blocks).toHaveLength(1);
    expect(section.blocks[0].type).toBe('tags');
    expect(section.blocks[0].tags).toEqual(parsePrompt(source, () => 'synthetic'));
    expect(section.blocks[0].tags.some((tag) => tag.tag === longItem + '.')).toBe(true);
    expect(serializePromptSection(section)).toBe(source);
  });

  it.each([
    [9, 1, 'paragraph'],
    [10, 1, 'paragraph'],
    [11, 2, 'paragraph'],
    [19, 1, 'paragraph'],
    [19, 2, 'paragraph'],
    [20, 1, 'tags'],
    [20, 2, 'tags'],
    [20, 3, 'paragraph'],
    [29, 3, 'paragraph'],
    [30, 3, 'tags'],
    [61, 6, 'tags'],
    [61, 7, 'paragraph'],
  ])('classifies %i items with %i long items as %s', (count, longCount, expected) => {
    const items = Array.from({ length: count }, (_, index) =>
      index < longCount ? paragraphs[0] : `synthetic detail ${index}`,
    );
    expect(classifyPromptBlock(items.join(', '))).toBe(expected);
  });

  it.each([
    'word '.repeat(12) + 'word',
    'x'.repeat(101),
    'One two three four five six seven eight.',
  ])('counts each non-tag criterion once: %s', (outlier) => {
    expect(classifyPromptBlock([...Array(19).fill('sky'), outlier].join(', '))).toBe('tags');
    expect(classifyPromptBlock([...Array(18).fill('sky'), outlier, outlier].join(', '))).toBe(
      'tags',
    );
    expect(
      classifyPromptBlock([...Array(17).fill('sky'), outlier, outlier, outlier].join(', ')),
    ).toBe('paragraph');
  });

  it('counts weight groups as one item and requires commas for the new list rule', () => {
    const items = [...Array(17).fill('sky'), '1::red, green, blue::', paragraphs[0]];
    expect(classifyPromptBlock(items.join(', '))).toBe('paragraph');
    items.push('soft light');
    expect(classifyPromptBlock(items.join(', '))).toBe('tags');
    expect(classifyPromptBlock(items.join('，'))).toBe('tags');
    expect(classifyPromptBlock(items.join('\n'))).toBe('paragraph');
  });

  it.each([
    Array(4)
      .fill(
        'The traveler stops beside the river, watching the boats drift slowly downstream, listening to birds in the trees, while the evening light settles across the quiet hills.',
      )
      .join(' '),
    [...Array(9).fill('soft light'), paragraphs[0], paragraphs[1]].join(', '),
    '清晨的阳光穿过窗户洒在桌面的花瓶上，远处的山峦被薄雾覆盖。行人走过安静的街道，沿着河流慢慢向城外走去。',
  ])('keeps genuine prose as a paragraph: %s', (source) => {
    const section = parsePromptSection(source);
    expect(section.blocks).toHaveLength(1);
    expect(section.blocks[0].type).toBe('paragraph');
    expect(section.blocks[0].tags).toEqual([]);
    expect(serializePromptSection(section)).toBe(source);
  });

  it('classifies synthetic tags, paragraphs, labels and descriptive phrases', () => {
    const section = parsePromptSection(mixed);
    expect(section.blocks.map((block) => block.type)).toEqual([
      'tags',
      'paragraph',
      'tags',
      'paragraph',
      'paragraph',
      'paragraph',
      'tags',
      'tags',
      'paragraph',
    ]);
    expect(section.blocks.map((block) => block.label)).toEqual([
      '',
      '',
      '',
      '',
      'Rossi:',
      'Panel 1:',
      'Panel 2:',
      '<style>',
      '角色名:',
    ]);
    expect(serializePromptSection(section)).toBe(mixed);
    expect(classifyPromptBlock('1.3::' + paragraphs[0] + ', ' + paragraphs[1] + '::')).toBe('tags');
    expect(
      classifyPromptBlock(
        'A quiet traveler carrying a wooden box walks carefully beside the wide flowing river',
      ),
    ).toBe('paragraph');
    expect(classifyPromptBlock('晨光照在窗边，花瓶摆在桌上，远山笼罩在薄雾中。')).toBe('paragraph');
    for (const block of section.blocks) {
      expect(mixed.slice(block.range.start, block.range.end)).toBe(block.raw);
      expect(mixed.slice(block.contentRange.start, block.contentRange.end)).toBe(block.content);
    }
  });

  it('preserves blank edges, lone CR, repeated blank lines, commas and malformed controls', () => {
    for (const source of [
      '',
      ' \t\r\n\n',
      '\r\n\r\n \t\n',
      ' \t\r\nsky,\r\n \r\n\r\n:: ::,\r\n',
      '\ufeffsky,\r\r\t river，',
      '  <style>   sky  ',
    ]) {
      expect(serializePromptSection(parsePromptSection(source))).toBe(source);
    }
    expect(parsePromptSection(' \n\n').blocks).toHaveLength(0);
    expect(parsePromptSection('sky\nriver').blocks).toHaveLength(1);
    expect(parsePromptSection('sky\r \rwater').blocks).toHaveLength(2);
  });

  it('honors raw/range overrides, giving exact ranges precedence for duplicate blocks', () => {
    const source = 'sky, river\n\nsky, river';
    const original = parsePromptSection(source);
    const section = parsePromptSection(source, {
      overrides: [
        { raw: 'sky, river', type: 'paragraph' },
        { range: original.blocks[1].range, type: 'tags' },
      ],
    });
    expect(section.blocks.map((block) => block.type)).toEqual(['paragraph', 'tags']);
    expect(serializePromptSection(section)).toBe(source);
    expect(serializePromptSection(setPromptBlockType(section, 0, 'tags'))).toBe(source);
  });

  it(
    'round trips 3000 generated strings including arbitrary UTF-16 and structured syntax',
    { timeout: 30000 },
    () => {
      // Seeded property generator makes every failure reproducible without another dependency.
      let state = 0x1100cafe;
      const random = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
      };
      const atoms = [
        'sky',
        ' ',
        '\t',
        '\r',
        '\n',
        '\r\n',
        '\n \n',
        '，',
        ',',
        '::',
        '1.3::',
        '-2::',
        '{',
        '}',
        '[',
        ']',
        '<style>',
        'Panel 1: ',
        '米澜',
        '🌲',
        '\u0000',
        '\ufeff',
        '"',
        "'",
        '\\',
        ...paragraphs,
      ];
      for (let trial = 0; trial < 3000; trial += 1) {
        const size = random() % 90;
        let source = '';
        for (let index = 0; index < size; index += 1)
          source +=
            random() % 4 ? atoms[random() % atoms.length] : String.fromCharCode(random() % 65536);
        const section = parsePromptSection(source);
        const result = serializePromptSection(section);
        expect(result, `seed 0x1100cafe case ${trial}`).toBe(source);
        expect(Buffer.from(result)).toEqual(Buffer.from(source));
        expect(section.separators).toHaveLength(section.blocks.length + 1);
        for (const block of section.blocks) {
          expect(source.slice(block.range.start, block.range.end)).toBe(block.raw);
          const ranges = promptTagRanges(block.content);
          expect(ranges).toHaveLength(parsePrompt(block.content).length);
          for (const range of ranges)
            expect(range.start <= range.end && range.end <= block.content.length).toBe(true);
        }
      }
    },
  );

  it('changes only the target weight or leaf, preserving every other byte', () => {
    const source = ' \t<style> sky,\t1.3::river ::， [mist],\r\n\r\n' + paragraphs[0] + '\r\n';
    const section = parsePromptSection(source);
    const weighted = editPromptTag(section, 0, 1, { weight: -2 });
    expect(serializePromptSection(weighted)).toBe(source.replace('1.3::', '-2::'));
    const deleted = editPromptTag(section, 0, 0, { delete: true });
    expect(serializePromptSection(deleted)).toBe(source.replace('sky', ''));
    const paragraph = editPromptParagraph(section, 1, paragraphs[2] + '\n\n' + paragraphs[1]);
    expect(serializePromptSection(paragraph)).toBe(
      source.replace(paragraphs[0], paragraphs[2] + '\n\n' + paragraphs[1]),
    );
    expect(paragraph.blocks).toHaveLength(2);
    expect(serializePromptSection(section)).toBe(source);
    for (const edited of [weighted, deleted, paragraph]) {
      const raw = serializePromptSection(edited);
      for (const block of edited.blocks) {
        expect(raw.slice(block.range.start, block.range.end)).toBe(block.raw);
        expect(raw.slice(block.contentRange.start, block.contentRange.end)).toBe(block.content);
      }
    }
  });

  it.each([
    '1.3::sky, river, mist::',
    '{1.3::sky, river, mist::}',
    '1.3::{sky, river, mist}::',
    '{{sky, river, mist}}',
    'sky，\r\nriver，mist',
    'sky, [river], mist',
    'sky, ::river ::, mist',
    'sky, "river, reflections", mist',
  ])('edits any member of shared groups without changing its neighbors: %s', (source) => {
    const section = parsePromptSection(source, { overrides: [{ raw: source, type: 'tags' }] });
    const originalTags = parsePrompt(source);
    for (let index = 0; index < originalTags.length; index += 1) {
      const range = promptTagRanges(source)[index];
      const edited = serializePromptSection(editPromptTag(section, 0, index, { weight: 2.25 }));
      expect(edited.startsWith(source.slice(0, range.start))).toBe(true);
      expect(edited.endsWith(source.slice(range.end))).toBe(true);
      expect(
        parsePrompt(edited).map(({ tag, weight, brace_depth }) => ({ tag, weight, brace_depth })),
      ).toEqual(
        originalTags.map(({ tag, weight, brace_depth }, cursor) => ({
          tag,
          weight: cursor === index ? 2.25 : weight,
          brace_depth,
        })),
      );
      const deleted = serializePromptSection(editPromptTag(section, 0, index, { delete: true }));
      expect(deleted).toBe(source.slice(0, range.start) + source.slice(range.end));
      expect(
        parsePrompt(deleted).map(({ tag, weight, brace_depth }) => ({ tag, weight, brace_depth })),
      ).toEqual(
        originalTags
          .filter((_, cursor) => cursor !== index)
          .map(({ tag, weight, brace_depth }) => ({ tag, weight, brace_depth })),
      );
    }
  });

  it('handles repeated edits, duplicate tags, empty wrappers and invalid edit requests', () => {
    let section = parsePromptSection('1.3::sky, sky::\r\n\r\nriver');
    section = editPromptTag(section, 0, 1, { weight: -2 });
    section = editPromptTag(section, 0, 0, { delete: true });
    expect(section.blocks[0].tags.map(({ tag, weight }) => ({ tag, weight }))).toEqual([
      { tag: 'sky', weight: -2 },
    ]);
    section = editPromptTag(section, 0, 0, { delete: true });
    expect(section.blocks[0].tags).toHaveLength(0);
    expect(section.blocks[1].raw).toBe('river');
    expect(() => editPromptTag(section, 1, 0, { weight: Infinity })).toThrow();
    expect(() => editPromptTag(section, 0, 5, { delete: true })).toThrow();
    expect(() => editPromptParagraph(section, 1, 'text')).toThrow();
    const malformed = parsePromptSection('-2::{sky, 0.5::river, mist::}::');
    expect(() => editPromptTag(malformed, 0, 3, { weight: 2.25 })).toThrow('cannot preserve');
    expect(serializePromptSection(malformed)).toBe('-2::{sky, 0.5::river, mist::}::');
  });

  it.each([1e-7, -1e21, Number.MIN_VALUE, Number.MAX_VALUE])(
    'writes finite weight %s in the supported decimal grammar',
    (weight) => {
      const edited = editPromptTag(parsePromptSection('sky, river'), 0, 1, { weight });
      expect(parsePrompt(serializePromptSection(edited))[1].weight).toBe(weight);
      expect(serializePromptSection(edited).startsWith('sky, ')).toBe(true);
    },
  );

  it('checks every repository demo image scope against the legacy parser', async () => {
    // src/lib -> root is two levels; metadata reads only the explicitly approved demo folder.
    const root = new URL('../../demo/images/final/', import.meta.url);
    const files = (await readdir(root)).filter((name) => name.endsWith('.png'));
    expect(files).toHaveLength(14);
    let checked = 0;
    for (const filename of files) {
      const metadata = await readNovelAIMetadata(fileURLToPath(new URL(filename, root)));
      const project = {
        metadata,
        tags: parsePrompt(metadata.prompt_raw),
        prompt_structure: createPromptStructure(metadata),
      };
      for (const scope of getPromptScopes(project)) {
        const section = parsePromptSection(scope.raw_prompt, { createId: () => 'demo' });
        expect(serializePromptSection(section)).toBe(scope.raw_prompt);
        if (scope.raw_prompt.trim()) {
          expect(section.blocks).toHaveLength(1);
          expect(section.blocks[0].type).toBe('tags');
          expect(section.blocks[0].tags).toEqual(parsePrompt(scope.raw_prompt, () => 'demo'));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(42);
  });
});

describe('block document structure and legacy copy policy', () => {
  it('reads fallback raw metadata, JSON structures, missing sections and per-scope overrides', () => {
    const metadata = {
      prompt_raw: 'fallback sky',
      negative_prompt: 'fallback blur',
      model: 'nai-diffusion-5-full',
      extra_json: JSON.stringify({
        parsed: {
          v4_prompt: {
            caption: { base_caption: mixed, char_captions: [{ char_caption: 'hat, coat' }] },
          },
          v4_negative_prompt: {
            caption: { base_caption: 'noise', char_captions: [{ char_caption: 'umbrella' }] },
          },
        },
      }),
    };
    const document = createPromptDocument(
      { metadata },
      { 'base:prompt': [{ raw: '1girl, solo, 米澜', type: 'paragraph' }] },
    );
    expect(document.scopes.map(serializePromptSection)).toEqual([
      mixed,
      'noise',
      'hat, coat',
      'umbrella',
    ]);
    expect(document.scopes[0].blocks[2].type).toBe('paragraph');
    const stored = createPromptDocument({
      metadata,
      prompt_structure: JSON.stringify({
        base_prompt_raw: '',
        base_undesired_raw: 'stored',
        characters: [],
      }),
    });
    expect(stored.scopes.map(serializePromptSection)).toEqual(['', 'stored']);
    expect(createPromptDocument({}).scopes.map(serializePromptSection)).toEqual(['', '']);
  });

  it('keeps automatic-tag exclusions and visible selection stable after a block weight edit', () => {
    const project = syntheticProject('sky, location, very aesthetic, masterpiece, no text');
    const document = createPromptDocument(project);
    expect(copyPromptDocument(document)).toBe('sky\n|\n1girl, silver hair');
    expect(copyVisiblePromptDocument(document).text).toBe('sky, 1girl, silver hair');
    const first = document.scopes[0];
    document.scopes[0] = { ...first, ...editPromptTag(first, 0, 0, { weight: 1.5 }) };
    expect(copyPromptDocument(document)).toBe('1.5::sky::\n|\n1girl, silver hair');
    expect(copyVisiblePromptDocument(document).text).toBe('1.5::sky ::, 1girl, silver hair');
    expect(
      copyVisiblePromptDocument(document, {
        selectedKeys: ['base:prompt\u0000' + project.tags[0].id],
      }).text,
    ).toBe('1.5::sky ::');
    expect(promptDocumentProject(document)).toEqual(promptDocumentProject(document));
  });
  it.each(['nai-diffusion-4-full', 'nai-diffusion-4-5-full', 'nai-diffusion-5-full'])(
    'preserves every copy mode, filters, selection, automatic tags and negative scopes: %s',
    (model) => {
      const project = syntheticProject(
        'sky, location, very aesthetic, masterpiece, no text',
        model,
      );
      const document = createPromptDocument(project);
      expect(document.scopes.map((section) => section.scope.key.split(':')[0])).toEqual([
        'base',
        'base',
        'character',
        'character',
      ]);
      expect(promptDocumentProject(document)).toEqual(project);
      for (const includeAutomatic of [false, true]) {
        expect(copyPromptDocument(document, { includeAutomatic })).toBe(
          formatPositivePromptForCopy(project, { includeAutomatic }),
        );
        expect(promptDocumentCopyOptions(document, { includeAutomatic })).toEqual(
          positivePromptCopyOptions(project, { includeAutomatic }),
        );
      }
      for (const scope of getPromptScopes(project))
        expect(copyPromptDocumentScope(document, scope.key)).toBe(scope.raw_prompt);
      const filters = [
        DEFAULT_OVERVIEW_FILTERS,
        { ...DEFAULT_OVERVIEW_FILTERS, category: 'Environment' },
        { ...DEFAULT_OVERVIEW_FILTERS, query: 'silver' },
        { ...DEFAULT_OVERVIEW_FILTERS, polarity: 'undesired' },
        { ...DEFAULT_OVERVIEW_FILTERS, domain: 'character' },
      ];
      const selection = overviewEntries(getPromptScopes(project)).map(
        (entry: { key: string }) => entry.key,
      );
      for (const filter of filters)
        for (const expandedScopeKeys of [[], ['base:prompt']])
          for (const selectedKeys of [[], selection, selection.slice(1, 4)]) {
            const visible = filterCollapsedAutomaticScopes(
              filterOverviewScopes(project, filter),
              expandedScopeKeys,
            );
            if (filter.polarity === 'undesired' && !selectedKeys.length) {
              expect(
                copyVisiblePromptDocument(document, {
                  filters: filter,
                  expandedScopeKeys,
                }).entries.every(
                  (entry: { scopePolarity: string }) => entry.scopePolarity === 'undesired',
                ),
              ).toBe(true);
              continue;
            }
            expect(
              copyVisiblePromptDocument(document, {
                filters: filter,
                expandedScopeKeys,
                selectedKeys,
              }),
            ).toEqual(overviewCopyContext(project, visible, selectedKeys));
          }
    },
  );

  it('reads metadata fallbacks and saved annotations, and computes copy text from edited blocks', () => {
    const project = syntheticProject();
    project.tags[0].translation = '自定义';
    const document = createPromptDocument(project);
    expect(copyPromptDocument(document, { includeAutomatic: true })).toBe(
      formatPositivePromptForCopy(project, { includeAutomatic: true }),
    );
    const scope = document.scopes[0];
    document.scopes[0] = { ...scope, ...editPromptParagraph(scope, 1, paragraphs[2]) };
    const copied = copyPromptDocument(document, { includeAutomatic: true });
    expect(copied).toContain(mixed.replace(paragraphs[0], paragraphs[2]));
    expect(copied).not.toContain('blur, noise');
    expect(project.prompt_structure.base_prompt_raw).toBe(mixed);
  });
});
