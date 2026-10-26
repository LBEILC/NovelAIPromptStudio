// 图片模糊（doc/design.md 2.37，1.8.3）：显示图片的地方都用这里的 BlurImg，不留漏网的地方。
// 模糊只影响显示：复制、导出、备份、Agent 拿到的都是原图。模糊的图换成主进程给的一张极小的图再拉伸（认不出内容），
// 中间一个小眼睛，点一下才显示；悬停不显示，免得鼠标划过就露出来。
// 临时显示的范围：工作台按标签页（点过一次，这个标签页的图都显示，关掉标签页恢复）；图片库按张（离开图片库恢复）。
import { useEffect, useSyncExternalStore, type ImgHTMLAttributes, type Ref } from 'react';
import { mediaUrl } from '../lib/imageStage.js';
import { markNsfw, saveBlurSettings, useBlurSettings, useNsfwState } from '../state/blur';
import type { NsfwState } from '../shared/nsfw';
import { Icon } from './controls';
import type { MenuEntry } from './menu';

export type BlurImage = { id: string; nsfw?: NsfwState } | null | undefined;
export type BlurMode = 'off' | 'nsfw' | 'all';

// ---- 临时显示 ----
let revealed = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
/** 显示这一张（图片库）或这个标签页（工作台）的图 */
export function reveal(key: string) {
  if (revealed.has(key)) return;
  revealed = new Set(revealed).add(key);
  emit();
}
/** 收回：离开图片库时收回所有按张显示的，关掉标签页时收回那个标签页的 */
export function hideAgain(match: (key: string) => boolean) {
  const next = new Set([...revealed].filter((k) => !match(k)));
  if (next.size === revealed.size) return;
  revealed = next;
  emit();
}
export const tabKey = (tabId: string) => `tab:${tabId}`;
const imageKey = (id: string) => `img:${id}`;
export const isImageKey = (key: string) => key.startsWith('img:');
export const isTabKey = (key: string) => key.startsWith('tab:');
function useRevealed() {
  return useSyncExternalStore(subscribe, () => revealed);
}

// 启动时设置还没读到：按这台电脑上次的模式显示，免得开着"模糊所有图片"时一启动先露出原图；
// 从来没读到过（新装、清了本地数据）就先全部模糊，读到以后马上换成真的
const MODE_KEY = 'novelai-prompt-studio.blur-mode.v1';
const lastMode = (): BlurMode => {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'off' || v === 'nsfw' || v === 'all' ? v : 'all';
  } catch {
    return 'all';
  }
};

/** 现在生效的模式：标题栏的"模糊所有图片"开着时一律是 all */
export function useBlurMode(): BlurMode {
  const s = useBlurSettings();
  const mode = s ? (s.quickAll ? 'all' : s.mode) : null;
  useEffect(() => {
    if (!mode) return;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* 存不了就每次启动先按全部模糊 */
    }
  }, [mode]);
  return mode ?? lastMode();
}

/**
 * 这张图要不要模糊。image 为空（没有图片记录的：ZIP 预览、从文件选的底图、Vibe 参考图）时只在"所有图片都模糊"下模糊。
 * tab：工作台里传标签页 ID，临时显示按标签页算；不传按这一张算。
 */
export function useBlurred(image: BlurImage, tab?: string) {
  const mode = useBlurMode();
  const state = useNsfwState(image ?? null);
  const shown = useRevealed();
  const key = tab ? tabKey(tab) : image ? imageKey(image.id) : '';
  const want = mode === 'all' || (mode === 'nsfw' && !!state?.value);
  const blurred = want && !(key && shown.has(key));
  return { blurred, reveal: () => key && reveal(key), state };
}

/** NSFW 的来源，详情栏和悬停写："NSFW · 自动（含 nude）""NSFW · 手动标记" */
export function nsfwLabel(state: NsfwState | null | undefined) {
  if (!state?.value) return state?.source === 'manual' ? '不是 NSFW · 手动标记' : '';
  return state.source === 'manual'
    ? 'NSFW · 手动标记'
    : `NSFW · 自动${state.tag ? `（含 ${state.tag}）` : ''}`;
}

/**
 * 右键菜单里的标记（图片库、工作台舞台、版本栏）。一张：按现在的状态给"标为 NSFW"或"不是 NSFW"，
 * 手动标过的多一项"恢复自动判定"；多张、或者不知道这张现在的状态（state 传 undefined，版本栏）：三项都给。
 * 手动的优先，改敏感词表不会覆盖。
 */
export function nsfwMenu(
  ids: string[],
  state: NsfwState | null | undefined,
  onError: (message: string) => void,
): MenuEntry[] {
  const mark = (value: 'nsfw' | 'safe' | 'auto') => () =>
    void markNsfw(ids, value).catch((e) => onError((e as Error).message));
  const multi = ids.length > 1,
    all = multi || state === undefined;
  return [
    ...(all || !state?.value
      ? [{ label: multi ? `标为 NSFW（${ids.length} 张）` : '标为 NSFW', onSelect: mark('nsfw') }]
      : []),
    ...(all || state?.value
      ? [
          {
            label: multi ? `标为不是 NSFW（${ids.length} 张）` : '不是 NSFW',
            onSelect: mark('safe'),
          },
        ]
      : []),
    ...(all || state?.source === 'manual'
      ? [{ label: '恢复自动判定', onSelect: mark('auto') }]
      : []),
  ];
}

type BlurImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  image: BlurImage;
  /** 原图或缩略图的文件路径 */
  path: string;
  /** 工作台：按标签页临时显示 */
  tab?: string;
  /** 眼睛的大小；太小的缩略图（标签页、版本栏）不放眼睛，在舞台上点 */
  eye?: 'md' | 'sm' | false;
  ref?: Ref<HTMLImageElement>;
};

/** 代替 <img>：父元素要能定位（眼睛贴在它的中间） */
export function BlurImg({ image, path, tab, eye = 'md', className, ref, ...rest }: BlurImgProps) {
  const { blurred, reveal: show } = useBlurred(image, tab);
  return (
    <>
      <img
        ref={ref}
        {...rest}
        className={`${className ?? ''}${blurred ? ' blurred' : ''}`}
        src={path ? mediaUrl(path, blurred ? { blur: true } : undefined) : undefined}
        data-blur={blurred ? '' : undefined}
      />
      {blurred && eye && <BlurEye size={eye} tab={!!tab} onReveal={show} />}
    </>
  );
}

export function BlurEye({
  size = 'md',
  tab,
  onReveal,
}: {
  size?: 'md' | 'sm';
  tab?: boolean;
  onReveal: () => void;
}) {
  const label = tab ? '显示这个标签页的图' : '显示这张图';
  return (
    <button
      type="button"
      className={`btn icon blur-eye ${size}`}
      aria-label={label}
      data-blur-eye=""
      // 不让点眼睛变成选中、打开、拖动这张图
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onReveal();
      }}
    >
      <Icon name="eye-line" />
    </button>
  );
}

/**
 * 标题栏齿轮左边的"模糊所有图片"（2.37）：点一下所有图片都模糊，再点回到设置里选的模式；记住开关，重启后照旧。
 * 设置里已经选了"所有图片都模糊"时不能点。Windows 托盘菜单里也有同一项。
 */
export function BlurToggle() {
  const s = useBlurSettings();
  if (!s) return null;
  const locked = s.mode === 'all';
  const on = locked || s.quickAll;
  return (
    <button
      className={`btn quiet sm icon tb-blur ${on ? 'on' : ''}`}
      aria-label={locked ? '设置里选了所有图片都模糊' : on ? '恢复显示' : '模糊所有图片'}
      aria-pressed={on}
      aria-disabled={locked || undefined}
      data-blur-toggle=""
      onClick={() => {
        if (!locked) void saveBlurSettings({ quickAll: !s.quickAll }).catch(() => {});
      }}
    >
      <Icon name={on ? 'eye-off-fill' : 'eye-off-line'} />
    </button>
  );
}

/** 临时显示什么时候收回：离开图片库时收回按张显示的；关掉的标签页收回它那一份 */
export function useBlurReset(page: string, tabs: { id: string }[]) {
  useEffect(() => {
    if (page !== 'gallery') hideAgain(isImageKey);
  }, [page]);
  const ids = tabs.map((t) => t.id).join('\n');
  useEffect(() => {
    const live = new Set(ids.split('\n').map(tabKey));
    hideAgain((k) => isTabKey(k) && !live.has(k));
  }, [ids]);
}
