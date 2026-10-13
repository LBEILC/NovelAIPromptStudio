import { expect, it } from 'vitest';
import { formatImportDate } from './displayDate';

it('formats local calendar days and same-day import time without exposing ISO strings', () => {
  const now = new Date(2026, 9, 13, 12, 0);
  expect(formatImportDate(new Date(2026, 9, 13, 8, 27).toISOString(), now)).toBe('今天 08:27 导入');
  expect(formatImportDate(new Date(2026, 9, 12, 23, 59).toISOString(), now)).toBe(
    '2026-10-12 导入',
  );
  expect(formatImportDate(new Date(2025, 0, 2).toISOString(), now)).toBe('2025-01-02 导入');
  expect(formatImportDate('invalid', now)).toBe('');
  expect(formatImportDate(undefined, now)).toBe('');
});
