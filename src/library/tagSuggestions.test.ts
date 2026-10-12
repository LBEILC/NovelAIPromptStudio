import { expect, it } from 'vitest';
import { libraryTagSuggestions } from './tagSuggestions';
import { galleryFilterOptions } from '../lib/galleryFilters.js';

it('ranks prefixes, word prefixes and substrings before image counts', () => {
  const options = [
    { value: 'shaded', label: 'shaded', count: 20 },
    { value: 'red dress', label: 'red dress', count: 15 },
    { value: 'dune', label: 'dune', count: 2 },
    { value: 'dark', label: 'dark', count: 3 },
  ];
  expect(libraryTagSuggestions(options, 'd', []).map((item) => item.text)).toEqual([
    'dark',
    'dune',
    'red dress',
    'shaded',
  ]);
  expect(libraryTagSuggestions(options, 'd', ['DARK']).map((item) => item.text)).not.toContain(
    'dark',
  );
  expect(libraryTagSuggestions(options, 'unmatched', [])).toEqual([]);
});

it('matches translations and counts each image only once', () => {
  const options = galleryFilterOptions([
    {
      metadata: {},
      filter_tags: [
        { tag: 'circle', translation: '圆形' },
        { tag: 'circle', translation: '圆形' },
      ],
    },
    {
      metadata: {},
      filter_tags: [
        { tag: 'circle', translation: '圆形' },
        { tag: 'square', translation: '方形' },
      ],
    },
  ]).tags;
  expect(libraryTagSuggestions(options, '圆', [])).toEqual([
    { id: 'circle', text: 'circle', translation: '圆形', count: '2' },
  ]);
});
