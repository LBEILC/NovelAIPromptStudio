import { useEffect, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { BlurImg, type BlurImage } from '../kit/blur';
import type { ImageOperation } from '../shared/generation';
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

/**
 * 局部重绘那一版实际用的提示词（doc/design.md 2.35 补充，1.8.6）：快照照旧是源图那一版的
 * （和图片文件里的元数据一致），这次重绘用的草稿记在操作记录里。版本栏、悬停对比、两张图对比
 * 都拿它来比，写成"重绘提示词"；没有记录的（旧版本）退回快照。
 */
export function promptOf(v: {
  project: import('../shared/types').ImageProject;
  operation?: import('../shared/generation').ImageOperation;
}) {
  const p = v.operation?.kind === 'inpaint' ? v.operation.prompt : undefined;
  return p ? ({ ...v.project, ...p } as import('../shared/types').ImageProject) : v.project;
}
export const isRedraw = (v: { operation?: import('../shared/generation').ImageOperation }) =>
  v.operation?.kind === 'inpaint' && !!v.operation.prompt;

/**
 * 右键"用这次重绘的提示词"：把那份提示词放回草稿（各节照原样写回），通知里可以撤销。
 * 角色对不上（草稿里删掉或换了角色）的那几节跳过。
 */
export async function applyRedrawPrompt({
  tabId,
  version,
  before,
  notify,
}: {
  tabId: string;
  version: {
    project: import('../shared/types').ImageProject;
    operation?: import('../shared/generation').ImageOperation;
  };
  before?: () => Promise<void>;
  notify: ReturnType<typeof import('../kit/toast').useNotifications>;
}) {
  const { createPromptDocument, serializePromptSection } = await import('../lib/promptDocument');
  try {
    await before?.();
    const old = await invokeUI('workbench.get', { tabId });
    const want = createPromptDocument(promptOf(version));
    const changed: { scope: string; text: string; was: string }[] = [];
    let skipped = 0;
    for (const s of want.scopes) {
      const cur = old.document.scopes.find((x) => x.scope.key === s.scope.key);
      if (!cur) {
        if (serializePromptSection(s).trim()) skipped++;
        continue;
      }
      const text = serializePromptSection(s),
        was = serializePromptSection(cur);
      if (text !== was) changed.push({ scope: s.scope.key, text, was });
    }
    if (!changed.length) {
      notify({ text: '草稿和这次重绘的提示词一样' });
      return;
    }
    for (const c of changed) await invokeUI('prompt.set', { tabId, scope: c.scope, text: c.text });
    notify({
      text: skipped
        ? `已换成这次重绘的提示词；${skipped} 个角色草稿里没有，没有换`
        : '已换成这次重绘的提示词',
      tone: 'success',
      action: {
        label: '撤销',
        onClick: () =>
          void (async () => {
            for (const c of changed)
              await invokeUI('prompt.set', { tabId, scope: c.scope, text: c.was });
          })().catch((e) => notify({ text: (e as Error).message, tone: 'error' })),
      },
    });
  } catch (e) {
    notify({ text: (e as Error).message, tone: 'error' });
  }
}
/** 放大、增强那一版：图片的像素变了，草稿的生成尺寸不变（2.34），版本行写出像素的变化 */
export function OpSize({ from, to }: { from?: string; to?: string }) {
  const [px, setPx] = useState<[string, string] | null>(null);
  useEffect(() => {
    if (!from || !to) return;
    let live = true;
    const size = (id: string) =>
      thumbOf(id).then((d) => {
        const m = (d.image as { metadata?: { width?: unknown; height?: unknown } }).metadata;
        return m?.width && m?.height ? `${m.width} × ${m.height}` : '';
      });
    void Promise.all([size(from), size(to)])
      .then((s) => live && setPx(s as [string, string]))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [from, to]);
  if (!px || !px[0] || !px[1]) return <span className="what" />;
  return <span className="what">{px[0] === px[1] ? '尺寸不变' : `尺寸 ${px[0]} → ${px[1]}`}</span>;
}
const OP_VERB: Record<string, string> = {
  upscale: '放大',
  enhance: '增强',
  inpaint: '局部重绘',
  outpaint: '扩图',
};
const SIDES: [keyof NonNullable<ImageOperation['edges']>, string][] = [
  ['left', '左'],
  ['right', '右'],
  ['top', '上'],
  ['bottom', '下'],
];
/**
 * Agent 发起的图片操作在待确认时写清楚"对哪张图做什么"（2.48）：队列面板和版本栏共用。
 * prompt 是局部重绘、扩图用的草稿提示词，确认前要看得到；放大、增强不用草稿，没有。
 */
export function opPlan(job: {
  operation?: string;
  operationDetails?: ImageOperation;
  parentNumber?: number;
}) {
  const o = job.operationDetails,
    kind = job.operation || o?.kind || '';
  const src =
    !job.parentNumber || job.parentNumber === 1 ? '原图' : `第 ${job.parentNumber} 版的图`;
  const scale =
    o?.scale === 'max'
      ? '放大到最大'
      : !o?.scale || o.scale === 1
        ? '原尺寸'
        : `放大 ${o.scale} 倍`;
  const edges = SIDES.filter(([k]) => o?.edges?.[k])
    .map(([k, n]) => `${n} +${o!.edges![k]}`)
    .join('、');
  const text =
    kind === 'upscale'
      ? `放大${src} · 宽高各 2 倍`
      : kind === 'enhance'
        ? `增强${src} · 幅度 ${o?.magnitude ?? 2} · ${scale}`
        : kind === 'inpaint'
          ? `重绘${src}里的一块${o?.rect ? ` · 框 ${o.rect.width} × ${o.rect.height}` : ''} · 强度 ${(o?.strength ?? 1).toFixed(2)}`
          : kind === 'outpaint'
            ? `给${src}扩图${edges ? ` · ${edges}` : ''} · ${o?.mode === 'edges' ? `按边分块 ${o.blocks?.length || 1} 次` : '一次画完'}`
            : '';
  const prompt =
    kind === 'inpaint' || kind === 'outpaint' ? o?.prompt?.metadata?.prompt_raw?.trim() || '' : '';
  return { name: OP_VERB[kind] || '', text, prompt };
}
