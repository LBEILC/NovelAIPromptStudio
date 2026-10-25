// 通知（doc/design.md 2.11）：同一时间只有一条，新的替换旧的；指针停在上面时不消失。
// 软件自己发的（source: 'background'）不替换带操作按钮的通知，等它消失后再显示，最多等一条。
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
import { useExitList, FlipScope, ms } from './motion';

export interface Notice {
  text: string;
  /** 不写时按文字判断：以"已"开头是做成了，带"失败"是没做成 */
  tone?: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  duration?: number;
  source?: 'user' | 'background';
}
type Shown = Notice & { id: number; replace: boolean };
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
  const [state, setState] = useState<{ current: Shown | null; pending: Shown | null }>({
    current: null,
    pending: null,
  });
  const seq = useRef(0);
  const notify = useCallback((n: Notice) => {
    setState((s) => {
      const shown: Shown = { ...n, id: ++seq.current, replace: !!s.current };
      if (n.source === 'background' && s.current?.action) return { ...s, pending: shown };
      return { current: shown, pending: null };
    });
  }, []);
  const dismiss = useCallback((id: number) => {
    setState((s) =>
      s.current?.id === id
        ? { current: s.pending ? { ...s.pending, replace: false } : null, pending: null }
        : s,
    );
  }, []);
  return (
    <NoticeContext.Provider value={notify}>
      {children}
      <Toasts current={state.current} onDismiss={dismiss} />
    </NoticeContext.Provider>
  );
}

function Toasts({
  current,
  onDismiss,
}: {
  current: Shown | null;
  onDismiss: (id: number) => void;
}) {
  const list = useExitList(current ? [current] : [], (n) => String(n.id));
  const win = useWin();
  const box = useRef<HTMLDivElement>(null);
  const [bottom, setBottom] = useState<number | null>(null);
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
  return (
    <ToWin>
      <div
        className="toasts"
        ref={box}
        style={bottom == null ? undefined : { bottom }}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <FlipScope root={box}>
          <div className="swap">
            {list.map(({ item, key, leaving }) => (
              <Toast key={key} notice={item} leaving={leaving} onDismiss={onDismiss} />
            ))}
          </div>
        </FlipScope>
      </div>
    </ToWin>
  );
}

function Toast({
  notice,
  leaving,
  onDismiss,
}: {
  notice: Shown;
  leaving: boolean;
  onDismiss: (id: number) => void;
}) {
  const hover = useRef(false);
  useEffect(() => {
    if (leaving) return;
    let t = 0;
    const hide = () => {
      if (hover.current) {
        t = window.setTimeout(hide, 800);
        return;
      }
      onDismiss(notice.id);
    };
    t = window.setTimeout(hide, notice.duration ?? 3500);
    return () => clearTimeout(t);
  }, [leaving, notice.id]);
  const mark = markOf(notice);
  return (
    <span
      className={`toast ${notice.action ? '' : 'plain'} ${leaving ? 'leaving' : ''}`}
      data-enter={notice.replace ? 'fade' : 'up'}
      onPointerEnter={() => (hover.current = true)}
      onPointerLeave={() => (hover.current = false)}
      onFocus={() => (hover.current = true)}
      onBlur={() => (hover.current = false)}
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
    </span>
  );
}
