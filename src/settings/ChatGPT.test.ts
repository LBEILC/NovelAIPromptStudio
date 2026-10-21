import { it, expect } from 'vitest';
import { resetText } from './ChatGPT';

const now = Date.parse('2026-10-21T12:00:00+08:00');
const at = (min: number) => new Date(now + min * 60000).toISOString();
it('writes reset times the way the quota rows show them', () => {
  expect(resetText(null, now)).toBe('');
  expect(resetText(at(0.2), now)).toBe('1 分钟后重置');
  expect(resetText(at(45), now)).toBe('45 分钟后重置');
  expect(resetText(at(300), now)).toBe('5 小时后重置');
  expect(resetText(at(134), now)).toBe('2 小时 14 分后重置');
  expect(resetText(at(3 * 24 * 60), now)).toMatch(/^10 月 24 日 \d\d:\d\d 重置$/);
});
