import { describe, expect, it } from 'vitest';
import { hasImageName, imageFileName, isUnnamedImage, numberedImageNames } from './imageNaming.js';

describe('image naming', () => {
  it.each([
    'sample s-123.png',
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
});
