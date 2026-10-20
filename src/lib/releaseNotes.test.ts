import { describe, expect, it } from 'vitest';
import { validateReleaseNotes, releaseCounts, lastUpdateCheckLabel } from './releaseNotes.js';
const fixture = () => ({
  schema: 'nps-release-notes/1',
  version: '1.2.0',
  date: '2026-10-20',
  items: [
    {
      kind: 'new',
      area: 'lib',
      highlight: true,
      icon: 'calendar',
      title: '日期范围',
      detail: '支持按日期筛选图片。',
    },
    { kind: 'fixed', area: 'set', highlight: true, title: '保存设置', detail: '正确保存修改。' },
  ],
});
describe('structured release notes contract', () => {
  it('accepts the documented schema and counts every item including highlights', () => {
    expect(validateReleaseNotes(fixture())).toEqual(fixture());
    expect(releaseCounts(validateReleaseNotes(fixture()))).toBe('新增 1 项 · 修复 1 项');
  });
  it.each(['schema', 'version', 'date', 'items'])('rejects a missing %s', (key) => {
    const value: any = fixture();
    delete value[key];
    expect(() => validateReleaseNotes(value)).toThrow();
  });
  it.each(['kind', 'area', 'title', 'detail'])('rejects a missing item %s', (key) => {
    const value: any = fixture();
    delete value.items[0][key];
    expect(() => validateReleaseNotes(value)).toThrow();
  });
  it.each(['kind', 'area', 'icon'])('rejects unknown %s', (key) => {
    const value: any = fixture();
    value.items[0][key] = 'unknown';
    expect(() => validateReleaseNotes(value)).toThrow(key);
  });
  it('rejects three highlights and invalid dates', () => {
    const value = fixture();
    value.items.push({ ...value.items[0] });
    expect(() => validateReleaseNotes(value)).toThrow('highlight');
    expect(() => validateReleaseNotes({ ...fixture(), date: '2026-02-30' })).toThrow('date');
  });
  it('formats last-check labels in local time', () => {
    const now = new Date(2026, 9, 20, 12);
    expect(lastUpdateCheckLabel('', now)).toBe('尚未检查');
    expect(lastUpdateCheckLabel(now.toISOString(), now)).toBe('刚刚');
    expect(lastUpdateCheckLabel(new Date(2026, 9, 20, 9, 12).toISOString(), now)).toBe(
      '今天 09:12',
    );
    expect(lastUpdateCheckLabel(new Date(2026, 9, 19).toISOString(), now)).toBe('2026-10-19');
  });
});
