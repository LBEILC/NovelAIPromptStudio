import { expect, it, vi } from 'vitest';
import { preserveClipboard } from './clipboard.js';

it('restores multiple standard formats in one write', () => {
  const image = { isEmpty: () => true };
  const clipboard = {
    availableFormats: () => ['text/plain', 'text/html'],
    readImage: () => image,
    readText: () => 'text',
    readHTML: () => '<b>text</b>',
    readBookmark: () => ({}),
    write: vi.fn(),
    clear: vi.fn(),
  };
  const restore = preserveClipboard(clipboard);
  expect(clipboard.write).not.toHaveBeenCalled();
  expect(restore()).toBe(true);
  expect(clipboard.write).toHaveBeenCalledExactlyOnceWith({ text: 'text', html: '<b>text</b>' });
});

it('refuses unsupported custom formats without modifying the clipboard', () => {
  const clipboard = {
    availableFormats: () => ['application/x-private'],
    clear: vi.fn(),
    write: vi.fn(),
  };
  expect(() => preserveClipboard(clipboard)).toThrow('未改动剪贴板');
  expect(clipboard.clear).not.toHaveBeenCalled();
  expect(clipboard.write).not.toHaveBeenCalled();
});
