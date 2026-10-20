// 菜单（doc/design.md 2.11、2.16）：写动作，不重复对象；没做出来的功能不占位。
// 键盘：↑ ↓ 移动（跳过不可用的和分隔线），Enter / 空格执行，→ 进入子菜单、← 返回，
// Esc 关闭（只关一层），Tab 关闭并把焦点还给打开它的地方。
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Pop, type Place } from './layer';
import { focusQuietly } from './dialog';
import { Icon } from './controls';

export type MenuEntry =
  | {
      label: ReactNode;
      onSelect?: () => void;
      danger?: boolean;
      /** 不可用；写成字符串时悬停说明原因 */
      disabled?: boolean | string;
      /** 右边的快捷键或说明（等宽小字） */
      hint?: ReactNode;
      icon?: string;
      checked?: boolean;
      /** 左边的分类小圆点颜色 */
      dot?: string;
      sub?: MenuEntry[];
      className?: string;
    }
  | 'sep'
  | { header: ReactNode };
const isItem = (e: MenuEntry): e is Exclude<MenuEntry, 'sep' | { header: ReactNode }> =>
  e !== 'sep' && !('header' in e);
const usable = (e: MenuEntry) => isItem(e) && !e.disabled;
/** 子菜单放进窗口里：右边放不下就翻到左边，下面放不下就往上挪 */
function fitSub(item: HTMLElement) {
  const sub = item.querySelector<HTMLElement>(':scope > .submenu');
  const win = item.closest('.win') || document.documentElement;
  if (!sub) return { left: false, up: 0 };
  const wr = win.getBoundingClientRect(),
    r = item.getBoundingClientRect(),
    edge = 8,
    gap = 4;
  const left =
    r.right + gap + sub.offsetWidth + edge > wr.right &&
    r.left - gap - sub.offsetWidth - edge >= wr.left;
  // 子菜单默认和这一项的顶边对齐（往上 --sp-1）；下面放不下就往上挪
  const top = r.top - gap;
  const over = top + sub.offsetHeight + edge - wr.bottom;
  return { left, up: over > 0 ? Math.min(over, top - wr.top - edge) : 0 };
}

export function MenuItems({
  items,
  onClose,
  autoFocus = true,
  onBack,
}: {
  items: MenuEntry[];
  onClose: () => void;
  autoFocus?: boolean;
  /** 子菜单：← 或 Esc 回到上一层 */
  onBack?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const [subOpen, setSubOpen] = useState(-1);
  const [fit, setFit] = useState<{ i: number; left: boolean; up: number }>({
    i: -1,
    left: false,
    up: 0,
  });
  useEffect(() => {
    if (!autoFocus) return;
    focusQuietly(box.current);
    // 用键盘进入子菜单时，高亮第一项
    if (onBack) setActive(items.findIndex(usable));
  }, [autoFocus]);
  useEffect(() => {
    const el = subOpen >= 0 && box.current?.children[subOpen];
    if (el instanceof HTMLElement) setFit({ i: subOpen, ...fitSub(el) });
  }, [subOpen]);
  const move = (d: number) => {
    let i = active;
    for (let n = 0; n < items.length; n++) {
      i = (i + d + items.length) % items.length;
      if (usable(items[i])) break;
    }
    setActive(i);
  };
  const run = (i: number) => {
    const e = items[i];
    if (!isItem(e) || e.disabled) return;
    if (e.sub) {
      setSubOpen(i);
      return;
    }
    onClose();
    e.onSelect?.();
  };
  return (
    <div
      ref={box}
      className="menu-items"
      role="menu"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          move(e.key === 'ArrowDown' ? 1 : -1);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (active >= 0) run(active);
        } else if (
          e.key === 'ArrowRight' &&
          active >= 0 &&
          isItem(items[active]) &&
          (items[active] as { sub?: MenuEntry[] }).sub
        ) {
          e.preventDefault();
          e.stopPropagation();
          setSubOpen(active);
        } else if (onBack && (e.key === 'ArrowLeft' || e.key === 'Escape')) {
          e.preventDefault();
          e.stopPropagation();
          setActive(-1);
          onBack();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {items.map((e, i) => {
        if (e === 'sep') return <hr key={i} />;
        if (!isItem(e))
          return (
            <div key={i} className="mi-h">
              {e.header}
            </div>
          );
        return (
          <div
            key={i}
            className={`mi ${e.danger ? 'danger' : ''} ${e.disabled ? 'off' : ''} ${i === active ? 'on' : ''} ${e.sub ? 'sub' : ''} ${subOpen === i ? 'open' : ''} ${fit.i === i && fit.left ? 'left' : ''} ${e.className || ''}`}
            role="menuitem"
            aria-disabled={e.disabled ? true : undefined}
            data-tip={typeof e.disabled === 'string' ? e.disabled : undefined}
            onPointerEnter={(ev) => {
              setActive(usable(e) ? i : -1);
              setSubOpen(-1);
              if (e.sub) setFit({ i, ...fitSub(ev.currentTarget) });
            }}
            onPointerLeave={() => setActive(-1)}
            onClick={(ev) => {
              if (ev.target instanceof Element && ev.target.closest('.submenu')) return;
              run(i);
            }}
          >
            {e.dot && <span className="cdot" style={{ background: e.dot }} />}
            {e.icon && <Icon name={e.icon} />}
            {e.label}
            {(e.hint != null || e.checked || e.sub) && (
              <span className="k">
                {e.checked ? (
                  <Icon name="check-line" />
                ) : e.sub ? (
                  <Icon name="arrow-right-s-line" />
                ) : (
                  e.hint
                )}
              </span>
            )}
            {e.sub && (
              <div
                className="menu submenu"
                style={fit.i === i && fit.up ? { marginTop: -fit.up } : undefined}
              >
                <MenuItems
                  items={e.sub}
                  autoFocus={subOpen === i}
                  onBack={() => {
                    setSubOpen(-1);
                    setActive(i);
                    focusQuietly(box.current);
                  }}
                  onClose={() => {
                    setSubOpen(-1);
                    onClose();
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 按钮弹出的菜单：贴着按钮；点按钮本身开着就关、关着就开。 */
export function MenuPop({
  open,
  onClose,
  anchor,
  place = 'below-left',
  items,
  className = '',
  wide,
}: {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<Element | null> | string;
  place?: Place;
  items: MenuEntry[];
  className?: string;
  wide?: boolean;
}) {
  return (
    <Pop
      open={open}
      onClose={onClose}
      anchor={anchor}
      trigger={anchor}
      place={place}
      enter={place.startsWith('above') ? 'pop-up' : 'pop'}
      className={`menu ${className}`}
      style={wide ? { minWidth: 'var(--menu-wide-min-w)' } : undefined}
      restoreFocus
      deps={[items.length]}
    >
      <MenuItems items={items} onClose={onClose} />
    </Pop>
  );
}

/** 右键菜单：放在指针的位置。 */
export function ContextMenu({
  at,
  onClose,
  items,
  className = '',
}: {
  at: [number, number] | null;
  onClose: () => void;
  items: MenuEntry[];
  className?: string;
}) {
  const last = useRef(at);
  if (at) last.current = at;
  return (
    <Pop
      open={!!at}
      onClose={onClose}
      point={at || last.current || [0, 0]}
      className={`menu ${className}`}
      restoreFocus
      deps={[items.length]}
    >
      <MenuItems items={items} onClose={onClose} />
    </Pop>
  );
}

/** "更多"这类按钮：点一下打开菜单，再点一下（或 Enter、空格）关上；关上后焦点回到按钮。 */
export function MenuButton({
  label,
  items,
  icon = 'more-line',
  place = 'below-right',
  className = 'btn quiet sm icon',
  menuKey,
}: {
  label: string;
  /** 验收用的钩子（data-menu-key） */
  menuKey?: string;
  /** 打开时才算菜单项 */
  items: () => MenuEntry[];
  icon?: string;
  place?: Place;
  className?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState<MenuEntry[] | null>(null);
  const last = useRef<MenuEntry[]>([]);
  if (shown) last.current = shown;
  return (
    <>
      <button
        ref={btn}
        className={`${className} ${shown ? 'is-hover' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!shown}
        data-menu-key={menuKey}
        onClick={() => setShown(shown ? null : items())}
      >
        <Icon name={icon} />
      </button>
      <MenuPop
        open={!!shown}
        onClose={() => setShown(null)}
        anchor={btn}
        place={place}
        items={shown || last.current}
      />
    </>
  );
}
