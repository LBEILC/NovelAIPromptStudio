import { TransitionSurface, useMovingIndicator, useNavigationSelection } from './transitions';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useEffect,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx, composing, quantize } from './internal';
import { Layer } from './overlays';
import { useScrollArea } from './useScrollArea';

export const iconProps = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ink' | 'cinnabar' | 'quiet' | 'danger' | 'danger-outline';
  size?: 'default' | 'small';
  loading?: boolean;
  disabledReason?: string;
  tip?: string;
  'data-tip'?: string;
  ref?: React.Ref<HTMLButtonElement>;
};
export function Button({
  variant = 'default',
  size = 'default',
  loading,
  disabled,
  disabledReason,
  tip,
  'data-tip': dataTip,
  children,
  className,
  onClick,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      data-tip={
        disabled && disabledReason ? disabledReason : (tip ?? dataTip ?? props['aria-label'])
      }
      type={props.type ?? 'button'}
      className={cx(
        'nps-button',
        `nps-button-${variant}`,
        size === 'small' && 'nps-small',
        className,
      )}
      aria-disabled={disabled || loading || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (disabled || loading) {
          event.preventDefault();
          event.stopPropagation();
        } else onClick?.(event);
      }}
    >
      {loading && <span aria-hidden="true" className="nps-loader" />}
      {children}
    </button>
  );
}

// Unwrapped surfaces keep their layout while sharing desktop interaction states.
export function SurfaceButton({
  kind = 'row',
  className,
  disabledReason,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: 'row' | 'image' | 'chip' | 'tab' | 'check';
  disabledReason?: string;
  'data-tip'?: string;
}) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={cx('nps-surface-button', `nps-surface-${kind}`, className)}
      data-tip={props.disabled ? disabledReason : props['data-tip']}
    />
  );
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> & {
  size?: 'default' | 'small';
  prefix?: ReactNode;
  suffix?: ReactNode;
  error?: string;
};
export function Input({
  size,
  prefix,
  suffix,
  error,
  className,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: InputProps) {
  const id = useId();
  const inComposition = useRef(false);
  return (
    <span className="nps-input-group">
      <span
        className={cx(
          'nps-field',
          size === 'small' && 'nps-small',
          error && 'nps-field-error',
          props.disabled && 'nps-off',
          className,
        )}
      >
        {prefix}
        <input
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          {...props}
          aria-invalid={!!error || props['aria-invalid'] || undefined}
          aria-describedby={
            [props['aria-describedby'], error ? id : ''].filter(Boolean).join(' ') || undefined
          }
          onCompositionStart={(event) => {
            inComposition.current = true;
            onCompositionStart?.(event);
          }}
          onCompositionEnd={(event) => {
            inComposition.current = false;
            onCompositionEnd?.(event);
          }}
          onKeyDown={(event) => {
            if (inComposition.current || composing(event)) {
              event.stopPropagation();
              if (event.key === 'Enter') event.preventDefault();
              return;
            }
            onKeyDown?.(event);
          }}
        />
        {suffix}
      </span>
      {error && (
        <span id={id} className="nps-help nps-error">
          {error}
        </span>
      )}
    </span>
  );
}

export interface Option {
  iconOnly?: boolean;
  style?: React.CSSProperties;
  value: string;
  label: string;
  prefix?: ReactNode;
  disabled?: boolean;
}
export function TextArea({
  className,
  autoSize = false,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { autoSize?: boolean | 'content' }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const overlay = useRef<HTMLSpanElement>(null);
  useScrollArea(ref, { overlayRef: overlay });
  useLayoutEffect(() => {
    const node = ref.current;
    const viewport = node?.closest<HTMLElement>('.wb-document-scroll');
    if (!autoSize || !node || !viewport) return;

    const size = () => {
      const section = node.closest<HTMLElement>('.wb-section')!;
      const style = getComputedStyle(node);
      const overhead = section.getBoundingClientRect().height - node.getBoundingClientRect().height;
      const viewportStyle = getComputedStyle(viewport);
      node.style.maxHeight =
        autoSize === 'content'
          ? 'none'
          : `${Math.max(parseFloat(style.minHeight), viewport.clientHeight - parseFloat(viewportStyle.paddingTop) - parseFloat(viewportStyle.paddingBottom) - overhead)}px`;
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`;
    };
    const observer = new ResizeObserver(size);
    observer.observe(viewport);
    size();
    return () => observer.disconnect();
  }, [autoSize, props.value]);
  useLayoutEffect(() => {
    if (autoSize && ref.current) {
      ref.current.setSelectionRange(0, 0);
      ref.current.scrollTop = 0;
    }
  }, [autoSize]);
  return (
    <span className="nps-textarea-wrap" ref={overlay}>
      <textarea
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        {...props}
        ref={ref}
        className={cx('nps-textarea', className)}
      />
    </span>
  );
}
export function Select({
  options,
  value,
  onChange,
  label,
  disabled,
  size,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  size?: 'default' | 'small';
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const search = useRef({ text: '', time: 0 });
  const enabled = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);
  const show = () => {
    setActive(
      enabled.includes(options.findIndex((option) => option.value === value))
        ? options.findIndex((option) => option.value === value)
        : (enabled[0] ?? -1),
    );
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    ref.current?.focus();
  };
  return (
    <>
      <button
        ref={ref}
        id={`${id}-trigger`}
        type="button"
        className={cx('nps-field', 'nps-select', size === 'small' && 'nps-small')}
        style={options.find((option) => option.value === value)?.style}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            show();
            if (event.key === 'Home') setActive(enabled[0] ?? -1);
            if (event.key === 'End') setActive(enabled.at(-1) ?? -1);
          }
        }}
      >
        {options.find((option) => option.value === value)?.prefix}
        {options.find((option) => option.value === value)?.label}
        <i className="ri-arrow-down-s-line" aria-hidden="true" />
      </button>
      <Layer
        open={open}
        onClose={close}
        anchor={ref}
        focus
        role="listbox"
        id={id}
        labelledBy={`${id}-trigger`}
        className="nps-menu"
        onKeyDown={(event) => {
          if (composing(event)) return;
          let next = active;
          if (event.key === 'ArrowDown')
            next = enabled[(enabled.indexOf(active) + 1) % enabled.length];
          else if (event.key === 'ArrowUp')
            next = enabled[(enabled.indexOf(active) - 1 + enabled.length) % enabled.length];
          else if (event.key === 'Home') next = enabled[0];
          else if (event.key === 'End') next = enabled.at(-1)!;
          else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (options[active] && !options[active].disabled) onChange(options[active].value);
            close();
            return;
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
          } else if (event.key === 'Tab') {
            close();
            return;
          } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const now = Date.now();
            search.current.text =
              now - search.current.time > 700 ? event.key : search.current.text + event.key;
            search.current.time = now;
            const text = search.current.text.toLocaleLowerCase();
            const match = [
              ...enabled.filter((index) => index > active),
              ...enabled.filter((index) => index <= active),
            ].find((index) => options[index].label.toLocaleLowerCase().startsWith(text));
            if (match !== undefined) next = match;
          } else return;
          event.preventDefault();
          if (next !== undefined) {
            setActive(next);
            event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')[next]?.focus();
          }
        }}
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            aria-disabled={option.disabled || undefined}
            tabIndex={index === active ? 0 : -1}
            className={cx('nps-menu-item', index === active && 'nps-current')}
            style={option.style}
            ref={(node) => {
              if (node && open && index === active) node.focus();
            }}
            onClick={() => {
              if (!option.disabled) {
                onChange(option.value);
                close();
              }
            }}
          >
            {option.prefix}
            {option.label}
            {option.value === value && <i className="ri-check-line" aria-hidden="true" />}
          </button>
        ))}
      </Layer>
    </>
  );
}

export function OptionGroup({
  options,
  value,
  onChange,
  label,
  size = 'default',
  disabled = false,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  size?: 'default' | 'small';
  disabled?: boolean;
}) {
  const group = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const [selected, select] = useNavigationSelection(value, onChange);
  useMovingIndicator(group, thumb, '[aria-checked=true]', selected);
  const enabled = options.filter((option) => !disabled && !option.disabled);
  return (
    <div
      role="radiogroup"
      data-navigation-pending={value !== selected || undefined}
      aria-label={label}
      ref={group}
      aria-disabled={disabled || undefined}
      className={cx('nps-options', size === 'small' && 'nps-options-small')}
      onKeyDown={(event) => {
        if (
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) ||
          !enabled.length
        )
          return;
        event.preventDefault();
        const current = enabled.findIndex((option) => option.value === selected);
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? enabled.length - 1
              : (current +
                  (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) +
                  enabled.length) %
                enabled.length;
        select(enabled[index].value);
        event.currentTarget
          .querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)')
          [index]?.focus();
      }}
    >
      <span ref={thumb} className="nps-option-thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === selected}
          disabled={disabled || option.disabled}
          aria-label={option.iconOnly ? option.label : undefined}
          data-tip={option.iconOnly ? option.label : undefined}
          className={cx('nps-option', option.iconOnly && 'nps-option-icon')}
          tabIndex={
            option.value === selected ||
            (!enabled.some((item) => item.value === selected) && option === enabled[0])
              ? 0
              : -1
          }
          onClick={() => select(option.value)}
        >
          {option.prefix}
          {!option.iconOnly && option.label}
        </button>
      ))}
    </div>
  );
}
export function Tabs({
  items,
  value,
  onChange,
  label,
}: {
  items: (Option & { content: ReactNode })[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const [selected, select] = useNavigationSelection(value, onChange);
  useMovingIndicator(list, marker, '[aria-selected=true]', selected);
  const enabled = items.filter((item) => !item.disabled);
  return (
    <div className="nps-tabs">
      <div
        role="tablist"
        aria-label={label}
        className="nps-tablist"
        ref={list}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !enabled.length)
            return;
          event.preventDefault();
          const current = enabled.findIndex((item) => item.value === selected);
          const index =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? enabled.length - 1
                : (current + (event.key === 'ArrowLeft' ? -1 : 1) + enabled.length) %
                  enabled.length;
          select(enabled[index].value);
          event.currentTarget
            .querySelectorAll<HTMLElement>('[role="tab"]:not(:disabled)')
            [index]?.focus();
        }}
      >
        <span ref={marker} className="nps-moving-indicator nps-tab-indicator" aria-hidden="true" />
        {items.map((item, index) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={item.value === selected}
            tabIndex={item.value === selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => select(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <TransitionSurface change={value}>
        {items.map((item, index) => (
          <div
            key={item.value}
            role="tabpanel"
            id={`${id}-panel-${index}`}
            aria-labelledby={`${id}-tab-${index}`}
            tabIndex={0}
            hidden={item.value !== value}
          >
            {item.content}
          </div>
        ))}
      </TransitionSurface>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  kind = 'switch',
  mixed = false,
  className,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  kind?: 'switch' | 'checkbox';
  mixed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role={kind}
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      data-tip={label}
      disabled={disabled}
      className={cx(`nps-${kind}`, className)}
      onClick={() => onChange(!checked)}
    >
      {kind === 'checkbox' &&
        (mixed ? (
          <i className="ri-subtract-line" aria-hidden="true" />
        ) : (
          checked && <i className="ri-check-line" aria-hidden="true" />
        ))}
    </button>
  );
}
export const Switch = (props: Omit<React.ComponentProps<typeof Toggle>, 'kind'>) => (
  <Toggle {...props} />
);
export const Checkbox = (props: Omit<React.ComponentProps<typeof Toggle>, 'kind'>) => (
  <Toggle {...props} kind="checkbox" />
);

export interface NumericProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  disabled?: boolean;
}
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  disabled,
  largeStep = step * 10,
  format = String,
}: NumericProps & { largeStep?: number; format?: (value: number) => string }) {
  return (
    <label className="nps-slider">
      <input
        type="range"
        style={{
          backgroundImage: `linear-gradient(to right, var(--text) ${max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0}%, var(--border) 0%)`,
        }}
        aria-label={label}
        aria-valuetext={format(value)}
        aria-disabled={disabled || undefined}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(quantize(Number(event.target.value), min, max, step))}
        onKeyDown={(event) => {
          const delta = event.shiftKey ? largeStep : step;
          const next =
            event.key === 'Home'
              ? min
              : event.key === 'End'
                ? max
                : ['ArrowRight', 'ArrowUp'].includes(event.key)
                  ? value + delta
                  : ['ArrowLeft', 'ArrowDown'].includes(event.key)
                    ? value - delta
                    : undefined;
          if (next !== undefined) {
            event.preventDefault();
            onChange(quantize(next, min, max, step));
          }
        }}
      />
      <output>{format(value)}</output>
    </label>
  );
}
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  disabled,
  decreaseLabel,
  increaseLabel,
  precision,
  snapToStep = true,
}: Omit<NumericProps, 'min' | 'max'> & {
  min?: number;
  max?: number;
  decreaseLabel: string;
  increaseLabel: string;
  precision?: number;
  snapToStep?: boolean;
}) {
  const format = (number: number) =>
    precision === undefined ? String(number) : number.toFixed(Math.max(0, Math.min(20, precision)));
  const [draft, setDraft] = useState(format(value));
  useEffect(() => setDraft(format(value)), [value, precision]);
  const change = (number: number) => {
    const next = snapToStep
      ? quantize(number, min ?? 0, max ?? Number.MAX_VALUE, step)
      : Math.max(min ?? -Number.MAX_VALUE, Math.min(max ?? Number.MAX_VALUE, number));
    setDraft(format(next));
    onChange(next);
  };
  const commit = () => {
    if (draft.trim() && Number.isFinite(Number(draft))) change(Number(draft));
    else setDraft(format(value));
  };
  return (
    <span className="nps-stepper">
      <button
        type="button"
        aria-label={decreaseLabel}
        data-tip={decreaseLabel}
        disabled={disabled || (min !== undefined && value <= min)}
        onClick={() => change(value - step)}
      >
        <i className="ri-subtract-line" aria-hidden="true" />
      </button>
      <Input
        type="text"
        inputMode="decimal"
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            change(value + (event.key === 'ArrowUp' ? step : -step));
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      <button
        type="button"
        aria-label={increaseLabel}
        data-tip={increaseLabel}
        disabled={disabled || (max !== undefined && value >= max)}
        onClick={() => change(value + step)}
      >
        <i className="ri-add-line" aria-hidden="true" />
      </button>
    </span>
  );
}
