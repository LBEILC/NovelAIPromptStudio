import { useEffect, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { mediaUrl } from '../lib/imageStage.js';
export const TH_H = 38,
  TH_GAP = 4,
  TH_MORE = 28;
export const thumbCache = new Map<string, Promise<string>>();
export function thumbOf(id: string) {
  let p = thumbCache.get(id);
  if (!p) {
    p = invokeUI('library.get', { id }).then((r) =>
      mediaUrl(r.project.thumbnail_path || r.project.image_path),
    );
    thumbCache.set(id, p);
    p.catch(() => thumbCache.delete(id));
  }
  return p;
}
export function Thumb({ id, src }: { id: string; src?: string }) {
  const [url, setUrl] = useState(src || '');
  // 文件找不到时画一个虚线框，不显示浏览器的破图标（用户 10-22：从剪贴板打开、存入图片库后原图丢了）
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
    if (src) return setUrl(src);
    let live = true;
    void thumbOf(id)
      .then((u) => live && setUrl(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, src]);
  if (broken) return <span className="th-miss" data-tip="图片文件找不到了" />;
  return url ? <img src={url} alt="" draggable={false} onError={() => setBroken(true)} /> : null;
}
export function rowsOf(widths: number[], rowW: number) {
  let rows = widths.length ? 1 : 0,
    x = 0;
  for (const w of widths) {
    if (x && x + TH_GAP + w > rowW) {
      rows++;
      x = w;
    } else x += (x ? TH_GAP : 0) + w;
  }
  return rows;
}
export type Row = { key: string; render: (leaving: boolean) => React.ReactNode };
