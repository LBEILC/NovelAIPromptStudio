// 通知（doc/design.md 2.11）：最多同时 3 条，叠在窗口底部，最新的在最前；后面的缩小一点、往上露出一条边，
// 看得出还有几条。指针移上去整叠展开成一列（最新的在最下），离开收回；指针停在上面时都不消失。
// 每条右边都有关闭按钮。和最前那条文字一样的新通知原地换内容，不再叠一条。
// 软件自己发的（source: 'background'）不抢到带操作按钮的通知前面，排在它后面。
// 底部有操作条（[data-dock] 里的多选条、导入进度）时，通知停在它上方 --sp-2，不盖住可以点的东西。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ToWin, useWin } from './layer';
import { useExitList, ms } from './motion';

export interface Notice {
  text: string;
  /** 不写时按文字判断：以"已"开头是做成了，带"失败"是没做成 */
  tone?: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  duration?: number;
  source?: 'user' | 'background';
}
type Shown = Notice & { id: number; replace: boolean };
/** 最多同时显示几条；再来一条时最早的那条淡出 */
const MAX = 3;
const NoticeContext = createContext<((notice: Notice) => void) | null>(null);
export function useNotifications() {
  const notify = useContext(NoticeContext);
  if (!notify) throw new Error('NotificationProvider is required');
  return notify;
}
const markOf = (n: Notice) => {
  const tone =
    n.tone ||
    (/^(没能|.*失败)/.test(n.text)
      ? 'error'
      : /^(已|Agent 的生成任务已完成)/.test(n.text)
        ? 'success'
        : 'info');
  return tone === 'success' ? 'ok' : tone === 'error' ? 'danger' : '';
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Shown[]>([]);
  const seq = useRef(0);
  const notify = useCallback((n: Notice) => {
    setList((cur) => {
      const shown: Shown = { ...n, id: ++seq.current, replace: false };
      const front = cur[0];
      // 和最前那条说的是同一件事（连着复制两次）：原地换内容，不叠
      if (front && front.text === n.text && front.action?.label === n.action?.label)
        return [{ ...shown, replace: true }, ...cur.slice(1)];
      const next =
        n.source === 'background' && front?.action
          ? [front, shown, ...cur.slice(1)]
          : [shown, ...cur];
      return next.slice(0, MAX);
    });
  }, []);
  const dismiss = useCallback((id: number) => {
    setList((cur) => (cur.some((n) => n.id === id) ? cur.filter((n) => n.id !== id) : cur));
  }, []);
  return (
    <NoticeContext.Provider value={notify}>
      {children}
      <Toasts items={list} onDismiss={dismiss} />
    </NoticeContext.Provider>
  );
}

function Toasts({ items, onDismiss }: { items: Shown[]; onDismiss: (id: number) => void }) {
  const list = useExitList(items, (n) => String(n.id));
  const win = useWin();
  const [bottom, setBottom] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  // 收起来以后才把展开状态清掉：通知都没了时下一批从收起开始
  useEffect(() => {
    if (!items.length) setOpen(false);
  }, [items.length]);
  // 底部操作条的高度变了（出现、消失、换内容）就重新算通知的位置
  useLayoutEffect(() => {
    const w = win.current;
    if (!w) return;
    const update = () => {
      const wr = w.getBoundingClientRect(),
        gap = ms('--sp-2');
      let need = 0;
      w.querySelectorAll<HTMLElement>('[data-dock]').forEach((d) => {
        if (d.closest('.leaving')) return;
        // 不在当前页的操作条（所在的页藏起来了）位置读出来是 0，算进去通知会跑到窗口顶上再滑下来
        if (!d.getClientRects().length) return;
        const kids = [...d.children].filter(
          (k) => !k.classList.contains('leaving') && (k as HTMLElement).offsetHeight > 0,
        ) as HTMLElement[];
        if (!kids.length) return;
        const h = kids.reduce((s, k) => s + k.offsetHeight, 0) + (kids.length - 1) * gap;
        need = Math.max(need, wr.bottom - d.getBoundingClientRect().bottom + h + gap);
      });
      setBottom(need ? Math.max(Math.round(need), ms('--bar-h') + ms('--sp-3')) : null);
    };
    const mo = new MutationObserver(update);
    mo.observe(w, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', update);
    update();
    return () => {
      mo.disconnect();
      removeEventListener('resize', update);
    };
  }, [win]);
  // 叠放的位置：离开的那条留在原来的位置淡出，不参与排位
  const live = list.filter((x) => !x.leaving).map((x) => x.key);
  const n = live.length;
  const expanded = open && n > 1;
  return (
    <ToWin>
      <div className="toasts" style={bottom == null ? undefined : { bottom }}>
        <div
          className={`toast-stack ${expanded ? 'open' : ''}`}
          role="status"
          aria-live="polite"
          style={{ '--toast-n': Math.max(n, 1) } as React.CSSProperties}
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
        >
          {list.map(({ item, key, leaving }) => {
            const k = leaving ? -1 : live.indexOf(key);
            return (
              <Toast
                key={key}
                notice={item}
                leaving={leaving}
                depth={k}
                paused={open}
                onDismiss={onDismiss}
              />
            );
          })}
        </div>
      </div>
    </ToWin>
  );
}

function Toast({
  notice,
  leaving,
  depth,
  paused,
  onDismiss,
}: {
  notice: Shown;
  leaving: boolean;
  /** 0 是最前那条；离开的是 -1 */
  depth: number;
  /** 指针停在这一叠上：都不消失 */
  paused: boolean;
  onDismiss: (id: number) => void;
}) {
  // 剩下多久：指针停着时计时停下，离开后接着算
  const left = useRef(notice.duration ?? 3500);
  useEffect(() => {
    if (leaving || paused) return;
    const started = Date.now();
    const t = window.setTimeout(() => onDismiss(notice.id), Math.max(left.current, 800));
    return () => {
      clearTimeout(t);
      left.current -= Date.now() - started;
    };
  }, [leaving, paused, notice.id]);
  // 离开的那条留在原来的位置淡出（最早的一条被挤掉时不跳到最前面）
  const k = useRef(0);
  if (depth >= 0) k.current = depth;
  const mark = markOf(notice);
  return (
    <span
      className={`toast ${notice.action ? '' : 'plain'} ${k.current > 0 ? 'behind' : ''} ${leaving ? 'leaving' : ''}`}
      data-enter={notice.replace ? 'fade' : 'up'}
      style={{ '--k': k.current } as React.CSSProperties}
    >
      {mark && (
        <span className={`mark ${mark}`}>
          <i
            className={mark === 'ok' ? 'ri-check-line' : 'ri-error-warning-fill'}
            aria-hidden="true"
          />
        </span>
      )}
      <span className="selectable">{notice.text}</span>
      {notice.action && (
        <button
          onClick={() => {
            notice.action?.onClick();
            onDismiss(notice.id);
          }}
        >
          {notice.action.label}
        </button>
      )}
      {/* 关闭放在最后：键盘先到操作按钮 */}
      <button
        className="toast-x"
        aria-label="关闭通知"
        data-toast-close=""
        onClick={() => onDismiss(notice.id)}
      >
        <i className="ri-close-line" aria-hidden="true" />
      </button>
    </span>
  );
}
