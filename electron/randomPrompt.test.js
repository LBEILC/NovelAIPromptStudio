import { expect, it } from 'vitest';
import { drawRandomText } from './randomPrompt.js';
const pools = [
  {
    name: 'A',
    entries: [
      { id: 'a', text: 'standing', chance: 1 },
      { id: 'b', text: 'sitting', chance: 3 },
    ],
  },
];
const draw = (text, rng) => drawRandomText(text, pools, 'base:prompt', rng);
it('uses weighted sampling with a reasonable large-sample distribution', () => {
  let heavy = 0;
  for (let i = 0; i < 10000; i++) if (draw('__A__').text === 'sitting') heavy++;
  expect(heavy).toBeGreaterThan(7000);
  expect(heavy).toBeLessThan(8000);
});
it('draws without replacement and allows explicit repetition', () => {
  expect(draw('__A*2__', () => 0).text).toBe('standing, sitting');
  expect(draw('__A*3r__', () => 0).text).toBe('standing, standing, standing');
  expect(() => draw('__A*3__')).toThrow('条目数');
});
it('rejects missing, empty, malformed, nested and negative markers before sending', () => {
  expect(() => draw('__Gone__')).toThrow('找不到随机池「Gone」');
  expect(() => draw('__A')).toThrow('格式');
  expect(() => drawRandomText('__A__', pools, 'base:undesired')).toThrow('负面');
  expect(() => drawRandomText('__A__', [{ name: 'A', entries: [] }], 'base:prompt')).toThrow(
    '没有条目',
  );
  expect(() =>
    drawRandomText(
      '__A__',
      [{ name: 'A', entries: [{ id: 'a', text: '__A__', chance: 1 }] }],
      'base:prompt',
    ),
  ).toThrow('嵌套');
});
it('samples each tag on the weight grid and preserves explicit weight groups', () => {
  const items = [
    {
      name: 'A',
      entries: [{ id: 'a', text: 'rain, cloud, 1.4::wind, snow::, {sun}, [fog]', chance: 1 }],
    },
  ];
  const values = [0, 0, 0.9999];
  const result = drawRandomText(
    '__A~0.8-1.2/0.1__',
    items,
    'base:prompt',
    () => values.shift() ?? 0.5,
  );
  expect(result.text).toBe('0.8::rain::, 1.2::cloud::, 1.4::wind, snow::, {sun}, [fog]');
  expect(result.blocks[0].entries[0].weights).toEqual([
    { text: 'rain', weight: 0.8 },
    { text: 'cloud', weight: 1.2 },
  ]);
});
it('weights a paragraph as a whole and omits weight one', () => {
  const text =
    'She walks through the quiet forest, and the morning sunlight filters through the leaves.';
  const items = [{ name: 'A', entries: [{ id: 'a', text, chance: 1 }] }];
  expect(drawRandomText('__A~1.1-1.1__', items, 'base:prompt').text).toBe(`1.1::${text}::`);
  expect(drawRandomText('__A~1-1__', items, 'base:prompt').text).toBe(text);
});
it('preserves arbitrarily nested existing groups without wrapping them again', () => {
  const text = '{{{rain, [cloud]}}}, [[[fog]]], 1.3::sun::';
  expect(
    drawRandomText(
      '__A~0.7-0.7__',
      [{ name: 'A', entries: [{ id: 'a', text, chance: 1 }] }],
      'base:prompt',
    ).text,
  ).toBe(text);
});
it('records the exact position, original entry and rendered text for repeated markers', () => {
  const result = draw('prefix, __A__, __A__', () => 0);
  expect(result.blocks.map((b) => b.start)).toEqual([8, 15]);
  expect(result.blocks[0]).toMatchObject({
    source: '__A__',
    scope: 'base:prompt',
    pool: 'A',
    text: 'standing',
    entries: [{ id: 'a', text: 'standing', rendered: 'standing' }],
  });
});
