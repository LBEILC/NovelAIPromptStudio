import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button, iconProps } from './controls';
import { cx, clamp } from './internal';
import emptySymbol from '../../design/identity/logo/symbol-empty.svg?raw';

export function EmptyMark() {
  return (
    <span
      className="nps-empty-mark"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: emptySymbol }}
    />
  );
}

export interface Notice {
  id: number;
  text: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}
const NoticeContext = createContext<((notice: Omit<Notice, 'id'>) => void) | null>(null);
export function NotificationContent({
  notice,
  onAction,
}: {
  notice: Omit<Notice, 'id'>;
  onAction?: () => void;
}) {
  return (
    <>
      {notice.text}
      {notice.action && (
        <button
          type="button"
          onClick={() => {
            notice.action?.onClick();
            onAction?.();
          }}
        >
          {notice.action.label}
        </button>
      )}
    </>
  );
}
export function Notification({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(notice.duration ?? 4000);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (hover || focused) return;
    const start = Date.now();
    const timer = setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - start));
    };
  }, [hover, focused]);
  return (
    <div
      className="nps-toast"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <NotificationContent notice={notice} onAction={onDismiss} />
    </div>
  );
}
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Notice[]>([]);
  const next = useRef(0);
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (queue.length) layer.current?.showPopover();
    else layer.current?.hidePopover();
  }, [queue.length]);
  return (
    <NoticeContext.Provider
      value={(notice) =>
        setQueue((previous) => {
          const nextNotice = { ...notice, id: ++next.current };
          // An expiring action (such as trash undo) must be available immediately.
          return notice.action ? [nextNotice, ...previous] : [...previous, nextNotice];
        })
      }
    >
      {children}
      <div
        ref={layer}
        popover="manual"
        className="nps-notifications"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {queue[0] && (
          <Notification
            key={queue[0].id}
            notice={queue[0]}
            onDismiss={() => setQueue((previous) => previous.slice(1))}
          />
        )}
      </div>
    </NoticeContext.Provider>
  );
}
export function useNotifications() {
  const notify = useContext(NoticeContext);
  if (!notify) throw new Error('NotificationProvider is required');
  return notify;
}
export function Banner({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok';
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cx('nps-banner', `nps-banner-${tone}`)}
      role={tone === 'warn' || tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
      {action && <span className="nps-menu-trailing">{action}</span>}
    </div>
  );
}
export function Progress({
  value,
  max = 100,
  label,
}: {
  value: number;
  max?: number;
  label: string;
}) {
  const maximum = Math.max(1, max);
  const current = clamp(value, 0, maximum);
  return (
    <div
      className="nps-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={maximum}
      aria-valuenow={current}
    >
      <span style={{ width: `${(current / maximum) * 100}%` }} />
    </div>
  );
}
export type TagCategory =
  | 'artist-era'
  | 'subject'
  | 'identity'
  | 'body'
  | 'clothing'
  | 'action'
  | 'environment'
  | 'composition'
  | 'style'
  | 'unsorted';
export function Tag({
  text,
  translation,
  category = 'unsorted',
  categoryLabel,
  weight,
  state = 'default',
  onClick,
  className,
}: {
  text: string;
  translation?: string;
  category?: TagCategory;
  categoryLabel: string;
  weight?: string;
  state?:
    | 'default'
    | 'selected'
    | 'translating'
    | 'syntax'
    | 'added'
    | 'removed'
    | 'filtered'
    | 'dragging'
    | 'add';
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cx('nps-tag', `nps-tag-${state}`, className)}
      aria-label={[text, translation, weight, categoryLabel].filter(Boolean).join(', ')}
      aria-pressed={state === 'selected'}
      onClick={onClick}
    >
      {state === 'add' ? (
        <Plus {...iconProps} />
      ) : (
        <span className={cx('nps-dot', `nps-cat-${category}`)} />
      )}
      <span className="nps-tag-text">
        <span className="nps-tag-en">{text}</span>
        {translation && <span className="nps-tag-zh">{translation}</span>}
      </span>
      {weight && <span className="nps-tag-weight">{weight}</span>}
    </button>
  );
}
export function SelectionBar({
  visible,
  label,
  children,
}: {
  visible: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="nps-selection-slot">
      <div className="nps-selection" role="group" aria-label={label} hidden={!visible}>
        <span>{label}</span>
        {children}
      </div>
    </div>
  );
}
export function EmptyState({
  graphic,
  title,
  description,
  actions,
  fine,
}: {
  graphic: ReactNode;
  title: string;
  description: ReactNode;
  actions: ReactNode;
  fine?: ReactNode;
}) {
  return (
    <div className="nps-empty">
      <div className="nps-empty-graphic">{graphic}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="nps-actions">{actions}</div>
      {fine && <p className="nps-help">{fine}</p>}
    </div>
  );
}
