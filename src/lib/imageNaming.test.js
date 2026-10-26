import { describe, expect, it } from 'vitest';
import {
  hasImageName,
  imageDisplayName,
  imageFileName,
  isUnnamedImage,
  numberedImageNames,
} from './imageNaming.js';

describe('image naming', () => {
  it.each([
    'sample s-123.png',
    'sample s-123_2.png',
    'sample s-123-3.webp',
    'sample s-123 (4).png',
    'sample s-9 (12).PNG',
    '0123456789abcdef',
    'ABCDEF0123456789.webp',
    'abcdef01-2345-6789-abcd-0123456789ab.jpg',
  ])('recognizes generated shape %s', (name) => {
    expect(isUnnamedImage(name)).toBe(true);
  });
  it.each([
    '用户起的很长很长但应当保留的图片名称',
    's-1 extra',
    '123456789abcdef',
    '雪山',
    'image.png',
    '雨后-2',
    '雨后_2',
    '雨后 (2)',
    's-2.txt',
    's-2 (a)',
  ])('keeps named shape %s', (name) => {
    expect(isUnnamedImage(name)).toBe(false);
  });
  it('remembers explicitly assigned names even when they resemble a generated filename', () => {
    expect(hasImageName({ name: 's-123', has_custom_name: true })).toBe(true);
  });
  it.each([
    [1, '名称'],
    [2, '名称-02'],
    [99, '名称-99'],
    [100, '名称-100'],
    [999, '名称-999'],
    [1000, '名称-1000'],
  ])('numbers %i images', (count, last) => {
    const names = numberedImageNames(' 名称 ', count);
    expect(names.at(-1)).toBe(last);
    expect(names[0]).toBe(
      count === 1 ? '名称' : `名称-${'1'.padStart(Math.max(2, String(count).length), '0')}`,
    );
  });
  it('preserves original filenames and avoids duplicate extensions for legacy records', () => {
    expect(imageFileName({ original_filename: 'fixture (1).PNG', name: 'changed' })).toBe(
      'fixture (1).PNG',
    );
    expect(imageFileName({ name: 's-3.png', image_path: '/assets/id.png' })).toBe('s-3.png');
  });

  it('shows a generated image under its named work until it gets its own name', () => {
    const ref = (workName) => [{ workId: 'w', role: 'version', number: 2, workName }];
    const hash = 'd70a240a-89a2-42b4-b7a0-f387e6813051';
    expect(imageDisplayName({ name: hash, work_refs: ref('风笛 · 特写') })).toBe(
      '风笛 · 特写 · 第 2 版',
    );
    expect(imageDisplayName({ name: hash, work_refs: ref(hash) })).toBe('');
    expect(imageDisplayName({ name: hash })).toBe('');
    expect(
      imageDisplayName({ name: '雨夜', has_custom_name: true, work_refs: ref('风笛 · 特写') }),
    ).toBe('雨夜');
  });
});
