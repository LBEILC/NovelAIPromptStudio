import { useEffect, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { BlurImg, type BlurImage } from '../kit/blur';
export const TH_H = 38,
  TH_GAP = 4,
  TH_MORE = 28;
type ThumbData = { path: string; image: BlurImage };
export const thumbCache = new Map<string, Promise<ThumbData>>();
export function thumbOf(id: string) {
  let p = thumbCache.get(id);
  if (!p) {
    p = invokeUI('library.get', { id }).then((r) => ({
      path: r.project.thumbnail_path || r.project.image_path,
      image: r.project,
    }));
    thumbCache.set(id, p);
    p.catch(() => thumbCache.delete(id));
  }
  return p;
}
/** 版本栏的小图：太小，不放眼睛；模糊时在舞台上点眼睛，整个标签页一起显示（2.37） */
export function Thumb({
  id,
  path,
  image,
  tab,
}: {
  id: string;
  path?: string;
  image?: BlurImage;
  tab?: string;
}) {
  const [data, setData] = useState<ThumbData | null>(path ? { path, image } : null);
  // 文件找不到时画一个虚线框，不显示浏览器的破图标（用户 10-22：从剪贴板打开、存入图片库后原图丢了）
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
    if (path) return setData({ path, image });
    let live = true;
    void thumbOf(id)
      .then((d) => live && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, path, image]);
  if (broken) return <span className="th-miss" data-tip="图片文件找不到了" />;
  return data ? (
    <BlurImg
      image={data.image}
      path={data.path}
      tab={tab}
      eye={false}
      alt=""
      draggable={false}
      onError={() => setBroken(true)}
    />
  ) : null;
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
