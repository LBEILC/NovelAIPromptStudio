import { galleryDateBounds, GALLERY_DATE_PRESETS } from './galleryFilters.js';

export const localDateKey = (date) =>
  `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function parseDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return localDateKey(date) === value ? date : null;
}

export function dateRangeValues(value, now = new Date()) {
  if (value.datePreset === 'custom') return [value.dateFrom, value.dateTo];
  const { from, to } = galleryDateBounds(value, now);
  if (!from || !to) return ['', ''];
  to.setDate(to.getDate() - 1);
  return [localDateKey(from), localDateKey(to)];
}

export function dateRangeLabel(value) {
  if (value.datePreset !== 'custom')
    return (
      GALLERY_DATE_PRESETS.find((item) => item.value === value.datePreset)?.label || '不限时间'
    );
  return value.dateFrom === value.dateTo ? value.dateFrom : `${value.dateFrom} 至 ${value.dateTo}`;
}

export function orderedRange(first, second) {
  return first <= second ? [first, second] : [second, first];
}

export function moveDate(value, key) {
  const date = parseDateKey(value);
  if (!date) return value;
  const days = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (key in days) date.setDate(date.getDate() + days[key]);
  else if (key === 'PageUp' || key === 'PageDown') {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + (key === 'PageUp' ? -1 : 1));
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  }
  return localDateKey(date);
}

export function monthCells(month) {
  const [year, index] = month.split('-').map(Number);
  const lead = (new Date(year, index - 1, 1).getDay() + 6) % 7;
  return [
    ...Array(lead).fill(''),
    ...Array.from(
      { length: new Date(year, index, 0).getDate() },
      (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];
}

export function countImportDays(records, month) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const record of records) {
    const day = localDateKey(new Date(record.created_at));
    if (day.startsWith(month + '-')) counts[day] = (counts[day] || 0) + 1;
  }
  return counts;
}
