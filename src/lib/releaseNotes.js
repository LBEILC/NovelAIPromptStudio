export const RELEASE_ICONS = {
  restart: 'restart-line',
  image: 'image-2-line',
  folder: 'folder-settings-line',
  calendar: 'calendar-line',
  translate: 'translate-2',
  speed: 'speed-up-line',
  shield: 'shield-check-line',
  sparkle: 'sparkling-2-line',
  palette: 'palette-line',
  terminal: 'terminal-box-line',
};
export const RELEASE_KINDS = [
  ['new', '新增', 'sparkling-2-line'],
  ['improved', '改进', 'arrow-up-double-line'],
  ['fixed', '修复', 'hammer-line'],
];
export const RELEASE_AREAS = {
  wb: '工作台',
  lib: '图片库',
  gen: '生成',
  agent: 'Agent',
  set: '设置',
  app: '通用',
};
/** @typedef {{ kind: 'new'|'improved'|'fixed', area: 'wb'|'lib'|'gen'|'agent'|'set'|'app', title: string, detail: string, highlight?: boolean, icon?: keyof typeof RELEASE_ICONS }} ReleaseItem */
/** @typedef {{ schema: 'nps-release-notes/1', version: string, date: string, items: ReleaseItem[] }} ReleaseNotes */
/** @param {unknown} input @returns {ReleaseNotes} */
export function validateReleaseNotes(input) {
  const fail = (field) => {
    throw new Error(`无效的更新说明：${field}`);
  };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('object');
  const r = /** @type {ReleaseNotes} */ (input);
  if (r.schema !== 'nps-release-notes/1') fail('schema');
  if (typeof r.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(r.version)) fail('version');
  if (
    typeof r.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
    !Number.isFinite(Date.parse(r.date)) ||
    new Date(r.date).toISOString().slice(0, 10) !== r.date
  )
    fail('date');
  if (!Array.isArray(r.items)) fail('items');
  let highlights = 0;
  for (const item of r.items) {
    if (!item || typeof item !== 'object') fail('item');
    if (!RELEASE_KINDS.some(([kind]) => kind === item.kind)) fail('kind');
    if (!Object.hasOwn(RELEASE_AREAS, item.area)) fail('area');
    if (
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      Array.from(item.title).length > 16 ||
      /[\r\n<>]/.test(item.title)
    )
      fail('title');
    if (typeof item.detail !== 'string' || !item.detail.trim() || /[\r\n<>]/.test(item.detail))
      fail('detail');
    if (item.highlight !== undefined && typeof item.highlight !== 'boolean') fail('highlight');
    if (item.highlight) highlights++;
    if (item.icon !== undefined && !Object.hasOwn(RELEASE_ICONS, item.icon)) fail('icon');
  }
  if (highlights > 2) fail('highlight');
  return r;
}
/** @param {ReleaseNotes} notes */
export const releaseCounts = (notes) =>
  RELEASE_KINDS.map(([kind, label]) => [
    label,
    notes.items.filter((item) => item.kind === kind).length,
  ])
    .filter(([, count]) => count)
    .map(([label, count]) => `${label} ${count} 项`)
    .join(' · ');
export function lastUpdateCheckLabel(value, now = new Date()) {
  if (!value) return '尚未检查';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '尚未检查';
  if (now.getTime() - date.getTime() < 60_000) return '刚刚';
  if (now.toDateString() === date.toDateString())
    return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
