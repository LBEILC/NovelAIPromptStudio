import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  countImportDays,
  dateRangeValues,
  localDateKey,
  monthCells,
  moveDate,
  orderedRange,
  parseDateKey,
} from './dateRange.js';

describe('local calendar ranges', () => {
  it('includes today in relative ranges and starts this year on January 1', () => {
    const now = new Date(2026, 0, 3, 12);
    expect(dateRangeValues({ datePreset: 'today' }, now)).toEqual(['2026-01-03', '2026-01-03']);
    expect(dateRangeValues({ datePreset: '7d' }, now)).toEqual(['2025-12-28', '2026-01-03']);
    expect(dateRangeValues({ datePreset: 'year' }, now)).toEqual(['2026-01-01', '2026-01-03']);
    expect(orderedRange('2026-10-20', '2026-10-17')).toEqual(['2026-10-17', '2026-10-20']);
    expect(orderedRange('2026-10-20', '2026-10-20')).toEqual(['2026-10-20', '2026-10-20']);
  });
  it.each(['2026-02-30', '2026-1-5', '2026-13-01', '2026-00-01', '2026-02-29'])(
    'rejects invalid date %s',
    (date) => {
      expect(parseDateKey(date)).toBeNull();
    },
  );
  it('keeps keyboard navigation valid across months, leap years and year boundaries', () => {
    expect(moveDate('2026-12-31', 'ArrowRight')).toBe('2027-01-01');
    expect(moveDate('2026-01-01', 'ArrowLeft')).toBe('2025-12-31');
    expect(moveDate('2026-03-31', 'PageUp')).toBe('2026-02-28');
    expect(moveDate('2028-01-31', 'PageDown')).toBe('2028-02-29');
    expect(moveDate('2026-01-03', 'ArrowUp')).toBe('2025-12-27');
    expect(moveDate('2026-12-28', 'ArrowDown')).toBe('2027-01-04');
  });
  it('starts calendar weeks on Monday with the correct blanks for every month', () => {
    for (let month = 1; month <= 12; month++) {
      const cells = monthCells(`2026-${String(month).padStart(2, '0')}`);
      expect(cells.filter((value: string) => !value)).toHaveLength(
        (new Date(2026, month - 1, 1).getDay() + 6) % 7,
      );
      expect(cells.filter(Boolean)).toHaveLength(new Date(2026, month, 0).getDate());
    }
  });
  it('groups by the local day rather than the ISO date prefix', () => {
    const local = new Date(2026, 9, 20, 0, 15);
    const other = new Date(2026, 9, 20, 23, 45);
    expect(
      countImportDays(
        [
          { created_at: local.toISOString() },
          { created_at: other.toISOString() },
          { created_at: new Date(2026, 8, 30).toISOString() },
        ],
        '2026-10',
      ),
    ).toEqual({ [localDateKey(local)]: 2 });
  });
});

it('uses the previous local date when UTC has already crossed midnight', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { countImportDays } from './src/lib/dateRange.js';
    process.stdout.write(JSON.stringify(countImportDays([{ created_at: '2026-10-21T02:30:00Z' }], '2026-10')));
  `,
    ],
    { encoding: 'utf8', env: { ...process.env, TZ: 'America/Los_Angeles' } },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ '2026-10-20': 1 });
});
