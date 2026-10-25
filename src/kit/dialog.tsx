// 对话框（doc/design.md 2.11、2.18）：盖住整个窗口的浅色遮罩，中间一张纸；Esc、点遮罩取消。
// 打开时焦点给"取消"（危险的确认不让回车误触），但程序给的焦点不画焦点框（只有键盘操作时才画）。
// Tab 在对话框里循环。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Presence } from './motion';
import { ToWin, useDismiss } from './layer';

export function focusQuietly(el: HTMLElement | null | undefined) {
  // focusVisible: false 让程序给的焦点不显示 :focus-visible 的焦点框
  el?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function trapTab(e: React.KeyboardEvent, box: HTMLElement | null) {
  if (e.key !== 'Tab' || !box) return;
  const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent);
  if (!items.length) return;
  const first = items[0],
    last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  className?: string;
  label: string;
  children: ReactNode;
  /** 打开时给焦点的元素（选择器）；不写就给第一个按钮 */
  initialFocus?: string;
  /** 点遮罩不关（例如正在进行中的操作） */
  sticky?: boolean;
  backdropClass?: string;
  /** 放到对话框元素上的 data-* 属性（例如自动验收要找的标记） */
  data?: Record<`data-${string}`, string>;
}
export function Dialog(p: DialogProps) {
  return (
    <Presence show={p.open}>
      {(leaving, ref) => (
        <ToWin>
          <DialogBody {...p} leaving={leaving} nodeRef={ref} />
        </ToWin>
      )}
    </Presence>
  );
}
function DialogBody(
  p: DialogProps & { leaving: boolean; nodeRef: React.RefObject<HTMLElement | null> },
) {
  const back = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    p.nodeRef.current = back.current;
  });
  useDismiss(p.open && !p.leaving, () => !p.sticky && p.onClose(), [box], { modal: true });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = p.initialFocus
      ? box.current?.querySelector<HTMLElement>(p.initialFocus)
      : box.current?.querySelector<HTMLElement>('.acts button');
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      el.select();
    } else focusQuietly(el);
    return () => {
      if (before?.isConnected) focusQuietly(before);
    };
  }, []);
  return (
    <div
      ref={back}
      className={`backdrop ${p.backdropClass || ''} ${p.leaving ? 'leaving' : ''}`}
      data-enter="fade"
      onPointerDown={(e) => {
        if (e.target === back.current && !p.sticky) p.onClose();
      }}
    >
      <div
        ref={box}
        className={`dialog ${p.className || ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={p.label}
        {...p.data}
        onKeyDown={(e) => trapTab(e, box.current)}
      >
        {p.children}
      </div>
    </div>
  );
}

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  quote?: ReactNode;
  tail?: ReactNode;
  ok: string;
  cancel?: string;
  /** 删除、清空这类：确认按钮用绛红描边 */
  danger?: boolean;
  /** 只有一个按钮 */
  single?: boolean;
}
/** 确认框：标题、说明、可选的引文，"取消"和确认按钮。 */
export function Confirm({
  options,
  onAnswer,
}: {
  options: ConfirmOptions | null;
  onAnswer: (ok: boolean) => void;
}) {
  const last = useRef(options);
  if (options) last.current = options;
  const o = options || last.current;
  return (
    <Dialog open={!!options} onClose={() => onAnswer(false)} label={o?.title || ''}>
      {o && (
        <>
          <h3>{o.title}</h3>
          {o.body && <p>{o.body}</p>}
          {o.quote && <p className="dlg-quote">{o.quote}</p>}
          {o.tail && <p>{o.tail}</p>}
          <div className="acts">
            {!o.single && (
              <button className="btn quiet" onClick={() => onAnswer(false)}>
                {o.cancel || '取消'}
              </button>
            )}
            <button
              className={`btn ${o.danger ? 'line-danger' : 'ink'}`}
              onClick={() => onAnswer(true)}
            >
              {o.ok}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** 确认框：ask() 返回用户是否确认 */
export function useAsk() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const answer = useRef<(ok: boolean) => void>(() => {});
  const ask = (o: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      answer.current = resolve;
      setOptions(o);
    });
  const node = (
    <Confirm
      options={options}
      onAnswer={(ok) => {
        setOptions(null);
        answer.current(ok);
      }}
    />
  );
  return [node, ask] as const;
}
