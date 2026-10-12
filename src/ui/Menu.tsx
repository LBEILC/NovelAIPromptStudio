import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import { Layer } from './overlays';
import { Button, iconProps } from './controls';
import { cx, composing } from './internal';
import { Shortcut } from './ThemeProvider';

export type MenuItem =
  | {
      id: string;
      label: string;
      disabled?: boolean;
      danger?: boolean;
      current?: boolean;
      shortcut?: string[];
      trailing?: ReactNode;
      onSelect?: () => void;
      children?: MenuItem[];
      separator?: false;
    }
  | { id: string; separator: true };
export function MenuItems({
  items,
  closeAll,
  closeLevel,
  label,
  active: controlledActive,
  onActiveChange,
}: {
  items: MenuItem[];
  closeAll: () => void;
  closeLevel: () => void;
  label: string;
  active?: number;
  onActiveChange?: (index: number) => void;
}) {
  const enabled = items
    .map((item, index) => (!item.separator && !item.disabled ? index : -1))
    .filter((index) => index >= 0);
  const [localActive, setLocalActive] = useState(enabled[0] ?? -1);
  const [sub, setSub] = useState<number | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [subFocus, setSubFocus] = useState(true);
  const cancelHover = () => clearTimeout(hoverTimer.current);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const subAnchor = useRef<HTMLElement | null>(null);
  const active = controlledActive ?? localActive;
  const move = (index: number) => {
    cancelHover();
    setSub(null);
    setLocalActive(index);
    onActiveChange?.(index);
    refs.current[index]?.focus();
  };
  const enter = (index: number, focus = true) => {
    cancelHover();
    setSubFocus(focus);
    subAnchor.current = refs.current[index];
    setSub(index);
  };
  return (
    <div
      role="menu"
      onPointerEnter={cancelHover}
      aria-label={label}
      onKeyDown={(event) => {
        if (composing(event)) return;
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && enabled.length) {
          event.preventDefault();
          event.stopPropagation();
          move(
            event.key === 'Home'
              ? enabled[0]
              : event.key === 'End'
                ? enabled.at(-1)!
                : enabled[
                    (enabled.indexOf(active) +
                      (event.key === 'ArrowDown' ? 1 : -1) +
                      enabled.length) %
                      enabled.length
                  ],
          );
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          refs.current[active]?.click();
        } else if (event.key === 'ArrowRight') {
          const item = items[active];
          if (item && !item.separator && item.children?.length) {
            event.preventDefault();
            event.stopPropagation();
            enter(active);
          }
        } else if (event.key === 'ArrowLeft' || event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeLevel();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          closeAll();
        }
      }}
    >
      {items.map((item, index) =>
        item.separator ? (
          <hr key={item.id} className="nps-menu-separator" />
        ) : (
          <div key={item.id}>
            <button
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role={item.current !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-label={item.label}
              aria-checked={item.current}
              aria-disabled={item.disabled || undefined}
              aria-haspopup={item.children ? 'menu' : undefined}
              aria-expanded={item.children ? sub === index : undefined}
              tabIndex={index === active ? 0 : -1}
              className={cx(
                'nps-menu-item',
                active === index && 'nps-current',
                item.danger && 'nps-error',
              )}
              onFocus={() => {
                setLocalActive(index);
                onActiveChange?.(index);
              }}
              onPointerEnter={() => {
                if (!item.disabled) {
                  setLocalActive(index);
                  onActiveChange?.(index);
                  cancelHover();
                  if (sub !== index)
                    hoverTimer.current = setTimeout(
                      () => {
                        if (item.children?.length) enter(index, false);
                        else setSub(null);
                      },
                      sub === null ? 150 : 300,
                    );
                }
              }}
              onPointerLeave={cancelHover}
              onClick={() => {
                if (item.disabled) return;
                if (item.children) enter(index);
                else {
                  closeAll();
                  item.onSelect?.();
                }
              }}
            >
              {item.current && <Check {...iconProps} />}
              {item.label}
              <span className="nps-menu-trailing">
                {item.trailing}
                {item.shortcut && <Shortcut keys={item.shortcut} />}
                {item.children && <ChevronRight {...iconProps} />}
              </span>
            </button>
            {item.children && (
              <Layer
                open={sub === index}
                onClose={() => setSub(null)}
                anchor={subAnchor}
                focus={subFocus}
                side
                className="nps-menu"
              >
                <div onPointerEnter={cancelHover}>
                  <MenuItems
                    items={item.children}
                    label={item.label}
                    closeAll={closeAll}
                    closeLevel={() => {
                      setSub(null);
                      refs.current[index]?.focus();
                    }}
                  />
                </div>
              </Layer>
            )}
          </div>
        ),
      )}
    </div>
  );
}
export function Menu({
  items,
  label,
  children,
  context = false,
  trigger,
  buttonVariant = 'quiet',
  className,
  menuClassName,
}: {
  items: MenuItem[];
  label: string;
  children?: ReactNode;
  context?: boolean;
  trigger?: ReactNode;
  buttonVariant?: 'default' | 'quiet';
  className?: string;
  menuClassName?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number }>();
  const close = () => setOpen(false);
  return (
    <span
      className={cx('nps-menu-trigger', className)}
      ref={context ? (ref as RefObject<HTMLSpanElement | null>) : undefined}
      tabIndex={context ? 0 : undefined}
      aria-label={context ? label : undefined}
      onContextMenu={(event) => {
        if (!context) return;
        event.preventDefault();
        setPoint({ x: event.clientX, y: event.clientY });
        setOpen(true);
      }}
      onKeyDown={(event) => {
        if (context && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
          event.preventDefault();
          setPoint(undefined);
          setOpen(true);
        }
      }}
    >
      {context ? (
        children
      ) : (
        <Button
          variant={buttonVariant}
          ref={ref as RefObject<HTMLButtonElement | null>}
          aria-haspopup="menu"
          aria-label={label}
          aria-expanded={open}
          onClick={() => {
            setPoint(undefined);
            setOpen(!open);
          }}
        >
          {trigger ?? label}
        </Button>
      )}
      <Layer
        open={open}
        onClose={close}
        anchor={ref}
        focus
        point={point}
        className={cx('nps-menu', menuClassName)}
      >
        <MenuItems items={items} label={label} closeAll={close} closeLevel={close} />
      </Layer>
    </span>
  );
}
export const ContextMenu = (props: Omit<React.ComponentProps<typeof Menu>, 'context'>) => (
  <Menu {...props} context />
);
