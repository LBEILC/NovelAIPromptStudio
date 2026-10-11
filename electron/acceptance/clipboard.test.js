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

it('rereads delayed clipboard ownership without rewriting and records only hashes and lengths', () => {
  let value = 'private original';
  let pending;
  const clipboard = {
    availableFormats: () => ['text/plain'],
    readImage: () => ({ isEmpty: () => true }),
    readText: () => value,
    readBookmark: () => ({}),
    write: vi.fn((data) => {
      pending = data.text;
    }),
  };
  const restore = preserveClipboard(clipboard);
  value = 'temporary test value';
  expect(restore()).toBe(false);
  expect(restore.verify()).toBe(false);
  value = pending;
  expect(restore.verify()).toBe(true);
  expect(clipboard.write).toHaveBeenCalledOnce();
  const details = restore.details();
  expect(details.after.text).toEqual(details.original.text);
  expect(details.before.text).not.toEqual(details.original.text);
  expect(JSON.stringify(details)).not.toContain('private original');
  expect(JSON.stringify(details)).not.toContain('temporary test value');
});
