import { describe, expect, it } from 'vitest';
import {
  libraryCountText,
  modelDisplayName,
  groupModelOptions,
  generationParameters,
  dimensions,
  deletionDetail,
} from './presentation';
import { galleryProjectMatchesFilters } from '../lib/galleryFilters.js';

describe('library model presentation', () => {
  it.each([
    ['NovelAI Diffusion V4.5 4BDE2A90', 'V4.5'],
    ['NovelAI Diffusion V4.5 Full 4bde2a90', 'V4.5'],
    ['NovelAI Diffusion V4.5 Curated 12345678', 'V4.5 Curated'],
    ['NovelAI Diffusion V4 Full', 'V4'],
    ['NovelAI Diffusion V4 Curated', 'V4 Curated'],
    ['NovelAI Diffusion V5', 'V5'],
    ['NovelAI Diffusion V3', 'V3'],
    ['NovelAI Diffusion Future ABCDEF01', 'NovelAI Diffusion Future'],
    ['Other model', 'Other model'],
    ['Other 1234567', 'Other 1234567'],
  ])('formats %s as %s', (raw, expected) => expect(modelDisplayName(raw)).toBe(expected));
  it('groups aliases while retaining raw filter values and legacy exact rules', () => {
    const values = ['NovelAI Diffusion V4.5 Full ABCDEF01', 'NovelAI Diffusion V4.5 12345678'];
    expect(groupModelOptions(values.map((value) => ({ label: value, value })))).toEqual([
      { label: 'V4.5', values },
    ]);
    for (const value of values)
      expect(galleryProjectMatchesFilters({ metadata: { model: value } }, { models: values })).toBe(
        true,
      );
    expect(
      galleryProjectMatchesFilters({ metadata: { model: values[0] } }, { models: [values[0]] }),
    ).toBe(true);
    expect(
      galleryProjectMatchesFilters({ metadata: { model: values[1] } }, { models: [values[0]] }),
    ).toBe(false);
  });
});
it.each([
  [{}, ''],
  [{ steps: 0, guidance: 0, seed: '' }, ''],
  [{ steps: 28 }, '28 步'],
  [{ guidance: 5 }, '引导 5'],
  [{ seed: '0' }, 'Seed 0'],
  [{ steps: 28, guidance: 5, seed: '123' }, '28 步 · 引导 5 · Seed 123'],
])('omits unavailable generation fields %j', (metadata, expected) =>
  expect(generationParameters(metadata)).toBe(expected),
);
it('shows unknown dimensions unless both dimensions are available', () => {
  expect(dimensions({})).toBe('尺寸未知');
  expect(dimensions({ width: 832, height: 0 })).toBe('尺寸未知');
  expect(dimensions({ width: 832, height: 1216 })).toBe('832 × 1216');
});
it('preserves explicit zero parameters from retained source metadata', () => {
  expect(
    generationParameters({
      steps: 0,
      guidance: 0,
      seed: '0',
      extra_json: JSON.stringify({ parsed: { steps: 0, scale: 0 } }),
    }),
  ).toBe('0 步 · 引导 0 · Seed 0');
  expect(generationParameters({ steps: 0, guidance: 0, extra_json: 'broken' })).toBe('');
});
it('assembles only applicable permanent deletion sentences', () => {
  expect(deletionDetail({ open: 0, dirty: 0 }, '')).toBe('');
  expect(deletionDetail({ open: 2, dirty: 1 }, '12.4 MB')).toBe(
    '2 张正在工作台打开，删除后这些标签页会关闭。其中 1 个标签页里有还没保存的改动，会一起丢弃。会释放 12.4 MB。',
  );
  expect(deletionDetail({ open: 0, dirty: 0 }, '1.0 KB')).toBe('会释放 1.0 KB。');
});

it('formats group, image and filtered scope counts', () => {
  expect(libraryCountText(2, 2)).toBe('2 张');
  expect(libraryCountText(2, 5)).toBe('2 组 · 5 张');
  expect(libraryCountText(2, 2, 10)).toBe('2 张，共 10 张');
  expect(libraryCountText(2, 5, 10)).toBe('2 组 · 5 张，共 10 张');
});
