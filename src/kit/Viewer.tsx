// 大图（doc/design.md 2.13、2.17）：盖住标题栏以下的整个窗口，底色和页面相同，不用黑色遮罩。
// 打开时适应窗口（整张图放得下、尽量大，小图也放大）；工具条上的比例按实际像素算。
// 滚轮以指针为中心缩放、拖动平移，都跟手；双击回到适应窗口。← / → 一张一张走；↑ / ↓ 跳到上一组 / 下一组的第一张；到头就停。
// 打开 --dur-3（底色淡入，图片从 --enter-scale 放大）；关闭淡出 --dur-1；换一张朝那个方向换内容。
// 图片下面的底色（2.32）：默认浅灰棋盘格，工具条上可以换成白、黑，记住选择。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Presence, dur, useSwap } from './motion';
import { ToWin, useDismiss } from './layer';
import { Icon, Seg } from './controls';
import { markLoaded, readMatte, writeMatte, type Matte } from './alpha';
import { BlurImg, nsfwMenu, type BlurImage } from './blur';
import { ContextMenu, type MenuEntry } from './menu';
import { invokeUI } from '../lib/commands';
import { useNotifications } from './toast';
import { useNsfwState } from '../state/blur';

export interface ViewerItem {
  id: string;
  /** 图片的文件路径 */
  path: string;
  /** 图片记录：决定要不要模糊（2.37）；没有记录的（ZIP 预览）只在"所有图片都模糊"时模糊 */
  image?: BlurImage;
  /** 工作台里打开的大图：临时显示按标签页算 */
  tab?: string;
  /** 这一张属于第几组：↑ ↓ 在组之间跳 */
  group?: string;
}
export interface ViewerProps {
  open: boolean;
  items: ViewerItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onCopy?: (item: ViewerItem) => void;
  onSaveAs?: (item: ViewerItem) => void;
  onOpenWorkbench?: (item: ViewerItem) => void;
  /** 盖在图片上方正中的标记（挑图：保留 / 不要 / 未定） */
  badge?: React.ReactNode;
  /** 工具条上额外的按钮，放在操作提示后面（挑图：保留、不要） */
  actions?: React.ReactNode;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function Viewer(p: ViewerProps) {
  // 关的时候照最后打开时的那张淡出：调用方多半一关就把图片列表清空（图片库），
  // 不留住的话淡出那一帧没东西可画，大图直接消失（用户 10-25）
  const last = useRef(p);
  if (p.open && p.items.length) last.current = p;
  return (
    <Presence show={p.open && p.items.length > 0}>
      {(leaving, ref) => (
        <ToWin>
          {/* 不能等 leaving：关上后的第一次渲染 leaving 还没变成 true，这时就要用留住的那份 */}
          <Body
            {...(p.open && p.items.length ? p : last.current)}
            leaving={leaving}
            nodeRef={ref}
          />
        </ToWin>
      )}
    </Presence>
  );
}

function Body(p: ViewerProps & { leaving: boolean; nodeRef: React.RefObject<HTMLElement | null> }) {
  const ov = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState({ z: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const [dir, setDir] = useState<'zoom3' | 'left' | 'right'>('zoom3');
  const [seq, setSeq] = useState(0);
  const [pct, setPct] = useState<number | null>(null);
  const [matte, setMatte] = useState<Matte>(readMatte);
  const img = useRef<HTMLImageElement | null>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const i = clamp(p.index, 0, p.items.length - 1);
  const item = p.items[i];
  // 右键：标为 NSFW / 不是 NSFW（1.8.3，2.37）；只有图片库里的图（有记录）才有
  const [menu, setMenu] = useState<[number, number] | null>(null);
  const nsfw = useNsfwState(item?.image ?? null);
  const notify = useNotifications();
  useLayoutEffect(() => {
    p.nodeRef.current = ov.current;
  });
  // Esc 只关最上面一层（大图可能盖在 ZIP 挑选这类对话框上）
  useDismiss(!p.leaving, p.onClose, [ov], { modal: true });
  // 换到第几张可能来自外面（挑图标完自动跳下一张）：在渲染时比对，换图的方向动画照样有
  const [shown, setShown] = useState(i);
  if (shown !== i) {
    setShown(i);
    setDir(i > shown ? 'right' : 'left');
    setSeq((n) => n + 1);
    setZ({ z: 1, x: 0, y: 0 });
  }
  const go = (next: number) => {
    next = clamp(next, 0, p.items.length - 1);
    if (next !== i) p.onIndex(next);
  };
  const jumpGroup = (d: 1 | -1) => {
    const g = item?.group;
    if (g == null) return go(i + d);
    let k = i;
    if (d > 0) {
      while (k < p.items.length && p.items[k].group === g) k++;
    } else {
      while (k > 0 && p.items[k - 1].group === g) k--;
      if (k === 0) return;
      const prev = p.items[k - 1].group;
      k--;
      while (k > 0 && p.items[k - 1].group === prev) k--;
    }
    if (k < p.items.length) go(k);
  };
  useEffect(() => {
    if (p.leaving) return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as Element)?.closest?.('input, textarea')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        go(i + (e.key === 'ArrowLeft' ? -1 : 1));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        jumpGroup(e.key === 'ArrowUp' ? -1 : 1);
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  });
  // 比例按图片的实际像素算：适应窗口时可能是 55%，100% 是原始大小
  const measure = () => {
    const el = img.current;
    if (el && el.naturalWidth) setPct(Math.round(((z.z * el.clientWidth) / el.naturalWidth) * 100));
  };
  useLayoutEffect(measure, [z.z, item?.id]);
  useEffect(() => {
    const el = ov.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const im = img.current;
      if (!im) return;
      e.preventDefault();
      const fr = im.parentElement!.getBoundingClientRect(),
        mx = e.clientX - (fr.left + fr.width / 2),
        my = e.clientY - (fr.top + fr.height / 2);
      setAnimate(false);
      setZ((v) => {
        const nz = clamp(v.z * Math.exp(-e.deltaY * 0.0015), 0.5, 8),
          k = nz / v.z;
        return { z: nz, x: mx - k * (mx - v.x), y: my - k * (my - v.y) };
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = pan.current;
      if (!d) return;
      const dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      setAnimate(false);
      setZ((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    };
    const up = () => {
      const d = pan.current;
      if (!d) return;
      pan.current = null;
      img.current?.classList.remove('panning');
      if (d.moved) {
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', swallow, { capture: true }), 0);
      }
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    return () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
  }, []);
  const frames = useSwap({ item, seq, dir }, (v) => `${v.item?.id}-${v.seq}`);
  if (!item) return null;
  const transform =
    z.z === 1 && !z.x && !z.y ? undefined : `translate(${z.x}px, ${z.y}px) scale(${z.z})`;
  return (
    <div
      ref={ov}
      className={`viewer-ov ${p.leaving ? 'leaving' : ''}`}
      data-enter="fade3"
      role="dialog"
      aria-modal="true"
      aria-label="大图"
      onClick={(e) => {
        const t = e.target as Element;
        if (
          t.classList.contains('viewer-ov') ||
          t.classList.contains('viewer-img') ||
          t.classList.contains('vframe')
        )
          p.onClose();
      }}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest('.viewer-bar')) return;
        setAnimate(dur(3) > 0);
        setZ({ z: 1, x: 0, y: 0 });
      }}
    >
      <div className="viewer-img swap">
        {frames.map(({ key, value, leaving }) => (
          <div key={key} className={`vframe ${leaving ? 'leaving' : ''}`} data-enter={value.dir}>
            <BlurImg
              ref={leaving ? undefined : img}
              image={value.item.image}
              path={value.item.path}
              tab={value.item.tab}
              eye={leaving ? false : 'md'}
              className={`vz ${matte === 'checker' ? 'alpha-bg' : `matte-${matte}`}`}
              alt=""
              draggable={false}
              onLoad={(e) => {
                markLoaded(e);
                if (!leaving) measure();
              }}
              style={
                leaving
                  ? undefined
                  : ({
                      transform,
                      transition: animate ? 'transform var(--dur-3) var(--ease-move)' : 'none',
                      '--vz': z.z,
                    } as React.CSSProperties)
              }
              onContextMenu={(e) => {
                if (leaving || !value.item.image) return;
                e.preventDefault();
                setMenu([e.clientX, e.clientY]);
              }}
              onPointerDown={(e) => {
                if (leaving || e.button !== 0) return;
                e.preventDefault();
                pan.current = { x: e.clientX, y: e.clientY, ox: z.x, oy: z.y, moved: false };
                e.currentTarget.classList.add('panning');
              }}
            />
          </div>
        ))}
      </div>
      {p.badge && <div className="viewer-badge">{p.badge}</div>}
      {item.image && (
        <ContextMenu
          at={menu}
          onClose={() => setMenu(null)}
          items={
            [
              // 最上面是复制图片、另存为、在文件夹中显示，和工具条上的按钮做同一件事（用户 10-27）
              ...(p.onCopy
                ? [{ label: '复制图片', icon: 'file-copy-line', onSelect: () => p.onCopy!(item) }]
                : []),
              ...(p.onSaveAs
                ? [{ label: '另存为…', icon: 'download-2-line', onSelect: () => p.onSaveAs!(item) }]
                : []),
              {
                label: '在文件夹中显示',
                icon: 'folder-open-line',
                onSelect: () =>
                  void invokeUI('file.reveal', { path: item.path }).catch((e) =>
                    notify({ text: (e as Error).message, tone: 'error' }),
                  ),
              },
              'sep',
              ...nsfwMenu([item.image.id], nsfw, (text) => notify({ text, tone: 'error' })),
            ] as MenuEntry[]
          }
        />
      )}
      <div className="viewer-bar">
        <button
          className="btn quiet sm icon"
          aria-label="上一张"
          disabled={i === 0}
          onClick={() => go(i - 1)}
        >
          <Icon name="arrow-left-s-line" />
        </button>
        <span className="mono">
          {i + 1} / {p.items.length}
        </span>
        <button
          className="btn quiet sm icon"
          aria-label="下一张"
          disabled={i === p.items.length - 1}
          onClick={() => go(i + 1)}
        >
          <Icon name="arrow-right-s-line" />
        </button>
        <span className="help">滚轮缩放 · 拖动平移 · 双击适应窗口</span>
        {p.actions}
        <span className="sp" />
        <Seg
          className="vbg"
          label="底色"
          value={matte}
          onChange={(v) => {
            setMatte(v);
            writeMatte(v);
          }}
          items={[
            ['checker', <i className="vbg-sw checker" />, '底色：棋盘格'],
            ['white', <i className="vbg-sw white" />, '底色：白'],
            ['black', <i className="vbg-sw black" />, '底色：黑'],
          ]}
        />
        <span className="vz-sep" />
        {p.onCopy && (
          <button
            className="btn quiet sm icon"
            aria-label="复制图片"
            onClick={() => p.onCopy?.(item)}
          >
            <Icon name="file-copy-line" />
          </button>
        )}
        {p.onSaveAs && (
          <button
            className="btn quiet sm icon"
            aria-label="另存为"
            onClick={() => p.onSaveAs?.(item)}
          >
            <Icon name="download-2-line" />
          </button>
        )}
        {p.onOpenWorkbench && (
          <button
            className="btn quiet sm icon"
            aria-label="在工作台打开"
            onClick={() => p.onOpenWorkbench?.(item)}
          >
            <Icon name="layout-right-2-line" />
          </button>
        )}
        <span className="vz-sep" />
        <span className="mono muted vz-pct">{pct ?? 100}%</span>
        <button className="btn quiet sm" onClick={p.onClose}>
          <Icon name="close-line" />
          关闭
        </button>
      </div>
    </div>
  );
}
