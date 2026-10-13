/** Use local calendar days, matching the rest of the desktop interface. */
export function formatImportDate(value: string | undefined, now = new Date()): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  return (
    (day(date) === day(now)
      ? '今天 ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
      : day(date)) + ' 导入'
  );
}
