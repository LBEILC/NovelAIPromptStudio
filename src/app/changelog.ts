// 打包进来的更新说明（release-notes/*.json，1.2.0 起才有），关于页的更新日志和更新后的新功能卡片（doc/design.md 2.36）共用。
import type { ReleaseNotes } from '../lib/releaseNotes.js';

type Item = ReleaseNotes['items'][number];
export const cmpVersion = (a: string, b: string) => {
  const x = a.split('.').map(Number),
    y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
/** 新的在前 */
export const CHANGELOG = (
  Object.values(
    import.meta.glob('../../release-notes/*.json', { eager: true, import: 'default' }),
  ) as ReleaseNotes[]
).sort((a, b) => cmpVersion(b.version, a.version));

/** 新功能卡片最多几页；多出来的在最后一页按版本列标题 */
export const NEWS_PAGES = 6;
export interface NewsPage {
  version: string;
  item: Item;
}
/**
 * 上次看过（seen）之后、到当前版本为止，每一版标了重点的功能，最新的在前。
 * seen 是 null（1.8.2 之前就装了的老用户）时只看当前这一版。
 */
export function newsSince(seen: string | null, current: string, log = CHANGELOG) {
  const versions = log.filter(
    (n) =>
      cmpVersion(n.version, current) <= 0 &&
      (seen ? cmpVersion(n.version, seen) > 0 : n.version === current),
  );
  const all: NewsPage[] = versions.flatMap((n) =>
    n.items.filter((x) => x.highlight).map((item) => ({ version: n.version, item })),
  );
  const pages = all.slice(0, NEWS_PAGES);
  const rest = all.slice(NEWS_PAGES);
  const more = [...new Set(rest.map((x) => x.version))].map((version) => ({
    version,
    titles: rest.filter((x) => x.version === version).map((x) => x.item.title),
  }));
  return { pages, more };
}
