// 小控件（doc/design.md 2.18、2.19）：样子在 src/styles 里（.segc、.switch、.check、.slider、.stepper）。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIndicator } from './motion';

export const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <i className={`ri-${name} ${className}`} aria-hidden="true" />
);

const isMac = () => document.documentElement.dataset.platform === 'macos';
/** 快捷键提示：Mod 在 macOS 上是 ⌘，别处是 Ctrl。 */
export function Kbd({ keys }: { keys: string }) {
  const text = keys
    .replace(/\bMod\b/g, isMac() ? '⌘' : 'Ctrl')
    .replace(/\bAlt\b/g, isMac() ? '⌥' : 'Alt');
  return <span className="kbd">{text}</span>;
}
export const modKey = () => (isMac() ? '⌘' : 'Ctrl');
/** 事件里按的是不是 Ctrl（macOS 上是 Command）。 */
export const isMod = (e: { ctrlKey: boolean; metaKey: boolean }) =>
  isMac() ? e.metaKey : e.ctrlKey;

/** 分段选择：一条槽，里面一个滑块停在当前项下面；换选项时滑块滑过去。左右方向键切换。 */
export function Seg<K extends string>({
  items,
  value,
  onChange,
  label,
  className = '',
}: {
  items: readonly (readonly [K, ReactNode])[] | readonly (readonly [K, ReactNode, string])[];
  value: K;
  onChange: (k: K) => void;
  label?: string;
  className?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  useIndicator(box, [value, items.length]);
  const keys = items.map((x) => x[0]);
  return (
    <span
      ref={box}
      className={`segc has-ind ${className}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const i = Math.max(0, Math.min(keys.length - 1, keys.indexOf(value) + d));
        onChange(keys[i]);
        (box.current?.children[i + 1] as HTMLElement | undefined)?.focus();
      }}
    >
      <i className="ind" />
      {items.map((it) => (
        <span
          key={it[0]}
          className={it[0] === value ? 'on' : ''}
          role="radio"
          aria-checked={it[0] === value}
          tabIndex={it[0] === value ? 0 : -1}
          data-tip={it[2]}
          aria-label={it[2]}
          onClick={() => onChange(it[0])}
        >
          {it[1]}
        </span>
      ))}
    </span>
  );
}

export function Switch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <span
      className={`switch ${on ? 'on' : ''} ${disabled ? 'off' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange(!on)}
      onKeyDown={(e) => {
        if (disabled || (e.key !== ' ' && e.key !== 'Enter')) return;
        e.preventDefault();
        onChange(!on);
      }}
    />
  );
}

/** 复选框的方块（图片库的样子 .lchk）：on 打勾，some 是一横。 */
export const CheckMark = ({ state }: { state: 'on' | 'some' | '' }) => (
  <span className={`check lchk ${state}`}>
    <Icon name={state === 'some' ? 'subtract-line' : 'check-line'} />
  </span>
);
/** 一行复选项：方块加文字。 */
export function CheckRow({
  on,
  onChange,
  children,
  className = 'lcheck',
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button className={className} role="checkbox" aria-checked={on} onClick={() => onChange(!on)}>
      <CheckMark state={on ? 'on' : ''} />
      <span>{children}</span>
    </button>
  );
}

/**
 * 滑块：拖动跟手（不加过渡）；方向键一次一档，PageUp / PageDown 四档，Home / End 到头。
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  disabled,
  className = 'lslider',
  page = 4,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  /** PageUp / PageDown 一次走几步 */
  page?: number;
  /** 松开指针、按完键时：适合在这里保存（拖动中的 onChange 只更新显示） */
  onCommit?: (v: number) => void;
  onChange: (v: number) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [drag, setDrag] = useState(false);
  const snap = (v: number) =>
    Math.max(min, Math.min(max, Math.round((v - min) / step) * step + min));
  const set = (v: number) => {
    const n = snap(v);
    if (n !== value) onChange(n);
  };
  const p = ((value - min) / (max - min)) * 100;
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const r = ref.current!.getBoundingClientRect();
      set(min + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (max - min));
    };
    const up = () => {
      setDrag(false);
      document.documentElement.classList.remove('is-dragging');
      onCommit?.(value);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
  });
  return (
    <span
      ref={ref}
      className={`slider ${className} ${drag ? 'dragging' : ''} ${disabled ? 'off' : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled || undefined}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        e.preventDefault();
        ref.current?.focus();
        document.documentElement.classList.add('is-dragging');
        const r = ref.current!.getBoundingClientRect();
        set(min + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (max - min));
        setDrag(true);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        const d = {
          ArrowLeft: -1,
          ArrowDown: -1,
          ArrowRight: 1,
          ArrowUp: 1,
          PageDown: -page,
          PageUp: page,
        }[e.key];
        if (d) {
          e.preventDefault();
          const n = snap(value + d * step);
          set(n);
          onCommit?.(n);
        }
        if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          const n = e.key === 'Home' ? min : max;
          set(n);
          onCommit?.(n);
        }
      }}
    >
      <i style={{ width: `${p}%` }} />
      <b style={{ left: `${p}%` }} />
    </span>
  );
}

/** 空状态的图形：括号里还没有图（design/identity/logo/symbol-empty.svg）。 */
export function EmptyMark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 100 100" data-kind="symbol-empty">
        <path data-color="text" d={BRACES} />
        <rect
          data-color="empty"
          x="36"
          y="34"
          width="28"
          height="28"
          fill="none"
          strokeWidth="2"
          strokeDasharray="5 3"
        />
      </svg>
    </span>
  );
}
/** 标准标志：花括号里一方朱砂（design/identity/logo/master-symbol.svg）。 */
export function Logo() {
  return (
    <svg viewBox="0 0 100 100" data-kind="symbol" aria-hidden="true">
      <path data-color="text" d={BRACES} />
      <path data-color="primary" d="M35 33L65 33L65 63L35 63Z" />
    </svg>
  );
}
const BRACES =
  'M97.046 48.046L97.046 49.708L94.462 49.985Q90.677 50.4 89.454 51.738Q88.231 53.077 88.231 55.662Q88.231 59.031 89.223 62.354Q90.215 65.677 91.185 68.792Q92.154 71.908 92.154 74.677Q92.154 78.092 90.538 81.046Q88.923 84 85.669 85.892Q82.415 87.785 77.615 88.2L73.277 88.569L72.954 87.092L75.631 86.677Q79.415 86.077 80.915 83.446Q82.415 80.815 82.415 77.123Q82.415 73.2 81.4 68.838Q80.385 64.477 80.385 59.4Q80.385 55.292 83.062 52.385Q85.369 49.892 89.2 48.877Q85.369 47.862 83.062 45.369Q80.385 42.462 80.385 38.354Q80.385 33.277 81.4 28.938Q82.415 24.6 82.415 20.631Q82.415 16.938 80.915 14.285Q79.415 11.631 75.631 11.077L72.954 10.662L73.277 9.185L77.615 9.554Q82.415 9.969 85.669 11.885Q88.923 13.8 90.538 16.685Q92.154 19.569 92.154 23.031Q92.154 25.8 91.185 28.938Q90.215 32.077 89.223 35.4Q88.231 38.723 88.231 42.092Q88.231 44.677 89.454 46.015Q90.677 47.354 94.462 47.769ZM2.954 49.754L2.954 48.092L5.538 47.815Q9.323 47.354 10.546 46.038Q11.769 44.723 11.769 42.138Q11.769 38.723 10.8 35.4Q9.831 32.077 8.838 28.938Q7.846 25.8 7.846 23.077Q7.846 19.615 9.462 16.708Q11.077 13.8 14.331 11.885Q17.585 9.969 22.385 9.6L26.723 9.231L27.046 10.662L24.369 11.077Q20.585 11.677 19.085 14.308Q17.585 16.938 17.585 20.677Q17.585 24.6 18.6 28.962Q19.615 33.323 19.615 38.354Q19.615 42.508 16.938 45.462Q14.631 47.908 10.754 48.923Q14.631 49.892 16.938 52.385Q19.615 55.338 19.615 59.446Q19.615 64.477 18.6 68.862Q17.585 73.246 17.585 77.169Q17.585 80.862 19.085 83.515Q20.585 86.169 24.369 86.723L27.046 87.138L26.723 88.615L22.385 88.246Q17.585 87.831 14.331 85.938Q11.077 84.046 9.462 81.115Q7.846 78.185 7.846 74.769Q7.846 71.954 8.838 68.838Q9.831 65.723 10.8 62.377Q11.769 59.031 11.769 55.708Q11.769 53.123 10.546 51.785Q9.323 50.446 5.538 49.985Z';
