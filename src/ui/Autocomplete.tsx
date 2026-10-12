import { useId, useRef, useState } from 'react';
import { Input } from './controls';
import { Layer } from './overlays';
import { cx } from './internal';
import { Shortcut } from './ThemeProvider';

export interface Suggestion {
  id: string;
  text: string;
  translation: string;
  count: string;
}
export function SuggestionList({
  items,
  active,
  onSelect,
  onActiveChange,
  id,
  directAdd,
}: {
  items: Suggestion[];
  active: number;
  onSelect: (item: Suggestion) => void;
  onActiveChange?: (index: number) => void;
  id: string;
  directAdd?: { label: string; onSelect: () => void };
}) {
  return (
    <div role="listbox" id={id} className="nps-suggestions">
      {items.map((item, index) => (
        <div
          role="option"
          aria-selected={index === active}
          id={`${id}-${index}`}
          key={item.id}
          className={cx('nps-menu-item', index === active && 'nps-current')}
          onPointerDown={(event) => event.preventDefault()}
          onPointerMove={() => onActiveChange?.(index)}
          onClick={() => onSelect(item)}
        >
          <span className="nps-mono">{item.text}</span>
          <span className="nps-help">{item.translation}</span>
          <span className="nps-menu-trailing nps-help">{item.count}</span>
        </div>
      ))}
      {directAdd && (
        <>
          <hr className="nps-menu-separator" />
          <div
            role="option"
            aria-selected={active === items.length}
            id={`${id}-${items.length}`}
            className={cx('nps-menu-item', active === items.length && 'nps-current')}
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={() => onActiveChange?.(items.length)}
            onClick={directAdd.onSelect}
          >
            <span className="nps-help">{directAdd.label}</span>
            <span className="nps-menu-trailing">
              <Shortcut keys={['Enter']} />
            </span>
          </div>
        </>
      )}
    </div>
  );
}
export function Autocomplete({
  items,
  value,
  onChange,
  onSelect,
  label,
  placeholder,
  autoFocus,
  onDismiss,
  directAdd,
}: {
  items: Suggestion[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: Suggestion) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  onDismiss?: () => void;
  directAdd?: { label: string; onSelect: () => void };
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const count = items.length + (directAdd ? 1 : 0);
  const current = Math.min(active, count - 1);
  const select = (item: Suggestion) => {
    onSelect(item);
    setOpen(false);
  };
  const add = directAdd
    ? {
        ...directAdd,
        onSelect: () => {
          directAdd.onSelect();
          setOpen(false);
        },
      }
    : undefined;
  return (
    <span ref={anchor} className="nps-autocomplete">
      <Input
        autoFocus={autoFocus}
        role="combobox"
        aria-label={label}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open && count > 0}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open && current >= 0 ? `${id}-${current}` : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onDismiss?.();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            if (count) setActive((current + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
          }
          if (event.key === 'Enter' && open && current >= 0) {
            event.preventDefault();
            if (current === items.length) add?.onSelect();
            else select(items[current]);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            onDismiss?.();
          }
        }}
      />
      <Layer
        open={open && count > 0}
        onClose={() => setOpen(false)}
        anchor={anchor}
        className="nps-menu"
      >
        <SuggestionList
          items={items}
          active={current}
          id={id}
          onSelect={select}
          onActiveChange={setActive}
          directAdd={add}
        />
      </Layer>
    </span>
  );
}
